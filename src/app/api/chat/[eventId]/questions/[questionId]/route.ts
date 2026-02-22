import { NextResponse } from "next/server";
import { resolveChatActor } from "@/lib/eventrl/chatAuth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type Action = "APPROVE" | "REJECT";

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; questionId: string }> },
) {
  const { eventId, questionId } = await context.params;
  const actor = await resolveChatActor(eventId, request.headers.get("x-eventrl-actor"));
  if (!actor || actor.type !== "HOST") {
    return NextResponse.json({ error: "Host only." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { action?: Action } | null;
  const action = payload?.action;
  if (action !== "APPROVE" && action !== "REJECT") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: question, error: questionError } = await supabase
    .from("event_question_requests")
    .select("id, body, guest_request_id, status")
    .eq("id", questionId)
    .eq("event_id", eventId)
    .single();

  if (questionError || !question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  if (action === "REJECT") {
    const { error } = await supabase
      .from("event_question_requests")
      .update({ status: "REJECTED", reviewed_at: new Date().toISOString() })
      .eq("id", questionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: guestRow } = await supabase
    .from("guest_requests")
    .select("display_name")
    .eq("id", question.guest_request_id)
    .single();
  const guestName = guestRow?.display_name;
  const { data: messageInsert, error: messageError } = await supabase
    .from("event_chat_messages")
    .insert({
      event_id: eventId,
      sender_type: "GUEST",
      sender_name: guestName || "Guest",
      guest_request_id: question.guest_request_id,
      body: question.body,
    })
    .select("id")
    .single();
  if (messageError || !messageInsert) {
    return NextResponse.json({ error: messageError?.message ?? "Failed to post question." }, { status: 500 });
  }

  const { error } = await supabase
    .from("event_question_requests")
    .update({
      status: "APPROVED",
      reviewed_at: new Date().toISOString(),
      approved_message_id: messageInsert.id,
    })
    .eq("id", questionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
