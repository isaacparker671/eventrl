import { redirect } from "next/navigation";
import { getGuestContextFromCookie } from "@/lib/eventrl/guestSession";
import QrClient from "./QrClient";

type GuestQrPageProps = {
  searchParams: Promise<{ event?: string }>;
};

export default async function GuestQrPage({ searchParams }: GuestQrPageProps) {
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

  if (guest.event.requires_payment && !guest.paymentConfirmedAt) {
    redirect(`/g/status?event=${guest.event.id}`);
  }

  return <QrClient eventId={eventId} />;
}
