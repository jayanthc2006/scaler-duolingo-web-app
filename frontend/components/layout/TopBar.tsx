import { GemPill, HeartPill, StreakPill, XpPill } from "@/components/gamification/StatusPills";
import type { Learner } from "@/lib/types/api";

/** Sticky status area: course, streak, XP, gems, hearts. */
export function TopBar({ learner }: { learner: Learner | null }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="course-chip" aria-label="Learning Spanish">
          <span className="course-flag" aria-hidden>ES</span>
          <span className="course-name">Spanish</span>
        </div>
        {learner && (
          <div className="topbar-stats" role="group" aria-label="Your stats">
            <StreakPill learner={learner} />
            <XpPill learner={learner} />
            <GemPill learner={learner} />
            <HeartPill learner={learner} />
          </div>
        )}
      </div>
    </header>
  );
}
