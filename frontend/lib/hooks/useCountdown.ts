"use client";

import { useEffect, useRef, useState } from "react";

/** Counts down from `seconds` (null = inactive). Calls `onZero` once when it reaches 0. */
export function useCountdown(seconds: number | null, onZero?: () => void): number | null {
  const [remaining, setRemaining] = useState<number | null>(seconds);
  const onZeroRef = useRef(onZero);

  useEffect(() => {
    onZeroRef.current = onZero;
  });

  useEffect(() => {
    // Restart whenever the backend hands us a new value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemaining(seconds);
    if (seconds === null) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const left = Math.max(0, seconds - Math.round((Date.now() - startedAt) / 1000));
      setRemaining(left);
      if (left === 0) {
        window.clearInterval(timer);
        onZeroRef.current?.();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  return remaining;
}
