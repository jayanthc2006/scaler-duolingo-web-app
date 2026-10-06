import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatClock, useDeadline } from "@/lib/hooks/useDeadline";

describe("useDeadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is idle without a duration", () => {
    const { result } = renderHook(() => useDeadline(null));
    expect(result.current).toBeNull();
  });

  it("counts down accurately and stops at zero", () => {
    const { result } = renderHook(() => useDeadline(60));
    expect(result.current).toBe(60_000);
    act(() => vi.advanceTimersByTime(10_000));
    expect(Math.round(result.current as number)).toBe(50_000);
    act(() => vi.advanceTimersByTime(49_900));
    expect(result.current).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(0);
  });

  it("restarts when handed a new duration (a retried run)", () => {
    const { result, rerender } = renderHook(({ s }) => useDeadline(s), { initialProps: { s: 5 as number | null } });
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(0);
    rerender({ s: 60 });
    act(() => vi.advanceTimersByTime(100));
    expect(Math.round(result.current as number)).toBeGreaterThan(59_000);
  });

  it("formats m:ss and rounds up so the display never says 0:00 early", () => {
    expect(formatClock(60_000)).toBe("1:00");
    expect(formatClock(59_001)).toBe("1:00");
    expect(formatClock(9_400)).toBe("0:10");
    expect(formatClock(0)).toBe("0:00");
  });
});
