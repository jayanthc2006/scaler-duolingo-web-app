"use client";

import { LeaderboardRow } from "@/components/gamification/LeaderboardRow";
import { ErrorState, LoadingState } from "@/components/ui/StateBox";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api/endpoints";
import { useAsync } from "@/lib/hooks/useAsync";

export default function LeaderboardPage() {
  const board = useAsync(() => api.leaderboard());
  if (board.error) return <ErrorState message={board.error} onRetry={board.reload} />;
  if (!board.data) return <LoadingState label="Loading the leaderboard..." />;

  const { rows, current_user: me } = board.data;
  return (
    <div className="page">
      <header className="page-head">
        <span className="page-badge"><Icon name="trophy" size={40} /></span>
        <h1>Weekly leaderboard</h1>
        <p>Ranked by XP earned in the last 7 days. Do a lesson to climb!</p>
      </header>
      <section className="card lb-card" aria-label="Rankings">
        <ol className="lb-list">
          {rows.map((r) => <LeaderboardRow key={r.user_id} row={r} />)}
        </ol>
        {!rows.some((r) => r.is_current_user) && (
          <ol className="lb-list lb-me-below" start={me.rank}>
            <li className="lb-gap" aria-hidden>···</li>
            <LeaderboardRow row={me} />
          </ol>
        )}
      </section>
    </div>
  );
}
