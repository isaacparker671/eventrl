import { NextResponse } from "next/server";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { randomToken, sha256Hex } from "@/lib/eventrl/security";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/security/rateLimit";

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("event") ?? "";
  const ip = getClientIp(request);
  const rate = checkRateLimit({
    key: `guest:qr:${eventId}:${ip}`,
    limit: 30,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    const response = NextResponse.json({ error: "Too many QR refreshes. Try again in a moment." }, { status: 429 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const guestContext = eventId ? await getGuestContextFromCookie(eventId) : null;
  if (!guestContext) {
    const response = NextResponse.json({ error: "No guest session." }, { status: 401 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  if (guestContext.status !== "APPROVED") {
    const response = NextResponse.json({ error: "Guest not approved." }, { status: 403 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  if (guestContext.event.requires_payment && !guestContext.paymentConfirmedAt) {
    const response = NextResponse.json({ error: "Payment not confirmed by host yet." }, { status: 403 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  if (guestContext.event.is_paid_event && guestContext.paymentStatus !== "PAID") {
    const response = NextResponse.json({ error: "Stripe payment not completed yet." }, { status: 403 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const rawToken = randomToken(32);
  const tokenHash = sha256Hex(rawToken);
  const now = new Date().toISOString();

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("guest_access").upsert(
    {
      event_id: guestContext.event.id,
      guest_request_id: guestContext.guestRequestId,
      qr_token_hash: tokenHash,
      token_hash: tokenHash,
      issued_at: now,
      revoked_at: null,
    },
    { onConflict: "guest_request_id" },
  );

  if (error) {
    const response = NextResponse.json({ error: error.message }, { status: 500 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const response = NextResponse.json({
    token: rawToken,
    event: guestContext.event,
    displayName: guestContext.displayName,
  });
  applyRateLimitHeaders(response, rate);
  return response;
}
