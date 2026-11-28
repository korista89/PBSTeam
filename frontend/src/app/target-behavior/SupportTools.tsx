"use client";

// 개별학생 행동중재의 보조 도구 — 예전 개별학생대시보드에서 옮겨 왔다.
// 상담·관찰 기록, EBP 추천(④), 위기행동 없었던 날(⑤)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import DayCalendar from "./DayCalendar";
import axios from "axios";
import { useAuth } from "../components/AuthProvider";
import { useSheetLiveSync } from "../hooks/useSheetLiveSync";
import { todayStr } from "../utils";
import { API_BASE_URL } from "@/app/lib/api";

// normalize.py의 한국어 기능 라벨("과제회피"/"불편해소"/"관심끌기"/"감각추구"/"물건·활동획득")을
// EBP 카탈로그의 FunctionCode enum으로 매핑한다. build_fba_evidence_summary의 실제 증거에서
// 상위 기능을 뽑아 쓰므로, 화면에 표시되는 기능 추정과 EBP 추천 근거가 항상 일치한다.
function mapFunctionLabelToCode(label: string): string {
  if (!label) return "UNKNOWN";
  if (label.includes("과제") || label.includes("회피")) return "ESCAPE_DEMAND";
  if (label.includes("불편")) return "DISCOMFORT_RELIEF";
  if (label.includes("관심")) return "ATTENTION";
  if (label.includes("감각")) return "AUTOMATIC_SENSORY";
  if (label.includes("물건") || label.includes("활동")) return "TANGIBLE_ACTIVITY";
  return "UNKNOWN";
}

// EBP 추천 섹션 부제목에 FunctionCode 원본값("UNKNOWN" 등)을 그대로 노출하면 교사가
// 읽기 어렵다 — 사람이 읽는 한글 라벨로 바꿔서 보여준다.
const FUNCTION_CODE_LABELS: Record<string, string> = {
  ESCAPE_DEMAND: "과제/요구 회피",
  DISCOMFORT_RELIEF: "불편 해소",
  ATTENTION: "관심 끌기",
  AUTOMATIC_SENSORY: "감각 추구",
  TANGIBLE_ACTIVITY: "물건/활동 획득",
  UNKNOWN: "미상 (기능 데이터 부족)",
};

