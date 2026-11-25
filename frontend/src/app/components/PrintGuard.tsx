"use client";

// 인쇄·PDF 저장 보호: ① 쪽마다 대각선 워터마크(출력자ID | 출력일시 | 대외비-개인정보보호)
// ② 접속기록에 EXPORT 남기기(버튼·Ctrl+P 모두) ③ 2027 모드에서는 출력 사유 1클릭 선택.
// 인쇄 버튼은 window.print() 대신 requestPrint()를 부른다.
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "@/app/lib/api";
import { useAuth } from "./AuthProvider";

const EVT = "pbst-print-request";
const REASONS = ["IEP 팀 회의", "학부모 상담", "내부 결재", "기타"];
let lastLog = 0;

export function requestPrint() {
    window.dispatchEvent(new Event(EVT));
}

function stamp() {
    const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function PrintGuard({ doc, student = "" }: { doc: string; student?: string }) {
    const { user } = useAuth();
    const [asking, setAsking] = useState(false);
    const mark = useRef<HTMLDivElement>(null);
    const zeroPii = user?.privacy_mode === "2027_FULL_ZERO_PII";

    useEffect(() => {
        const log = (reason = "") => {
            lastLog = Date.now();
            axios.post(`${API_BASE_URL}/api/v1/auth/export-log`, { doc, student_code: student, reason }).catch(() => { });
        };
        const before = () => {
            if (mark.current) mark.current.textContent = `${user?.id || "-"} | ${stamp()} | 대외비-개인정보보호`;
            if (Date.now() - lastLog > 3000) log(zeroPii ? "사유 미선택(Ctrl+P)" : "");
        };
        const req = () => {
            if (zeroPii) { setAsking(true); return; }
            log();
            window.print();
        };
        (window as any).__pbstPrintLog = log;
        window.addEventListener("beforeprint", before);
        window.addEventListener(EVT, req);
        return () => { window.removeEventListener("beforeprint", before); window.removeEventListener(EVT, req); };
    }, [doc, student, user?.id, zeroPii]);

    const choose = (r: string) => {
        setAsking(false);
        (window as any).__pbstPrintLog?.(r);
        setTimeout(() => window.print(), 50);
    };

    return (
        <>
            <style>{`
                .pbst-wm { display: none; }
                @media print {
                    .pbst-wm { display: flex; position: fixed; inset: 0; align-items: center; justify-content: center; pointer-events: none; z-index: 9999; }
                    .pbst-wm > div { transform: rotate(-35deg); font: 700 22pt 'Malgun Gothic', sans-serif; color: rgba(0,0,0,0.09); white-space: nowrap; }
                }
            `}</style>
            <div className="pbst-wm" aria-hidden><div ref={mark}>{`${user?.id || "-"} | ${stamp()} | 대외비-개인정보보호`}</div></div>
            {asking && (
                <div className="no-print" role="dialog" aria-label="출력 사유 선택" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
                    <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: 320, maxWidth: "90vw" }}>
                        <div style={{ fontWeight: 800, marginBottom: 12 }}>출력 사유를 골라 주세요</div>
                        <div style={{ display: "grid", gap: 8 }}>
                            {REASONS.map(r => <button key={r} className="btn btn-secondary" onClick={() => choose(r)}>{r}</button>)}
                        </div>
                        <button onClick={() => setAsking(false)} style={{ marginTop: 10, background: "none", border: "none", color: "#64748b", cursor: "pointer" }}>취소</button>
                    </div>
                </div>
            )}
        </>
    );
}

// 인쇄할 때만 실명을 직접 입력해 별칭 자리에 넣는다. 서버로 보내지도 저장하지도 않는다.
export function RealNameInput({ alias, value, onChange }: { alias: string; value: string; onChange: (v: string) => void }) {
    if (!alias) return null;
    return (
        <label className="no-print" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, padding: "4px 8px" }}>
            🪪 {alias} 실명(인쇄용)
            <input value={value} onChange={e => onChange(e.target.value)} placeholder="입력하면 인쇄물에만 들어갑니다" autoComplete="off"
                style={{ border: "none", outline: "none", width: 170, fontSize: "0.85rem" }} />
        </label>
    );
}

// 객체 안 모든 글에서 별칭을 실명으로 바꾼 사본. 별칭 뒤 '-학생코드' 꼬리도 함께 바꾼다.
export function withRealName<T>(obj: T, alias: string, real: string): T {
    const a = (alias || "").trim(), r = (real || "").trim();
    if (!a || !r) return obj;
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pat = new RegExp(Array.from(new Set([a, a.split("-")[0]])).filter(x => x.length >= 2).map(esc).join("|"), "g");
    const walk = (v: any): any =>
        typeof v === "string" ? v.replace(pat, r)
            : Array.isArray(v) ? v.map(walk)
                : v && typeof v === "object" && !React.isValidElement(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
                    : v;
    return walk(obj);
}
