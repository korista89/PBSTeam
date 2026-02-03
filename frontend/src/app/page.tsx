"use client";

import styles from "./page.module.css";
import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  LineChart,
  Line,
} from "recharts";

import { DashboardData, ChartData, RiskStudent, SafetyAlert } from "./types";
import { AuthCheck } from "./components/AuthProvider";
import GlobalNav, { useDateRange } from "./components/GlobalNav";

// Colors for charts
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d", "#ffc658"];
const TIER_COLORS: { [key: string]: string } = { 
  "Tier 1": "#10B981", 
  "Tier2(CICO)": "#F59E0B", 
  "Tier2(SST)": "#1976d2",
  "Tier 2": "#F59E0B",  // Legacy
  "Tier 3": "#EF4444",
  "Tier3+": "#4a148c"
};

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Date State from GlobalNav (localStorage)
  const { startDate, endDate } = useDateRange();

  useEffect(() => {
    // Fetch data when dates are available
    if (!startDate || !endDate) return;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        let url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/analytics/dashboard`;
        const params = new URLSearchParams();
        params.append("start_date", startDate);
        params.append("end_date", endDate);
        
        url += `?${params.toString()}`;

        const response = await axios.get(url);
        setData(response.data);
      } catch (err) {
        console.error(err);
        setError("데이터를 불러오는데 실패했습니다. 백엔드 연결을 확인해주세요.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [startDate, endDate]);

  // Removed early return for loading to prevent UI unmount
  
  if (error) return <div className={styles.error}>{error}</div>;

  // Initial data check (first load)
  if (!data && loading) return <div className={styles.loading}>데이터 분석 중... 🧠</div>;
  if (!data) return null;

  // Handle API error response
  if ('error' in data) {
      return (
          <AuthCheck>
          <div className={styles.container}>
              <GlobalNav currentPage="dashboard" />
              <main className={styles.main} style={{ marginTop: '20px' }}>
                  <div className={styles.card} style={{ textAlign: 'center', padding: '3rem' }}>
                      <h2 style={{ color: '#6b7280' }}>데이터가 없습니다 텅! 📭</h2>
                      <p style={{ marginTop: '1rem', color: '#374151' }}>
                          구글 스프레드시트에 아직 데이터가 없거나, 읽어올 수 없습니다.<br/>
                          스프레드시트에 데이터를 입력해주세요.
                      </p>
                  </div>
              </main>
          </div>
          </AuthCheck>
      );
  }

  const { summary, trends, big5, risk_list, functions, heatmap } = data;

  return (
    <AuthCheck>
    <div className={styles.container}>
      <GlobalNav currentPage="dashboard" />

      <main className={styles.main} style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', pointerEvents: loading ? 'none' : 'auto', position: 'relative', marginTop: '20px' }}>
        {loading && data && (
            <div style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                zIndex: 10,
                backgroundColor: 'rgba(255,255,255,0.5)'
            }}>
                <div style={{ 
                    background: 'white', 
                    padding: '15px 25px', 
                    borderRadius: '30px', 
                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                    fontWeight: 'bold',
                    color: '#6366f1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    🔄 데이터 분석 중...
                </div>
            </div>
        )}

        {/* Tier Status Quick Summary */}
        <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: '15px', 
            marginBottom: '20px' 
        }}>
            <div 
                onClick={() => window.location.href='/tier-status'}
                style={{ 
                    padding: '20px', 
                    background: 'linear-gradient(135deg, #10b981, #059669)', 
                    borderRadius: '12px', 
                    color: 'white',
                    cursor: 'pointer',
                    textAlign: 'center'
                }}
            >
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>Tier 1</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>보편적 지원</div>
            </div>
            <div 
                onClick={() => window.location.href='/cico'}
                style={{ 
                    padding: '20px', 
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
                    borderRadius: '12px', 
                    color: 'white',
                    cursor: 'pointer',
                    textAlign: 'center'
                }}
            >
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>Tier 2</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>CICO 프로그램</div>
            </div>
            <div 
                onClick={() => window.location.href='/tier-status?filter=Tier3'}
                style={{ 
                    padding: '20px', 
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)', 
                    borderRadius: '12px', 
                    color: 'white',
                    cursor: 'pointer',
                    textAlign: 'center'
                }}
            >
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>Tier 3</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>집중 지원</div>
            </div>
            <div 
                onClick={() => window.location.href='/protocol'}
                style={{ 
                    padding: '20px', 
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)', 
                    borderRadius: '12px', 
                    color: 'white',
                    cursor: 'pointer',
                    textAlign: 'center'
                }}
            >
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>📜</div>
                <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>PBS 프로토콜</div>
            </div>
        </div>

        {/* AI Insight Section */}
        {data.ai_comment && (
            <div className={styles.card} style={{ marginBottom: '2rem', borderLeft: '5px solid #8b5cf6', backgroundColor: '#f5f3ff' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#6d28d9', marginBottom: '10rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🤖 행동 분석 AI 리포트 (Beta)
                </h2>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '0.95rem', color: '#333' }}>
                    {data.ai_comment}
                </div>
            </div>
        )}

        {/* Summary Cards */}
        <div className={styles.statGrid}>
          <div className={styles.card}>
            <h3>총 발생 건수 (ODR)</h3>
            <p className={styles.statValue}>{summary.total_incidents}</p>
            <span className={styles.trendUp}>학교 전체 데이터</span>
          </div>
          <div className={styles.card}>
             <h3>평균 강도</h3>
             <p className={styles.statValue}>{summary.avg_intensity.toFixed(1)}</p>
             <span className={styles.subtitle}>1-5 척도</span>
          </div>
          <div className={styles.card}>
             <h3>위험군 학생 (Tier 2/3)</h3>
             <p className={styles.statValue}>{summary.risk_student_count}</p>
             <span className={styles.alert}>집중 모니터링 필요</span>
          </div>
        </div>

        {/* Tier 1: Big 5 Analysis Section */}
        <section className={styles.sectionHeader}>
            <h2>📊 Tier 1: 보편적 지원 (Big 5 분석)</h2>
        </section>
        
        <div className={styles.chartGrid}>
            <div className={styles.chartSection}>
                <h3>📈 행동 발생 추이 (Trend)</h3>
                <div className={styles.chartContainer}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trends}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} name="발생 건수" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className={styles.chartSection}>
                <h3>🏫 장소별 빈도 (Location)</h3>
                <div className={styles.chartContainer}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={big5.locations} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={100} />
                            <Tooltip />
                            <Bar dataKey="value" fill="#82ca9d" name="건수" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
        
        <div className={styles.chartGrid}>
             <div className={styles.chartSection}>
                <h3>⏰ 시간대별 빈도 (Time)</h3>
                <div className={styles.chartContainer}>
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={big5.times}>
                             <CartesianGrid strokeDasharray="3 3" />
                             <XAxis dataKey="name" />
                             <YAxis />
                             <Tooltip />
                             <Bar dataKey="value" fill="#8884d8" name="건수" radius={[4, 4, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                </div>
             </div>
             
             <div className={styles.chartSection}>
                <h3>🤬 행동 유형별 빈도 (Behavior)</h3>
                <div className={styles.chartContainer}>
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                             <Pie
                                data={big5.behaviors}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#0088FE"
                                dataKey="value"
                             >
                                {big5.behaviors.map((entry: ChartData, index: number) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                             </Pie>
                             <Tooltip />
                        </PieChart>
                     </ResponsiveContainer>
                </div>
             </div>
        </div>

        {/* Hotspot & Functions */}
        <div className={styles.chartGrid}>
            <div className={styles.chartSection}>
                <h3>🔥 Hot Spot (장소 x 시간)</h3>
                <div className={styles.chartContainer} style={{ height: 350 }}>
                     <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid />
                            <XAxis type="category" dataKey="x" name="시간" />
                            <YAxis type="category" dataKey="y" name="장소" />
                            <ZAxis type="number" dataKey="value" range={[50, 500]} name="빈도" />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                            <Scatter name="Incidents" data={heatmap} fill="#e02424" />
                        </ScatterChart>
                     </ResponsiveContainer>
                </div>
            </div>

            <div className={styles.chartSection}>
                <h3>🤔 행동 기능 (Why)</h3>
                <div className={styles.chartContainer}>
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={functions}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {functions.map((entry: ChartData, index: number) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                     </ResponsiveContainer>
                </div>
            </div>
        </div>


        {/* Tier 2: Screening List */}
        <section className={styles.sectionHeader}>
            <h2>🚨 Tier 2/3: 위험군 선별 리스트 (Screening)</h2>
        </section>

        <div className={styles.riskSection}>
            <table className={styles.riskTable}>
                <thead>
                    <tr>
                        <th>등급 (Tier)</th>
                        <th>학생명</th>
                        <th>학번/반</th>
                        <th>발생 횟수</th>
                        <th>최대 강도</th>
                        <th>상태</th>
                    </tr>
                </thead>
                <tbody>
                    {risk_list.map((student: RiskStudent, idx: number) => (
                        <tr key={idx}>
                            <td>
                                <span className={styles.tierBadge} style={{ backgroundColor: TIER_COLORS[student.tier as keyof typeof TIER_COLORS] || "#ccc", color: "white" }}>
                                    {student.tier}
                                </span>
                            </td>
                            <td>{student.name}</td>
                            <td>{student.class}</td>
                            <td>{student.count}</td>
                            <td>{student.max_intensity}</td>
                            <td>
                                <button 
                                    className={styles.actionBtn}
                                    onClick={() => window.location.href = `/student/${encodeURIComponent(student.name)}`}
                                >
                                    상세 분석
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {risk_list.length === 0 && <p className={styles.noData}>감지된 위험군 학생이 없습니다.</p>}
        </div>

        {/* Tier 3: Safety Alerts */}
        <section className={styles.sectionHeader} style={{ borderColor: '#EF4444' }}>
            <h2 style={{ color: '#EF4444' }}>⚠️ Tier 3: 안전 알림 (Safety Alerts)</h2>
        </section>

        <div className={styles.riskSection} style={{ border: '1px solid #fee2e2' }}>
             <table className={styles.riskTable}>
                <thead>
                    <tr>
                        <th>발생 날짜</th>
                        <th>학생명</th>
                        <th>장소</th>
                        <th>행동 유형</th>
                        <th>강도</th>
                    </tr>
                </thead>
                <tbody>
                    {data.safety_alerts?.map((alert: SafetyAlert, idx: number) => (
                        <tr key={idx} style={{ backgroundColor: '#fef2f2' }}>
                            <td>{alert.date}</td>
                            <td>{alert.student}</td>
                            <td>{alert.location}</td>
                            <td>{alert.type}</td>
                            <td style={{ color: '#dc2626', fontWeight: 'bold' }}>{alert.intensity} (위험)</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {(!data.safety_alerts || data.safety_alerts.length === 0) && <p className={styles.noData}>최근 발생한 고위험(강도 5) 행동이 없습니다.</p>}
        </div>

      </main>
    </div>
    </AuthCheck>
  );
}
