"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { AuthCheck } from "../components/AuthProvider";
import AppShell from "../components/AppShell";

export default function RosterPage() {
  const [roster, setRoster] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoster = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
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

  return (
    <AuthCheck>
      <AppShell
        currentPage="roster"
        title="🏫 전교 학급 및 학생 명렬표 관리"
        subtitle="34개 학급별 학생 명단 및 고유 학생 코드 배정 현황"
        hideDateFilter={true}
        headerActions={
          <Link href="/roster/edit" className="btn btn-primary">
            ✏️ 학생 명렬 및 코드 일괄 편집
          </Link>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {loading ? (
            <div className="card" style={{ padding: "60px", textAlign: "center", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px", animation: "spin 2s linear infinite" }}>⏳</div>
              <p style={{ fontWeight: 700 }}>학급 명렬표를 불러오고 있습니다...</p>
            </div>
          ) : (
            roster.map((section: any, idx: number) => (
              <div key={idx} className="card" style={{ padding: "20px" }}>
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--primary-blue)", marginBottom: "14px", borderBottom: "1.5px solid var(--border-subtle)", paddingBottom: "8px" }}>
                  {section.section}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                  {section.classes?.map((cls: any, cIdx: number) => (
                    <div
                      key={cIdx}
                      style={{
                        padding: "14px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px"
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                        {cls.class_name}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        학생 수: <strong>{cls.student_count}</strong>명
                      </div>
                      <Link
                        href="/roster/edit"
                        className="btn btn-secondary"
                        style={{ marginTop: "6px", width: "100%", textAlign: "center", fontSize: "0.78rem" }}
                      >
                        학생 관리
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </AppShell>
    </AuthCheck>
  );
}
