"use client";

import { useState, useEffect } from "react";
import axios from "axios";

// ====== 회의록/협의기록 섹션 (학급 공통 또는 학생별, 누적기록) ======
export default function MeetingNotesSection({ apiUrl, meetingType, title, studentCode }: { apiUrl: string, meetingType: string, title: string, studentCode?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotes = async () => {
    try {
      const params = new URLSearchParams({ meeting_type: meetingType });
      if (studentCode) params.append("student_code", studentCode);
      const res = await axios.get(`${apiUrl}/api/v1/meeting-notes?${params.toString()}`);
      setNotes(res.data.notes || []);
    } catch (e) { }
  };

  useEffect(() => { if (expanded) fetchNotes(); }, [expanded]);

  const saveNote = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await axios.post(`${apiUrl}/api/v1/meeting-notes`, { meeting_type: meetingType, date: new Date().toISOString().split('T')[0], content, author: "Teacher", student_code: studentCode || "" });
      setContent(""); fetchNotes(); alert("저장되었습니다.");
    } catch { alert("저장 실패"); } finally { setLoading(false); }
  };

  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "14px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: expanded ? "#0f172a" : "#f8fafc" }}>
        <h3 style={{ margin: 0, fontSize: "0.95rem", color: expanded ? "#e2e8f0" : "#1e293b" }}>📝 {title}</h3>
        <span style={{ color: expanded ? "#94a3b8" : "#64748b", fontSize: '0.85rem' }}>{expanded ? "▲ 접기" : "▼ 펼치기"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "20px", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ marginBottom: "16px" }}>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="협의 내용을 비식별화하여 입력하세요..."
              style={{ width: "100%", minHeight: "80px", padding: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#1e293b", marginBottom: "8px", fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <button onClick={saveNote} disabled={loading || !content.trim()}
              style={{ padding: "8px 16px", background: "#6366f1", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem", opacity: loading ? 0.7 : 1 }}>
              {loading ? "저장 중..." : "협의 기록 저장 (누적)"}
            </button>
          </div>
          <h4 style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#64748b" }}>📋 누적 기록</h4>
          {notes.length === 0 ? <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>기록이 없습니다.</p> : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "200px", overflowY: "auto" }}>
              {notes.map(n => (
                <li key={n.id} style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px dashed #e2e8f0" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" }}>{n.date} | {n.author}</div>
                  <div style={{ fontSize: "0.9rem", color: "#1e293b", whiteSpace: "pre-wrap" }}>{n.content}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
