"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

interface RefreshContextValue {
  /** Most recent refresh timestamp from any section. */
  lastRefreshedAt: number | null;
  /** Sections call this whenever they successfully refresh data. */
  reportRefresh: () => void;
}

const RefreshContext = createContext<RefreshContextValue>({
  lastRefreshedAt: null,
  reportRefresh: () => {},
});

interface ProviderProps {
  children: ReactNode;
}

export function RefreshProvider({ children }: ProviderProps) {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const reportRefresh = useCallback(() => {
    setLastRefreshedAt(Date.now());
  }, []);
  return (
    <RefreshContext.Provider value={{ lastRefreshedAt, reportRefresh }}>
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefreshContext(): RefreshContextValue {
  return useContext(RefreshContext);
}
