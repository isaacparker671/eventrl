import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { randomToken, sha256Hex } from "@/lib/eventrl/security";
import { hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type StripeEvent = {
  type?: string;
  account?: string;
  data?: {
    object?: Record<string, unknown>;
  };
};

function getRequiredEnv(name: "STRIPE_WEBHOOK_SECRET" | "STRIPE_SECRET_KEY") {
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

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getMetadata(obj: Record<string, unknown>) {
  const metadata = obj.metadata;
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
}

function toIsoFromUnix(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function normalizeSubscriptionStatus(status: string): string | null {
  if (!status) return null;
  return status;
}

function isProSubscriptionStatus(status: string | null) {
  return status === "active" || status === "trialing";
}

function getInvoicePeriodEnd(invoice: Record<string, unknown>): string | null {
  const lines = invoice.lines;
  if (!lines || typeof lines !== "object") {
    return null;
  }
  const data = (lines as { data?: unknown }).data;
  if (!Array.isArray(data) || !data.length) {
    return null;
  }
  const first = data[0];
  if (!first || typeof first !== "object") {
    return null;
  }
  const period = (first as { period?: unknown }).period;
  if (!period || typeof period !== "object") {
    return null;
  }
  return toIsoFromUnix((period as { end?: unknown }).end);
}

function getInvoiceSubscriptionId(invoice: Record<string, unknown>) {
  const rootSubscriptionId = getString(invoice.subscription);
  if (rootSubscriptionId) {
    return rootSubscriptionId;
  }

  const parent = invoice.parent;
  if (!parent || typeof parent !== "object") {
    return "";
  }

  const subscriptionDetails = (parent as { subscription_details?: unknown }).subscription_details;
  if (!subscriptionDetails || typeof subscriptionDetails !== "object") {
    return "";
  }

  return getString((subscriptionDetails as { subscription?: unknown }).subscription);
}

async function applySubscriptionEntitlement(params: {
  userId?: string;
  customerId?: string;
  subscriptionId?: string;
  status?: string | null;
  currentPeriodEnd?: string | null;
}) {
  const supabase = getSupabaseAdminClient();
  const subscriptionStatus = params.status ?? null;
  const updatePayload: Record<string, string | boolean | null> = {
    updated_at: new Date().toISOString(),
    is_pro: isProSubscriptionStatus(subscriptionStatus),
  };

  if (params.customerId) {
    updatePayload.stripe_customer_id = params.customerId;
  }
  if (params.subscriptionId) {
    updatePayload.stripe_subscription_id = params.subscriptionId;
  }
  if (subscriptionStatus !== undefined) {
    updatePayload.subscription_status = subscriptionStatus;
  }
  if (params.currentPeriodEnd !== undefined) {
    updatePayload.current_period_end = params.currentPeriodEnd;
  }

  if (params.userId) {
    await supabase.from("host_profiles").update(updatePayload).eq("user_id", params.userId);
    return;
  }

  if (params.subscriptionId) {
    const { data: bySub } = await supabase
      .from("host_profiles")
      .select("user_id")
      .eq("stripe_subscription_id", params.subscriptionId)
      .maybeSingle();
    if (bySub?.user_id) {
      await supabase.from("host_profiles").update(updatePayload).eq("user_id", bySub.user_id);
      return;
    }
  }

  if (params.customerId) {
    const { data: byCustomer } = await supabase
      .from("host_profiles")
      .select("user_id")
      .eq("stripe_customer_id", params.customerId)
      .maybeSingle();
    if (byCustomer?.user_id) {
      await supabase.from("host_profiles").update(updatePayload).eq("user_id", byCustomer.user_id);
    }
  }
}

async function fetchSubscriptionSnapshot(subscriptionId: string) {
  if (!subscriptionId) {
    return null;
  }

  const stripeSecretKey = getRequiredEnv("STRIPE_SECRET_KEY");
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | { status?: string; current_period_end?: number; customer?: string; metadata?: Record<string, unknown> }
    | null;
  if (!payload) {
    return null;
  }

  const metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  const userId = getString(metadata.userId) || getString(metadata.hostUserId);

  return {
    status: normalizeSubscriptionStatus(getString(payload.status)),
    currentPeriodEnd: toIsoFromUnix(payload.current_period_end),
    customerId: getString(payload.customer),
    userId,
  };
}

async function handleGuestCheckoutCompleted(event: StripeEvent, obj: Record<string, unknown>) {
  const metadata = getMetadata(obj);
  const checkoutSessionId = getString(obj.id);
  const eventId = getString(metadata.eventId);
  const guestRequestId = getString(metadata.guestRequestId);
  const paymentStatus = getString(obj.payment_status);

  if (!eventId || !guestRequestId || !checkoutSessionId || paymentStatus !== "paid") {
    return;
  }

  const supabase = getSupabaseAdminClient();
  const { data: guestRequest, error: guestError } = await supabase
    .from("guest_requests")
    .select(
      "id, event_id, display_name, status, payment_status, stripe_checkout_session_id, events!inner(id, host_user_id, is_paid_event)",
    )
    .eq("id", guestRequestId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (guestError || !guestRequest) {
    return;
  }

  if (guestRequest.stripe_checkout_session_id && guestRequest.stripe_checkout_session_id !== checkoutSessionId) {
    return;
  }

  const eventRow = Array.isArray(guestRequest.events) ? guestRequest.events[0] : guestRequest.events;
  if (!eventRow || !eventRow.is_paid_event) {
    return;
  }

  const { data: hostProfile } = await supabase
    .from("host_profiles")
    .select("subscription_status, stripe_account_id")
    .eq("user_id", eventRow.host_user_id)
    .maybeSingle();

  if (!hostProfile || !hasProAccess(hostProfile) || !hostProfile.stripe_account_id) {
    return;
  }

  if (event.account && event.account !== hostProfile.stripe_account_id) {
    return;
  }

  const { data: existingAccess } = await supabase
    .from("guest_access")
    .select("id")
    .eq("guest_request_id", guestRequestId)
    .maybeSingle();

  if (guestRequest.status === "APPROVED" && guestRequest.payment_status === "PAID" && existingAccess?.id) {
    return;
  }

  const now = new Date().toISOString();
  const tokenHash = sha256Hex(randomToken(32));

  const { error: approveError } = await supabase
    .from("guest_requests")
    .update({
      status: "APPROVED",
      payment_status: "PAID",
      paid_at: now,
      stripe_checkout_session_id: checkoutSessionId,
      approved_at: now,
      decision_at: now,
      payment_confirmed_at: now,
      rejected_at: null,
      revoked_at: null,
    })
    .eq("id", guestRequestId)
    .eq("event_id", eventId);

  if (approveError) {
    throw new Error(approveError.message);
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
    throw new Error(accessError.message);
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
}

async function handleProCheckoutCompleted(obj: Record<string, unknown>) {
  if (getString(obj.mode) !== "subscription") {
    return;
  }

  const metadata = getMetadata(obj);
  const userId = getString(metadata.userId) || getString(metadata.hostUserId) || getString(obj.client_reference_id);
  const customerId = getString(obj.customer);
  const subscriptionId = getString(obj.subscription);

  const snapshot = await fetchSubscriptionSnapshot(subscriptionId);
  const status = snapshot?.status ?? "active";
  const currentPeriodEnd = snapshot?.currentPeriodEnd ?? null;
  const resolvedCustomerId = snapshot?.customerId || customerId;
  const resolvedUserId = snapshot?.userId || userId;

  await applySubscriptionEntitlement({
    userId: resolvedUserId,
    customerId: resolvedCustomerId,
    subscriptionId,
    status,
    currentPeriodEnd,
  });
}

async function handleInvoiceEvent(obj: Record<string, unknown>, paid: boolean) {
  const fallbackCustomerId = getString(obj.customer);
  const subscriptionId = getInvoiceSubscriptionId(obj);
  const snapshot = await fetchSubscriptionSnapshot(subscriptionId);
  const status = paid ? "active" : "past_due";
  const currentPeriodEnd = snapshot?.currentPeriodEnd ?? getInvoicePeriodEnd(obj);

  await applySubscriptionEntitlement({
    userId: snapshot?.userId || undefined,
    customerId: snapshot?.customerId || fallbackCustomerId,
    subscriptionId,
    status,
    currentPeriodEnd,
  });
}

async function handleSubscriptionUpdated(obj: Record<string, unknown>, deleted: boolean) {
  const customerId = getString(obj.customer);
  const subscriptionId = getString(obj.id);
  const status = deleted ? "canceled" : normalizeSubscriptionStatus(getString(obj.status));
  const currentPeriodEnd = toIsoFromUnix(obj.current_period_end);

  await applySubscriptionEntitlement({
    customerId,
    subscriptionId,
    status,
    currentPeriodEnd,
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

  const obj = event.data?.object;
  if (!obj) {
    return NextResponse.json({ received: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const metadata = getMetadata(obj);
      if (getString(metadata.eventId) && getString(metadata.guestRequestId)) {
        await handleGuestCheckoutCompleted(event, obj);
      } else {
        await handleProCheckoutCompleted(obj);
      }
      return NextResponse.json({ received: true });
    }

    if (event.type === "invoice.paid") {
      await handleInvoiceEvent(obj, true);
      return NextResponse.json({ received: true });
    }

    if (event.type === "invoice.payment_failed") {
      await handleInvoiceEvent(obj, false);
      return NextResponse.json({ received: true });
    }

    if (event.type === "customer.subscription.updated") {
      await handleSubscriptionUpdated(obj, false);
      return NextResponse.json({ received: true });
    }

    if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionUpdated(obj, true);
      return NextResponse.json({ received: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
