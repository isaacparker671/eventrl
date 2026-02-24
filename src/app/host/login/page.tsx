"use client";

import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

export default function HostLoginPage() {
  const supabase = getSupabaseBrowserClient();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const isBusy = loading;

  const normalizedEmail = email.trim().toLowerCase();

  const submitLabel = loading
    ? mode === "login"
      ? "Signing in..."
      : "Creating account..."
    : mode === "login"
      ? "Sign in"
      : "Create account";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          setErrorMessage("Passwords do not match.");
          return;
        }

        const emailRedirectTo = `${window.location.origin}/auth/callback?next=/host/dashboard`;
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo },
        });

        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
            setErrorMessage("This email already has an account. Switch to Login or reset password below.");
          } else {
            setErrorMessage(error.message);
          }
          return;
        }

        const existingAccountHiddenBySupabase =
          !!data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
        if (existingAccountHiddenBySupabase) {
          setErrorMessage("This email already has an account. Switch to Login or reset password below.");
          return;
        }

        if (data.session) {
          window.location.assign("/host/dashboard");
          return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (!signInError) {
          window.location.assign("/host/dashboard");
          return;
        }

        if (signInError.message.toLowerCase().includes("confirm")) {
          setInfoMessage("Check your email and confirm your account, then log in.");
          return;
        }

        setErrorMessage(signInError.message);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

      if (error) {
        if (error.message.toLowerCase().includes("invalid")) {
          setErrorMessage("Invalid email or password. If you signed up recently, confirm your email first.");
        } else {
          setErrorMessage(error.message);
        }
        return;
      }

      window.location.assign("/host/dashboard");
    } catch {
      setErrorMessage("Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    if (!normalizedEmail) {
      setErrorMessage("Enter your email first, then tap Reset Password.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/host/login`,
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      setInfoMessage("Password reset email sent. Check your inbox.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-6 py-8">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="glass-card fade-in w-full rounded-2xl p-5">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Host Login</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {mode === "login"
              ? "Sign in to manage your event."
              : "Create a host account to get started."}
          </p>

          <div className="mt-4 inline-flex rounded-xl border border-neutral-200/80 bg-white p-1 text-sm">
            <button
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                mode === "login"
                  ? "bg-orange-600 text-white"
                  : "text-neutral-600 hover:bg-orange-50"
              }`}
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMessage(null);
                setInfoMessage(null);
                setConfirmPassword("");
              }}
              disabled={isBusy}
            >
              Login
            </button>
            <button
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                mode === "signup"
                  ? "bg-orange-600 text-white"
                  : "text-neutral-600 hover:bg-orange-50"
              }`}
              type="button"
              onClick={() => {
                setMode("signup");
                setErrorMessage(null);
                setInfoMessage(null);
                setConfirmPassword("");
              }}
              disabled={isBusy}
            >
              Signup
            </button>
          </div>

          <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
            <input
              className="input-field text-base text-neutral-900"
              placeholder="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isBusy}
            />

            <input
              className="input-field text-base text-neutral-900"
              placeholder="Password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isBusy}
            />

            {mode === "signup" ? (
              <input
                className="input-field text-base text-neutral-900"
                placeholder="Confirm password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isBusy}
              />
            ) : null}

            <button
              className="primary-btn w-full py-3 text-base font-medium active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={isBusy}
            >
              {submitLabel}
            </button>
            <button
              type="button"
              className="secondary-btn w-full py-3 text-sm font-medium"
              onClick={handleResetPassword}
              disabled={isBusy}
            >
              Reset Password
            </button>
          </form>

          {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
          {infoMessage ? <p className="mt-4 text-sm text-neutral-600">{infoMessage}</p> : null}
        </div>

        <section className="glass-card fade-in rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-5">
          <div className="rounded-xl bg-orange-600 px-4 py-3 text-white">
            <p className="text-xs uppercase tracking-[0.16em] text-orange-100">Why Eventrl</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Built for private events</h2>
          </div>

          <div className="mt-4 space-y-2">
            <div className="rounded-xl border border-orange-300 bg-orange-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Pro - $14.99/month</p>
              <p className="mt-1 text-sm text-neutral-700">
                Stripe connect + paid entry automation, revenue dashboard totals, live check-in counters, and extra team scanner access.
              </p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Invite-Only Security</p>
              <p className="mt-1 text-sm text-neutral-700">Unguessable links, QR entry, duplicate check-in protection, and instant revoke.</p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Fast Guest Control</p>
              <p className="mt-1 text-sm text-neutral-700">Approve, reject, mark paid, and monitor arrivals in real time from your phone.</p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Live Event Tools</p>
              <p className="mt-1 text-sm text-neutral-700">Host chat, polls, reactions, requests, and scanner workflow in one platform.</p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Mobile-First Simplicity</p>
              <p className="mt-1 text-sm text-neutral-700">Clean dashboard and quick actions for hosts running events in real life.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2">
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-700">Free Plan</p>
              <p className="mt-1 text-sm text-neutral-700">
                Create private events, approve guests, manual payment links, and core QR door check-in.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
