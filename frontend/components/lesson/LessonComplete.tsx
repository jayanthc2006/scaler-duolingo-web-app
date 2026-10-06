"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { Mascot } from "@/components/ui/Mascot";
import { pluralize } from "@/lib/utils/format";
import type { CompleteResult } from "@/lib/types/api";

const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  left: `${(i * 97) % 100}%`,
  delay: `${((i * 53) % 100) / 100}s`,
  duration: `${2.4 + ((i * 37) % 100) / 60}s`,
  dx: `${((i * 41) % 120) - 60}px`,
  rot: `${360 + ((i * 71) % 540)}deg`,
  color: ["#58cc02", "#1cb0f6", "#ffc800", "#ff4b4b", "#ce82ff", "#ff9600"][i % 6],
}));

function Stat({ label, value, icon, tone }: { label: string; value: string; icon: string; tone: string }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        <Icon name={icon} size={24} /> {value}
      </span>
    </div>
  );
}

export function LessonComplete({ result, total }: { result: CompleteResult; total: number }) {
  const router = useRouter();
  const practice = result.kind === "practice";
  const accuracy = Math.round((total / (total + result.mistakes)) * 100);
  const { learner } = result;
  const toast = useToast();

  useEffect(() => {
    result.new_achievements.forEach((a) => toast(`Achievement unlocked: ${a.title}`, "info"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Enter" && router.push("/");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="complete">
      <div className="confetti" aria-hidden>
        {CONFETTI.map((c, i) => (
          <span key={i} style={{ left: c.left, background: c.color, animationDelay: c.delay, animationDuration: c.duration, ["--dx" as string]: c.dx, ["--rot" as string]: c.rot }} />
        ))}
      </div>
      <div className="complete-body">
        <Mascot mood="cheer" size={170} />
        <h1 className="complete-title">{practice ? "Practice complete!" : "Lesson complete!"}</h1>
        {result.already_completed && <p className="complete-note">You already finished this one, so nothing was added twice.</p>}
        <div className="stat-row">
          {practice ? (
            <>
              <Stat label="Hearts" value={result.hearts_gained > 0 ? `+${result.hearts_gained}` : "Full"} icon="heart" tone="red" />
              <Stat label="Accuracy" value={`${accuracy}%`} icon="target" tone="green" />
            </>
          ) : (
            <>
              <Stat label="Total XP" value={`+${result.xp_total_gained}`} icon="bolt" tone="yellow" />
              <Stat label="Accuracy" value={`${accuracy}%`} icon="target" tone="green" />
              <Stat label="Gems" value={`+${result.gems_awarded}`} icon="gem" tone="blue" />
            </>
          )}
        </div>

        {!practice && (
          <ul className="complete-facts">
            <li>
              <Icon name="flame" size={22} style={{ color: "var(--orange)" }} />
              {learner.current_streak > 0 ? `${pluralize(learner.current_streak, "day")} streak` : "Start your streak tomorrow"}
            </li>
            <li>
              <Icon name="target" size={22} style={{ color: "var(--yellow-dark)" }} />
              {learner.daily_xp >= learner.daily_goal_xp ? "Daily goal reached!" : `${learner.daily_xp}/${learner.daily_goal_xp} XP of your daily goal`}
            </li>
            {result.skill_completed && (
              <li>
                <Icon name="crown" size={22} style={{ color: "var(--yellow-dark)" }} /> Skill complete!
              </li>
            )}
            {result.new_achievements.map((a) => (
              <li key={a.code} className="is-achievement">
                <Icon name={a.icon} size={22} style={{ color: "var(--purple-dark)" }} /> Achievement unlocked: {a.title}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="complete-footer">
        <Button block onClick={() => router.push("/")} autoFocus>Continue</Button>
      </div>
    </div>
  );
}
