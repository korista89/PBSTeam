"use client";

import { useEffect, useState } from "react";
import { NETWORK_FAIL_EVENT, SHEET_STALE_EVENT, SHEET_UNAVAILABLE_EVENT, SheetStaleDetail } from "../lib/api";

// Slightly longer than one live-sync poll: if the next poll is still stale the
// banner is re-armed, otherwise it disappears on its own.
const HIDE_AFTER_MS = 70_000;

type SheetState =
  | { kind: "ok" }
  | { kind: "stale"; sources: string[]; since: Date }
  | { kind: "unavailable"; since: Date }
  | { kind: "network"; since: Date };

function formatTime(d: Date) {
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function SheetStatusBanner() {
  const [state, setState] = useState<SheetState>({ kind: "ok" });

  useEffect(() => {
    let timer: number | undefined;
    const arm = (next: SheetState) => {
      setState(next);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setState({ kind: "ok" }), HIDE_AFTER_MS);
    };
    const onStale = (e: Event) => {
      const sources = (e as CustomEvent<SheetStaleDetail>).detail?.sources || [];
      arm({ kind: "stale", sources, since: new Date() });
    };
    const onUnavailable = () => arm({ kind: "unavailable", since: new Date() });
    const onNetwork = () => arm({ kind: "network", since: new Date() });

    window.addEventListener(SHEET_STALE_EVENT, onStale);
    window.addEventListener(SHEET_UNAVAILABLE_EVENT, onUnavailable);
    window.addEventListener(NETWORK_FAIL_EVENT, onNetwork);
    return () => {
      window.removeEventListener(NETWORK_FAIL_EVENT, onNetwork);
      window.clearTimeout(timer);
      window.removeEventListener(SHEET_STALE_EVENT, onStale);
      window.removeEventListener(SHEET_UNAVAILABLE_EVENT, onUnavailable);
    };
  }, []);

  if (state.kind === "ok") return null;

  const message = state.kind === "network"
    ? "서버와 연결이 잠시 끊겼습니다(3번 시도). 쓰던 내용은 그대로 있으니 잠시 뒤 다시 누르거나, 계속되면 F5(새로고침)를 눌러 주세요."
    : state.kind === "stale"
    ? `구글 시트 응답이 지연되어 직전에 불러온 자료를 보여주고 있습니다${state.sources.length ? ` (${state.sources.join(", ")})` : ""}. 화면은 잠시 후 자동으로 갱신됩니다.`
    : "구글 시트 응답이 지연되어 일부 자료를 불러오지 못했습니다. 잠시 후 자동으로 다시 시도합니다.";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        margin: "0 0 12px",
        padding: "10px 14px",
        borderRadius: "8px",
        border: "1px solid var(--tier2)",
        background: "var(--tier2-bg)",
        color: "var(--text-primary)",
        fontSize: "0.82rem",
        lineHeight: 1.5,
        display: "flex",
        gap: "8px",
        alignItems: "flex-start",
      }}
    >
      <span aria-hidden="true">⏳</span>
      <span>
        {message}
        <span style={{ color: "var(--text-muted)", marginLeft: "6px" }}>{formatTime(state.since)}</span>
      </span>
    </div>
  );
}
