export function Avatar({ name, color, large }: { name: string; color: string; large?: boolean }) {
  return (
    <span className={`avatar av-${color}${large ? " is-lg" : ""}`} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
