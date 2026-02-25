import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getScannerOnlyRedirect } from "@/lib/auth/eventAccess";
import { getEnvStrict } from "@/lib/env";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";

function getAppUrl(request: Request) {
  return (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
}

export async function GET(request: Request) {
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
      return NextResponse.redirect(new URL("/host/settings?error=Pro%20required%20for%20this%20feature.", request.url), {
        status: 303,
      });
    }

    const appUrl = getAppUrl(request);
    const clientId = getEnvStrict("STRIPE_CONNECT_CLIENT_ID");
    console.info("[stripe-connect] route=src/app/api/stripe/connect/route.ts client_id=%s", clientId);
    const redirectUri = `${appUrl}/api/stripe/callback`;

    const stripeUrl = new URL("https://connect.stripe.com/oauth/authorize");
    stripeUrl.searchParams.set("response_type", "code");
    stripeUrl.searchParams.set("client_id", clientId);
    stripeUrl.searchParams.set("scope", "read_write");
    stripeUrl.searchParams.set("redirect_uri", redirectUri);

    return NextResponse.redirect(stripeUrl, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Stripe connection.";
    return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(message)}`, request.url), {
      status: 303,
    });
  }
}
