"use client";

import React from "react";

interface CrisisDetailPanelProps {
    crisisDetails: Record<string, string>;
    isCrisis?: boolean;
}

export default function CrisisDetailPanel({ crisisDetails, isCrisis }: CrisisDetailPanelProps) {
    if (!crisisDetails) return null;

    const missingReport = !String(crisisDetails['관리자_보고_시간'] || '').trim();
    const missingNotice = !String(crisisDetails['학부모_알림_시간'] || '').trim();
    const showWarning = isCrisis && (missingReport || missingNotice);

    return (
        <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '4px', border: '1px solid #ccc' }}>
            {showWarning && (
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.5 }}>
                    ⚠️ 법정 보고·알림 기록 없음 — {missingReport ? '학교장(관리자) 보고' : ''}{missingReport && missingNotice ? ' · ' : ''}{missingNotice ? '보호자 알림' : ''} 시각이 비어 있습니다.
                    「교원의 학생생활지도에 관한 고시」 제17·18조에 따라 제지·개별학생교육지원 후에는 학교장 보고와 보호자 알림을 지체 없이 기록해야 합니다.
                </div>
            )}

            <p><strong>발생 시 지도교사:</strong> {crisisDetails['발생 시 지도교사']}</p>

            <h5 style={{ margin: '15px 0 5px 0' }}>행동 분석</h5>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                <li><strong>선행사건:</strong> {crisisDetails['A_배경_선행사건']}</li>
                <li><strong>위기행동:</strong> {crisisDetails['B_나타난_위기행동']}</li>
                <li><strong>후속결과:</strong> {crisisDetails['C_후속결과']}</li>
            </ul>

            <h5 style={{ margin: '15px 0 5px 0' }}>개별학생교육지원 현황</h5>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginBottom: '10px' }}>
                <tbody>
                    <tr>
                        <td style={{ border: '1px solid #ccc', padding: '5px', fontWeight: 'bold' }}>1차</td>
                        <td style={{ border: '1px solid #ccc', padding: '5px' }}>시간: {crisisDetails['1차_개별학생교육지원_시간']} | 장소: {crisisDetails['1차_개별학생교육지원_장소']} | 교사: {crisisDetails['1차_개별학생교육지원_교사']}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} style={{ border: '1px solid #ccc', padding: '5px' }}>
                            <strong>경위:</strong> {crisisDetails['1차_경위']}<br />
                            <strong>관찰:</strong> {crisisDetails['1차_관찰기록']}
                        </td>
                    </tr>
                    <tr>
                        <td style={{ border: '1px solid #ccc', padding: '5px', fontWeight: 'bold' }}>2차</td>
                        <td style={{ border: '1px solid #ccc', padding: '5px' }}>시간: {crisisDetails['2차_개별학생교육지원_시간']} | 장소: {crisisDetails['2차_개별학생교육지원_장소']} | 교사: {crisisDetails['2차_개별학생교육지원_교사']}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} style={{ border: '1px solid #ccc', padding: '5px' }}>
                            <strong>경위:</strong> {crisisDetails['2차_경위']}<br />
                            <strong>관찰:</strong> {crisisDetails['2차_관찰기록']}
                        </td>
                    </tr>
                </tbody>
            </table>

            <h5 style={{ margin: '15px 0 5px 0' }}>발생 이후 조치사항</h5>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
                <li><strong>부상자 치료:</strong> {crisisDetails['부상자_치료_시간']} - {crisisDetails['부상자_치료_내용']}</li>
                <li>
                    <strong style={{ color: missingReport ? '#b91c1c' : undefined }}>관리자 보고{missingReport ? ' (미기록)' : ''}:</strong> {crisisDetails['관리자_보고_시간']} - {crisisDetails['관리자_보고_내용']}
                </li>
                <li>
                    <strong style={{ color: missingNotice ? '#b91c1c' : undefined }}>학부모 알림{missingNotice ? ' (미기록)' : ''}:</strong> {crisisDetails['학부모_알림_시간']} - {crisisDetails['학부모_알림_내용']}
                </li>
                <li><strong>학생 상담:</strong> {crisisDetails['학생_상담_시간']} - {crisisDetails['학생_상담_내용']}</li>
                <li><strong>학부모 상담:</strong> {crisisDetails['학부모_상담_시간']} - {crisisDetails['학부모_상담_내용']}</li>
                <li><strong>긴급회의:</strong> {crisisDetails['긴급회의_시간']} - {crisisDetails['긴급회의_내용']}</li>
            </ul>
        </div>
    );
}
