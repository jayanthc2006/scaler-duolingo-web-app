"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Runs `fn` on mount (and whenever `reload` is called). Ignores results from stale runs. */
export function useAsync<T>(fn: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const fnRef = useRef(fn);
  const runId = useRef(0);

  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(() => {
    const id = ++runId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current().then(
      (data) => id === runId.current && setState({ data, error: null, loading: false }),
      (e: unknown) =>
        id === runId.current &&
        setState({ data: null, error: e instanceof Error ? e.message : "Something went wrong.", loading: false }),
    );
  }, []);

  // Bumping the run id makes any in-flight request's result be ignored (unmount / re-run).
  const invalidate = useCallback(() => {
    runId.current++;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run();
    return invalidate;
  }, [run, invalidate]);

  return { ...state, reload: run };
}
