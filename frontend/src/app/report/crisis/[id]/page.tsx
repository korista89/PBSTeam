"use client";

// 위기행동 지원 및 개별학생교육지원 보고서 — 학교 양식과 같은 칸 배치로 기록을 채워 보여주고,
// 브라우저 인쇄(PDF 저장)·한글(hwpx) 내려받기를 한다. 인쇄 뒤 서명해 담당자에게 제출한다.
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "next/navigation";
import { API_BASE_URL } from "../../../constants";
import { AuthCheck } from "../../../components/AuthProvider";

type Fields = {
  기록번호: string; 소속: string; 학생: string; 담임교사: string; 보고사유: Record<string, boolean>;
  발생일시: string; 발생장소: string; 지도교사: string; 지원시간: string; 지원장소: string; 지원교사: string;
  A: string; B: string; C: string; 경위: string; 관찰기록: string; 법적의무확인: string; 상태: string;
  조치사항: { 구분: string; 일시: string; 내용: string }[];
};

const th: React.CSSProperties = { border: "1px solid #000", background: "#f2f2f2", fontWeight: 700, padding: "5px 6px", textAlign: "center", verticalAlign: "middle", fontSize: "9.5pt" };
const td: React.CSSProperties = { border: "1px solid #000", padding: "5px 7px", verticalAlign: "top", fontSize: "9.5pt", whiteSpace: "pre-wrap", wordBreak: "break-word" };
const big = (h: number): React.CSSProperties => ({ ...td, height: h });

