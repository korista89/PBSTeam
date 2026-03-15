"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import styles from "../../page.module.css"; 

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
           // Transform dict to list
          if (res.data && Object.keys(res.data).length > 0) {
              fetchedData = Object.entries(res.data).map(([name, code]) => ({
                  code: code as string,
                  name: name,
                  memo: ""
              }));
          }

          if (fetchedData.length === 0) {
             // Generate Pre-set codes as requested
             const presets: StudentCode[] = [];
             
             // Kindergarten (00xx)
             for(let c=1; c<=3; c++) { // 3 classes
                 for(let n=1; n<=10; n++) { // 10 students
                     presets.push({ code: `00${c}${n}`, name: "", memo: `유치원 ${c}반 ${n}번` });
                 }
             }

             // Elem (2xxx)
             for(let g=1; g<=6; g++) {
                 for(let c=1; c<=3; c++) { // 3 classes
                     for(let n=1; n<=5; n++) { // 5 students (reduced to fit 200 total)
                         // 2 + Grade + Class + Num
                         presets.push({ code: `2${g}${c}${n}`, name: "", memo: `초등 ${g}학년 ${c}반 ${n}번` });
                     }
                 }
             }
             
             // Mid (3xxx) - Sample
             for(let g=1; g<=3; g++) {
                for(let c=1; c<=2; c++) {
                    for(let n=1; n<=5; n++) {
                         presets.push({ code: `3${g}${c}${n}`, name: "", memo: `중등 ${g}학년 ${c}반 ${n}번` });
                    }
                }
             }

             setCodes(presets);
          } else {
             // If we have data, we might want to fill missing standard codes too, 
             // but for now let's show what we have + maybe some way to add?
             // Since the requirement is "200 fixed rows structure", we should probably 
             // MERGE fetched data into the preset structure.
             
             // Re-generate presets
             const presets: StudentCode[] = [];
             // ... (Same generation logic) ... 
             // Kindergarten (00xx)
             for(let c=1; c<=3; c++) { 
                 for(let n=1; n<=10; n++) { 
                     presets.push({ code: `00${c}${n}`, name: "", memo: `유치원 ${c}반 ${n}번` });
                 }
             }
             // Elem (2xxx)
             for(let g=1; g<=6; g++) {
                 for(let c=1; c<=3; c++) { 
                     for(let n=1; n<=5; n++) { 
                         presets.push({ code: `2${g}${c}${n}`, name: "", memo: `초등 ${g}학년 ${c}반 ${n}번` });
                     }
                 }
             }
             // Mid
             for(let g=1; g<=3; g++) {
                for(let c=1; c<=2; c++) {
                    for(let n=1; n<=5; n++) {
                         presets.push({ code: `3${g}${c}${n}`, name: "", memo: `중등 ${g}학년 ${c}반 ${n}번` });
                    }
                }
             }

             // Map fetched names to presets
             const merged = presets.map(p => {
                 const found = fetchedData.find(f => f.code === p.code);
                 return found ? { ...p, name: found.name } : p;
             });
             
             // Also include any fetched codes that aren't in presets (e.g. custom codes)
             fetchedData.forEach(f => {
                 if (!presets.find(p => p.code === f.code)) {
                     merged.push(f);
                 }
             });

             setCodes(merged);
          }

      } catch (err) {
          console.error(err);
      } finally {
          setLoading(false);
      }
  };

  const handleSave = async () => {
      try {
          setSaving(true);
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

          // Convert back to format backend expects [ {Code, Name, Memo} ]
          // API expects List[Dict]
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

  if (loading) return <div>로딩 중...</div>;

  return (
    <div className={styles.container}>
       <header className={styles.header}>
        <div>
            <button className={styles.actionBtn} onClick={() => window.location.href='/roster'}>← 로스터 관리로</button>
            <h1 className={styles.title} style={{marginTop:'10px'}}>🔐 학생 코드 배정 (Privacy)</h1>
            <p className={styles.subtitle}>학생 실명을 코드(가명)로 매핑합니다. 저장 시 즉시 사이트에 적용됩니다.</p>
        </div>
        <div>
            <button 
                onClick={handleSave}
                style={{
                    padding: '10px 20px', 
                    fontSize: '1rem', 
                    fontWeight: 'bold', 
                    backgroundColor: saving ? '#ccc' : '#10b981', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '8px', 
                    cursor: saving? 'not-allowed' : 'pointer'
                }}
                disabled={saving}
            >
                {saving ? "저장 중..." : "💾 적용하기"}
            </button>
        </div>
      </header>

      <main className={styles.main}>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 150px 1fr', gap: '10px', fontWeight: 'bold', paddingBottom: '10px', borderBottom: '2px solid #eee' }}>
                <div>코드 (ID)</div>
                <div>학생 실명</div>
                <div>비고 (학년/반)</div>
            </div>
            
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {codes.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '100px 150px 1fr', gap: '10px', padding: '10px 0', borderBottom: '1px solid #f9f9f9' }}>
                        <div style={{ display:'flex', alignItems:'center', fontWeight:'bold', color: '#6366f1' }}>
                            {item.code}
                        </div>
                        <div>
                            <input 
                                type="text" 
                                value={item.name} 
                                placeholder="이름 입력"
                                onChange={(e) => handleNameChange(idx, e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    backgroundColor: item.name ? '#ecfdf5' : 'white'
                                }}
                            />
                        </div>
                        <div style={{ display:'flex', alignItems:'center', color: '#999', fontSize: '0.9rem' }}>
                            {item.memo}
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </main>
    </div>
  );
}
