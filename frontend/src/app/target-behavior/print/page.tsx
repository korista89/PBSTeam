"use client";

// 개별학생 행동중재 문서(행동중재계획·FBA 결과 보고서·중재 결과 보고서) 미리보기·인쇄.
// 작성 화면이 저장 전 내용까지 localStorage로 넘기므로 지금 화면 그대로 인쇄된다.
import React, { useEffect, useState } from "react";
import { AuthCheck } from "../../components/AuthProvider";
import { BipSheet, SectionSheet, SummaryTable } from "../shared";

export default function InterventionPrint() {
    const [p, setP] = useState<any>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        try {
            const v = localStorage.getItem("pbst_iv_print");
            if (v) setP(JSON.parse(v)); else setError("인쇄할 내용이 없습니다. 작성 화면에서 '미리보기·인쇄'를 다시 눌러 주세요.");
        } catch { setError("인쇄할 내용을 읽지 못했습니다."); }
    }, []);

    return (
        <AuthCheck>
            <style>{`
                @page { size: A4; margin: 12mm; }
                @media print { .no-print { display: none !important; } body { background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; } }
            `}</style>
            <div style={{ background: "#e5e7eb", minHeight: "100vh", padding: "16px 0" }}>
                <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 12px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "0 12px" }}>
                    <button onClick={() => window.close()} className="btn btn-secondary">✕ 닫기</button>
                    <button onClick={() => window.print()} className="btn btn-primary" disabled={!p}>🖨️ 인쇄 / PDF 저장</button>
                    <span style={{ fontSize: "0.8rem", color: "#475569" }}>작성 화면의 지금 내용입니다. 저장은 작성 화면에서 따로 해야 합니다.</span>
                </div>
                {error && <div className="no-print" style={{ maxWidth: 820, margin: "0 auto", color: "#dc2626", padding: 12 }}>⚠️ {error}</div>}
                {p && (
                    <div className="sheet" style={{ background: "#fff", maxWidth: 794, margin: "0 auto", padding: "28px 30px", boxShadow: "0 2px 10px rgba(0,0,0,0.15)", color: "#000", fontFamily: "'Malgun Gothic', sans-serif" }}>
                        {p.doc === "bip" && <BipSheet s={p.s} b={p.b || {}} behaviors={p.behaviors || []} />}
                        {p.doc === "fba" && <SectionSheet heading="기능적 행동평가(FBA) 결과 보고서" s={p.s} meta={p.meta} sections={p.sections} />}
                        {p.doc === "sections" && <SectionSheet heading={p.heading} s={p.s} meta={p.meta} sections={p.sections} />}
                        {p.doc === "progress" && (
                            <SectionSheet heading="개별학생 행동중재 결과 보고서" s={p.s} meta={p.meta} sections={p.sections}
                                extra={<SummaryTable rows={p.rows || []} crisis={p.crisis || { pre: 0, post: 0, preWeeks: 0, postWeeks: 0 }} />} />
                        )}
                    </div>
                )}
            </div>
        </AuthCheck>
    );
}
