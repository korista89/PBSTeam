"use client";

// 개별학생 행동중재 문서(행동중재계획·FBA 결과 보고서·중재 결과 보고서) 미리보기·인쇄.
// 작성 화면이 저장 전 내용까지 localStorage로 넘기므로 지금 화면 그대로 인쇄된다.
import React, { useEffect, useMemo, useState } from "react";
import { AuthCheck } from "../../components/AuthProvider";
import PrintGuard, { RealNameInput, requestPrint, withRealName } from "../../components/PrintGuard";
import { BipSheet, HandoverCharts, SectionSheet, SummaryTable } from "../shared";

export default function InterventionPrint() {
    const [raw, setP] = useState<any>(null);
    const [real, setReal] = useState("");  // 인쇄용 실명(직접 입력, 저장·전송 안 함)
    const p = useMemo(() => withRealName(raw, raw?.s?.name || "", real), [raw, real]);
    const [error, setError] = useState("");
    // 미리보기를 실제 인쇄 쪽(A4, 여백 12mm → 내용 703×1032px)으로 나눠 보여준다.
    // 숨긴 원본(인쇄 때는 이것만 보임)을 같은 너비로 그려 행 단위로 쪽 나눔을 흉내 내고,
    // 쪽마다 원본 사본을 그 구간만 잘라 보여준다. 행은 쪽을 넘지 않게(breakInside: avoid) 인쇄되므로 행 단위로 끊는다.
    // 인수인계 자료는 1·2쪽이 각각 들어가면 2쪽을 새 쪽에서 시작하고, 아니면 이어서 흐르게 한다.
    const [src, setSrc] = useState<HTMLDivElement | null>(null);
    const [split, setSplit] = useState(true);
    const [pages, setPages] = useState<number[]>([]);
    useEffect(() => {
        if (!src) return;
        let alive = true;
        const run = () => {
            if (!alive) return;
            const top0 = src.getBoundingClientRect().top;
            const p2 = src.querySelector("[data-page2]");
            if (p2) {
                const mid = p2.getBoundingClientRect().top - top0, total = src.getBoundingClientRect().height;
                const next = mid <= PAGE && total - mid <= PAGE;
                if (next !== split) { setSplit(next); return; } // 쪽 나눔이 바뀌면 다시 잰다
            }
            setPages(paginate(src, top0));
        };
        document.fonts.ready.then(run);
        const ro = new ResizeObserver(run); ro.observe(src);
        return () => { alive = false; ro.disconnect(); };
    }, [src, split]);
    useEffect(() => {
        try {
            // 넘겨받은 내용은 이 탭(sessionStorage)으로 옮기고 localStorage에서 지운다.
            // 그대로 두면 로그아웃 뒤 같은 PC의 다른 계정이 이 주소를 열어 볼 수 있다. 이 탭은 새로 고침해도 남는다.
            const fresh = localStorage.getItem("pbst_iv_print");
            if (fresh) { sessionStorage.setItem("pbst_iv_print", fresh); localStorage.removeItem("pbst_iv_print"); }
            const v = fresh || sessionStorage.getItem("pbst_iv_print");
            if (v) setP(JSON.parse(v)); else setError("인쇄할 내용이 없습니다. 작성 화면에서 '미리보기·인쇄'를 다시 눌러 주세요.");
        } catch { setError("인쇄할 내용을 읽지 못했습니다."); }
    }, []);

    return (
        <AuthCheck>
            <style>{`
                @page { size: A4; margin: 12mm; }
                @media screen { .print-src { position: absolute; left: -10000px; top: 0; visibility: hidden; } }
                @media print { .no-print { display: none !important; } body { background: #fff !important; } .print-bg { background: #fff !important; padding: 0 !important; } }
            `}</style>
            {raw && <PrintGuard doc={raw.heading || raw.doc || "행동중재 문서"} student={raw.s?.code || ""} />}
            <div className="print-bg" style={{ background: "#e5e7eb", minHeight: "100vh", padding: "16px 0" }}>
                <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 12px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "0 12px" }}>
                    <button onClick={() => window.close()} className="btn btn-secondary">✕ 닫기</button>
                    <button onClick={requestPrint} className="btn btn-primary" disabled={!p}>🖨️ 인쇄 / PDF 저장</button>
                    <RealNameInput alias={raw?.s?.name || ""} value={real} onChange={setReal} />
                    <span style={{ fontSize: "0.8rem", color: "#475569" }}>작성 화면의 지금 내용입니다. 저장은 작성 화면에서 따로 해야 합니다.</span>
                </div>
                {p && pages.length > 0 && (
                    <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 8px", padding: "0 12px", fontWeight: 700, color: p.limit && pages.length > p.limit ? "#dc2626" : "#0f172a" }}>
                        🖨️ 인쇄하면 A4 {pages.length}쪽{p.limit && pages.length > p.limit ? ` — ${p.limit}쪽을 넘습니다. 작성 화면에서 칸마다 2줄 안으로 줄여 주세요.` : ""}
                    </div>
                )}
                {error && <div className="no-print" style={{ maxWidth: 820, margin: "0 auto", color: "#dc2626", padding: 12 }}>⚠️ {error}</div>}
                {p && (
                    <>
                        {/* 원본: 화면에서는 숨겨 재기만 하고, 인쇄 때는 이것만 나간다 */}
                        <div ref={setSrc} className="print-src" style={{ width: CONTENT_W, display: "flow-root", background: "#fff", color: "#000", fontFamily: FONT }}>{body(p, split)}</div>
                        {pages.map((y, i) => (
                            <div key={i} className="no-print" style={{ width: 794, height: 1123, margin: "0 auto 6px", background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,0.15)", padding: 45, boxSizing: "border-box", position: "relative" }}>
                                <div style={{ height: (pages[i + 1] ?? srcHeight(src)) - y, overflow: "hidden" }}>
                                    <div style={{ width: CONTENT_W, marginTop: -y, display: "flow-root", color: "#000", fontFamily: FONT }}>{body(p, split)}</div>
                                </div>
                                <div style={{ position: "absolute", bottom: 14, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "#94a3b8" }}>{i + 1} / {pages.length}쪽</div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </AuthCheck>
    );
}

const PAGE = 1032;      // A4 297mm - 위아래 여백 24mm, 96dpi
const CONTENT_W = 703;  // A4 210mm - 좌우 여백 24mm
const FONT = "'Malgun Gothic', sans-serif";
const srcHeight = (el: HTMLElement | null) => el?.getBoundingClientRect().height || 0;

function body(p: any, split: boolean) {
    return <>
        {p.doc === "bip" && <BipSheet s={p.s} b={p.b || {}} behaviors={p.behaviors || []} />}
        {p.doc === "fba" && <SectionSheet heading="기능적 행동평가(FBA) 결과 보고서" s={p.s} meta={p.meta} sections={p.sections} />}
        {p.doc === "sections" && <SectionSheet heading={p.heading} s={p.s} meta={p.meta} sections={p.sections} extra={p.charts ? <HandoverCharts d={p.charts} /> : undefined} after={p.footer ? <div style={{ fontSize: "8.5pt", marginTop: 3 }}>{p.footer}</div> : undefined} dense={!!p.charts} />}
        {p.doc === "progress" && (
            <SectionSheet heading="개별학생 행동중재 결과 보고서" s={p.s} meta={p.meta} sections={p.sections}
                extra={<SummaryTable rows={p.rows || []} crisis={p.crisis || { pre: 0, post: 0, preWeeks: 0, postWeeks: 0 }} />} />
        )}
    </>;
}

// 쪽이 시작하는 y(원본 기준) 목록. 표의 행·표 밖 덩어리를 쪼갤 수 없는 단위로 보고,
// 넘치면 그 단위를 다음 쪽으로 보낸다. break-before: page는 강제로 새 쪽. 한 쪽보다 큰 단위는 쪽 높이로 자른다.
// ponytail: 브라우저 인쇄 엔진을 흉내 낸 것이라 몇 px 차이는 날 수 있다.
function paginate(root: HTMLElement, top0: number): number[] {
    const atoms: { top: number; bottom: number; forced: boolean }[] = [];
    let forced = false;
    const walk = (el: Element) => {
        if (getComputedStyle(el).breakBefore === "page") forced = true;
        const r = el.getBoundingClientRect();
        const kids = Array.from(el.children);
        if (el.tagName === "TR" || !kids.length || (!el.querySelector("tr") && r.height <= PAGE)) {
            if (r.height > 0) { atoms.push({ top: r.top - top0, bottom: r.bottom - top0, forced }); forced = false; }
            return;
        }
        kids.forEach(walk);
    };
    Array.from(root.children).forEach(walk);
    const starts = [0];
    for (const a of atoms) {
        let s = starts[starts.length - 1];
        if (a.forced && a.top > s) { starts.push(a.top); continue; }
        if (a.bottom - s <= PAGE) continue;
        if (a.top > s) { starts.push(a.top); s = a.top; }
        while (a.bottom - s > PAGE) { s += PAGE; starts.push(s); }
    }
    return starts;
}
