"use client";

import { useState } from "react";

export default function DeleteEventForm({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const canDelete = confirmText === "DELETE";

  return (
    <div className="mt-4 rounded-xl border border-red-200 bg-red-50/70 p-3">
      {!open ? (
        <button
          type="button"
          className="w-full rounded-lg border border-red-200 bg-red-100 px-3 py-3 text-sm font-medium text-red-700 hover:bg-red-200"
          onClick={() => setOpen(true)}
        >
          Delete Event
        </button>
      ) : (
        <form method="post" action={`/api/host/events/${eventId}/delete`} className="space-y-2">
          <p className="text-xs text-red-700">Type <span className="font-semibold">DELETE</span> to confirm.</p>
          <input
            name="confirm_text"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            className="input-field text-sm"
            placeholder="Type DELETE"
            autoComplete="off"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="submit"
              disabled={!canDelete}
              className="rounded-lg bg-red-600 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Confirm Delete
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmText("");
              }}
              className="secondary-btn"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
