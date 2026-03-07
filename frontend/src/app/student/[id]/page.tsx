"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis, Label,
  BarChart, Bar, LabelList
} from "recharts";
import styles from "../../page.module.css";
import { StudentData, ChartData } from "../../types";
import { AuthCheck, useAuth } from "../../components/AuthProvider";
import GlobalNav, { useDateRange } from "../../components/GlobalNav";
import { COLORS, TIER_COLORS } from "../../constants";

export default function StudentDetail() {
  const params = useParams();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const studentName = decodeURIComponent(params.id as string);
  const { startDate, endDate } = useDateRange();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  const [data, setData] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New State for Analysis Data
  const [analysisData, setAnalysisData] = useState<{ history: { month: string; rate: string }[], team_talk: string } | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);

  useEffect(() => {
    if (!studentName) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const params = new URLSearchParams();
        if (startDate && endDate) {
          params.append("start_date", startDate);
          params.append("end_date", endDate);
        }
        const queryString = params.toString();
        const url = queryString
          ? `${apiUrl}/api/v1/students/${encodeURIComponent(studentName)}?${queryString}`
          : `${apiUrl}/api/v1/students/${encodeURIComponent(studentName)}`;
        const response = await axios.get(url);
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
  }, [studentName, startDate, endDate]);

  useEffect(() => {
    if (!data?.profile?.student_code) return;
    const fetchAnalysis = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const res = await axios.get(`${apiUrl}/api/v1/students/${data.profile.student_code}/analysis`);
        setAnalysisData(res.data);
      } catch (e) {
        console.error("Analysis fetch error", e);
      } finally {
        setAnalysisLoading(false);
      }
    };
    fetchAnalysis();
  }, [data]);

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
          <button className={styles.actionBtn} onClick={() => router.push('/')} style={{ marginTop: '1rem' }}>돌아가기</button>
        </div>
      </div>
    </AuthCheck>
  );
  if (!data) return null;

  const { profile, abc_data, functions, cico_trend } = data;

  // Access Control check for Teacher
  const isUnauthorized = !isAdmin() && user?.class_id && profile?.student_code && !profile.student_code.startsWith(user.class_id);

  if (isUnauthorized) return (
    <AuthCheck>
      <div className={styles.container}>
        <GlobalNav currentPage="student" />
        <div style={{ padding: '50px', textAlign: 'center' }}>
          <p>⛔ 이 학생의 데이터에 접근할 권한이 없습니다. (본인 학급 학생만 가능)</p>
          <button className={styles.actionBtn} onClick={() => router.push('/')} style={{ marginTop: '1rem' }}>대시보드로 이동</button>
        </div>
      </div>
    </AuthCheck>
  );

  // New State for Analysis Data


  return (
    <AuthCheck>
      <div className={styles.container}>
        <GlobalNav currentPage="student" />

        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0 }}>📊 {profile.name} 학생 상세 분석</h2>
              <p style={{ color: '#666', margin: '5px 0 0 0' }}>
                {profile.class} | 행동지원 등급: <span style={{ color: TIER_COLORS[profile.tier] || '#666', fontWeight: 'bold' }}>{profile.tier}</span>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className={styles.actionBtn}
                onClick={() => router.push(`/student/${encodeURIComponent(studentName)}/bip`)}
                style={{ backgroundColor: '#8b5cf6' }}
              >
                📝 BIP 작성/수정
              </button>
              <button className={styles.actionBtn} onClick={() => router.back()}>← 뒤로</button>
            </div>
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
                <p className={styles.statValue} style={{ color: TIER_COLORS[profile.tier] }}>{profile.tier}</p>
              </div>
            </div>

            {/* Row 1: FBA Summary Table (New) */}
            <div className={styles.chartSection} style={{ marginBottom: '20px', borderLeft: '4px solid #8b5cf6' }}>
              <h3>🧠 행동 기능 평가 (FBA) 요약</h3>
              <p className={styles.subtitle}>데이터 기반으로 추정된 행동 가설입니다.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '15px' }}>
                <div style={{ padding: '15px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                  <h4 style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '5px' }}>1. 배경 (Antecedent)</h4>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#334155' }}>
                    {data.location_stats?.[0]?.name || '-'} / {data.time_stats?.[0]?.name || '-'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>주요 발생 장소 및 시간</div>
                </div>
                <div style={{ padding: '15px', backgroundColor: '#fff1f2', borderRadius: '8px' }}>
                  <h4 style={{ color: '#9f1239', fontSize: '0.9rem', marginBottom: '5px' }}>2. 행동 (Behavior)</h4>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#881337' }}>
                    {data.behavior_types?.[0]?.name || '-'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#fb7185' }}>가장 빈번한 행동 유형</div>
                </div>
                <div style={{ padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '8px' }}>
                  <h4 style={{ color: '#075985', fontSize: '0.9rem', marginBottom: '5px' }}>3. 기능 (Consequence/Function)</h4>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#0c4a6e' }}>
                    {data.functions?.[0]?.name || '-'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#38bdf8' }}>행동의 주된 원인/기능</div>
                </div>
              </div>
            </div>

            {/* Row 2: Charts Grid */}
            <div className={styles.chartGrid}>
              <div className={styles.chartSection}>
                <h3>🧩 ABC 패턴 분석 (Time x Place x Intensity)</h3>
                <p className={styles.subtitle}>원은 강도를 의미합니다. (크면 심각)</p>
                <div className={styles.chartContainer}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid />
                      <XAxis type="category" dataKey="x" name="시간">
                        <Label value="시간" offset={0} position="insideBottom" />
                      </XAxis>
                      <YAxis type="category" dataKey="y" name="장소">
                        <Label value="장소" angle={-90} position="insideLeft" />
                      </YAxis>
                      <ZAxis type="number" dataKey="z" range={[100, 600]} name="강도" />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter name="Behavior" data={abc_data} fill="#8884d8" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={styles.chartSection}>
                <h3>🤔 행동 기능 (Function) 비율</h3>
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

            {/* Row 3: CICO & Trends */}
            <div className={styles.chartSection}>
              <h3>📉 행동 빈도 추이 (Frequency Trend)</h3>
              <p className={styles.subtitle}>중재 효과를 확인하기 위한 시계열 그래프입니다.</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Daily Trend */}
                <div className={styles.chartContainer}>
                  <h4 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '0.9rem' }}>일별 추이 (Daily)</h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cico_trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="count" stroke="#82ca9d" name="발생 횟수" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Weekly Trend */}
                <div className={styles.chartContainer}>
                  <h4 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '0.9rem' }}>주별 추이 (Weekly)</h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.weekly_trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" fontSize={11} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8884d8" name="주별 발생" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '30px' }}>
                {/* Monthly Trend */}
                <div className={styles.chartContainer}>
                  <h4 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '0.9rem' }}>월별 추이 (Monthly)</h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.monthly_trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#4f46e5" name="월별 발생" barSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Weekday Distribution */}
                <div className={styles.chartContainer}>
                  <h4 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '0.9rem' }}>요일별 분포 (Weekday)</h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.weekday_dist}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#f59e0b" name="발생 건수">
                        <LabelList dataKey="value" position="top" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Row 4: AI Analysis */}
            <div style={{ marginTop: '30px' }}>
              <StudentAIAnalysis studentCode={profile.student_code} apiUrl={apiUrl} />
            </div>

            {/* Row 5: Consultation Log (Teacher Feedback) */}
            <div style={{ marginTop: '30px' }}>
              <ConsultationLog studentCode={profile.student_code} studentName={profile.name} />
            </div>

          </main>
        </div>
      </div>
    </AuthCheck>
  );
}

