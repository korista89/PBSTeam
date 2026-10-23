"use client";

// 위기행동 지원 및 개별학생교육지원 보고서 — 학교 양식과 같은 칸 배치로 기록을 채워 보여주고,
// 브라우저 인쇄(PDF 저장)·한글(hwpx) 내려받기를 한다. 인쇄 뒤 서명해 담당자에게 제출한다.
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "next/navigation";
import { API_BASE_URL } from "../../../constants";
import { AuthCheck } from "../../../components/AuthProvider";
import ReportSheet from "../../../components/ReportSheet";

type Fields = {
  기록번호: string; 소속: string; 학생: string; 담임교사: string; 보고사유: Record<string, boolean>;
  발생일시: string; 발생장소: string; 지도교사: string; 지원시간: string; 지원장소: string; 지원교사: string;
  A: string; B: string; C: string; 경위: string; 관찰기록: string; 법적의무확인: string; 상태: string;
  조치사항: { 구분: string; 일시: string; 내용: string }[];
};

export default function CrisisReportPage() {
  const params = useParams();
  const id = decodeURIComponent(params.id as string);
  const [f, setF] = useState<Fields | null>(null);
  const [error, setError] = useState("");

  const draft = id === "draft";
  useEffect(() => {
    if (draft) {
      // 입력 폼의 '작성 중 보고서 인쇄'가 넘긴 저장 전 내용
      try {
        const v = localStorage.getItem("pbst_report_draft");
        if (v) setF(JSON.parse(v)); else setError("작성 중인 보고서 내용이 없습니다. 입력 화면에서 다시 눌러 주세요.");
      } catch { setError("작성 중인 보고서 내용을 읽지 못했습니다."); }
      return;
    }
    axios.get(`${API_BASE_URL}/api/v1/behavior-log/${encodeURIComponent(id)}/report`)
      .then(r => setF(r.data))
      .catch(e => setError(e.response?.data?.detail || e.message || "보고서를 불러오지 못했습니다."));
  }, [id, draft]);

  const hwpx = `${API_BASE_URL}/api/v1/behavior-log/${encodeURIComponent(id)}/report.hwpx`;
  const blank = `${API_BASE_URL}/api/v1/behavior-log/report-template.hwpx`;

  return (
    <AuthCheck>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { .no-print { display: none !important; } body { background: #fff !important; } .sheet { box-shadow: none !important; margin: 0 !important; } }
      `}</style>
      <div style={{ background: "#e5e7eb", minHeight: "100vh", padding: "16px 0" }}>
        <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 12px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "0 12px" }}>
          <button onClick={() => (draft ? window.close() : window.history.back())} className="btn btn-secondary">{draft ? "✕ 닫기" : "← 돌아가기"}</button>
          <button onClick={() => window.print()} className="btn btn-primary" disabled={!f}>🖨️ PDF 인쇄</button>
          {!draft && <a href={hwpx} className="btn btn-secondary" style={{ textDecoration: "none" }}>⬇️ 한글 파일(기록 채움)</a>}
          {draft && <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#b45309" }}>저장 전 미리보기입니다 — 제출해야 기록이 남습니다.</span>}
          <a href={blank} className="btn btn-secondary" style={{ textDecoration: "none" }}>⬇️ 빈 양식(hwpx)</a>
          <span style={{ fontSize: "0.8rem", color: "#475569" }}>인쇄 창에서 &lsquo;PDF로 저장&rsquo;을 고르면 PDF가 됩니다. 인쇄 후 서명해 담당자에게 제출하세요.</span>
        </div>
        {f && (() => {
          const empty = [["A 배경/선행", f.A], ["C 후속결과", f.C], ["경위", f.경위], ["관찰기록", f.관찰기록], ["발생 시 지도교사", f.지도교사]].filter(([, v]) => !String(v || "").trim()).map(([k]) => k);
          return empty.length > 0 && (
            <div className="no-print" style={{ maxWidth: 794, margin: "0 auto 12px", padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: "0.85rem", color: "#92400e" }}>
              ⚠️ 비어 있는 칸: <b>{empty.join(", ")}</b> — 전체 로그나 결재함의 &lsquo;상세·수정&rsquo;에서 채운 뒤 인쇄하세요. (빈 칸은 인쇄 후 손으로 써도 됩니다.)
            </div>
          );
        })()}
        {error && <div className="no-print" style={{ maxWidth: 820, margin: "0 auto", color: "#dc2626", padding: 12 }}>⚠️ {error}</div>}
        {f && (
          <div className="sheet" style={{ background: "#fff", maxWidth: 794, margin: "0 auto", padding: "28px 30px", boxShadow: "0 2px 10px rgba(0,0,0,0.15)", color: "#000", fontFamily: "'Malgun Gothic', sans-serif" }}>
            <ReportSheet c={{ ...f, 보고사유: Object.entries(f.보고사유).map(([k, v]) => <span key={k} style={{ marginRight: 12, whiteSpace: "nowrap" }}>{v ? "☑" : "☐"} {k}</span>) }} />
            {f.법적의무확인 && <div style={{ fontSize: "8.5pt", marginTop: 6 }}>법적 의무 실행 확인: {f.법적의무확인}</div>}
            <div style={{ fontSize: "7.5pt", color: "#555", marginTop: 14, textAlign: "right" }}>PBST 기록번호 {f.기록번호}{f.상태 ? ` · 결재 상태 ${f.상태}` : ""}</div>
          </div>
        )}
      </div>
    </AuthCheck>
  );
}
