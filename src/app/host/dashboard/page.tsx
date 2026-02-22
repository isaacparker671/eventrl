import Link from "next/link";
import { requireHost } from "@/lib/auth/requireHost";
import { ensureHostProfile } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type DashboardProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function HostDashboardPage({ searchParams }: DashboardProps) {
  const hostUser = await requireHost();
  const params = await searchParams;
  const supabase = getSupabaseAdminClient();
  const hostProfile = await ensureHostProfile(hostUser);

  const { data: events } = await supabase
    .from("events")
    .select("id, name, starts_at, location_text, invite_slug, is_paid_event, price_cents")
    .eq("host_user_id", hostUser.id)
    .order("starts_at", { ascending: true });

  const eventIds = (events ?? []).map((event) => event.id);
  const paidEventPriceById = new Map<string, number>();
  const paidStatsByEvent = new Map<string, { paidCount: number; totalCollectedCents: number }>();
  if (eventIds.length) {
    const { data: paidRows } = await supabase
      .from("guest_requests")
      .select("event_id, status, payment_confirmed_at")
      .in("event_id", eventIds);

    for (const event of events ?? []) {
      paidStatsByEvent.set(event.id, { paidCount: 0, totalCollectedCents: 0 });
      if (event.is_paid_event && event.price_cents) {
        paidEventPriceById.set(event.id, event.price_cents);
      }
    }

    for (const row of paidRows ?? []) {
      if (row.status !== "APPROVED" || !row.payment_confirmed_at) {
        continue;
      }
      const eventPrice = paidEventPriceById.get(row.event_id);
      if (!eventPrice) {
        continue;
      }
      const current = paidStatsByEvent.get(row.event_id);
      if (!current) {
        continue;
      }
      current.paidCount += 1;
      current.totalCollectedCents += eventPrice;
      paidStatsByEvent.set(row.event_id, current);
    }
  }

  const hostDisplayName = hostProfile.display_name || "Host";

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="glass-card fade-in rounded-2xl p-5">
          <h1 className="text-xl font-semibold tracking-tight">Host Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">{hostDisplayName}</p>

          <Link href="/host/settings" className="secondary-btn mt-2 inline-flex w-full">
            Profile & payment settings
          </Link>

          <form method="post" action="/api/host/logout" className="mt-3">
            <button
              className="secondary-btn w-full"
              type="submit"
            >
              Sign out
            </button>
          </form>

          {params.error ? <p className="mt-3 text-sm text-red-600">{params.error}</p> : null}
        </div>

        <section className="glass-card fade-in rounded-2xl p-5">
          <h2 className="text-base font-semibold">Create Event</h2>
          <form method="post" action="/api/host/events" className="mt-4 space-y-3">
            <input
              name="name"
              placeholder="Event name"
              required
              className="input-field text-sm"
            />
            <input
              name="starts_at"
              type="datetime-local"
              required
              className="input-field text-sm"
            />
            <input
              name="location_text"
              placeholder="Location"
              required
              className="input-field text-sm"
            />
            <input
              name="capacity"
              type="number"
              min={1}
              placeholder="Capacity (optional)"
              className="input-field text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input name="allow_plus_one" type="checkbox" className="h-4 w-4 accent-orange-600" />
              Allow plus one
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input name="requires_payment" type="checkbox" className="h-4 w-4 accent-orange-600" />
              Require payment before entry
            </label>
            <textarea
              name="payment_instructions"
              placeholder="Payment instructions (optional)"
              rows={3}
              className="input-field text-sm"
            />
            <select
              name="interaction_mode"
              defaultValue="OPEN_CHAT"
              className="input-field text-sm"
            >
              <option value="OPEN_CHAT">Open chat</option>
              <option value="RESTRICTED">Restricted</option>
            </select>

            <button
              className="primary-btn w-full py-3 text-sm font-medium"
              type="submit"
            >
              Create Event
            </button>
          </form>
        </section>

        <section className="glass-card fade-in rounded-2xl p-5">
          <h2 className="text-base font-semibold">Your Events</h2>
          <div className="mt-3 space-y-3">
            {events?.length ? (
              events.map((event) => (
                <Link
                  key={event.id}
                  href={`/host/events/${event.id}`}
                  className="block rounded-xl border border-neutral-200 px-3 py-3 hover:border-orange-200 hover:bg-orange-50/40 transition-colors"
                >
                  <p className="text-sm font-medium">{event.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {new Date(event.starts_at).toLocaleString()} · {event.location_text}
                  </p>
                  {event.is_paid_event ? (
                    <p className="mt-1 text-xs text-orange-700">
                      Paid: {paidStatsByEvent.get(event.id)?.paidCount ?? 0} · Collected: $
                      {((paidStatsByEvent.get(event.id)?.totalCollectedCents ?? 0) / 100).toFixed(2)}
                    </p>
                  ) : null}
                </Link>
              ))
            ) : (
              <p className="text-sm text-neutral-500">No events yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
