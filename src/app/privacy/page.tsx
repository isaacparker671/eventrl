import Link from "next/link";

type PrivacyPageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

function safeReturnTo(value: string | undefined) {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <section className="glass-card rounded-2xl p-5">
          <Link href={returnTo} className="link-btn">
            Back
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-neutral-600">Effective Date: February 23, 2026</p>
        </section>

        <section className="glass-card rounded-2xl p-5 space-y-5 text-sm text-neutral-800">
          <div>
            <h2 className="text-base font-semibold">1. Information We Collect</h2>
            <ul className="mt-1 list-disc pl-5">
              <li>Name</li>
              <li>Email</li>
              <li>Phone</li>
              <li>Event participation data</li>
              <li>Stripe customer IDs</li>
              <li>IP address</li>
              <li>Device/browser info</li>
              <li>Usage analytics</li>
              <li>Cookies</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">2. How We Use Data</h2>
            <ul className="mt-1 list-disc pl-5">
              <li>Provide services</li>
              <li>Process payments</li>
              <li>Improve platform</li>
              <li>Fraud prevention</li>
              <li>Legal compliance</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">3. Payment Processing</h2>
            <p className="mt-1">Payments are processed by Stripe. We do not store full card numbers.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">4. Data Storage</h2>
            <p className="mt-1">Data is stored via secure cloud providers including Supabase and Vercel.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">5. Data Security</h2>
            <p className="mt-1">We implement reasonable security measures but cannot guarantee absolute security.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">6. Data Retention</h2>
            <p className="mt-1">We retain information as long as necessary for business and legal purposes.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">7. User Rights</h2>
            <p className="mt-1">Users may:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Request data access</li>
              <li>Request deletion (where legally allowed)</li>
              <li>Update account info</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">8. Children</h2>
            <p className="mt-1">Eventrl is not intended for users under 18.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">9. Changes</h2>
            <p className="mt-1">We may update this policy at any time.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
