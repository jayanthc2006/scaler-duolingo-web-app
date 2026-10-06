"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatClock } from "@/lib/hooks/useDeadline";

interface Props {
  progress: number;
  hearts: number;
  heartLost: boolean;
  practice: boolean;
  /** legendary runs show a countdown (ms left, null until the run has loaded) instead of hearts */
  clockMs?: number | null;
  onClose: () => void;
}

export function LessonHeader({ progress, hearts, heartLost, practice, clockMs, onClose }: Props) {
  const heartRef = useRef<HTMLSpanElement>(null);

  // replay the "heart break" animation each time a heart is lost
  useEffect(() => {
    if (!heartLost) return;
    const el = heartRef.current;
    el?.classList.remove("is-breaking");
    void el?.offsetWidth;
    el?.classList.add("is-breaking");
  }, [heartLost, hearts]);

  return (
    <header className="lesson-header">
      <div className="lesson-header-inner">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Quit lesson">
          <Icon name="x" size={26} />
        </button>
        <ProgressBar value={progress} label="Lesson progress" />
        {clockMs !== undefined ? (
          <span
            className={`clock-pill${clockMs !== null && clockMs <= 10_000 ? " is-low" : ""}`}
            role="timer"
            aria-label={clockMs === null ? "Starting" : `${Math.ceil(clockMs / 1000)} seconds left`}
          >
            <Icon name="bolt" size={20} />
            <span>{clockMs === null ? "--:--" : formatClock(clockMs)}</span>
          </span>
        ) : practice ? (
          <span className="practice-tag">Practice</span>
        ) : (
          <span ref={heartRef} className={`lesson-hearts${hearts === 0 ? " is-empty" : ""}`} role="status" aria-label={`${hearts} hearts left`}>
            <Icon name="heart" size={28} />
            <span>{hearts}</span>
          </span>
        )}
      </div>
    </header>
  );
}
