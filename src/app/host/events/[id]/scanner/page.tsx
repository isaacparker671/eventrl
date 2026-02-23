import { notFound } from "next/navigation";
import { requireHost } from "@/lib/auth/requireHost";
import { requireEventAccess } from "@/lib/auth/eventAccess";
import { hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import ScannerClient from "./ScannerClient";

type ScannerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function HostScannerPage({ params }: ScannerPageProps) {
  const hostUser = await requireHost();
  const { id } = await params;
  const access = await requireEventAccess(id, hostUser).catch(() => null);
  if (!access) {
    notFound();
  }
  const supabase = getSupabaseAdminClient();

  const [{ data: event, error: eventError }, { data: ownerProfile }] = await Promise.all([
    supabase
      .from("events")
      .select("id, host_user_id, name, capacity")
      .eq("id", id)
      .single(),
    supabase.from("host_profiles").select("subscription_status").eq("user_id", access.ownerHostUserId).maybeSingle(),
  ]);

  if (eventError || !event) {
    notFound();
  }

  const showLiveCounters = Boolean(ownerProfile && hasProAccess(ownerProfile));
  let checkedIn = 0;
  let approved = 0;
  if (showLiveCounters) {
    const [{ count: checkedInCount }, { count: approvedCount }] = await Promise.all([
      supabase.from("checkins").select("id", { count: "exact", head: true }).eq("event_id", id),
      supabase
        .from("guest_requests")
        .select("id", { count: "exact", head: true })
        .eq("event_id", id)
        .eq("status", "APPROVED"),
    ]);
    checkedIn = checkedInCount ?? 0;
    approved = approvedCount ?? 0;
  }
  const remainingCapacity =
    showLiveCounters && typeof event.capacity === "number" ? Math.max(event.capacity - checkedIn, 0) : null;

  return (
    <ScannerClient
      eventId={event.id}
      eventName={event.name}
      initialCheckedIn={checkedIn}
      initialApproved={approved}
      initialRemainingCapacity={remainingCapacity}
      isScannerRole={access.role === "SCANNER"}
      showLiveCounters={showLiveCounters}
    />
  );
}
