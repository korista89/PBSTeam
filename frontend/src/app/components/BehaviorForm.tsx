"use client";

import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../constants';
import { useAuth } from './AuthProvider';

const TIME_SLOTS = [
  "1구간: 등교시간", "2구간: 1교시", "3구간: 2교시", "4구간: 3교시", 
  "5구간: 초등점심/중등4교시", "6구간: 초등4교시/중등점심", "7구간: 5교시", 
  "8구간: 6교시", "9구간: 7교시", "10구간: 하교시간"
];
const PLACES = ["교실", "화장실", "급식실", "복도/계단", "운동장", "통학버스", "기타"];
const BEHAVIOR_TYPES = [
  "자해행동: 본인 신체 가해 및 위해",
  "신체적공격행동: 타인 밀치기, 때리기 등 신체 접촉",
  "물건파괴행동: 물건 던지기 및 시설물 파손",
  "방해행동: 소음 및 지속적 수업 방해",
  "반복적행동: 수업 무관 반복 행동으로 본인 학습 방해",
  "사회적공격행동: 언어·비언어적 비난 및 수치심 유발",
  "위축/부주의행동: 멍함, 무반응, 주의분산",
  "비협조적행동: 교사 지시 거부 및 불응"
];
const INTENSITIES = [
  "1(문제행동): 일시적 방해나 불쾌감 제공",
  "2(문제행동): 반복적 방해나 가벼운 소란",
  "3(위기행동): 신체 흔적 발생 혹은 5분 이상 활동 중단",
  "4(위기행동): 강한 타격이나 기물 파손",
  "5(위기행동): 출혈, 골절, 사고 등 즉각적 조치 필요"
];
const FUNCTIONS = [
  "관심 끌기(사회적 정적강화)", "물건/활동 획득(사회적 정적강화)",
  "감각 추구(자동적 정적강화)", "과제 회피(사회적 부적강화)",
  "불편 해소(자동적 부적강화)"
];
const FREQUENCIES = ["1회", "2회", "3회", "4회", "5회", "6회", "7회", "8회", "9회", "10회"];

