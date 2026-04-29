"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────
   useAutoRefresh
   - Calls `loader` once on mount, then every `intervalMs`
   - Cancels in-flight requests on unmount
   - Tracks lastRefreshedAt so the UI can show a "23s ago" ticker
   - Pauses while the document is hidden (saves API quota when
     the tab is in the background)
   - Returns a manual refresh trigger so the user can force-refresh
   ───────────────────────────────────────────────────────────── */

export interface AutoRefreshState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastRefreshedAt: number | null;
  refresh: () => void;
}

export function useAutoRefresh<T>(
  loader: () => Promise<T | null>,
  intervalMs: number = 90_000,
): AutoRefreshState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  /* Hold the loader in a ref so changing it between renders doesn't
     reset the interval. */
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const cancelledRef = useRef(false);
  const fetchData = useCallback(async () => {
    /* Don't show the loading spinner on background re-fetches —
       only on the very first call when data is null. */
    setError(null);
    try {
      const result = await loaderRef.current();
      if (cancelledRef.current) return;
      if (result !== null) {
        setData(result);
        setLastRefreshedAt(Date.now());
      } else if (data === null) {
        /* No data and no prior data → keep in error state. */
        setError("No data available");
      }
      /* else: keep showing stale data, don't overwrite with null. */
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [data]);

  /* Initial fetch */
  useEffect(() => {
    cancelledRef.current = false;
    void fetchData();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Polling */
  useEffect(() => {
    const handle = window.setInterval(() => {
      /* Skip when tab is hidden — saves the user's API quota and bandwidth. */
      if (document.visibilityState === "hidden") return;
      void fetchData();
    }, intervalMs);
    return () => window.clearInterval(handle);
  }, [fetchData, intervalMs]);

  /* When the tab becomes visible again, refresh immediately if we've
     been hidden longer than the interval. */
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible" && lastRefreshedAt) {
        const sinceLast = Date.now() - lastRefreshedAt;
        if (sinceLast > intervalMs) void fetchData();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchData, intervalMs, lastRefreshedAt]);

  const refresh = useCallback(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, lastRefreshedAt, refresh };
}

/* ─────────────────────────────────────────────────────────────
   useRefreshTicker
   - Returns a tick that increments every second
   - Used by components that want to display "23s ago" relative
     time labels without storing dates in state directly
   ───────────────────────────────────────────────────────────── */

export function useRefreshTicker(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handle = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(handle);
  }, []);
  return tick;
}
