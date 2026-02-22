import "server-only";

import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type ChatActor =
  | { type: "HOST"; eventId: string; hostUserId: string }
  | { type: "GUEST"; eventId: string; guestRequestId: string; displayName: string }
  | null;

export async function resolveChatActor(eventId: string, actorHeader: string | null): Promise<ChatActor> {
  const supabase = getSupabaseAdminClient();

  if (actorHeader === "host") {
    const hostUser = await getCurrentHostUser();
    if (!hostUser) return null;
    const { data } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .eq("host_user_id", hostUser.id)
      .single();
    if (!data) return null;
    return { type: "HOST", eventId, hostUserId: hostUser.id };
  }

  if (actorHeader === "guest") {
    const guest = await getGuestContextFromCookie(eventId);
    if (!guest || guest.status !== "APPROVED") return null;
    return {
      type: "GUEST",
      eventId,
      guestRequestId: guest.guestRequestId,
      displayName: guest.displayName,
    };
  }

  return null;
}
