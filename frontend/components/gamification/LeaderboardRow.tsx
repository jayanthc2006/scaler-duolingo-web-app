import { Avatar } from "@/components/ui/Avatar";
import type { LeaderboardRow as Row } from "@/lib/types/api";

const MEDALS: Record<number, string> = { 1: "gold", 2: "silver", 3: "bronze" };

export function LeaderboardRow({ row, compact }: { row: Row; compact?: boolean }) {
  const medal = MEDALS[row.rank];
  return (
    <li className={`lb-row${row.is_current_user ? " is-me" : ""}${compact ? " is-compact" : ""}`} aria-current={row.is_current_user ? "true" : undefined}>
      <span className={`lb-rank${medal ? ` medal-${medal}` : ""}`} aria-label={`Rank ${row.rank}`}>
        {row.rank}
      </span>
      <Avatar name={row.display_name} color={row.avatar_color} />
      <span className="lb-name">
        {row.display_name}
        {row.is_current_user && <span className="lb-you">You</span>}
      </span>
      <span className="lb-xp">{row.xp} XP</span>
    </li>
  );
}
