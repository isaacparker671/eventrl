import Link from "next/link";
import { requireHost } from "@/lib/auth/requireHost";
import { redirectIfScannerOnly } from "@/lib/auth/eventAccess";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import AutoRefresh from "@/components/live/AutoRefresh";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type DashboardProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function HostDashboardPage({ searchParams }: DashboardProps) {
  const hostUser = await requireHost();
  await redirectIfScannerOnly(hostUser);
  const params = await searchParams;
  const supabase = getSupabaseAdminClient();
  const hostProfile = await ensureHostProfile(hostUser);
  const proAccess = hasProAccess(hostProfile);

  const { data: events } = await supabase
    .from("events")
    .select("id, name, starts_at, location_text, invite_slug, is_paid_event, price_cents")
    .eq("host_user_id", hostUser.id)
    .order("starts_at", { ascending: true });

  const eventIds = (events ?? []).map((event) => event.id);
  const paidEventPriceById = new Map<string, number>();
  const paidStatsByEvent = new Map<string, { paidCount: number; totalCollectedCents: number }>();
  const checkedInByEvent = new Map<string, number>();
  let totalCollectedAllEventsCents = 0;
  let totalPaidGuestsAllEvents = 0;
  let totalCollected30DayCents = 0;
  const thirtyDaysAgoDate = new Date();
  thirtyDaysAgoDate.setUTCDate(thirtyDaysAgoDate.getUTCDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgoDate.toISOString();
  if (proAccess && eventIds.length) {
    const [{ data: paidRows }, { data: checkins }] = await Promise.all([
      supabase
      .from("guest_requests")
      .select("event_id, status, payment_status, payment_confirmed_at, paid_at")
      .in("event_id", eventIds),
      supabase
        .from("checkins")
        .select("event_id")
        .in("event_id", eventIds),
    ]);

    for (const event of events ?? []) {
      paidStatsByEvent.set(event.id, { paidCount: 0, totalCollectedCents: 0 });
      if (event.is_paid_event && event.price_cents) {
        paidEventPriceById.set(event.id, event.price_cents);
      }
    }

    for (const row of paidRows ?? []) {
      if (row.status !== "APPROVED" || (row.payment_status !== "PAID" && !row.payment_confirmed_at)) {
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
      totalPaidGuestsAllEvents += 1;
      totalCollectedAllEventsCents += eventPrice;
      if (row.paid_at && row.paid_at >= thirtyDaysAgoIso) {
        totalCollected30DayCents += eventPrice;
      }
    }

    for (const row of checkins ?? []) {
      checkedInByEvent.set(row.event_id, (checkedInByEvent.get(row.event_id) ?? 0) + 1);
    }
  }

  const hostDisplayName = hostProfile.display_name || "Host";

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <AutoRefresh intervalMs={2500} />
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
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-700">Date & time</p>
              <input
                name="starts_at"
                type="datetime-local"
                required
                className="input-field h-11 text-sm"
              />
            </div>
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
              <input
                name="paid_entry"
                type="checkbox"
                className="h-4 w-4 accent-orange-600"
              />
              Paid Entry
            </label>
            {proAccess ? (
              <input
                name="price_dollars"
                type="number"
                min="1"
                step="0.01"
                placeholder="Entry price in USD (optional)"
                className="input-field text-sm"
              />
            ) : (
              <p className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-xs text-neutral-500">
                Stripe checkout pricing is Pro-only. Free hosts can require payment with their own links.
              </p>
            )}
            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-700">Payment options / special instructions</p>
              <textarea
                name="payment_instructions"
                placeholder="Example: Pay via Cash App $yourname, include your full name in payment note, arrive by 8:30 PM."
                rows={4}
                className="input-field text-sm"
              />
              <p className="text-xs text-neutral-500">This is shown to guests on the invite and status screens.</p>
            </div>
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
          {proAccess ? (
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2">
                <p className="text-xs text-neutral-500">Total collected</p>
                <p className="text-sm font-semibold text-orange-700">${(totalCollectedAllEventsCents / 100).toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2">
                <p className="text-xs text-neutral-500">Paid guests</p>
                <p className="text-sm font-semibold text-orange-700">{totalPaidGuestsAllEvents}</p>
              </div>
              <div className="col-span-2 rounded-lg border border-neutral-200 bg-white/90 px-3 py-2">
                <p className="text-xs text-neutral-500">Last 30 days</p>
                <p className="text-sm font-semibold text-orange-700">${(totalCollected30DayCents / 100).toFixed(2)}</p>
              </div>
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-neutral-200 bg-white/90 px-3 py-2">
              <p className="text-xs font-medium text-neutral-700">Pro feature locked</p>
              <p className="mt-1 text-xs text-neutral-500">
                Upgrade to Pro to unlock live check-in counters and revenue dashboard totals.
              </p>
            </div>
          )}
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
                  {proAccess ? (
                    <p className="mt-1 text-xs text-neutral-600">
                      Checked-in: {checkedInByEvent.get(event.id) ?? 0}
                    </p>
                  ) : null}
                  {proAccess ? (
                    <p className="mt-1 text-xs text-orange-700">
                      Event revenue: ${((paidStatsByEvent.get(event.id)?.totalCollectedCents ?? 0) / 100).toFixed(2)}
                      {event.is_paid_event ? ` · Paid guests: ${paidStatsByEvent.get(event.id)?.paidCount ?? 0}` : ""}
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
