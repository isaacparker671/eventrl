import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { addGuestMembershipToResponse } from "@/lib/eventrl/guestSession";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function randomRecoveryCode() {
  return crypto.randomInt(10000, 100000).toString();
}

const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 80;
const EMAIL_MAX = 254;

function isValidGuestEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const ip = getClientIp(request);
  const rate = checkRateLimit({
    key: `guest:join:${slug}:${ip}`,
    limit: 12,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    const response = NextResponse.json({ error: "Too many join attempts. Try again in a moment." }, { status: 429 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const formData = await request.formData();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const guestEmail = String(formData.get("guest_email") ?? "").trim();
  const plusOneRequested = String(formData.get("plus_one") ?? "") === "on";

  if (!displayName) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=missing_name`, request.url), { status: 303 });
  }
  if (displayName.length < DISPLAY_NAME_MIN || displayName.length > DISPLAY_NAME_MAX) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=invalid_name_length`, request.url), { status: 303 });
  }
  if (guestEmail && (guestEmail.length > EMAIL_MAX || !isValidGuestEmail(guestEmail))) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=invalid_email`, request.url), { status: 303 });
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
        is_paid_event,
        requires_payment,
        allow_plus_one
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
  const requiresPayment = Boolean(event.requires_payment);
  const allowPlusOne = Boolean(event.allow_plus_one);

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
        plus_one_requested: allowPlusOne ? plusOneRequested : false,
        status: isPaidEvent ? "PENDING_PAYMENT" : "PENDING",
        payment_status: isPaidEvent || requiresPayment ? "PENDING" : "PAID",
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

  const response = NextResponse.redirect(new URL(`/g/recovery?event=${event.id}`, request.url), { status: 303 });
  const membershipSet = await addGuestMembershipToResponse(response, {
    eventId: event.id,
    guestRequestId: guestRequest.id,
  });
  if (!membershipSet) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=missing_guest_cookie_secret`, request.url), {
      status: 303,
    });
  }

  applyRateLimitHeaders(response, rate);
  return response;
}
