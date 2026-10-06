"use client";

import { DailyGoalCard } from "@/components/gamification/DailyGoalCard";
import { LearningPath } from "@/components/learning-path/LearningPath";
import { useLearner } from "@/lib/learner/LearnerContext";

export default function LearnPage() {
  const { learner } = useLearner();
  return (
    <>
      {learner && (
        <div className="only-narrow" style={{ paddingTop: 8 }}>
          <DailyGoalCard learner={learner} />
        </div>
      )}
      <LearningPath />
    </>
  );
}
