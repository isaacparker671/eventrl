import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getScannerOnlyRedirect } from "@/lib/auth/eventAccess";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";

function getRequiredEnv(name: "APP_URL" | "STRIPE_SECRET_KEY") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
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
    if (!hasProAccess(profile)) {
      return NextResponse.redirect(new URL("/host/billing?error=Pro%20required%20for%20subscription%20management.", request.url), {
        status: 303,
      });
    }
    if (!profile.stripe_customer_id) {
      return NextResponse.redirect(new URL("/host/billing?error=No%20subscription%20found.", request.url), {
        status: 303,
      });
    }

    const appUrl = getRequiredEnv("APP_URL").replace(/\/$/, "");
    const stripeSecretKey = getRequiredEnv("STRIPE_SECRET_KEY");
    const body = new URLSearchParams();
    body.set("customer", profile.stripe_customer_id);
    body.set("return_url", `${appUrl}/host/billing`);

    const stripeResponse = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    });

    const payload = (await stripeResponse.json().catch(() => null)) as
      | { url?: string; error?: { message?: string } }
      | null;

    if (!stripeResponse.ok || !payload?.url) {
      const message = payload?.error?.message ?? "Could not open subscription portal.";
      return NextResponse.redirect(new URL(`/host/billing?error=${encodeURIComponent(message)}`, request.url), {
        status: 303,
      });
    }

    return NextResponse.redirect(payload.url, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open subscription portal.";
    return NextResponse.redirect(new URL(`/host/billing?error=${encodeURIComponent(message)}`, request.url), {
      status: 303,
    });
  }
}
