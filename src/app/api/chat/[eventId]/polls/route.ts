import { NextResponse } from "next/server";
import { resolveChatActor } from "@/lib/eventrl/chatAuth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const actor = await resolveChatActor(eventId, request.headers.get("x-eventrl-actor"));
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = getSupabaseAdminClient();
  const [{ data: polls }, { data: votes }] = await Promise.all([
    supabase
      .from("event_polls")
      .select("id, question, created_at, closed_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("event_poll_votes")
      .select("poll_id, vote, guest_request_id")
      .eq("event_id", eventId),
  ]);

  return NextResponse.json({
    polls: polls ?? [],
    votes: votes ?? [],
    actorGuestRequestId: actor.type === "GUEST" ? actor.guestRequestId : null,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const actor = await resolveChatActor(eventId, request.headers.get("x-eventrl-actor"));
  if (!actor || actor.type !== "HOST") {
    return NextResponse.json({ error: "Host only." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { question?: string } | null;
  const question = payload?.question?.trim() ?? "";
  if (!question) {
    return NextResponse.json({ error: "Question required." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("event_polls").insert({
    event_id: eventId,
    question,
    created_by_host_user_id: actor.hostUserId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("event_chat_messages").insert({
    event_id: eventId,
    sender_type: "SYSTEM",
    sender_name: "Eventrl",
    body: `New poll: ${question} (Yes/No)`,
  });

  return NextResponse.json({ ok: true });
}

