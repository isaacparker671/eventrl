import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sha256Hex } from "@/lib/eventrl/security";

type CheckinResult =
  | "CHECKED_IN"
  | "ALREADY_CHECKED_IN"
  | "REVOKED"
  | "NOT_APPROVED"
  | "NOT_PAID"
  | "INVALID_TOKEN"
  | "UNAUTHORIZED";

function jsonResult(status: number, result: CheckinResult, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ result, message, ...extra }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return jsonResult(401, "UNAUTHORIZED", "Host auth required.");
  }

  const { eventId } = await context.params;
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const rawToken = body?.token?.trim();

  if (!rawToken) {
    return jsonResult(400, "INVALID_TOKEN", "Missing QR token.");
  }

  const supabase = getSupabaseAdminClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, capacity, requires_payment")
    .eq("id", eventId)
    .eq("host_user_id", hostUser.id)
    .single();

  if (eventError || !event) {
    return jsonResult(403, "UNAUTHORIZED", "Not allowed for this event.");
  }

  const tokenHash = sha256Hex(rawToken);

  const { data: access, error: accessError } = await supabase
    .from("guest_access")
    .select(
      `
      id,
      revoked_at,
      guest_request_id,
      guest_requests!inner (
        id,
        event_id,
        display_name,
        status,
        payment_confirmed_at
      )
      `,
    )
    .or(`token_hash.eq.${tokenHash},qr_token_hash.eq.${tokenHash}`)
    .single();

  if (accessError || !access) {
    return jsonResult(404, "INVALID_TOKEN", "Invalid QR token.");
  }

  const guestRequest = Array.isArray(access.guest_requests) ? access.guest_requests[0] : access.guest_requests;

  if (!guestRequest || guestRequest.event_id !== eventId) {
    return jsonResult(404, "INVALID_TOKEN", "Token does not match this event.");
  }

  if (access.revoked_at || guestRequest.status === "REVOKED") {
    return jsonResult(403, "REVOKED", "Guest access revoked.");
  }

  if (guestRequest.status !== "APPROVED") {
    return jsonResult(403, "NOT_APPROVED", "Guest is not approved.");
  }

  if (event.requires_payment && !guestRequest.payment_confirmed_at) {
    return jsonResult(403, "NOT_PAID", "Payment has not been confirmed.");
  }

  const { error: insertError } = await supabase.from("checkins").insert({
    event_id: eventId,
    guest_access_id: access.id,
    checker_host_user_id: hostUser.id,
  });

  let result: CheckinResult = "CHECKED_IN";
  let message = `Checked in: ${guestRequest.display_name}`;

  if (insertError) {
    if (insertError.message.toLowerCase().includes("duplicate")) {
      result = "ALREADY_CHECKED_IN";
      message = `${guestRequest.display_name} already checked in.`;
    } else {
      return jsonResult(500, "INVALID_TOKEN", insertError.message);
    }
  }

  const [{ count: checkedInCount }, { count: approvedCount }] = await Promise.all([
    supabase
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
    supabase
      .from("guest_requests")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "APPROVED"),
  ]);

  const checkedIn = checkedInCount ?? 0;
  const approved = approvedCount ?? 0;
  const remainingCapacity =
    typeof event.capacity === "number" ? Math.max(event.capacity - checkedIn, 0) : null;

  return jsonResult(200, result, message, {
    checkedIn,
    approved,
    remainingCapacity,
    guestName: guestRequest.display_name,
  });
}
