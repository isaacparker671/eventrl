import { NextResponse } from "next/server";
import { hasProAccess } from "@/lib/host/profile";
import { setScannerSessionInResponse } from "@/lib/eventrl/scannerSession";
import { sha256Hex } from "@/lib/eventrl/security";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const ip = getClientIp(request);
  const rate = checkRateLimit({
    key: `scanner:access:${eventId}:${ip}`,
    limit: 15,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    const response = NextResponse.redirect(new URL(`/scan/${eventId}?error=too_many_attempts`, request.url), {
      status: 303,
    });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const formData = await request.formData();
  const code = String(formData.get("access_code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    const response = NextResponse.redirect(new URL(`/scan/${eventId}?error=invalid_code`, request.url), {
      status: 303,
    });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const supabase = getSupabaseAdminClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, host_user_id, scanner_access_code")
    .eq("id", eventId)
    .maybeSingle();

  if (!event?.scanner_access_code) {
    const response = NextResponse.redirect(new URL(`/scan/${eventId}?error=scanner_code_not_configured`, request.url), {
      status: 303,
    });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const { data: ownerProfile } = await supabase
    .from("host_profiles")
    .select("subscription_status")
    .eq("user_id", event.host_user_id)
    .maybeSingle();
  if (!ownerProfile || !hasProAccess(ownerProfile)) {
    const response = NextResponse.redirect(new URL(`/scan/${eventId}?error=pro_required`, request.url), {
      status: 303,
    });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const providedHash = sha256Hex(code);
  const expectedHash = sha256Hex(event.scanner_access_code);
  if (providedHash !== expectedHash) {
    const response = NextResponse.redirect(new URL(`/scan/${eventId}?error=invalid_code`, request.url), {
      status: 303,
    });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const response = NextResponse.redirect(new URL(`/host/events/${eventId}/scanner`, request.url), { status: 303 });
  await setScannerSessionInResponse(response, {
    eventId,
    grantedAt: new Date().toISOString(),
  });
  applyRateLimitHeaders(response, rate);
  return response;
}
