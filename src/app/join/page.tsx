"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function extractInviteSlug(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const directMatch = trimmed.match(/\/i\/([^/?#]+)/);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  return null;
}

export default function JoinPage() {
  const router = useRouter();
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const slug = extractInviteSlug(inviteUrl);

    if (!slug) {
      setError("Paste a valid invite link containing /i/.");
      return;
    }

    setError(null);
    router.push(`/i/${slug}`);
  };

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6 flex items-center justify-center">
      <div className="glass-card fade-in mx-auto w-full max-w-md rounded-2xl p-5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Join Event</h1>
        <p className="mt-1 text-sm text-neutral-600">Paste your invite link to continue.</p>

        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <input
            value={inviteUrl}
            onChange={(event) => setInviteUrl(event.target.value)}
            className="input-field text-base text-center"
            placeholder="https://.../i/your-invite-slug"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="primary-btn mx-auto block w-full py-3 text-center text-sm font-medium">
            Open Event
          </button>
        </form>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>
    </main>
  );
}
