"use client";

import React, { useState } from "react";
import axios from "axios";

const apiUrl = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_URL || "") : "";

// ====== 차트별 AI 해석 버튼 (모달 기본, onResult 전달 시 도킹 패널로 출력) ======
export default function SectionAIButton({
  sectionName,
  title,
  dataContext,
  startDate,
  endDate,
  buttonLabel = "📊 차트 해석",
  modalLabel,
  onResult
}: {
  sectionName: string;
  title: string;
  dataContext: any;
  startDate: string;
  endDate: string;
  buttonLabel?: string;
  modalLabel?: string;
  onResult?: (state: { title: string; loading: boolean; text: string }) => void;
}) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleRequest = async () => {
    setLoading(true);
    if (onResult) onResult({ title, loading: true, text: "" });
    else setOpen(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-section-analysis`, {
        section_name: sectionName,
        data_context: dataContext || {},
        start_date: startDate || null,
        end_date: endDate || null
      }, { timeout: 180000 });
      const text = res.data.analysis || "분석 결과가 없습니다.";
      setAnalysis(text);
      if (onResult) onResult({ title, loading: false, text });
    } catch (e: any) {
      const errDetail = typeof e?.response?.data?.detail === "string"
        ? e.response.data.detail
        : Array.isArray(e?.response?.data?.detail)
          ? e.response.data.detail.map((d: any) => d.msg).join(", ")
          : e?.message || "요청 실패";
      const errText = `⚠️ AI 영역별 정밀 분석 요청 실패. (${errDetail})`;
      setAnalysis(errText);
      if (onResult) onResult({ title, loading: false, text: errText });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleRequest}
        style={{
          padding: '6px 12px',
          background: '#fff',
          color: '#dc2626',
          border: '2.5px solid #ef4444',
          borderRadius: '10px',
          fontSize: '0.78rem',
          fontWeight: 800,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          transition: 'all 0.2s'
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.background = '#fef2f2';
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.background = '#fff';
        }}
      >
        <span>🤖</span> {loading ? "분석 중..." : buttonLabel}
      </button>

      {!onResult && open && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '20px'
        }}>
          <div style={{
            background: '#fff', borderRadius: '24px',
            maxWidth: '850px', width: '100%', maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '2.5px solid #ef4444',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px 28px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'linear-gradient(135deg, #fff5f5, #ffffff)'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🤖 {modalLabel || `${title} 차트 해석`}
              </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleRequest} style={{ padding: '6px 14px', borderRadius: '8px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>🔄 새로고침</button>
                <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
            <div style={{ padding: '28px', overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', lineHeight: '1.85', fontSize: '0.95rem', color: '#334155' }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#ef4444' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '16px', animation: 'pulse 1.5s infinite' }}>🧠</div>
                  <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{title} 데이터를 바탕으로 BCBA 정밀 분석 중입니다...</p>
                </div>
              ) : (
                analysis
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
