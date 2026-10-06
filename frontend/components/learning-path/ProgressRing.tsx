const RADIUS = 41;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Circular progress around a skill node. `value` is 0..1. */
export function ProgressRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <svg className="node-ring" viewBox="0 0 88 88" aria-hidden>
      <circle className="ring-bg" cx="44" cy="44" r={RADIUS} />
      <circle
        className="ring-fg"
        cx="44"
        cy="44"
        r={RADIUS}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
      />
    </svg>
  );
}
