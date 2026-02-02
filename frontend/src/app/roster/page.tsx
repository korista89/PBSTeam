"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import styles from "../page.module.css"; 

export default function RosterPage() {
  const [roster, setRoster] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoster = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const response = await axios.get(`${apiUrl}/api/v1/roster`);
        setRoster(response.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRoster();
  }, []);

  if (loading) return <div className={styles.loading}>로스터 불러오는 중...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
            <button className={styles.actionBtn} onClick={() => window.location.href='/'}>← 메인으로</button>
            <h1 className={styles.title} style={{marginTop:'10px'}}>🏫 학급/학생 로스터 관리</h1>
            <p className={styles.subtitle}>총 32학급 / 200명 (유치원, 초, 중, 고, 전공과)</p>
        </div>
      </header>

      <main className={styles.main}>
        {roster.map((section: any, idx: number) => (
            <section key={idx} className={styles.sectionHeader} style={{borderBottom: 'none', marginBottom: '1rem'}}>
                <h2 style={{borderBottom: '2px solid #3b82f6', paddingBottom: '0.5rem'}}>{section.section}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                    {section.classes.map((cls: any, cIdx: number) => (
                        <div key={cIdx} className={styles.card} style={{padding: '1rem'}}>
                            <h3 style={{fontSize: '1.1rem', marginBottom: '0.5rem'}}>{cls.class_name}</h3>
                            <p style={{color: '#666'}}>학생 수: {cls.student_count}명</p>
                            <button className={styles.actionBtn} style={{marginTop: '0.5rem', width: '100%'}} onClick={() => alert("학생 코드 배정 시스템 준비 중 (Phase 5)")}>학생 관리 (코드 배정)</button>
                        </div>
                    ))}
                </div>
            </section>
        ))}
      </main>
    </div>
  );
}
