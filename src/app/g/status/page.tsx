import Link from "next/link";
import { redirect } from "next/navigation";
import AutoRefresh from "@/components/live/AutoRefresh";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";
import { randomToken, sha256Hex } from "@/lib/eventrl/security";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
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

  if (guest.status === "PENDING_PAYMENT" && guest.event.is_paid_event) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (stripeSecretKey) {
      const supabase = getSupabaseAdminClient();
      const { data: guestRow } = await supabase
        .from("guest_requests")
        .select("id, status, payment_status, stripe_checkout_session_id, events!inner(id, host_user_id)")
        .eq("id", guest.guestRequestId)
        .eq("event_id", guest.event.id)
        .maybeSingle();

      const eventRow = guestRow
        ? Array.isArray(guestRow.events)
          ? guestRow.events[0]
          : guestRow.events
        : null;

      if (guestRow?.stripe_checkout_session_id && eventRow?.host_user_id) {
        const { data: hostProfile } = await supabase
          .from("host_profiles")
          .select("stripe_account_id")
          .eq("user_id", eventRow.host_user_id)
          .maybeSingle();

        if (hostProfile?.stripe_account_id) {
          const stripeResponse = await fetch(
            `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(guestRow.stripe_checkout_session_id)}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${stripeSecretKey}`,
                "Stripe-Account": hostProfile.stripe_account_id,
              },
              cache: "no-store",
            },
          );

          const stripePayload = (await stripeResponse.json().catch(() => null)) as
            | { payment_status?: string; metadata?: { eventId?: string; guestRequestId?: string } }
            | null;

          const isPaid =
            stripeResponse.ok &&
            stripePayload?.payment_status === "paid" &&
            stripePayload?.metadata?.eventId === guest.event.id &&
            stripePayload?.metadata?.guestRequestId === guest.guestRequestId;

          if (isPaid) {
            const now = new Date().toISOString();
            const { data: existingAccess } = await supabase
              .from("guest_access")
              .select("id")
              .eq("guest_request_id", guest.guestRequestId)
              .maybeSingle();

            const tokenHash = sha256Hex(randomToken(32));

            await supabase
              .from("guest_requests")
              .update({
                status: "APPROVED",
                payment_status: "PAID",
                paid_at: now,
                approved_at: now,
                decision_at: now,
                payment_confirmed_at: now,
                rejected_at: null,
                revoked_at: null,
              })
              .eq("id", guest.guestRequestId)
              .eq("event_id", guest.event.id);

            await supabase.from("guest_access").upsert(
              {
                event_id: guest.event.id,
                guest_request_id: guest.guestRequestId,
                qr_token_hash: tokenHash,
                token_hash: tokenHash,
                issued_at: now,
                revoked_at: null,
              },
              { onConflict: "guest_request_id" },
            );

            await supabase.from("event_chat_members").upsert(
              {
                event_id: guest.event.id,
                role: "GUEST",
                guest_request_id: guest.guestRequestId,
                joined_at: now,
              },
              { onConflict: "event_id,guest_request_id" },
            );

            if (!existingAccess?.id) {
              await supabase.from("event_chat_messages").insert({
                event_id: guest.event.id,
                sender_type: "SYSTEM",
                sender_name: "Eventrl",
                body: `${guest.displayName} paid and was approved.`,
              });
            }

            redirect(`/g/status?event=${guest.event.id}`);
          }
        }
      }
    }
  }

  const statusMessage =
    guest.status === "PENDING_PAYMENT" && guest.event.is_paid_event && guest.paymentStatus !== "PAID"
      ? "Payment required. Complete checkout to unlock approval."
      : guest.status === "PENDING_PAYMENT" && guest.event.is_paid_event && guest.paymentStatus === "PAID"
        ? "Payment received. Finalizing your approval and QR."
      : guest.status === "PENDING"
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
  const needsPayment =
    (guest.status === "APPROVED" && guest.event.requires_payment && !guest.paymentConfirmedAt) ||
    (guest.status === "APPROVED" && guest.event.is_paid_event && guest.paymentStatus !== "PAID");
  const isPendingPaidCheckout =
    guest.status === "PENDING_PAYMENT" && guest.event.is_paid_event && guest.paymentStatus !== "PAID";
  const shouldPoll = guest.status !== "APPROVED" && guest.status !== "REJECTED";
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
      <AutoRefresh intervalMs={5000} enabled={shouldPoll} />
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
              <div className="mt-2 rounded-lg border border-orange-200 bg-white/80 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-orange-800">{guest.event.payment_instructions}</p>
              </div>
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
        ) : isPendingPaidCheckout ? (
          <form method="post" action="/api/stripe/checkout" className="mt-5">
            <input type="hidden" name="event" value={guest.event.id} />
            <input type="hidden" name="guestRequest" value={guest.guestRequestId} />
            <input type="hidden" name="slug" value={guest.event.invite_slug} />
            <button className="primary-btn block w-full py-3 text-center text-sm font-medium" type="submit">
              Pay & Join
            </button>
          </form>
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
