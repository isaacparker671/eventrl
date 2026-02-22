import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { randomToken, sha256Hex } from "@/lib/eventrl/security";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type StripeEvent = {
  type?: string;
  account?: string;
  data?: {
    object?: {
      metadata?: {
        eventId?: string;
        guestRequestId?: string;
      };
      payment_status?: string;
    };
  };
};

function getRequiredEnv(name: "STRIPE_WEBHOOK_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function verifyStripeSignature(payload: string, signatureHeader: string, webhookSecret: string) {
  const signatureParts = signatureHeader.split(",").reduce<Record<string, string[]>>((acc, part) => {
    const [k, v] = part.split("=", 2);
    if (!k || !v) return acc;
    acc[k] = acc[k] ? [...acc[k], v] : [v];
    return acc;
  }, {});

  const timestamp = signatureParts.t?.[0];
  const signatures = signatureParts.v1 ?? [];
  if (!timestamp || !signatures.length) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", webhookSecret).update(signedPayload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return signatures.some((signature) => {
    const providedBuffer = Buffer.from(signature, "utf8");
    return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  });
}

export async function POST(request: Request) {
  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let payload = "";
  try {
    payload = await request.text();
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  let webhookSecret = "";
  try {
    webhookSecret = getRequiredEnv("STRIPE_WEBHOOK_SECRET");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook misconfigured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!verifyStripeSignature(payload, signatureHeader, webhookSecret)) {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook JSON." }, { status: 400 });
  }
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const metadata = event.data?.object?.metadata;
  const eventId = metadata?.eventId ?? "";
  const guestRequestId = metadata?.guestRequestId ?? "";
  const paymentStatus = event.data?.object?.payment_status ?? "";

  if (!eventId || !guestRequestId || paymentStatus !== "paid") {
    return NextResponse.json({ received: true });
  }

  const supabase = getSupabaseAdminClient();
  const { data: guestRequest, error: guestError } = await supabase
    .from("guest_requests")
    .select("id, event_id, display_name, status, payment_confirmed_at, events!inner(id, host_user_id)")
    .eq("id", guestRequestId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (guestError || !guestRequest) {
    return NextResponse.json({ received: true });
  }

  const eventRow = Array.isArray(guestRequest.events) ? guestRequest.events[0] : guestRequest.events;
  if (!eventRow) {
    return NextResponse.json({ received: true });
  }

  const { data: hostProfile } = await supabase
    .from("host_profiles")
    .select("is_pro, stripe_account_id")
    .eq("user_id", eventRow.host_user_id)
    .maybeSingle();

  if (!hostProfile || !hostProfile.is_pro || !hostProfile.stripe_account_id) {
    return NextResponse.json({ received: true });
  }

  if (event.account && event.account !== hostProfile.stripe_account_id) {
    return NextResponse.json({ received: true });
  }

  const now = new Date().toISOString();
  const tokenHash = sha256Hex(randomToken(32));

  const { error: approveError } = await supabase
    .from("guest_requests")
    .update({
      status: "APPROVED",
      approved_at: now,
      decision_at: now,
      payment_confirmed_at: now,
      rejected_at: null,
      revoked_at: null,
    })
    .eq("id", guestRequestId)
    .eq("event_id", eventId);

  if (approveError) {
    return NextResponse.json({ error: approveError.message }, { status: 500 });
  }

  const { error: accessError } = await supabase.from("guest_access").upsert(
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

  if (accessError) {
    return NextResponse.json({ error: accessError.message }, { status: 500 });
  }

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
    body: `${guestRequest.display_name ?? "A guest"} paid and was approved.`,
  });

  return NextResponse.json({ received: true });
}
