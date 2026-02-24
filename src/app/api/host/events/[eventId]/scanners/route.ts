import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { randomDigits } from "@/lib/eventrl/security";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  return NextResponse.json({ error: "Not implemented." }, { status: 405 });
}
