import { NextResponse } from "next/server";
import { removeGuestMembershipFromResponse } from "@/lib/eventrl/guestSession";

export async function POST(request: Request) {
  const formData = await request.formData();
  const eventId = String(formData.get("event_id") ?? "").trim();

  const response = NextResponse.redirect(new URL("/g/events", request.url), { status: 303 });
  if (!eventId) {
    return response;
  }

  await removeGuestMembershipFromResponse(response, eventId);
  return response;
}
