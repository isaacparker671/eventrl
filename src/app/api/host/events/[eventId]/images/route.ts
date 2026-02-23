import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "event-images";
const MAX_IMAGES = 3;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function redirectWithError(request: Request, eventId: string, message: string) {
  return NextResponse.redirect(
    new URL(`/host/events/${eventId}/edit?error=${encodeURIComponent(message)}`, request.url),
    { status: 303 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
  }

  const { eventId } = await context.params;
  const profile = await ensureHostProfile(hostUser);
  if (!hasProAccess(profile)) {
    return redirectWithError(request, eventId, "Pro required for event images.");
  }

  const supabase = getSupabaseAdminClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, host_user_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) {
    return NextResponse.redirect(new URL("/host/dashboard?error=event_not_found", request.url), { status: 303 });
  }
  if (event.host_user_id !== hostUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "upload");

  if (action === "set_cover") {
    const imageId = String(formData.get("image_id") ?? "").trim();
    if (!imageId) {
      return redirectWithError(request, eventId, "Image not found.");
    }

    const { data: image } = await supabase
      .from("event_images")
      .select("id")
      .eq("id", imageId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!image) {
      return redirectWithError(request, eventId, "Image not found.");
    }

    await supabase.from("event_images").update({ is_cover: false }).eq("event_id", eventId);
    const { error: coverError } = await supabase
      .from("event_images")
      .update({ is_cover: true, order_index: 0 })
      .eq("id", imageId)
      .eq("event_id", eventId);

    if (coverError) {
      return redirectWithError(request, eventId, coverError.message);
    }

    return NextResponse.redirect(new URL(`/host/events/${eventId}/edit?saved=1`, request.url), { status: 303 });
  }

  if (action === "delete") {
    const imageId = String(formData.get("image_id") ?? "").trim();
    if (!imageId) {
      return redirectWithError(request, eventId, "Image not found.");
    }

    const { data: image } = await supabase
      .from("event_images")
      .select("id, storage_path, is_cover")
      .eq("id", imageId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!image) {
      return redirectWithError(request, eventId, "Image not found.");
    }

    await supabase.storage.from(BUCKET).remove([image.storage_path]);
    const { error: deleteError } = await supabase
      .from("event_images")
      .delete()
      .eq("id", imageId)
      .eq("event_id", eventId);
    if (deleteError) {
      return redirectWithError(request, eventId, deleteError.message);
    }

    if (image.is_cover) {
      const { data: firstRemaining } = await supabase
        .from("event_images")
        .select("id")
        .eq("event_id", eventId)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstRemaining?.id) {
        await supabase.from("event_images").update({ is_cover: true, order_index: 0 }).eq("id", firstRemaining.id);
      }
    }

    return NextResponse.redirect(new URL(`/host/events/${eventId}/edit?saved=1`, request.url), { status: 303 });
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return redirectWithError(request, eventId, "Select an image to upload.");
  }
  if (!file.type.startsWith("image/")) {
    return redirectWithError(request, eventId, "Only image files are allowed.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return redirectWithError(request, eventId, "Image is too large. Max size is 8MB.");
  }

  const { count: existingCount } = await supabase
    .from("event_images")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if ((existingCount ?? 0) >= MAX_IMAGES) {
    return redirectWithError(request, eventId, "You can upload up to 3 images per event.");
  }

  const fileName = sanitizeFileName(file.name || "image");
  const storagePath = `${eventId}/${randomUUID()}-${fileName}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
    cacheControl: "3600",
  });
  if (uploadError) {
    return redirectWithError(
      request,
      eventId,
      `Upload failed. Ensure storage bucket "${BUCKET}" exists and is public.`,
    );
  }

  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  const isFirst = (existingCount ?? 0) === 0;
  const { data: maxOrderRow } = await supabase
    .from("event_images")
    .select("order_index")
    .eq("event_id", eventId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = isFirst ? 0 : (maxOrderRow?.order_index ?? 0) + 1;

  const { error: insertError } = await supabase.from("event_images").insert({
    event_id: eventId,
    storage_path: storagePath,
    public_url: publicUrl,
    order_index: nextOrder,
    is_cover: isFirst,
  });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return redirectWithError(request, eventId, insertError.message);
  }

  return NextResponse.redirect(new URL(`/host/events/${eventId}/edit?saved=1`, request.url), { status: 303 });
}
