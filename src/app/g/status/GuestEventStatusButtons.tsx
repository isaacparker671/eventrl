"use client";

import { useState } from "react";

type GuestEventStatus = "ARRIVING" | "RUNNING_LATE" | "CANT_MAKE" | null;

export default function GuestEventStatusButtons({
  eventId,
  currentStatus,
}: {
  eventId: string;
  currentStatus: GuestEventStatus;
}) {
  const [status, setStatus] = useState<GuestEventStatus>(currentStatus);
  const [loading, setLoading] = useState(false);

  const setGuestStatus = async (next: Exclude<GuestEventStatus, null>) => {
    setLoading(true);
    const response = await fetch("/api/guest/event-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, eventId }),
    });
    if (response.ok) {
      setStatus(next);
    }
    setLoading(false);
  };

  const buttonClass = (active: boolean) =>
    active
      ? "w-full rounded-lg bg-orange-600 px-3 py-3 text-sm font-medium text-white"
      : "w-full rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-700 hover:bg-orange-50";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white/90 p-3">
      <p className="mb-3 text-sm font-medium text-neutral-600">Update your arrival status</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button disabled={loading} type="button" className={buttonClass(status === "ARRIVING")} onClick={() => setGuestStatus("ARRIVING")}>
          Arriving
        </button>
        <button disabled={loading} type="button" className={buttonClass(status === "RUNNING_LATE")} onClick={() => setGuestStatus("RUNNING_LATE")}>
          Running Late
        </button>
        <button disabled={loading} type="button" className={buttonClass(status === "CANT_MAKE")} onClick={() => setGuestStatus("CANT_MAKE")}>
          Can’t Make It
        </button>
      </div>
    </div>
  );
}
