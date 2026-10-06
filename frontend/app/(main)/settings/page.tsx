"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api/endpoints";
import { useLearner } from "@/lib/learner/LearnerContext";
import { useSoundEnabled } from "@/lib/audio/soundPreference";
import { useThemePreference, type ThemePreference } from "@/lib/theme/theme";

const GOALS = [
  { xp: 10, label: "Casual", note: "10 XP / day" },
  { xp: 20, label: "Regular", note: "20 XP / day" },
  { xp: 30, label: "Serious", note: "30 XP / day" },
  { xp: 50, label: "Intense", note: "50 XP / day" },
];

const THEME_OPTIONS: { value: ThemePreference; label: string; note: string }[] = [
  { value: "light", label: "Light", note: "Bright and clean" },
  { value: "dark", label: "Dark", note: "Easy on the eyes" },
  { value: "system", label: "Auto", note: "Match my device" },
];

function Section({ icon, title, note, children }: { icon: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="card settings-section">
      <h2 className="card-title"><Icon name={icon} size={22} /> {title}</h2>
      {note && <p className="section-note">{note}</p>}
      <div className="settings-rows">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** A deliberately scoped, not-yet-available option: muted, with a quiet note instead of a loud badge. */
function SoonRow({ label, control }: { label: string; control?: "toggle" }) {
  return (
    <div className="setting-row is-soon">
      <span>{label}</span>
      <span className="soon">
        <span className="soon-text">Coming soon</span>
        {control === "toggle" && <span className="switch" role="switch" aria-checked="false" aria-disabled="true" aria-label={`${label} (coming soon)`} />}
      </span>
    </div>
  );
}

/** A live on/off setting (the placeholder `SoonRow` toggles are visual only). */
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch is-live${checked ? " is-on" : ""}`}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export default function SettingsPage() {
  const { learner, setLearner } = useLearner();
  const [theme, setTheme] = useThemePreference();
  const [soundOn, setSoundOn] = useSoundEnabled();
  const toast = useToast();
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chooseGoal = async (xp: number) => {
    setSaving(xp);
    setError(null);
    try {
      setLearner(await api.setDailyGoal(xp));
      toast(`Daily goal set to ${xp} XP`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your goal.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

      <Section icon="target" title="Daily goal">
        <div className="goal-options" role="radiogroup" aria-label="Daily XP goal">
          {GOALS.map((g) => (
            <button
              key={g.xp}
              type="button"
              role="radio"
              aria-checked={learner?.daily_goal_xp === g.xp}
              className={`goal-option${learner?.daily_goal_xp === g.xp ? " is-active" : ""}`}
              disabled={saving !== null}
              onClick={() => void chooseGoal(g.xp)}
            >
              <strong>{g.label}</strong>
              <span>{g.note}</span>
            </button>
          ))}
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </Section>

      <Section icon="user" title="Account" note="This demo runs as a single default learner, so sign-in isn't needed.">
        <Row label="Display name" value={learner?.display_name ?? "-"} />
        <Row label="Account" value="Demo account" />
        <SoonRow label="Email and password" />
        <SoonRow label="Connect a social account" />
      </Section>

      <Section icon="bell" title="Notifications">
        <SoonRow label="Practice reminders" control="toggle" />
        <SoonRow label="Streak alerts" control="toggle" />
      </Section>

      <Section icon="volume" title="Sound">
        <ToggleRow label="Sound effects" checked={soundOn} onChange={setSoundOn} />
        <SoonRow label="Haptic feedback" control="toggle" />
      </Section>

      <Section icon="globe" title="Language" note="One course is available in this demo.">
        <Row label="Current course" value="Spanish for English speakers" />
        <SoonRow label="App language" />
      </Section>

      <Section icon="moon" title="Theme" note="Auto follows your device.">
        <div className="goal-options theme-options" role="radiogroup" aria-label="Appearance">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={theme === o.value}
              className={`goal-option${theme === o.value ? " is-active" : ""}`}
              onClick={() => setTheme(o.value)}
            >
              <strong>{o.label}</strong>
              <span>{o.note}</span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