// Sub-component for Consultation Log
function ConsultationLog({ studentCode, studentName }: { studentCode: string, studentName: string }) {
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  useEffect(() => {
    if (studentCode && studentCode !== "-") {
      fetchNotes();
    }
  }, [studentCode]);

  const fetchNotes = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?student_code=${studentCode}&meeting_type=consultation`);
      setNotes(res.data.notes || []);
    } catch (e) { console.error("Consultation fetch error", e); }
  };

  const saveNote = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
        meeting_type: "consultation",
        date: new Date().toISOString().split('T')[0],
        content,
        author: "Teacher", // In real app, get from auth context
        student_code: studentCode
      });
      setContent("");
      fetchNotes();
      alert("상담 일지가 저장되었습니다.");
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.chartSection} style={{ borderTop: '4px solid #f59e0b' }}>
      <h3>📝 담임교사 상담 일지 & 관찰 기록</h3>
      <p className={styles.subtitle}>{studentName}({studentCode}) 학생에 대한 관찰 내용이나 학부모 상담 내용을 기록하세요.</p>

      <div style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
        {/* Input Area */}
        <div style={{ backgroundColor: '#fffbeb', padding: '15px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="오늘의 특이사항, 상담 내용, 중재 반응 등을 입력하세요..."
            style={{
              width: '100%', minHeight: '80px', padding: '10px',
              borderRadius: '4px', border: '1px solid #e2e8f0', marginBottom: '10px'
            }}
          />
          <div style={{ textAlign: 'right' }}>
            <button
              onClick={saveNote}
              disabled={loading || !content.trim()}
              style={{
                padding: '8px 16px', backgroundColor: '#d97706', color: 'white',
                border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
              }}
            >
              {loading ? "저장 중..." : "기록 저장"}
            </button>
          </div>
        </div>

        {/* List Area */}
        <div>
          <h4 style={{ margin: '0 0 10px 0', color: '#475569' }}>📋 기록 히스토리</h4>
          {notes.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>아직 등록된 기록이 없습니다.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, maxHeight: '300px', overflowY: 'auto' }}>
              {notes.map(note => (
                <li key={note.id} style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>
                    📅 {note.date} | ✍️ {note.author}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#1e293b', fontSize: '0.95rem', lineHeight: '1.5' }}>
                    {note.content}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function StudentAIAnalysis({ studentCode, apiUrl }: { studentCode: string; apiUrl: string }) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const requestAnalysis = async () => {
    setLoading(true);
    setVisible(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-student-analysis`, {
        student_code: studentCode
      });
      setAnalysis(res.data.analysis || "분석 결과가 없습니다.");
    } catch {
      setAnalysis("⚠️ AI 분석 요청 실패. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!visible ? (
        <button onClick={requestAnalysis} style={{
          padding: '10px 20px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
          color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer',
          fontSize: '0.9rem', fontWeight: 600, boxShadow: '0 4px 12px rgba(124,58,237,0.3)'
        }}>
          🤖 BCBA AI 종합 분석
        </button>
      ) : (
        <div style={{
          background: '#f5f3ff', border: '1px solid #ddd5f5',
          borderRadius: '12px', padding: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#6d28d9', fontSize: '1rem' }}>🤖 BCBA AI 종합 분석</h3>
            <button onClick={() => setVisible(false)} style={{
              background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem'
            }}>✕ 닫기</button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#7c3aed' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
              AI가 학생 데이터를 종합 분석하고 있습니다...
            </div>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.7', color: '#334155' }}>
              {analysis}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
