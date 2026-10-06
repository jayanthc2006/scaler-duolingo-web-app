"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api/endpoints";
import type { Learner } from "@/lib/types/api";

interface LearnerContextValue {
  learner: Learner | null;
  error: string | null;
  /** Re-read the learner from the backend (the source of truth). */
  refresh: () => Promise<void>;
  /** Adopt a fresh snapshot returned by a mutating endpoint without another round trip. */
  setLearner: (learner: Learner) => void;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function LearnerProvider({ children }: { children: ReactNode }) {
  const [learner, setLearner] = useState<Learner | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLearner(await api.me());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your profile.");
    }
  }, []);

  useEffect(() => {
    // Initial load of the default learner; setState happens after the awaited request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ learner, error, refresh, setLearner }), [learner, error, refresh]);
  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

export function useLearner(): LearnerContextValue {
  const ctx = useContext(LearnerContext);
  if (!ctx) throw new Error("useLearner must be used inside <LearnerProvider>");
  return ctx;
}
