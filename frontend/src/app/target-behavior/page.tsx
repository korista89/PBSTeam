"use client";

// 개별학생 행동중재 — 학생 선택부터 자료 확인, FBA 보고서, 행동중재계획(BIP), 중재 자료 입력, 결과 보고서까지 한 화면에서 한다.
// Tier3 학생이 목록 위에 오고, 담임은 자기 반 학생 누구나 골라 개별 중재를 시작할 수 있다.
// 옛 BIP 화면(/student/[id]/bip)은 당분간 그대로 둔다(같은 BIP 시트 행을 쓴다). 의사결정·의뢰서는 ProgressReport JSON에 함께 저장한다.
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../constants";
import AppShell from "../components/AppShell";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import { useSheetLiveSync } from "../hooks/useSheetLiveSync";
import { maskName } from "../utils";
import Tracker from "./Tracker";
import { DecisionStep, ReferralStep } from "./Docs";
import { DataStep, FbaStep, BipStep, ProgressStep, useStudentLogs } from "./Steps";
import { Bip, StudentHead, kDate, today } from "./shared";

const STEPS = [
    { key: "data", label: "① 자료 분석" },
    { key: "fba", label: "② FBA 결과 보고서" },
    { key: "bip", label: "③ 행동중재계획" },
    { key: "track", label: "④ 모니터링(자료 입력·차트)" },
    { key: "decision", label: "⑤ 데이터 기반 의사결정" },
    { key: "refer", label: "⑥ 의료협력의뢰서·추가지원신청서" },
    { key: "report", label: "⑦ 중재 결과 보고서" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const isT3 = (s: any) => String(s?.Tier3 || "").toUpperCase() === "O" || String(s?.["Tier3+"] || "").toUpperCase() === "O";

export default function InterventionPage() {
    const { user, isAdmin } = useAuth();
    const [students, setStudents] = useState<any[]>([]);
    const [selected, setSelected] = useState<any>(null);
    const [keyword, setKeyword] = useState("");
    const [onlyT3, setOnlyT3] = useState(false);
    const [requested, setRequested] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("student") || "" : ""));
    const appliedRef = React.useRef(false);
    const [step, setStep] = useState<StepKey>("data");

    useEffect(() => {
        const p = new URLSearchParams(window.location.search);
        if (p.get("student")) setRequested(p.get("student") || "");
        const st = p.get("step");
        if (st && STEPS.some(s => s.key === st)) setStep(st as StepKey);
    }, []);

    const fetchStudents = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/v1/tier/status`);
            let data = res.data.students || res.data || [];
            if (!Array.isArray(data)) data = [];
            const unique = data.filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => t.학생코드 === v.학생코드) === i)
                .sort((a: any, b: any) => Number(isT3(b)) - Number(isT3(a)));
            setStudents(unique);
            setSelected((cur: any) => {
                const want = !appliedRef.current && requested ? requested : cur?.학생코드;
                const hit = unique.find((s: any) => String(s.학생코드) === String(want || ""));
                if (hit && want === requested) appliedRef.current = true;
                return hit || unique[0] || null;
            });
        } catch (e) { console.error("학생 목록 실패", e); }
    }, [requested]);
    useEffect(() => { void fetchStudents(); }, [fetchStudents, user?.id]);
    useSheetLiveSync(fetchStudents);

    const code = selected?.학생코드 ? String(selected.학생코드) : "";
    const head: StudentHead = { name: maskName(selected?.학생이름 || selected?.이름 || selected?.학생명 || ""), className: selected?.학급 || "", code };

    // BIP 한 행(계획·FBA 보고서·결과 보고서를 함께 담는다)
    const [bip, setBip] = useState<Bip>({});
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        let alive = true;
        setBip({}); setDirty(false);
        if (!code) return;
        axios.get(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(code)}/bip`).then(r => {
            if (!alive) return;  // 그사이 다른 학생을 골랐으면 버린다(다른 학생 BIP가 섞여 저장되는 것 방지)
            const s: Bip = {};
            Object.entries(r.data || {}).forEach(([k, v]) => { s[k] = v == null ? "" : String(v); });
            setBip({ ...s, StudentCode: code });
        }).catch(() => { if (alive) setBip({ StudentCode: code }); });
        return () => { alive = false; };
    }, [code]);
    const editBip = (b: Bip) => { setBip(b); setDirty(true); };
    const save = async (b: Bip) => {
        setSaving(true);
        try {
            if (b.StudentCode && b.StudentCode !== code) { alert("학생이 바뀌는 중입니다. 잠시 뒤 다시 저장해 주세요."); return; }
            const body = { ...b, StudentCode: code, UpdatedAt: today(), Author: user?.name || user?.id || "Teacher" };
            await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(code)}/bip`, body);
            setBip(body); setDirty(false);
            alert("저장했습니다. 이전 내용은 시트 'BIP_이력' 탭에 남습니다.");
        } catch (e: any) {
            alert("저장 실패: " + (e?.response?.data?.detail || e?.message));
        } finally { setSaving(false); }
    };

    // 표적행동 목록(③ 기록 방법·④ 입력·⑤ 보고서가 함께 쓴다)
    const [behaviors, setBehaviors] = useState<any[]>([]);
    const codeRef = React.useRef(code);
    codeRef.current = code;
    const fetchBehaviors = useCallback(async () => {
        const want = code;
        if (!want) { setBehaviors([]); return; }
        try {
            const r = await axios.get(`${API_BASE_URL}/api/v1/target-behaviors/students/${encodeURIComponent(want)}`);
            if (codeRef.current === want) setBehaviors(r.data.behaviors || []);
        } catch { if (codeRef.current === want) setBehaviors([]); }
    }, [code]);
    useEffect(() => { setBehaviors([]); void fetchBehaviors(); }, [fetchBehaviors]);

    const logs = useStudentLogs(code);

    const pick = (s: any) => {
        if (dirty && !confirm("저장하지 않은 내용이 있습니다. 다른 학생으로 바꿀까요?")) return;
        setSelected(s);
    };
    const list = students.filter(s => {
        const name = s.학생이름 || s.이름 || s.학생명 || "";
        return (!onlyT3 || isT3(s)) && (name.includes(keyword) || String(s.학생코드 || "").includes(keyword));
    });

    return (
        <AuthCheck>
            <AppShell currentPage="target-behavior" title="🧩 개별학생 행동중재"
                subtitle="자료 분석 → FBA → 행동중재계획 → 모니터링 → 의사결정 → 의뢰·신청서 → 결과 보고서를 한 화면에서">
                <div className="behavior-outer-grid" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>
                    <div className="card" style={{ padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <div style={{ fontWeight: 800, fontSize: "0.92rem" }}>👥 학생 ({list.length}명)</div>
                            <span className="badge badge-neutral" style={{ fontSize: "0.7rem" }}>{isAdmin() ? "전교생" : (user?.class_id || "학급")}</span>
                        </div>
                        <input type="text" placeholder="이름 또는 학번 검색..." value={keyword} onChange={e => setKeyword(e.target.value)}
                            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-subtle)", fontSize: "0.82rem", marginBottom: 8, boxSizing: "border-box" }} />
                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8rem", marginBottom: 10, cursor: "pointer" }}>
                            <input type="checkbox" checked={onlyT3} onChange={e => setOnlyT3(e.target.checked)} /> Tier3 학생만 보기
                        </label>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "calc(100vh - 300px)", overflowY: "auto" }}>
                            {list.map(s => {
                                const on = String(selected?.학생코드) === String(s.학생코드);
                                return (
                                    <button key={s.학생코드} onClick={() => pick(s)} style={{
                                        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                                        border: on ? "1.5px solid var(--primary-blue)" : "1px solid var(--border-subtle)", background: on ? "var(--primary-light)" : "var(--bg-surface)",
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: on ? 800 : 600, fontSize: "0.85rem" }}>{maskName(s.학생이름 || s.이름 || s.학생명)}</div>
                                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{s.학급} · {s.학생코드}</div>
                                        </div>
                                        {isT3(s) && <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#b91c1c", background: "#fef2f2", borderRadius: 6, padding: "2px 6px" }}>Tier3</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        {!selected ? (
                            <div className="empty-state"><div className="empty-state-icon">👈</div><div className="empty-state-title">학생을 선택해 주세요</div></div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                <div className="card" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                                    <div>
                                        <div style={{ fontWeight: 900, fontSize: "1.05rem" }}>{head.name} <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "#64748b" }}>{head.className} · {code}</span></div>
                                        <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: 2 }}>
                                            {bip.PlanStart ? <>중재 기간 {kDate(bip.PlanStart)} ~ {bip.PlanEnd ? kDate(bip.PlanEnd) : "진행 중"}</> : "행동중재계획 없음 — ③에서 작성하세요"}
                                            {bip.TargetBehavior && <> · 표적행동: {bip.TargetBehavior}</>}
                                        </div>
                                    </div>
                                    {dirty && <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "#b45309" }}>{saving ? "저장 중…" : "● 저장하지 않은 변경이 있습니다"}</span>}
                                </div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {STEPS.map(s => (
                                        <button key={s.key} onClick={() => setStep(s.key)} style={{
                                            padding: "9px 14px", borderRadius: 999, fontWeight: 800, fontSize: "0.85rem", cursor: "pointer",
                                            border: step === s.key ? "2px solid #4f46e5" : "1px solid #cbd5e1", background: step === s.key ? "#4f46e5" : "#fff", color: step === s.key ? "#fff" : "#0f172a",
                                        }}>{s.label}</button>
                                    ))}
                                </div>
                                {step === "data" && <DataStep studentCode={code} logs={logs} planStart={bip.PlanStart || ""} />}
                                {step === "fba" && <FbaStep head={head} bip={bip} setBip={editBip} save={save} />}
                                {step === "bip" && <BipStep head={head} bip={bip} setBip={editBip} save={save} behaviors={behaviors} goTracker={() => setStep("track")} />}
                                {step === "track" && <Tracker key={code} studentCode={code} behaviors={behaviors} refresh={fetchBehaviors} defaultStart={bip.PlanStart || ""} />}
                                {step === "decision" && <DecisionStep head={head} bip={bip} setBip={editBip} save={save} logs={logs} behaviors={behaviors} />}
                                {step === "refer" && <ReferralStep head={head} bip={bip} setBip={editBip} save={save} logs={logs} behaviors={behaviors} />}
                                {step === "report" && <ProgressStep head={head} bip={bip} setBip={editBip} save={save} behaviors={behaviors} logs={logs} />}
                            </div>
                        )}
                    </div>
                </div>
            </AppShell>
        </AuthCheck>
    );
}
