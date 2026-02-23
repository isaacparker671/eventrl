import Link from "next/link";

type TermsPageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

function safeReturnTo(value: string | undefined) {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

export default async function TermsPage({ searchParams }: TermsPageProps) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <section className="glass-card rounded-2xl p-5">
          <Link href={returnTo} className="link-btn">
            Back
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-1 text-sm text-neutral-600">Eventrl, Inc.</p>
          <p className="text-sm text-neutral-600">Effective Date: February 23, 2026</p>
        </section>

        <section className="glass-card rounded-2xl p-5 space-y-5 text-sm text-neutral-800">
          <div>
            <h2 className="text-base font-semibold">1. Acceptance of Terms</h2>
            <p className="mt-1">
              By accessing or using Eventrl (&quot;Platform,&quot; &quot;Service&quot;), you agree to be bound by these Terms of
              Service (&quot;Terms&quot;). If you do not agree, do not use the Platform.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold">2. Description of Service</h2>
            <p className="mt-1">Eventrl is a software platform that enables event hosts to:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Create private or public events</li>
              <li>Manage guest access</li>
              <li>Sell paid event access</li>
              <li>Track attendance</li>
              <li>Use QR-based check-in tools</li>
            </ul>
            <p className="mt-1">Eventrl does not organize, operate, supervise, or control any event.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">3. No Agency Relationship</h2>
            <p className="mt-1">Eventrl is a technology platform only. Hosts are independent third parties.</p>
            <p className="mt-1">Nothing in these Terms creates:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Partnership</li>
              <li>Agency</li>
              <li>Joint venture</li>
              <li>Employment relationship</li>
            </ul>
            <p className="mt-1">Hosts are solely responsible for their events.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">4. Eligibility</h2>
            <p className="mt-1">You must be at least 18 years old to create a host account.</p>
            <p className="mt-1">By using the Platform, you represent that:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>You are legally capable of entering a binding contract.</li>
              <li>You will comply with all local, state, and federal laws.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">5. Host Responsibilities</h2>
            <p className="mt-1">Hosts are solely responsible for:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Event legality</li>
              <li>Venue compliance</li>
              <li>Safety compliance</li>
              <li>Alcohol compliance</li>
              <li>Crowd control</li>
              <li>Local permits</li>
              <li>Tax obligations</li>
              <li>Refund decisions</li>
              <li>Guest screening</li>
            </ul>
            <p className="mt-1">Eventrl does not verify hosts or events.</p>
            <p className="mt-1">Hosts agree to indemnify Eventrl against any claims arising from their events.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">6. Payment Processing</h2>
            <p className="mt-1">All payments are processed by Stripe.</p>
            <p className="mt-1">Eventrl:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Does not store full payment information.</li>
              <li>Is not a bank.</li>
              <li>Is not responsible for chargebacks.</li>
              <li>Is not responsible for payment disputes.</li>
            </ul>
            <p className="mt-1">Hosts are responsible for refunds and disputes unless otherwise required by law.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">7. Subscriptions (Pro Plan)</h2>
            <ul className="mt-1 list-disc pl-5">
              <li>Pro plan is billed monthly.</li>
              <li>Fees are non-refundable.</li>
              <li>Cancellation stops future billing.</li>
              <li>No partial refunds.</li>
              <li>Eventrl may change pricing with notice.</li>
            </ul>
            <p className="mt-1">Failure to pay may result in:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Feature suspension</li>
              <li>Account downgrade</li>
              <li>Account termination</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">8. Guest Tickets &amp; Refunds</h2>
            <p className="mt-1">Unless otherwise stated:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>All event ticket sales are final.</li>
              <li>Refunds are at host discretion.</li>
              <li>Eventrl is not responsible for canceled events.</li>
            </ul>
            <p className="mt-1">Guests assume risk when attending events.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">9. Assumption of Risk</h2>
            <p className="mt-1">By attending any event discovered or managed through Eventrl, users assume all risks including but not limited to:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Injury</li>
              <li>Property damage</li>
              <li>Illness</li>
              <li>Alcohol-related incidents</li>
              <li>Crowd incidents</li>
            </ul>
            <p className="mt-1">Eventrl disclaims liability to the maximum extent permitted by law.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">10. Limitation of Liability</h2>
            <p className="mt-1">To the maximum extent permitted by law, Eventrl shall not be liable for:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Indirect damages</li>
              <li>Lost profits</li>
              <li>Lost revenue</li>
              <li>Emotional distress</li>
              <li>Personal injury</li>
              <li>Death</li>
              <li>Property damage</li>
              <li>Event cancellation</li>
              <li>Fraud by hosts</li>
              <li>Technical outages</li>
            </ul>
            <p className="mt-1">Total liability shall not exceed the greater of:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>$100</li>
              <li>The amount paid to Eventrl in the prior 3 months</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">11. Indemnification</h2>
            <p className="mt-1">You agree to indemnify and hold harmless Eventrl and its officers, owners, employees, and affiliates from any claims arising out of:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Your event</li>
              <li>Your content</li>
              <li>Your misuse of the Platform</li>
              <li>Violation of law</li>
              <li>Violation of these Terms</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">12. Dispute Resolution &amp; Arbitration</h2>
            <p className="mt-1">All disputes shall be resolved through binding arbitration in the State of Georgia.</p>
            <p className="mt-1">You waive:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Jury trial</li>
              <li>Class action participation</li>
            </ul>
            <p className="mt-1">Arbitration shall be conducted under AAA rules.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">13. Termination</h2>
            <p className="mt-1">Eventrl may suspend or terminate accounts at its sole discretion for:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Fraud</li>
              <li>Abuse</li>
              <li>Illegal activity</li>
              <li>Terms violations</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">14. Intellectual Property</h2>
            <p className="mt-1">All platform design, branding, and technology are owned by Eventrl.</p>
            <p className="mt-1">Users retain ownership of their event content but grant Eventrl a license to display it.</p>
          </div>

          <div>
            <h2 className="text-base font-semibold">15. Force Majeure</h2>
            <p className="mt-1">Eventrl is not liable for service interruptions due to:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>Natural disasters</li>
              <li>Government action</li>
              <li>Internet failure</li>
              <li>Third-party provider outages</li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-semibold">16. Governing Law</h2>
            <p className="mt-1">These Terms are governed by the laws of the State of Georgia.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
