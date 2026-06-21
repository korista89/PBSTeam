"use client";

import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../constants';

export default function BehaviorForm({ studentId, studentName, onLogSubmitted }: { studentId: string, studentName: string, onLogSubmitted: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    장소: '',
    빈도: '1',
    문제행동유형: '',
    설명: '',
    강도: '1',
    개입방법: '',
    신체적개입여부: 'X',
    부상여부: 'X'
  });
  const [message, setMessage] = useState('');

  const intensity = parseInt(formData.강도, 10);
  const isCrisis = intensity >= 3;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    try {
      const payload = {
        학생코드: studentId,
        학생명: studentName,
        '행동 발생 장소': formData.장소,
        '발생횟수': formData.빈도,
        '(주요)행동유형': formData.문제행동유형,
        '특기사항(기타)': formData.설명,
        '강도(1~5점 척도)': formData.강도,
        ...(isCrisis && {
          개입방법: formData.개입방법,
          신체적개입여부: formData.신체적개입여부,
          부상여부: formData.부상여부
        })
      };

      const res = await axios.post(`${API_BASE_URL}/api/v1/behavior-log`, payload);
      
      if (res.data.success) {
        setMessage(res.data.status === 'Pending' ? '행동이 기록되었습니다 (승인 대기중).' : '행동이 기록되었습니다.');
        setFormData({
          장소: '',
          빈도: '1',
          문제행동유형: '',
          설명: '',
          강도: '1',
          개입방법: '',
          신체적개입여부: 'X',
          부상여부: 'X'
        });
        onLogSubmitted();
      } else {
        setMessage('오류 발생: ' + res.data.message);
      }
    } catch (err: any) {
      setMessage('서버 통신 오류: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '20px' }}>
      <h3>새 행동 기록 작성: {studentName}</h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        
        <div>
          <label>행동 발생 장소: </label>
          <input type="text" name="장소" value={formData.장소} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
        </div>

        <div>
          <label>주요 행동유형: </label>
          <input type="text" name="문제행동유형" value={formData.문제행동유형} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
        </div>

        <div>
          <label>발생 빈도 (횟수): </label>
          <input type="number" name="빈도" value={formData.빈도} onChange={handleChange} min="1" required style={{ width: '100%', padding: '8px' }} />
        </div>

        <div>
          <label>설명 (특기사항): </label>
          <textarea name="설명" value={formData.설명} onChange={handleChange} style={{ width: '100%', padding: '8px', minHeight: '60px' }} />
        </div>

        <div style={{ padding: '10px', backgroundColor: '#f9f9f9', borderLeft: '4px solid #0070f3' }}>
          <label style={{ fontWeight: 'bold' }}>행동 강도 (1-5): </label>
          <input 
            type="range" 
            name="강도" 
            min="1" max="5" 
            value={formData.강도} 
            onChange={handleChange} 
            style={{ width: '100%' }} 
          />
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.2em' }}>{formData.강도}</div>
        </div>

        {isCrisis && (
          <div style={{ padding: '15px', backgroundColor: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '5px' }}>
            <h4 style={{ color: '#d32f2f', marginTop: 0 }}>🚨 고강도 위기행동 추가 정보 (강도 3 이상)</h4>
            
            <div style={{ marginBottom: '10px' }}>
              <label>개입 방법: </label>
              <input type="text" name="개입방법" value={formData.개입방법} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label>신체적 개입 여부: </label>
              <select name="신체적개입여부" value={formData.신체적개입여부} onChange={handleChange} style={{ width: '100%', padding: '8px' }}>
                <option value="X">아니오</option>
                <option value="O">예</option>
              </select>
            </div>

            <div>
              <label>부상 발생 여부 (학생/교사): </label>
              <select name="부상여부" value={formData.부상여부} onChange={handleChange} style={{ width: '100%', padding: '8px' }}>
                <option value="X">아니오</option>
                <option value="O">예</option>
              </select>
            </div>
            <p style={{ fontSize: '0.85em', color: '#666' }}>이 기록은 관리자 승인이 필요합니다.</p>
          </div>
        )}

        <button type="submit" disabled={loading} style={{ padding: '10px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
          {loading ? '기록 중...' : '행동 기록 제출'}
        </button>
        {message && <p style={{ fontWeight: 'bold', color: message.includes('오류') ? 'red' : 'green' }}>{message}</p>}
      </form>
    </div>
  );
}
