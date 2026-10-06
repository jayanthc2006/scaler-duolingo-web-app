"use client";

import { Icon } from "@/components/ui/Icon";
import { useCountdown } from "@/lib/hooks/useCountdown";
import { useLearner } from "@/lib/learner/LearnerContext";
import { formatDuration, pluralize } from "@/lib/utils/format";
import type { Learner } from "@/lib/types/api";

export function StreakPill({ learner }: { learner: Learner }) {
  const idle = !learner.streak_active_today;
  return (
    <span
      className={`pill pill-flame${idle ? " is-idle" : ""}`}
      aria-label={`${pluralize(learner.current_streak, "day")} streak${idle ? ", not yet extended today" : ""}`}
      title={idle ? "Do a lesson today to extend your streak" : "Streak extended today!"}
    >
      <Icon name="flame" size={26} />
      <span className="pill-value">{learner.current_streak}</span>
    </span>
  );
}

export function XpPill({ learner }: { learner: Learner }) {
  return (
    <span className="pill pill-xp" aria-label={`${learner.xp_total} total XP`} title="Total XP">
      <Icon name="bolt" size={24} />
      <span className="pill-value">{learner.xp_total}</span>
    </span>
  );
}

export function GemPill({ learner }: { learner: Learner }) {
  return (
    <span className="pill pill-gem" aria-label={`${learner.gems} gems`} title="Gems">
      <Icon name="gem" size={24} />
      <span className="pill-value">{learner.gems}</span>
    </span>
  );
}

/** Hearts with the regeneration countdown. Re-reads the learner when a heart comes back. */
export function HeartPill({ learner }: { learner: Learner }) {
  const { refresh } = useLearner();
  const remaining = useCountdown(learner.next_heart_in_seconds, () => void refresh());
  const empty = learner.hearts === 0;
  return (
    <span
      className={`pill pill-heart${empty ? " is-empty" : ""}`}
      aria-label={`${learner.hearts} of ${learner.max_hearts} hearts${remaining !== null ? `, next heart in ${formatDuration(remaining)}` : ""}`}
      title="Hearts"
    >
      <Icon name="heart" size={24} />
      <span className="pill-value">{learner.hearts}</span>
      {remaining !== null && <span className="pill-timer">{formatDuration(remaining)}</span>}
    </span>
  );
}
