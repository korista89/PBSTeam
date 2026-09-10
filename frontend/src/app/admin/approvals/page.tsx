"use client";

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../constants';
import AppShell from '../../components/AppShell';
import { AuthCheck, useAuth } from '../../components/AuthProvider';
import { useSheetLiveSync } from '../../hooks/useSheetLiveSync';
import CrisisDetailPanel from '../../components/CrisisDetailPanel';

export default function AdminApprovalsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminId, setAdminId] = useState('Admin');

  const fetchPendingLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/behavior-log/pending`);
      setLogs(res.data.logs || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error fetching pending logs');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setAdminId(user.name || user.id || 'Admin');
    }
    void fetchPendingLogs();
  }, [user, fetchPendingLogs]);
  useSheetLiveSync(() => fetchPendingLogs(true));

  const handleApprove = async (logId: string) => {
    if (!confirm('해당 위기행동 기록 및 보고서를 승인하시겠습니까?')) return;

    try {
      const res = await axios.post(`${API_BASE_URL}/api/v1/behavior-log/approve`, {
        log_id: logId,
        admin_id: adminId
      });
      if (res.data.success) {
        alert('승인되었습니다.');
        fetchPendingLogs();
      } else {
        alert('승인 실패: ' + res.data.message);
      }
    } catch (err: any) {
      alert('오류 발생: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleRevise = async (logId: string) => {
    const memo = prompt('재작성 요청 사유(메모)를 입력해주세요:');
    if (memo === null) return; // User cancelled

    try {
      const res = await axios.post(`${API_BASE_URL}/api/v1/behavior-log/revise`, {
        log_id: logId,
        admin_id: adminId,
        memo: memo
      });
      if (res.data.success) {
        alert('재작성 요청이 처리되었습니다.');
        fetchPendingLogs();
      } else {
        alert('요청 실패: ' + res.data.message);
      }
    } catch (err: any) {
      alert('오류 발생: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <AuthCheck>
      <AppShell
        currentPage="admin-approvals"
        title="✅ 관리자 결재함 (위기행동 승인)"
        subtitle={`대기 중인 위기행동 보고서: ${logs.length}건`}
        hideDateFilter={true}
        headerActions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <a href="/logs" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              🗂️ 전체 로그 보기
            </a>
            <button onClick={() => void fetchPendingLogs()} className="btn btn-secondary">
              🔄 새로고침
            </button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {loading ? (
            <div className="card" style={{ padding: "60px", textAlign: "center", color: "var(--text-secondary)" }}>
              <div style={{ fontSize: "2rem", marginBottom: "12px", animation: "spin 2s linear infinite" }}>⏳</div>
              <p style={{ fontWeight: 700 }}>결재 대기 목록을 불러오고 있습니다...</p>
            </div>
          ) : error ? (
            <div className="card" style={{ padding: "20px", background: "#fef2f2", color: "#dc2626", textAlign: "center" }}>
              ⚠️ {error}
            </div>
          ) : logs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-title">결재 대기 중인 위기행동 보고서가 없습니다</div>
              <div className="empty-state-text">모든 위기행동 및 특별 지원 보고서가 정상 결재되었습니다.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {logs.map(log => (
              <div key={log.Log_ID} style={{ border: '2px solid #b91c1c', borderRadius: '8px', padding: '20px', backgroundColor: '#fef2f2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #fca5a5', paddingBottom: '10px', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0, color: '#b91c1c' }}>🚨 위기행동 지원 보고서 결재</h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleRevise(log.Log_ID)}
                      style={{ backgroundColor: '#f59e0b', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      재작성 요청 (Revise)
                    </button>
                    <button
                      onClick={() => handleApprove(log.Log_ID)}
                      style={{ backgroundColor: '#4caf50', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      승인 (Approve)
                    </button>
                  </div>
                </div>

                <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <p><strong>학생:</strong> {log['학생명']} ({log['학생코드']})</p>
                    <p><strong>날짜/시간:</strong> {log['행동발생날짜']} ({log['시간대']})</p>
                    <p><strong>입력교사:</strong> {log['입력교사명']}</p>
                  </div>
                  <div>
                    <p><strong>장소:</strong> {log['장소']}</p>
                    <p><strong>유형:</strong> {log['행동유형']}</p>
                    <p><strong>강도/빈도:</strong> {log['강도']} / {log['발생횟수']}</p>
                  </div>
                </div>

                <div style={{ backgroundColor: 'white', padding: '10px', borderRadius: '4px', border: '1px solid #fca5a5', marginBottom: '15px' }}>
                  <strong>특기사항: </strong> {log['특기사항']}
                </div>

                {(log.crisis_details || log.form_report_details) && (
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>보고서 상세 내용</h4>
                    <CrisisDetailPanel
                      crisisDetails={log.crisis_details}
                      formReportDetails={log.form_report_details}
                      isCrisis={String(log['물리적제지여부'] || '').startsWith('O')}
                    />
                  </div>
                )}
              </div>
            ))}
            </div>
          )}
        </div>
      </AppShell>
    </AuthCheck>
  );
}
