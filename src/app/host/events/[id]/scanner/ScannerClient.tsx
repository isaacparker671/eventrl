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
  isScannerRole,
  showLiveCounters,
}: {
  eventId: string;
  eventName: string;
  initialCheckedIn: number;
  initialApproved: number;
  initialRemainingCapacity: number | null;
  isScannerRole: boolean;
  showLiveCounters: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const processingRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
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
    const stopScanner = () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
    };

    const startScanner = async () => {
      if (!videoRef.current) return;
      if (!readerRef.current) {
        readerRef.current = new BrowserMultiFormatReader();
      }
      if (!readerRef.current || controlsRef.current) return;

      try {
        const controls = await readerRef.current.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          async (result) => {
            const text = result?.getText()?.trim();
            if (!text) return;
            if (processingRef.current) return;

            const now = Date.now();
            if (now - lastScanAtRef.current < 1200) return;
            lastScanAtRef.current = now;
            processingRef.current = true;
            stopScanner();

            try {
              const response = await fetch(`/api/host/events/${eventId}/checkin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: text }),
              });

              const payload = (await response.json().catch(() => null)) as ScanResult | null;
              if (!payload) {
                setStatusMessage("Scan failed.");
                setStatusTone("bad");
              } else {
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
              }
            } catch {
              setStatusMessage("Scan failed.");
              setStatusTone("bad");
            } finally {
              restartTimerRef.current = window.setTimeout(() => {
                processingRef.current = false;
                setStatusMessage("Point camera at guest QR.");
                setStatusTone("neutral");
                void startScanner();
              }, 900);
            }
          },
        );

        controlsRef.current = controls;
      } catch {
        setStatusMessage("Camera unavailable.");
        setStatusTone("bad");
      }
    };

    void startScanner();

    return () => {
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
      }
      stopScanner();
    };
  }, [eventId]);

  useEffect(() => {
    if (!showLiveCounters) {
      return;
    }

    let interval: number | null = null;

    const pullStats = async () => {
      if (document.visibilityState !== "visible") return;
      const response = await fetch(`/api/host/events/${eventId}/checkin-stats`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { checkedIn?: number; approved?: number; remainingCapacity?: number | null }
        | null;
      if (!response.ok || !payload) return;
      if (typeof payload.checkedIn === "number") setCheckedIn(payload.checkedIn);
      if (typeof payload.approved === "number") setApproved(payload.approved);
      if ("remainingCapacity" in payload) setRemainingCapacity(payload.remainingCapacity ?? null);
    };

    const start = () => {
      if (document.visibilityState !== "visible" || interval !== null) return;
      interval = window.setInterval(() => {
        void pullStats();
      }, 2500);
    };

    const stop = () => {
      if (interval === null) return;
      window.clearInterval(interval);
      interval = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void pullStats();
        start();
      } else {
        stop();
      }
    };

    void pullStats();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [eventId, showLiveCounters]);

  return (
    <main className="app-shell min-h-screen text-neutral-900 p-4">
      <div className="mx-auto w-full max-w-md space-y-4 fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{eventName}</h1>
          {isScannerRole ? null : (
            <Link href={`/host/events/${eventId}`} className="link-btn">
              Back
            </Link>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-neutral-200 shadow-sm">
          <video ref={videoRef} className="h-[55vh] w-full bg-black object-cover" muted playsInline />
        </div>

        <div className={`rounded-xl border px-3 py-3 text-sm font-medium shadow-sm ${statusClass}`}>{statusMessage}</div>

        {showLiveCounters ? (
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
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-center text-xs text-neutral-600">
            Live approved vs checked-in counters are Pro-only.
          </div>
        )}
      </div>
    </main>
  );
}
