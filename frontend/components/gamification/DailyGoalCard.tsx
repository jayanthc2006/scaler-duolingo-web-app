import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { Learner } from "@/lib/types/api";

export function DailyGoalCard({ learner }: { learner: Learner }) {
  const done = learner.daily_xp >= learner.daily_goal_xp;
  const remaining = Math.max(0, learner.daily_goal_xp - learner.daily_xp);
  return (
    <section className="card goal-card" aria-labelledby="goal-title">
      <div className="card-head">
        <h2 id="goal-title" className="card-title">Daily goal</h2>
        <span className="link-small goal-target">{learner.daily_goal_xp} XP</span>
      </div>
      <div className="goal-row">
        <span className={`goal-badge${done ? " is-done" : ""}`} aria-hidden>
          <Icon name={done ? "check" : "bolt"} size={26} />
        </span>
        <div className="goal-main">
          <p className="goal-text">
            {done ? "Goal complete! Great work." : `Earn ${remaining} more XP to hit your goal`}
          </p>
          <div className="goal-bar">
            <ProgressBar value={learner.daily_xp / learner.daily_goal_xp} label="Daily XP goal" gold />
            <span className="goal-count">
              {Math.min(learner.daily_xp, learner.daily_goal_xp)}/{learner.daily_goal_xp}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
