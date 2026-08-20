"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../constants";
import BehaviorForm from "../components/BehaviorForm";
import StudentTimeline from "../components/StudentTimeline";
import AppShell from "../components/AppShell";
import { useAuth, AuthCheck } from "../components/AuthProvider";

export default function BehaviorPage() {
  const { user, isAdmin } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Fetch students to populate list
    axios
      .get(`${API_BASE_URL}/api/v1/tier/status`)
      .then((res) => {
        // Backend /api/v1/tier/status already scopes `students` to the caller's
        // own class for non-admins (get_student_class_code / normalize_class_identifier).
        // A redundant filter here used to compare the numeric 학생코드 against
        // class_id via .startsWith(), which can never match - it emptied the
        // already-correctly-scoped list, leaving teachers with no students to pick.
        let data = res.data.students || res.data || [];
        if (!Array.isArray(data)) data = [];

        // Unique students
        const unique = data.filter(
          (v: any, i: number, a: any[]) =>
            a.findIndex((t: any) => t.학생코드 === v.학생코드) === i
        );
        setStudents(unique);
        if (unique.length > 0 && !selectedStudent) {
          setSelectedStudent(unique[0]);
        }
      })
      .catch((err) => console.error("Failed to load students", err));
  }, [user, isAdmin]);

  const filteredStudents = students.filter((s) => {
    const name = s.학생이름 || s.이름 || s.학생명 || "";
    const code = s.학생코드 || "";
    return name.includes(searchKeyword) || String(code).includes(searchKeyword);
  });

  const handleLogSubmitted = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <AuthCheck>
      <AppShell
        currentPage="behavior"
        title="✍️ 스마트 행동 기록 및 타임라인"
        subtitle="30초 이내 신속한 ABC 행동기록 입력 및 학생별 누적 타임라인 확인"
      >
        <div className="behavior-outer-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "20px", alignItems: "start" }}>
          {/* Left Column: Student Selector List */}
          <div className="card" style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "var(--text-primary)" }}>
                👥 학생 목록 ({filteredStudents.length}명)
              </div>
              <span className="badge badge-neutral" style={{ fontSize: "0.7rem" }}>
                {isAdmin() ? "전교생" : (user?.class_id || "학급")}
              </span>
            </div>

            {/* Search Box */}
            <div style={{ marginBottom: "12px" }}>
              <input
                type="text"
                placeholder="이름 또는 학번 검색..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "0.82rem",
                  outline: "none",
                  background: "var(--bg-subtle)"
                }}
              />
            </div>

            {/* Student List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
              {filteredStudents.length === 0 ? (
                <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  검색 결과가 없습니다.
                </div>
              ) : (
                filteredStudents.map((s) => {
                  const isSelected = selectedStudent?.학생코드 === s.학생코드;
                  const name = s.학생이름 || s.이름 || s.학생명;
                  const tier = s.Tier || (s["Tier 3"] === "O" ? "Tier 3" : s["Tier 2 (CICO)"] === "O" ? "Tier 2" : "Tier 1");

                  return (
                    <button
                      key={s.학생코드}
                      onClick={() => setSelectedStudent(s)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: isSelected ? "1.5px solid var(--primary-blue)" : "1px solid var(--border-subtle)",
                        background: isSelected ? "var(--primary-light)" : "var(--bg-surface)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: isSelected ? 800 : 600, fontSize: "0.85rem", color: isSelected ? "var(--primary-blue)" : "var(--text-primary)" }}>
                          {name}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          학번 {s.학생코드}
                        </div>
                      </div>
                      <span className={`badge ${tier === "Tier 3" ? "badge-tier3" : tier === "Tier 2" ? "badge-tier2" : "badge-tier1"}`} style={{ fontSize: "0.68rem" }}>
                        {tier}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Behavior Form & Timeline */}
          <div>
            {!selectedStudent ? (
              <div className="empty-state">
                <div className="empty-state-icon">👈</div>
                <div className="empty-state-title">학생을 선택해 주세요</div>
                <div className="empty-state-text">좌측 학생 목록에서 대상을 클릭하면 행동기록 폼과 누적 타임라인이 표시됩니다.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Active Student Mini-Header */}
                <div className="card" style={{ padding: "12px 18px", background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)", borderColor: "#bfdbfe" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--primary-blue)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.95rem" }}>
                        {(selectedStudent.학생이름 || selectedStudent.이름 || selectedStudent.학생명 || "학")[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>
                          {selectedStudent.학생이름 || selectedStudent.이름 || selectedStudent.학생명}
                          <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-muted)", marginLeft: "8px" }}>
                            (학생코드: {selectedStudent.학생코드})
                          </span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                          기록 작성 시 관리자 결재함으로 전송되며, 승인 후 전교 대시보드에 즉시 반영됩니다.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Form & Timeline Split */}
                <div className="behavior-split-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "20px", alignItems: "start" }}>
                  <div className="card" style={{ padding: "20px" }}>
                    <BehaviorForm
                      studentId={selectedStudent.학생코드}
                      studentName={selectedStudent.학생이름 || selectedStudent.이름 || selectedStudent.학생명}
                      onLogSubmitted={handleLogSubmitted}
                    />
                  </div>
                  <div className="card" style={{ padding: "20px" }}>
                    <StudentTimeline
                      studentId={selectedStudent.학생코드}
                      refreshTrigger={refreshTrigger}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </AuthCheck>
  );
}
