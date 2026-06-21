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

// ── 위기행동 보고서 드롭다운 예시 ──
const EXAMPLE_ANTECEDENTS = [
  "직접 입력",
  "가정 내 갈등이나 기분 저하 등 침울한 상태로 등교함",
  "교사의 과제 수행 지시나 특정 활동 요구가 있었음",
  "선호하는 활동(태블릿, 놀이 등)이 종료되거나 제한됨",
  "원하는 물건이나 간식을 즉각적으로 제공받지 못함",
  "원하는 자리에 앉지 못하거나 일과가 예상과 다르게 변동됨",
  "복도 이동, 체육 등 타인(학생/교사)과 물리적으로 가까워짐",
  "소음이나 밀집된 공간 등 감각적 불편함을 겪음",
  "주어진 과제의 난이도가 높아 수행에 어려움을 느낌",
  "특별한 외적 자극 없이 수업 중에 갑작스럽게 발생함"
];
const EXAMPLE_BEHAVIORS = [
  "직접 입력",
  "교사나 또래를 향해 큰소리로 욕설을 하며 위협함",
  "교사나 또래를 밀치거나 주먹으로 때리는 신체적 공격을 함",
  "주변의 물건(의자, 가위, 연필, 식판 등)을 집어 던짐",
  "교실 문을 발로 차거나 창문 난간에 올라가는 등 위험 행동을 보임",
  "자신의 머리를 벽에 부딪히거나 때리는 자해 행동을 함",
  "교사의 지시를 완강히 거부하며 바닥에 드러누움",
  "통제 불능 상태로 복도를 배회하며 소리를 지름",
  "다른 학생에게 침을 뱉거나 할퀴려고 시도함",
  "자리에서 이탈하여 갑자기 교실 밖으로 뛰어 나감"
];
const EXAMPLE_CONSEQUENCES = [
  "직접 입력",
  "불편한 과제를 회피하고 안정실로 이동하여 휴식을 취함",
  "위기행동 후 교사의 개별적이고 집중적인 주의와 관심을 받음",
  "타임아웃(분리 조치) 실시 후 스스로 진정하여 교실로 복귀함",
  "주변 학생들의 주목을 받아 문제행동이 일정 시간 지속됨",
  "결국 자신이 원하던 물건이나 활동을 제공받아 행동을 멈춤",
  "교사의 물리적 제지를 받고 다른 공간으로 이동하여 대기함",
  "진정 카드를 활용해 감정을 조절하고 다음 활동에 참여함",
  "상황이 지속되어 학부모에게 연락 후 조기 귀가 조치됨",
  "안정 후 자신의 행동에 대해 교사와 면담을 진행함"
];
const EXAMPLE_OBSERVATIONS = [
  "직접 입력",
  "분리 장소 도착 후에도 10분 이상 소리를 지르고 물건을 차며 흥분함",
  "바닥에 엎드려 울기를 반복하다가 감정 카드를 보고 점차 안정됨",
  "자리에 앉기를 거부하고 벽에 머리를 부딪히는 등 자해 시도를 함",
  "교사의 지시나 질문에 반응하지 않고 멍한 상태로 15분 이상 앉아 있음",
  "안정실 도착 후 5분 만에 울음을 그치고 대화에 응하며 스스로 진정함",
  "울면서 혼잣말을 하거나 자신의 몸을 가볍게 때리는 행동을 반복함",
  "심호흡하기, 약속하기 활동에 참여하며 점진적으로 지시에 순응함",
  "간식 등 선호 자극 제공 후 10분간 휴식하자 완전히 안정되어 복귀 의사 표현",
  "분리지도 내내 불만을 토로했으나, 20분 경과 후 스스로 감정을 가라앉힘"
];
const EXAMPLE_PROCESS = [
  "직접 입력",
  "수업 중 고성방가 및 욕설로 수차례 제지하였으나 불응하여 지정 장소로 분리",
  "타 학생을 공격하려는 징후를 보여 안전 확보를 위해 즉각적으로 분리함",
  "교구재 파손 후 교사에게 물건을 던져 물리적 제지 후 심리안정실로 이동",
  "이동 수업 중 복도에 주저앉아 고함을 쳐 다른 반에 방해되지 않도록 분리함",
  "식사/간식 거부 및 식판을 던져 주변 학생 대피 후 1:1 대면하여 분리함",
  "돌발적으로 교실을 이탈하여 복도를 뛰어다녀 뒤따라가 안전하게 안정실로 안내",
  "지시에 불응하고 교사를 때리려 하여 지도교사 2인이 양손을 제지하고 분리",
  "자해 위험이 높아 신체적 안전 확보가 우선이라 판단하여 즉시 물리적 제지함",
  "쉬는 시간에 또래와 다툼 후 흥분하여 책상을 엎으려 시도하여 즉각 개입 및 분리"
];

