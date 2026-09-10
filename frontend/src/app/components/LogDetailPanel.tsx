"use client";

import React, { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "../constants";
import CrisisDetailPanel from "./CrisisDetailPanel";

interface LogDetailPanelProps {
    log: any;
    isCrisis?: boolean;
    onSaved?: () => void;
}

// 짧은 키 -> 라벨. PATCH /api/v1/behavior-log/{log_id}가 이 키들을 실제 헤더로 매핑한다.
const EDITABLE_FIELDS: { key: string; label: string; multiline?: boolean }[] = [
    { key: "행동유형", label: "행동유형" },
    { key: "강도", label: "강도" },
    { key: "장소", label: "장소" },
    { key: "시간대", label: "시간대" },
    { key: "기능", label: "기능" },
    { key: "발생횟수", label: "발생횟수" },
    { key: "배경사건", label: "배경사건" },
    { key: "선행사건", label: "선행사건" },
    { key: "후속결과", label: "후속결과" },
    { key: "특기사항", label: "특기사항", multiline: true },
];

export default function LogDetailPanel({ log, isCrisis, onSaved }: LogDetailPanelProps) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [values, setValues] = useState<Record<string, string>>(() =>
        Object.fromEntries(EDITABLE_FIELDS.map(f => [f.key, String(log[f.key] ?? "")]))
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const goToStudent = () => {
        const code = log["학생코드"] || log["코드번호"];
        if (code) router.push(`/student/${encodeURIComponent(code)}`);
    };

    const startEdit = () => {
        setValues(Object.fromEntries(EDITABLE_FIELDS.map(f => [f.key, String(log[f.key] ?? "")])));
        setError("");
        setEditing(true);
    };

    const save = async () => {
        if (!log["Log_ID"]) { setError("Log_ID가 없어 저장할 수 없습니다."); return; }
        setSaving(true);
        setError("");
        try {
            const changed = Object.fromEntries(
                EDITABLE_FIELDS
                    .filter(f => values[f.key] !== String(log[f.key] ?? ""))
                    .map(f => [f.key, values[f.key]])
            );
            if (Object.keys(changed).length > 0) {
                await axios.patch(`${API_BASE_URL}/api/v1/behavior-log/${encodeURIComponent(log["Log_ID"])}`, changed);
            }
            setEditing(false);
            onSaved?.();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || "저장에 실패했습니다.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ backgroundColor: "#fff", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "12px" }}>
                <button onClick={goToStudent} className="btn btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 10px" }}>
                    👤 학생 프로필로 이동
                </button>
                {editing ? (
                    <>
                        <button onClick={() => setEditing(false)} className="btn btn-secondary" style={{ fontSize: "0.78rem", padding: "5px 10px" }} disabled={saving}>
                            취소
                        </button>
                        <button onClick={save} className="btn btn-primary" style={{ fontSize: "0.78rem", padding: "5px 10px" }} disabled={saving}>
                            {saving ? "저장 중..." : "💾 저장"}
                        </button>
                    </>
                ) : (
                    <button onClick={startEdit} className="btn btn-primary" style={{ fontSize: "0.78rem", padding: "5px 10px" }}>
                        ✏️ 편집
                    </button>
                )}
            </div>

            {error && (
                <div style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: "6px", fontSize: "0.82rem", marginBottom: "12px" }}>
                    ⚠️ {error}
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px 16px" }}>
                {EDITABLE_FIELDS.map(f => (
                    <div key={f.key} style={f.multiline ? { gridColumn: "1 / -1" } : undefined}>
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", marginBottom: "3px" }}>{f.label}</div>
                        {editing ? (
                            f.multiline ? (
                                <textarea
                                    value={values[f.key]}
                                    onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                                    rows={2}
                                    style={{ width: "100%", padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "0.85rem" }}
                                />
                            ) : (
                                <input
                                    type="text"
                                    value={values[f.key]}
                                    onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                                    style={{ width: "100%", padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "0.85rem" }}
                                />
                            )
                        ) : (
                            <div style={{ fontSize: "0.85rem", color: "#0f172a", wordBreak: "break-word" }}>{String(log[f.key] ?? "") || "-"}</div>
                        )}
                    </div>
                ))}
            </div>

            {(log.crisis_details || log.form_report_details) && (
                <div style={{ marginTop: "16px" }}>
                    <CrisisDetailPanel crisisDetails={log.crisis_details} formReportDetails={log.form_report_details} isCrisis={isCrisis} />
                </div>
            )}
        </div>
    );
}
