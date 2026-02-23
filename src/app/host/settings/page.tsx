import Link from "next/link";
import { requireHost } from "@/lib/auth/requireHost";
import { redirectIfScannerOnly } from "@/lib/auth/eventAccess";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { syncProSubscriptionForHost } from "@/lib/stripe/proSubscription";
import DeleteAccountForm from "./DeleteAccountForm";

type SettingsProps = {
  searchParams: Promise<{ saved?: string; error?: string; stripe?: string; pro?: string }>;
};

export default async function HostSettingsPage({ searchParams }: SettingsProps) {
  const hostUser = await requireHost();
  await redirectIfScannerOnly(hostUser);
  const query = await searchParams;
  let profile = await ensureHostProfile(hostUser);
  if (query.pro === "success" || query.pro === "sync") {
    try {
      await syncProSubscriptionForHost(hostUser, profile);
      profile = await ensureHostProfile(hostUser);
    } catch {
      // Show existing profile and let manual sync route report exact errors.
    }
  }
  const proAccess = hasProAccess(profile);
  const errorMessage = query.error ? decodeURIComponent(query.error) : null;
  const stripeConnected = query.stripe === "connected";
  const proEnabled = query.pro === "success";
  const proCanceled = query.pro === "canceled";

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="glass-card rounded-2xl p-5">
          <Link href="/host/dashboard" className="link-btn">
            Back
          </Link>
          <h1 className="mt-2 text-xl font-semibold">Profile Settings</h1>
          <p className="mt-1 text-sm text-neutral-600">Set your host name and payment links.</p>
          {query.saved ? <p className="mt-2 text-sm text-green-700">Saved.</p> : null}
          {stripeConnected ? <p className="mt-2 text-sm text-green-700">Stripe connected.</p> : null}
          {proEnabled ? <p className="mt-2 text-sm text-green-700">Pro is active.</p> : null}
          {proCanceled ? <p className="mt-2 text-sm text-neutral-600">Pro checkout canceled.</p> : null}
          {errorMessage ? <p className="mt-2 text-sm text-red-600">{errorMessage}</p> : null}
        </div>

        <section className="glass-card rounded-2xl p-5">
          <h2 className="text-base font-semibold">Account Status</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2">
              <p className="text-xs text-neutral-500">Plan</p>
              <p className={proAccess ? "text-sm font-semibold text-orange-700" : "text-sm font-semibold"}>
                {proAccess ? "Pro $14.99" : "Free"}
              </p>
              {profile.subscription_status ? (
                <p className="mt-1 text-[11px] text-neutral-500 capitalize">
                  Status: {profile.subscription_status.replace("_", " ")}
                </p>
              ) : null}
              {profile.current_period_end ? (
                <p className="mt-1 text-[11px] text-neutral-500">
                  Renews {new Date(profile.current_period_end).toLocaleDateString()}
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2">
              <p className="text-xs text-neutral-500">Stripe</p>
              {proAccess ? (
                <>
                  <p className={profile.stripe_account_id ? "text-sm font-semibold text-orange-700" : "text-sm font-semibold"}>
                    {profile.stripe_account_id ? "Connected" : "Not connected"}
                  </p>
                  {profile.stripe_connected_at ? (
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Linked {new Date(profile.stripe_connected_at).toLocaleString()}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-neutral-500">Pro required for Stripe features.</p>
              )}
            </div>
          </div>
          {!proAccess ? (
            <div className="mt-3 grid grid-cols-1 gap-2">
              <form method="post" action="/api/stripe/pro/checkout">
                <button className="primary-btn w-full py-2.5 text-sm font-medium" type="submit">
                  Go Pro - $14.99/mo
                </button>
              </form>
              <form method="post" action="/api/stripe/pro/sync">
                <button className="secondary-btn w-full py-2.5 text-sm font-medium" type="submit">
                  Sync Pro status
                </button>
              </form>
            </div>
          ) : null}
          {proAccess && !profile.stripe_account_id ? (
            <a href="/api/stripe/connect" className="primary-btn mt-3 block w-full py-2.5 text-center text-sm font-medium">
              Connect Stripe
            </a>
          ) : null}
          {proAccess && profile.stripe_account_id ? (
            <form method="post" action="/api/stripe/disconnect/dev" className="mt-3">
              <button className="secondary-btn w-full py-2.5 text-sm font-medium" type="submit">
                Disconnect Stripe (dev)
              </button>
            </form>
          ) : null}
        </section>

        <form method="post" action="/api/host/profile" className="glass-card rounded-2xl p-5 space-y-3">
          <input name="display_name" required defaultValue={profile.display_name} className="input-field text-sm" placeholder="Host display name" />
          <input name="cash_app_url" defaultValue={profile.cash_app_url ?? ""} className="input-field text-sm" placeholder="Cash App link" />
          <input name="paypal_url" defaultValue={profile.paypal_url ?? ""} className="input-field text-sm" placeholder="PayPal link" />
          <input name="venmo_url" defaultValue={profile.venmo_url ?? ""} className="input-field text-sm" placeholder="Venmo link" />
          <input name="zelle_url" defaultValue={profile.zelle_url ?? ""} className="input-field text-sm" placeholder="Zelle info/link" />
          <input name="google_pay_url" defaultValue={profile.google_pay_url ?? ""} className="input-field text-sm" placeholder="Google Pay link" />
          <input name="apple_pay_url" defaultValue={profile.apple_pay_url ?? ""} className="input-field text-sm" placeholder="Apple Pay link" />

          <button className="primary-btn w-full py-3 text-sm font-medium" type="submit">
            Save Settings
          </button>
        </form>

        <DeleteAccountForm />
      </div>
    </main>
  );
}
