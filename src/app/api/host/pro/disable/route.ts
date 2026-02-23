import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getScannerOnlyRedirect } from "@/lib/auth/eventAccess";
import { ensureHostProfile } from "@/lib/host/profile";

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
    await ensureHostProfile(hostUser);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to bootstrap profile.";
    return NextResponse.redirect(new URL(`/host/settings?error=${encodeURIComponent(message)}`, request.url), {
      status: 303,
    });
  }

  return NextResponse.redirect(
    new URL("/host/settings?error=Manual%20Pro%20toggle%20disabled.%20Subscription%20status%20is%20webhook-managed.", request.url),
    { status: 303 },
  );
}
