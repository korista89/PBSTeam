"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis
} from "recharts";
import styles from "../../page.module.css"; 
import { StudentData, ChartData } from "../../types";
import { AuthCheck } from "../../components/AuthProvider";
import GlobalNav, { useDateRange } from "../../components/GlobalNav";

// Reusing global styles for consistency
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];
const TIER_COLORS: { [key: string]: string } = { 
  "Tier 1": "#10B981", 
  "Tier2(CICO)": "#F59E0B", 
  "Tier2(SST)": "#1976d2",
  "Tier 2": "#F59E0B",  // Legacy support
  "Tier 3": "#EF4444",
  "Tier3+": "#4a148c"
};

export default function StudentDetail() {
  const params = useParams();
  const router = useRouter();
  const studentName = decodeURIComponent(params.id as string);
  
  const [data, setData] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!studentName) return;

    const fetchData = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const response = await axios.get(`${apiUrl}/api/v1/students/${encodeURIComponent(studentName)}`);
        setData(response.data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.error(err);
        setError(err.response?.status === 404 ? "학생을 찾을 수 없습니다." : "데이터 로딩 실패");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [studentName]);

  if (loading) return (
    <AuthCheck>
      <div className={styles.container}>
        <GlobalNav currentPage="student" />
        <div style={{ padding: '50px', textAlign: 'center' }}>학생 데이터 분석 중... 🔍</div>
      </div>
    </AuthCheck>
  );
  
  if (error) return (
    <AuthCheck>
      <div className={styles.container}>
        <GlobalNav currentPage="student" />
        <div style={{ padding: '50px', textAlign: 'center' }}>
          <p>{error}</p>
          <button className={styles.actionBtn} onClick={() => router.push('/')} style={{marginTop: '1rem'}}>돌아가기</button>
        </div>
      </div>
    </AuthCheck>
  );
  if (!data) return null;

  const { profile, abc_data, functions, cico_trend } = data;

  return (
    <AuthCheck>
    <div className={styles.container}>
      <GlobalNav currentPage="student" />
      
      <div style={{ padding: '20px' }}>
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>📊 {profile.name} 학생 상세 분석</h2>
            <p style={{ color: '#666', margin: '5px 0 0 0' }}>
              {profile.class} | 행동지원 등급: <span style={{color: TIER_COLORS[profile.tier] || '#666', fontWeight:'bold'}}>{profile.tier}</span>
            </p>
          </div>
          <button className={styles.actionBtn} onClick={() => router.back()}>← 뒤로</button>
        </div>

      <main className={styles.main}>
        {/* Profile Stats */}
        <div className={styles.statGrid}>
          <div className={styles.card}>
            <h3>총 발생 (Total)</h3>
            <p className={styles.statValue}>{profile.total_incidents}</p>
          </div>
          <div className={styles.card}>
             <h3>평균 강도 (Intensity)</h3>
             <p className={styles.statValue}>{profile.avg_intensity.toFixed(1)}</p>
          </div>
           <div className={styles.card} style={{ borderColor: TIER_COLORS[profile.tier], borderWidth: 2 }}>
             <h3>현재 단계 (Target Tier)</h3>
             <p className={styles.statValue} style={{color: TIER_COLORS[profile.tier]}}>{profile.tier}</p>
          </div>
        </div>

        {/* Row 1: ABC Analysis & Functions */}
        <div className={styles.chartGrid}>
            <div className={styles.chartSection}>
                <h3>🧩 ABC 패턴 분석 (Time x Place x Intensity)</h3>
                <p className={styles.subtitle}>원은 강도를 의미합니다. (크면 심각)</p>
                <div className={styles.chartContainer}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid />
                            <XAxis type="category" dataKey="x" name="시간" />
                            <YAxis type="category" dataKey="y" name="장소" />
                            <ZAxis type="number" dataKey="z" range={[100, 600]} name="강도" />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                            <Scatter name="Behavior" data={abc_data} fill="#8884d8" />
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className={styles.chartSection}>
                <h3>🤔 행동 기능 (Function)</h3>
                <div className={styles.chartContainer}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={functions}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={80}
                                fill="#0088FE"
                                dataKey="value"
                            >
                                {functions.map((entry: ChartData, index: number) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* Row 2: CICO Trend */}
        <div className={styles.chartSection}>
            <h3>📉 CICO 모니터링 (행동 빈도 추이)</h3>
            <p className={styles.subtitle}>중재 효과를 확인하기 위한 시계열 그래프입니다.</p>
            <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cico_trend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="count" stroke="#82ca9d" name="일별 발생 횟수" strokeWidth={3} dot={{r: 4}} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>

      </main>
      </div>
    </div>
    </AuthCheck>
  );
}
