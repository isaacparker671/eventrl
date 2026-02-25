import { notFound, redirect } from "next/navigation";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getEventAccess } from "@/lib/auth/eventAccess";
import { hasScannerSessionForEvent } from "@/lib/eventrl/scannerSession";
import { hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import ScannerClient from "./ScannerClient";

type ScannerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function HostScannerPage({ params }: ScannerPageProps) {
  const { id } = await params;
  const supabase = getSupabaseAdminClient();
  const hostUser = await getCurrentHostUser();
  const hostAccess = hostUser ? await getEventAccess(id, hostUser) : null;
  const scannerSessionAllowed = hostAccess ? false : await hasScannerSessionForEvent(id);
  if (!hostAccess && !scannerSessionAllowed) {
    redirect(`/scan/${id}`);
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, host_user_id, name, capacity")
    .eq("id", id)
    .single();

  if (eventError || !event) {
    notFound();
  }

  const { data: ownerProfile } = await supabase
    .from("host_profiles")
    .select("subscription_status")
    .eq("user_id", hostAccess ? hostAccess.ownerHostUserId : event.host_user_id)
    .maybeSingle();

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
      isScannerRole={!hostAccess}
      showLiveCounters={showLiveCounters}
    />
  );
}
