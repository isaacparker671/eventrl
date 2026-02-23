import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { requireEventAccess } from "@/lib/auth/eventAccess";
import { hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await context.params;
  const access = await requireEventAccess(eventId, hostUser).catch(() => null);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseAdminClient();
  const [{ data: event }, { data: ownerProfile }, { count: checkedInCount }, { count: approvedCount }] = await Promise.all([
    supabase.from("events").select("id, capacity, host_user_id").eq("id", eventId).maybeSingle(),
    supabase.from("host_profiles").select("subscription_status").eq("user_id", access.ownerHostUserId).maybeSingle(),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    supabase.from("guest_requests").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "APPROVED"),
  ]);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!ownerProfile || !hasProAccess(ownerProfile)) {
    return NextResponse.json({ error: "Pro required" }, { status: 403 });
  }

  const checkedIn = checkedInCount ?? 0;
  const approved = approvedCount ?? 0;
  const remainingCapacity =
    typeof event.capacity === "number" ? Math.max(event.capacity - checkedIn, 0) : null;

  return NextResponse.json({ checkedIn, approved, remainingCapacity });
}
