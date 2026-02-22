import { NextResponse } from "next/server";
import { addGuestMembershipToResponse } from "@/lib/eventrl/guestSession";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const formData = await request.formData();
  const recoveryCode = String(formData.get("recovery_code") ?? "").trim();

  if (!/^\d{4,5}$/.test(recoveryCode)) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=invalid_code`, request.url), { status: 303 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: invite, error: inviteError } = await supabase
    .from("invite_links")
    .select("event_id, revoked_at")
    .eq("slug", slug)
    .single();

  if (inviteError || !invite || invite.revoked_at) {
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  }

  const { data: guestRequest, error: guestError } = await supabase
    .from("guest_requests")
    .select("id, event_id")
    .eq("event_id", invite.event_id)
    .eq("recovery_code", recoveryCode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (guestError || !guestRequest) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=invalid_code`, request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL(`/g/status?event=${invite.event_id}`, request.url), {
    status: 303,
  });
  const membershipSet = await addGuestMembershipToResponse(response, {
    eventId: invite.event_id,
    guestRequestId: guestRequest.id,
  });
  if (!membershipSet) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=missing_guest_cookie_secret`, request.url), {
      status: 303,
    });
  }

  return response;
}
