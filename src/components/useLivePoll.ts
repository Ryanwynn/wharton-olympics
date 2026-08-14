"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Poll a cached endpoint on an interval with ±jitter (§6.1) to avoid a
 * thundering-herd alignment across 500 clients. Pauses when the tab is hidden and
 * resumes with an immediate fetch on focus. In-flight requests are aborted on
 * pause/refetch so a slow field-wifi response never stacks up.
 */
export function useLivePoll<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  initial: T,
  { intervalMs = 15_000, jitterMs = 3_000 }: { intervalMs?: number; jitterMs?: number } = {}
) {
  const [data, setData] = useState<T>(initial);
  const [isPolling, setIsPolling] = useState(true);
  const [lastFetchAt, setLastFetchAt] = useState<number>(Date.now());
  const [failed, setFailed] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const runFetch = useCallback(async () => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    try {
      const next = await fetcherRef.current(ac.signal);
      if (!ac.signal.aborted) {
        setData(next);
        setLastFetchAt(Date.now());
        setFailed(false);
      }
    } catch {
      if (!ac.signal.aborted) setFailed(true);
    }
  }, []);

  const schedule = useCallback(() => {
    clearTimer();
    const delay = intervalMs + (Math.random() * 2 - 1) * jitterMs;
    timer.current = setTimeout(async () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        await runFetch();
      }
      schedule();
    }, delay);
  }, [intervalMs, jitterMs, runFetch]);

  useEffect(() => {
    schedule();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setIsPolling(true);
        void runFetch(); // immediate refresh on focus
        schedule();
      } else {
        setIsPolling(false);
        clearTimer();
        abort.current?.abort();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimer();
      abort.current?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [schedule, runFetch]);

  return { data, setData, isPolling, lastFetchAt, failed, refresh: runFetch };
}
