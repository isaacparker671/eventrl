import { NextResponse } from "next/server";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type GuestEventStatus = "ARRIVING" | "RUNNING_LATE" | "CANT_MAKE";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | { status?: GuestEventStatus; eventId?: string }
    | null;
  const eventId = payload?.eventId?.trim() ?? "";
  const guest = eventId ? await getGuestContextFromCookie(eventId) : null;
  if (!guest || guest.status !== "APPROVED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const status = payload?.status;
  if (status !== "ARRIVING" && status !== "RUNNING_LATE" && status !== "CANT_MAKE") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("guest_requests")
    .update({
      guest_event_status: status,
      guest_event_status_at: new Date().toISOString(),
    })
    .eq("id", guest.guestRequestId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("event_chat_messages").insert({
    event_id: guest.event.id,
    sender_type: "SYSTEM",
    sender_name: "Eventrl",
    body: `${guest.displayName} marked status: ${status.replace("_", " ").toLowerCase()}.`,
  });

  return NextResponse.json({ ok: true });
}
