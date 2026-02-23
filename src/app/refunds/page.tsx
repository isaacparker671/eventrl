import Link from "next/link";

export default function RefundsPage() {
  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <section className="glass-card rounded-2xl p-5">
          <Link href="/" className="link-btn">
            Back
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Refund &amp; Billing Policy</h1>
          <p className="text-sm text-neutral-600">Effective Date: February 23, 2026</p>
        </section>

        <section className="glass-card rounded-2xl p-5 space-y-5 text-sm text-neutral-800">
          <div>
            <h2 className="text-base font-semibold">Pro Subscriptions</h2>
            <ul className="mt-1 list-disc pl-5">
              <li>Billed monthly</li>
              <li>Non-refundable</li>
              <li>Cancel anytime</li>
              <li>Access continues through billing period</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">Event Payments</h2>
            <ul className="mt-1 list-disc pl-5">
              <li>Guests pay hosts directly via Stripe.</li>
              <li>Refund decisions are made by hosts.</li>
              <li>Eventrl is not responsible for host refunds.</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
