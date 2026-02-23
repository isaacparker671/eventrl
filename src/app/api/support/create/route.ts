import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type SupportPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rate = checkRateLimit({
    key: `support:create:${ip}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.allowed) {
    const response = NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  let payload: SupportPayload = {};
  try {
    payload = (await request.json()) as SupportPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = cleanString(payload.name);
  const email = cleanString(payload.email);
  const message = cleanString(payload.message);

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 });
  }

  if (message.length > 5000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const user = await getCurrentHostUser();
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("support_tickets").insert({
    name,
    email,
    message,
    user_id: user?.id ?? null,
    user_agent: request.headers.get("user-agent"),
    ip,
  });

  if (error) {
    return NextResponse.json({ error: "Could not create support ticket." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  applyRateLimitHeaders(response, rate);
  return response;
}
