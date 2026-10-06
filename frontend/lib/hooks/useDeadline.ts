"use client";

import { useEffect, useState } from "react";

/**
 * Milliseconds left until `seconds` from now (null = no clock). Counts against `performance.now()`, so
 * it is not thrown off by timer jitter, and stops ticking once it reaches 0. The server holds the
 * authoritative deadline; this only drives the display and the "time's up" screen.
 */
export function useDeadline(seconds: number | null): number | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(seconds === null ? null : seconds * 1000);

  useEffect(() => {
    if (seconds === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemainingMs(null);
      return;
    }
    const deadline = performance.now() + seconds * 1000;
    const tick = () => {
      const left = Math.max(0, deadline - performance.now());
      setRemainingMs(left);
      if (left === 0) window.clearInterval(timer);
    };
    const timer = window.setInterval(tick, 100);
    tick();
    return () => window.clearInterval(timer);
  }, [seconds]);

  return remainingMs;
}

export const formatClock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