export function ConsultationLog({ studentCode }: { studentCode: string }) {
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const { user, isAdmin } = useAuth();
  const apiUrl = API_BASE_URL;

  const fetchNotes = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?student_code=${studentCode}&meeting_type=consultation`);
      setNotes(res.data.notes || []);
    } catch (e) { console.error(e); }
  }, [apiUrl, studentCode]);

  useEffect(() => { if (studentCode) fetchNotes(); }, [studentCode, fetchNotes]);
  useSheetLiveSync(fetchNotes, { enabled: Boolean(studentCode) && editingId === null });

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
        meeting_type: "consultation", date: todayStr(),
        content, author: user?.id || "Admin", student_code: studentCode
      });
      setContent(""); fetchNotes();
    } catch (e: any) {
      const errorMsg = e.response?.data?.detail || e.message || "알 수 없는 오류";
      alert("저장 실패: " + errorMsg);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>📝 상담 및 관찰 기록</h3>
      <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="학생 관찰 내용이나 학부모 상담 내용을 기록하십시오..." style={{ width: '100%', minHeight: '110px', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.9rem', boxSizing: 'border-box', outline: 'none' }} />
      <div style={{ textAlign: 'right', marginTop: '10px' }}>
          <button onClick={handleSave} disabled={loading || !content.trim()} className="btn btn-primary">기록 저장</button>
      </div>

      <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }} className="custom-scrollbar">
         {notes.map((n, i) => (
           <div key={n.id || i} style={{ padding: '14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
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

function EBPRecommendationSection({ studentCode, functionCode, settingEvents, currentTier, apiUrl }: {
  studentCode: string; functionCode: string; settingEvents: string[]; currentTier: string; apiUrl: string;
}) {
  const [bundle, setBundle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const settingEventsKey = settingEvents.join(",");

  useEffect(() => {
    const fetchBundle = async () => {
      try {
        setLoading(true);
        const res = await axios.post(`${apiUrl}/api/v1/ebp/recommend`, {
          function_code: functionCode,
          setting_events: settingEvents,
          current_tier: currentTier,
        });
        setBundle(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchBundle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentCode, functionCode, settingEventsKey, currentTier, apiUrl]);

  if (loading) return null;
  if (!bundle) return null;

  const functionLabel = FUNCTION_CODE_LABELS[functionCode] || functionCode;
  const isUnknown = functionCode === "UNKNOWN";

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
            <span>📚</span> 경기 Be-Able 39 EBP 맞춤 추천 번들
          </h3>
          <p style={{ margin: '6px 0 0 0', color: '#64748b', fontSize: '0.88rem' }}>
            FBA 증거 요약의 기능 추정({functionLabel})에 부합하는 근거기반 3단계(예방-교수-강화) 중재 후보군
          </p>
        </div>
      </div>

      {isUnknown && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '14px', padding: '14px 18px', marginBottom: '20px', fontSize: '0.85rem', color: '#92400e' }}>
          ⚠️ 이 학생은 행동기록에 추정기능이 입력된 건이 없어 기능을 특정할 수 없습니다. 아래는 기능과 무관한 일반 후보군입니다 — 행동기록 입력 시 &ldquo;추정기능&rdquo; 항목을 채우면 이 추천이 더 정확해집니다.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Prevent */}
        <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '16px', border: '1px solid #bae6fd' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0369a1', marginBottom: '12px' }}>
            🛡️ 1단계 선행사건 예방 전략
          </div>
          {bundle.prevent?.map((s: any) => (
            <div key={s.ebp_code} style={{ background: '#fff', padding: '14px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #e0f2fe' }}>
              {s.official_no && (
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, marginBottom: '2px' }}>
                  {String(s.official_no).padStart(2, '0')}/39 · {s.official_domain}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{s.name}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7' }}>{s.ebp_code}</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 8px 0' }}>{s.summary}</p>
              <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600 }}>권장: {s.reasons?.[0]}</div>
            </div>
          ))}
        </div>

        {/* Teach */}
        <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '16px', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#15803d', marginBottom: '12px' }}>
            💡 2단계 기능적 대체행동 교수
          </div>
          {bundle.teach?.map((s: any) => (
            <div key={s.ebp_code} style={{ background: '#fff', padding: '14px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #dcfce7' }}>
              {s.official_no && (
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, marginBottom: '2px' }}>
                  {String(s.official_no).padStart(2, '0')}/39 · {s.official_domain}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{s.name}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a' }}>{s.ebp_code}</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 8px 0' }}>{s.summary}</p>
              <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>권장: {s.reasons?.[0]}</div>
            </div>
          ))}
        </div>

        {/* Reinforce */}
        <div style={{ background: '#fffbeb', padding: '20px', borderRadius: '16px', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#b45309', marginBottom: '12px' }}>
            ⭐ 3단계 차별강화 및 유지
          </div>
          {bundle.reinforce?.map((s: any) => (
            <div key={s.ebp_code} style={{ background: '#fff', padding: '14px', borderRadius: '12px', marginBottom: '10px', border: '1px solid #fef3c7' }}>
              {s.official_no && (
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, marginBottom: '2px' }}>
                  {String(s.official_no).padStart(2, '0')}/39 · {s.official_domain}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{s.name}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#d97706' }}>{s.ebp_code}</span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 8px 0' }}>{s.summary}</p>
              <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>권장: {s.reasons?.[0]}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const kd = (iso: string) => { const [, m, d] = iso.split("-"); return `${+m}. ${+d}.`; };
const todayIso = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// ⑤ 위기행동이 없었던 날·결석한 날: 달력에서 날짜를 눌러 ✓(위기행동 없음)·결석을 고른 뒤 '반영'.
// 위기행동이 기록된 날은 고를 수 없다. 결석은 '없었던 날'로 세지 않는다(기록 없음의 이유를 구분).
const ABSENT = "결석";
export function CalmDays({ studentCode, yearStart, incidentDays }: { studentCode: string; yearStart: string; incidentDays: string[] }) {
  const [days, setDays] = useState<string[]>([]);
  const [absent, setAbsent] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const enc = encodeURIComponent(studentCode);
  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API_BASE_URL}/api/v1/behavior-log/no-incident/${enc}`);
      setDays((r.data?.dates || []) as string[]); setAbsent((r.data?.absent || []) as string[]);
    } catch { setDays([]); setAbsent([]); }
  }, [enc]);
  useEffect(() => { setMsg(""); void load(); }, [load]);
  const marks = useMemo(() => ({ ...Object.fromEntries(days.map(d => [d, "✓"])), ...Object.fromEntries(absent.map(d => [d, ABSENT])) }), [days, absent]);
  const blocked = useMemo(() => Object.fromEntries(incidentDays.map(d => [d, "위기행동이 기록된 날"])), [incidentDays]);
  const apply = async (next: Record<string, string>, changed: string[]) => {
    try {
      // 바뀐 날은 먼저 지우고(표시를 바꾼 날 포함) 새 표시를 종류별로 한 번에 넣는다
      for (const d of changed.filter(d => marks[d])) await axios.delete(`${API_BASE_URL}/api/v1/behavior-log/no-incident/${enc}/${d}`);
      let skip = 0;
      for (const [type, mark] of [["", "✓"], [ABSENT, ABSENT]]) {
        const add = changed.filter(d => next[d] === mark);
        if (!add.length) continue;
        const r = await axios.post(`${API_BASE_URL}/api/v1/behavior-log/no-incident/${enc}`, { dates: add, type });
        skip += (r.data?.skipped_has_incident || []).length;
      }
      const n = (m: string) => changed.filter(d => next[d] === m).length, del = changed.filter(d => !next[d]).length;
      setMsg(`위기행동 없음 ${n("✓")}일, 결석 ${n(ABSENT)}일 반영${del ? `, ${del}일 취소` : ""}했습니다.${skip ? ` 위기행동이 기록된 ${skip}일은 뺐습니다.` : ""}`);
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || "반영하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    await load();
  };
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 800, fontSize: "1rem" }}>✅ 위기행동이 없었던 날·결석한 날 <span style={{ fontWeight: 500, fontSize: "0.8rem", color: "#64748b" }}>올해 위기행동 없음 {days.filter(d => d >= yearStart).length}일 · 결석 {absent.filter(d => d >= yearStart).length}일</span></div>
      <p style={{ margin: "4px 0 10px", fontSize: "0.8rem", color: "#94a3b8" }}>기록이 없는 날이 &lsquo;위기행동 없음&rsquo;인지 &lsquo;결석&rsquo;인지 &lsquo;기록 안 함&rsquo;인지 구분하는 근거가 됩니다. 날짜를 눌러 표시를 고른 뒤 &lsquo;반영&rsquo;을 누르세요.</p>
      <DayCalendar marks={marks} cycle={["", "✓", ABSENT]} blocked={blocked} onApply={apply} legend={<>✓는 위기행동 없음, 결석은 결석한 날, ⚠는 위기행동이 기록된 날입니다.</>} />
      {msg && <p style={{ margin: "8px 0 0", fontSize: "0.82rem", color: "#475569" }}>{msg}</p>}
    </div>
  );
}

