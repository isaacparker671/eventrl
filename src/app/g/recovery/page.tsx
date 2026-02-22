import Link from "next/link";
import { redirect } from "next/navigation";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type GuestRecoveryPageProps = {
  searchParams: Promise<{ event?: string }>;
};

export default async function GuestRecoveryPage({ searchParams }: GuestRecoveryPageProps) {
  const { event } = await searchParams;
  const eventId = typeof event === "string" ? event : "";

  if (!eventId) {
    redirect("/g/events");
  }

  const guest = await getGuestContextFromCookie(eventId);
  if (!guest) {
    redirect("/join");
  }

  const supabase = getSupabaseAdminClient();
  const { data: guestRow } = await supabase
    .from("guest_requests")
    .select("recovery_code")
    .eq("id", guest.guestRequestId)
    .eq("event_id", guest.event.id)
    .maybeSingle();

  if (!guestRow?.recovery_code) {
    redirect(`/g/status?event=${guest.event.id}`);
  }

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="glass-card fade-in mx-auto w-full max-w-md rounded-2xl p-5 text-center">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Save This Recovery Code</p>
        <h1 className="mt-2 text-lg font-semibold">Screenshot this code in case you get logged out.</h1>
        <p className="mt-2 text-sm text-neutral-600">Use this same invite link + this code to get back into this event.</p>

        <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-4">
          <p className="text-4xl font-bold tracking-[0.3em] text-orange-700">{guestRow.recovery_code}</p>
        </div>

        <Link href={`/g/status?event=${guest.event.id}`} className="primary-btn mt-5 block w-full py-3 text-sm font-medium">
          I Saved It
        </Link>
      </div>
    </main>
  );
}
