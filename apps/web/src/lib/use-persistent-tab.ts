"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Custom hook to persist tab selection across page reloads and navigation.
 * Uses URL query parameter (?tab=...) with localStorage as fallback.
 * Automatically syncs with browser history (popstate) and preserves position on refresh.
 */
export function usePersistentTab<T extends string>(
  storageKey: string,
  validTabs: readonly T[],
  defaultTab: T,
  paramName = "tab"
): [T, (newTab: T) => void] {
  const [tab, setTabState] = useState<T>(() => {
    if (typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlVal = urlParams.get(paramName) as T | null;
        if (urlVal && validTabs.includes(urlVal)) {
          return urlVal;
        }
        const stored = localStorage.getItem(storageKey) as T | null;
        if (stored && validTabs.includes(stored)) {
          return stored;
        }
      } catch {
        // ignore storage/url errors
      }
    }
    return defaultTab;
  });

  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlVal = urlParams.get(paramName) as T | null;
      if (urlVal && validTabs.includes(urlVal)) {
        setTabState(urlVal);
        localStorage.setItem(storageKey, urlVal);
      } else {
        const stored = localStorage.getItem(storageKey) as T | null;
        if (stored && validTabs.includes(stored)) {
          setTabState(stored);
          const url = new URL(window.location.href);
          url.searchParams.set(paramName, stored);
          window.history.replaceState(null, "", url.toString());
        }
      }
    } catch {
      // ignore
    }

    const handlePopState = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlVal = urlParams.get(paramName) as T | null;
        if (urlVal && validTabs.includes(urlVal)) {
          setTabState(urlVal);
          localStorage.setItem(storageKey, urlVal);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [storageKey, validTabs, defaultTab, paramName]);

  const setTab = useCallback(
    (newTab: T) => {
      setTabState(newTab);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(storageKey, newTab);
          const url = new URL(window.location.href);
          url.searchParams.set(paramName, newTab);
          window.history.replaceState(null, "", url.toString());
        } catch {
          // ignore
        }
      }
    },
    [storageKey, paramName]
  );

  return [tab, setTab];
}
