"use client";

interface Props {
  tokens: string[];
  /** indices into `tokens`, in the order the learner tapped them */
  selected: number[];
  onChange: (selected: number[]) => void;
  disabled: boolean;
  verdict: "correct" | "incorrect" | null;
}

/** Tap-to-build answer line + word bank. Indices (not strings) so duplicate words work. */
export function WordBank({ tokens, selected, onChange, disabled, verdict }: Props) {
  const add = (i: number) => !disabled && !selected.includes(i) && onChange([...selected, i]);
  const remove = (i: number) => !disabled && onChange(selected.filter((s) => s !== i));

  return (
    <div className="wordbank">
      <div className={`wb-line${verdict ? ` is-${verdict}` : ""}`} aria-label="Your answer" aria-live="polite">
        {selected.map((i) => (
          <button key={i} type="button" className="chip chip-answer" onClick={() => remove(i)} disabled={disabled} aria-label={`Remove ${tokens[i]}`}>
            {tokens[i]}
          </button>
        ))}
      </div>
      <div className="wb-bank" role="group" aria-label="Word bank">
        {tokens.map((token, i) => {
          const used = selected.includes(i);
          return (
            <button key={i} type="button" className={`chip${used ? " is-used" : ""}`} onClick={() => add(i)} disabled={disabled || used} aria-hidden={used || undefined} tabIndex={used ? -1 : 0}>
              {token}
            </button>
          );
        })}
      </div>
    </div>
  );
}
