"use client";

import React, { useEffect, useState } from 'react';
import styles from './page.module.css';

// Load mermaid from CDN script in layout or head, OR dynamically import
// Since we are in Next.js, we can try to use a script tag or just assume the user might not have 'mermaid' installed as a package.
// But to be safe and robust, let's include the script in the component using next/script or just basic DOM manipulation if needed, 
// OR simpler: assume we can install 'mermaid' package. 
// Given the user constraint "Port this HTML", the HTML used a CDN. I will use a simple logical wrapper.

export default function ProtocolPage() {
  const [mermaidLoaded, setMermaidLoaded] = useState(false);

  useEffect(() => {
    // Dynamically load mermaid script
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js";
    script.async = true;
    script.onload = () => {
        // @ts-expect-error mermaid is global from CDN
        window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { curve: 'basis', htmlLabels: true } });
        // @ts-expect-error mermaid is global from CDN
        window.mermaid.run({ querySelector: '.mermaid' }).then(() => {
            setMermaidLoaded(true);
        });
    };
    document.body.appendChild(script);

    return () => {
        document.body.removeChild(script);
    }
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>🏫 학교 행동중재 지원 체계도 (Final Standard Protocol)</h1>
        <button className={styles.btnPrint} onClick={() => window.print()}>🖨 인쇄 / PDF 저장</button>
      </div>

      <div className={styles.summaryGrid}>
        <div className={`${styles.card} ${styles.cT1}`}>
            <h3>Tier 1 보편적</h3>
            <p>전교생 예방 교육</p>
        </div>
        <div className={`${styles.card} ${styles.cT2}`}>
            <h3>Tier 2 표적</h3>
            <p>CICO / 소집단</p>
        </div>
        <div className={`${styles.card} ${styles.cT3}`}>
            <h3>Tier 3 개별</h3>
            <p>기능평가(FBA)</p>
        </div>
        <div className={`${styles.card} ${styles.cT3p}`}>
            <h3>Tier 3+ 연계</h3>
            <p>외부 전문가 협력</p>
        </div>
        <div className={`${styles.card} ${styles.cEm}`}>
            <h3>🚨 Red Line</h3>
            <p>상해/제지 시 즉시</p>
        </div>
      </div>

      <div className={styles.dashboard}>
        <div className={styles.panelLeft}>
            <div className={styles.panelTitle}>의사결정 흐름도 (Decision Tree)</div>
            {!mermaidLoaded && <div className={styles.loadingMsg}>도표 로딩 중...</div>}
            <div className="mermaid">
{`
flowchart TD
    %% Style Definitions
    classDef t1 fill:#e3f2fd,stroke:#1565c0,color:#0d47a1,stroke-width:2px;
    classDef t2 fill:#fff3e0,stroke:#ef6c00,color:#e65100,stroke-width:2px;
    classDef t3 fill:#ffebee,stroke:#c62828,color:#b71c1c,stroke-width:2px;
    classDef t3p fill:#f3e5f5,stroke:#6a1b9a,color:#4a148c,stroke-width:2px;
    classDef em fill:#ffcdd2,stroke:#d32f2f,color:#b71c1c,stroke-width:4px,stroke-dasharray: 5 5;
    classDef decision fill:#fff,stroke:#333,stroke-width:1px,stroke-dasharray: 5 5;

    %% Flow
    Start((시작)) --> T1["Tier 1: 보편적 지원"]
    
    T1 --> Check{위기행동 심각도}
    
    %% Emergency
    Check -- "<b>[긴급] 상해/제지</b>" --> Emergency["🚨 긴급: Tier 3 즉시가동"]
    Emergency --> T3
    
    %% Routine
    Check -- "경미/반복" --> Data[데이터 누적]
    Data -- "<b>2주 연속<br>주 2회 이상</b>" --> Tier2_Entry["<b>Tier 2 진입</b>"]
    
    %% Tier 2
    Tier2_Entry --> Apply_CICO["<b>기본: CICO</b><br>(즉시 실시)"]
    Apply_CICO -.-> GroupCheck{"유사 결핍<br>2명 이상?"}
    GroupCheck -- "Yes" --> Add_SST["<b>소집단(SST)</b><br>추가 개설"]
    GroupCheck -- "No" --> CICO_Mentoring[멘토링 강화]
    
    %% Evaluation T2
    Apply_CICO & Add_SST & CICO_Mentoring --> Eval2{효과 평가}
    Eval2 -- "성공" --> Maint2(유지: 2주) --> T1
    Eval2 -- "실패" --> T3["Tier 3: 개별 지원<br>(FBA/BIP)"]
    
    %% Tier 3 Logic
    T3 --> Eval3{효과 평가}
    Eval3 -- "성공" --> Maint3(유지: 4주) --> Tier2_Entry
    Eval3 -- "실패" --> T3Plus["<b>Tier 3+: 지역사회 연계</b><br>(병원/치료기관)"]
    
    %% Tier 3+ Step Down Logic (NEW)
    T3Plus --> EvalExt{전문가 소견}
    EvalExt -- "<b>안정화/호전</b><br>(학교 복귀)" --> T3
    EvalExt -- "지속적 치료 필요" --> T3Plus

    %% Styling
    class Start,T1,Maint2,Maint3 t1;
    class Tier2_Entry,Apply_CICO,Add_SST,CICO_Mentoring,Eval2 t2;
    class T3,Eval3 t3;
    class T3Plus,EvalExt t3p;
    class Emergency em;
    class Check,Data,GroupCheck decision;
`}
            </div>
        </div>

        <div className={styles.panelRight}>
            <div className={styles.panelTitle}>단계별 운영 프로토콜 및 기준 상세</div>
            <table className={styles.table}>
                <colgroup>
                    <col style={{width: '20%'}} />
                    <col style={{width: '35%'}} />
                    <col style={{width: '45%'}} />
                </colgroup>
                <thead>
                    <tr>
                        <th>단계 (Tier)</th>
                        <th>진입 기준 (Entry Criteria)</th>
                        <th>중재 및 환류 (Intervention & Exit)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style={{backgroundColor: '#fff5f5'}}>
                        <td><span className={`${styles.tag} ${styles.red}`}>긴급 (Red)</span></td>
                        <td>
                            • <b>물리적 제지 1회 이상</b><br/>
                            • <b>신체 상해 발생</b>
                        </td>
                        <td>
                            • 즉시 <b>Tier 3</b>로 직행 (절차 생략)<br/>
                            • 위기관리계획(CMP) 최우선 수립
                        </td>
                    </tr>
                    <tr>
                        <td><span className={`${styles.tag} ${styles.orange}`}>Tier 2</span></td>
                        <td>
                            <span className={styles.highlightText}>• 2주 연속 주 2회 이상</span><br/>
                            • 담임교사 추천 (데이터 필)
                        </td>
                        <td>
                            • <b>CICO</b> (기본) / <b>SST</b> (2인이상)<br/>
                            • 성공 시: 2주 유지 후 하향<br/>
                            • 실패 시: Tier 3 상향
                        </td>
                    </tr>
                    <tr>
                        <td><span className={`${styles.tag} ${styles.darkRed}`}>Tier 3</span></td>
                        <td>
                            • Tier 2 중재 실패<br/>
                            • 긴급 트랙 해당자
                        </td>
                        <td>
                            • <b>기능평가(FBA) & 행동중재(BIP)</b><br/>
                            • 성공 시: 4주 유지 후 Tier 2로 완화<br/>
                            • 실패 시: 외부 전문가 연계
                        </td>
                    </tr>
                    <tr style={{backgroundColor: '#fcf8fd'}}>
                        <td><span className={`${styles.tag} ${styles.purple}`}>Tier 3+</span><br/>(지역사회)</td>
                        <td>
                            • 교내 자원으로 해결 불가<br/>
                            • 의료적 진단 필요 시
                        </td>
                        <td>
                            • 병원 치료, 교육청 지원단 연계<br/>
                            • <span className={styles.highlightText}>안정화 시 Tier 3팀으로 이관</span><br/>
                            (바로 종결하지 않고 학교 적응 지원)
                        </td>
                    </tr>
                </tbody>
            </table>

            <div className={styles.alertBox}>
                <b>💡 변경 사항 요약</b><br/>
                1. <b>기준 강화:</b> Tier 2 진입 장벽을 &#39;주 2회씩 2주 연속&#39;으로 높여, 일시적 행동이 아닌 <b>지속적 패턴</b>을 가진 학생을 선별합니다.<br/>
                2. <b>환류 시스템:</b> 지역사회 지원(Tier 3+)을 통해 행동이 안정되면, <b>다시 교내 개별지원팀(Tier 3)</b>이 인계받아 학교 내 일반화를 돕습니다. (Step-down)
            </div>
        </div>
      </div>
    </div>
  );
}
