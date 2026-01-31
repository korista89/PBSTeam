"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { DashboardData, RiskStudent } from "../../types";

export default function Tier2Report() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  interface ActiveCase {
    name: string;
    class: string;
    start_date: string;
    goal: string;
    current: string;
    status: string;
  }

  // Mock State for Active Cases
  const [activeCases] = useState<ActiveCase[]>([
      { name: "김철수", class: "초등 3학년 1반", start_date: "2025-01-10", goal: "80%", current: "75%", status: "Monitor" },
      { name: "이영희", class: "초등 5학년 2반", start_date: "2025-01-15", goal: "80%", current: "85%", status: "Fade" }
  ]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get("http://localhost:8000/api/v1/analytics/dashboard");
        setData(response.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div>리포트 생성 중...</div>;
  if (!data) return <div>데이터 없음</div>;

  return (
    <div className="report-container" style={{ padding: '20px', maxWidth: '210mm', margin: '0 auto', backgroundColor: 'white' }}>
      <style jsx global>{`
        @media print {
            body { background: white; -webkit-print-color-adjust: exact; }
            .no-print { display: none; }
            .page-break { page-break-before: always; }
        }
        .report-section { margin-bottom: 2rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
        h1 { font-size: 24px; font-weight: bold; margin-bottom: 10px; color: #d97706; }
        h2 { font-size: 18px; color: #333; border-left: 5px solid #f59e0b; padding-left: 10px; margin: 20px 0 10px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
        th { background-color: #fffbeb; color: #92400e; }
        .btn-small { padding: 4px 8px; font-size: 11px; border-radius: 4px; border: 1px solid #ddd; cursor: pointer; background: white; }
        .status-badge { padding: 2px 6px; border-radius: 4px; color: white; font-weight: bold; font-size: 10px; }
      `}</style>

      {/* Controller */}
      <div className="no-print" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => window.history.back()} style={{ padding: '8px 16px', cursor: 'pointer' }}>← 뒤로가기</button>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🖨️ 리포트 인쇄</button>
      </div>

      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1>📊 Tier 2: 소그룹 중재 지원 리포트 (CICO)</h1>
        <p style={{ color: '#666' }}>발행일: {date} | CICO 코디네이터 작성</p>
      </header>

      {/* 1. Screening */}
      <section className="report-section">
        <h2>1. 대상자 선별 (Screening)</h2>
        <p style={{fontSize:'12px', color:'#666', marginBottom:'10px'}}>* 데이터 기준: 월 3회 이상 행동 발생 또는 강도 4 이상 사건</p>
        <table>
            <thead>
                <tr>
                    <th>학생명</th>
                    <th>학급</th>
                    <th>발생 횟수</th>
                    <th>최대 강도</th>
                    <th>추천 중재</th>
                    <th>관리</th>
                </tr>
            </thead>
            <tbody>
                {data.risk_list.filter((s: RiskStudent) => s.tier !== 'Tier 1').map((s: RiskStudent, idx: number) => (
                    <tr key={idx}>
                        <td style={{fontWeight:'bold'}}>{s.name}</td>
                        <td>{s.class}</td>
                        <td>{s.count}회</td>
                        <td>{s.max_intensity}점</td>
                        <td>CICO (Check-in/Check-out)</td>
                        <td>
                            <button className="btn-small" style={{backgroundColor:'#ecfdf5', color:'#065f46'}}>+ 대상 등록</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        {data.risk_list.filter((s: RiskStudent) => s.tier !== 'Tier 1').length === 0 && <p style={{textAlign:'center', fontSize:'12px'}}>신규 추천 대상자가 없습니다.</p>}
      </section>

      {/* 2. Active Cases */}
      <section className="report-section">
        <h2>2. 진행 중인 중재 현황 (Active Monitoring)</h2>
        <table>
            <thead>
                <tr>
                    <th>학생명</th>
                    <th>학급</th>
                    <th>시작일</th>
                    <th>목표 달성률 (80% 기준)</th>
                    <th>현재 상태</th>
                    <th>의사결정</th>
                </tr>
            </thead>
            <tbody>
                {activeCases.map((s, idx) => (
                    <tr key={idx}>
                        <td>{s.name}</td>
                        <td>{s.class}</td>
                        <td>{s.start_date}</td>
                        <td>
                            <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:'5px'}}>
                                <div style={{width:'50px', height:'6px', background:'#eee', borderRadius:'3px'}}>
                                    <div style={{width: s.current, height:'100%', background: parseInt(s.current) >= 80 ? '#10b981' : '#ef4444', borderRadius:'3px'}}></div>
                                </div>
                                <span>{s.current}</span>
                            </div>
                        </td>
                        <td>
                            <span className="status-badge" style={{ backgroundColor: s.status === 'Fade' ? '#10b981' : '#3b82f6' }}>{s.status}</span>
                        </td>
                        <td>
                            <button className="btn-small">수정/종결</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </section>

      {/* 3. Decision Making */}
      <section className="report-section" style={{ borderBottom: 'none' }}>
        <h2>3. 팀 협의 및 의사결정 (Team Meeting Log)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '4px' }}>
                <h3 style={{fontSize:'14px', margin:'0 0 10px 0'}}>✅ 유지/종결 (Continue/Fade)</h3>
                <textarea style={{width:'100%', height:'80px', border:'1px solid #eee', fontSize:'12px', padding:'5px'}} placeholder="목표를 달성한 학생들에 대한 점진적 퇴거(Fading) 계획..."></textarea>
            </div>
            <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '4px' }}>
                <h3 style={{fontSize:'14px', margin:'0 0 10px 0'}}>⚠️ 수정/심화 (Modify/Tier 3)</h3>
                <textarea style={{width:'100%', height:'80px', border:'1px solid #eee', fontSize:'12px', padding:'5px'}} placeholder="반응이 없는(Non-responder) 학생에 대한 중재 수정 또는 기능평가(FBA) 의뢰..."></textarea>
            </div>
        </div>
      </section>

    </div>
  );
}
