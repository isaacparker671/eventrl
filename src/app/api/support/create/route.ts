import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type SupportPayload = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
};

const NAME_MAX = 80;
const EMAIL_MAX = 254;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  if (name.length < 2 || name.length > NAME_MAX) {
    return NextResponse.json({ error: "Name must be between 2 and 80 characters." }, { status: 400 });
  }

  if (email.length > EMAIL_MAX || !isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) {
    return NextResponse.json({ error: "Message must be between 10 and 2000 characters." }, { status: 400 });
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
