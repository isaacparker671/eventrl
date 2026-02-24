import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";
import { applyRateLimitHeaders, checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ eventId: string }> };

type ActorAccess =
  | { type: "HOST"; hostUserId: string }
  | { type: "GUEST"; guestRequestId: string; displayName: string }
  | null;

async function canHostAccess(eventId: string, hostUserId: string) {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("host_user_id", hostUserId)
    .single();
  return Boolean(data);
}

async function resolveActorAccess(eventId: string, actorHeader: string | null, allowFallback = false): Promise<ActorAccess> {
  if (actorHeader === "host") {
    const hostUser = await getCurrentHostUser();
    if (!hostUser) return null;
    const allowed = await canHostAccess(eventId, hostUser.id);
    if (!allowed) return null;
    return { type: "HOST", hostUserId: hostUser.id };
  }

  if (actorHeader === "guest") {
    const guest = await getGuestContextFromCookie(eventId);
    if (!guest || guest.status !== "APPROVED") return null;
    return { type: "GUEST", guestRequestId: guest.guestRequestId, displayName: guest.displayName };
  }

  if (allowFallback) {
    const hostUser = await getCurrentHostUser();
    if (hostUser) {
      const allowed = await canHostAccess(eventId, hostUser.id);
      if (allowed) {
        return { type: "HOST", hostUserId: hostUser.id };
      }
    }

    const guest = await getGuestContextFromCookie(eventId);
    if (guest && guest.status === "APPROVED") {
      return { type: "GUEST", guestRequestId: guest.guestRequestId, displayName: guest.displayName };
    }
  }

  return null;
}

