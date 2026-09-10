"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "../../constants";
import AppShell from "../../components/AppShell";
import { AuthCheck, useAuth } from "../../components/AuthProvider";

const PLACES = ["교실", "화장실", "급식실", "복도/계단", "운동장", "통학버스", "기타"];
const ACTION_TYPES = [
    { value: "O(제지)", label: "방어 및 보호를 위한 제지" },
    { value: "O(개별학생교육지원)", label: "개별학생교육지원(분리지도)" },
    { value: "O(제지+개별학생교육지원)", label: "제지 + 개별학생교육지원 둘 다" },
];

function nowLocalDateTime() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    };
}

// 위기행동 발생 직후 또는 개별학생교육지원 직후, 그 자리에서 바로 남길 수 있을 정도로
// 간략한 입력 경로. 기존 상세 폼(components/BehaviorForm.tsx)이 쓰는 것과 동일한
// POST /api/v1/behavior-log 엔드포인트에 핵심 필드만 채워 제출한다 — 나머지 상세 필드는
// 비워 두고, 필요하면 나중에 관리자 결재함/재작성 요청으로 보완한다.
export default function QuickBehaviorLogPage() {
    const router = useRouter();
    const { user } = useAuth();
    const [students, setStudents] = useState<any[]>([]);
    const [studentCode, setStudentCode] = useState("");
    const [actionType, setActionType] = useState(ACTION_TYPES[0].value);
    const { date: today, time: nowTime } = nowLocalDateTime();
    const [occurredDate, setOccurredDate] = useState(today);
    const [occurredTime, setOccurredTime] = useState(nowTime);
    const [place, setPlace] = useState("교실");
    const [summary, setSummary] = useState("");
    const [reportTime, setReportTime] = useState("");
    const [noticeTime, setNoticeTime] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

    const fetchStudents = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/v1/tier/status`);
            let data = res.data.students || res.data || [];
            if (!Array.isArray(data)) data = [];
            const unique = data.filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => t.학생코드 === v.학생코드) === i);
            setStudents(unique);
            if (!studentCode && unique[0]) setStudentCode(unique[0].학생코드);
        } catch (err) {
            console.error(err);
        }
    }, [studentCode]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { void fetchStudents(); }, [fetchStudents]);

    const selectedStudent = students.find(s => s.학생코드 === studentCode);
    const missingReport = !reportTime.trim();
    const missingNotice = !noticeTime.trim();

    const handleSubmit = async () => {
        if (!studentCode) { alert("학생을 선택하세요."); return; }
        if (!summary.trim()) { alert("간단한 경위를 입력하세요."); return; }
        setSubmitting(true);
        setResult(null);
        try {
            const payload: Record<string, string> = {
                학생코드: studentCode,
                학생명: selectedStudent?.학생이름 || selectedStudent?.학생명 || studentCode,
                입력교사명: user?.name || user?.id || "알수없음",
                행동발생날짜: occurredDate,
                시간대: occurredTime,
                "행동 발생 장소": place,
                "특기사항(기타)": summary,
                "물리적제지, 3/4호분리지도,본인/타인상해 발생 여부": actionType,
                "발생 시 지도교사": user?.name || user?.id || "",
                "1차_경위": summary,
                "관리자_보고_시간": reportTime,
                "학부모_알림_시간": noticeTime,
            };
            const res = await axios.post(`${API_BASE_URL}/api/v1/behavior-log`, payload);
            if (res.data.success) {
                setResult({ ok: true, msg: "빠른 기록이 접수되었습니다. 상세 내용은 나중에 결재함/로그에서 보완할 수 있습니다." });
                setSummary(""); setReportTime(""); setNoticeTime("");
            } else {
                setResult({ ok: false, msg: "제출 실패: " + (res.data.message || "알 수 없는 오류") });
            }
        } catch (err: any) {
            setResult({ ok: false, msg: "오류 발생: " + (err.response?.data?.detail || err.message) });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AuthCheck>
            <AppShell
                currentPage="behavior-quick"
                title="🚨 빠른 위기 기록"
                subtitle="위기행동 발생 또는 개별학생교육지원 직후, 핵심만 먼저 남기는 간소 입력"
                hideDateFilter={true}
                headerActions={
                    <button onClick={() => router.push("/logs")} className="btn btn-secondary">
                        🗂️ 전체 로그 보기
                    </button>
                }
            >
                <div className="card" style={{ maxWidth: "640px", margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "8px", padding: "10px 14px", fontSize: "0.82rem", color: "#92400e" }}>
                        ⏱️ 이 화면은 핵심 항목만 빠르게 남기기 위한 간소 입력입니다. 행동유형·강도 등 상세 분석 항목은 비워둔 채 제출되며, 결재함/전체 로그에서 나중에 보완할 수 있습니다.
                    </div>

                    <label style={{ fontSize: "0.82rem", fontWeight: 700 }}>학생
                        <select value={studentCode} onChange={e => setStudentCode(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: 4 }}>
                            {students.map(s => (
                                <option key={s.학생코드} value={s.학생코드}>{s.학생이름 || s.학생명} ({s.학생코드})</option>
                            ))}
                        </select>
                    </label>

                    <label style={{ fontSize: "0.82rem", fontWeight: 700 }}>조치유형
                        <select value={actionType} onChange={e => setActionType(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: 4 }}>
                            {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </select>
                    </label>

                    <div style={{ display: "flex", gap: "10px" }}>
                        <label style={{ fontSize: "0.82rem", fontWeight: 700, flex: 1 }}>발생 일자
                            <input type="date" value={occurredDate} onChange={e => setOccurredDate(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: 4, boxSizing: "border-box" }} />
                        </label>
                        <label style={{ fontSize: "0.82rem", fontWeight: 700, flex: 1 }}>발생 시각
                            <input type="time" value={occurredTime} onChange={e => setOccurredTime(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: 4, boxSizing: "border-box" }} />
                        </label>
                    </div>

                    <label style={{ fontSize: "0.82rem", fontWeight: 700 }}>장소
                        <select value={place} onChange={e => setPlace(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: 4 }}>
                            {PLACES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </label>

                    <label style={{ fontSize: "0.82rem", fontWeight: 700 }}>경위 (한 줄로 간단히)
                        <input
                            type="text"
                            value={summary}
                            onChange={e => setSummary(e.target.value)}
                            placeholder="예: 과제 지시 후 소리를 지르며 책상을 넘어뜨려 분리지도함"
                            style={{ width: "100%", padding: "8px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: 4, boxSizing: "border-box" }}
                        />
                    </label>

                    <div style={{ display: "flex", gap: "10px" }}>
                        <label style={{ fontSize: "0.82rem", fontWeight: 700, flex: 1, color: missingReport ? "#b91c1c" : undefined }}>학교장(관리자) 보고 시각
                            <input type="time" value={reportTime} onChange={e => setReportTime(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "8px", border: `1px solid ${missingReport ? "#f59e0b" : "#cbd5e1"}`, marginTop: 4, boxSizing: "border-box" }} />
                        </label>
                        <label style={{ fontSize: "0.82rem", fontWeight: 700, flex: 1, color: missingNotice ? "#b91c1c" : undefined }}>보호자 알림 시각
                            <input type="time" value={noticeTime} onChange={e => setNoticeTime(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "8px", border: `1px solid ${missingNotice ? "#f59e0b" : "#cbd5e1"}`, marginTop: 4, boxSizing: "border-box" }} />
                        </label>
                    </div>
                    {(missingReport || missingNotice) && (
                        <div style={{ fontSize: "0.76rem", color: "#92400e" }}>
                            ⚠️ 보고·알림 시각을 비워두면 나중에 결재함/전체 로그에서 꼭 보완하세요 — 법정 보고·알림 의무는 플랫폼 입력만으로 대신할 수 없습니다.
                        </div>
                    )}

                    <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary" style={{ padding: "12px", fontSize: "0.95rem", fontWeight: 800 }}>
                        {submitting ? "제출 중..." : "🚨 빠른 기록 제출"}
                    </button>

                    {result && (
                        <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "0.85rem", background: result.ok ? "#dcfce7" : "#fef2f2", color: result.ok ? "#166534" : "#b91c1c" }}>
                            {result.ok ? "✅ " : "⚠️ "}{result.msg}
                        </div>
                    )}
                </div>
            </AppShell>
        </AuthCheck>
    );
}
