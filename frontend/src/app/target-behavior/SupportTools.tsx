"use client";

// 개별학생 행동중재의 보조 도구 — 예전 개별학생대시보드에서 옮겨 왔다.
// 상담·관찰 기록(⓪), AI 종합 분석(①), EBP 추천(③), 위기행동 없었던 날(④), 약물 반응 의견서(⑥)
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import ReadableAIResult from "../components/ReadableAIResult";
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

interface MedicationEntry { name: string; dose: string; }

function MedicationEntryList({ title, entries, onChange }: {
  title: string; entries: MedicationEntry[]; onChange: (entries: MedicationEntry[]) => void;
}) {
  const inputStyle = { flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px', display: 'block' };

  const updateEntry = (i: number, field: 'name' | 'dose', value: string) => {
    onChange(entries.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };
  const removeEntry = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const addEntry = () => onChange([...entries, { name: '', dose: '' }]);

  return (
    <div>
      <label style={labelStyle}>{title}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {entries.map((entry, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px' }}>
            <input value={entry.name} onChange={e => updateEntry(i, 'name', e.target.value)} placeholder="예: 메틸페니데이트" style={inputStyle} />
            <input value={entry.dose} onChange={e => updateEntry(i, 'dose', e.target.value)} placeholder="용량 (예: 10mg)" style={{ ...inputStyle, flex: '0 0 120px' }} />
            <button onClick={() => removeEntry(i)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', width: '32px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </div>
      {entries.length === 0 && <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>약물을 추가하지 않으면 &quot;미복용&quot;으로 기록됩니다.</p>}
      <button onClick={addEntry} style={{ marginTop: '6px', background: 'none', border: 'none', color: '#2563eb', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>+ 약물 추가</button>
    </div>
  );
}

export function MedicationResponseReport({ studentCode, apiUrl }: { studentCode: string, apiUrl: string }) {
  const [beforeMeds, setBeforeMeds] = useState<MedicationEntry[]>([{ name: "", dose: "" }]);
  const [afterMeds, setAfterMeds] = useState<MedicationEntry[]>([{ name: "", dose: "" }]);
  const [beforeStart, setBeforeStart] = useState("");
  const [beforeEnd, setBeforeEnd] = useState("");
  const [afterStart, setAfterStart] = useState("");
  const [afterEnd, setAfterEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [copyLabel, setCopyLabel] = useState("복사하기");

  const canSubmit = !!(beforeStart && beforeEnd && afterStart && afterEnd);

  const requestReport = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await axios.post(`${apiUrl}/api/v1/analytics/ai-medication-response-report`, {
        student_code: studentCode,
        before_medications: beforeMeds.filter(m => m.name.trim()),
        after_medications: afterMeds.filter(m => m.name.trim()),
        before_start: beforeStart, before_end: beforeEnd,
        after_start: afterStart, after_end: afterEnd,
      }, { timeout: 240000 });
      setAnalysis(res.data.analysis || "분석 결과가 없습니다.");
    } catch (e: any) {
      setAnalysis("⚠️ 의견서 생성 실패. (" + (e?.response?.data?.detail || e?.message || "타임아웃") + ")");
    } finally { setLoading(false); }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(analysis);
      setCopyLabel("복사됨 ✓");
      setTimeout(() => setCopyLabel("복사하기"), 1500);
    } catch { /* clipboard unavailable — no-op */ }
  };

  const dateInputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', boxSizing: 'border-box' as const };
  const labelStyle = { fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: '4px', display: 'block' };

  return (
    <div>
      <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>💊 약물 반응 모니터링 의견서</h3>
      <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
        약물 복용 변경 전·후 기간을 설정하면 교실에서 관찰된 행동 변화를 정리한 담임교사 의견서를 만듭니다.
        약물 시작 전(미복용)·병용 약물 등 여러 건을 함께 입력할 수 있습니다.
        정신건강의학과 진료 시 참고 자료로 제출할 수 있습니다. <strong>진단이나 처방을 대신하지는 않습니다.</strong>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px' }}>
        <MedicationEntryList title="변경 전 복용 약물" entries={beforeMeds} onChange={setBeforeMeds} />
        <MedicationEntryList title="변경 후 복용 약물" entries={afterMeds} onChange={setAfterMeds} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <label style={labelStyle}>약물 변경 전 기간</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input type="date" value={beforeStart} onChange={e => setBeforeStart(e.target.value)} style={dateInputStyle} />
            <input type="date" value={beforeEnd} onChange={e => setBeforeEnd(e.target.value)} style={dateInputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>약물 변경 후 기간</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input type="date" value={afterStart} onChange={e => setAfterStart(e.target.value)} style={dateInputStyle} />
            <input type="date" value={afterEnd} onChange={e => setAfterEnd(e.target.value)} style={dateInputStyle} />
          </div>
        </div>
      </div>

      <button onClick={requestReport} disabled={!canSubmit || loading} className="btn btn-primary" style={{ width: '100%', opacity: (!canSubmit || loading) ? 0.5 : 1 }}>
        {loading ? "관찰 의견서 작성 중... 🧠" : "📋 담임교사 관찰 의견서 생성"}
      </button>

      {analysis && !loading && (
        <div style={{ marginTop: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button onClick={copyToClipboard} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 10px', fontSize: '0.75rem', color: '#475569', cursor: 'pointer' }}>{copyLabel}</button>
          </div>
          <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#1e293b', maxHeight: '520px', overflowY: 'auto' }} className="custom-scrollbar">
            <ReadableAIResult text={analysis} />
          </div>
        </div>
      )}
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

// 위기행동 기록은 일이 생겼을 때만 남으므로, '없었던 날'을 교사가 직접 확인해 둔다.
const kd = (iso: string) => { const [, m, d] = iso.split("-"); return `${+m}. ${+d}.`; };
const todayIso = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function CalmDays({ studentCode, yearStart }: { studentCode: string; yearStart: string }) {
  const [days, setDays] = useState<string[]>([]);
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [msg, setMsg] = useState("");
  const enc = encodeURIComponent(studentCode);
  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API_BASE_URL}/api/v1/behavior-log/no-incident/${enc}`);
      setDays((r.data?.dates || []) as string[]);
    } catch { setDays([]); }
  }, [enc]);
  useEffect(() => { setMsg(""); void load(); }, [load]);
  const save = async (a: string, b: string) => {
    try {
      const r = await axios.post(`${API_BASE_URL}/api/v1/behavior-log/no-incident/${enc}`, { start_date: a, end_date: b });
      const n = (r.data?.added || []).length, skip = (r.data?.skipped_has_incident || []).length, dup = (r.data?.already || []).length;
      setMsg(`${n}일을 ‘위기행동 없음’으로 기록했습니다.${dup ? ` (이미 기록된 ${dup}일 제외)` : ""}${skip ? ` 위기행동이 기록된 ${skip}일은 제외했습니다.` : ""}`);
      await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };
  const remove = async (d: string) => {
    try { await axios.delete(`${API_BASE_URL}/api/v1/behavior-log/no-incident/${enc}/${d}`); await load(); } catch { setMsg("삭제하지 못했습니다."); }
  };
  const line = "#e8edf3";
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 800, fontSize: "1rem" }}>✅ 위기행동이 없었던 날 기록</div>
      <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>행동이 없었던 것도 소중한 기록입니다. 기록이 없는 날이 ‘없었음’인지 ‘기록 안 함’인지 구분하는 근거가 됩니다. (평일만 기록됩니다)</p>
      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => save(todayIso(), todayIso())} className="btn btn-primary" style={{ fontSize: "0.85rem" }}>🌤️ 오늘은 위기행동이 없었어요</button>
        <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>또는 기간 선택</span>
        <input type="date" value={from} max={todayIso()} onChange={e => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} style={{ padding: 6, borderRadius: 8, border: `1px solid ${line}` }} />
        <span>~</span>
        <input type="date" value={to} min={from} max={todayIso()} onChange={e => setTo(e.target.value)} style={{ padding: 6, borderRadius: 8, border: `1px solid ${line}` }} />
        <button onClick={() => save(from, to)} className="btn btn-secondary" style={{ fontSize: "0.82rem" }}>이 기간 기록</button>
      </div>
      {msg && <p style={{ margin: "8px 0 0", fontSize: "0.82rem", color: "#475569" }}>{msg}</p>}
      <div style={{ marginTop: 10, fontSize: "0.82rem", color: "#475569" }}>
        올해 확인한 무발생 <b style={{ color: "#16a34a" }}>{days.filter(d => d >= yearStart).length}일</b>
        {days.length > 0 && (
          <span style={{ marginLeft: 10, display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
            {[...days].reverse().slice(0, 6).map(d => (
              <span key={d} style={{ background: "#f0fdf4", color: "#16a34a", borderRadius: 99, padding: "2px 10px", fontSize: "0.74rem", fontWeight: 700 }}>
                {kd(d)} <button onClick={() => remove(d)} title="이 날짜 기록 취소" style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
              </span>
            ))}
          </span>
        )}
      </div>
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
