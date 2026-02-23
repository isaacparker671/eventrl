import Link from "next/link";
import { requireHost } from "@/lib/auth/requireHost";
import { redirectIfScannerOnly } from "@/lib/auth/eventAccess";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { syncProSubscriptionForHost } from "@/lib/stripe/proSubscription";

type BillingPageProps = {
  searchParams: Promise<{ error?: string; synced?: string }>;
};

export default async function HostBillingPage({ searchParams }: BillingPageProps) {
  const hostUser = await requireHost();
  await redirectIfScannerOnly(hostUser);
  const query = await searchParams;
  let profile = await ensureHostProfile(hostUser);

  if (query.synced === "1") {
    try {
      await syncProSubscriptionForHost(hostUser, profile);
      profile = await ensureHostProfile(hostUser);
    } catch {
      // Keep page usable with current profile data.
    }
  }

  const proAccess = hasProAccess(profile);
  const errorMessage = query.error ? decodeURIComponent(query.error) : null;

  return (
    <main className="app-shell min-h-screen px-4 py-6 text-neutral-900">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="glass-card rounded-2xl p-5">
          <Link href="/host/settings" className="link-btn">
            Back to Settings
          </Link>
          <h1 className="mt-2 text-xl font-semibold">Billing</h1>
          <p className="mt-1 text-sm text-neutral-600">Manage your Eventrl Pro subscription.</p>
          {errorMessage ? <p className="mt-2 text-sm text-red-600">{errorMessage}</p> : null}
        </div>

        <section className="glass-card rounded-2xl p-5">
          <div className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-3">
            <p className="text-xs text-neutral-500">Current plan</p>
            <p className={proAccess ? "mt-1 text-sm font-semibold text-orange-700" : "mt-1 text-sm font-semibold"}>
              {proAccess ? "Pro $14.99/mo" : "Free"}
            </p>
            {profile.subscription_status ? (
              <p className="mt-1 text-xs text-neutral-500 capitalize">
                Status: {profile.subscription_status.replace("_", " ")}
              </p>
            ) : null}
            {profile.current_period_end ? (
              <p className="mt-1 text-xs text-neutral-500">
                Current period ends {new Date(profile.current_period_end).toLocaleDateString()}
              </p>
            ) : null}
          </div>

          {!proAccess ? (
            <form method="post" action="/api/stripe/pro/checkout" className="mt-3">
              <button className="primary-btn w-full py-3 text-sm font-medium" type="submit">
                Go Pro - $14.99/mo
              </button>
            </form>
          ) : null}

          {proAccess && profile.stripe_customer_id ? (
            <form method="post" action="/api/stripe/portal" className="mt-3">
              <button className="primary-btn w-full py-3 text-sm font-medium" type="submit">
                Manage subscription
              </button>
            </form>
          ) : null}

          {proAccess && !profile.stripe_customer_id ? (
            <div className="mt-3 rounded-lg border border-neutral-200 bg-white/90 px-3 py-3">
              <p className="text-sm font-medium text-neutral-800">No subscription found.</p>
              <p className="mt-1 text-xs text-neutral-600">
                We could not find a platform subscription customer on your host profile.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <form method="get" action="/host/billing">
                  <input type="hidden" name="synced" value="1" />
                  <button className="secondary-btn w-full py-2.5 text-sm font-medium" type="submit">
                    Sync billing status
                  </button>
                </form>
                <Link href="/support?returnTo=%2Fhost%2Fbilling" className="secondary-btn justify-center">
                  Contact Support
                </Link>
              </div>
            </div>
          ) : null}

          <p className="mt-3 text-xs text-neutral-500">
            Stripe Connect account linking is managed separately in Settings.
          </p>
        </section>
      </div>
    </main>
  );
}
