"use client";

import { DailyGoalCard } from "@/components/gamification/DailyGoalCard";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ErrorState, LoadingState } from "@/components/ui/StateBox";
import { api } from "@/lib/api/endpoints";
import { useAsync } from "@/lib/hooks/useAsync";
import { formatMonthYear, weekdayLetter } from "@/lib/utils/format";
import type { Profile } from "@/lib/types/api";

function StatTile({ icon, color, value, label }: { icon: string; color: string; value: string | number; label: string }) {
  return (
    <div className="stat-tile">
      <span style={{ color }}><Icon name={icon} size={30} /></span>
      <div>
        <p className="stat-tile-value">{value}</p>
        <p className="stat-tile-label">{label}</p>
      </div>
    </div>
  );
}

function WeekChart({ week }: { week: Profile["week"] }) {
  const max = Math.max(30, ...week.map((d) => d.xp));
  return (
    <div className="week-chart" role="img" aria-label={`XP per day this week: ${week.map((d) => `${weekdayLetter(d.date)} ${d.xp}`).join(", ")}`}>
      {week.map((d, i) => (
        <div key={d.date} className="week-col">
          <span className="week-xp">{d.xp > 0 ? d.xp : ""}</span>
          <div className="week-track">
            <div className={`week-bar${i === week.length - 1 ? " is-today" : ""}`} style={{ height: `${Math.max(d.xp > 0 ? 8 : 0, (d.xp / max) * 100)}%` }} />
          </div>
          <span className="week-day">{weekdayLetter(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const profile = useAsync(() => api.profile());
  if (profile.error) return <ErrorState message={profile.error} onRetry={profile.reload} />;
  if (!profile.data) return <LoadingState label="Loading your profile..." />;

  const p = profile.data;
  const l = p.learner;
  return (
    <div className="page">
      <header className="profile-head">
        <Avatar name={l.display_name} color={l.avatar_color} large />
        <div>
          <h1>{l.display_name}</h1>
          <p className="muted">@{l.username} · Joined {formatMonthYear(p.joined_at)}</p>
          <p className="muted">Learning {p.course_title}</p>
        </div>
      </header>

      <h2 className="section-title">Statistics</h2>
      <div className="stat-grid">
        <StatTile icon="flame" color="var(--orange)" value={l.current_streak} label="Day streak" />
        <StatTile icon="bolt" color="var(--yellow-ink)" value={l.xp_total} label="Total XP" />
        <StatTile icon="trophy" color="var(--purple-ink)" value={l.longest_streak} label="Longest streak" />
        <StatTile icon="book" color="var(--blue)" value={p.lessons_completed} label="Lessons completed" />
        <StatTile icon="crown" color="var(--yellow-ink)" value={p.skills_completed} label="Skills completed" />
        <StatTile icon="gem" color="var(--blue)" value={l.gems} label="Gems" />
      </div>

      <section className="card" aria-labelledby="course-progress">
        <div className="card-head">
          <h2 id="course-progress" className="card-title">Course progress</h2>
          <span className="link-small">{p.skills_completed}/{p.total_skills} skills</span>
        </div>
        <ProgressBar value={p.skills_completed / p.total_skills} label="Skills completed" />
        <p className="muted small">{p.lessons_completed} of {p.total_lessons} lessons finished</p>
      </section>

      <section className="card" aria-labelledby="week-title">
        <h2 id="week-title" className="card-title">XP this week</h2>
        <WeekChart week={p.week} />
      </section>

      <div className="only-narrow">
        <DailyGoalCard learner={l} />
      </div>

      <h2 className="section-title">Achievements</h2>
      <ul className="ach-grid">
        {p.achievements.map((a) => (
          <li key={a.code} className={`ach${a.unlocked ? " is-unlocked" : ""}`}>
            <span className="ach-icon"><Icon name={a.unlocked ? a.icon : "lock"} size={28} /></span>
            <div>
              <p className="ach-title">{a.title}</p>
              <p className="ach-desc">{a.description}</p>
            </div>
            <span className="sr-only">{a.unlocked ? "Unlocked" : "Locked"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
