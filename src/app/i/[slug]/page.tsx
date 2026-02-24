import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuestMembershipForEvent } from "@/lib/eventrl/guestSession";
import { hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import EventImageGallery from "@/components/event/EventImageGallery";

type InvitePageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = getSupabaseAdminClient();

  const { data: invite, error } = await supabase
    .from("invite_links")
    .select(
      `
      event_id,
      revoked_at,
      events!inner (
        id,
        host_user_id,
        name,
        starts_at,
        location_text,
        payment_instructions,
        is_paid_event,
        price_cents
      )
      `,
    )
    .eq("slug", slug)
    .single();

  if (error || !invite || invite.revoked_at) {
    notFound();
  }
  const event = Array.isArray(invite.events) ? invite.events[0] : invite.events;
  if (!event) notFound();
  const { data: ownerProfile } = await supabase
    .from("host_profiles")
    .select("subscription_status")
    .eq("user_id", event.host_user_id)
    .maybeSingle();
  const scannerAccessEnabled = Boolean(ownerProfile && hasProAccess(ownerProfile));
  const { data: eventImages } = await supabase
    .from("event_images")
    .select("id, public_url, is_cover")
    .eq("event_id", event.id)
    .order("is_cover", { ascending: false })
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });

  const existingMembership = await getGuestMembershipForEvent(event.id);
  const errorMessage =
    query.error === "missing_name"
      ? "Please enter your name."
      : query.error === "join_failed"
        ? "Could not submit request. Try again."
        : query.error === "invalid_code"
          ? "Invalid recovery code for this event."
          : query.error === "scanner_invalid_code"
            ? "Invalid scanner code."
            : query.error === "scanner_code_not_configured"
              ? "Scanner code is not configured for this event."
              : query.error === "scanner_pro_required"
                ? "Scanner access requires Pro for this event."
          : query.error === "missing_guest_cookie_secret"
            ? "Server configuration is missing guest cookie secret."
            : query.error
              ? query.error
              : null;

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="glass-card fade-in mx-auto w-full max-w-md rounded-2xl p-5">
        <h1 className="text-xl font-semibold tracking-tight">{event.name}</h1>
        <p className="mt-2 text-sm text-neutral-600">{new Date(event.starts_at).toLocaleString()}</p>
        <p className="text-sm text-neutral-600">{event.location_text}</p>
        {event.payment_instructions ? (
          <div className="mt-2 rounded-lg border border-neutral-200 bg-white/90 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-600">Description</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{event.payment_instructions}</p>
          </div>
        ) : null}
        <EventImageGallery
          images={(eventImages ?? []).map((image) => ({
            id: image.id,
            publicUrl: image.public_url,
            isCover: image.is_cover,
          }))}
          title={event.name}
        />
        {event.is_paid_event && event.price_cents ? (
          <p className="mt-1 text-sm text-orange-700">
            Entry: ${(event.price_cents / 100).toFixed(2)}
          </p>
        ) : null}

        {existingMembership ? (
          <div className="mt-6 space-y-3">
            <p className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-sm text-neutral-700">
              This device already joined this event.
            </p>
            <Link
              href={`/g/status?event=${event.id}`}
              className="primary-btn block w-full py-3 text-center text-sm font-medium"
            >
              Continue
            </Link>
            <form method="post" action="/api/guest/memberships/clear">
              <button type="submit" className="secondary-btn w-full py-3 text-sm font-medium">
                Not you? Start over
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <form method="post" action={`/api/guest/join/${slug}`} className="space-y-3">
              <input
                name="display_name"
                placeholder="Your name"
                required
                className="input-field text-base"
              />
              <input
                name="guest_email"
                placeholder="Email (optional)"
                type="email"
                className="input-field text-base"
              />
              <label className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-sm text-neutral-700">
                <input name="plus_one" type="checkbox" className="h-4 w-4 accent-orange-600" />
                Bringing a plus-one
              </label>
              <button
                type="submit"
                className="primary-btn w-full py-3 text-sm font-medium"
              >
                {event.is_paid_event ? "Pay & Join" : "Request to Join"}
              </button>
            </form>

            <div className="rounded-xl border border-neutral-200 bg-white/90 p-3">
              <p className="text-xs text-neutral-500">Already joined? Restore with code</p>
              <form method="post" action={`/api/guest/recover/${slug}`} className="mt-2 flex gap-2">
                <input
                  name="recovery_code"
                  inputMode="numeric"
                  pattern="[0-9]{4,5}"
                  maxLength={5}
                  placeholder="4-5 digit code"
                  required
                  className="input-field flex-1 text-base"
                />
                <button type="submit" className="secondary-btn px-4 py-3 text-sm font-medium">
                  Restore
                </button>
              </form>
            </div>

          </div>
        )}

        {scannerAccessEnabled ? (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-white/90 p-3">
            <p className="text-xs text-neutral-500">Door scanner access (staff only)</p>
            <form method="post" action={`/api/scanner/access/${event.id}`} className="mt-2 flex gap-2">
              <input type="hidden" name="return_to" value={`/i/${slug}`} />
              <input
                name="access_code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="Enter 6-digit scanner code"
                required
                className="input-field flex-1 text-base"
              />
              <button type="submit" className="secondary-btn px-4 py-3 text-sm font-medium">
                Scan
              </button>
            </form>
          </div>
        ) : null}

        {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}

        <Link href="/g/events" className="secondary-btn mt-4 inline-flex">
          Already requested? Open My Events
        </Link>

      </div>
    </main>
  );
}
