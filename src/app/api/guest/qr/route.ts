import { NextResponse } from "next/server";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { randomToken, sha256Hex } from "@/lib/eventrl/security";

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("event") ?? "";
  const guestContext = eventId ? await getGuestContextFromCookie(eventId) : null;
  if (!guestContext) {
    return NextResponse.json({ error: "No guest session." }, { status: 401 });
  }

  if (guestContext.status !== "APPROVED") {
    return NextResponse.json({ error: "Guest not approved." }, { status: 403 });
  }

  if (guestContext.event.requires_payment && !guestContext.paymentConfirmedAt) {
    return NextResponse.json({ error: "Payment not confirmed by host yet." }, { status: 403 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    token: rawToken,
    event: guestContext.event,
    displayName: guestContext.displayName,
  });
}
