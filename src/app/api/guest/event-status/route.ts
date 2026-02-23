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
  if (!guest || (guest.status !== "APPROVED" && guest.status !== "CANT_MAKE")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const status = payload?.status;
  if (status !== "ARRIVING" && status !== "RUNNING_LATE" && status !== "CANT_MAKE") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const updatePayload: Record<string, string | null> = {
    guest_event_status: status,
    guest_event_status_at: now,
  };

  if (status === "CANT_MAKE") {
    updatePayload.status = "CANT_MAKE";
    updatePayload.revoked_at = now;
  } else if (guest.status === "CANT_MAKE") {
    updatePayload.status = "APPROVED";
    updatePayload.revoked_at = null;
  }

  const { error } = await supabase
    .from("guest_requests")
    .update(updatePayload)
    .eq("id", guest.guestRequestId)
    .eq("event_id", guest.event.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === "CANT_MAKE") {
    await supabase
      .from("guest_access")
      .update({ revoked_at: now })
      .eq("event_id", guest.event.id)
      .eq("guest_request_id", guest.guestRequestId);

    await supabase
      .from("event_chat_members")
      .delete()
      .eq("event_id", guest.event.id)
      .eq("guest_request_id", guest.guestRequestId);
  } else if (guest.status === "CANT_MAKE") {
    await supabase
      .from("guest_access")
      .update({ revoked_at: null })
      .eq("event_id", guest.event.id)
      .eq("guest_request_id", guest.guestRequestId);

    await supabase.from("event_chat_members").upsert(
      {
        event_id: guest.event.id,
        role: "GUEST",
        guest_request_id: guest.guestRequestId,
        joined_at: now,
      },
      { onConflict: "event_id,guest_request_id" },
    );
  }

  await supabase.from("event_chat_messages").insert({
    event_id: guest.event.id,
    sender_type: "SYSTEM",
    sender_name: "Eventrl",
    body:
      status === "CANT_MAKE"
        ? `${guest.displayName} can’t make it and left the event.`
        : guest.status === "CANT_MAKE"
          ? `${guest.displayName} changed status and rejoined the event.`
        : `${guest.displayName} marked status: ${status.replace("_", " ").toLowerCase()}.`,
  });

  return NextResponse.json({ ok: true });
}
