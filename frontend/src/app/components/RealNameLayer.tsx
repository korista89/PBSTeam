"use client";

// 2027 모드: 잠금을 푼 탭에서만 화면 글자 속 익명코드(K27-418)를 이 브라우저의 실명으로 바꿔 보여 준다.
// 입력칸·스크립트는 건드리지 않는다. 서버로 가는 값은 그대로 익명코드다(화면 표시만 바뀜).
import React, { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { ANON_RE, lock, openMap, savedCount, unlock } from "../lib/nameMap";

const SKIP = new Set(["INPUT", "TEXTAREA", "SCRIPT", "STYLE", "SELECT", "OPTION"]);

function replaceIn(root: Node, map: Record<string, string>) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: n => (n.parentElement && (SKIP.has(n.parentElement.tagName) || n.parentElement.isContentEditable))
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const t of nodes) {
        const v = t.nodeValue || "";
        if (!ANON_RE.test(v)) continue;
        ANON_RE.lastIndex = 0;
        const nv = v.replace(ANON_RE, c => map[c] || c);
        if (nv !== v) t.nodeValue = nv;
    }
}

export default function RealNameLayer() {
    const { user } = useAuth();
    const on = user?.privacy_mode === "2027_FULL_ZERO_PII";
    const [open, setOpen] = useState(false);
    const [asking, setAsking] = useState(false);
    const [pin, setPin] = useState("");
    const [err, setErr] = useState("");
    const [stored, setStored] = useState(0);

    useEffect(() => { if (on) { setOpen(!!openMap()); setStored(savedCount()); } }, [on]);

    useEffect(() => {
        const map = on && open ? openMap() : null;
        if (!map) return;
        replaceIn(document.body, map);
        const mo = new MutationObserver(ms => {
            for (const m of ms) {
                if (m.type === "characterData") replaceIn(m.target, map);
                m.addedNodes.forEach(n => replaceIn(n, map));
            }
        });
        mo.observe(document.body, { childList: true, subtree: true, characterData: true });
        return () => mo.disconnect();
    }, [on, open]);

    if (!on || !stored) return null;
    const box: React.CSSProperties = { position: "fixed", left: 12, bottom: 12, zIndex: 9000, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, padding: "6px 10px", fontSize: "0.8rem", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" };
    if (open) return <button className="no-print" style={{ ...box, cursor: "pointer" }} onClick={() => { lock(); window.location.reload(); }}>🔒 실명 숨기기</button>;
    if (!asking) return <button className="no-print" style={{ ...box, cursor: "pointer" }} onClick={() => setAsking(true)}>🔓 실명 보기</button>;
    return (
        <form className="no-print" style={{ ...box, display: "flex", gap: 6, alignItems: "center" }}
            onSubmit={async e => { e.preventDefault(); if (await unlock(pin)) { setOpen(true); setAsking(false); setPin(""); } else setErr("PIN이 맞지 않습니다."); }}>
            <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="실명 PIN" autoFocus style={{ width: 90 }} />
            <button className="btn btn-primary" style={{ padding: "2px 8px" }}>열기</button>
            {err && <span style={{ color: "#dc2626" }}>{err}</span>}
        </form>
    );
}
