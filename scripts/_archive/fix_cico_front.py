import re

# ── CICOSummaryPanel replacement ───────────────────────────────────────
TIER2 = '/home/korista89/Anti1/frontend/src/app/report/tier2/page.tsx'
with open(TIER2, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find line indices
sum_start = next(i for i,l in enumerate(lines) if '// ====== 상단 종합 요약 패널' in l)
chart_start = next(i for i,l in enumerate(lines) if '// ====== CICO 학생별 세부 차트' in l)

new_summary = r"""// ====== 상단 종합 요약 패널 ======
function CICOSummaryPanel({ data, month, getRateColor }: { data: any; month: number; getRateColor: (r: number|null)=>string }) {
  const students = data.students;
  const s = data.summary;
  const roster = s.total_roster || 0;
  const pct = roster > 0 ? Math.round(s.total_students / roster * 100) : 0;
  const tier1C = students.filter((st: any) => st.decision === "Tier1 하향 권장").length;
  const tier3R = students.filter((st: any) => st.decision === "Tier3 상향 검토").length;
  const modN = students.filter((st: any) => st.decision?.includes("수정")).length;
  const concurrent = students.filter((st: any) => !st.cico_only).length;

  // 학생별 수행률+목표 grouped bar
  const barData = students.map((st: any) => ({
    name: st.name ? (st.name.length >= 3 ? st.name[0]+"O"+st.name[st.name.length-1] : st.name[0]+"O") : st.code.slice(0,4),
    rate: st.rate_num || 0,
    goal: st.goal_num || 80,
    color: (st.rate_num||0) >= (st.goal_num||80) ? "#10b981" : (st.rate_num||0) >= 50 ? "#f59e0b" : "#ef4444",
  }));

  // 월별 평균 추이 (3월부터)
  const MONTHS = ["3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const monthMap: Record<string, number[]> = {};
  students.forEach((st: any) => {
    st.trend?.forEach((t: any) => {
      let r = parseFloat(t.rate?.replace("%","") || "NaN");
      if (r <= 1) r *= 100;
      if (!isNaN(r)) { if (!monthMap[t.month]) monthMap[t.month] = []; monthMap[t.month].push(r); }
    });
  });
  const trendLine = MONTHS.filter(m => monthMap[m]).map(m => ({
    month: m,
    avg: Math.round(monthMap[m].reduce((a,b)=>a+b,0)/monthMap[m].length)
  }));

  // 의사결정 분포 pie
  const decCounts: Record<string, number> = {};
  students.forEach((st: any) => { const d = st.decision || "미결정"; decCounts[d] = (decCounts[d]||0)+1; });
  const decPie = Object.keys(decCounts).map(k => ({ name: k, value: decCounts[k] }));
  const decColors = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4"];

  // 달성/미달 월별 추이
  const achMap: Record<string, {ach:number,tot:number}> = {};
  students.forEach((st: any) => {
    st.trend?.forEach((t: any) => {
      if (!achMap[t.month]) achMap[t.month] = {ach:0,tot:0};
      achMap[t.month].tot++;
      let r = parseFloat(t.rate?.replace("%","") || "NaN");
      if (r<=1) r*=100;
      if (!isNaN(r) && r >= (st.goal_num||80)) achMap[t.month].ach++;
    });
  });
  const achLine = MONTHS.filter(m => achMap[m]).map(m => ({
    month: m,
    달성: achMap[m].ach,
    미달: achMap[m].tot - achMap[m].ach,
  }));

  return (
    <div style={{ marginBottom: 24 }}>
      {/* KPI 카드 */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12, marginBottom:14 }}>
        {[
          { label:"CICO 대상", val: s.total_students, unit:"명", sub: roster>0?`전체 ${roster}명 중 ${pct}%`:"", color:"#3b82f6" },
          { label:"평균 수행률", val: s.avg_rate, unit:"%", color: getRateColor(s.avg_rate) },
          { label:"목표 달성", val: s.achieved_count, unit:"명", color:"#10b981" },
          { label:"Tier1 하향 후보", val: tier1C, unit:"명", sub:"2개월 연속 달성(CICO단독)", color:"#10b981" },
          { label:"Tier3 상향 위험", val: tier3R, unit:"명", sub:"수행률 50% 미만", color:"#ef4444" },
        ].map((k,i) => (
          <div key={i} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:"14px 16px" }}>
            <div style={{ fontSize:"0.7rem", color:"#64748b", fontWeight:700, marginBottom:3 }}>{k.label}</div>
            <div style={{ fontSize:"1.6rem", fontWeight:900, color:k.color, lineHeight:1 }}>{k.val}<span style={{ fontSize:"0.75rem", color:"#94a3b8" }}>{k.unit}</span></div>
            {k.sub && <div style={{ fontSize:"0.6rem", color:"#94a3b8", marginTop:2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* 경보 배너 */}
      {(tier3R > 0 || modN > 0 || tier1C > 0) && (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
          {tier1C > 0 && <div style={{ flex:1, minWidth:200, padding:"8px 12px", background:"#d1fae5", borderRadius:10, border:"1px solid #6ee7b7", fontSize:"0.75rem", color:"#065f46", fontWeight:700 }}>🟢 Tier1 하향 후보 {tier1C}명 — 지원팀 최종 확인 필요</div>}
          {modN > 0 && <div style={{ flex:1, minWidth:200, padding:"8px 12px", background:"#fef3c7", borderRadius:10, border:"1px solid #fbbf24", fontSize:"0.75rem", color:"#92400e", fontWeight:700 }}>⚠️ CICO 수정 필요 {modN}명 — 목표행동·강화물 재검토</div>}
          {tier3R > 0 && <div style={{ flex:1, minWidth:200, padding:"8px 12px", background:"#fee2e2", borderRadius:10, border:"1px solid #fca5a5", fontSize:"0.75rem", color:"#991b1b", fontWeight:700 }}>🚨 Tier3 위험 {tier3R}명 — FBA·집중 지원 즉시 검토</div>}
        </div>
      )}

      {/* 차트 4개 2x2 */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {/* 1. 학생별 수행률 vs 목표 (grouped) */}
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:14 }}>
          <div style={{ fontWeight:700, fontSize:"0.83rem", color:"#0f172a", marginBottom:8 }}>👤 학생별 수행률 vs 목표 ({month}월)</div>
          <ResponsiveContainer width="100%" height={Math.max(160, barData.length*22)}>
            <BarChart data={barData} layout="vertical" margin={{ left:-8, right:36 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" domain={[0,100]} fontSize={10} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" fontSize={9} width={50} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any, n: string) => [`${v}%`, n==="rate"?"수행률":"목표"]} />
              <Bar dataKey="goal" name="목표" fill="#e2e8f0" radius={[0,4,4,0]} barSize={10} />
              <Bar dataKey="rate" name="수행률" radius={[0,4,4,0]} barSize={10}>
                {barData.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 2. 월별 평균 수행률 추이 */}
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:14 }}>
          <div style={{ fontWeight:700, fontSize:"0.83rem", color:"#0f172a", marginBottom:8 }}>📈 월별 평균 수행률 추이 (3월~)</div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={trendLine}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis domain={[0,100]} fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => [`${v}%`, "평균 수행률"]} />
              <Area type="monotone" dataKey="avg" fill="#6366f110" stroke="none" />
              <Line type="monotone" dataKey="avg" name="평균" stroke="#6366f1" strokeWidth={3} dot={{ r:4, fill:"#6366f1" }} />
            </ComposedChart>
          </ResponsiveContainer>
          {concurrent > 0 && <div style={{ marginTop:6, fontSize:"0.68rem", color:"#64748b", padding:"4px 8px", background:"#f8fafc", borderRadius:6, borderLeft:"3px solid #3b82f6" }}>ℹ️ {concurrent}명 SST/T3 병행 — 목표 달성 시에도 CICO 유지</div>}
        </div>

        {/* 3. 의사결정 분포 Pie */}
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:14 }}>
          <div style={{ fontWeight:700, fontSize:"0.83rem", color:"#0f172a", marginBottom:8 }}>🗂️ 의사결정 분포 ({month}월)</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={decPie} cx="50%" cy="50%" outerRadius={70} innerRadius={35} paddingAngle={3} dataKey="value" label={({name, percent}: any) => `${(percent*100).toFixed(0)}%`} labelLine={false} style={{ fontSize:"9px" }}>
                {decPie.map((_: any, i: number) => <Cell key={i} fill={decColors[i%decColors.length]} />)}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize:"10px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 4. 달성/미달 월별 추이 stacked bar */}
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:14 }}>
          <div style={{ fontWeight:700, fontSize:"0.83rem", color:"#0f172a", marginBottom:8 }}>📊 월별 달성·미달 추이</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={achLine}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize:"10px" }} />
              <Bar dataKey="달성" stackId="a" fill="#10b981" radius={[0,0,0,0]} />
              <Bar dataKey="미달" stackId="a" fill="#f59e0b" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

"""

# Replace lines sum_start to chart_start-1 with new_summary
new_lines = lines[:sum_start] + [new_summary] + lines[chart_start:]
with open(TIER2, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Done: {len(new_lines)} lines. sum_start={sum_start}, chart_start={chart_start}")
