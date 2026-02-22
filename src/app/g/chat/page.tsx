import Link from "next/link";
import { redirect } from "next/navigation";
import EventChat from "@/components/chat/EventChat";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";

type GuestChatPageProps = {
  searchParams: Promise<{ event?: string }>;
};

export default async function GuestChatPage({ searchParams }: GuestChatPageProps) {
  const { event } = await searchParams;
  const eventId = typeof event === "string" ? event : "";

  if (!eventId) {
    redirect("/g/events");
  }

  const guest = await getGuestContextFromCookie(eventId);

  if (!guest) {
    redirect("/join");
  }

  if (guest.status !== "APPROVED") {
    redirect(`/g/status?event=${guest.event.id}`);
  }

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-3 text-xs">
            <Link href={`/g/status?event=${guest.event.id}`} className="link-btn">
              Back to Status
            </Link>
            <Link href={`/g/qr?event=${guest.event.id}`} className="link-btn">
              QR Pass
            </Link>
          </div>
          <h1 className="text-lg font-semibold">{guest.event.name}</h1>
          <p className="mt-1 text-sm text-neutral-600">{guest.displayName}</p>
        </div>
        <EventChat eventId={guest.event.id} accentTitle="Event Chat" actor="guest" />
      </div>
    </main>
  );
}
