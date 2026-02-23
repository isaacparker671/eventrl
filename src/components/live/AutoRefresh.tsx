"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type AutoRefreshProps = {
  intervalMs?: number;
  enabled?: boolean;
};

export default function AutoRefresh({ intervalMs = 2000, enabled = true }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let interval: number | null = null;

    const startPolling = () => {
      if (document.visibilityState !== "visible" || interval !== null) {
        return;
      }
      interval = window.setInterval(() => {
        router.refresh();
      }, intervalMs);
    };

    const stopPolling = () => {
      if (interval === null) {
        return;
      }
      window.clearInterval(interval);
      interval = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startPolling();
        return;
      }
      stopPolling();
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs, router]);

  return null;
}
