import { NextResponse } from "next/server";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("event") ?? "";
  const guestContext = eventId ? await getGuestContextFromCookie(eventId) : null;

  if (!guestContext) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    guestRequestId: guestContext.guestRequestId,
    displayName: guestContext.displayName,
    status: guestContext.status,
    paymentConfirmedAt: guestContext.paymentConfirmedAt,
    guestEventStatus: guestContext.guestEventStatus,
    event: guestContext.event,
  });
}
