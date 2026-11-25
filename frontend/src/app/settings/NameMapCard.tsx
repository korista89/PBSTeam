"use client";

// 2027 모드: 우리 반 실명 매핑 1회 등록. CSV는 이 브라우저 안에서만 읽고 PIN으로 암호화해 둔다(서버 전송 없음).
import React, { useState } from "react";
import { API_BASE_URL } from "../constants";
import { clearMap, parseMapCsv, PUBLIC_PC, saveMap, savedCount } from "../lib/nameMap";

const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: "0.95rem", boxSizing: "border-box" };

export default function NameMapCard() {
    const [file, setFile] = useState<File | null>(null);
    const [pin, setPin] = useState("");
    const [msg, setMsg] = useState("");
    const [count, setCount] = useState(() => savedCount());
    const publicPc = (() => { try { return sessionStorage.getItem(PUBLIC_PC) === "1"; } catch { return false; } })();

    const register = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return setMsg("CSV 파일을 고르세요.");
        if (!/^\d{4,8}$/.test(pin)) return setMsg("PIN은 숫자 4~8자리로 정하세요.");
        try {
            const map = parseMapCsv(await file.text());
            await saveMap(map, pin);
            setCount(Object.keys(map).length); setPin(""); setFile(null);
            setMsg(`✅ ${Object.keys(map).length}명을 등록했습니다. 화면을 새로 고치면 실명으로 보입니다.`);
        } catch (err: any) { setMsg(`⚠️ ${err.message || "등록하지 못했습니다."}`); }
    };

    return (
        <form onSubmit={register} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "1rem" }}>🪪 우리 반 실명 매핑 1회 등록</h3>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b", lineHeight: 1.6 }}>
                실명은 서버에 저장하지 않습니다. 이 브라우저에만 암호화해 두고, PIN을 입력한 탭에서만 실명으로 보입니다.
                {publicPc ? " 지금은 공용 PC 모드라 탭을 닫으면 지워집니다." : ""}
            </p>
            <a href={`${API_BASE_URL}/api/v1/privacy/class-map.csv`} className="btn btn-secondary" style={{ textDecoration: "none", textAlign: "center" }}>⬇️ 우리 반 익명코드 CSV (이름 칸은 직접 채우기)</a>
            <input type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] || null)} style={input} />
            <input type="password" inputMode="numeric" placeholder="실명 PIN (숫자 4~8자리)" value={pin} onChange={e => setPin(e.target.value)} autoComplete="new-password" style={input} />
            <button type="submit" className="btn btn-primary">등록</button>
            {count > 0 && <button type="button" className="btn btn-secondary" onClick={() => { clearMap(); setCount(0); setMsg("이 브라우저의 실명 매핑을 지웠습니다."); }}>🗑️ 이 브라우저의 매핑 지우기 ({count}명)</button>}
            {msg && <div style={{ fontSize: "0.88rem", fontWeight: 700 }}>{msg}</div>}
        </form>
    );
}
