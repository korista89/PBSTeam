"use client";

// Tier1 › 학생정보 및 이해자료(사이드바 메뉴): 전교생(담임은 자기 반)의 ⓪ 학생정보를 여기서도 보고 고친다.
// 화면·저장은 개별학생 행동중재 ⓪ 탭(ProfileStep)과 같은 것을 쓴다(BIP 행의 ProgressReport.profile).
import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "@/app/lib/api";
import { useAuth } from "../components/AuthProvider";
import { maskName } from "../utils";
import { ProfileStep } from "../target-behavior/Docs";
import { Bip, isEnrolled, today, tierOf } from "../target-behavior/shared";

const nameOf = (s: any) => maskName(s?.학생이름 || s?.이름 || s?.학생명 || "");

export default function Profiles() {
    const { user } = useAuth();
    const [students, setStudents] = useState<any[]>([]);
    const [cls, setCls] = useState("");
    const [sel, setSel] = useState<any>(null);
    const [bip, setBip] = useState<Bip>({});
    const [dirty, setDirty] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/v1/tier/status`).then(r => {
            const d: any[] = Array.isArray(r.data?.students) ? r.data.students : Array.isArray(r.data) ? r.data : [];
            const u = d.filter((v, i, a) => isEnrolled(v) && a.findIndex(t => t.학생코드 === v.학생코드) === i);
            setStudents(u);
            setCls(c => c || String(u[0]?.학급 || ""));
        }).catch(e => setErr(`학생 목록을 불러오지 못했습니다 — ${e?.response?.data?.detail || e.message}`));
    }, [user?.id]);

    const code = sel?.학생코드 ? String(sel.학생코드) : "";
    useEffect(() => {
        let alive = true;
        setBip({}); setDirty(false);
        if (!code) return;
        axios.get(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(code)}/bip`).then(r => {
            if (!alive) return;
            const s: Bip = {};
            Object.entries(r.data || {}).forEach(([k, v]) => { s[k] = v == null ? "" : String(v); });
            setBip({ ...s, StudentCode: code });
        }).catch(e => { if (alive) setBip({ _loadError: String(e?.response?.status || e?.message || "오류") }); });  // 실패를 빈 BIP로 여기면 저장 때 기존 계획을 지운다
        return () => { alive = false; };
    }, [code]);

    const save = async (b: Bip) => {
        if (b.StudentCode !== code) { alert("학생 자료를 불러오지 못해 저장할 수 없습니다. 새로고침한 뒤 다시 해 주세요."); return; }
        try {
            const body = { ...b, StudentCode: code, UpdatedAt: today(), Author: user?.name || user?.id || "Teacher" };
            await axios.post(`${API_BASE_URL}/api/v1/bip/students/${encodeURIComponent(code)}/bip`, body);
            setBip(body); setDirty(false);
            alert("저장했습니다. 이전 내용은 시트 'BIP_이력' 탭에 남습니다.");
        } catch (e: any) { alert("저장 실패: " + (e?.response?.data?.detail || e?.message)); }
    };
    const pick = (s: any) => {
        if (dirty && !confirm("저장하지 않은 내용이 있습니다. 다른 학생으로 바꿀까요?")) return;
        setSel(s);
    };

    const classes = Array.from(new Set(students.map(s => String(s.학급 || "")))).filter(Boolean);
    const inClass = students.filter(s => String(s.학급 || "") === cls);
    if (err) return <div className="card" style={{ padding: 24, color: "#b91c1c" }}>{err}</div>;
    return (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, alignItems: "start" }} className="behavior-outer-grid">
            <div className="card" style={{ padding: 14 }}>
                <select value={cls} onChange={e => setCls(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #cbd5e1", fontWeight: 700 }}>
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
                    {inClass.map(s => {
                        const on = String(s.학생코드) === code;
                        return <button key={s.학생코드} onClick={() => pick(s)} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, cursor: "pointer", border: on ? "2px solid #16a34a" : "1px solid #e2e8f0", background: on ? "#f0fdf4" : "#fff" }}>
                            <b>{nameOf(s)}</b> <span style={{ fontSize: "0.72rem", color: "#64748b" }}>{s.학생코드} · {tierOf(s) || "Tier1"}</span>
                        </button>;
                    })}
                </div>
            </div>
            {!sel ? <div className="card" style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>왼쪽에서 학생을 고르세요.</div>
                : bip.StudentCode !== code ? <div className="card" style={{ padding: 40, textAlign: "center", color: bip._loadError ? "#b91c1c" : "#94a3b8" }}>{bip._loadError ? `자료를 불러오지 못했습니다(${bip._loadError}). 잠시 뒤 학생을 다시 골라 주세요.` : "불러오는 중..."}</div>
                : <ProfileStep key={`t1pf-${code}`} head={{ name: nameOf(sel), className: sel.학급 || "", code }} bip={bip}
                    setBip={b => { setBip(b); setDirty(true); }} save={save} tier={tierOf(sel)} />}
        </div>
    );
}
