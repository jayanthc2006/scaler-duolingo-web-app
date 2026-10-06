"use client";

import type { ReactNode } from "react";
import { DailyGoalCard } from "@/components/gamification/DailyGoalCard";
import { LeaguePreview } from "@/components/gamification/LeaguePreview";
import { Navigation } from "@/components/layout/Navigation";
import { TopBar } from "@/components/layout/TopBar";
import { ErrorState, LoadingState } from "@/components/ui/StateBox";
import { useLearner } from "@/lib/learner/LearnerContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { learner, error, refresh } = useLearner();

  return (
    <div className="shell">
      <Navigation />
      <div className="shell-main">
        <TopBar learner={learner} />
        <div className="shell-body">
          <main className="shell-content" id="main">
            {error && !learner ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}
            {!learner && !error ? <LoadingState label="Loading your profile..." /> : null}
            {learner ? children : null}
          </main>
          {learner && (
            <aside className="shell-rail" aria-label="Your progress">
              <DailyGoalCard learner={learner} />
              <LeaguePreview />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
