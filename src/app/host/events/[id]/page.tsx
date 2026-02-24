import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/lib/auth/requireHost";
import AutoRefresh from "@/components/live/AutoRefresh";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import InviteLinkCard from "./InviteLinkCard";
import DeleteEventForm from "./DeleteEventForm";

type EventPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; scannerCode?: string; scannerInvite?: string }>;
};

export default async function HostEventPage({ params, searchParams }: EventPageProps) {
  const hostUser = await requireHost();
  const hostProfile = await ensureHostProfile(hostUser);
  const proAccess = hasProAccess(hostProfile);
  const { id } = await params;
  const query = await searchParams;
  const supabase = getSupabaseAdminClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select(
      "id, host_user_id, name, starts_at, location_text, capacity, allow_plus_one, payment_instructions, requires_payment, is_paid_event, price_cents, interaction_mode, invite_slug, scanner_access_code",
    )
    .eq("id", id)
    .eq("host_user_id", hostUser.id)
    .single();

  if (eventError || !event || event.host_user_id !== hostUser.id) {
    notFound();
  }

  const [{ data: guests }, { count: checkedInCount }] = await Promise.all([
    supabase
      .from("guest_requests")
      .select("id, display_name, guest_email, status, payment_status, guest_event_status, payment_confirmed_at, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("event_id", id),
  ]);

  const stats = {
    totalApproved: guests?.filter((g) => g.status === "APPROVED").length ?? 0,
    pending: guests?.filter((g) => g.status === "PENDING").length ?? 0,
    pendingPayment: guests?.filter((g) => g.status === "PENDING_PAYMENT").length ?? 0,
    paidCount: guests?.filter((g) => g.payment_status === "PAID").length ?? 0,
    rejected: guests?.filter((g) => g.status === "REJECTED").length ?? 0,
    left: guests?.filter((g) => g.status === "LEFT").length ?? 0,
    cantMake: guests?.filter((g) => g.status === "CANT_MAKE").length ?? 0,
    guestReportedCantMake: guests?.filter((g) => g.guest_event_status === "CANT_MAKE").length ?? 0,
    guestReportedArriving: guests?.filter((g) => g.guest_event_status === "ARRIVING").length ?? 0,
    guestReportedRunningLate: guests?.filter((g) => g.guest_event_status === "RUNNING_LATE").length ?? 0,
    checkedIn: checkedInCount ?? 0,
  };
  const remainingCapacity =
    typeof event.capacity === "number" ? Math.max(event.capacity - stats.checkedIn, 0) : null;
  const totalCollected =
    typeof event.price_cents === "number" ? ((event.price_cents * stats.paidCount) / 100).toFixed(2) : null;
  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <AutoRefresh intervalMs={2000} />
      <div className="mx-auto w-full max-w-md space-y-6">
        <section className="glass-card fade-in rounded-2xl p-5">
          <Link href="/host/dashboard" className="link-btn">
            Back
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{event.name}</h1>
          <p className="mt-1 text-sm text-neutral-600">{new Date(event.starts_at).toLocaleString()}</p>
          <p className="text-sm text-neutral-600">{event.location_text}</p>
          <p className="mt-2 text-xs text-neutral-500">Mode: {event.interaction_mode}</p>
          <p className="mt-2 text-xs text-neutral-500">Payment required: {event.requires_payment ? "Yes" : "No"}</p>
          {event.requires_payment && event.payment_instructions ? (
            <div className="mt-2 rounded-xl border border-neutral-200 bg-white/90 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{event.payment_instructions}</p>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-neutral-500">Allow plus one: {event.allow_plus_one ? "Yes" : "No"}</p>
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white/90 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Quick Actions</p>
            <div className="mt-2">
              <InviteLinkCard invitePath={`/i/${event.invite_slug}`} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href={`/host/events/${event.id}/scanner`}
                className="primary-btn col-span-2 px-4 py-3 text-center text-sm font-medium"
              >
                Open Scanner
              </Link>
              <Link
                href={`/host/events/${event.id}/chat`}
                className="secondary-btn w-full px-4 py-3 text-center text-sm font-medium"
              >
                Open Chat
              </Link>
              <Link
                href={`/host/events/${event.id}/edit`}
                className="secondary-btn w-full px-4 py-3 text-center text-sm font-medium"
              >
                Edit Event
              </Link>
            </div>
          </div>
          <DeleteEventForm eventId={event.id} />
          {query.saved ? <p className="mt-3 text-sm text-green-700">Event updated.</p> : null}
          {query.scannerCode === "rotated" ? <p className="mt-2 text-sm text-green-700">Scanner access code rotated.</p> : null}
          {query.scannerInvite === "sent" ? (
            <p className="mt-2 text-sm text-green-700">Scanner invite email sent.</p>
          ) : null}
          {query.scannerInvite === "existing" ? (
            <p className="mt-2 text-sm text-neutral-600">
              Scanner role is active. That email already has an account, so no new invite email was sent.
            </p>
          ) : null}
          {query.scannerInvite === "failed" ? (
            <p className="mt-2 text-sm text-red-600">
              Scanner role added, but invite email failed. Check Supabase Auth email/SMTP settings.
            </p>
          ) : null}
          {query.error ? <p className="mt-3 text-sm text-red-600">{query.error}</p> : null}
        </section>

        <section className="glass-card fade-in rounded-2xl p-5">
          <h2 className="text-base font-semibold">Scanner Access</h2>
          {proAccess ? (
            <>
              <div className="mt-3 space-y-2">
                <form method="post" action={`/api/host/events/${event.id}/scanners`} className="space-y-2">
                  <input type="hidden" name="action" value="invite" />
                  <input
                    name="scanner_email"
                    type="email"
                    required
                    placeholder="Scanner email"
                    className="input-field text-sm"
                  />
                  <button type="submit" className="primary-btn w-full py-2.5 text-sm font-medium">
                    Invite Scanner
                  </button>
                </form>
                <p className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-sm text-neutral-700">
                  Event code: <span className="font-semibold tracking-[0.2em]">{event.scanner_access_code ?? "------"}</span>
                </p>
                <p className="text-xs text-neutral-500">
                  Invited scanners open the email link, then enter the event code. They only get scan + headcount access for this event.
                </p>
                <form method="post" action={`/api/host/events/${event.id}/scanners`}>
                  <input type="hidden" name="action" value="rotate_code" />
                  <button type="submit" className="secondary-btn w-full py-2.5 text-sm font-medium">
                    Rotate Scanner Code
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-lg border border-neutral-200 bg-white/90 px-3 py-3">
              <p className="text-sm font-medium">Locked</p>
              <p className="mt-1 text-xs text-neutral-500">
                Your main host account can always scan. Upgrade to Pro to unlock extra scanner access links and event codes.
              </p>
              <Link href="/host/settings" className="secondary-btn mt-2 inline-flex">
                Upgrade in Settings
              </Link>
            </div>
          )}
        </section>

        <section className="glass-card fade-in rounded-2xl p-5">
          <details className="group">
            <summary className="cursor-pointer list-none rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-white px-3 py-2.5 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100/60">
              Stats
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Stat label="Approved" value={stats.totalApproved} />
              <Stat label="Pending" value={stats.pending} />
              <Stat label="Pending payment" value={stats.pendingPayment} />
              <Stat label="Rejected" value={stats.rejected} />
              <Stat label="Checked-in" value={stats.checkedIn} />
              <Stat label="Remaining" value={remainingCapacity ?? "∞"} />
              {proAccess && event.is_paid_event ? <Stat label="Paid guests" value={stats.paidCount} /> : null}
              {proAccess && event.is_paid_event ? <Stat label="Total collected" value={`$${totalCollected ?? "0.00"}`} /> : null}
              <Stat label="Left" value={stats.left} />
              <Stat label="Host Marked Can’t Make" value={stats.cantMake} />
              <Stat label="Guest Said Can’t Make" value={stats.guestReportedCantMake} />
              <Stat label="Guest Arriving" value={stats.guestReportedArriving} />
              <Stat label="Guest Running Late" value={stats.guestReportedRunningLate} />
            </div>
          </details>
        </section>

        <section className="glass-card fade-in rounded-2xl p-5">
          <h2 className="text-base font-semibold">Guests</h2>
          <div className="mt-3 space-y-3">
            {guests?.length ? (
              guests.map((guest) => (
                <div key={guest.id} className="rounded-xl border border-neutral-200 bg-white/80 p-3">
                  <p className="text-sm font-medium">{guest.display_name}</p>
                  {guest.guest_email ? <p className="text-xs text-neutral-500">{guest.guest_email}</p> : null}
                  <p className="text-xs text-neutral-500">{guest.status}</p>
                  {guest.guest_event_status ? (
                    <p
                      className={
                        guest.guest_event_status === "CANT_MAKE"
                          ? "text-xs font-medium text-red-700"
                          : "text-xs text-orange-700"
                      }
                    >
                      Guest update: {guest.guest_event_status.replace("_", " ").toLowerCase()}
                    </p>
                  ) : null}
                  {event.requires_payment || event.is_paid_event ? (
                    <p className="text-xs text-neutral-500">
                      Payment: {guest.payment_status === "PAID" || guest.payment_confirmed_at ? "Paid" : "Pending"}
                    </p>
                  ) : null}
                  {event.is_paid_event && !proAccess ? (
                    <p className="mt-1 text-xs text-neutral-500">Pro required to view paid guest totals.</p>
                  ) : null}
                  {event.is_paid_event && guest.status === "PENDING_PAYMENT" ? (
                    <p className="mt-2 text-xs text-neutral-500">Awaiting Stripe checkout completion.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <GuestActionButton
                        eventId={event.id}
                        guestRequestId={guest.id}
                        action="APPROVE"
                        currentStatus={guest.status}
                        paymentConfirmed={Boolean(guest.payment_status === "PAID" || guest.payment_confirmed_at)}
                      />
                      <GuestActionButton
                        eventId={event.id}
                        guestRequestId={guest.id}
                        action="REJECT"
                        currentStatus={guest.status}
                        paymentConfirmed={Boolean(guest.payment_status === "PAID" || guest.payment_confirmed_at)}
                      />
                      {event.requires_payment && !event.is_paid_event ? (
                        <GuestActionButton
                          eventId={event.id}
                          guestRequestId={guest.id}
                          action="MARK_PAID"
                          currentStatus={guest.status}
                          paymentConfirmed={Boolean(guest.payment_status === "PAID" || guest.payment_confirmed_at)}
                        />
                      ) : null}
                      <GuestActionButton
                        eventId={event.id}
                        guestRequestId={guest.id}
                        action="MARK_CANT_MAKE"
                        currentStatus={guest.status}
                        paymentConfirmed={Boolean(guest.payment_status === "PAID" || guest.payment_confirmed_at)}
                      />
                      <GuestActionButton
                        eventId={event.id}
                        guestRequestId={guest.id}
                        action="REVOKE"
                        currentStatus={guest.status}
                        paymentConfirmed={Boolean(guest.payment_status === "PAID" || guest.payment_confirmed_at)}
                      />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-500">No guest requests yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-gradient-to-b from-white to-orange-50/30 px-3 py-2.5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function GuestActionButton({
  eventId,
  guestRequestId,
  action,
  currentStatus,
  paymentConfirmed,
}: {
  eventId: string;
  guestRequestId: string;
  action:
    | "APPROVE"
    | "REJECT"
    | "REVOKE"
    | "MARK_PAID"
    | "MARK_CANT_MAKE";
  currentStatus: string;
  paymentConfirmed: boolean;
}) {
  const isActive =
    (action === "APPROVE" && currentStatus === "APPROVED") ||
    (action === "REJECT" && currentStatus === "REJECTED") ||
    (action === "MARK_CANT_MAKE" && currentStatus === "CANT_MAKE") ||
    (action === "REVOKE" && currentStatus === "REVOKED") ||
    (action === "MARK_PAID" && paymentConfirmed);
  const label =
    action === "APPROVE"
      ? "Approve"
      : action === "REJECT"
        ? "Reject"
        : action === "MARK_PAID"
          ? "Mark Paid"
          : action === "MARK_CANT_MAKE"
            ? "Can’t Make It"
            : "Revoke";

  return (
    <form method="post" action={`/api/host/events/${eventId}/guests/${guestRequestId}`}>
      <input type="hidden" name="action" value={action} />
      <button
        type="submit"
        className={
          isActive
            ? "rounded-lg bg-orange-600 px-3 py-2 text-xs font-medium text-white hover:bg-orange-500 transition-colors"
            : "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700 hover:bg-orange-50 transition-colors"
        }
      >
        {label}
      </button>
    </form>
  );
}
