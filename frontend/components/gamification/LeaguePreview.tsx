"use client";

import Link from "next/link";
import { LeaderboardRow } from "@/components/gamification/LeaderboardRow";
import { api } from "@/lib/api/endpoints";
import { useAsync } from "@/lib/hooks/useAsync";

/** Right-rail teaser: the top of the weekly board plus the learner's own row.
 *  The shell remounts after a lesson (lessons live outside it), so this refetches then. */
export function LeaguePreview() {
  const board = useAsync(() => api.leaderboard());
  if (!board.data) return null;

  const top = board.data.rows.slice(0, 3);
  const me = board.data.current_user;
  return (
    <section className="card" aria-labelledby="league-title">
      <div className="card-head">
        <h2 id="league-title" className="card-title">Weekly league</h2>
        <Link href="/leaderboard" className="link-small">View</Link>
      </div>
      <ul className="lb-list">
        {top.map((r) => <LeaderboardRow key={r.user_id} row={r} compact />)}
        {me.rank > 3 && (
          <>
            <li className="lb-gap" aria-hidden>···</li>
            <LeaderboardRow row={me} compact />
          </>
        )}
      </ul>
    </section>
  );
}
