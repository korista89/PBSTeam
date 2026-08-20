"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { AuthCheck } from "../../components/AuthProvider";
import AppShell from "../../components/AppShell";

export default function CodeManagementPage() {
  interface StudentCode {
      code: string;
      name: string;
      memo: string;
  }

  const [codes, setCodes] = useState<StudentCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
      try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
          const res = await axios.get(`${apiUrl}/api/v1/roster/codes`);

          let fetchedData: StudentCode[] = [];
          if (res.data && Object.keys(res.data).length > 0) {
              fetchedData = Object.entries(res.data).map(([name, code]) => ({
                  code: code as string,
                  name: name,
                  memo: ""
              }));
          }

          if (fetchedData.length === 0) {
             const presets: StudentCode[] = [];
             for(let c=1; c<=3; c++) {
                 for(let n=1; n<=10; n++) {
                     presets.push({ code: `00${c}${n}`, name: "", memo: `유치원 ${c}반 ${n}번` });
                 }
             }
             for(let g=1; g<=6; g++) {
                 for(let c=1; c<=3; c++) {
                     for(let n=1; n<=5; n++) {
                         presets.push({ code: `2${g}${c}${n}`, name: "", memo: `초등 ${g}학년 ${c}반 ${n}번` });
                     }
                 }
             }
             for(let g=1; g<=3; g++) {
                for(let c=1; c<=2; c++) {
                    for(let n=1; n<=5; n++) {
                         presets.push({ code: `3${g}${c}${n}`, name: "", memo: `중등 ${g}학년 ${c}반 ${n}번` });
                    }
                }
             }
             setCodes(presets);
          } else {
             const presets: StudentCode[] = [];
             for(let c=1; c<=3; c++) {
                 for(let n=1; n<=10; n++) {
                     presets.push({ code: `00${c}${n}`, name: "", memo: `유치원 ${c}반 ${n}번` });
                 }
             }
             for(let g=1; g<=6; g++) {
                 for(let c=1; c<=3; c++) {
                     for(let n=1; n<=5; n++) {
                         presets.push({ code: `2${g}${c}${n}`, name: "", memo: `초등 ${g}학년 ${c}반 ${n}번` });
                     }
                 }
             }
             for(let g=1; g<=3; g++) {
                for(let c=1; c<=2; c++) {
                    for(let n=1; n<=5; n++) {
                         presets.push({ code: `3${g}${c}${n}`, name: "", memo: `중등 ${g}학년 ${c}반 ${n}번` });
                    }
                }
             }

             const codeToNameMap = new Map<string, string>();
             fetchedData.forEach(d => {
                 if(d.code && d.name) codeToNameMap.set(d.code, d.name);
             });

             const merged = presets.map(p => ({
                 ...p,
                 name: codeToNameMap.get(p.code) || ""
             }));

             setCodes(merged);
          }
      } catch (err) {
          console.error("Fetch codes error:", err);
      } finally {
          setLoading(false);
      }
  };

  const handleSave = async () => {
      setSaving(true);
      try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
          const payload = codes.filter(c => c.name.trim() !== "").map(c => ({
              Code: c.code,
              Name: c.name,
              Memo: c.memo
          }));

          const response = await axios.post(`${apiUrl}/api/v1/roster/codes`, payload);

          if (response.data && response.data.message) {
              alert(`✅ ${response.data.message}\n\n이제 사이트 내 모든 이름이 코드로 표시됩니다.`);
          } else {
              alert("✅ 저장되었습니다! 이제 사이트 내 모든 이름이 코드로 표시됩니다.");
          }
      } catch (err: any) {
          console.error("Save error:", err);
          const errorMessage = err.response?.data?.detail || err.message || "알 수 없는 오류가 발생했습니다.";
          alert(`❌ 저장 중 오류가 발생했습니다.\n\n${errorMessage}\n\n잠시 후 다시 시도해주세요.`);
      } finally {
          setSaving(false);
      }
  };

  const handleNameChange = (idx: number, newVal: string) => {
      const newCodes = [...codes];
      newCodes[idx].name = newVal;
      setCodes(newCodes);
  };

  return (
    <AuthCheck>
      <AppShell
        currentPage="roster"
        title="🔐 학생 코드 배정 (개인정보 비식별화)"
        subtitle="학생 실명을 코드(가명)로 매핑합니다. 저장 시 시스템 전체에 즉시 반영됩니다."
        hideDateFilter={true}
        headerActions={
          <div style={{ display: "flex", gap: "8px" }}>
            <button
                onClick={handleSave}
                className="btn btn-primary"
                disabled={saving}
            >
                {saving ? "저장 중..." : "💾 적용하기"}
            </button>
            <Link href="/roster" className="btn btn-secondary">
              ← 명렬표로
            </Link>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {loading ? (
            <div className="card" style={{ padding: "60px", textAlign: "center", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px", animation: "spin 2s linear infinite" }}>⏳</div>
              <p style={{ fontWeight: 700 }}>코드 매핑 데이터를 불러오고 있습니다...</p>
            </div>
          ) : (
            <div className="card" style={{ padding: "20px" }}>
              <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: "480px", display: "grid", gridTemplateColumns: "120px 180px 1fr", gap: "10px", fontWeight: 800, paddingBottom: "10px", borderBottom: "2px solid var(--border-subtle)", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                <div>코드 (ID)</div>
                <div>학생 실명</div>
                <div>비고 (학년/반/번호)</div>
              </div>

              <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
                {codes.map((item, idx) => (
                  <div key={idx} style={{ minWidth: "480px", display: "grid", gridTemplateColumns: "120px 180px 1fr", gap: "10px", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)", alignItems: "center" }}>
                    <div style={{ fontWeight: 800, color: "var(--primary-blue)", fontSize: "0.88rem" }}>
                      {item.code}
                    </div>
                    <div>
                      <input
                        type="text"
                        value={item.name}
                        placeholder="이름 입력"
                        onChange={(e) => handleNameChange(idx, e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "6px",
                          fontSize: "0.85rem",
                          backgroundColor: item.name ? "var(--tier1-bg)" : "white"
                        }}
                      />
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                      {item.memo}
                    </div>
                  </div>
                ))}
              </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </AuthCheck>
  );
}
