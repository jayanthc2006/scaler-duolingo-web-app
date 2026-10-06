"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, LoadingState } from "@/components/ui/StateBox";
import { api } from "@/lib/api/endpoints";
import { useAsync } from "@/lib/hooks/useAsync";
import { pluralize } from "@/lib/utils/format";

export default function LegendaryPage() {
  const router = useRouter();
  const status = useAsync(() => api.legendary());
  if (status.error) return <ErrorState message={status.error} onRetry={status.reload} />;
  if (!status.data) return <LoadingState label="Loading challenges..." />;

  const s = status.data;
  const note = s.available
    ? `${pluralize(s.remaining, "lesson")} ready to challenge`
    : s.conquered > 0
      ? "You've conquered every lesson so far. Finish new lessons to unlock more."
      : "Finish a lesson to unlock your first challenge.";

  return (
    <div className="page">
      <header className="page-head">
        <span className="page-badge"><Icon name="star" size={40} /></span>
        <h1>Legendary challenge</h1>
        <p>Beat the clock on a lesson you&apos;ve already finished.</p>
      </header>

      <section className="card" aria-labelledby="how-title">
        <h2 id="how-title" className="card-title">How it works</h2>
        <ul className="legend-rules">
          <li><Icon name="target" size={22} /> <span>Answer every exercise in <strong>{s.time_limit_seconds} seconds</strong>.</span></li>
          <li><Icon name="heart" size={22} /> <span>No hearts at risk, but each wrong answer costs <strong>{s.wrong_answer_penalty_seconds} seconds</strong>.</span></li>
          <li><Icon name="bolt" size={22} /> <span>Win to earn <strong>+{s.reward_xp} XP</strong> and <strong>+{s.reward_gems} gems</strong>, once per lesson.</span></li>
          <li><Icon name="book" size={22} /> <span>Your lesson progress stays exactly as it was.</span></li>
        </ul>
      </section>

      <section className="card legend-start" aria-labelledby="ready-title">
        <div>
          <h2 id="ready-title" className="card-title">{s.available ? "Ready?" : "Not yet"}</h2>
          <p className="muted" role="status">{note}</p>
          {s.conquered > 0 && <p className="muted small">{s.conquered} won so far</p>}
        </div>
        <Button disabled={!s.available} onClick={() => router.push("/legendary/play")}>Start</Button>
      </section>
    </div>
  );
}