export default function BehaviorForm({ studentId, studentName, onLogSubmitted }: { studentId: string, studentName: string, onLogSubmitted: () => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    행동발생날짜: new Date().toISOString().split('T')[0],
    시간대: [] as string[],
    장소: '', 장소기타: '',
    행동유형: '',
    강도: '',
    기능: '', 기능기타: '',
    물리적제지여부: 'X(보고서 작성 불필요)',
    발생횟수: '', 발생횟수기타: '',
    특기사항: ''
  });

  const [crisisData, setCrisisData] = useState({
    발생시지도교사: '',
    지원1차_시간: '', 지원1차_장소: '', 지원1차_교사: '',
    지원2차_시간: '', 지원2차_장소: '', 지원2차_교사: '',
    배경_선행사건: '', 나타난_위기행동: '', 후속결과: '',
    경위1차: '', 경위2차: '', 관찰기록1차: '', 관찰기록2차: '',
    부상자_치료_시간: '', 부상자_치료_내용: '',
    관리자_보고_시간: '', 관리자_보고_내용: '',
    학부모_알림_시간: '', 학부모_알림_내용: '',
    학생_상담_시간: '', 학생_상담_내용: '',
    학부모_상담_시간: '', 학부모_상담_내용: '',
    긴급회의_시간: '', 긴급회의_내용: ''
  });

  const [message, setMessage] = useState('');
  const isCrisis = formData.물리적제지여부.startsWith("O");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: '시간대') => {
    const value = e.target.value;
    if (e.target.checked) {
      setFormData({ ...formData, [fieldName]: [...formData[fieldName], value] });
    } else {
      setFormData({ ...formData, [fieldName]: formData[fieldName].filter(v => v !== value) });
    }
  };

  const handleCrisisChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCrisisData({ ...crisisData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    
    try {
      const 장소값 = formData.장소 === '기타' ? formData.장소기타 : formData.장소;
      const 기능값 = formData.기능 === '기타' ? formData.기능기타 : formData.기능;
      const 발생횟수값 = formData.발생횟수 === '기타' ? formData.발생횟수기타 : formData.발생횟수;

      const payload = {
        학생코드: studentId,
        학생명: studentName,
        입력교사명: user?.name || user?.id || '알수없음',
        행동발생날짜: formData.행동발생날짜,
        시간대: formData.시간대.join(', '),
        '행동 발생 장소': 장소값,
        '(주요)행동유형': formData.행동유형,
        '강도(1~5점 척도)': formData.강도,
        '기능(이번 행동을 통해 파악된 기능)': 기능값,
        '물리적제지, 3/4호분리지도,본인/타인상해 발생 여부': formData.물리적제지여부,
        '발생횟수(한 에피소드 당 1회로 입력 권장)': 발생횟수값,
        '특기사항(기타)': formData.특기사항,
        
        ...(isCrisis && {
          '발생 시 지도교사': crisisData.발생시지도교사,
          '1차_개별학생교육지원_시간': crisisData.지원1차_시간,
          '1차_개별학생교육지원_장소': crisisData.지원1차_장소,
          '1차_개별학생교육지원_교사': crisisData.지원1차_교사,
          '2차_개별학생교육지원_시간': crisisData.지원2차_시간,
          '2차_개별학생교육지원_장소': crisisData.지원2차_장소,
          '2차_개별학생교육지원_교사': crisisData.지원2차_교사,
          'A_배경_선행사건': crisisData.배경_선행사건,
          'B_나타난_위기행동': crisisData.나타난_위기행동,
          'C_후속결과': crisisData.후속결과,
          '1차_경위': crisisData.경위1차,
          '2차_경위': crisisData.경위2차,
          '1차_관찰기록': crisisData.관찰기록1차,
          '2차_관찰기록': crisisData.관찰기록2차,
          '부상자_치료_시간': crisisData.부상자_치료_시간,
          '부상자_치료_내용': crisisData.부상자_치료_내용,
          '관리자_보고_시간': crisisData.관리자_보고_시간,
          '관리자_보고_내용': crisisData.관리자_보고_내용,
          '학부모_알림_시간': crisisData.학부모_알림_시간,
          '학부모_알림_내용': crisisData.학부모_알림_내용,
          '학생_상담_시간': crisisData.학생_상담_시간,
          '학생_상담_내용': crisisData.학생_상담_내용,
          '학부모_상담_시간': crisisData.학부모_상담_시간,
          '학부모_상담_내용': crisisData.학부모_상담_내용,
          '긴급회의_시간': crisisData.긴급회의_시간,
          '긴급회의_내용': crisisData.긴급회의_내용
        })
      };

      const res = await axios.post(`${API_BASE_URL}/api/v1/behavior-log`, payload);
      
      if (res.data.success) {
        setMessage(res.data.status === 'Pending' ? '행동기록 및 보고서가 제출되었습니다 (승인 대기중).' : '행동이 기록되었습니다.');
        setFormData({
          행동발생날짜: new Date().toISOString().split('T')[0], 시간대: [], 장소: '', 장소기타: '',
          행동유형: '', 강도: '', 기능: '', 기능기타: '', 물리적제지여부: 'X(보고서 작성 불필요)',
          발생횟수: '', 발생횟수기타: '', 특기사항: ''
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

  const radioStyle = { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.9rem' };
  const groupStyle = { padding: '15px', border: '1px solid #eaeaea', borderRadius: '8px', marginBottom: '15px', backgroundColor: '#fff' };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '12px', marginTop: '20px', backgroundColor: '#fcfcfc' }}>
      <h3 style={{ borderBottom: '2px solid #0070f3', paddingBottom: '10px' }}>새 행동 데이터 입력: {studentName}</h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', marginTop: '20px' }}>
        
        <div style={groupStyle}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>행동발생날짜 *</label>
          <input type="date" name="행동발생날짜" value={formData.행동발생날짜} onChange={handleChange} required style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
        </div>

        <div style={groupStyle}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>시간대 *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
            {TIME_SLOTS.map(t => (
              <label key={t} style={radioStyle}>
                <input type="checkbox" value={t} checked={formData.시간대.includes(t)} onChange={(e) => handleCheckboxChange(e, '시간대')} />
                {t}
              </label>
            ))}
          </div>
        </div>

        <div style={groupStyle}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>행동 발생 장소 *</label>
          {PLACES.map(p => (
            <label key={p} style={radioStyle}>
              <input type="radio" name="장소" value={p} checked={formData.장소 === p} onChange={handleChange} required />
              {p}
              {p === '기타' && formData.장소 === '기타' && (
                <input type="text" name="장소기타" value={formData.장소기타} onChange={handleChange} style={{ marginLeft: '10px', padding: '4px', border: '1px solid #ccc' }} placeholder="직접 입력" required />
              )}
            </label>
          ))}
        </div>

        <div style={groupStyle}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>행동유형(핵심행동으로택1) *</label>
          {BEHAVIOR_TYPES.map(b => (
            <label key={b} style={radioStyle}>
              <input type="radio" name="행동유형" value={b} checked={formData.행동유형 === b} onChange={handleChange} required />
              {b}
            </label>
          ))}
        </div>

        <div style={groupStyle}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>강도(1~5점 척도) *</label>
          {INTENSITIES.map(i => (
            <label key={i} style={radioStyle}>
              <input type="radio" name="강도" value={i} checked={formData.강도 === i} onChange={handleChange} required />
              {i}
            </label>
          ))}
        </div>

        <div style={groupStyle}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>기능(이번 행동을 통해 파악된 기능) *</label>
          {FUNCTIONS.map(f => (
            <label key={f} style={radioStyle}>
              <input type="radio" name="기능" value={f} checked={formData.기능 === f} onChange={handleChange} required />
              {f}
            </label>
          ))}
          <label style={radioStyle}>
            <input type="radio" name="기능" value="기타" checked={formData.기능 === '기타'} onChange={handleChange} required />
            기타:
            {formData.기능 === '기타' && (
              <input type="text" name="기능기타" value={formData.기능기타} onChange={handleChange} style={{ marginLeft: '10px', padding: '4px', border: '1px solid #ccc', flex: 1 }} required />
            )}
          </label>
        </div>

        <div style={groupStyle}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>발생횟수(한 에피소드 당 1회로 입력 권장) *</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '5px' }}>
            {FREQUENCIES.map(f => (
              <label key={f} style={radioStyle}>
                <input type="radio" name="발생횟수" value={f} checked={formData.발생횟수 === f} onChange={handleChange} required />
                {f}
              </label>
            ))}
          </div>
          <label style={{ ...radioStyle, marginTop: '8px' }}>
            <input type="radio" name="발생횟수" value="기타" checked={formData.발생횟수 === '기타'} onChange={handleChange} required />
            기타:
            {formData.발생횟수 === '기타' && (
              <input type="text" name="발생횟수기타" value={formData.발생횟수기타} onChange={handleChange} style={{ marginLeft: '10px', padding: '4px', border: '1px solid #ccc' }} required />
            )}
          </label>
        </div>

        <div style={{ ...groupStyle, backgroundColor: '#fef2f2', border: '1px solid #fca5a5' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px', color: '#b91c1c' }}>물리적제지, 3/4호분리지도,본인/타인상해 발생 여부 *</label>
          <label style={radioStyle}>
            <input type="radio" name="물리적제지여부" value="O(보고서 작성 필요)" checked={formData.물리적제지여부 === "O(보고서 작성 필요)"} onChange={handleChange} required />
            O(보고서 작성 필요)
          </label>
          <label style={radioStyle}>
            <input type="radio" name="물리적제지여부" value="X(보고서 작성 불필요)" checked={formData.물리적제지여부 === "X(보고서 작성 불필요)"} onChange={handleChange} required />
            X(보고서 작성 불필요)
          </label>
        </div>

        <div style={groupStyle}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>특기사항(기타)</label>
          <textarea name="특기사항" value={formData.특기사항} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', minHeight: '60px' }} />
        </div>

        {/* CRISIS REPORT BRANCHING */}
        {isCrisis && (
          <div style={{ marginTop: '20px', padding: '20px', border: '2px solid #b91c1c', borderRadius: '12px', backgroundColor: '#fff' }}>
            <h3 style={{ color: '#b91c1c', textAlign: 'center', marginBottom: '20px' }}>위기행동 지원 및 개별학생교육지원 보고서</h3>
            <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '20px' }}>* 관리자(부장, 교감, 교장) 승인이 필요한 문서입니다.</p>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontWeight: 'bold' }}>발생 시 지도교사:</label>
              <input type="text" name="발생시지도교사" value={crisisData.발생시지도교사} onChange={handleCrisisChange} style={{ marginLeft: '10px', padding: '6px', border: '1px solid #ccc' }} required />
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '0.9rem' }}>
              <tbody>
                <tr>
                  <td rowSpan={2} style={{ border: '1px solid #ccc', padding: '8px', backgroundColor: '#e2e8f0', fontWeight: 'bold', width: '15%' }}>1차 개별학생교육지원</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>시간: <input type="text" name="지원1차_시간" value={crisisData.지원1차_시간} onChange={handleCrisisChange} style={{width:'80%', marginLeft:'5px'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>장소: <input type="text" name="지원1차_장소" value={crisisData.지원1차_장소} onChange={handleCrisisChange} style={{width:'80%', marginLeft:'5px'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>교사: <input type="text" name="지원1차_교사" value={crisisData.지원1차_교사} onChange={handleCrisisChange} style={{width:'80%', marginLeft:'5px'}} /></td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <div style={{fontWeight: 'bold', marginBottom: '5px'}}>1차 지원 경위:</div>
                    <textarea name="경위1차" value={crisisData.경위1차} onChange={handleCrisisChange} style={{width:'100%', minHeight:'50px'}} />
                    <div style={{fontWeight: 'bold', marginTop: '10px', marginBottom: '5px'}}>1차 관찰기록:</div>
                    <textarea name="관찰기록1차" value={crisisData.관찰기록1차} onChange={handleCrisisChange} style={{width:'100%', minHeight:'50px'}} />
                  </td>
                </tr>
                <tr>
                  <td rowSpan={2} style={{ border: '1px solid #ccc', padding: '8px', backgroundColor: '#e2e8f0', fontWeight: 'bold' }}>2차 개별학생교육지원</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>시간: <input type="text" name="지원2차_시간" value={crisisData.지원2차_시간} onChange={handleCrisisChange} style={{width:'80%', marginLeft:'5px'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>장소: <input type="text" name="지원2차_장소" value={crisisData.지원2차_장소} onChange={handleCrisisChange} style={{width:'80%', marginLeft:'5px'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>교사: <input type="text" name="지원2차_교사" value={crisisData.지원2차_교사} onChange={handleCrisisChange} style={{width:'80%', marginLeft:'5px'}} /></td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <div style={{fontWeight: 'bold', marginBottom: '5px'}}>2차 지원 경위 (해당시):</div>
                    <textarea name="경위2차" value={crisisData.경위2차} onChange={handleCrisisChange} style={{width:'100%', minHeight:'50px'}} />
                    <div style={{fontWeight: 'bold', marginTop: '10px', marginBottom: '5px'}}>2차 관찰기록:</div>
                    <textarea name="관찰기록2차" value={crisisData.관찰기록2차} onChange={handleCrisisChange} style={{width:'100%', minHeight:'50px'}} />
                  </td>
                </tr>
              </tbody>
            </table>

            <h4 style={{borderBottom: '1px solid #ccc', paddingBottom: '5px'}}>행동 분석 (A-B-C)</h4>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontWeight: 'bold' }}>A. 배경/선행사건 (요약):</label>
              <textarea name="배경_선행사건" value={crisisData.배경_선행사건} onChange={handleCrisisChange} style={{ width: '100%', minHeight: '50px', marginTop: '5px' }} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontWeight: 'bold' }}>B. 나타난 위기행동 (구체적 서술):</label>
              <textarea name="나타난_위기행동" value={crisisData.나타난_위기행동} onChange={handleCrisisChange} style={{ width: '100%', minHeight: '50px', marginTop: '5px' }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 'bold' }}>C. 후속결과 (요약):</label>
              <textarea name="후속결과" value={crisisData.후속결과} onChange={handleCrisisChange} style={{ width: '100%', minHeight: '50px', marginTop: '5px' }} />
            </div>

            <h4 style={{borderBottom: '1px solid #ccc', paddingBottom: '5px'}}>발생 이후 조치사항</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9' }}>
                  <th style={{ border: '1px solid #ccc', padding: '8px', width: '20%' }}>구분</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', width: '30%' }}>시간/일자</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px', width: '50%' }}>내용</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold', textAlign: 'center' }}>부상자 치료</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="부상자_치료_시간" value={crisisData.부상자_치료_시간} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="부상자_치료_내용" value={crisisData.부상자_치료_내용} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold', textAlign: 'center', color: '#b91c1c' }}>*관리자 보고</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="관리자_보고_시간" value={crisisData.관리자_보고_시간} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="관리자_보고_내용" value={crisisData.관리자_보고_내용} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold', textAlign: 'center', color: '#b91c1c' }}>*학부모 알림</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="학부모_알림_시간" value={crisisData.학부모_알림_시간} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="학부모_알림_내용" value={crisisData.학부모_알림_내용} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold', textAlign: 'center' }}>학생 상담</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="학생_상담_시간" value={crisisData.학생_상담_시간} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="학생_상담_내용" value={crisisData.학생_상담_내용} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold', textAlign: 'center' }}>학부모 상담</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="학부모_상담_시간" value={crisisData.학부모_상담_시간} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="학부모_상담_내용" value={crisisData.학부모_상담_내용} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold', textAlign: 'center' }}>긴급회의</td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="긴급회의_시간" value={crisisData.긴급회의_시간} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}><input type="text" name="긴급회의_내용" value={crisisData.긴급회의_내용} onChange={handleCrisisChange} style={{width:'100%', border:'none'}} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <button type="submit" disabled={loading} style={{ padding: '15px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold', marginTop: '20px' }}>
          {loading ? '기록 제출 중...' : '행동 기록 제출'}
        </button>
        {message && <div style={{ marginTop: '15px', padding: '10px', borderRadius: '8px', backgroundColor: message.includes('오류') ? '#fee2e2' : '#dcfce7', color: message.includes('오류') ? '#991b1b' : '#166534', textAlign: 'center', fontWeight: 'bold' }}>{message}</div>}
      </form>
    </div>
  );
}
