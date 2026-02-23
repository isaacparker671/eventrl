"use client";

import { useState } from "react";

export default function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const canDelete = confirmText === "DELETE";

  return (
    <section className="glass-card rounded-2xl border border-red-200 bg-red-50/60 p-5">
      <h2 className="text-base font-semibold text-red-700">Delete Account</h2>
      <p className="mt-1 text-xs text-red-700">
        This deletes your host account and all events tied to it.
      </p>

      {!open ? (
        <button
          type="button"
          className="mt-3 w-full rounded-lg border border-red-200 bg-red-100 px-3 py-2.5 text-sm font-medium text-red-700 hover:bg-red-200"
          onClick={() => setOpen(true)}
        >
          Delete My Account
        </button>
      ) : (
        <form method="post" action="/api/host/account/delete" className="mt-3 space-y-2">
          <p className="text-xs text-red-700">
            Type <span className="font-semibold">DELETE</span> to confirm.
          </p>
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
    </section>
  );
}
