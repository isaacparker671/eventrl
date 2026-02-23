"use client";

import { useState } from "react";

type ScannerRole = {
  scanner_email: string;
  status: string;
};

export default function ScannerRolesManager({
  eventId,
  roles,
}: {
  eventId: string;
  roles: ScannerRole[];
}) {
  const [items, setItems] = useState(roles);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const revoke = async (scannerEmail: string) => {
    setBusyEmail(scannerEmail);
    try {
      const response = await fetch(`/api/host/events/${eventId}/scanners`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scannerEmail }),
      });
      if (!response.ok) return;
      setItems((prev) => prev.filter((item) => item.scanner_email !== scannerEmail));
    } finally {
      setBusyEmail(null);
    }
  };

  if (!items.length) {
    return <p className="text-sm text-neutral-500">No scanners assigned.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((role) => (
        <div key={role.scanner_email} className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2">
          <p className="text-sm font-medium">{role.scanner_email}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-xs text-neutral-500">Scanner role active</p>
            <button
              type="button"
              onClick={() => revoke(role.scanner_email)}
              className="secondary-btn px-2 py-1 text-xs"
              disabled={busyEmail === role.scanner_email}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

