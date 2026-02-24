import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getScannerOnlyRedirect } from "@/lib/auth/eventAccess";
import { getEnvStrict } from "@/lib/env";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";

function getAppUrl(request: Request) {
  const origin = new URL(request.url).origin;
  return origin.replace(/\/$/, "");
}

function logProPriceOnce(priceId: string) {
  const globalState = globalThis as typeof globalThis & {
    __eventrl_pro_price_logged__?: boolean;
  };
  if (globalState.__eventrl_pro_price_logged__) {
    return;
  }
  console.info("[stripe-pro-checkout] Using STRIPE_PRO_PRICE_ID", { priceId });
  globalState.__eventrl_pro_price_logged__ = true;
}

export async function POST(request: Request) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
  }
  const scannerRedirect = await getScannerOnlyRedirect(hostUser);
  if (scannerRedirect) {
    return NextResponse.redirect(new URL(`${scannerRedirect}?error=scanner_role_limited`, request.url), { status: 303 });
  }

  try {
    const profile = await ensureHostProfile(hostUser);
    if (hasProAccess(profile)) {
      return NextResponse.redirect(new URL("/host/settings?saved=1", request.url), { status: 303 });
    }

    const appUrl = getAppUrl(request);
    const stripeSecretKey = getEnvStrict("STRIPE_SECRET_KEY");
    const proPriceId = getEnvStrict("STRIPE_PRO_PRICE_ID");
    logProPriceOnce(proPriceId);
    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("line_items[0][price]", proPriceId);
    form.set("line_items[0][quantity]", "1");
    form.set("success_url", `${appUrl}/host/settings?pro=success`);
    form.set("cancel_url", `${appUrl}/host/settings?pro=canceled`);
    form.set("client_reference_id", hostUser.id);
    form.set("metadata[userId]", hostUser.id);
    form.set("subscription_data[metadata][userId]", hostUser.id);

    if (profile.stripe_customer_id) {
      form.set("customer", profile.stripe_customer_id);
    } else if (hostUser.email) {
      form.set("customer_email", hostUser.email);
    }

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
    });

    const payload = (await stripeResponse.json().catch(() => null)) as
      | { url?: string; error?: { message?: string } }
      | null;

    if (!stripeResponse.ok || !payload?.url) {
      const message = payload?.error?.message ?? "Could not start Pro checkout.";
      return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(message)}`, request.url), {
        status: 303,
      });
    }

    return NextResponse.redirect(payload.url, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Pro checkout.";
    return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(message)}`, request.url), {
      status: 303,
    });
  }
}
