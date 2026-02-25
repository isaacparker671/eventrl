import { NextResponse } from "next/server";
import { hasProAccess } from "@/lib/host/profile";
import {
  clearScannerGateInResponse,
  getScannerGateFromCookie,
  setScannerGateInResponse,
  setScannerSessionInResponse,
} from "@/lib/eventrl/scannerSession";
import { sha256Hex } from "@/lib/eventrl/security";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function safeReturnTo(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  return trimmed;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const formData = await request.formData();
  const action = String(formData.get("action") ?? "verify");
  const scannerName = String(formData.get("scanner_name") ?? "").trim();

  if (action === "activate") {
    const scannerGate = await getScannerGateFromCookie();
    if (!scannerGate || scannerGate.eventId !== eventId) {
      return NextResponse.redirect(new URL(`/scan/${eventId}?error=invalid_code`, request.url), { status: 303 });
    }

    if (scannerName.length < 2 || scannerName.length > 40) {
      return NextResponse.redirect(new URL(`/scan/${eventId}?error=invalid_scanner_name&stage=identity`, request.url), {
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
      return NextResponse.redirect(new URL(`/scan/${eventId}?error=event_not_found`, request.url), { status: 303 });
    }

    const { data: ownerProfile } = await supabase
      .from("host_profiles")
      .select("subscription_status, is_pro")
      .eq("user_id", event.host_user_id)
      .maybeSingle();
    if (!ownerProfile || !hasProAccess(ownerProfile)) {
      return NextResponse.redirect(new URL(`/scan/${eventId}?error=scanner_pro_required`, request.url), { status: 303 });
    }

    const { error: upsertError } = await supabase.from("event_scanner_identities").upsert(
      {
        event_id: eventId,
        scanner_name: scannerName,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "event_id,scanner_name" },
    );
    if (upsertError) {
      return NextResponse.redirect(
        new URL(`/scan/${eventId}?error=${encodeURIComponent(upsertError.message)}&stage=identity`, request.url),
        { status: 303 },
      );
    }

    const response = NextResponse.redirect(new URL(`/host/events/${eventId}/scanner`, request.url), { status: 303 });
    await setScannerSessionInResponse(response, {
      eventId,
      scannerName,
      grantedAt: new Date().toISOString(),
    });
    await clearScannerGateInResponse(response);
    return response;
  }

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

  const code = String(formData.get("access_code") ?? "").trim();
  const returnTo = safeReturnTo(formData.get("return_to"));
  const redirectPath = (error: string) =>
    returnTo
      ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`
      : `/scan/${eventId}?error=${encodeURIComponent(error)}`;
  if (!/^\d{6}$/.test(code)) {
    const response = NextResponse.redirect(new URL(redirectPath("scanner_invalid_code"), request.url), {
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
    const response = NextResponse.redirect(new URL(redirectPath("scanner_code_not_configured"), request.url), {
      status: 303,
    });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const { data: ownerProfile } = await supabase
    .from("host_profiles")
    .select("subscription_status, is_pro")
    .eq("user_id", event.host_user_id)
    .maybeSingle();
  if (!ownerProfile || !hasProAccess(ownerProfile)) {
    const response = NextResponse.redirect(new URL(redirectPath("scanner_pro_required"), request.url), {
      status: 303,
    });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const providedHash = sha256Hex(code);
  const expectedHash = sha256Hex(event.scanner_access_code);
  if (providedHash !== expectedHash) {
    const response = NextResponse.redirect(new URL(redirectPath("scanner_invalid_code"), request.url), {
      status: 303,
    });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const response = NextResponse.redirect(new URL(`/scan/${eventId}?stage=identity`, request.url), { status: 303 });
  await setScannerGateInResponse(response, {
    eventId,
    verifiedAt: new Date().toISOString(),
  });
  applyRateLimitHeaders(response, rate);
  return response;
}
