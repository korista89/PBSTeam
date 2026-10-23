"use client";

// 위기행동 지원 및 개별학생교육지원 보고서 양식(학교 최신판 18행 표)의 칸 배치.
// 작성 화면(BehaviorForm, edit)과 인쇄 화면(report/crisis/[id])이 이 한 컴포넌트를 같이 써서 칸 순서·이름·구획이 항상 같다.
import React from "react";

export type SheetCells = {
  소속: React.ReactNode; 학생: React.ReactNode; 담임교사: React.ReactNode; 보고사유: React.ReactNode;
  발생일시: React.ReactNode; 발생장소: React.ReactNode; 지도교사: React.ReactNode;
  지원시간: React.ReactNode; 지원장소: React.ReactNode; 지원교사: React.ReactNode;
  A: React.ReactNode; B: React.ReactNode; C: React.ReactNode; 경위: React.ReactNode; 관찰기록: React.ReactNode;
  조치사항: { 구분: string; 일시: React.ReactNode; 내용: React.ReactNode }[];
};

const th: React.CSSProperties = { border: "1px solid #000", background: "#f2f2f2", fontWeight: 700, padding: "5px 6px", textAlign: "center", verticalAlign: "middle", fontSize: "9.5pt" };
const tdBase: React.CSSProperties = { border: "1px solid #000", padding: "5px 7px", verticalAlign: "top", fontSize: "9.5pt", whiteSpace: "pre-wrap", wordBreak: "break-word" };
const hint: React.CSSProperties = { fontWeight: 400, fontSize: "7.5pt" };

export default function ReportSheet({ c, edit }: { c: SheetCells; edit?: boolean }) {
  // 인쇄는 양식처럼 칸 높이를 고정하고, 작성 화면은 입력 줄 수만큼 늘어난다.
  const td: React.CSSProperties = edit ? { ...tdBase, padding: 3, whiteSpace: "normal" } : tdBase;
  const big = (h: number): React.CSSProperties => (edit ? td : { ...td, height: h });
  return (
    <>
      <h1 style={{ textAlign: "center", fontSize: "16pt", margin: "0 0 4px", letterSpacing: 1 }}>위기행동 지원 및 개별학생교육지원 보고서</h1>
      <div style={{ textAlign: "center", fontSize: "8.5pt", marginBottom: 10 }}>■ 발생 시 지도교사 작성 &nbsp; ■ 개별학생교육지원 교사 작성 &nbsp; ■ 담임교사 작성</div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", color: "#000", background: "#fff" }}>
        <colgroup><col style={{ width: "4%" }} /><col style={{ width: "15%" }} /><col style={{ width: "23%" }} /><col style={{ width: "12%" }} /><col style={{ width: "20%" }} /><col style={{ width: "12%" }} /><col style={{ width: "14%" }} /></colgroup>
        <tbody>
          <tr><th style={th} colSpan={2}>소속</th><td style={td}>{c.소속}</td><th style={th}>학생</th><td style={td}>{c.학생}</td><th style={th}>담임교사</th><td style={td}>{c.담임교사}</td></tr>
          <tr><th style={th} colSpan={2}>보고 사유</th><td style={td} colSpan={5}>{c.보고사유}</td></tr>
          <tr><th style={th} colSpan={2}>행동발생 일시</th><td style={td}>{c.발생일시}</td><th style={th}>발생 장소</th><td style={td}>{c.발생장소}</td><th style={th}>발생 시<br />지도교사</th><td style={td}>{c.지도교사}</td></tr>
          <tr><th style={th} colSpan={2}>개별학생<br />교육지원 시간</th><td style={td}>{c.지원시간}</td><th style={th}>장소</th><td style={td}>{c.지원장소}</td><th style={th}>교사(시간)</th><td style={td}>{c.지원교사}</td></tr>
          <tr><th style={th}>A</th><th style={th}>배경/선행사건<br />(요약)</th><td style={big(56)} colSpan={5}>{c.A}</td></tr>
          <tr><th style={th}>B</th><th style={th}>나타난 위기행동<br />(구체적 서술)</th><td style={big(56)} colSpan={5}>{c.B}</td></tr>
          <tr><th style={th}>C</th><th style={th}>후속결과<br />(요약)</th><td style={big(56)} colSpan={5}>{c.C}</td></tr>
          <tr><th style={th} colSpan={2}>개별학생교육지원<br />경위<div style={hint}>행동 발생부터 결정·이동·제지까지 시간 순서대로</div></th><td style={big(120)} colSpan={5}>{c.경위}</td></tr>
          <tr><th style={th} colSpan={2}>개별학생교육지원<br />관찰기록<div style={hint}>지도 장소 도착부터 진정·회복·복귀까지</div></th><td style={big(100)} colSpan={5}>{c.관찰기록}</td></tr>
          <tr><th style={th} colSpan={2} rowSpan={c.조치사항.length + 1}>발생 이후<br />조치 사항</th><th style={th}>구분</th><th style={th}>일시</th><th style={th} colSpan={3}>내용</th></tr>
          {c.조치사항.map(r => (
            <tr key={r.구분}><th style={th}>{["관리자 보고", "학부모 알림"].includes(r.구분) ? "* " : ""}{r.구분}</th><td style={td}>{r.일시}</td><td style={td} colSpan={3}>{r.내용}</td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: "8pt", marginTop: 4 }}>* 관리자 보고·학부모 알림은 당일 이행해야 하는 법적 의무입니다.</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18, fontSize: "10pt" }}>
        <tbody><tr>
          {["발생 시 지도교사", "개별학생교육지원 교사", "담임교사"].map(r => (
            <td key={r} style={{ padding: "6px 4px" }}>{r}: <span style={{ display: "inline-block", minWidth: 70, borderBottom: "1px solid #000" }}>&nbsp;</span> (서명)</td>
          ))}
        </tr></tbody>
      </table>
    </>
  );
}
