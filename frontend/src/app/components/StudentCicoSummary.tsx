"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../lib/api";

type Goal = { code: string; target_behavior: string; rate: string; decision: string; goal_criteria: string };

/** CICO 원본 보고서의 목표별 결과를 그대로 보여 준다. */
export default function StudentCicoSummary({ studentCode }: { studentCode: string }) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; goals: Goal[] }>({ status: "loading", goals: [] });
  const month = Number(new Date(Date.now() + 9 * 3600000).toISOString().slice(5, 7));
  useEffect(() => {
    let active = true;
    setState({ status: "loading", goals: [] });
    axios.get(`${API_BASE_URL}/api/v1/cico/report`, { params: { month } }).then(r => {
      if (active) setState({ status: "ready", goals: (r.data.students || []).filter((s: Goal) => String(s.code) === studentCode) });
    }).catch(e => {
      if (active) setState({ status: e.response?.status === 404 ? "ready" : "error", goals: [] });
    });
    return () => { active = false; };
  }, [studentCode, month]);
  return <section className="card" style={{ padding: 16 }}>
    <h3 style={{ margin: "0 0 8px" }}>📝 {month}월 CICO 현황</h3>
    {state.status === "loading" && <p>불러오는 중입니다.</p>}
    {state.status === "error" && <p>자료를 불러오지 못했습니다. CICO 관리에서 다시 확인하세요.</p>}
    {state.status === "ready" && !state.goals.length && <p>이번 달 등록된 CICO 목표가 없습니다. 이전 기록은 CICO 관리에서 확인하세요.</p>}
    {state.goals.map((goal, i) => <div key={`${goal.target_behavior}-${i}`} style={{ margin: "8px 0" }}>
      <b>{goal.target_behavior || "목표 미입력"}</b> · 수행률 {goal.rate || "기록 없음"} · 기준 {goal.goal_criteria || "미설정"}<br />
    </div>)}
    <p style={{ color: "#64748b", fontSize: "0.8rem" }}>자동 제안은 참고자료입니다. 기록량과 학생의 상황을 함께 검토하세요.</p>
    <a href={`/cico-record?student=${encodeURIComponent(studentCode)}`}>CICO 기록과 목표 확인 →</a>
  </section>;
}
