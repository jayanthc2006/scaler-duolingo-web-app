"use client";

import { useEffect, useRef, useState } from "react";
import type { ExerciseViewProps } from "@/components/exercises/types";
import { speakSpanish } from "@/lib/audio/speech";
import type { MatchPairsPayload, TileOption } from "@/lib/types/api";

interface Props extends ExerciseViewProps<MatchPairsPayload> {
  /** Asks the backend whether one left/right pairing is right; a wrong pair is recorded and can cost a heart. */
  checkPair: (leftId: string, rightId: string) => Promise<boolean>;
}

type Side = "left" | "right";
const WRONG_FLASH_MS = 650;

export function MatchPairsExercise({ payload, disabled, onAnswer, checkPair }: Props) {
  const [selected, setSelected] = useState<{ left: string | null; right: string | null }>({ left: null, right: null });
  const [matched, setMatched] = useState<Record<string, string>>({});
  const [wrong, setWrong] = useState<{ left: string; right: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const total = payload.left.length;
  const matchedRight = new Set(Object.values(matched));

  const resolve = async (leftId: string, rightId: string) => {
    setBusy(true);
    setError(null);
    try {
      if (await checkPair(leftId, rightId)) {
        const next = { ...matched, [leftId]: rightId };
        setMatched(next);
        setSelected({ left: null, right: null });
        if (Object.keys(next).length === total) {
          onAnswer({ pairs: Object.entries(next).map(([left_id, right_id]) => ({ left_id, right_id })) });
        }
      } else {
        setWrong({ left: leftId, right: rightId });
        timer.current = window.setTimeout(() => {
          setWrong(null);
          setSelected({ left: null, right: null });
        }, WRONG_FLASH_MS);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check that pair.");
      setSelected({ left: null, right: null });
    } finally {
      setBusy(false);
    }
  };

  const tap = (side: Side, id: string) => {
    if (disabled || busy || wrong) return;
    const next = { ...selected, [side]: selected[side] === id ? null : id };
    setSelected(next);
    if (side === "left" && next.left) speakSpanish(payload.left.find((o) => o.id === id)?.text ?? ""); // hear the word you pick
    if (next.left && next.right) void resolve(next.left, next.right);
  };

  const tile = (side: Side, option: TileOption) => {
    const isMatched = side === "left" ? option.id in matched : matchedRight.has(option.id);
    const isSelected = selected[side] === option.id;
    const isWrong = wrong !== null && wrong[side] === option.id;
    const state = isMatched ? "matched" : isWrong ? "wrong" : isSelected ? "selected" : "";
    return (
      <button
        key={option.id}
        type="button"
        className={`tile ${state ? `is-${state}` : ""}`}
        aria-pressed={isSelected}
        disabled={disabled || isMatched}
        onClick={() => tap(side, option.id)}
      >
        {option.text}
        {isMatched && <span className="sr-only"> (matched)</span>}
      </button>
    );
  };

  return (
    <div className="exercise-body">
      <div className="match-grid" role="group" aria-label="Match each word with its meaning">
        <div className="match-col">{payload.left.map((o) => tile("left", o))}</div>
        <div className="match-col">{payload.right.map((o) => tile("right", o))}</div>
      </div>
      <p className="match-progress" role="status">
        {Object.keys(matched).length} of {total} pairs matched
      </p>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
