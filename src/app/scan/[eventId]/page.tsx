import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getScannerGateFromCookie,
  getScannerSessionFromCookie,
} from "@/lib/eventrl/scannerSession";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type ScannerAccessPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string; stage?: string }>;
};

function getErrorMessage(error: string | undefined) {
  if (error === "invalid_code" || error === "scanner_invalid_code") return "Invalid access code.";
  if (error === "invalid_scanner_name") return "Use a scanner name between 2 and 40 characters.";
  if (error === "too_many_attempts") return "Too many attempts. Try again in a moment.";
  if (error === "scanner_code_not_configured") return "Scanner access is not configured for this event yet.";
  if (error === "pro_required" || error === "scanner_pro_required") return "Scanner link access is a Pro feature for this event.";
  return null;
}

export default async function ScannerAccessPage({ params, searchParams }: ScannerAccessPageProps) {
  const { eventId } = await params;
  const query = await searchParams;
  const stage = query.stage === "identity" ? "identity" : "code";
  const supabase = getSupabaseAdminClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    notFound();
  }

  const scannerSession = await getScannerSessionFromCookie();
  const scannerGate = await getScannerGateFromCookie();
  const hasSessionForEvent = scannerSession?.eventId === event.id;
  const canChooseIdentity = stage === "identity" && scannerGate?.eventId === event.id;

  let scannerNames: Array<{ id: string; scanner_name: string }> = [];
  if (canChooseIdentity) {
    const { data } = await supabase
      .from("event_scanner_identities")
      .select("id, scanner_name")
      .eq("event_id", event.id)
      .order("last_used_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);
    scannerNames = data ?? [];
  }

  const errorMessage = getErrorMessage(query.error);

  return (
    <main className="app-shell min-h-screen px-4 py-6 text-neutral-900">
      <div className="glass-card mx-auto w-full max-w-md rounded-2xl p-5">
        <h1 className="text-xl font-semibold tracking-tight">Scanner Access</h1>
        <p className="mt-1 text-sm text-neutral-600">{event.name}</p>
        {hasSessionForEvent ? (
          <Link
            href={`/host/events/${event.id}/scanner`}
            className="primary-btn mt-3 block w-full py-3 text-center text-sm font-medium"
          >
            Continue as {scannerSession?.scannerName ?? "Scanner"}
          </Link>
        ) : null}
        {canChooseIdentity ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-neutral-600">Enter your scanner name, or pick one below.</p>
            <form method="post" action={`/api/scanner/access/${event.id}`} className="space-y-2">
              <input type="hidden" name="action" value="activate" />
              <input
                name="scanner_name"
                maxLength={40}
                required
                placeholder="Your scanner name"
                className="input-field text-base"
              />
              <button className="primary-btn w-full py-3 text-sm font-medium" type="submit">
                Open Scanner
              </button>
            </form>
            {scannerNames.length ? (
              <div className="rounded-xl border border-neutral-200 bg-white/90 p-3">
                <p className="text-xs text-neutral-500">Choose existing scanner</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {scannerNames.map((scanner) => (
                    <form key={scanner.id} method="post" action={`/api/scanner/access/${event.id}`}>
                      <input type="hidden" name="action" value="activate" />
                      <input type="hidden" name="scanner_name" value={scanner.scanner_name} />
                      <button type="submit" className="secondary-btn w-full py-2 text-sm">
                        {scanner.scanner_name}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-neutral-600">Enter the 6-digit event access code.</p>
            <form method="post" action={`/api/scanner/access/${event.id}`} className="mt-4 space-y-3">
              <input
                name="access_code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                placeholder="6-digit code"
                className="input-field text-center text-base tracking-[0.2em]"
              />
              <button className="primary-btn w-full py-3 text-sm font-medium" type="submit">
                Continue
              </button>
            </form>
            {hasSessionForEvent ? (
              <p className="mt-2 text-xs text-neutral-500">
                Last scanner: {scannerSession?.scannerName ?? "Unknown"}.
              </p>
            ) : null}
          </>
        )}

        {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}
      </div>
    </main>
  );
}
