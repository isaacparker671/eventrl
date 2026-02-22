import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/lib/auth/requireHost";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import EventChat from "@/components/chat/EventChat";

type PageProps = { params: Promise<{ id: string }> };

export default async function HostEventChatPage({ params }: PageProps) {
  const hostUser = await requireHost();
  const { id } = await params;
  const supabase = getSupabaseAdminClient();

  const { data: event, error } = await supabase
    .from("events")
    .select("id, host_user_id, name")
    .eq("id", id)
    .eq("host_user_id", hostUser.id)
    .single();

  if (error || !event || event.host_user_id !== hostUser.id) {
    notFound();
  }

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-3 text-xs">
            <Link href={`/host/events/${id}`} className="link-btn">
              Back to Event
            </Link>
          </div>
          <h1 className="mt-2 text-lg font-semibold">{event.name}</h1>
        </div>
        <EventChat eventId={id} accentTitle="Group Chat" actor="host" />
      </div>
    </main>
  );
}
