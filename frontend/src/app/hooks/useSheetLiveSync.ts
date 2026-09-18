"use client";

import { useEffect, useRef } from "react";
import axios from "axios";

const SHEET_MUTATION_EVENT = "pbsteam:sheet-mutation";
// 60s: every open tab polls, and each poll costs Google Sheets read quota.
const DEFAULT_INTERVAL_MS = 60_000;

// "1"    = right after this client's own write: backend clears its cache fully.
// "poll" = periodic/focus refresh: backend only re-reads data older than ~20s.
type RefreshMode = "1" | "poll";

let forceFreshReadDepth = 0;
let axiosInterceptorInstalled = false;

function isSheetBackedMutation(method?: string, url?: string): boolean {
  const normalizedMethod = (method || "get").toLowerCase();
  if (!new Set(["post", "put", "patch", "delete"]).has(normalizedMethod)) return false;
  if (!url?.includes("/api/v1/")) return false;
  return !url.includes("/auth/login")
    && !url.includes("/auth/logout")
    && !url.includes("/analytics/ai-")
    && !url.includes("/ebp/recommend");
}

function installMutationInterceptor() {
  if (axiosInterceptorInstalled || typeof window === "undefined") return;
  axiosInterceptorInstalled = true;
  axios.interceptors.response.use((response) => {
    if (isSheetBackedMutation(response.config.method, response.config.url)) {
      requestSheetLiveRefresh();
    }
    return response;
  });
}

// Every post-write refresh makes the backend drop its cache and re-read the sheets.
// Coalesce bursts (several cell saves / settings changes in a row) into one refresh
// so a teacher editing quickly doesn't exhaust the Sheets read quota by themselves.
const MUTATION_REFRESH_DEBOUNCE_MS = 1_200;
let mutationRefreshTimer: number | undefined;

export function requestSheetLiveRefresh() {
  if (typeof window === "undefined") return;
  window.clearTimeout(mutationRefreshTimer);
  mutationRefreshTimer = window.setTimeout(() => {
    window.dispatchEvent(new Event(SHEET_MUTATION_EVENT));
  }, MUTATION_REFRESH_DEBOUNCE_MS);
}

async function withFreshSheetReads(callback: () => void | Promise<void>, mode: RefreshMode) {
  forceFreshReadDepth += 1;
  // A concurrent post-write refresh must not be downgraded to a poll.
  if (mode === "1" || axios.defaults.headers.common["X-PBST-Sheet-Refresh"] !== "1") {
    axios.defaults.headers.common["X-PBST-Sheet-Refresh"] = mode;
  }
  try {
    await callback();
  } finally {
    forceFreshReadDepth = Math.max(0, forceFreshReadDepth - 1);
    if (forceFreshReadDepth === 0) {
      delete axios.defaults.headers.common["X-PBST-Sheet-Refresh"];
    }
  }
}

export interface SheetLiveSyncOptions {
  enabled?: boolean;
  intervalMs?: number;
  refreshOnFocus?: boolean;
}

/**
 * Keeps an active Sheet-backed screen current without reloading the page.
 * Refreshes are silent at the caller level and always bypass the receiving
 * Vercel instance's in-memory Sheet cache.
 */
export function useSheetLiveSync(
  refresh: () => void | Promise<void>,
  options: SheetLiveSyncOptions = {},
) {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef(false);
  const enabled = options.enabled ?? true;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const refreshOnFocus = options.refreshOnFocus ?? true;

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    installMutationInterceptor();
    if (!enabled || typeof window === "undefined") return;

    const runRefresh = async (mode: RefreshMode = "poll") => {
      if (document.visibilityState !== "visible" || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await withFreshSheetReads(() => refreshRef.current(), mode);
      } finally {
        inFlightRef.current = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void runRefresh();
    };
    const onFocus = () => void runRefresh();
    const onMutation = () => void runRefresh("1");
    const timer = window.setInterval(() => void runRefresh(), intervalMs);

    if (refreshOnFocus) {
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    window.addEventListener(SHEET_MUTATION_EVENT, onMutation);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(SHEET_MUTATION_EVENT, onMutation);
    };
  }, [enabled, intervalMs, refreshOnFocus]);
}
