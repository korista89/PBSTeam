"use client";

import React from "react";

interface CrisisDetailPanelProps {
    crisisDetails?: Record<string, string> | null;
    formReportDetails?: Record<string, string> | null;
    isCrisis?: boolean;
}

export default function CrisisDetailPanel({ crisisDetails, formReportDetails, isCrisis }: CrisisDetailPanelProps) {
    if (!crisisDetails && !formReportDetails) return null;

    const f = formReportDetails || {};
    const hasRestraint = !!(f['제지_경위'] || f['제지_방법'] || f['제지_사후조치_특기사항'] || f['제지_법적의무_확인']);
    const hasSupport = !!(f['개별학생교육지원_시간'] || f['개별학생교육지원_교사'] || f['개별학생교육지원_경위'] || f['개별학생교육지원_장소_신규'] || f['개별학생교육지원_내용_회복과정'] || f['개별학생교육지원_사후조치_특기사항'] || f['개별학생교육지원_법적의무_확인']);
    const hasLegacySupport = !!(crisisDetails && (
        crisisDetails['1차_개별학생교육지원_시간'] || crisisDetails['1차_개별학생교육지원_장소'] || crisisDetails['1차_개별학생교육지원_교사'] ||
        crisisDetails['2차_개별학생교육지원_시간'] || crisisDetails['2차_개별학생교육지원_장소'] || crisisDetails['2차_개별학생교육지원_교사'] ||
        crisisDetails['1차_경위'] || crisisDetails['1차_관찰기록'] || crisisDetails['2차_경위'] || crisisDetails['2차_관찰기록']
    ));
    const hasInjury = !!(f['상해_대상자'] || f['상해_경위'] || f['상해_사후조치_특기사항'] || f['상해_후속조치_확인']);

    const missingReport = !!crisisDetails && !String(crisisDetails['관리자_보고_시간'] || '').trim();
    const missingNotice = !!crisisDetails && !String(crisisDetails['학부모_알림_시간'] || '').trim();
    const showWarning = isCrisis && (missingReport || missingNotice);

    return (
        <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '4px', border: '1px solid #ccc' }}>
            {showWarning && (
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.5 }}>
                    ⚠️ 법정 보고·알림 기록 없음 — {missingReport ? '학교장(관리자) 보고' : ''}{missingReport && missingNotice ? ' · ' : ''}{missingNotice ? '보호자 알림' : ''} 시각이 비어 있습니다.
                    「교원의 학생생활지도에 관한 고시」 제17·18조에 따라 제지·개별학생교육지원 후에는 학교장 보고와 보호자 알림을 지체 없이 기록해야 합니다.
                </div>
            )}

            {crisisDetails && (
                <>
                    <p><strong>발생 시 지도교사:</strong> {crisisDetails['발생 시 지도교사']}</p>

                    <h5 style={{ margin: '15px 0 5px 0' }}>행동 분석</h5>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                        <li><strong>선행사건:</strong> {crisisDetails['A_배경_선행사건']}</li>
                        <li><strong>위기행동:</strong> {crisisDetails['B_나타난_위기행동']}</li>
                        <li><strong>후속결과:</strong> {crisisDetails['C_후속결과']}</li>
                    </ul>

                    {hasLegacySupport && (
                        <>
                            <h5 style={{ margin: '15px 0 5px 0' }}>개별학생교육지원 현황 (구 양식 기록)</h5>
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
                        </>
                    )}

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
                </>
            )}

            {hasRestraint && (
                <>
                    <h5 style={{ margin: '15px 0 5px 0' }}>[제지] 보고서 상세</h5>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
                        <li><strong>경위:</strong> {f['제지_경위']}</li>
                        <li><strong>방법:</strong> {f['제지_방법']}</li>
                        <li><strong>사후조치 특기사항:</strong> {f['제지_사후조치_특기사항']}</li>
                        <li><strong>법적 의무 실행 여부 확인:</strong> {f['제지_법적의무_확인']}</li>
                    </ul>
                </>
            )}

            {hasSupport && (
                <>
                    <h5 style={{ margin: '15px 0 5px 0' }}>[개별학생교육지원] 보고서 상세</h5>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
                        <li><strong>실시 시간:</strong> {f['개별학생교육지원_시간']}</li>
                        <li><strong>담당 교사:</strong> {f['개별학생교육지원_교사']}</li>
                        <li><strong>경위:</strong> {f['개별학생교육지원_경위']}</li>
                        <li><strong>장소:</strong> {f['개별학생교육지원_장소_신규']}</li>
                        <li><strong>내용 및 회복 과정:</strong> {f['개별학생교육지원_내용_회복과정']}</li>
                        <li><strong>사후조치 특기사항:</strong> {f['개별학생교육지원_사후조치_특기사항']}</li>
                        <li><strong>법적 의무 실행 여부 확인:</strong> {f['개별학생교육지원_법적의무_확인']}</li>
                    </ul>
                </>
            )}

            {hasInjury && (
                <>
                    <h5 style={{ margin: '15px 0 5px 0' }}>[상해] 보고서 상세</h5>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
                        <li><strong>상해를 입은 사람:</strong> {f['상해_대상자']}</li>
                        <li><strong>경위:</strong> {f['상해_경위']}</li>
                        <li><strong>사후조치 특기사항:</strong> {f['상해_사후조치_특기사항']}</li>
                        <li><strong>후속 조치 여부 확인:</strong> {f['상해_후속조치_확인']}</li>
                    </ul>
                </>
            )}
        </div>
    );
}
