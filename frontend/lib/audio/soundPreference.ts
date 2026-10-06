"use client";

import { useSyncExternalStore } from "react";

/** The one "Sound effects" preference (Settings → Sound). On by default; stored per browser. */
export const SOUND_KEY = "sprout.sound";

export function isSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true; // storage blocked or unavailable: keep the default
  }
}

const listeners = new Set<() => void>();

export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    /* the choice still applies until the page is closed (nothing else reads storage) */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === SOUND_KEY && listener(); // another tab changed it
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSoundEnabled(): [boolean, (enabled: boolean) => void] {
  return [useSyncExternalStore(subscribe, isSoundEnabled, () => true), setSoundEnabled];
}
