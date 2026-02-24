export default function Home() {
  return (
    <main className="app-shell min-h-screen px-6 py-8 text-neutral-900">
      <div className="mx-auto w-full max-w-3xl">
        <section className="fade-in text-center">
          <p className="mx-auto mb-4 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
            Private Event Access
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">Eventrl</h1>
          <p className="mx-auto mt-4 max-w-md text-neutral-600">
            Private event access control. Fast. Clean. Secure.
          </p>

          <div className="mx-auto mt-8 flex w-full max-w-xs flex-col items-center">
            <a
              href="/host/login"
              className="primary-btn inline-block w-full px-6 py-3 text-center text-sm font-medium active:scale-[0.98]"
            >
              Host Login
            </a>
            <a
              href="/join"
              className="secondary-btn mt-3 block w-full px-4 py-2 text-center text-sm font-medium"
            >
              Have an invite link?
            </a>
          </div>
        </section>

        <section className="glass-card fade-in mt-10 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-5">
          <div className="rounded-xl bg-orange-600 px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-[0.16em] text-orange-100">Everything Included</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Built for private events</h2>
          </div>

          <div className="mt-4 space-y-2">
            <div className="rounded-xl border border-orange-300 bg-orange-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Pro - $14.99/month</p>
              <p className="mt-1 text-sm text-neutral-700">
                Stripe paid entry automation, revenue dashboard, advanced stats, live counters, custom invite landing, and multi-scanner access.
              </p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Host controls</p>
              <p className="mt-1 text-sm text-neutral-700">
                Create events, approve or revoke guests, edit event details, manage chat mode, and scan QR at the door.
              </p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Guest flow</p>
              <p className="mt-1 text-sm text-neutral-700">
                Invite-link join, per-device session, recovery code, approval status, and personal QR for check-in.
              </p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Live event tools</p>
              <p className="mt-1 text-sm text-neutral-700">
                Group chat, reactions, yes/no polls, question requests in restricted mode, and instant status updates.
              </p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Security layer</p>
              <p className="mt-1 text-sm text-neutral-700">
                Unguessable invite slugs, server-validated QR hashing, duplicate check-in protection, and route-level ownership checks.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Free plan</p>
            <p className="mt-1 text-sm text-neutral-700">
              Core event creation, approvals, invite links, guest QR check-in, manual payment links, chat, and one scanner account.
            </p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Pro plan</p>
            <p className="mt-1 text-sm text-neutral-700">
              Stripe automation, extra scanners, advanced stats + revenue totals, and richer invite landing customization.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
