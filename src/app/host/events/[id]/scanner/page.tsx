import { notFound } from "next/navigation";
import { requireHost } from "@/lib/auth/requireHost";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import ScannerClient from "./ScannerClient";

type ScannerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function HostScannerPage({ params }: ScannerPageProps) {
  const hostUser = await requireHost();
  const { id } = await params;
  const supabase = getSupabaseAdminClient();

  const [{ data: event, error: eventError }, { count: checkedInCount }, { count: approvedCount }] = await Promise.all([
    supabase
      .from("events")
      .select("id, host_user_id, name, capacity")
      .eq("id", id)
      .eq("host_user_id", hostUser.id)
      .single(),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("event_id", id),
    supabase
      .from("guest_requests")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("status", "APPROVED"),
  ]);

  if (eventError || !event || event.host_user_id !== hostUser.id) {
    notFound();
  }

  const checkedIn = checkedInCount ?? 0;
  const approved = approvedCount ?? 0;
  const remainingCapacity =
    typeof event.capacity === "number" ? Math.max(event.capacity - checkedIn, 0) : null;

  return (
    <ScannerClient
      eventId={event.id}
      eventName={event.name}
      initialCheckedIn={checkedIn}
      initialApproved={approved}
      initialRemainingCapacity={remainingCapacity}
    />
  );
}
