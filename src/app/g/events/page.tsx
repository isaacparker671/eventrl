import Link from "next/link";
import { redirect } from "next/navigation";
import AutoRefresh from "@/components/live/AutoRefresh";
import { getGuestContextsFromCookie } from "@/lib/eventrl/guestSession";

export default async function GuestEventsPage() {
  const guestEvents = await getGuestContextsFromCookie();

  if (!guestEvents.length) {
    redirect("/join");
  }

  const sorted = [...guestEvents].sort(
    (a, b) => new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime(),
  );
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <AutoRefresh intervalMs={3000} />
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="glass-card rounded-2xl p-5">
          <h1 className="text-xl font-semibold tracking-tight">My Events</h1>
          <p className="mt-1 text-sm text-neutral-600">This device only.</p>
          <form method="post" action="/api/guest/memberships/clear?next=/join" className="mt-3">
            <button type="submit" className="secondary-btn w-full py-2 text-sm">
              Start over on this device
            </button>
          </form>
        </div>

        {sorted.map((guest) => {
          const startMs = new Date(guest.event.starts_at).getTime();
          const hasEnded = startMs < now;

          return (
            <div key={guest.guestRequestId} className="glass-card rounded-2xl p-4">
              <h2 className="text-base font-semibold">{guest.event.name}</h2>
              <p className="mt-1 text-xs text-neutral-600">{new Date(guest.event.starts_at).toLocaleString()}</p>
              <p className="text-xs text-neutral-600">{guest.event.location_text}</p>
              <p className="mt-2 text-sm text-neutral-700">Status: {guest.status}</p>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  href={`/g/status?event=${guest.event.id}`}
                  className="primary-btn py-2 text-center text-sm font-medium"
                >
                  Open Status
                </Link>
                <Link
                  href={`/g/qr?event=${guest.event.id}`}
                  className="secondary-btn py-2 text-center text-sm font-medium"
                >
                  Open QR
                </Link>
              </div>

              <form method="post" action="/api/guest/memberships/leave" className="mt-3">
                <input type="hidden" name="event_id" value={guest.event.id} />
                <button
                  type="submit"
                  className={hasEnded ? "primary-btn w-full py-2 text-sm" : "secondary-btn w-full py-2 text-sm"}
                >
                  {hasEnded ? "Remove from My Events" : "Leave event"}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </main>
  );
}
