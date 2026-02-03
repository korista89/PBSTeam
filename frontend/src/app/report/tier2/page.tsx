"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { DashboardData, RiskStudent } from "../../types";
import { AuthCheck } from "../../components/AuthProvider";
import GlobalNav, { useDateRange } from "../../components/GlobalNav";

export default function CICOReport() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  // Date State from GlobalNav (localStorage)
  const { startDate, endDate } = useDateRange();

  useEffect(() => {
    if (!startDate || !endDate) return;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const params = new URLSearchParams();
        params.append("start_date", startDate);
        params.append("end_date", endDate);
        
        const response = await axios.get(`${apiUrl}/api/v1/analytics/dashboard?${params.toString()}`);
        setData(response.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [startDate, endDate]);

  if (loading) return (
    <AuthCheck>
      <GlobalNav currentPage="report-tier2" />
      <div style={{ padding: '50px', textAlign: 'center' }}>리포트 생성 중...</div>
    </AuthCheck>
  );
  if (!data) return (
    <AuthCheck>
      <GlobalNav currentPage="report-tier2" />
      <div style={{ padding: '50px', textAlign: 'center' }}>데이터 없음</div>
    </AuthCheck>
  );

  // Mock CICO Logic for Demo (Since DB doesn't have daily points yet)
  const cicoData = data.risk_list.filter((s: RiskStudent) => s.tier !== 'Tier 1').map(s => {
      // Mock Goal % based on tier for demonstration
      // Tier 3 students have lower success rate (simulated)
      const isTier3 = s.tier === 'Tier 3';
      const goalPercent = 80;
      const actualPercent = isTier3 ? 45 : 85; 
      
      let decision = "Maintain CICO";
      let decisionColor = "#3b82f6"; // Blue
      
      if (actualPercent >= goalPercent) {
          decision = "Fade & Graduation (Tier 1)";
          decisionColor = "#10b981"; // Green
      } else if (actualPercent < 50 && isTier3) {
          decision = "Consider FBA / Tier 3";
          decisionColor = "#ef4444"; // Red
      } else if (actualPercent < 50) {
          decision = "Modify CICO / Tier 3";
          decisionColor = "#f59e0b"; // Orange
      }

      return {
          ...s,
          goalPercent,
          actualPercent,
          decision,
          decisionColor
      };
  });

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
        .status-badge { padding: 3px 8px; border-radius: 12px; color: white; font-weight: bold; font-size: 11px; }
      `}</style>
      
      {/* Controller */}
      <div className="no-print" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: '#666' }}>분석 기간: {startDate} ~ {endDate}</span>
        </div>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🖨️ 리포트 인쇄</button>
      </div>

      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1>📊 CICO 리포트: 행동 중재 의사결정 (4주)</h1>
        <p style={{ color: '#666' }}>분석 기간: {startDate} ~ {endDate} | 작성자: 행동중재지원팀</p>
      </header>

      {/* 1. Decision Making Table */}
      <section className="report-section">
        <h2>1. CICO 성과 분석 및 의사결정 (Decision Making)</h2>
        <p style={{fontSize:'12px', color:'#666', marginBottom:'10px'}}>
            * 의사결정 기준: 목표 달성률 80% 이상 지속 시 상향(Fade), 50% 미만 시 하향/수정(Modify/Tier3) 고려
        </p>
        <table>
            <thead>
                <tr>
                    <th>학생명</th>
                    <th>학급</th>
                    <th>최근 4주 목표 (Goal)</th>
                    <th>실제 달성률 (Actual)</th>
                    <th>성과 그래프</th>
                    <th>시스템 제안 (Decision)</th>
                    <th>비고</th>
                </tr>
            </thead>
            <tbody>
                {cicoData.map((s, idx) => (
                    <tr key={idx}>
                        <td style={{fontWeight:'bold'}}>{s.name}</td>
                        <td>{s.class}</td>
                        <td>{s.goalPercent}%</td>
                        <td style={{fontWeight:'bold', color: s.actualPercent >= s.goalPercent ? '#10b981' : '#ef4444'}}>
                            {s.actualPercent}%
                        </td>
                        <td style={{width: '200px'}}>
                             <div style={{width:'100%', height:'8px', background:'#eee', borderRadius:'4px', overflow: 'hidden'}}>
                                <div style={{width: `${s.actualPercent}%`, height:'100%', background: s.decisionColor, borderRadius:'4px'}}></div>
                            </div>
                        </td>
                        <td>
                            <span className="status-badge" style={{ backgroundColor: s.decisionColor }}>{s.decision}</span>
                        </td>
                        <td>
                            <button className="btn-small" onClick={() => window.open(`/student/${s.name}`, '_blank')}>상세 보기</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        {cicoData.length === 0 && <p style={{textAlign:'center', fontSize:'12px', padding: '20px'}}>분석 기간 내 대상 학생 데이터가 없습니다.</p>}
      </section>

      {/* 2. Meeting Log */}
      <section className="report-section" style={{ borderBottom: 'none' }}>
        <h2>2. 팀 협의록 (Team Meeting Minutes)</h2>
        <div style={{ border: '1px solid #ddd', padding: '20px', minHeight: '200px' }}>
             <p style={{fontWeight:'bold', marginBottom:'10px'}}>📅 회의 일시: {new Date().toLocaleDateString()}</p>
             <p style={{fontWeight:'bold', marginBottom:'5px'}}>📝 주요 논의 사항:</p>
             <ul style={{listStyleType: 'circle', paddingLeft: '20px', marginBottom: '20px'}}>
                <li style={{marginBottom: '5px'}}>목표 도달 학생 ({cicoData.filter(x => x.actualPercent >= x.goalPercent).length}명)에 대한 보상 및 졸업(Fade) 계획 수립</li>
                <li style={{marginBottom: '5px'}}>중재 반응 저조 학생 ({cicoData.filter(x => x.actualPercent < x.goalPercent).length}명)에 대한 중재 수정 또는 기능평가 의뢰 논의</li>
             </ul>
             
             <div style={{display:'flex', gap:'20px'}}>
                 <div style={{flex:1, border:'1px dashed #ccc', padding:'10px', height: '150px'}}>
                    <span style={{fontSize:'12px', color:'#999'}}>행동 중재 전략 수정 내용 (수기 작성)</span>
                 </div>
                 <div style={{flex:1, border:'1px dashed #ccc', padding:'10px', height: '150px'}}>
                    <span style={{fontSize:'12px', color:'#999'}}>교사/학부모 소통 계획 (수기 작성)</span>
                 </div>
             </div>
        </div>
      </section>

    </div>
  );
}
