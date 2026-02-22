import { NextResponse } from "next/server";
import { resolveChatActor } from "@/lib/eventrl/chatAuth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const actor = await resolveChatActor(eventId, request.headers.get("x-eventrl-actor"));
  if (!actor || actor.type !== "HOST") {
    return NextResponse.json({ error: "Host only." }, { status: 403 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("event_question_requests")
    .select("id, guest_request_id, body, status, created_at")
    .eq("event_id", eventId)
    .eq("status", "PENDING")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ questions: data ?? [] });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const actor = await resolveChatActor(eventId, request.headers.get("x-eventrl-actor"));
  if (!actor || actor.type !== "GUEST") {
    return NextResponse.json({ error: "Guest only." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { body?: string } | null;
  const body = payload?.body?.trim() ?? "";
  if (!body) return NextResponse.json({ error: "Question required." }, { status: 400 });

  const supabase = getSupabaseAdminClient();
  const { data: eventRow } = await supabase
    .from("events")
    .select("interaction_mode")
    .eq("id", eventId)
    .single();
  if (eventRow?.interaction_mode !== "RESTRICTED") {
    return NextResponse.json({ error: "Question requests are only available in restricted chat." }, { status: 400 });
  }

  const { error } = await supabase.from("event_question_requests").insert({
    event_id: eventId,
    guest_request_id: actor.guestRequestId,
    body,
    status: "PENDING",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
