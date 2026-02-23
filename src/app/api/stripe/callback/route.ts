import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getScannerOnlyRedirect } from "@/lib/auth/eventAccess";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function getRequiredEnv(name: "STRIPE_CONNECT_CLIENT_ID" | "STRIPE_SECRET_KEY") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getAppUrl(request: Request) {
  return new URL(request.url).origin.replace(/\/$/, "");
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

  const callbackUrl = new URL(request.url);
  const oauthError = callbackUrl.searchParams.get("error_description") || callbackUrl.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(oauthError)}`, request.url), {
      status: 303,
    });
  }

  const code = callbackUrl.searchParams.get("code") ?? "";
  if (!code) {
    return NextResponse.redirect(new URL("/host/settings?error=Missing%20Stripe%20authorization%20code.", request.url), {
      status: 303,
    });
  }

  try {
    const profile = await ensureHostProfile(hostUser);
    if (!hasProAccess(profile)) {
      return NextResponse.redirect(new URL("/host/settings?error=Pro%20required%20for%20this%20feature.", request.url), {
        status: 303,
      });
    }

    const appUrl = getAppUrl(request);
    const clientId = getRequiredEnv("STRIPE_CONNECT_CLIENT_ID");
    const stripeSecretKey = getRequiredEnv("STRIPE_SECRET_KEY");
    const redirectUri = `${appUrl}/api/stripe/callback`;

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("client_id", clientId);
    form.set("client_secret", stripeSecretKey);
    form.set("code", code);
    form.set("redirect_uri", redirectUri);

    const tokenResponse = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
    });

    const tokenPayload = (await tokenResponse.json().catch(() => null)) as
      | { stripe_user_id?: string; error_description?: string; error?: string }
      | null;

    if (!tokenResponse.ok || !tokenPayload?.stripe_user_id) {
      const message = tokenPayload?.error_description || tokenPayload?.error || "Stripe connection failed.";
      return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(message)}`, request.url), {
        status: 303,
      });
    }

    const supabase = getSupabaseAdminClient();
    const { error: updateError } = await supabase
      .from("host_profiles")
      .update({
        stripe_account_id: tokenPayload.stripe_user_id,
        stripe_connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", hostUser.id);

    if (updateError) {
      return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(updateError.message)}`, request.url), {
        status: 303,
      });
    }

    return NextResponse.redirect(new URL("/host/settings?stripe=connected", request.url), { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to complete Stripe connection.";
    return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(message)}`, request.url), {
      status: 303,
    });
  }
}
