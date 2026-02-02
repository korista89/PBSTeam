"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  PieChart, Pie, Cell, Legend, ResponsiveContainer
} from "recharts";
import { DashboardData } from "../types";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function MonthlyReport() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const today = new Date();
  const prev = new Date();
  prev.setDate(today.getDate() - 28);

  const [startDate, setStartDate] = useState(prev.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [queryStartDate, setQueryStartDate] = useState(prev.toISOString().split('T')[0]);
  const [queryEndDate, setQueryEndDate] = useState(today.toISOString().split('T')[0]);

  const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        let url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/analytics/dashboard`;
        const params = new URLSearchParams();
        if (queryStartDate) params.append("start_date", queryStartDate);
        if (queryEndDate) params.append("end_date", queryEndDate);
        if (params.toString()) url += `?${params.toString()}`;

        const response = await axios.get(url);
        setData(response.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [queryStartDate, queryEndDate]);

 // ...

  return (
    <div className="report-container" style={{ padding: '20px', maxWidth: '210mm', margin: '0 auto', backgroundColor: 'white' }}>
      {/* ... styles ... */}
      
      {/* Controller */}
      <div className="no-print" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => window.history.back()} style={{ padding: '8px 16px', cursor: 'pointer' }}>← 뒤로가기</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                ~
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '6px', border: '1px solid #ddd', borderRadius: '4px' }} />
                <button 
                    onClick={() => {
                        setQueryStartDate(startDate);
                        setQueryEndDate(endDate);
                    }}
                    style={{ padding: '6px 12px', backgroundColor: '#4b5563', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                    🔍 조회
                </button>
            </div>
        </div>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🖨️ 리포트 인쇄 / PDF 저장</button>
      </div>

      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1>🏫 Tier 1: 학교 행동 지원 종합 리포트 (월간)</h1>
        <p style={{ color: '#666' }}>발행일: {date} | 작성주체: PBS 리더십팀</p>
      </header>

      {/* 0. AI Insight */}
      {data.ai_comment && (
          <section className="report-section" style={{ backgroundColor: '#f5f3ff', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
            <h2 style={{ marginTop: 0, borderLeft: 'none', paddingLeft: 0, color: '#6d28d9' }}>🤖 AI 행동 분석 요약</h2>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.5' }}>
                {data.ai_comment}
            </div>
          </section>
      )}

      {/* 1. Summary */}
      <section className="report-section">
        <h2>1. 총괄 현황 (Overview)</h2>
        <div className="summary-stats">
            <div className="stat-box">
                <div className="stat-value">{data.summary.total_incidents}건</div>
                <div className="stat-label">총 행동 발생 (ODR)</div>
            </div>
            <div className="stat-box">
                <div className="stat-value">{data.summary.avg_intensity.toFixed(2)}</div>
                <div className="stat-label">평균 행동 강도 (1-5)</div>
            </div>
            <div className="stat-box">
                <div className="stat-value" style={{color: '#ef4444'}}>{data.summary.risk_student_count}명</div>
                <div className="stat-label">집중 지원 대상 (Tier 2/3)</div>
            </div>
        </div>
      </section>

      {/* 2. Tier 1 Big 5 */}
      <section className="report-section">
        <h2>2. 학교 전체 패턴 (Big 5 Analysis)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
             <div style={{ flex: 1, minWidth: '300px', height: '250px' }}>
                <h3>주요 발생 장소</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.big5.locations} layout="vertical" margin={{left: 20}}>
                        <CartesianGrid strokeDasharray="3 3"/>
                        <XAxis type="number"/>
                        <YAxis dataKey="name" type="category" width={80} style={{fontSize:'12px'}}/>
                        <Bar dataKey="value" fill="#3b82f6" barSize={20}>
                            <LabelList dataKey="value" position="right" fontSize={12}/>
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
             </div>
             <div style={{ flex: 1, minWidth: '300px', height: '250px' }}>
                <h3>주요 행동 유형</h3>
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data.big5.behaviors}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            label={({name, value}) => `${name} (${value})`}
                        >
                            {data.big5.behaviors.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Legend wrapperStyle={{fontSize: '11px'}}/>
                    </PieChart>
                 </ResponsiveContainer>
             </div>
        </div>
        <div style={{ marginTop: '20px' }}>
            <h3>* 데이터 해석 및 제언</h3>
            <div style={{ border: '1px solid #ddd', padding: '10px', borderRadius: '4px', backgroundColor: '#fafafa', fontSize: '12px', minHeight: '60px' }}>
                (여기에 교사 회의 코멘트를 수기 작성하거나, 시스템이 자동 생성한 인사이트가 표시됩니다.)
            </div>
        </div>
      </section>

      <div className="page-break"></div>

      {/* 3. Tier 2/3 List */}
      <section className="report-section">
        <h2>3. 학생 지원 현황 (Tier 2 & 3 Support)</h2>
        
        <h3>🚨 고위험군 안전 알림 (Safety Alerts - Last 30 Days)</h3>
        {data.safety_alerts && data.safety_alerts.length > 0 ? (
            <table style={{ marginBottom: '20px' }}>
                <thead>
                    <tr>
                        <th style={{width: '20%'}}>날짜</th>
                        <th style={{width: '20%'}}>학생</th>
                        <th>내용</th>
                        <th style={{width: '10%'}}>강도</th>
                    </tr>
                </thead>
                <tbody>
                    {data.safety_alerts.map((alert, idx) => (
                        <tr key={idx}>
                            <td>{alert.date}</td>
                            <td>{alert.student}</td>
                            <td>{alert.location}에서 {alert.type}</td>
                            <td style={{color:'#ef4444', fontWeight:'bold'}}>{alert.intensity}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        ) : (
            <p style={{fontSize: '12px', color: '#666', marginBottom:'20px'}}>해당 기간 동안 보고된 고위험(강도 5) 행동이 없습니다.</p>
        )}

        <h3>⚠️ 소그룹/개별 지원 대상자 (Screening List)</h3>
        <table>
             <thead>
                <tr>
                    <th style={{width: '15%'}}>Tier</th>
                    <th style={{width: '20%'}}>학생명</th>
                    <th style={{width: '20%'}}>학급</th>
                    <th style={{width: '15%'}}>발생횟수 (월)</th>
                    <th>비고</th>
                </tr>
            </thead>
            <tbody>
                {data.risk_list.map((s, idx) => (
                    <tr key={idx}>
                        <td>
                            <span style={{
                                padding:'2px 6px', borderRadius:'4px', fontSize:'10px',
                                backgroundColor: s.tier === 'Tier 3' ? '#fee2e2' : '#fef3c7',
                                color: s.tier === 'Tier 3' ? '#991b1b' : '#92400e'
                            }}>
                                {s.tier}
                            </span>
                        </td>
                        <td>{s.name}</td>
                        <td>{s.class}</td>
                        <td>{s.count}</td>
                        <td></td>
                    </tr>
                ))}
            </tbody>
        </table>
      </section>

      {/* 4. Action Plan */}
      <section className="report-section" style={{ borderBottom: 'none' }}>
        <h2>4. 이달의 실행 계획 (Action Plan)</h2>
        <div style={{ border: '1px dashed #bbb', padding: '20px', minHeight: '150px' }}>
            <p style={{ color: '#999', fontSize: '12px' }}>* 회의 중 결정된 사항을 기록하십시오.</p>
            <ul style={{ marginTop: '10px' }}>
                <li style={{ marginBottom: '10px' }}>__________________________________________________________________________</li>
                <li style={{ marginBottom: '10px' }}>__________________________________________________________________________</li>
                <li style={{ marginBottom: '10px' }}>__________________________________________________________________________</li>
            </ul>
        </div>
      </section>

    </div>
  );
}
