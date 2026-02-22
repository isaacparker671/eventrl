import Link from "next/link";
import { requireHost } from "@/lib/auth/requireHost";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type SettingsProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function HostSettingsPage({ searchParams }: SettingsProps) {
  const hostUser = await requireHost();
  const query = await searchParams;
  const supabase = getSupabaseAdminClient();

  const fallbackName = hostUser.email?.split("@")[0] || "Host";
  const { data: profile } = await supabase
    .from("host_profiles")
    .select("display_name, cash_app_url, paypal_url, venmo_url, zelle_url, google_pay_url, apple_pay_url")
    .eq("user_id", hostUser.id)
    .maybeSingle();

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
          {query.error ? <p className="mt-2 text-sm text-red-600">{query.error}</p> : null}
        </div>

        <form method="post" action="/api/host/profile" className="glass-card rounded-2xl p-5 space-y-3">
          <input name="display_name" required defaultValue={profile?.display_name ?? fallbackName} className="input-field text-sm" placeholder="Host display name" />
          <input name="cash_app_url" defaultValue={profile?.cash_app_url ?? ""} className="input-field text-sm" placeholder="Cash App link" />
          <input name="paypal_url" defaultValue={profile?.paypal_url ?? ""} className="input-field text-sm" placeholder="PayPal link" />
          <input name="venmo_url" defaultValue={profile?.venmo_url ?? ""} className="input-field text-sm" placeholder="Venmo link" />
          <input name="zelle_url" defaultValue={profile?.zelle_url ?? ""} className="input-field text-sm" placeholder="Zelle info/link" />
          <input name="google_pay_url" defaultValue={profile?.google_pay_url ?? ""} className="input-field text-sm" placeholder="Google Pay link" />
          <input name="apple_pay_url" defaultValue={profile?.apple_pay_url ?? ""} className="input-field text-sm" placeholder="Apple Pay link" />

          <button className="primary-btn w-full py-3 text-sm font-medium" type="submit">
            Save Settings
          </button>
        </form>
      </div>
    </main>
  );
}
