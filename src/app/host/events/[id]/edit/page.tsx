import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/lib/auth/requireHost";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type EditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function EditEventPage({ params, searchParams }: EditPageProps) {
  const hostUser = await requireHost();
  const { id } = await params;
  const query = await searchParams;
  const supabase = getSupabaseAdminClient();

  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, host_user_id, name, starts_at, location_text, capacity, allow_plus_one, requires_payment, payment_instructions, interaction_mode",
    )
    .eq("id", id)
    .eq("host_user_id", hostUser.id)
    .single();

  if (error || !event || event.host_user_id !== hostUser.id) {
    notFound();
  }

  const startsLocal = new Date(event.starts_at).toISOString().slice(0, 16);

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="glass-card rounded-2xl p-5">
          <Link href={`/host/events/${id}`} className="link-btn">
            Back to Event
          </Link>
          <h1 className="mt-2 text-xl font-semibold">Edit Event</h1>
          {query.error ? <p className="mt-2 text-sm text-red-600">{query.error}</p> : null}
        </div>

        <form method="post" action={`/api/host/events/${id}/update`} className="glass-card rounded-2xl p-5 space-y-3">
          <input name="name" defaultValue={event.name} required className="input-field text-sm" />
          <input name="starts_at" type="datetime-local" defaultValue={startsLocal} required className="input-field text-sm" />
          <input name="location_text" defaultValue={event.location_text} required className="input-field text-sm" />
          <input
            name="capacity"
            type="number"
            min={1}
            defaultValue={event.capacity ?? ""}
            placeholder="Capacity (optional)"
            className="input-field text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input name="allow_plus_one" type="checkbox" defaultChecked={event.allow_plus_one} className="h-4 w-4 accent-orange-600" />
            Allow plus one
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input name="requires_payment" type="checkbox" defaultChecked={event.requires_payment} className="h-4 w-4 accent-orange-600" />
            Require payment before entry
          </label>
          <textarea
            name="payment_instructions"
            rows={3}
            defaultValue={event.payment_instructions ?? ""}
            placeholder="Payment instructions"
            className="input-field text-sm"
          />
          <select name="interaction_mode" defaultValue={event.interaction_mode} className="input-field text-sm">
            <option value="RESTRICTED">Restricted</option>
            <option value="OPEN_CHAT">Open chat</option>
          </select>
          <button type="submit" className="primary-btn w-full py-3 text-sm font-medium">
            Save Event
          </button>
        </form>
      </div>
    </main>
  );
}
