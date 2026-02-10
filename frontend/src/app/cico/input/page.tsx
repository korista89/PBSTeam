
"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { format } from "date-fns";
import Navbar from "@/components/Navbar";

interface StudentDaily {
  row_idx: number;
  student_code: string;
  class: string;
  no: string;
  target_behavior: string;
  value: string; // The daily value (O/X/Rate)
}

export default function CicoInputPage() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [students, setStudents] = useState<StudentDaily[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const fetchDailyData = async (targetDate: string) => {
    setLoading(true);
    setMessage("");
    try {
      const res = await axios.get(`http://localhost:8000/api/v1/cico/daily?date=${targetDate}`);
      setStudents(res.data);
    } catch (err: any) {
      console.error(err);
      setMessage("데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyData(date);
  }, [date]);

  const handleValueChange = (code: string, newValue: string) => {
    setStudents((prev) =>
      prev.map((s) => (s.student_code === code ? { ...s, value: newValue } : s))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const updates = students.map((s) => ({
        student_code: s.student_code,
        rate: s.value, // Using 'rate' field for the daily value
      }));

      await axios.post("http://localhost:8000/api/v1/cico/daily", {
        date,
        updates,
      });

      setMessage("저장되었습니다! (대시보드 업데이트 포함)");
    } catch (err: any) {
      console.error(err);
      setMessage("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">CICO 일괄 입력 (Daily Batch Input)</h1>
        
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex items-center space-x-4 mb-4">
            <label className="font-semibold text-gray-700">날짜 선택:</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button 
                onClick={() => fetchDailyData(date)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded"
            >
                새로고침
            </button>
          </div>

          {loading ? (
            <div className="text-center py-10">로딩 중...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">학급/번호</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름(코드)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">목표 행동</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        수행 결과 입력 (O/X 또는 %)
                        <span className="block text-gray-400 font-normal normal-case">예: 80% -> 0.8 또는 80% 입력</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {students.map((student) => (
                      <tr key={student.student_code}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {student.class} {student.no && `#${student.no}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {student.student_code}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.target_behavior || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <input
                            type="text"
                            value={student.value}
                            onChange={(e) => handleValueChange(student.student_code, e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 w-full focus:ring-blue-500 focus:border-blue-500"
                            placeholder="입력..."
                          />
                        </td>
                      </tr>
                    ))}
                    {students.length === 0 && (
                        <tr><td colSpan={4} className="text-center py-4">대상 학생이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <span className={`text-sm ${message.includes("오류") ? "text-red-600" : "text-green-600"}`}>
                  {message}
                </span>
                <button
                  onClick={handleSave}
                  disabled={saving || students.length === 0}
                  className={`px-6 py-2 rounded text-white font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    saving || students.length === 0 ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {saving ? "저장 중..." : "저장하기"}
                </button>
              </div>
            </>
          )}
        </div>
        
        <div className="text-sm text-gray-500">
            * 입력 팁: 탭(Tab) 키를 사용하여 다음 칸으로 빠르게 이동할 수 있습니다.
        </div>
      </div>
    </div>
  );
}
