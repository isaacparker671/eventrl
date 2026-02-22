"use client";

import { useState } from "react";

export default function InviteLinkCard({ invitePath }: { invitePath: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${invitePath}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-3">
      <p className="text-sm text-neutral-700 break-all rounded-lg border border-orange-100 bg-orange-50/70 px-2 py-2">
        {invitePath}
      </p>
      <button
        type="button"
        onClick={copy}
        className="secondary-btn mt-2"
      >
        {copied ? "Copied" : "Copy Invite Link"}
      </button>
    </div>
  );
}
