"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../constants';
import BehaviorForm from '../components/BehaviorForm';
import StudentTimeline from '../components/StudentTimeline';
import GlobalNav from '../components/GlobalNav';
import UserHeader from '../components/UserHeader';
import { useAuth } from '../components/AuthProvider';

export default function BehaviorPage() {
  const { user, isAdmin } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Fetch students to populate dropdown
    axios.get(`${API_BASE_URL}/api/v1/tier/status`)
      .then(res => {
        let data = res.data.students || res.data || [];
        if (!Array.isArray(data)) data = [];
        
        // Filter by teacher's class_id if not admin
        if (!isAdmin() && user?.class_id) {
            data = data.filter((s: any) => String(s.학생코드).startsWith(String(user.class_id)));
        }

        // Just take unique students
        const unique = data.filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => (t.학생코드 === v.학생코드)) === i);
        setStudents(unique);
      })
      .catch(err => console.error("Failed to load students", err));
  }, [user, isAdmin]);

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
