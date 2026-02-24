import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { randomDigits } from "@/lib/eventrl/security";
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
  const action = String(formData.get("action") ?? "invite");
  const scannerEmail = normalizeEmail(String(formData.get("scanner_email") ?? ""));

  const profile = await ensureHostProfile(hostUser);
  if (!hasProAccess(profile)) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}?error=pro_required_for_scanner_access`, request.url), {
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

  if (action === "rotate_code") {
    const { error } = await supabase
      .from("events")
      .update({
        scanner_access_code: randomDigits(6),
      })
      .eq("id", eventId)
      .eq("host_user_id", hostUser.id);

    if (error) {
      return NextResponse.redirect(new URL(`/host/events/${eventId}?error=${encodeURIComponent(error.message)}`, request.url), {
        status: 303,
      });
    }

    return NextResponse.redirect(new URL(`/host/events/${eventId}?saved=1&scannerCode=rotated`, request.url), {
      status: 303,
    });
  }

  if (!scannerEmail || !scannerEmail.includes("@")) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}?error=invalid_scanner_email`, request.url), {
      status: 303,
    });
  }

  const { error: roleError } = await supabase.from("event_scanner_roles").upsert(
    {
      event_id: eventId,
      owner_host_user_id: hostUser.id,
      scanner_email: scannerEmail,
      status: "ACTIVE",
      revoked_at: null,
    },
    { onConflict: "event_id,scanner_email" },
  );

  if (roleError) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}?error=${encodeURIComponent(roleError.message)}`, request.url), {
      status: 303,
    });
  }

  const inviteRedirectTo = `${getAppUrl(request)}/scan/${eventId}`;
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

export async function DELETE() {
  return NextResponse.json({ error: "Not implemented." }, { status: 405 });
}
