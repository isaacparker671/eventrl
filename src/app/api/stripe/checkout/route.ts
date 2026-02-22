import { NextResponse } from "next/server";
import { getGuestMembershipForEvent } from "@/lib/eventrl/guestSession";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function getRequiredEnv(name: "APP_URL" | "STRIPE_SECRET_KEY") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const eventId = requestUrl.searchParams.get("event") ?? "";
  const guestRequestId = requestUrl.searchParams.get("guestRequest") ?? "";
  const slug = requestUrl.searchParams.get("slug") ?? "";

  if (!eventId || !guestRequestId || !slug) {
    return NextResponse.redirect(new URL("/join", request.url), { status: 303 });
  }

  const membership = await getGuestMembershipForEvent(eventId);
  if (!membership || membership.guestRequestId !== guestRequestId) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=invalid_guest_membership`, request.url), { status: 303 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: guestRequest, error: guestError } = await supabase
    .from("guest_requests")
    .select("id, event_id, status, guest_email, events!inner(id, name, invite_slug, is_paid_event, price_cents, host_user_id)")
    .eq("id", guestRequestId)
    .eq("event_id", eventId)
    .single();

  if (guestError || !guestRequest) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=guest_request_not_found`, request.url), { status: 303 });
  }

  const event = Array.isArray(guestRequest.events) ? guestRequest.events[0] : guestRequest.events;
  if (!event) {
    return NextResponse.redirect(new URL(`/i/${slug}?error=event_not_found`, request.url), { status: 303 });
  }

  if (!event.is_paid_event || !event.price_cents || event.price_cents < 1) {
    return NextResponse.redirect(new URL(`/g/status?event=${event.id}`, request.url), { status: 303 });
  }

  if (guestRequest.status === "APPROVED") {
    return NextResponse.redirect(new URL(`/g/status?event=${event.id}`, request.url), { status: 303 });
  }

  if (guestRequest.status !== "PENDING_PAYMENT") {
    return NextResponse.redirect(new URL(`/i/${event.invite_slug}?error=invalid_join_status`, request.url), { status: 303 });
  }

  const { data: hostProfile } = await supabase
    .from("host_profiles")
    .select("is_pro, stripe_account_id")
    .eq("user_id", event.host_user_id)
    .maybeSingle();

  if (!hostProfile || !hostProfile.is_pro || !hostProfile.stripe_account_id) {
    return NextResponse.redirect(new URL(`/i/${event.invite_slug}?error=host_payment_unavailable`, request.url), { status: 303 });
  }

  try {
    const appUrl = getRequiredEnv("APP_URL");
    const stripeSecretKey = getRequiredEnv("STRIPE_SECRET_KEY");

    const stripeForm = new URLSearchParams();
    stripeForm.set("mode", "payment");
    stripeForm.set("success_url", `${appUrl.replace(/\/$/, "")}/g/status?event=${event.id}`);
    stripeForm.set("cancel_url", `${appUrl.replace(/\/$/, "")}/i/${event.invite_slug}?error=payment_canceled`);
    stripeForm.set("line_items[0][price_data][currency]", "usd");
    stripeForm.set("line_items[0][price_data][unit_amount]", String(event.price_cents));
    stripeForm.set("line_items[0][price_data][product_data][name]", `${event.name} entry`);
    stripeForm.set("line_items[0][quantity]", "1");
    stripeForm.set("metadata[eventId]", event.id);
    stripeForm.set("metadata[guestRequestId]", guestRequest.id);
    stripeForm.set("metadata[inviteSlug]", event.invite_slug);
    stripeForm.set("client_reference_id", guestRequest.id);
    if (guestRequest.guest_email) {
      stripeForm.set("customer_email", guestRequest.guest_email);
    }

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Account": hostProfile.stripe_account_id,
      },
      body: stripeForm.toString(),
      cache: "no-store",
    });

    const stripePayload = (await stripeResponse.json().catch(() => null)) as
      | { url?: string; error?: { message?: string } }
      | null;

    if (!stripeResponse.ok || !stripePayload?.url) {
      const message = stripePayload?.error?.message ?? "Could not start checkout session.";
      return NextResponse.redirect(new URL(`/i/${event.invite_slug}?error=${encodeURIComponent(message)}`, request.url), {
        status: 303,
      });
    }

    return NextResponse.redirect(stripePayload.url, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start checkout session.";
    return NextResponse.redirect(new URL(`/i/${event.invite_slug}?error=${encodeURIComponent(message)}`, request.url), {
      status: 303,
    });
  }
}
