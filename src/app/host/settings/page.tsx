import Link from "next/link";
import { requireHost } from "@/lib/auth/requireHost";
import { ensureHostProfile } from "@/lib/host/profile";

type SettingsProps = {
  searchParams: Promise<{ saved?: string; error?: string; stripe?: string }>;
};

export default async function HostSettingsPage({ searchParams }: SettingsProps) {
  const hostUser = await requireHost();
  const query = await searchParams;
  const profile = await ensureHostProfile(hostUser);
  const errorMessage = query.error ? decodeURIComponent(query.error) : null;
  const stripeConnected = query.stripe === "connected";

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
          {errorMessage ? <p className="mt-2 text-sm text-red-600">{errorMessage}</p> : null}
        </div>

        <section className="glass-card rounded-2xl p-5">
          <h2 className="text-base font-semibold">Account Status</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2">
              <p className="text-xs text-neutral-500">Plan</p>
              <p className={profile.is_pro ? "text-sm font-semibold text-orange-700" : "text-sm font-semibold"}>
                {profile.is_pro ? "Pro $14.99" : "Free"}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2">
              <p className="text-xs text-neutral-500">Stripe</p>
              {profile.is_pro ? (
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
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <form method="post" action="/api/host/pro/enable">
              <button className="primary-btn w-full py-2.5 text-sm font-medium" type="submit" disabled={profile.is_pro}>
                Enable Pro (dev)
              </button>
            </form>
            <form method="post" action="/api/host/pro/disable">
              <button className="secondary-btn w-full py-2.5 text-sm font-medium" type="submit" disabled={!profile.is_pro}>
                Disable Pro (dev)
              </button>
            </form>
          </div>
          {profile.is_pro && !profile.stripe_account_id ? (
            <a href="/api/stripe/connect" className="primary-btn mt-3 block w-full py-2.5 text-center text-sm font-medium">
              Connect Stripe
            </a>
          ) : null}
          {profile.is_pro && profile.stripe_account_id ? (
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
      </div>
    </main>
  );
}
