export default function Home() {
  return (
    <main className="app-shell min-h-screen text-neutral-900 flex flex-col items-center justify-center px-6">
      <div className="fade-in text-center">
        <p className="mx-auto mb-4 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
          Private Event Access
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-900">Eventrl</h1>
      </div>

      <p className="fade-in mt-4 text-neutral-600 text-center max-w-sm">
        Private event access control. Fast. Clean. Secure.
      </p>

      <div className="fade-in mt-8 flex w-full max-w-xs flex-col items-center">
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
    </main>
  );
}
