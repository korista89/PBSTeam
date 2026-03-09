"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import GlobalNav from "../components/GlobalNav";
import { AuthCheck } from "../components/AuthProvider";
import { DOMAINS, VBS } from "./constants";

// ── 타입 정의 ─────────────────────────────────────────────────
interface Student {
  학급ID: string;
  학급명: string;
  학생번호: number;
  학생이름: string;
}
interface VocabRow {
  번호: number;
  범주: string;
  어휘: string;
  청자: boolean;
  모방: boolean;
  명명: boolean;
  매칭: boolean;
  대화: boolean;
  요구: boolean;
  합계: number;
  협의내용: string;
  협의날짜: string;
}
interface CertDomain {
  domain: string;
  met_words: number;
  total_words: number;
  required: number;
  is_achieved: boolean;
  progress_pct: number;
}
interface CertResult {
  domains: CertDomain[];
  total_badges: number;
  max_badges: number;
  all_achieved: boolean;
}
interface MinuteRow {
  날짜: string;
  구분: string;
  "출처(학생/차시)": string;
  내용: string;
  학급ID: string;
}
interface OverviewRow {
  class_id: string;
  class_name: string;
  student_name: string;
  domain_progress: Record<string, number>;
  total_learned: number;
}

// ── 색상 헬퍼 ────────────────────────────────────────────────
const domainColor = (idx: number) => {
  const colors = [
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#f97316",
    "#10b981",
    "#06b6d4",
    "#f59e0b",
    "#6366f1",
    "#ef4444",
    "#14b8a6",
    "#84cc16",
    "#f43f5e",
    "#a855f7",
  ];
  return colors[idx % colors.length];
};