export default function CrisisReportPage() {
  const params = useParams();
  const id = decodeURIComponent(params.id as string);
  const [f, setF] = useState<Fields | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/v1/behavior-log/${encodeURIComponent(id)}/report`)
      .then(r => setF(r.data))
      .catch(e => setError(e.response?.data?.detail || e.message || "보고서를 불러오지 못했습니다."));
  }, [id]);

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
          <button onClick={() => window.history.back()} className="btn btn-secondary">← 돌아가기</button>
          <button onClick={() => window.print()} className="btn btn-primary" disabled={!f}>🖨️ PDF 인쇄</button>
          <a href={hwpx} className="btn btn-secondary" style={{ textDecoration: "none" }}>⬇️ 한글 파일(기록 채움)</a>
          <a href={blank} className="btn btn-secondary" style={{ textDecoration: "none" }}>⬇️ 빈 양식(hwpx)</a>
          <span style={{ fontSize: "0.8rem", color: "#475569" }}>인쇄 창에서 &lsquo;PDF로 저장&rsquo;을 고르면 PDF가 됩니다. 인쇄 후 서명해 담당자에게 제출하세요.</span>
        </div>
        {error && <div className="no-print" style={{ maxWidth: 820, margin: "0 auto", color: "#dc2626", padding: 12 }}>⚠️ {error}</div>}
        {f && (
          <div className="sheet" style={{ background: "#fff", maxWidth: 794, margin: "0 auto", padding: "28px 30px", boxShadow: "0 2px 10px rgba(0,0,0,0.15)", color: "#000", fontFamily: "'Malgun Gothic', sans-serif" }}>
            <h1 style={{ textAlign: "center", fontSize: "16pt", margin: "0 0 4px", letterSpacing: 1 }}>위기행동 지원 및 개별학생교육지원 보고서</h1>
            <div style={{ textAlign: "center", fontSize: "8.5pt", marginBottom: 10 }}>■ 발생 시 지도교사 작성 &nbsp; ■ 개별학생교육지원 교사 작성 &nbsp; ■ 담임교사 작성</div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup><col style={{ width: "4%" }} /><col style={{ width: "15%" }} /><col style={{ width: "23%" }} /><col style={{ width: "12%" }} /><col style={{ width: "20%" }} /><col style={{ width: "12%" }} /><col style={{ width: "14%" }} /></colgroup>
              <tbody>
                <tr><th style={th} colSpan={2}>소속</th><td style={td}>{f.소속}</td><th style={th}>학생</th><td style={td}>{f.학생}</td><th style={th}>담임교사</th><td style={td}>{f.담임교사}</td></tr>
                <tr><th style={th} colSpan={2}>보고 사유</th>
                  <td style={td} colSpan={5}>{Object.entries(f.보고사유).map(([k, v]) => <span key={k} style={{ marginRight: 12, whiteSpace: "nowrap" }}>{v ? "☑" : "☐"} {k}</span>)}</td></tr>
                <tr><th style={th} colSpan={2}>행동발생 일시</th><td style={td}>{f.발생일시}</td><th style={th}>발생 장소</th><td style={td}>{f.발생장소}</td><th style={th}>발생 시<br />지도교사</th><td style={td}>{f.지도교사}</td></tr>
                <tr><th style={th} colSpan={2}>개별학생<br />교육지원 시간</th><td style={td}>{f.지원시간}</td><th style={th}>장소</th><td style={td}>{f.지원장소}</td><th style={th}>교사(시간)</th><td style={td}>{f.지원교사}</td></tr>
                <tr><th style={th}>A</th><th style={th}>배경/선행사건<br />(요약)</th><td style={big(56)} colSpan={5}>{f.A}</td></tr>
                <tr><th style={th}>B</th><th style={th}>나타난 위기행동<br />(구체적 서술)</th><td style={big(56)} colSpan={5}>{f.B}</td></tr>
                <tr><th style={th}>C</th><th style={th}>후속결과<br />(요약)</th><td style={big(56)} colSpan={5}>{f.C}</td></tr>
                <tr><th style={th} colSpan={2}>개별학생교육지원<br />경위<div style={{ fontWeight: 400, fontSize: "7.5pt" }}>행동 발생부터 결정·이동·제지까지 시간 순서대로</div></th><td style={big(120)} colSpan={5}>{f.경위}</td></tr>
                <tr><th style={th} colSpan={2}>개별학생교육지원<br />관찰기록<div style={{ fontWeight: 400, fontSize: "7.5pt" }}>지도 장소 도착부터 진정·회복·복귀까지</div></th><td style={big(100)} colSpan={5}>{f.관찰기록}</td></tr>
                <tr><th style={th} colSpan={2} rowSpan={f.조치사항.length + 1}>발생 이후<br />조치 사항</th><th style={th}>구분</th><th style={th}>일시</th><th style={th} colSpan={3}>내용</th></tr>
                {f.조치사항.map(r => (
                  <tr key={r.구분}><th style={th}>{["관리자 보고", "학부모 알림"].includes(r.구분) ? "* " : ""}{r.구분}</th><td style={td}>{r.일시}</td><td style={td} colSpan={3}>{r.내용}</td></tr>
                ))}
              </tbody>
            </table>
            {f.법적의무확인 && <div style={{ fontSize: "8.5pt", marginTop: 6 }}>법적 의무 실행 확인: {f.법적의무확인}</div>}
            <div style={{ fontSize: "8pt", marginTop: 4 }}>* 관리자 보고·학부모 알림은 당일 이행해야 하는 법적 의무입니다.</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18, fontSize: "10pt" }}>
              <tbody><tr>
                {["발생 시 지도교사", "개별학생교육지원 교사", "담임교사"].map(r => (
                  <td key={r} style={{ padding: "6px 4px" }}>{r}: <span style={{ display: "inline-block", minWidth: 70, borderBottom: "1px solid #000" }}>&nbsp;</span> (서명)</td>
                ))}
              </tr></tbody>
            </table>
            <div style={{ fontSize: "7.5pt", color: "#555", marginTop: 14, textAlign: "right" }}>PBST 기록번호 {f.기록번호}{f.상태 ? ` · 결재 상태 ${f.상태}` : ""}</div>
          </div>
        )}
      </div>
    </AuthCheck>
  );
}
