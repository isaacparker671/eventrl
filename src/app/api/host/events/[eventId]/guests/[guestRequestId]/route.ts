import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { randomToken, sha256Hex } from "@/lib/eventrl/security";

type GuestAction =
  | "APPROVE"
  | "REJECT"
  | "REVOKE"
  | "MARK_PAID"
  | "MARK_CANT_MAKE";

function getAction(value: string | null): GuestAction | null {
  if (
    value === "APPROVE" ||
    value === "REJECT" ||
    value === "REVOKE" ||
    value === "MARK_PAID" ||
    value === "MARK_CANT_MAKE"
  ) {
    return value;
  }
  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; guestRequestId: string }> },
) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
  }

  const { eventId, guestRequestId } = await context.params;
  const formData = await request.formData();
  const action = getAction(String(formData.get("action")));

  if (!action) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}?error=invalid_action`, request.url), {
      status: 303,
    });
  }

  const supabase = getSupabaseAdminClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("host_user_id", hostUser.id)
    .single();

  if (eventError || !event) {
    return NextResponse.redirect(new URL("/host/dashboard", request.url), { status: 303 });
  }

  const now = new Date().toISOString();

  if (action === "APPROVE") {
    const { data: guestRow } = await supabase
      .from("guest_requests")
      .select("display_name")
      .eq("id", guestRequestId)
      .eq("event_id", eventId)
      .single();

    const { error: updateError } = await supabase
      .from("guest_requests")
      .update({
        status: "APPROVED",
        approved_at: now,
        rejected_at: null,
        revoked_at: null,
      })
      .eq("id", guestRequestId)
      .eq("event_id", eventId);

    if (updateError) {
      return NextResponse.redirect(
        new URL(`/host/events/${eventId}?error=${encodeURIComponent(updateError.message)}`, request.url),
        { status: 303 },
      );
    }

    const token = randomToken(32);
    const tokenHash = sha256Hex(token);
    await supabase.from("guest_access").upsert(
      {
        event_id: eventId,
        guest_request_id: guestRequestId,
        qr_token_hash: tokenHash,
        token_hash: tokenHash,
        issued_at: now,
        revoked_at: null,
      },
      { onConflict: "guest_request_id" },
    );

    await supabase.from("event_chat_members").upsert(
      {
        event_id: eventId,
        role: "GUEST",
        guest_request_id: guestRequestId,
        joined_at: now,
      },
      { onConflict: "event_id,guest_request_id" },
    );

    await supabase.from("event_chat_messages").insert({
      event_id: eventId,
      sender_type: "SYSTEM",
      sender_name: "Eventrl",
      body: `${guestRow?.display_name ?? "A guest"} was approved and joined the chat.`,
    });
  }

  if (action === "REJECT") {
    await supabase
      .from("guest_requests")
      .update({
        status: "REJECTED",
        rejected_at: now,
      })
      .eq("id", guestRequestId)
      .eq("event_id", eventId);
  }

  if (action === "REVOKE") {
    await supabase
      .from("guest_requests")
      .update({
        status: "REVOKED",
        revoked_at: now,
      })
      .eq("id", guestRequestId)
      .eq("event_id", eventId);

    await supabase.from("guest_access").update({ revoked_at: now }).eq("guest_request_id", guestRequestId);
    await supabase
      .from("event_chat_members")
      .delete()
      .eq("event_id", eventId)
      .eq("guest_request_id", guestRequestId);
  }

  if (action === "MARK_PAID") {
    await supabase
      .from("guest_requests")
      .update({
        payment_confirmed_at: now,
      })
      .eq("id", guestRequestId)
      .eq("event_id", eventId);

    const { data: guestRow } = await supabase
      .from("guest_requests")
      .select("display_name")
      .eq("id", guestRequestId)
      .eq("event_id", eventId)
      .single();

    await supabase.from("event_chat_messages").insert({
      event_id: eventId,
      sender_type: "SYSTEM",
      sender_name: "Eventrl",
      body: `${guestRow?.display_name ?? "Guest"} payment was confirmed by host.`,
    });
  }

  if (action === "MARK_CANT_MAKE") {
    await supabase
      .from("guest_requests")
      .update({
        status: "CANT_MAKE",
      })
      .eq("id", guestRequestId)
      .eq("event_id", eventId);

    await supabase
      .from("event_chat_members")
      .delete()
      .eq("event_id", eventId)
      .eq("guest_request_id", guestRequestId);
  }

  return NextResponse.redirect(new URL(`/host/events/${eventId}`, request.url), { status: 303 });
}
