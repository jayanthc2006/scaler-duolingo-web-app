"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UnitSection } from "@/components/learning-path/UnitSection";
import { Icon } from "@/components/ui/Icon";
import { ErrorState } from "@/components/ui/StateBox";
import { api } from "@/lib/api/endpoints";
import { useAsync } from "@/lib/hooks/useAsync";
import type { Path } from "@/lib/types/api";

const SEEN_KEY = "sprout.skillStatus";

/** Remember last-seen skill states (a harmless per-browser preference) to animate what just changed. */
function diffSinceLastVisit(path: Path): Set<number> {
  const current: Record<number, string> = {};
  path.units.forEach((u) => u.skills.forEach((s) => (current[s.id] = s.status)));
  const changed = new Set<number>();
  try {
    const previous = JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? "null") as Record<number, string> | null;
    if (previous) {
      for (const [id, status] of Object.entries(current)) {
        if (previous[Number(id)] && previous[Number(id)] !== status) changed.add(Number(id));
      }
    }
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: skip the animation */
  }
  return changed;
}

function PathSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your path">
      <div className="skeleton" style={{ height: 84, marginBottom: 24 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton" style={{ width: 76, height: 76, borderRadius: "50%", margin: `0 auto 48px ${120 + i * 30}px` }} />
      ))}
    </div>
  );
}

export function LearningPath() {
  const path = useAsync(async () => {
    const [course] = await api.courses();
    return api.path(course.id);
  });
  const [openSkillId, setOpenSkillId] = useState<number | null>(null);
  const changedIds = useMemo(() => (path.data ? diffSinceLastVisit(path.data) : new Set<number>()), [path.data]);
  const scrolled = useRef(false);

  useEffect(() => {
    if (!path.data || scrolled.current) return;
    scrolled.current = true;
    document.querySelector<HTMLElement>(".node-btn.is-current")?.scrollIntoView({ block: "center" });
  }, [path.data]);

  if (path.error) return <ErrorState message={path.error} onRetry={path.reload} />;
  if (!path.data) return <PathSkeleton />;

  return (
    <div className="path">
      {path.data.units.map((unit) => (
        <UnitSection
          key={unit.id}
          unit={unit}
          openSkillId={openSkillId}
          changedSkillIds={changedIds}
          onToggle={(id) => setOpenSkillId((cur) => (cur === id ? null : id))}
        />
      ))}
      <div className="path-end">
        <span className="trophy"><Icon name="trophy" size={34} /></span>
        <p>More units are coming soon.</p>
      </div>
    </div>
  );
}
