import { notFound } from "next/navigation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type ScannerAccessPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string }>;
};

function getErrorMessage(error: string | undefined) {
  if (error === "invalid_code" || error === "scanner_invalid_code") return "Invalid access code.";
  if (error === "too_many_attempts") return "Too many attempts. Try again in a moment.";
  if (error === "scanner_code_not_configured") return "Scanner access is not configured for this event yet.";
  if (error === "pro_required" || error === "scanner_pro_required") return "Scanner link access is a Pro feature for this event.";
  return null;
}

export default async function ScannerAccessPage({ params, searchParams }: ScannerAccessPageProps) {
  const { eventId } = await params;
  const query = await searchParams;
  const supabase = getSupabaseAdminClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    notFound();
  }

  const errorMessage = getErrorMessage(query.error);

  return (
    <main className="app-shell min-h-screen px-4 py-6 text-neutral-900">
      <div className="glass-card mx-auto w-full max-w-md rounded-2xl p-5">
        <h1 className="text-xl font-semibold tracking-tight">Scanner Access</h1>
        <p className="mt-1 text-sm text-neutral-600">{event.name}</p>
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
            Enter Scanner Mode
          </button>
        </form>

        {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}
      </div>
    </main>
  );
}
