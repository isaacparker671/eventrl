import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/lib/auth/requireHost";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type EditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function EditEventPage({ params, searchParams }: EditPageProps) {
  const hostUser = await requireHost();
  const hostProfile = await ensureHostProfile(hostUser);
  const { id } = await params;
  const query = await searchParams;
  const supabase = getSupabaseAdminClient();

  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, host_user_id, name, starts_at, location_text, capacity, allow_plus_one, requires_payment, payment_instructions, is_paid_event, price_cents, interaction_mode",
    )
    .eq("id", id)
    .eq("host_user_id", hostUser.id)
    .single();

  if (error || !event || event.host_user_id !== hostUser.id) {
    notFound();
  }
  const { data: eventImages } = await supabase
    .from("event_images")
    .select("id, public_url, is_cover, order_index, created_at")
    .eq("event_id", id)
    .order("is_cover", { ascending: false })
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });

  const startsLocal = new Date(event.starts_at).toISOString().slice(0, 16);
  const proAccess = hasProAccess(hostProfile);
  const canConfigurePaidEntry = proAccess && Boolean(hostProfile.stripe_account_id);
  const priceDollars = typeof event.price_cents === "number" ? (event.price_cents / 100).toFixed(2) : "";
  const paidEntryEnabled = event.requires_payment || event.is_paid_event;

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="glass-card rounded-2xl p-5">
          <Link href={`/host/events/${id}`} className="link-btn">
            Back to Event
          </Link>
          <h1 className="mt-2 text-xl font-semibold">Edit Event</h1>
          {query.saved ? <p className="mt-2 text-sm text-green-700">Saved.</p> : null}
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
            <input
              name="paid_entry"
              type="checkbox"
              defaultChecked={paidEntryEnabled}
              className="h-4 w-4 accent-orange-600"
            />
            Paid Entry
          </label>
          {canConfigurePaidEntry ? (
            <>
              <input
                name="price_dollars"
                type="number"
                min="1"
                step="0.01"
                defaultValue={priceDollars}
                placeholder="Entry price in USD (e.g. 15.00)"
                className="input-field text-sm"
              />
              <p className="text-xs text-neutral-500">
                With Stripe connected, guests can pay by Stripe and auto-approval is instant.
              </p>
            </>
          ) : proAccess ? (
            <p className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-xs text-neutral-600">
              Without Stripe Pro connection, Paid Entry uses your payment links and manual host confirmation.
            </p>
          ) : (
            <p className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-xs text-neutral-600">
              Free hosts can require manual payment with payment links. Upgrade to Pro for Stripe auto-checkout.
            </p>
          )}
          <div className="space-y-1">
            <p className="text-xs font-medium text-neutral-700">Payment options / special instructions</p>
            <textarea
              name="payment_instructions"
              rows={4}
              defaultValue={event.payment_instructions ?? ""}
              placeholder="Example: Pay via Cash App $yourname, include your full name in payment note, arrive by 8:30 PM."
              className="input-field text-sm"
            />
            <p className="text-xs text-neutral-500">This is shown to guests on the invite and status screens.</p>
          </div>
          <select name="interaction_mode" defaultValue={event.interaction_mode} className="input-field text-sm">
            <option value="RESTRICTED">Restricted</option>
            <option value="OPEN_CHAT">Open chat</option>
          </select>
          <button type="submit" className="primary-btn w-full py-3 text-sm font-medium">
            Save Event
          </button>
        </form>

        <section className="glass-card rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-semibold">Event Images</h2>
          {proAccess ? (
            <>
              <p className="text-xs text-neutral-500">Upload 1-3 images. First image is cover by default.</p>
              <form method="post" action={`/api/host/events/${id}/images`} encType="multipart/form-data" className="space-y-2">
                <input type="hidden" name="action" value="upload" />
                <input name="image" type="file" accept="image/*" className="input-field text-sm" />
                <button
                  type="submit"
                  className="primary-btn w-full py-2.5 text-sm font-medium"
                  disabled={(eventImages?.length ?? 0) >= 3}
                >
                  {(eventImages?.length ?? 0) >= 3 ? "Max 3 images reached" : "Upload Image"}
                </button>
              </form>

              {eventImages?.length ? (
                <div className="space-y-2">
                  {eventImages.map((image, index) => (
                    <div key={image.id} className="rounded-xl border border-neutral-200 bg-white/90 p-2">
                      <img src={image.public_url} alt={`Event image ${index + 1}`} className="h-36 w-full rounded-lg object-cover" />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <form method="post" action={`/api/host/events/${id}/images`}>
                          <input type="hidden" name="action" value="set_cover" />
                          <input type="hidden" name="image_id" value={image.id} />
                          <button
                            type="submit"
                            className={image.is_cover ? "primary-btn w-full py-2 text-xs font-medium" : "secondary-btn w-full py-2 text-xs font-medium"}
                            disabled={image.is_cover}
                          >
                            {image.is_cover ? "Cover Image" : "Set as Cover"}
                          </button>
                        </form>
                        <form method="post" action={`/api/host/events/${id}/images`}>
                          <input type="hidden" name="action" value="delete" />
                          <input type="hidden" name="image_id" value={image.id} />
                          <button type="submit" className="secondary-btn w-full py-2 text-xs font-medium">
                            Remove
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">No images uploaded yet.</p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white/90 px-3 py-3">
              <p className="text-sm font-medium">Locked</p>
              <p className="mt-1 text-xs text-neutral-500">Upgrade to Pro to upload event images (cover + gallery).</p>
              <Link href="/host/settings" className="secondary-btn mt-2 inline-flex">
                Upgrade in Settings
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
