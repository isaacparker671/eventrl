import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type EventAccess =
  | { role: "OWNER"; eventId: string; eventName: string; ownerHostUserId: string }
  | { role: "SCANNER"; eventId: string; eventName: string; ownerHostUserId: string; scannerEmail: string };

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

  const email = user.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }

  const { data: scannerRole } = await supabase
    .from("event_scanner_roles")
    .select("id")
    .eq("event_id", eventId)
    .eq("scanner_email", email)
    .eq("status", "ACTIVE")
    .is("revoked_at", null)
    .maybeSingle();

  if (!scannerRole) {
    return null;
  }

  return {
    role: "SCANNER",
    eventId: event.id,
    eventName: event.name,
    ownerHostUserId: event.host_user_id,
    scannerEmail: email,
  };
}

export async function requireEventAccess(eventId: string, user: User): Promise<EventAccess> {
  const access = await getEventAccess(eventId, user);
  if (!access) {
    throw new Error("Event access denied.");
  }
  return access;
}

export async function getScannerOnlyRedirect(user: User): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const { data: ownedEvent } = await supabase
    .from("events")
    .select("id")
    .eq("host_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (ownedEvent?.id) {
    return null;
  }

  const email = user.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }

  const { data: scannerRole } = await supabase
    .from("event_scanner_roles")
    .select("event_id")
    .eq("scanner_email", email)
    .eq("status", "ACTIVE")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!scannerRole?.event_id) {
    return null;
  }

  return `/host/events/${scannerRole.event_id}/scanner`;
}

export async function redirectIfScannerOnly(user: User) {
  const target = await getScannerOnlyRedirect(user);
  if (target) {
    redirect(target);
  }
}

