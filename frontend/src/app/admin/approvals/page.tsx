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
      setError(err.response?.data?.detail || err.message || 'Error fetching pending logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        setAdminId(u.name || u.id || 'Admin');
      } catch (e) {
        setAdminId('Admin');
      }
    } else {
      setAdminId('Admin');
    }

    fetchPendingLogs();
  }, []);

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
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
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

                {log.crisis_details && (
                  <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '4px', border: '1px solid #ccc' }}>
                    <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>보고서 상세 내용</h4>
                    
                    <p><strong>발생 시 지도교사:</strong> {log.crisis_details['발생 시 지도교사']}</p>
                    
                    <h5 style={{ margin: '15px 0 5px 0' }}>행동 분석</h5>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      <li><strong>선행사건:</strong> {log.crisis_details['A_배경_선행사건']}</li>
                      <li><strong>위기행동:</strong> {log.crisis_details['B_나타난_위기행동']}</li>
                      <li><strong>후속결과:</strong> {log.crisis_details['C_후속결과']}</li>
                    </ul>

                    <h5 style={{ margin: '15px 0 5px 0' }}>개별학생교육지원 현황</h5>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginBottom: '10px' }}>
                      <tbody>
                        <tr>
                          <td style={{ border: '1px solid #ccc', padding: '5px', fontWeight: 'bold' }}>1차</td>
                          <td style={{ border: '1px solid #ccc', padding: '5px' }}>시간: {log.crisis_details['1차_개별학생교육지원_시간']} | 장소: {log.crisis_details['1차_개별학생교육지원_장소']} | 교사: {log.crisis_details['1차_개별학생교육지원_교사']}</td>
                        </tr>
                        <tr>
                          <td colSpan={2} style={{ border: '1px solid #ccc', padding: '5px' }}>
                            <strong>경위:</strong> {log.crisis_details['1차_경위']}<br/>
                            <strong>관찰:</strong> {log.crisis_details['1차_관찰기록']}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ border: '1px solid #ccc', padding: '5px', fontWeight: 'bold' }}>2차</td>
                          <td style={{ border: '1px solid #ccc', padding: '5px' }}>시간: {log.crisis_details['2차_개별학생교육지원_시간']} | 장소: {log.crisis_details['2차_개별학생교육지원_장소']} | 교사: {log.crisis_details['2차_개별학생교육지원_교사']}</td>
                        </tr>
                        <tr>
                          <td colSpan={2} style={{ border: '1px solid #ccc', padding: '5px' }}>
                            <strong>경위:</strong> {log.crisis_details['2차_경위']}<br/>
                            <strong>관찰:</strong> {log.crisis_details['2차_관찰기록']}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <h5 style={{ margin: '15px 0 5px 0' }}>발생 이후 조치사항</h5>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
                      <li><strong>부상자 치료:</strong> {log.crisis_details['부상자_치료_시간']} - {log.crisis_details['부상자_치료_내용']}</li>
                      <li><strong>관리자 보고:</strong> {log.crisis_details['관리자_보고_시간']} - {log.crisis_details['관리자_보고_내용']}</li>
                      <li><strong>학부모 알림:</strong> {log.crisis_details['학부모_알림_시간']} - {log.crisis_details['학부모_알림_내용']}</li>
                      <li><strong>학생 상담:</strong> {log.crisis_details['학생_상담_시간']} - {log.crisis_details['학생_상담_내용']}</li>
                      <li><strong>학부모 상담:</strong> {log.crisis_details['학부모_상담_시간']} - {log.crisis_details['학부모_상담_내용']}</li>
                      <li><strong>긴급회의:</strong> {log.crisis_details['긴급회의_시간']} - {log.crisis_details['긴급회의_내용']}</li>
                    </ul>
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
