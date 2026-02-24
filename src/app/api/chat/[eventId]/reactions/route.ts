import { NextResponse } from "next/server";
import { resolveChatActor } from "@/lib/eventrl/chatAuth";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type Reaction = "UP" | "DOWN" | "LAUGH";
const EMOJI_TO_REACTION: Record<string, Reaction> = {
  "👍": "UP",
  "👎": "DOWN",
  "😂": "LAUGH",
};

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const actor = await resolveChatActor(eventId, request.headers.get("x-eventrl-actor"));
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const ip = getClientIp(request);
  const actorKey = actor.type === "HOST" ? `host:${actor.hostUserId}` : `guest:${actor.guestRequestId}`;
  const rate = checkRateLimit({
    key: `chat:reactions:post:${eventId}:${actorKey}:${ip}`,
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    const response = NextResponse.json({ error: "Too many reactions. Slow down." }, { status: 429 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const payload = (await request.json().catch(() => null)) as
    | { messageId?: string; emoji?: string }
    | null;
  const messageId = payload?.messageId?.trim();
  const reaction = payload?.emoji ? EMOJI_TO_REACTION[payload.emoji] : undefined;

  if (!messageId || !reaction) {
    return NextResponse.json({ error: "Invalid reaction payload." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: messageRow } = await supabase
    .from("event_chat_messages")
    .select("id")
    .eq("id", messageId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!messageRow) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  const existingQuery = supabase
    .from("event_chat_reactions")
    .select("id, reaction")
    .eq("event_id", eventId)
    .eq("message_id", messageId)
    .limit(1);

  const existingResult =
    actor.type === "HOST"
      ? await existingQuery.eq("host_user_id", actor.hostUserId).is("guest_request_id", null).maybeSingle()
      : await existingQuery.eq("guest_request_id", actor.guestRequestId).is("host_user_id", null).maybeSingle();

  if (existingResult.error) {
    return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
  }

  if (existingResult.data) {
    if (existingResult.data.reaction === reaction) {
      const { error: deleteError } = await supabase
        .from("event_chat_reactions")
        .delete()
        .eq("id", existingResult.data.id);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
      const response = NextResponse.json({ ok: true, action: "removed" });
      applyRateLimitHeaders(response, rate);
      return response;
    }

    const { error: updateError } = await supabase
      .from("event_chat_reactions")
      .update({ reaction })
      .eq("id", existingResult.data.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    const response = NextResponse.json({ ok: true, action: "updated", reaction });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const { error } = await supabase.from("event_chat_reactions").insert(
    actor.type === "HOST"
      ? {
          event_id: eventId,
          message_id: messageId,
          reaction,
          host_user_id: actor.hostUserId,
        }
      : {
          event_id: eventId,
          message_id: messageId,
          reaction,
          guest_request_id: actor.guestRequestId,
        },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const response = NextResponse.json({ ok: true, action: "added", reaction });
  applyRateLimitHeaders(response, rate);
  return response;
}
