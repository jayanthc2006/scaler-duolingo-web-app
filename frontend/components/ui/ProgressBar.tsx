interface Props {
  /** 0..1 */
  value: number;
  label: string;
  small?: boolean;
  gold?: boolean;
}

export function ProgressBar({ value, label, small, gold }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={`bar${small ? " is-small" : ""}${gold ? " is-gold" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="bar-fill" style={{ width: `${pct}%`, visibility: pct === 0 ? "hidden" : "visible" }} />
    </div>
  );
}
