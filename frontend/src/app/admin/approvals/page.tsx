"use client";

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../constants';
import GlobalNav from '../../components/GlobalNav';
import UserHeader from '../../components/UserHeader';

export default function AdminApprovalsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminId, setAdminId] = useState('');

  const fetchPendingLogs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/behavior-log/pending`);
      setLogs(res.data.logs || []);
    } catch (err: any) {
      setError(err.message || 'Error fetching pending logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Basic mock: in real app, get from Auth context
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        setAdminId(u.ID || u.name || 'Admin');
      } catch (e) {
        setAdminId('Admin');
      }
    } else {
      setAdminId('Admin');
    }

    fetchPendingLogs();
  }, []);

  const handleApprove = async (logId: string) => {
    if (!confirm('해당 기록을 승인하시겠습니까?')) return;

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

  return (
    <div>
      <GlobalNav />
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
        <UserHeader title="관리자 결재 대시보드 (위기행동 승인)" />

        {loading ? (
          <div>불러오는 중...</div>
        ) : error ? (
          <div style={{ color: 'red' }}>{error}</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '20px', backgroundColor: '#f0f0f0', borderRadius: '8px', textAlign: 'center' }}>
            결재 대기 중인 항목이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {logs.map(log => (
              <div key={log.Log_ID} style={{ border: '2px solid #ff9800', borderRadius: '8px', padding: '20px', backgroundColor: '#fff8e1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>🚨 위기행동 기록 (강도: {log.강도})</h3>
                  <button 
                    onClick={() => handleApprove(log.Log_ID)}
                    style={{ backgroundColor: '#4caf50', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    승인 (Approve)
                  </button>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <p><strong>학생:</strong> {log['학생명']} ({log['학생코드']})</p>
                    <p><strong>날짜:</strong> {log['행동발생 날짜']} {log['시간대']}</p>
                    <p><strong>작성자:</strong> {log['입력자']} (출처: {log['Source']})</p>
                  </div>
                  <div>
                    <p><strong>장소:</strong> {log['장소']}</p>
                    <p><strong>유형:</strong> {log['행동유형']}</p>
                    <p><strong>빈도:</strong> {log['발생빈도']}</p>
                  </div>
                </div>

                <div style={{ marginTop: '10px', backgroundColor: 'white', padding: '10px', borderRadius: '4px' }}>
                  <strong>상세 설명: </strong> {log['비고']}
                </div>

                {log.crisis_details && (
                  <div style={{ marginTop: '10px', padding: '15px', backgroundColor: '#ffebee', borderRadius: '4px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#c62828' }}>위기행동 개입 상세</h4>
                    <p><strong>개입 방법:</strong> {log.crisis_details['개입방법']}</p>
                    <p><strong>신체적 개입 여부:</strong> {log.crisis_details['신체적개입여부']}</p>
                    <p><strong>부상 여부 (학생/교사):</strong> {log.crisis_details['부상여부']}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
