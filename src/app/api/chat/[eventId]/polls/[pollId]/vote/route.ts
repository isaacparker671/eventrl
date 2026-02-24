import { NextResponse } from "next/server";
import { resolveChatActor } from "@/lib/eventrl/chatAuth";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; pollId: string }> },
) {
  const { eventId, pollId } = await context.params;
  const actor = await resolveChatActor(eventId, request.headers.get("x-eventrl-actor"));
  if (!actor || actor.type !== "GUEST") {
    return NextResponse.json({ error: "Guest only." }, { status: 403 });
  }
  const ip = getClientIp(request);
  const rate = checkRateLimit({
    key: `chat:poll-vote:${eventId}:${pollId}:guest:${actor.guestRequestId}:${ip}`,
    limit: 20,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    const response = NextResponse.json({ error: "Too many vote attempts. Try again shortly." }, { status: 429 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const payload = (await request.json().catch(() => null)) as { vote?: "YES" | "NO" } | null;
  const vote = payload?.vote;
  if (vote !== "YES" && vote !== "NO") {
    return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: pollRow } = await supabase
    .from("event_polls")
    .select("id")
    .eq("id", pollId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!pollRow) {
    return NextResponse.json({ error: "Poll not found." }, { status: 404 });
  }

  const { data: existingVote } = await supabase
    .from("event_poll_votes")
    .select("id")
    .eq("poll_id", pollId)
    .eq("guest_request_id", actor.guestRequestId)
    .maybeSingle();
  if (existingVote) {
    return NextResponse.json({ error: "You can only vote once." }, { status: 409 });
  }

  const { error } = await supabase.from("event_poll_votes").insert({
    poll_id: pollId,
    event_id: eventId,
    guest_request_id: actor.guestRequestId,
    vote,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const response = NextResponse.json({ ok: true });
  applyRateLimitHeaders(response, rate);
  return response;
}
