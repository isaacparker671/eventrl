import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type EventAccess =
  | { role: "OWNER"; eventId: string; eventName: string; ownerHostUserId: string };

export async function getEventAccess(eventId: string, user: User): Promise<EventAccess | null> {
  const supabase = getSupabaseAdminClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name, host_user_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return null;
  }

  if (event.host_user_id === user.id) {
    return {
      role: "OWNER",
      eventId: event.id,
      eventName: event.name,
      ownerHostUserId: event.host_user_id,
    };
  }

  return null;
}

export async function requireEventAccess(eventId: string, user: User): Promise<EventAccess> {
  const access = await getEventAccess(eventId, user);
  if (!access) {
    throw new Error("Event access denied.");
  }
  return access;
}

export async function getScannerOnlyRedirect(user: User): Promise<string | null> {
  void user;
  return null;
}

export async function redirectIfScannerOnly(user: User) {
  const target = await getScannerOnlyRedirect(user);
  if (target) {
    redirect(target);
  }
}
