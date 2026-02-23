import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getScannerOnlyRedirect } from "@/lib/auth/eventAccess";
import { ensureHostProfile } from "@/lib/host/profile";
import { syncProSubscriptionForHost } from "@/lib/stripe/proSubscription";

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
    const result = await syncProSubscriptionForHost(hostUser, profile);
    if (result.isPro) {
      return NextResponse.redirect(new URL("/host/settings?pro=success", request.url), { status: 303 });
    }
    return NextResponse.redirect(
      new URL("/host/settings?error=No%20active%20Pro%20subscription%20was%20found.", request.url),
      { status: 303 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sync subscription.";
    return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(message)}`, request.url), {
      status: 303,
    });
  }
}