// ③ 행동중재계획 옆 EBP 추천 — FBA 증거의 상위 기능·배경사건으로 후보를 뽑는다.
export function EBPForStudent({ studentCode, currentTier }: { studentCode: string; currentTier: string }) {
  const [ev, setEv] = useState<any>(undefined);
  useEffect(() => {
    let alive = true;
    setEv(undefined);
    axios.get(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(studentCode)}/fba-evidence`)
      .then(r => { if (alive) setEv(r.data); }).catch(() => { if (alive) setEv(null); });
    return () => { alive = false; };
  }, [studentCode]);
  if (ev === undefined) return null;
  const dm = ev?.deterministic_metrics || {};
  return (
    <div className="card" style={{ padding: 16 }}>
      <EBPRecommendationSection
        studentCode={studentCode}
        functionCode={mapFunctionLabelToCode((dm.teacher_inferred_function_distribution || [])[0]?.item || "")}
        settingEvents={(dm.setting_event_cue_distribution || []).map((s: any) => s.item)}
        currentTier={currentTier}
        apiUrl={API_BASE_URL}
      />
    </div>
  );
}

// ⓪ 학생 현황: 위기행동관리 회의에서 남긴 학교행동중재지원팀 결정(담임도 자기 학생 것은 본다)
export function TeamDecisions({ studentCode }: { studentCode: string }) {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    axios.get(`${API_BASE_URL}/api/v1/meeting-notes`, { params: { meeting_type: "crisis", student_code: studentCode } })
      .then(r => { if (alive) setList(((r.data?.notes || []) as any[]).sort((a, b) => String(b.created_at || b.date).localeCompare(String(a.created_at || a.date)))); })
      .catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [studentCode]);
  if (!list.length) return null;
  const today = todayIso();
  return (
    <div className="card" style={{ padding: "14px 20px", borderLeft: "4px solid #7c3aed" }}>
      <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>🤝 학교행동중재지원팀 결정</div>
      {list.slice(0, 3).map((n, i) => {
        const check = /다음 확인: (\d{4}-\d{2}-\d{2})/.exec(String(n.content || ""))?.[1];
        return (
          <div key={n.id || i} style={{ padding: "8px 0", borderBottom: i < Math.min(list.length, 3) - 1 ? "1px dashed #e9d5ff" : "none", fontSize: "0.84rem" }}>
            <b style={{ color: "#6d28d9" }}>{kd(String(n.date))}</b>
            {i === 0 && <span style={{ marginLeft: 6, fontSize: "0.7rem", fontWeight: 800, color: "#fff", background: "#7c3aed", borderRadius: 99, padding: "1px 8px" }}>최근</span>}
            {check && check <= today && <span style={{ marginLeft: 6, fontSize: "0.72rem", fontWeight: 800, color: "#b45309" }}>⏰ 확인할 날이 됐습니다</span>}
            <div style={{ whiteSpace: "pre-wrap", color: "#334155", marginTop: 2 }}>{n.content}</div>
          </div>
        );
      })}
    </div>
  );
}