function DropdownTextarea({ name, value, onChange, examples, placeholder, required }: {
  name: string, value: string, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void,
  examples: string[], placeholder?: string, required?: boolean
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const handleSelect = (example: string) => {
    if (example === "직접 입력") {
      onChange({ target: { name, value: '' } } as any);
    } else {
      onChange({ target: { name, value: example } } as any);
    }
    setShowDropdown(false);
  };
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
        <button type="button" onClick={() => setShowDropdown(!showDropdown)}
          style={{ padding: '4px 10px', fontSize: '0.8rem', border: '1px solid #94a3b8', borderRadius: '4px', backgroundColor: '#f1f5f9', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          📝 예시 선택 ▾
        </button>
      </div>
      {showDropdown && (
        <div style={{ position: 'absolute', zIndex: 10, backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: '200px', overflowY: 'auto', width: '100%' }}>
          {examples.map((ex, i) => (
            <div key={i} onClick={() => handleSelect(ex)}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '0.85rem', backgroundColor: ex === "직접 입력" ? '#f0f4ff' : 'white' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#e0e7ff')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = ex === "직접 입력" ? '#f0f4ff' : 'white')}>
              {ex}
            </div>
          ))}
        </div>
      )}
      <textarea name={name} value={value} onChange={onChange} required={required}
        placeholder={placeholder || "예시를 선택하거나 직접 입력하세요"}
        style={{ width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' }} />
    </div>
  );
}

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

      const payload: Record<string, string> = {
        학생코드: studentId,
        학생명: studentName,
        입력교사명: user?.name || user?.id || '알수없음',
        행동발생날짜: formData.행동발생날짜,
        시간대: formData.시간대.join(', '),
        '행동 발생 장소': 장소값,
        '행동유형(핵심행동으로택1)': formData.행동유형,
        '강도(1~5점 척도)': formData.강도,
        '기능(이번 행동을 통해 파악된 기능)': 기능값,
        '물리적제지, 3/4호분리지도,본인/타인상해 발생 여부': formData.물리적제지여부,
        '발생횟수(한 에피소드 당 1회로 입력 권장)': 발생횟수값,
        '특기사항(기타)': formData.특기사항,
      };

      if (isCrisis) {
        payload['발생 시 지도교사'] = crisisData.발생시지도교사;
        payload['1차_개별학생교육지원_시간'] = crisisData.지원1차_시간;
        payload['1차_개별학생교육지원_장소'] = crisisData.지원1차_장소;
        payload['1차_개별학생교육지원_교사'] = crisisData.지원1차_교사;
        payload['2차_개별학생교육지원_시간'] = crisisData.지원2차_시간;
        payload['2차_개별학생교육지원_장소'] = crisisData.지원2차_장소;
        payload['2차_개별학생교육지원_교사'] = crisisData.지원2차_교사;
        payload['A_배경_선행사건'] = crisisData.배경_선행사건;
        payload['B_나타난_위기행동'] = crisisData.나타난_위기행동;
        payload['C_후속결과'] = crisisData.후속결과;
        payload['1차_경위'] = crisisData.경위1차;
        payload['2차_경위'] = crisisData.경위2차;
        payload['1차_관찰기록'] = crisisData.관찰기록1차;
        payload['2차_관찰기록'] = crisisData.관찰기록2차;
        payload['부상자_치료_시간'] = crisisData.부상자_치료_시간;
        payload['부상자_치료_내용'] = crisisData.부상자_치료_내용;
        payload['관리자_보고_시간'] = crisisData.관리자_보고_시간;
        payload['관리자_보고_내용'] = crisisData.관리자_보고_내용;
        payload['학부모_알림_시간'] = crisisData.학부모_알림_시간;
        payload['학부모_알림_내용'] = crisisData.학부모_알림_내용;
        payload['학생_상담_시간'] = crisisData.학생_상담_시간;
        payload['학생_상담_내용'] = crisisData.학생_상담_내용;
        payload['학부모_상담_시간'] = crisisData.학부모_상담_시간;
        payload['학부모_상담_내용'] = crisisData.학부모_상담_내용;
        payload['긴급회의_시간'] = crisisData.긴급회의_시간;
        payload['긴급회의_내용'] = crisisData.긴급회의_내용;
      }

      const res = await axios.post(`${API_BASE_URL}/api/v1/behavior-log`, payload);
      
      if (res.data.success) {
        setMessage(res.data.status === 'Pending' ? '✅ 행동기록 및 보고서가 제출되었습니다 (관리자 승인 대기중).' : '✅ 행동이 기록되었습니다.');
        setFormData({
          행동발생날짜: new Date().toISOString().split('T')[0], 시간대: [], 장소: '', 장소기타: '',
          행동유형: '', 강도: '', 기능: '', 기능기타: '', 물리적제지여부: 'X(보고서 작성 불필요)',
          발생횟수: '', 발생횟수기타: '', 특기사항: ''
        });
        setCrisisData({
          발생시지도교사: '', 지원1차_시간: '', 지원1차_장소: '', 지원1차_교사: '',
          지원2차_시간: '', 지원2차_장소: '', 지원2차_교사: '',
          배경_선행사건: '', 나타난_위기행동: '', 후속결과: '',
          경위1차: '', 경위2차: '', 관찰기록1차: '', 관찰기록2차: '',
          부상자_치료_시간: '', 부상자_치료_내용: '', 관리자_보고_시간: '', 관리자_보고_내용: '',
          학부모_알림_시간: '', 학부모_알림_내용: '', 학생_상담_시간: '', 학생_상담_내용: '',
          학부모_상담_시간: '', 학부모_상담_내용: '', 긴급회의_시간: '', 긴급회의_내용: ''
        });
        onLogSubmitted();
      } else {
        setMessage('❌ 오류 발생: ' + res.data.message);
      }
    } catch (err: any) {
      setMessage('❌ 서버 통신 오류: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const radioStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.9rem' };
  const groupStyle: React.CSSProperties = { padding: '15px', border: '1px solid #eaeaea', borderRadius: '8px', marginBottom: '15px', backgroundColor: '#fff' };

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
            <input type="radio" name="기능" value="기타" checked={formData.기능 === '기타'} onChange={handleChange} />
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
            <input type="radio" name="발생횟수" value="기타" checked={formData.발생횟수 === '기타'} onChange={handleChange} />
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

        {/* ── CRISIS REPORT BRANCHING ── */}
        {isCrisis && (
          <div style={{ marginTop: '20px', padding: '20px', border: '2px solid #b91c1c', borderRadius: '12px', backgroundColor: '#fff' }}>
            <h3 style={{ color: '#b91c1c', textAlign: 'center', marginBottom: '5px' }}>🚨 위기행동 지원 및 개별학생교육지원 보고서</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', marginBottom: '20px' }}>
              💡 각 항목의 <strong>[📝 예시 선택]</strong> 버튼을 눌러 예시 문장을 선택한 후 편집하세요. 작성 부담이 줄어듭니다!
            </p>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontWeight: 'bold' }}>발생 시 지도교사: *</label>
              <input type="text" name="발생시지도교사" value={crisisData.발생시지도교사} onChange={handleCrisisChange} style={{ marginLeft: '10px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }} required />
            </div>

            {/* 1차/2차 개별학생교육지원 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '0.9rem' }}>
              <tbody>
                <tr>
                  <td rowSpan={2} style={{ border: '1px solid #ccc', padding: '8px', backgroundColor: '#e2e8f0', fontWeight: 'bold', width: '15%', verticalAlign: 'top' }}>1차 개별학생<br/>교육지원</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>시간: <input type="text" name="지원1차_시간" value={crisisData.지원1차_시간} onChange={handleCrisisChange} placeholder="예: 12:55~13:23" style={{width:'70%', marginLeft:'5px', padding:'4px', border:'1px solid #ccc', borderRadius:'3px'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>장소: <input type="text" name="지원1차_장소" value={crisisData.지원1차_장소} onChange={handleCrisisChange} placeholder="예: 심리안정실" style={{width:'70%', marginLeft:'5px', padding:'4px', border:'1px solid #ccc', borderRadius:'3px'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>교사: <input type="text" name="지원1차_교사" value={crisisData.지원1차_교사} onChange={handleCrisisChange} placeholder="교사명" style={{width:'70%', marginLeft:'5px', padding:'4px', border:'1px solid #ccc', borderRadius:'3px'}} /></td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <div style={{fontWeight: 'bold', marginBottom: '5px'}}>1차 지원 경위:</div>
                    <DropdownTextarea name="경위1차" value={crisisData.경위1차} onChange={handleCrisisChange} examples={EXAMPLE_PROCESS} />
                    <div style={{fontWeight: 'bold', marginTop: '10px', marginBottom: '5px'}}>1차 관찰기록:</div>
                    <DropdownTextarea name="관찰기록1차" value={crisisData.관찰기록1차} onChange={handleCrisisChange} examples={EXAMPLE_OBSERVATIONS} />
                  </td>
                </tr>
                <tr>
                  <td rowSpan={2} style={{ border: '1px solid #ccc', padding: '8px', backgroundColor: '#e2e8f0', fontWeight: 'bold', verticalAlign: 'top' }}>2차 개별학생<br/>교육지원</td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>시간: <input type="text" name="지원2차_시간" value={crisisData.지원2차_시간} onChange={handleCrisisChange} placeholder="해당시 입력" style={{width:'70%', marginLeft:'5px', padding:'4px', border:'1px solid #ccc', borderRadius:'3px'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>장소: <input type="text" name="지원2차_장소" value={crisisData.지원2차_장소} onChange={handleCrisisChange} style={{width:'70%', marginLeft:'5px', padding:'4px', border:'1px solid #ccc', borderRadius:'3px'}} /></td>
                  <td style={{ border: '1px solid #ccc', padding: '8px' }}>교사: <input type="text" name="지원2차_교사" value={crisisData.지원2차_교사} onChange={handleCrisisChange} style={{width:'70%', marginLeft:'5px', padding:'4px', border:'1px solid #ccc', borderRadius:'3px'}} /></td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ border: '1px solid #ccc', padding: '8px' }}>
                    <div style={{fontWeight: 'bold', marginBottom: '5px'}}>2차 지원 경위 (해당시):</div>
                    <DropdownTextarea name="경위2차" value={crisisData.경위2차} onChange={handleCrisisChange} examples={EXAMPLE_PROCESS} />
                    <div style={{fontWeight: 'bold', marginTop: '10px', marginBottom: '5px'}}>2차 관찰기록:</div>
                    <DropdownTextarea name="관찰기록2차" value={crisisData.관찰기록2차} onChange={handleCrisisChange} examples={EXAMPLE_OBSERVATIONS} />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* A-B-C 행동 분석 */}
            <h4 style={{borderBottom: '1px solid #ccc', paddingBottom: '5px'}}>행동 분석 (A-B-C)</h4>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontWeight: 'bold' }}>A. 배경/선행사건 (요약):</label>
              <DropdownTextarea name="배경_선행사건" value={crisisData.배경_선행사건} onChange={handleCrisisChange} examples={EXAMPLE_ANTECEDENTS} />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontWeight: 'bold' }}>B. 나타난 위기행동 (구체적 서술):</label>
              <DropdownTextarea name="나타난_위기행동" value={crisisData.나타난_위기행동} onChange={handleCrisisChange} examples={EXAMPLE_BEHAVIORS} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 'bold' }}>C. 후속결과 (요약):</label>
              <DropdownTextarea name="후속결과" value={crisisData.후속결과} onChange={handleCrisisChange} examples={EXAMPLE_CONSEQUENCES} />
            </div>

            {/* 발생 이후 조치사항 */}
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
                {[
                  { label: '부상자 치료', timeKey: '부상자_치료_시간', contentKey: '부상자_치료_내용', required: false },
                  { label: '*관리자 보고', timeKey: '관리자_보고_시간', contentKey: '관리자_보고_내용', required: true, highlight: true },
                  { label: '*학부모 알림', timeKey: '학부모_알림_시간', contentKey: '학부모_알림_내용', required: true, highlight: true },
                  { label: '학생 상담', timeKey: '학생_상담_시간', contentKey: '학생_상담_내용', required: false },
                  { label: '학부모 상담', timeKey: '학부모_상담_시간', contentKey: '학부모_상담_내용', required: false },
                  { label: '긴급회의', timeKey: '긴급회의_시간', contentKey: '긴급회의_내용', required: false },
                ].map(item => (
                  <tr key={item.label}>
                    <td style={{ border: '1px solid #ccc', padding: '8px', fontWeight: 'bold', textAlign: 'center', color: item.highlight ? '#b91c1c' : 'inherit' }}>{item.label}</td>
                    <td style={{ border: '1px solid #ccc', padding: '4px' }}>
                      <input type="text" name={item.timeKey} value={(crisisData as any)[item.timeKey]} onChange={handleCrisisChange}
                        placeholder="날짜/시간" style={{width:'100%', border:'none', padding:'6px'}} />
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '4px' }}>
                      <input type="text" name={item.contentKey} value={(crisisData as any)[item.contentKey]} onChange={handleCrisisChange}
                        placeholder="내용 입력" style={{width:'100%', border:'none', padding:'6px'}} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button type="submit" disabled={loading} style={{ padding: '15px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold', marginTop: '20px' }}>
          {loading ? '기록 제출 중...' : '행동 기록 제출'}
        </button>
        {message && <div style={{ marginTop: '15px', padding: '12px', borderRadius: '8px', backgroundColor: message.includes('❌') ? '#fee2e2' : '#dcfce7', color: message.includes('❌') ? '#991b1b' : '#166534', textAlign: 'center', fontWeight: 'bold' }}>{message}</div>}
      </form>
    </div>
  );
}
