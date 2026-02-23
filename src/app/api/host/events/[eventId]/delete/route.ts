import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const EVENT_IMAGES_BUCKET = "event-images";

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
  }

  const { eventId } = await context.params;
  const formData = await request.formData();
  const confirmText = String(formData.get("confirm_text") ?? "").trim();
  if (confirmText !== "DELETE") {
    return NextResponse.redirect(new URL(`/host/events/${eventId}?error=type_DELETE_to_confirm`, request.url), {
      status: 303,
    });
  }

  const supabase = getSupabaseAdminClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, host_user_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return NextResponse.redirect(new URL("/host/dashboard?error=event_not_found", request.url), {
      status: 303,
    });
  }
  if (event.host_user_id !== hostUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: imageRows } = await supabase
    .from("event_images")
    .select("storage_path")
    .eq("event_id", eventId);
  const imagePaths = (imageRows ?? []).map((row) => row.storage_path).filter(Boolean);

  if (imagePaths.length > 0) {
    const { error: storageDeleteError } = await supabase.storage
      .from(EVENT_IMAGES_BUCKET)
      .remove(imagePaths);
    if (storageDeleteError) {
      return NextResponse.redirect(
        new URL(`/host/events/${eventId}?error=${encodeURIComponent(storageDeleteError.message)}`, request.url),
        { status: 303 },
      );
    }
  }

  const { error: deleteError } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId);
  if (deleteError) {
    return NextResponse.redirect(
      new URL(`/host/events/${eventId}?error=${encodeURIComponent(deleteError.message)}`, request.url),
      { status: 303 },
    );
  }

  return NextResponse.redirect(new URL("/host/dashboard", request.url), { status: 303 });
}
