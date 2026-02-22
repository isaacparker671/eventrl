"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BrowserMultiFormatReader } from "@zxing/browser";

type ScanResult = {
  result:
    | "CHECKED_IN"
    | "ALREADY_CHECKED_IN"
    | "REVOKED"
    | "NOT_APPROVED"
    | "NOT_PAID"
    | "INVALID_TOKEN"
    | "UNAUTHORIZED";
  message: string;
  checkedIn?: number;
  approved?: number;
  remainingCapacity?: number | null;
};

export default function ScannerClient({
  eventId,
  eventName,
  initialCheckedIn,
  initialApproved,
  initialRemainingCapacity,
}: {
  eventId: string;
  eventName: string;
  initialCheckedIn: number;
  initialApproved: number;
  initialRemainingCapacity: number | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanAtRef = useRef(0);

  const [statusMessage, setStatusMessage] = useState("Point camera at guest QR.");
  const [statusTone, setStatusTone] = useState<"neutral" | "good" | "bad">("neutral");
  const [checkedIn, setCheckedIn] = useState(initialCheckedIn);
  const [approved, setApproved] = useState(initialApproved);
  const [remainingCapacity, setRemainingCapacity] = useState<number | null>(initialRemainingCapacity);

  const statusClass = useMemo(() => {
    if (statusTone === "good") return "border-green-500 bg-green-50 text-green-800";
    if (statusTone === "bad") return "border-red-500 bg-red-50 text-red-700";
    return "border-neutral-200 bg-white text-neutral-700";
  }, [statusTone]);

  useEffect(() => {
    const run = async () => {
      readerRef.current = new BrowserMultiFormatReader();
      if (!videoRef.current || !readerRef.current) return;

      try {
        const controls = await readerRef.current.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          async (result) => {
            const text = result?.getText()?.trim();
            if (!text) return;

            const now = Date.now();
            if (now - lastScanAtRef.current < 1200) return;
            lastScanAtRef.current = now;

            const response = await fetch(`/api/host/events/${eventId}/checkin`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: text }),
            });

            const payload = (await response.json().catch(() => null)) as ScanResult | null;
            if (!payload) {
              setStatusMessage("Scan failed.");
              setStatusTone("bad");
              return;
            }

            if (payload.result === "CHECKED_IN") {
              setStatusMessage(`YOU'RE IN • ${payload.message}`);
              setStatusTone("good");
            } else {
              setStatusMessage(payload.message);
              setStatusTone("bad");
            }
            if (typeof payload.checkedIn === "number") setCheckedIn(payload.checkedIn);
            if (typeof payload.approved === "number") setApproved(payload.approved);
            if ("remainingCapacity" in payload) {
              setRemainingCapacity(payload.remainingCapacity ?? null);
            }
          },
        );

        controlsRef.current = controls;
      } catch {
        setStatusMessage("Camera unavailable.");
        setStatusTone("bad");
      }
    };

    void run();

    return () => {
      controlsRef.current?.stop();
    };
  }, [eventId]);

  return (
    <main className="app-shell min-h-screen text-neutral-900 p-4">
      <div className="mx-auto w-full max-w-md space-y-4 fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{eventName}</h1>
          <Link href={`/host/events/${eventId}`} className="link-btn">
            Back
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-neutral-200 shadow-sm">
          <video ref={videoRef} className="h-[55vh] w-full bg-black object-cover" muted playsInline />
        </div>

        <div className={`rounded-xl border px-3 py-3 text-sm font-medium shadow-sm ${statusClass}`}>{statusMessage}</div>

        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg border border-neutral-200 p-2">
            <p className="text-xs text-neutral-500">Checked-in</p>
            <p className="font-semibold">{checkedIn}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-2">
            <p className="text-xs text-neutral-500">Approved</p>
            <p className="font-semibold">{approved}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-2">
            <p className="text-xs text-neutral-500">Remaining</p>
            <p className="font-semibold">{remainingCapacity ?? "∞"}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
