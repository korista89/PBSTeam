"use client";

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../constants';

export default function StudentTimeline({ studentId, refreshTrigger }: { studentId: string, refreshTrigger: number }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;

    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/v1/behavior-log/timeline/${studentId}`);
        // Sort logs by date descending
        const sortedLogs = res.data.logs.sort((a: any, b: any) => {
          const dateA = new Date(a['행동발생날짜'] || a['타임스탬프'] || 0).getTime();
          const dateB = new Date(b['행동발생날짜'] || b['타임스탬프'] || 0).getTime();
          return dateB - dateA;
        });
        setLogs(sortedLogs);
      } catch (err: any) {
        setError(err.message || 'Error fetching timeline');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [studentId, refreshTrigger]);

  if (!studentId) return <div>학생을 선택해주세요.</div>;
  if (loading) return <div>타임라인 불러오는 중...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (logs.length === 0) return <div>기록된 행동 데이터가 없습니다.</div>;

  return (
    <div style={{ marginTop: '20px' }}>
      <h3>행동 데이터 타임라인</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxHeight: '600px', overflowY: 'auto', paddingRight: '10px' }}>
        {logs.map((log, index) => {
          const isPending = log.Status === 'Pending';
          const isCrisis = String(log['물리적제지, 3/4호분리지도,본인/타인상해 발생 여부'] || '').startsWith('O');

          return (
            <div key={log.Log_ID || index} style={{
              padding: '15px', 
              border: `1px solid ${isPending ? '#f5c6cb' : '#c3e6cb'}`, 
              borderRadius: '8px',
              backgroundColor: isPending ? '#f8d7da' : '#d4edda',
              color: isPending ? '#721c24' : '#155724'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: '5px' }}>
                <strong>{log['행동발생날짜']} ({log['시간대']})</strong>
                <span>상태: <strong>{isPending ? '⏳ 결재 대기' : '✅ 승인 완료'}</strong></span>
              </div>
              <p><strong>장소:</strong> {log['행동 발생 장소']}</p>
              <p><strong>유형:</strong> {log['행동유형(핵심행동으로택1)']}</p>
              <p><strong>기능:</strong> {log['기능(이번 행동을 통해 파악된 기능)']}</p>
              <p><strong>강도:</strong> {log['강도(1~5점 척도)']} (빈도: {log['발생횟수(한 에피소드 당 1회로 입력 권장)']})</p>
              <p><strong>설명:</strong> {log['특기사항(기타)']}</p>
              <p><strong>입력교사:</strong> {log['입력교사명']}</p>
              
              {isCrisis && log.crisis_details && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(0,0,0,0.2)', fontSize: '0.9em' }}>
                  <strong>위기행동 지원 보고서 요약</strong>
                  <p>발생 시 지도교사: {log.crisis_details['발생 시 지도교사']}</p>
                  <p>나타난 위기행동: {log.crisis_details['B_나타난_위기행동']}</p>
                  <p>관리자 보고: {log.crisis_details['관리자_보고_시간']} {log.crisis_details['관리자_보고_내용']}</p>
                  <p>학부모 알림: {log.crisis_details['학부모_알림_시간']} {log.crisis_details['학부모_알림_내용']}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