export async function GET(request: Request, context: Params) {
  const { eventId } = await context.params;
  const actor = await resolveActorAccess(eventId, request.headers.get("x-eventrl-actor"), true);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = getSupabaseAdminClient();
  const [{ data, error }, { data: reactions }, { data: eventRow }] = await Promise.all([
    supabase
      .from("event_chat_messages")
      .select("id, sender_type, sender_name, body, created_at, reply_to_message_id, host_user_id, guest_request_id")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("event_chat_reactions")
      .select("message_id, reaction")
      .eq("event_id", eventId),
    supabase.from("events").select("interaction_mode").eq("id", eventId).single(),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actorReactions = actor.type === "HOST"
    ? await supabase
        .from("event_chat_reactions")
        .select("message_id, reaction")
        .eq("event_id", eventId)
        .eq("host_user_id", actor.hostUserId)
        .is("guest_request_id", null)
    : await supabase
        .from("event_chat_reactions")
        .select("message_id, reaction")
        .eq("event_id", eventId)
        .eq("guest_request_id", actor.guestRequestId)
        .is("host_user_id", null);

  const messages = (data ?? []).map((message) => ({
    id: message.id,
    sender_type: message.sender_type,
    sender_name: message.sender_name,
    body: message.body,
    created_at: message.created_at,
    reply_to_message_id: message.reply_to_message_id,
    can_delete:
      actor.type === "HOST"
        ? true
        : message.sender_type === "GUEST" && message.guest_request_id === actor.guestRequestId,
  }));

  return NextResponse.json({
    messages,
    reactions: reactions ?? [],
    interactionMode: eventRow?.interaction_mode ?? "RESTRICTED",
    actorReactions: actorReactions?.data ?? [],
  });
}

export async function POST(request: Request, context: Params) {
  const { eventId } = await context.params;
  const supabase = getSupabaseAdminClient();
  const actor = await resolveActorAccess(eventId, request.headers.get("x-eventrl-actor"));
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const ip = getClientIp(request);
  const actorKey = actor.type === "HOST" ? `host:${actor.hostUserId}` : `guest:${actor.guestRequestId}`;
  const rate = checkRateLimit({
    key: `chat:messages:post:${eventId}:${actorKey}:${ip}`,
    limit: 45,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    const response = NextResponse.json({ error: "Too many messages. Slow down." }, { status: 429 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const payload = (await request.json().catch(() => null)) as
    | { body?: string; replyToMessageId?: string | null }
    | null;
  const body = payload?.body?.trim() ?? "";
  const replyToMessageId = payload?.replyToMessageId?.trim() ?? "";

  if (!body) {
    return NextResponse.json({ error: "Message required." }, { status: 400 });
  }

  if (body.length > 500) {
    return NextResponse.json({ error: "Message too long." }, { status: 400 });
  }

  let replyTargetId: string | null = null;
  if (replyToMessageId) {
    const { data: replyTarget } = await supabase
      .from("event_chat_messages")
      .select("id")
      .eq("id", replyToMessageId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!replyTarget) {
      return NextResponse.json({ error: "Reply target not found." }, { status: 404 });
    }
    replyTargetId = replyTarget.id;
  }

  if (actor.type === "GUEST") {
    const { data: event } = await supabase
      .from("events")
      .select("interaction_mode")
      .eq("id", eventId)
      .single();
    if (event?.interaction_mode === "RESTRICTED") {
      return NextResponse.json(
        { error: "Open chat is off. Submit a question request instead." },
        { status: 403 },
      );
    }

    await supabase.from("event_chat_members").upsert(
      {
        event_id: eventId,
        role: "GUEST",
        guest_request_id: actor.guestRequestId,
        joined_at: new Date().toISOString(),
      },
      { onConflict: "event_id,guest_request_id" },
    );

    const { error } = await supabase.from("event_chat_messages").insert({
      event_id: eventId,
      sender_type: "GUEST",
      sender_name: actor.displayName,
      guest_request_id: actor.guestRequestId,
      reply_to_message_id: replyTargetId,
      body,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

      const response = NextResponse.json({ ok: true });
      applyRateLimitHeaders(response, rate);
      return response;
  }

  const { data: hostProfile } = await supabase
    .from("host_profiles")
    .select("display_name")
    .eq("user_id", actor.hostUserId)
    .maybeSingle();
  const hostName = hostProfile?.display_name?.trim() || "Host";

  const { error } = await supabase.from("event_chat_messages").insert({
    event_id: eventId,
    sender_type: "HOST",
    sender_name: hostName,
    host_user_id: actor.hostUserId,
    reply_to_message_id: replyTargetId,
    body,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const response = NextResponse.json({ ok: true });
  applyRateLimitHeaders(response, rate);
  return response;
}

export async function DELETE(request: Request, context: Params) {
  const { eventId } = await context.params;
  const actor = await resolveActorAccess(eventId, request.headers.get("x-eventrl-actor"));
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const ip = getClientIp(request);
  const actorKey = actor.type === "HOST" ? `host:${actor.hostUserId}` : `guest:${actor.guestRequestId}`;
  const rate = checkRateLimit({
    key: `chat:messages:delete:${eventId}:${actorKey}:${ip}`,
    limit: 20,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    const response = NextResponse.json({ error: "Too many delete requests. Slow down." }, { status: 429 });
    applyRateLimitHeaders(response, rate);
    return response;
  }

  const payload = (await request.json().catch(() => null)) as { messageId?: string } | null;
  const messageId = payload?.messageId?.trim() ?? "";
  if (!messageId) {
    return NextResponse.json({ error: "Message id required." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const baseDelete = supabase
    .from("event_chat_messages")
    .delete()
    .eq("id", messageId)
    .eq("event_id", eventId);

  const { data: deletedMessage, error } = actor.type === "HOST"
    ? await baseDelete.select("id").maybeSingle()
    : await baseDelete.eq("sender_type", "GUEST").eq("guest_request_id", actor.guestRequestId).select("id").maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!deletedMessage) {
    return NextResponse.json({ error: "Message not found or not allowed." }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  applyRateLimitHeaders(response, rate);
  return response;
}
