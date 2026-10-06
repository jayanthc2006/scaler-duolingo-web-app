"use client";

import { useSyncExternalStore } from "react";

/** "system" (the default) follows the device; "light" / "dark" are explicit choices. */
export type ThemePreference = "light" | "dark" | "system";
export type Scheme = "light" | "dark";

export const THEME_KEY = "sprout.theme";
export const THEME_CHOICES: ThemePreference[] = ["light", "dark", "system"];

/**
 * Runs in <head> before first paint (see app/layout.tsx) so a dark user never sees a white flash.
 * Keep it in sync with `resolveScheme` below; `theme.test.ts` executes this exact string.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.scheme=d?"dark":"light";}catch(e){}})();`;

export function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveScheme(preference: ThemePreference, systemPrefersDark: boolean): Scheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    return "system"; // storage blocked: behave as "follow the device"
  }
}

const systemQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function apply(preference: ThemePreference): void {
  document.documentElement.dataset.scheme = resolveScheme(preference, systemQuery().matches);
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function setPreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_KEY, preference);
  } catch {
    /* the choice still applies for this page view */
  }
  apply(preference);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const query = systemQuery();
  const onSystemChange = () => {
    if (readPreference() === "system") apply("system"); // the OS flipped while we follow it
    listener();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) {
      apply(readPreference()); // another tab changed it
      listener();
    }
  };
  query.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    query.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stored preference plus a setter. The server render assumes "system"; the client corrects it on hydrate. */
export function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  return [preference, setPreference];
}