export default function PictureWordPage() {
  const API = (process.env.NEXT_PUBLIC_API_URL || "") + "/api/v1/picture-words";

  // ── 탭 & 전역 상태 ───────────────────────────────────────
  const [tab, setTab] = useState<
    "checklist" | "certification" | "overview" | "lessons" | "minutes"
  >("checklist");
  const [loading, setLoading] = useState(false);

  // ── 로그인 유저 정보 ─────────────────────────────────────
  const [userClassId, setUserClassId] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) {
        const u = JSON.parse(stored);
        setUserClassId(u.class_id || "");
        setUserRole((u.role || u.Role || "").toLowerCase());
      }
    } catch {}
  }, []);

  const isAdmin = userRole === "admin" || userRole === "superadmin";

  // ── 학생 명부 ────────────────────────────────────────────
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [availableClasses, setAvailableClasses] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [classStudents, setClassStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // 학생 추가 모달(TierStatus 연동으로 사용안함)

  // ── Tab별 데이터 ─────────────────────────────────────────
  const [vocab, setVocab] = useState<VocabRow[]>([]);
  const [filterDomain, setFilterDomain] = useState<string>("전체");
  const [cert, setCert] = useState<CertResult | null>(null);
  const [overview, setOverview] = useState<OverviewRow[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [filterLessonDomain, setFilterLessonDomain] = useState<string>("전체");
  const [minutes, setMinutes] = useState<MinuteRow[]>([]);

  // 협의록 입력
  const [newMinute, setNewMinute] = useState({
    date: "",
    kind: "수업협의",
    source: "",
    content: "",
  });

  // ── 초기 데이터 로드 ─────────────────────────────────────
  useEffect(() => {
    // userRole가 로드된 후에만 실행
    if (userRole === "") return;
    // 교사인데 classId가 없으면 로드 안 함
    if (!isAdmin && !userClassId) return;
    loadStudents();
  }, [userClassId, userRole]);

  const loadStudents = useCallback(async () => {
    try {
      const res = isAdmin
        ? await axios.get(`${API}/students`)
        : await axios.get(`${API}/students/by-class/${userClassId}`);
      const list: Student[] = res.data;
      setAllStudents(list);
      // 학급 목록 추출
      const classMap = new Map<string, string>();
      list.forEach((s) => classMap.set(s.학급ID, s.학급명));
      const classes = Array.from(classMap.entries()).map(([id, name]) => ({
        id,
        name,
      }));
      setAvailableClasses(classes);
      // 기본 학급 선택: 관리자는 첫 번째, 교사는 자기 학급
      const defaultClass = isAdmin ? classes[0]?.id || "" : String(userClassId);
      setSelectedClassId(String(defaultClass));
    } catch (e) {
      console.error(e);
    }
  }, [isAdmin, userClassId]);

  useEffect(() => {
    if (!selectedClassId) return;
    const filtered = allStudents.filter((s) => String(s.학급ID) === String(selectedClassId));
    setClassStudents(filtered);
    setSelectedStudent(null);
    setVocab([]);
    setCert(null);
  }, [selectedClassId, allStudents]);

  // ── 탭 변경 시 데이터 로드 ───────────────────────────────
  useEffect(() => {
    if (tab === "lessons") loadLessons();
    if (tab === "minutes") loadMinutes();
    if (tab === "overview") loadOverview();
  }, [tab]);

  useEffect(() => {
    if (tab === "checklist" && selectedStudent) loadVocab();
    if (tab === "certification" && selectedStudent) loadCert();
  }, [tab, selectedStudent?.학생이름]);

  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };

  const loadVocab = () =>
    withLoading(async () => {
      if (!selectedStudent) return;
      const res = await axios.get(
        `${API}/vocab/${selectedStudent.학급ID}/${encodeURIComponent(selectedStudent.학생이름)}`,
      );
      setVocab(res.data);
    });

  const loadCert = () =>
    withLoading(async () => {
      if (!selectedStudent) return;
      const res = await axios.get(
        `${API}/certification/${selectedStudent.학급ID}/${encodeURIComponent(selectedStudent.학생이름)}`,
      );
      setCert(res.data);
    });

  const loadOverview = () =>
    withLoading(async () => {
      const url = isAdmin
        ? `${API}/overview`
        : `${API}/overview?class_id=${userClassId}`;
      const res = await axios.get(url);
      setOverview(res.data);
    });

  const loadLessons = () =>
    withLoading(async () => {
      const res = await axios.get(`${API}/lessons`);
      setLessons(res.data);
    });

  const loadMinutes = () =>
    withLoading(async () => {
      const url = isAdmin
        ? `${API}/minutes`
        : `${API}/minutes?class_id=${userClassId}`;
      const res = await axios.get(url);
      setMinutes(res.data);
    });

  // ── 어휘 업데이트 ────────────────────────────────────────
  const updateQueueRef = useRef<{vocabId: number, field: string, value: any}[]>([]);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleVocabUpdate = async (
    vocabId: number,
    field: string,
    value: any,
  ) => {
    if (!selectedStudent) return;
    // 낙관적 업데이트 (합계 정확하게 계산)
    setVocab((prev) =>
      prev.map((v) => {
        if (v.번호 !== vocabId) return v;
        const updated = { ...v, [field]: value };
        updated.합계 = VBS.reduce(
          (sum, vb) => sum + (updated[vb as keyof VocabRow] ? 1 : 0),
          0,
        );
        return updated;
      }),
    );
    
    // 배치 큐에 저장
    updateQueueRef.current.push({ vocabId, field, value });
    
    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    
    updateTimeoutRef.current = setTimeout(async () => {
      const queue = [...updateQueueRef.current];
      updateQueueRef.current = [];
      if (queue.length === 0) return;
      
      const merged: Record<number, Record<string, any>> = {};
      for (const item of queue) {
        if (!merged[item.vocabId]) merged[item.vocabId] = {};
        merged[item.vocabId][item.field] = item.value;
      }
      
      const payload = Object.entries(merged).map(([vid, updates]) => ({
        vocab_id: parseInt(vid),
        updates
      }));
      
      try {
        await axios.patch(
          `${API}/vocab/batch/${selectedStudent.학급ID}/${encodeURIComponent(selectedStudent.학생이름)}`,
          { payload }
        );
      } catch {
        alert("업데이트 실패: 동기화에 문제가 발생했습니다.");
        loadVocab();
      }
    }, 1500);
  };

  // ── 수업 가이드 업데이트 ─────────────────────────────────
  const handleLessonUpdate = async (
    lessonNum: number,
    field: string,
    value: string,
  ) => {
    try {
      await axios.patch(`${API}/lessons/${lessonNum}`, {
        updates: { [field]: value },
      });
      setLessons((prev) =>
        prev.map((l) => (l.차시 === lessonNum ? { ...l, [field]: value } : l)),
      );
    } catch {
      alert("업데이트 실패");
    }
  };

  // ── 협의록 추가 ─────────────────────────────────────────
  const handleAddMinute = async () => {
    if (!newMinute.date || !newMinute.content || !newMinute.source) {
      alert("날짜, 출처, 내용을 모두 입력해주세요.");
      return;
    }
    try {
      const classInfo = availableClasses.find(
        (c) => c.id === String(isAdmin ? selectedClassId : userClassId),
      );
      await axios.post(`${API}/minutes`, {
        ...newMinute,
        class_id: isAdmin ? selectedClassId : String(userClassId),
        class_name: classInfo?.name || "",
      });
      setNewMinute({ date: "", kind: "수업협의", source: "", content: "" });
      loadMinutes();
    } catch {
      alert("협의록 추가 실패");
    }
  };

  // ── 스타일 헬퍼 ─────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 20px",
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "0.9rem",
    borderRadius: "12px 12px 0 0",
    transition: "all 0.2s",
    marginRight: "4px",
    background: active ? "white" : "#e2e8f0",
    color: active ? "#1e3a8a" : "#64748b",
    borderBottom: active ? "3px solid #2563eb" : "3px solid transparent",
    boxShadow: active ? "0 -4px 12px rgba(37,99,235,0.1)" : "none",
  });

  const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    marginBottom: "20px",
  };

  const chipStyle = (
    active: boolean,
    color = "#2563eb",
  ): React.CSSProperties => ({
    padding: "6px 16px",
    borderRadius: "20px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.85rem",
    border: "none",
    transition: "all 0.2s",
    background: active ? color : "#f1f5f9",
    color: active ? "white" : "#475569",
    boxShadow: active ? `0 4px 8px ${color}44` : "none",
  });

  // ── 좌측 학생 선택 패널 ──────────────────────────────────
  const renderStudentPanel = () => (
    <div style={{ width: "220px", flexShrink: 0 }}>
      <div style={cardStyle}>
        {isAdmin && (
          <>
            <div
              style={{
                fontWeight: 700,
                color: "#1e3a8a",
                marginBottom: "12px",
                fontSize: "0.95rem",
              }}
            >
              📚 학급 선택
            </div>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                marginBottom: "16px",
                fontSize: "0.9rem",
              }}
            >
              {availableClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </>
        )}

        <div
          style={{
            fontWeight: 700,
            color: "#1e3a8a",
            marginBottom: "12px",
            fontSize: "0.95rem",
          }}
        >
          👤 학생 선택{" "}
          {isAdmin
            ? ""
            : `(${availableClasses.find((c) => c.id === String(selectedClassId))?.name || ""})`}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {classStudents.length === 0 ? (
            <div
              style={{
                color: "#94a3b8",
                fontSize: "0.85rem",
                padding: "8px",
                textAlign: "center",
              }}
            >
              등록된 학생이 없습니다
            </div>
          ) : (
            <select
              value={selectedStudent?.학생이름 || ""}
              onChange={(e) => {
                const s = classStudents.find(
                  (st) => st.학생이름 === e.target.value
                );
                if (s) setSelectedStudent(s);
              }}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                fontSize: "0.95rem",
                fontWeight: 600,
                color: "#1e3a8a",
                cursor: "pointer",
                background: "#f8fafc"
              }}
            >
              <option value="" disabled>학생을 선택하세요</option>
              {classStudents.map((s) => (
                <option key={s.학생이름} value={s.학생이름}>
                  {s.학생번호}번 {s.학생이름}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );

  // ── 체크리스트 탭 ────────────────────────────────────────
  const renderChecklist = () => {
    const filtered =
      filterDomain === "전체"
        ? vocab
        : vocab.filter((v) => v.범주 === filterDomain);
    return (
      <div style={{ display: "flex", gap: "20px" }}>
        {renderStudentPanel()}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedStudent ? (
            <div
              style={{
                ...cardStyle,
                textAlign: "center",
                padding: "60px",
                color: "#94a3b8",
              }}
            >
              <div style={{ fontSize: "3rem", marginBottom: "12px" }}>👈</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                왼쪽에서 학급과 학생을 선택하세요
              </div>
            </div>
          ) : (
            <>
              {/* 학생 헤더 */}
              <div
                style={{
                  ...cardStyle,
                  background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
                  color: "white",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        opacity: 0.8,
                        marginBottom: "4px",
                      }}
                    >
                      {selectedStudent.학급명}
                    </div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                      {selectedStudent.학생번호}번 {selectedStudent.학생이름}
                    </div>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        marginTop: "6px",
                        opacity: 0.9,
                      }}
                    >
                      습득 어휘:{" "}
                      <strong>{vocab.filter((v) => v.합계 > 0).length}</strong>{" "}
                      / 156개
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: "3rem",
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      {Math.round(
                        (vocab.filter((v) => v.합계 > 0).length / 156) * 100,
                      )}
                      %
                    </div>
                    <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>
                      전체 달성률
                    </div>
                  </div>
                </div>
              </div>

              {/* 영역 필터 */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  marginBottom: "16px",
                }}
              >
                <button
                  style={chipStyle(filterDomain === "전체")}
                  onClick={() => setFilterDomain("전체")}
                >
                  전체
                </button>
                {DOMAINS.map((d, i) => (
                  <button
                    key={d}
                    style={chipStyle(filterDomain === d, domainColor(i))}
                    onClick={() => setFilterDomain(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {/* 어휘 테이블 */}
              <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.85rem",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: "#1e3a8a",
                          color: "white",
                          position: "sticky",
                          top: 0,
                        }}
                      >
                        <th
                          style={{
                            padding: "12px 10px",
                            textAlign: "center",
                            width: "50px",
                          }}
                        >
                          번호
                        </th>
                        <th
                          style={{
                            padding: "12px 10px",
                            textAlign: "left",
                            width: "120px",
                          }}
                        >
                          범주
                        </th>
                        <th
                          style={{
                            padding: "12px 10px",
                            textAlign: "left",
                            width: "100px",
                          }}
                        >
                          어휘
                        </th>
                        {VBS.map((vb) => (
                          <th
                            key={vb}
                            style={{
                              padding: "12px 8px",
                              textAlign: "center",
                              width: "55px",
                            }}
                          >
                            {vb}
                          </th>
                        ))}
                        <th
                          style={{
                            padding: "12px 8px",
                            textAlign: "center",
                            width: "50px",
                          }}
                        >
                          합계
                        </th>
                        <th style={{ padding: "12px 10px", textAlign: "left" }}>
                          협의내용
                        </th>
                        <th
                          style={{
                            padding: "12px 10px",
                            textAlign: "center",
                            width: "120px",
                          }}
                        >
                          협의날짜
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td
                            colSpan={11}
                            style={{
                              textAlign: "center",
                              padding: "40px",
                              color: "#94a3b8",
                            }}
                          >
                            불러오는 중...
                          </td>
                        </tr>
                      ) : (
                        filtered.map((v, idx) => {
                          const sum = VBS.reduce(
                            (a, vb) => a + (v[vb as keyof VocabRow] ? 1 : 0),
                            0,
                          );
                          const rowBg =
                            sum >= 6
                              ? "#f0fdf4"
                              : sum >= 2
                                ? "#fefce8"
                                : idx % 2 === 0
                                  ? "white"
                                  : "#fafafa";
                          return (
                            <tr
                              key={v.번호}
                              style={{
                                background: rowBg,
                                transition: "background 0.2s",
                              }}
                            >
                              <td
                                style={{
                                  padding: "8px",
                                  textAlign: "center",
                                  color: "#94a3b8",
                                  borderBottom: "1px solid #f1f5f9",
                                }}
                              >
                                {v.번호}
                              </td>
                              <td
                                style={{
                                  padding: "8px",
                                  borderBottom: "1px solid #f1f5f9",
                                }}
                              >
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "6px",
                                    fontSize: "0.78rem",
                                    background: "#eff6ff",
                                    color: "#1d4ed8",
                                    fontWeight: 600,
                                  }}
                                >
                                  {v.범주}
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "8px",
                                  fontWeight: 700,
                                  borderBottom: "1px solid #f1f5f9",
                                }}
                              >
                                {v.어휘}
                              </td>
                              {VBS.map((vb) => (
                                <td
                                  key={vb}
                                  style={{
                                    padding: "8px",
                                    textAlign: "center",
                                    borderBottom: "1px solid #f1f5f9",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={!!v[vb as keyof VocabRow]}
                                    onChange={(e) =>
                                      handleVocabUpdate(
                                        v.번호,
                                        vb,
                                        e.target.checked,
                                      )
                                    }
                                    style={{
                                      width: "18px",
                                      height: "18px",
                                      cursor: "pointer",
                                      accentColor: "#2563eb",
                                    }}
                                  />
                                </td>
                              ))}
                              <td
                                style={{
                                  padding: "8px",
                                  textAlign: "center",
                                  fontWeight: 700,
                                  borderBottom: "1px solid #f1f5f9",
                                  color:
                                    sum >= 6
                                      ? "#15803d"
                                      : sum >= 2
                                        ? "#d97706"
                                        : "#94a3b8",
                                }}
                              >
                                {sum}/6
                              </td>
                              <td
                                style={{
                                  padding: "0",
                                  borderBottom: "1px solid #f1f5f9",
                                }}
                              >
                                <input
                                  type="text"
                                  defaultValue={v.협의내용}
                                  onBlur={(e) =>
                                    handleVocabUpdate(
                                      v.번호,
                                      "협의내용",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="협의 내용 입력..."
                                  style={{
                                    width: "100%",
                                    border: "none",
                                    padding: "8px",
                                    background: "transparent",
                                    fontSize: "0.82rem",
                                    boxSizing: "border-box",
                                  }}
                                />
                              </td>
                              <td
                                style={{
                                  padding: "0",
                                  borderBottom: "1px solid #f1f5f9",
                                }}
                              >
                                <input
                                  type="date"
                                  defaultValue={v.협의날짜}
                                  onBlur={(e) =>
                                    handleVocabUpdate(
                                      v.번호,
                                      "협의날짜",
                                      e.target.value,
                                    )
                                  }
                                  style={{
                                    width: "100%",
                                    border: "none",
                                    padding: "8px",
                                    background: "transparent",
                                    fontSize: "0.82rem",
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── 인증제 탭 ────────────────────────────────────────────
  const renderCertification = () => (
    <div style={{ display: "flex", gap: "20px" }}>
      {renderStudentPanel()}
      <div style={{ flex: 1 }}>
        {!selectedStudent ? (
          <div
            style={{
              ...cardStyle,
              textAlign: "center",
              padding: "60px",
              color: "#94a3b8",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "12px" }}>🏅</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              왼쪽에서 학생을 선택하세요
            </div>
          </div>
        ) : !cert ? (
          <div
            style={{
              ...cardStyle,
              textAlign: "center",
              padding: "40px",
              color: "#94a3b8",
            }}
          >
            불러오는 중...
          </div>
        ) : (
          <>
            {/* 요약 배너 */}
            <div
              style={{
                ...cardStyle,
                background: cert.all_achieved
                  ? "linear-gradient(135deg, #065f46, #10b981)"
                  : "linear-gradient(135deg, #1e3a8a, #2563eb)",
                color: "white",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                    {selectedStudent.학급명} · {selectedStudent.학생이름}
                  </div>
                  <div
                    style={{
                      fontSize: "1.6rem",
                      fontWeight: 800,
                      marginTop: "4px",
                    }}
                  >
                    {cert.all_achieved
                      ? "🎉 전체 인증 달성!"
                      : `🏅 ${cert.total_badges} / ${cert.max_badges} 영역 인증`}
                  </div>
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "0.9rem",
                      opacity: 0.9,
                    }}
                  >
                    기준: 각 영역별 1개 이상 하위 영역(VB) 체크된 어휘 8개 달성
                  </div>
                </div>
                <div
                  style={{ fontSize: "5rem", fontWeight: 800, opacity: 0.2 }}
                >
                  🏆
                </div>
              </div>
              {/* 전체 진척도 바 */}
              <div
                style={{
                  marginTop: "16px",
                  background: "rgba(255,255,255,0.2)",
                  borderRadius: "8px",
                  height: "10px",
                }}
              >
                <div
                  style={{
                    width: `${(cert.total_badges / cert.max_badges) * 100}%`,
                    height: "100%",
                    background: "white",
                    borderRadius: "8px",
                    transition: "width 0.5s",
                  }}
                />
              </div>
            </div>

            {/* 영역별 카드 그리드 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: "16px",
              }}
            >
              {cert.domains.map((d, i) => (
                <div
                  key={d.domain}
                  style={{
                    background: "white",
                    borderRadius: "14px",
                    padding: "18px",
                    border: d.is_achieved
                      ? `2px solid ${domainColor(i)}`
                      : "1px solid #e2e8f0",
                    boxShadow: d.is_achieved
                      ? `0 8px 20px ${domainColor(i)}22`
                      : "0 2px 8px rgba(0,0,0,0.06)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {d.is_achieved && (
                    <div
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -8,
                        fontSize: "3.5rem",
                        opacity: 0.12,
                      }}
                    >
                      🏅
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: "#1e293b",
                      }}
                    >
                      {d.domain}
                    </div>
                    {d.is_achieved && (
                      <span
                        style={{
                          background: domainColor(i),
                          color: "white",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                        }}
                      >
                        인증
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "8px",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: "10px",
                        background: "#f1f5f9",
                        borderRadius: "5px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${d.progress_pct}%`,
                          height: "100%",
                          background: d.is_achieved
                            ? domainColor(i)
                            : "#f59e0b",
                          borderRadius: "5px",
                          transition: "width 0.5s",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        color: d.is_achieved ? domainColor(i) : "#64748b",
                        minWidth: "35px",
                      }}
                    >
                      {d.met_words}/{d.required}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                    {d.is_achieved
                      ? "✅ 달성 완료"
                      : `${d.required - d.met_words}개 더 필요 (VB 1개 이상 어휘)`}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ── 학급 현황 탭 ─────────────────────────────────────────
  const renderOverview = () => {
    const grouped = overview.reduce(
      (acc, row) => {
        if (!acc[row.student_name]) acc[row.student_name] = row;
        return acc;
      },
      {} as Record<string, OverviewRow>,
    );
    const studentNames = Object.keys(grouped);
    return (
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h2 style={{ margin: 0, color: "#1e3a8a", fontSize: "1.1rem" }}>
            📊 학생별 · 영역별 어휘 습득 현황
          </h2>
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              fontSize: "0.8rem",
            }}
          >
            <span
              style={{
                background: "#dcfce7",
                padding: "3px 8px",
                borderRadius: "6px",
                color: "#15803d",
                fontWeight: 600,
              }}
            >
              12 완료
            </span>
            <span
              style={{
                background: "#fefce8",
                padding: "3px 8px",
                borderRadius: "6px",
                color: "#d97706",
                fontWeight: 600,
              }}
            >
              1~11 진행
            </span>
            <span
              style={{
                background: "#f9fafb",
                padding: "3px 8px",
                borderRadius: "6px",
                color: "#94a3b8",
                fontWeight: 600,
              }}
            >
              0 미시작
            </span>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.83rem",
            }}
          >
            <thead>
              <tr style={{ background: "#1e3a8a", color: "white" }}>
                <th
                  style={{
                    padding: "12px 14px",
                    textAlign: "left",
                    borderRight: "1px solid #334155",
                    position: "sticky",
                    left: 0,
                    background: "#1e3a8a",
                    zIndex: 1,
                  }}
                >
                  영역
                </th>
                {studentNames.map((n) => (
                  <th
                    key={n}
                    style={{
                      padding: "12px 10px",
                      textAlign: "center",
                      borderLeft: "1px solid #334155",
                      minWidth: "80px",
                    }}
                  >
                    {n}
                  </th>
                ))}
                <th
                  style={{
                    padding: "12px 10px",
                    textAlign: "center",
                    borderLeft: "1px solid #334155",
                    background: "#0f2d6e",
                  }}
                >
                  합계
                </th>
              </tr>
            </thead>
            <tbody>
              {DOMAINS.map((domain, di) => {
                const rowTotal = studentNames.reduce(
                  (a, n) => a + (grouped[n]?.domain_progress[domain] || 0),
                  0,
                );
                return (
                  <tr
                    key={domain}
                    style={{ borderBottom: "1px solid #f1f5f9" }}
                  >
                    <td
                      style={{
                        padding: "10px 14px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#fafafa",
                        borderRight: "1px solid #e2e8f0",
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: domainColor(di),
                          marginRight: "6px",
                        }}
                      />
                      {domain}
                    </td>
                    {studentNames.map((n) => {
                      const count = grouped[n]?.domain_progress[domain] || 0;
                      const bg =
                        count === 12
                          ? "#dcfce7"
                          : count > 0
                            ? "#fefce8"
                            : "white";
                      const color =
                        count === 12
                          ? "#15803d"
                          : count > 0
                            ? "#d97706"
                            : "#cbd5e1";
                      return (
                        <td
                          key={n}
                          style={{
                            padding: "10px",
                            textAlign: "center",
                            background: bg,
                            borderLeft: "1px solid #f1f5f9",
                          }}
                        >
                          <div
                            style={{ fontWeight: 700, color, fontSize: "1rem" }}
                          >
                            {count}
                          </div>
                          <div
                            style={{
                              height: "4px",
                              background: "#e2e8f0",
                              borderRadius: "2px",
                              marginTop: "4px",
                            }}
                          >
                            <div
                              style={{
                                width: `${(count / 12) * 100}%`,
                                height: "100%",
                                background:
                                  count === 12 ? "#10b981" : "#f59e0b",
                                borderRadius: "2px",
                              }}
                            />
                          </div>
                        </td>
                      );
                    })}
                    <td
                      style={{
                        padding: "10px",
                        textAlign: "center",
                        background: "#f0f9ff",
                        borderLeft: "1px solid #e2e8f0",
                        fontWeight: 700,
                        color: "#0369a1",
                      }}
                    >
                      {rowTotal}
                    </td>
                  </tr>
                );
              })}
              {/* 합계 행 */}
              <tr
                style={{
                  background: "#f8fafc",
                  fontWeight: 700,
                  borderTop: "2px solid #e2e8f0",
                }}
              >
                <td
                  style={{
                    padding: "12px 14px",
                    background: "#f1f5f9",
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                  }}
                >
                  전체 합계
                </td>
                {studentNames.map((n) => {
                  const total = grouped[n]?.total_learned || 0;
                  return (
                    <td
                      key={n}
                      style={{
                        padding: "10px",
                        textAlign: "center",
                        borderLeft: "1px solid #e2e8f0",
                        color: "#1e3a8a",
                        fontSize: "1rem",
                      }}
                    >
                      {total}
                    </td>
                  );
                })}
                <td
                  style={{
                    padding: "10px",
                    textAlign: "center",
                    borderLeft: "1px solid #e2e8f0",
                    color: "#0369a1",
                  }}
                >
                  {studentNames.reduce(
                    (a, n) => a + (grouped[n]?.total_learned || 0),
                    0,
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── 수업 가이드 탭 ───────────────────────────────────────
  const renderLessons = () => {
    const filtered =
      filterLessonDomain === "전체"
        ? lessons
        : lessons.filter((l) => l.영역 === filterLessonDomain);
    return (
      <div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "16px",
          }}
        >
          <button
            style={chipStyle(filterLessonDomain === "전체")}
            onClick={() => setFilterLessonDomain("전체")}
          >
            전체 ({lessons.length})
          </button>
          {DOMAINS.map((d, i) => (
            <button
              key={d}
              style={chipStyle(filterLessonDomain === d, domainColor(i))}
              onClick={() => setFilterLessonDomain(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.85rem",
              }}
            >
              <thead>
                <tr style={{ background: "#475569", color: "white" }}>
                  <th
                    style={{
                      padding: "14px 12px",
                      width: "55px",
                      textAlign: "center",
                    }}
                  >
                    차시
                  </th>
                  <th style={{ padding: "14px 12px", width: "120px" }}>영역</th>
                  <th
                    style={{
                      padding: "14px 12px",
                      width: "80px",
                      textAlign: "center",
                    }}
                  >
                    언어행동
                  </th>
                  <th style={{ padding: "14px 12px", width: "150px" }}>제재</th>
                  <th style={{ padding: "14px 12px", minWidth: "250px" }}>
                    목표
                  </th>
                  <th
                    style={{
                      padding: "14px 12px",
                      width: "130px",
                      textAlign: "center",
                    }}
                  >
                    수업날짜
                  </th>
                  <th style={{ padding: "14px 12px", minWidth: "180px" }}>
                    준비협의내용
                  </th>
                  <th
                    style={{
                      padding: "14px 12px",
                      width: "130px",
                      textAlign: "center",
                    }}
                  >
                    협의날짜
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        textAlign: "center",
                        padding: "40px",
                        color: "#94a3b8",
                      }}
                    >
                      불러오는 중...
                    </td>
                  </tr>
                ) : (
                  filtered.map((l, idx) => (
                    <tr
                      key={l.차시}
                      style={{
                        background: idx % 2 === 0 ? "white" : "#fafafa",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "center",
                          color: "#64748b",
                          fontWeight: 700,
                        }}
                      >
                        {l.차시}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "8px",
                            fontSize: "0.78rem",
                            background: "#eff6ff",
                            color: "#1d4ed8",
                            fontWeight: 600,
                          }}
                        >
                          {l.영역}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "center",
                          fontWeight: 700,
                          color: "#7c3aed",
                        }}
                      >
                        {l.언어행동}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                        {l.제재}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#334155",
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {l.목표}
                      </td>
                      <td
                        style={{ padding: 0, borderLeft: "1px solid #f1f5f9" }}
                      >
                        <input
                          type="date"
                          defaultValue={l.수업날짜}
                          onBlur={(e) =>
                            handleLessonUpdate(
                              l.차시,
                              "수업날짜",
                              e.target.value,
                            )
                          }
                          style={{
                            width: "100%",
                            border: "none",
                            padding: "10px 12px",
                            background: "transparent",
                            fontSize: "0.83rem",
                            textAlign: "center",
                          }}
                        />
                      </td>
                      <td
                        style={{ padding: 0, borderLeft: "1px solid #f1f5f9" }}
                      >
                        <textarea
                          defaultValue={l.준비협의내용}
                          onBlur={(e) =>
                            handleLessonUpdate(
                              l.차시,
                              "준비협의내용",
                              e.target.value,
                            )
                          }
                          rows={2}
                          placeholder="협의 내용..."
                          style={{
                            width: "100%",
                            border: "none",
                            padding: "10px 12px",
                            background: "transparent",
                            fontSize: "0.82rem",
                            resize: "vertical",
                            boxSizing: "border-box",
                          }}
                        />
                      </td>
                      <td
                        style={{ padding: 0, borderLeft: "1px solid #f1f5f9" }}
                      >
                        <input
                          type="date"
                          defaultValue={l.협의날짜}
                          onBlur={(e) =>
                            handleLessonUpdate(
                              l.차시,
                              "협의날짜",
                              e.target.value,
                            )
                          }
                          style={{
                            width: "100%",
                            border: "none",
                            padding: "10px 12px",
                            background: "transparent",
                            fontSize: "0.83rem",
                            textAlign: "center",
                          }}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ── 협의록 탭 ────────────────────────────────────────────
  const renderMinutes = () => (
    <div>
      {/* 입력 폼 */}
      <div style={{ ...cardStyle, marginBottom: "16px" }}>
        <h3 style={{ margin: "0 0 16px", color: "#1e3a8a", fontSize: "1rem" }}>
          + 협의록 추가
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "150px 160px 1fr 1fr auto",
            gap: "10px",
            alignItems: "end",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.78rem",
                color: "#64748b",
                marginBottom: "4px",
                fontWeight: 600,
              }}
            >
              날짜
            </div>
            <input
              type="date"
              value={newMinute.date}
              onChange={(e) =>
                setNewMinute((p) => ({ ...p, date: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: "0.78rem",
                color: "#64748b",
                marginBottom: "4px",
                fontWeight: 600,
              }}
            >
              구분
            </div>
            <select
              value={newMinute.kind}
              onChange={(e) =>
                setNewMinute((p) => ({ ...p, kind: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
              }}
            >
              <option>수업협의</option>
              <option>평가협의</option>
              <option>기타</option>
            </select>
          </div>
          <div>
            <div
              style={{
                fontSize: "0.78rem",
                color: "#64748b",
                marginBottom: "4px",
                fontWeight: 600,
              }}
            >
              출처(학생명/차시)
            </div>
            <input
              type="text"
              value={newMinute.source}
              onChange={(e) =>
                setNewMinute((p) => ({ ...p, source: e.target.value }))
              }
              placeholder="예: 홍길동 / 5차시"
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: "0.78rem",
                color: "#64748b",
                marginBottom: "4px",
                fontWeight: 600,
              }}
            >
              내용
            </div>
            <input
              type="text"
              value={newMinute.content}
              onChange={(e) =>
                setNewMinute((p) => ({ ...p, content: e.target.value }))
              }
              placeholder="협의 내용을 입력하세요"
              onKeyDown={(e) => e.key === "Enter" && handleAddMinute()}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            onClick={handleAddMinute}
            style={{
              padding: "10px 20px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            추가
          </button>
        </div>
      </div>

      {/* 협의록 테이블 */}
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.87rem",
          }}
        >
          <thead>
            <tr style={{ background: "#334155", color: "white" }}>
              <th
                style={{
                  padding: "14px 16px",
                  width: "120px",
                  textAlign: "left",
                }}
              >
                날짜
              </th>
              <th
                style={{
                  padding: "14px 12px",
                  width: "100px",
                  textAlign: "center",
                }}
              >
                구분
              </th>
              <th
                style={{
                  padding: "14px 12px",
                  width: "160px",
                  textAlign: "left",
                }}
              >
                학생 / 차시
              </th>
              <th style={{ padding: "14px 16px", textAlign: "left" }}>
                협의 내용
              </th>
              {isAdmin && (
                <th
                  style={{
                    padding: "14px 12px",
                    width: "100px",
                    textAlign: "center",
                  }}
                >
                  학급
                </th>
              )}
              <th
                style={{
                  padding: "14px 12px",
                  width: "60px",
                  textAlign: "center",
                }}
              >
                삭제
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "#94a3b8",
                  }}
                >
                  불러오는 중...
                </td>
              </tr>
            ) : minutes.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "center",
                    padding: "50px",
                    color: "#cbd5e1",
                  }}
                >
                  기록된 협의 내용이 없습니다.
                </td>
              </tr>
            ) : (
              minutes.map((m, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    background: i % 2 === 0 ? "white" : "#fafafa",
                  }}
                >
                  <td style={{ padding: "14px 16px", color: "#64748b" }}>
                    {m.날짜}
                  </td>
                  <td style={{ padding: "14px 12px", textAlign: "center" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "10px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background:
                          m.구분 === "수업협의"
                            ? "#e0f2fe"
                            : m.구분 === "평가협의"
                              ? "#fef9c3"
                              : "#f1f5f9",
                        color:
                          m.구분 === "수업협의"
                            ? "#0369a1"
                            : m.구분 === "평가협의"
                              ? "#a16207"
                              : "#475569",
                      }}
                    >
                      {m.구분}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "14px 12px",
                      fontWeight: 600,
                      color: "#1e293b",
                    }}
                  >
                    {m["출처(학생/차시)"]}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      color: "#334155",
                      lineHeight: 1.6,
                    }}
                  >
                    {m.내용}
                  </td>
                  {isAdmin && (
                    <td
                      style={{
                        padding: "14px 12px",
                        textAlign: "center",
                        color: "#64748b",
                        fontSize: "0.8rem",
                      }}
                    >
                      {m.학급ID}
                    </td>
                  )}
                  <td style={{ padding: "14px 12px", textAlign: "center" }}>
                    <button
                      onClick={async () => {
                        if (confirm("삭제하시겠습니까?")) {
                          await axios.delete(`${API}/minutes/${i + 1}`);
                          loadMinutes();
                        }
                      }}
                      style={{
                        padding: "4px 8px",
                        background: "#fef2f2",
                        color: "#ef4444",
                        border: "1px solid #fecaca",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.78rem",
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── 메인 렌더 ────────────────────────────────────────────
  const TABS = [
    { id: "checklist", label: "📝 학생 체크리스트" },
    { id: "certification", label: "🏅 인증제 현황표" },
    { id: "overview", label: "📊 학급 현황" },
    { id: "lessons", label: "📚 수업 가이드" },
    { id: "minutes", label: "📋 협의록" },
  ] as const;

  return (
    <AuthCheck>
      <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
        <GlobalNav currentPage="picture-word" />
        <main
          style={{ maxWidth: "1600px", margin: "0 auto", padding: "24px 20px" }}
        >
          {/* 페이지 헤더 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px",
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "1.6rem",
                  fontWeight: 800,
                  color: "#1e3a8a",
                }}
              >
                🎨 경은그림말
              </h1>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: "#64748b",
                  marginTop: "4px",
                }}
              >
                의사소통 중심 어휘 교육 · VB-MAPP 기반 학습 관리 시스템
              </div>
            </div>
            <button
              onClick={() => {
                if (
                  confirm("시스템을 초기화하고 기본 시트를 생성하시겠습니까?")
                ) {
                  axios.post(`${API}/init`).then(() => alert("초기화 완료"));
                }
              }}
              style={{
                padding: "10px 18px",
                background: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "0.85rem",
              }}
            >
              ⚙️ 시트 초기화
            </button>
          </div>

          {/* 탭 내비게이션 */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #e2e8f0",
              marginBottom: "24px",
              overflowX: "auto",
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                style={tabStyle(tab === t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 탭 콘텐츠 */}
          {tab === "checklist" && renderChecklist()}
          {tab === "certification" && renderCertification()}
          {tab === "overview" && renderOverview()}
          {tab === "lessons" && renderLessons()}
          {tab === "minutes" && renderMinutes()}
        </main>
      </div>
    </AuthCheck>
  );
}
