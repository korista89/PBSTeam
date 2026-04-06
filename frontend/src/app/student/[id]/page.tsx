"use client";

import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ScatterChart, Scatter, ZAxis, Label,
  BarChart, Bar, LabelList, ComposedChart, Area
} from "recharts";
import styles from "../../page.module.css";
import { StudentData, ChartData } from "../../types";
import { AuthCheck, useAuth } from "../../components/AuthProvider";
import GlobalNav, { useDateRange } from "../../components/GlobalNav";
import { COLORS, TIER_COLORS } from "../../constants";
import WeeklyAnalysisChart from "../../components/WeeklyAnalysisChart";
import { maskName } from "../../utils";

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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const sparams = new URLSearchParams();
      if (startDate && endDate) {
        sparams.append("start_date", startDate);
        sparams.append("end_date", endDate);
      }
      const queryString = sparams.toString();
      const url = `${apiUrl}/api/v1/students/${encodeURIComponent(studentName)}?${queryString}`;
      const response = await axios.get(url);
      setData(response.data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.status === 404 ? "학생을 찾을 수 없습니다." : "데이터 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, studentName, startDate, endDate]);

  useEffect(() => {
    if (studentName) fetchData();
  }, [fetchData, studentName]);

  if (loading) return (
    <AuthCheck>
      <div style={{ background: '#f8fafc', minHeight: '100vh' }}>
        <GlobalNav currentPage="student" />
        <div style={{ padding: '100px', textAlign: 'center', color: '#64748b' }}>
           <div style={{ fontSize: '3rem', animation: 'spin 2s linear infinite', marginBottom: '20px' }}>💿</div>
           <p style={{ fontWeight: 800, fontSize: '1.2rem' }}>{maskName(studentName)} 학생의 데이터를 심층 분석하고 있습니다...</p>
        </div>
      </div>
    </AuthCheck>
  );

  if (error || !data) return (
    <AuthCheck>
      <div style={{ background: '#f8fafc', minHeight: '100vh' }}>
        <GlobalNav currentPage="student" />
        <div style={{ padding: '100px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '20px' }}>⚠️</div>
          <p style={{ fontWeight: 800, color: '#ef4444' }}>{error || "데이터가 없습니다."}</p>
          <button onClick={() => router.push('/')} style={{ marginTop: '20px', padding: '10px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 700 }}>대시보드로 돌아가기</button>
        </div>
      </div>
    </AuthCheck>
  );

  if (!data) return null; // Should be handled by error check above but being safe

  const profile = data.profile || { name: studentName, student_code: "-", class: "-", tier: "Tier 1", total_incidents: 0, avg_intensity: 0 };
  const abc_data = data.abc_data || [];
  const functions = data.functions || [];
  const cico_trend = data.cico_trend || [];
  
  const isUnauthorized = !isAdmin() && user?.class_id && profile?.student_code && !profile.student_code.startsWith(user.class_id);

  if (isUnauthorized) return (
    <AuthCheck>
      <div style={{ background: '#f8fafc', minHeight: '100vh' }}>
        <GlobalNav currentPage="student" />
        <div style={{ padding: '100px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '20px' }}>⛔</div>
          <p style={{ fontWeight: 800 }}>이 학생의 데이터에 접근할 권한이 없습니다.</p>
          <p style={{ color: '#64748b', marginTop: '8px' }}>본인 학급 학생의 데이터만 열람 가능합니다.</p>
          <button onClick={() => router.push('/')} style={{ marginTop: '20px', padding: '10px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 700 }}>홈으로 이동</button>
        </div>
      </div>
    </AuthCheck>
  );

  return (
    <AuthCheck>
      <div style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '80px' }}>
        <GlobalNav currentPage="student" />
        
        <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 950, color: '#1e293b', letterSpacing: '-0.04em' }}>{maskName(profile.name)}</h1>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(profile.tier || "Tier 1").split(", ").map((t, idx) => (
                    <span key={idx} style={{ padding: '4px 14px', background: TIER_COLORS[t] || TIER_COLORS[t.split('(')[0]] || '#64748b', color: '#fff', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 900 }}>{t}</span>
                  ))}
                </div>
              </div>
              <p style={{ margin: '8px 0 0 0', color: '#64748b', fontWeight: 600 }}>{profile.class} | 행동 지원 프로파일</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => router.push(`/student/${encodeURIComponent(studentName)}/bip`)}
                style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: '#fff', border: 'none', borderRadius: '14px', cursor: 'pointer', fontWeight: 800, boxShadow: '0 4px 12px rgba(124, 58, 237, 0.2)', transition: 'transform 0.2s' }}
                onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'}
                onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}
              >
                📝 개별화행동지원계획 (BIP)
              </button>
              <button onClick={() => router.back()} style={{ padding: '12px 20px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', fontWeight: 700, cursor: 'pointer' }}>뒤로가기</button>
            </div>
          </div>

          <main style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* KPI Cards */}
            <div className="grid-responsive" style={{ marginBottom: '24px' }}>
               {[
                { label: "총 행동 발생", value: `${profile.total_incidents}건`, icon: "📈", color: "#6366f1" },
                { label: "평균 행동 강도", value: profile.avg_intensity.toFixed(1), icon: "⚡", color: profile.avg_intensity >= 3.5 ? "#ef4444" : "#f59e0b" },
                { label: "위험 수준", value: (profile.tier || "").includes("3") ? "높음" : "보통", icon: "🚨", color: (profile.tier || "").includes("3") ? "#ef4444" : "#10b981" }
               ].map((c, i) => (
                 <div key={i} className="glass-panel" style={{ padding: '28px', borderRadius: '24px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '12px' }}>{c.icon}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>{c.label}</div>
                    <div style={{ fontSize: '2.2rem', fontWeight: 950, color: c.color }}>{c.value}</div>
                 </div>
               ))}
            </div>

            {/* FBA Summary */}
            <section style={{ background: '#fff', padding: '32px', borderRadius: '28px', boxShadow: '0 4px 25px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)' }}>
               <h3 style={{ margin: '0 0 24px 0', fontSize: '1.25rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🧠</span> 행동 가설 요약 (FBA Summary)
               </h3>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                  {[
                    { title: "Antecedent (배경)", value: `${(data.location_stats || [])?.[0]?.name || '-'} / ${(data.time_stats || [])?.[0]?.name || '-'}`, bg: '#eff6ff', color: '#1d4ed8' },
                    { title: "Behavior (행동)", value: (data.behavior_types || [])?.[0]?.name || '-', bg: '#fff1f2', color: '#be123c' },
                    { title: "Function (기능)", value: (data.functions || [])?.[0]?.name || '-', bg: '#f0fdf4', color: '#15803d' }
                  ].map((f, i) => (
                    <div key={i} style={{ padding: '24px', borderRadius: '20px', background: f.bg }}>
                       <div style={{ fontSize: '0.8rem', fontWeight: 800, color: f.color, marginBottom: '8px', opacity: 0.7 }}>{f.title}</div>
                       <div style={{ fontSize: '1.2rem', fontWeight: 900, color: f.color }}>{f.value}</div>
                    </div>
                  ))}
               </div>
            </section>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                <ChartSection title="📍 ABC 패턴 맵 (장소 x 시간 x 강도)">
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                      <XAxis type="category" dataKey="x" name="시간" />
                      <YAxis type="category" dataKey="y" name="장소" width={100} tick={{fontSize: 10}} />
                      <ZAxis type="number" dataKey="z" range={[100, 800]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter name="행동" data={abc_data} fill="#6366f1" opacity={0.6} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartSection>

                <ChartSection title="🎭 행동 기능 분포">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={functions} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                        {Array.isArray(functions) && functions.length > 0 && functions.map((_, i) => <Cell key={i} fill={['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartSection>
            </div>

            <div className="grid-responsive">
              <WeeklyAnalysisChart 
                data={data.weekly_trend || []} 
                title={`${maskName(profile.name)} 학생 주별 행동 발생 추이`} 
                color="#6366f1" 
              />
              <ChartSection title="📉 행동 발생 일별 추이 (전체 기간)" height={400}>
                 <ResponsiveContainer>
                    <ComposedChart data={cico_trend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="count" fill="#6366f110" stroke="#6366f1" strokeWidth={3} />
                      <Bar dataKey="count" fill="#6366f1" barSize={10} radius={[5,5,0,0]} />
                    </ComposedChart>
                 </ResponsiveContainer>
              </ChartSection>
            </div>

            {/* AI Insights and Logs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px', alignItems: 'start' }}>
               <ConsultationLog studentCode={profile.student_code} studentName={profile.name} />
               <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <StudentAIAnalysis studentCode={profile.student_code} apiUrl={apiUrl} />
                  <ChartSection title="📅 요일별 발생 패턴" height={300}>
                    <ResponsiveContainer>
                        <BarChart data={data.weekday_dist || []}>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700 }} />
                            <Tooltip />
                            <Bar dataKey="value" fill="#f59e0b" radius={[10, 10, 10, 10]} barSize={20}>
                                <LabelList dataKey="value" position="top" style={{ fontSize: 11, fontWeight: 800, fill: '#f59e0b' }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                  </ChartSection>
               </div>
            </div>
          </main>
        </div>
      </div>
      <style jsx global>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .custom-scrollbar::-webkit-scrollbar { width: 6px; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </AuthCheck>
  );
}

function ChartSection({ title, children, height = 340 }: { title: string, children: React.ReactNode, height?: number }) {
  return (
    <section className="glass-panel" style={{ padding: '28px', borderRadius: '28px' }}>
       <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 900, color: '#475569' }}>{title}</h3>
       <div style={{ height }}>
          {children}
       </div>
    </section>
  );
}

function ConsultationLog({ studentCode, studentName }: { studentCode: string, studentName: string }) {
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const { user, isAdmin } = useAuth();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  const fetchNotes = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?student_code=${studentCode}&meeting_type=consultation`);
      setNotes(res.data.notes || []);
    } catch (e) { console.error(e); }
  }, [apiUrl, studentCode]);

  useEffect(() => { if (studentCode) fetchNotes(); }, [studentCode, fetchNotes]);

  const handleUpdate = async (id: string) => {
    try {
      await axios.patch(`${apiUrl}/api/v1/meeting-notes/${id}`, { 
        content: editContent,
        user_id: user?.id || "Teacher",
        role: isAdmin() ? "admin" : "teacher"
      });
      setEditingId(null); fetchNotes();
    } catch (e: any) { 
      const errorMsg = e.response?.data?.detail || e.message || "알 수 없는 오류";
      alert("수정 실패: " + errorMsg); 
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    try {
      await axios.delete(`${apiUrl}/api/v1/meeting-notes/${id}`, {
        params: {
          user_id: user?.id || "Teacher",
          role: isAdmin() ? "admin" : "teacher"
        }
      });
      fetchNotes();
    } catch (e: any) { 
      const errorMsg = e.response?.data?.detail || e.message || "알 수 없는 오류";
      alert("삭제 실패: " + errorMsg); 
    }
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, {
        meeting_type: "consultation", date: new Date().toISOString().split('T')[0],
        content, author: user?.id || "Admin", student_code: studentCode
      });
      setContent(""); fetchNotes();
    } catch (e: any) { 
      const errorMsg = e.response?.data?.detail || e.message || "알 수 없는 오류";
      alert("저장 실패: " + errorMsg); 
    } finally { setLoading(false); }
  };

  return (
    <div style={{ background: '#fff', padding: '32px', borderRadius: '28px', border: '1px solid rgba(0,0,0,0.03)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '1.25rem', fontWeight: 900 }}>📝 상담 및 관찰 기록</h3>
      <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="학생 관찰 내용이나 학부모 상담 내용을 기록하십시오..." style={{ width: '100%', minHeight: '120px', padding: '16px', borderRadius: '16px', border: '1px solid #f1f5f9', background: '#f8fafc', fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none' }} />
      <div style={{ textAlign: 'right', marginTop: '12px' }}>
          <button onClick={handleSave} disabled={loading || !content.trim()} style={{ padding: '12px 28px', borderRadius: '14px', background: '#1e293b', color: '#fff', fontWeight: 800, border: 'none', cursor: 'pointer' }}>기록 저장</button>
      </div>

      <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto' }} className="custom-scrollbar">
         {notes.map((n, i) => (
           <div key={n.id || i} style={{ padding: '16px', borderRadius: '20px', background: '#f8fafc', border: '1px solid rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                 <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8' }}>📅 {n.date}</span>
                 <div style={{ display: 'flex', gap: '10px' }}>
                    {(isAdmin() || n.author === user?.id) && (
                      <>
                        <button onClick={()=>{setEditingId(n.id); setEditContent(n.content);}} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontWeight: 800, fontSize: '0.75rem' }}>수정</button>
                        <button onClick={()=>handleDelete(n.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 800, fontSize: '0.75rem' }}>삭제</button>
                      </>
                    )}
                 </div>
              </div>
              {editingId === n.id ? (
                <div>
                   <textarea value={editContent} onChange={e=>setEditContent(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #6366f1', borderRadius: '12px' }} />
                   <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button onClick={()=>handleUpdate(n.id)} style={{ padding: '6px 12px', background: '#6366f1', color: '#fff', borderRadius: '6px', border: 'none', fontWeight: 700 }}>저장</button>
                      <button onClick={()=>setEditingId(null)} style={{ padding: '6px 12px', background: '#94a3b8', color: '#fff', borderRadius: '6px', border: 'none' }}>취소</button>
                   </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.content}</p>
              )}
              <div style={{ marginTop: '8px', textAlign: 'right', fontSize: '0.7rem', color: '#94a3b8' }}>작성자: {n.author}</div>
           </div>
         ))}
      </div>
    </div>
  );
}

function StudentAIAnalysis({ studentCode, apiUrl }: { studentCode: string, apiUrl: string }) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  const requestAnalysis = async () => {
    setLoading(true); setVisible(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-student-analysis`, { student_code: studentCode });
      setAnalysis(res.data.analysis || "분석 결과가 없습니다.");
    } catch { setAnalysis("⚠️ AI 전문가 분석 요청 실패."); } finally { setLoading(false); }
  };

  return (
    <div style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', padding: '28px', borderRadius: '24px', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
       {!visible ? (
         <button onClick={requestAnalysis} style={{ width: '100%', padding: '16px', background: '#6366f1', color: '#fff', borderRadius: '14px', border: 'none', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)' }}>🤖 AI 종합 분석 리포트 생성</button>
       ) : (
         <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, color: '#4338ca', fontWeight: 900 }}>🤖 AI 전문가 정밀 분석</h4>
                <button onClick={()=>setVisible(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>
            {loading ? (
                <div style={{ color: '#6366f1', fontWeight: 700, textAlign: 'center', padding: '20px' }}>패턴 분석 및 데이터 요약 중... 🧠</div>
            ) : (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: '1.8', color: '#312e81', maxHeight: '400px', overflowY: 'auto' }} className="custom-scrollbar">{analysis}</div>
            )}
         </div>
       )}
    </div>
  );
}
