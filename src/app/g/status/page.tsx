import Link from "next/link";
import { redirect } from "next/navigation";
import AutoRefresh from "@/components/live/AutoRefresh";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";
import GuestEventStatusButtons from "./GuestEventStatusButtons";

type GuestStatusPageProps = {
  searchParams: Promise<{ event?: string }>;
};

export default async function GuestStatusPage({ searchParams }: GuestStatusPageProps) {
  const { event } = await searchParams;
  const eventId = typeof event === "string" ? event : "";

  if (!eventId) {
    redirect("/g/events");
  }

  const guest = await getGuestContextFromCookie(eventId);

  if (!guest) {
    redirect("/join");
  }

  const statusMessage =
    guest.status === "PENDING"
      ? "Your request is pending host approval."
      : guest.status === "WAITLIST"
        ? "You are currently on the waitlist."
        : guest.status === "APPROVED"
          ? "You are approved. Open your QR at entry."
          : guest.status === "REJECTED"
            ? "Your request was rejected."
            : guest.status === "LEFT"
              ? "You were marked as left by the host."
              : guest.status === "CANT_MAKE"
                ? "You were marked as unable to attend."
                : "Your access was revoked.";
  const needsPayment = guest.status === "APPROVED" && guest.event.requires_payment && !guest.paymentConfirmedAt;
  const paymentLinks = [
    { label: "Cash App", url: guest.event.host?.cash_app_url },
    { label: "PayPal", url: guest.event.host?.paypal_url },
    { label: "Venmo", url: guest.event.host?.venmo_url },
    { label: "Zelle", url: guest.event.host?.zelle_url },
    { label: "Google Pay", url: guest.event.host?.google_pay_url },
    { label: "Apple Pay", url: guest.event.host?.apple_pay_url },
  ].filter((link) => Boolean(link.url));

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <AutoRefresh intervalMs={2000} />
      <div className="glass-card fade-in mx-auto w-full max-w-md rounded-2xl p-5">
        <h1 className="text-xl font-semibold tracking-tight">{guest.event.name}</h1>
        <p className="mt-1 text-sm text-neutral-600">{guest.displayName}</p>
        <p className="mt-1 text-sm text-neutral-600">{new Date(guest.event.starts_at).toLocaleString()}</p>
        <p className="text-sm text-neutral-600">{guest.event.location_text}</p>

        <div className="mt-5 rounded-xl border border-neutral-200 bg-white/90 px-3 py-3">
          <p className="text-xs text-neutral-500">Status</p>
          <p className="mt-1 text-sm font-medium">{guest.status}</p>
          <p className="mt-1 text-sm text-neutral-600">{statusMessage}</p>
        </div>

        {guest.status === "APPROVED" && guest.event.requires_payment ? (
          <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/80 px-3 py-3">
            <p className="text-xs text-orange-700">Hosted by {guest.event.host?.display_name ?? "Host"}.</p>
            {guest.event.payment_instructions ? (
              <p className="mt-1 text-xs text-orange-700">{guest.event.payment_instructions}</p>
            ) : null}
            {paymentLinks.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {paymentLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.url!}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-btn px-2 py-1 text-xs"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-orange-700">No payment links configured yet.</p>
            )}
            <p className="mt-2 text-xs text-orange-700">
              {guest.paymentConfirmedAt
                ? "Payment confirmed by host."
                : "After paying, wait for host to confirm payment."}
            </p>
          </div>
        ) : null}

        {guest.status === "APPROVED" ? (
          <div className="mt-5 space-y-2">
            {needsPayment ? (
              <button className="primary-btn block w-full py-3 text-center text-sm font-medium opacity-60" disabled>
                QR locked until payment confirmed
              </button>
            ) : (
              <Link
                href={`/g/qr?event=${guest.event.id}`}
                className="primary-btn block w-full py-3 text-center text-sm font-medium"
              >
                Open My QR
              </Link>
            )}
            <Link href={`/g/chat?event=${guest.event.id}`} className="secondary-btn block w-full py-3 text-center text-sm font-medium">
              Open Group Chat
            </Link>
            <GuestEventStatusButtons eventId={guest.event.id} currentStatus={guest.guestEventStatus} />
          </div>
        ) : (
          <Link
            href={`/g/status?event=${guest.event.id}`}
            className="primary-btn mt-5 block w-full py-3 text-center text-sm font-medium"
          >
            Refresh Status
          </Link>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2">
          <Link href="/g/events" className="link-btn w-full">
            My events
          </Link>
          <Link href={`/g/recovery?event=${guest.event.id}`} className="link-btn w-full">
            View recovery code
          </Link>
          <form method="post" action="/api/guest/memberships/clear?next=/join">
            <button type="submit" className="secondary-btn w-full">
              Not you? Start over
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
