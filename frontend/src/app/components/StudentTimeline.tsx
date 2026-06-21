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
          const dateA = new Date(a['행동발생 날짜'] || a['날짜'] || 0).getTime();
          const dateB = new Date(b['행동발생 날짜'] || b['날짜'] || 0).getTime();
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
          const intensity = parseInt(log.강도 || log['강도(1~5점 척도)'] || '1', 10);
          const isCrisis = intensity >= 3;

          return (
            <div key={log.Log_ID || index} style={{
              padding: '15px', 
              border: `1px solid ${isPending ? '#f5c6cb' : '#c3e6cb'}`, 
              borderRadius: '8px',
              backgroundColor: isPending ? '#f8d7da' : '#d4edda',
              color: isPending ? '#721c24' : '#155724'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: '5px' }}>
                <strong>{log['행동발생 날짜'] || log['날짜']} {log['시간대']}</strong>
                <span>상태: <strong>{isPending ? '⏳ 결재 대기' : '✅ 승인 완료'}</strong></span>
              </div>
              <p><strong>장소:</strong> {log['장소'] || log['행동 발생 장소']}</p>
              <p><strong>유형:</strong> {log['행동유형'] || log['문제행동유형']}</p>
              <p><strong>설명:</strong> {log['비고'] || log['설명']}</p>
              <p><strong>강도:</strong> {intensity} (빈도: {log['발생빈도'] || log['빈도']})</p>
              
              {isCrisis && log.crisis_details && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(0,0,0,0.2)', fontSize: '0.9em' }}>
                  <strong>위기행동 개입 정보</strong>
                  <p>개입 방법: {log.crisis_details['개입방법']}</p>
                  <p>신체적 개입: {log.crisis_details['신체적개입여부']}</p>
                  <p>부상 여부: {log.crisis_details['부상여부']}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
