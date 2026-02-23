"use client";

import { useState } from "react";

export default function InviteLinkCard({ invitePath }: { invitePath: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      const fullInviteUrl = `${window.location.origin}${invitePath}`;
      await navigator.clipboard.writeText(fullInviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50/90 to-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">Invite Link</p>
      <p className="mt-1 break-all rounded-lg border border-orange-100 bg-white/90 px-3 py-2 text-sm text-neutral-700">
        {invitePath}
      </p>
      <div className="mt-2">
        <button
          type="button"
          onClick={copy}
          className="primary-btn w-full py-2 text-sm font-medium"
        >
          {copied ? "Copied" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}
