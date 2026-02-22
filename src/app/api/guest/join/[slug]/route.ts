import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { addGuestMembershipToResponse } from "@/lib/eventrl/guestSession";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function randomRecoveryCode() {
  return crypto.randomInt(10000, 100000).toString();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const formData = await request.formData();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const guestEmail = String(formData.get("guest_email") ?? "").trim();
  const plusOneRequested = String(formData.get("plus_one") ?? "") === "on";

  if (!displayName) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=missing_name`, request.url), { status: 303 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: invite, error: eventError } = await supabase
    .from("invite_links")
    .select(
      `
      event_id,
      revoked_at,
      events!inner (
        id,
        is_paid_event
      )
      `,
    )
    .eq("slug", slug)
    .single();

  if (eventError || !invite || invite.revoked_at) {
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  }
  const event = Array.isArray(invite.events) ? invite.events[0] : invite.events;
  if (!event) {
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  }
  const isPaidEvent = Boolean(event.is_paid_event);

  let guestRequest: { id: string; recovery_code: string | null } | null = null;
  let requestErrorMessage = "join_failed";
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const recoveryCode = randomRecoveryCode();
    const { data, error: requestError } = await supabase
      .from("guest_requests")
      .insert({
        event_id: event.id,
        display_name: displayName,
        guest_email: guestEmail || null,
        recovery_code: recoveryCode,
        plus_one_requested: plusOneRequested,
        status: isPaidEvent ? "PENDING_PAYMENT" : "PENDING",
      })
      .select("id, recovery_code")
      .single();

    if (!requestError && data) {
      guestRequest = data;
      break;
    }
    requestErrorMessage = requestError?.message ?? "join_failed";
  }

  if (!guestRequest) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=${encodeURIComponent(requestErrorMessage)}`, request.url), {
      status: 303,
    });
  }

  const nextUrl = isPaidEvent
    ? `/api/stripe/checkout?event=${event.id}&guestRequest=${guestRequest.id}&slug=${encodeURIComponent(slug)}`
    : `/g/recovery?event=${event.id}`;
  const response = NextResponse.redirect(new URL(nextUrl, request.url), { status: 303 });
  const membershipSet = await addGuestMembershipToResponse(response, {
    eventId: event.id,
    guestRequestId: guestRequest.id,
  });
  if (!membershipSet) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=missing_guest_cookie_secret`, request.url), {
      status: 303,
    });
  }

  return response;
}
