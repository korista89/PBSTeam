"use client";

// Single place that decides how every tab talks to the backend:
// base URL, cookie credentials, and what 401 / 503 mean.
//
// Auth is an HttpOnly session cookie (pbst_session) set by /api/v1/auth/login.
// Pages keep using the global axios instance; this module configures it once.

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "../constants";

export { API_BASE_URL };

/** Absolute (or same-origin relative) URL for an API path such as "/api/v1/cico/monthly". */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

const MAX_503_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 5_000;

// Endpoints whose 401 is an expected answer, not a lost session.
const AUTH_PROBE_PATHS = ["/api/v1/auth/login", "/api/v1/auth/me", "/api/v1/auth/logout"];

type RetryableConfig = InternalAxiosRequestConfig & { _pbstRetry503?: number };

// Sheet health signals for SheetStatusBanner (backend: app/adapters/sheets/resilience.py).
export const SHEET_STALE_EVENT = "pbsteam:sheet-stale";
export const SHEET_UNAVAILABLE_EVENT = "pbsteam:sheet-unavailable";

export interface SheetStaleDetail {
  sources: string[];
}

function emit(name: string, detail?: SheetStaleDetail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function staleSources(header: unknown): string[] {
  if (typeof header !== "string" || !header) return [];
  return header.split(",").map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
}

let installed = false;
let onSessionLost: (() => void) | null = null;

/** Called by AuthProvider so a real 401 anywhere drops the user back to /login. */
export function setSessionLostHandler(handler: (() => void) | null) {
  onSessionLost = handler;
}

function retryDelayMs(error: AxiosError, attempt: number): number {
  const header = Number(error.response?.headers?.["retry-after"]);
  const base = Number.isFinite(header) && header > 0 ? header * 1000 : 1000 * attempt;
  return Math.min(base, MAX_RETRY_WAIT_MS);
}

export function installApiClient() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  axios.defaults.withCredentials = true;

  axios.interceptors.response.use((response) => {
    // Backend served its last good copy because Google Sheets throttled the read.
    const sources = staleSources(response.headers?.["x-pbst-data-stale"]);
    if (sources.length) emit(SHEET_STALE_EVENT, { sources });
    return response;
  }, async (error: AxiosError) => {
    const config = error.config as RetryableConfig | undefined;
    const status = error.response?.status;
    const url = config?.url || "";

    // 503 = backend could not read Google Sheets (quota/outage) and had no earlier copy.
    // The session is still valid, so retry idempotent reads instead of logging out.
    if (status === 503 && config && (config.method || "get").toLowerCase() === "get") {
      const attempt = (config._pbstRetry503 || 0) + 1;
      if (attempt <= MAX_503_RETRIES) {
        config._pbstRetry503 = attempt;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(error, attempt)));
        return axios.request(config);
      }
    }
    if (status === 503) emit(SHEET_UNAVAILABLE_EVENT);

    if (status === 401 && !AUTH_PROBE_PATHS.some((p) => url.includes(p))) {
      onSessionLost?.();
    }

    return Promise.reject(error);
  });
}

installApiClient();
