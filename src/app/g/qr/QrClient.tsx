"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import Image from "next/image";

type QrPayload = {
  token: string;
  displayName: string;
  event: {
    name: string;
    starts_at: string;
    location_text: string;
  };
};

export default function QrClient({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<QrPayload | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch(`/api/guest/qr?event=${encodeURIComponent(eventId)}`, { cache: "no-store" });
        const payload = (await response.json()) as QrPayload & { error?: string };

        if (!response.ok || payload.error) {
          setErrorMessage(payload.error ?? "Unable to load QR.");
          return;
        }

        setData(payload);
        const image = await QRCode.toDataURL(payload.token, {
          margin: 1,
          width: 360,
          color: {
            dark: "#171717",
            light: "#ffffff",
          },
        });
        setQrDataUrl(image);
      } catch {
        setErrorMessage("Unable to load QR.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [eventId]);

  return (
    <main className="app-shell min-h-screen text-neutral-900 px-4 py-6">
      <div className="glass-card fade-in mx-auto w-full max-w-md rounded-2xl p-5">
        <h1 className="text-xl font-semibold tracking-tight">Guest QR</h1>
        {loading ? <p className="mt-3 text-sm text-neutral-500">Loading QR...</p> : null}
        {errorMessage ? <p className="mt-3 text-sm text-red-600">{errorMessage}</p> : null}

        {data && qrDataUrl ? (
          <>
            <p className="mt-2 text-sm text-neutral-600">{data.event.name}</p>
            <p className="text-sm text-neutral-600">{data.displayName}</p>
            <p className="text-xs text-neutral-500">{new Date(data.event.starts_at).toLocaleString()}</p>
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white/90 p-3">
              <Image
                src={qrDataUrl}
                alt="Guest entry QR code"
                width={320}
                height={320}
                unoptimized
                className="mx-auto h-auto w-full max-w-[320px]"
              />
            </div>
          </>
        ) : null}

        <Link
          href={`/g/status?event=${eventId}`}
          className="primary-btn mt-5 block w-full py-3 text-center text-sm font-medium"
        >
          Back to Status
        </Link>
      </div>
    </main>
  );
}
