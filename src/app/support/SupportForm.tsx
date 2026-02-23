"use client";

import { FormEvent, useState } from "react";

type SubmitState = "idle" | "loading" | "success" | "error";

export default function SupportForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setErrorMessage("Please complete all fields.");
      setState("error");
      return;
    }

    setState("loading");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/support/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          message,
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error || "Could not send your message.");
      }

      setState("success");
      setName("");
      setEmail("");
      setMessage("");
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not send your message.");
    }
  }

  if (state === "success") {
    return (
      <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        Message sent.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        autoComplete="name"
        className="input-field text-base"
        required
      />
      <input
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email"
        type="email"
        autoComplete="email"
        className="input-field text-base"
        required
      />
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Message"
        rows={5}
        className="input-field resize-y py-3 text-base"
        required
      />

      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="submit"
          disabled={state === "loading"}
          className="primary-btn w-full py-3 text-sm font-medium disabled:opacity-60"
        >
          {state === "loading" ? "Sending..." : "Send Message"}
        </button>
        {state === "error" ? (
          <button
            type="button"
            onClick={() => setState("idle")}
            className="secondary-btn w-full py-3 text-sm font-medium"
          >
            Retry
          </button>
        ) : null}
      </div>
    </form>
  );
}
