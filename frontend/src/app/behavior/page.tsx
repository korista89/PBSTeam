"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../constants';
import BehaviorForm from '../components/BehaviorForm';
import StudentTimeline from '../components/StudentTimeline';
import GlobalNav from '../components/GlobalNav';
import UserHeader from '../components/UserHeader';

export default function BehaviorPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Fetch students to populate dropdown
    axios.get(`${API_BASE_URL}/api/v1/roster/tier-status`)
      .then(res => {
        // Assume API returns list of students or { data: [...] }
        const data = Array.isArray(res.data) ? res.data : (res.data.data || []);
        // Just take unique students
        const unique = data.filter((v: any, i: number, a: any[]) => a.findIndex(t => (t.학생코드 === v.학생코드)) === i);
        setStudents(unique);
      })
      .catch(err => console.error("Failed to load students", err));
  }, []);

  const handleStudentSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    if (!code) {
      setSelectedStudent(null);
      return;
    }
    const student = students.find(s => s.학생코드 === code);
    setSelectedStudent(student);
  };

  const handleLogSubmitted = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div>
      <GlobalNav />
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
        <UserHeader title="스마트 행동 기록 폼" />
        
        <div style={{ marginBottom: '20px' }}>
          <label><strong>학생 선택: </strong></label>
          <select onChange={handleStudentSelect} style={{ padding: '8px', width: '300px' }}>
            <option value="">-- 학생을 선택하세요 --</option>
            {students.map(s => (
              <option key={s.학생코드} value={s.학생코드}>
                {s.학생이름 || s.이름 || s.학생명} ({s.학생코드})
              </option>
            ))}
          </select>
        </div>

        {selectedStudent && (
          <div style={{ display: 'flex', gap: '30px' }}>
            <div style={{ flex: 1 }}>
              <BehaviorForm 
                studentId={selectedStudent.학생코드} 
                studentName={selectedStudent.학생이름 || selectedStudent.이름 || selectedStudent.학생명}
                onLogSubmitted={handleLogSubmitted} 
              />
            </div>
            <div style={{ flex: 1 }}>
              <StudentTimeline 
                studentId={selectedStudent.학생코드} 
                refreshTrigger={refreshTrigger} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
