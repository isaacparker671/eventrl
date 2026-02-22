import { NextResponse } from "next/server";
import { clearGuestMembershipCookieOnResponse } from "@/lib/eventrl/guestSession";

export async function POST(request: Request) {
  const nextParam = new URL(request.url).searchParams.get("next") || "/join";
  const next = nextParam.startsWith("/") ? nextParam : "/join";
  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  clearGuestMembershipCookieOnResponse(response);
  return response;
}
