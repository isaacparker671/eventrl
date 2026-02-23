import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getAppUrl(request: Request) {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return new URL(request.url).origin;
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
  const formData = await request.formData();
  const scannerEmail = normalizeEmail(String(formData.get("scanner_email") ?? ""));
  if (!scannerEmail || !scannerEmail.includes("@")) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}?error=invalid_scanner_email`, request.url), {
      status: 303,
    });
  }

  const profile = await ensureHostProfile(hostUser);
  if (!hasProAccess(profile)) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}?error=pro_required_for_scanner_roles`, request.url), {
      status: 303,
    });
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

  const { error } = await supabase.from("event_scanner_roles").upsert(
    {
      event_id: eventId,
      owner_host_user_id: hostUser.id,
      scanner_email: scannerEmail,
      status: "ACTIVE",
      revoked_at: null,
    },
    { onConflict: "event_id,scanner_email" },
  );

  if (error) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}?error=${encodeURIComponent(error.message)}`, request.url), {
      status: 303,
    });
  }

  const inviteRedirectTo = `${getAppUrl(request)}/host/login`;
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(scannerEmail, {
    redirectTo: inviteRedirectTo,
  });

  if (!inviteError) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}?saved=1&scannerInvite=sent`, request.url), { status: 303 });
  }

  const inviteMessage = inviteError.message.toLowerCase();
  if (inviteMessage.includes("already") || inviteMessage.includes("exists")) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}?saved=1&scannerInvite=existing`, request.url), { status: 303 });
  }

  return NextResponse.redirect(
    new URL(`/host/events/${eventId}?saved=1&scannerInvite=failed`, request.url),
    { status: 303 },
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await context.params;
  const payload = (await request.json().catch(() => null)) as { scannerEmail?: string } | null;
  const scannerEmail = normalizeEmail(payload?.scannerEmail ?? "");
  if (!scannerEmail) {
    return NextResponse.json({ error: "scannerEmail required" }, { status: 400 });
  }

  const profile = await ensureHostProfile(hostUser);
  if (!hasProAccess(profile)) {
    return NextResponse.json({ error: "Pro required" }, { status: 403 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, host_user_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.host_user_id !== hostUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("event_scanner_roles")
    .update({
      status: "REVOKED",
      revoked_at: new Date().toISOString(),
    })
    .eq("event_id", eventId)
    .eq("scanner_email", scannerEmail);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
