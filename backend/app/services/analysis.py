from app.services.sheets import fetch_all_records, fetch_student_codes, get_beable_code_mapping, fetch_student_status, get_enrolled_student_count
from app.schemas import BehaviorRecord
import pandas as pd
from typing import List, Dict
from app.services.ai_insight import generate_ai_insight, generate_meeting_agent_report

def get_analytics_data(start_date: str = None, end_date: str = None):
    raw_data = fetch_all_records()
    if not raw_data:
        return {"error": "No data found"}

    df = pd.DataFrame(raw_data)
    
    # --- Get BeAble code mapping (only enrolled students with BeAble codes in TierStatus) ---
    beable_mapping = get_beable_code_mapping()  # {beable_code: {'student_code': '1011', ...}}
    
    # beable_mapping keys are BeAble codes from TierStatus
    valid_beable_codes = set(beable_mapping.keys())
    
    # Create BeAble to student code lookup for display
    beable_to_student_code = {k: v['student_code'] for k, v in beable_mapping.items()}
    
    # --- Filter: Only include records where 코드번호 (BeAble code in 시트1) is in TierStatus ---
    if '코드번호' in df.columns:
        # Filter: keep only rows where 코드번호 (BeAble code) is in valid_beable_codes
        df = df[df['코드번호'].astype(str).isin(valid_beable_codes)]
        # Convert BeAble code to 4-digit student code for display
        df['학생코드'] = df['코드번호'].astype(str).apply(lambda x: beable_to_student_code.get(x, x))
    else:
        df['학생코드'] = '-'
    
    # Ensure numeric columns are actually numeric
    if '강도' in df.columns:
        df['강도'] = pd.to_numeric(df['강도'], errors='coerce').fillna(0)
    if '발생빈도' in df.columns:
        df['발생빈도'] = pd.to_numeric(df['발생빈도'], errors='coerce').fillna(1)

    # --- Date Filtering ---
    if '행동발생 날짜' in df.columns:
        df['date_obj'] = pd.to_datetime(df['행동발생 날짜'], errors='coerce')
        
        if start_date:
            df = df[df['date_obj'] >= pd.to_datetime(start_date)]
        if end_date:
            df = df[df['date_obj'] <= pd.to_datetime(end_date)]
    
    # --- Tier 1: Big 5 Analysis ---
        # Group by Month-Year or just Date based on range. Let's do Weekly/Daily for now as requested "Weekly Trend"
        # For the dashboard chart, we often want recent daily trend or monthly trend.
        # Let's provide Daily trend for the last 30 entries or similar
        date_counts = df['행동발생 날짜'].value_counts().sort_index().to_dict()
    else:
        date_counts = {}

    # 3. Location Stats (Big 5)
    location_stats = []
    if '장소' in df.columns:
        loc_counts = df['장소'].value_counts()
        location_stats = [{"name": k, "value": int(v)} for k, v in loc_counts.items()]

    # 4. Time Stats (Big 5)
    time_stats = []
    if '시간대' in df.columns:
        t_counts = df['시간대'].value_counts()
        # You might want to sort these logically (1교시, 2교시...) but for now frequency sort or alphanumeric
        time_stats = [{"name": k, "value": int(v)} for k, v in t_counts.items()]

    # 5. Behavior Type Stats (Big 5)
    behavior_stats = []
    if '행동유형' in df.columns:
        b_counts = df['행동유형'].value_counts()
        behavior_stats = [{"name": k, "value": int(v)} for k, v in b_counts.items()]

    # --- Tier 2: Screening & Hot Spots ---

    # 6. At Risk Students (Frequency >= 3 OR Intensity >= 5) - Use 학생코드
    at_risk_list = []
    if '학생코드' in df.columns:
        # Group by Student Code (4-digit)
        student_groups = df.groupby('학생코드')
        for student_code, group in student_groups:
            count = len(group)
            max_intensity = group['강도'].max()
            
            tier = "Tier 1"
            if count >= 6 or max_intensity >= 5:
                tier = "Tier 3"
            elif count >= 3:
                tier = "Tier 2"
            
            if tier != "Tier 1":
                at_risk_list.append({
                    "name": str(student_code),  # 4-digit student code
                    "count": int(count),
                    "max_intensity": int(max_intensity),
                    "tier": tier,
                    "class": group['코드번호'].iloc[0] if '코드번호' in group.columns else "-"
                })
    
    # Sort risk list by Tier (desc) then Count (desc)
    at_risk_list.sort(key=lambda x: (x['tier'], x['count']), reverse=True)

    # 7. Function Analysis (Why?)
    function_stats = []
    if '기능' in df.columns:
        f_counts = df['기능'].value_counts()
        function_stats = [{"name": k, "value": int(v)} for k, v in f_counts.items()]

    # 8. Heatmap (Location x Time) - Hotspot Analysis
    heatmap_data = []
    if '장소' in df.columns and '시간대' in df.columns:
        ct = pd.crosstab(df['장소'], df['시간대'])
        for loc in ct.index:
            for time in ct.columns:
                val = ct.loc[loc, time]
                if val > 0:
                    heatmap_data.append({
                        "y": loc,
                        "x": time,
                        "value": int(val)
                    })

    # --- Tier 3: Safety Alerts (Intensity >= 5) ---
    safety_alerts = []
    if '강도' in df.columns:
        high_intensity_df = df[df['강도'] >= 5]
        # Sort by date desc
        if '행동발생 날짜' in high_intensity_df.columns:
            # high_intensity_df.sort_values(by='행동발생 날짜', ascending=False, inplace=True)
            pass
        
        for _, row in high_intensity_df.iterrows():
             safety_alerts.append({
                 "date": row.get('행동발생 날짜', '-'),
                 "student": row.get('학생코드', row.get('학생명', '-')),  # Use 4-digit student code
                 "location": row.get('장소', '-'),
                 "type": row.get('행동유형', '-'),
                 "intensity": int(row.get('강도', 5))
             })




    
    # Calculate Summary Stats
    total_incidents = len(df)
    avg_intensity = float(df['강도'].mean()) if not df.empty and '강도' in df.columns else 0.0

    # Generate AI Insight with enriched tier data
    try:
        all_status = fetch_student_status()
        enrolled_count = get_enrolled_student_count()
        enrolled_students = [s for s in all_status if s.get('재학여부') == 'O']
        
        t1_count = len([s for s in enrolled_students if s.get('Tier1') == 'O' and s.get('Tier2(CICO)') != 'O' and s.get('Tier2(SST)') != 'O' and s.get('Tier3') != 'O' and s.get('Tier3+') != 'O'])
        t2c_count = len([s for s in enrolled_students if s.get('Tier2(CICO)') == 'O'])
        t2c_pure = len([s for s in enrolled_students if s.get('Tier2(CICO)') == 'O' and s.get('Tier3') != 'O' and s.get('Tier3+') != 'O'])
        t2s_count = len([s for s in enrolled_students if s.get('Tier2(SST)') == 'O'])
        t3_count = len([s for s in enrolled_students if s.get('Tier3') == 'O'])
        t3p_count = len([s for s in enrolled_students if s.get('Tier3+') == 'O'])
        
        pct = lambda c: round((c / enrolled_count * 100), 1) if enrolled_count > 0 else 0
        
        tier_stats = {
            "enrolled": enrolled_count,
            "tier1": {"count": t1_count, "pct": pct(t1_count)},
            "tier2_cico": {"count": t2c_count, "pct": pct(t2c_count), "pure": t2c_pure},
            "tier2_sst": {"count": t2s_count, "pct": pct(t2s_count)},
            "tier3": {"count": t3_count, "pct": pct(t3_count)},
            "tier3_plus": {"count": t3p_count, "pct": pct(t3p_count)},
        }
    except Exception:
        tier_stats = None

    ai_report = generate_meeting_agent_report(
        summary={"total_incidents": total_incidents, "risk_student_count": len(at_risk_list)},
        trends=[],
        risk_list=at_risk_list,
        tier_stats=tier_stats
    )
    ai_comment = ai_report.get("briefing_text", "")

    return {
        "summary": {
            "total_incidents": total_incidents,
            "avg_intensity": avg_intensity,
            "risk_student_count": len(at_risk_list)
        },
        "trends": [{"date": k, "count": v} for k, v in date_counts.items()],
        "big5": {
            "locations": location_stats,
            "times": time_stats,
            "behaviors": behavior_stats
        },
        "risk_list": at_risk_list,
        "functions": function_stats,
        "heatmap": heatmap_data,
        "safety_alerts": safety_alerts,
        "ai_comment": ai_comment,
        "ai_report": ai_report
    }


def get_student_analytics(student_name: str, start_date: str = None, end_date: str = None):
    raw_data = fetch_all_records()
    if not raw_data:
        return {"error": "No data found"}
    
    df = pd.DataFrame(raw_data)
    if '학생명' not in df.columns:
        return {"error": "Student name column missing"}
    
    # Strategy 1: Direct search by 학생명
    student_df = df[df['학생명'] == student_name].copy()
    resolved_name = student_name
    resolved_code = "-"
    
    # Strategy 2: If name not found, the input might be a student code (e.g. "2611")
    if student_df.empty and '코드번호' in df.columns:
        beable_mapping = get_beable_code_mapping()
        reverse_map = {}
        for beable_code, info in beable_mapping.items():
            sc = info.get('student_code', '')
            if sc:
                reverse_map[str(sc).strip()] = beable_code
        
        beable_code = reverse_map.get(str(student_name).strip(), '')
        if beable_code:
            student_df = df[df['코드번호'] == beable_code].copy()
            resolved_code = str(student_name).strip()
            if not student_df.empty:
                resolved_name = student_df['학생명'].iloc[0]
    
    # Strategy 3: Try partial match
    if student_df.empty:
        student_df = df[df['학생명'].str.contains(student_name, na=False)].copy()
        if not student_df.empty:
            resolved_name = student_df['학생명'].iloc[0]
    
    empty_result = {
        "profile": {
            "name": student_name, "student_code": student_name,
            "class": "-", "tier": "Tier 1", "total_incidents": 0, "avg_intensity": 0
        },
        "abc_data": [], "functions": [], "cico_trend": [], "weekly_trend": [],
        "behavior_types": [], "location_stats": [], "time_stats": [],
        "weekday_dist": [], "monthly_trend": [], "daily_intensity": [],
        "separation_stats": [], "daily_report_freq": [], "monthly_report_freq": []
    }
    
    if student_df.empty:
        return empty_result

    # Numeric conversion
    if '강도' in student_df.columns:
        student_df['강도'] = pd.to_numeric(student_df['강도'], errors='coerce').fillna(0)
    
    # Date parsing & filtering
    if '행동발생 날짜' in student_df.columns:
        student_df['date_obj'] = pd.to_datetime(student_df['행동발생 날짜'], errors='coerce')
        if start_date:
            student_df = student_df[student_df['date_obj'] >= pd.to_datetime(start_date)]
        if end_date:
            student_df = student_df[student_df['date_obj'] <= pd.to_datetime(end_date)]
    
    if student_df.empty:
        empty_result["profile"]["name"] = resolved_name
        empty_result["profile"]["student_code"] = resolved_code if resolved_code != "-" else student_name
        return empty_result

    # -- Profile Info --
    total_incidents = len(student_df)
    avg_intensity = float(student_df['강도'].mean()) if not student_df.empty else 0
    student_class = student_df['코드번호'].iloc[0] if '코드번호' in student_df.columns else "-"
    
    tier = "Tier 1"
    if total_incidents >= 6 or student_df['강도'].max() >= 5:
        tier = "Tier 3"
    elif total_incidents >= 3:
        tier = "Tier 2"

    # -- ABC Analysis --
    abc_data = []
    if '시간대' in student_df.columns and '장소' in student_df.columns:
        for _, row in student_df.iterrows():
            abc_data.append({
                "x": row.get('시간대', 'Unknown'),
                "y": row.get('장소', 'Unknown'),
                "z": int(row.get('강도', 1)),
                "function": row.get('기능', 'Unknown')
            })
            
    # -- Function Stats --
    function_stats = []
    if '기능' in student_df.columns:
        f_counts = student_df['기능'].value_counts()
        function_stats = [{"name": k, "value": int(v)} for k, v in f_counts.items()]

    # -- Daily CICO Trend --
    cico_trend = []
    if '행동발생 날짜' in student_df.columns:
        d_counts = student_df['행동발생 날짜'].value_counts().sort_index()
        cico_trend = [{"date": k, "count": int(v)} for k, v in d_counts.items()]

    # -- Weekly Trend --
    weekly_trend = []
    if 'date_obj' in student_df.columns:
        student_df['week'] = student_df['date_obj'].dt.isocalendar().week.astype(int)
        student_df['year'] = student_df['date_obj'].dt.year
        w_counts = student_df.groupby(['year', 'week']).size().reset_index(name='count')
        for _, row in w_counts.iterrows():
            weekly_trend.append({"week": f"{int(row['year'])}-W{int(row['week']):02d}", "count": int(row['count'])})

    # -- Behavior Type Stats --
    behavior_types = []
    if '행동유형' in student_df.columns:
        b_counts = student_df['행동유형'].value_counts()
        behavior_types = [{"name": k, "value": int(v)} for k, v in b_counts.items()]

    # -- Location Stats --
    location_stats = []
    if '장소' in student_df.columns:
        l_counts = student_df['장소'].value_counts()
        location_stats = [{"name": k, "value": int(v)} for k, v in l_counts.items()]

    # -- Time Distribution --
    time_stats = []
    if '시간대' in student_df.columns:
        t_counts = student_df['시간대'].value_counts()
        time_stats = [{"name": k, "value": int(v)} for k, v in t_counts.items()]

    # -- Weekday Distribution --
    weekday_dist = []
    weekday_names = ['월', '화', '수', '목', '금', '토', '일']
    if 'date_obj' in student_df.columns:
        student_df['weekday'] = student_df['date_obj'].dt.dayofweek
        wd_counts = student_df['weekday'].value_counts().sort_index()
        for wd, cnt in wd_counts.items():
            weekday_dist.append({"name": weekday_names[int(wd)] if int(wd) < 7 else str(wd), "value": int(cnt)})

    # -- Monthly Trend --
    monthly_trend = []
    if 'date_obj' in student_df.columns:
        student_df['month_label'] = student_df['date_obj'].dt.strftime('%Y-%m')
        m_counts = student_df.groupby('month_label').size().reset_index(name='count')
        monthly_trend = [{"month": row['month_label'], "count": int(row['count'])} for _, row in m_counts.iterrows()]

    # -- Daily Intensity --
    daily_intensity = []
    if '행동발생 날짜' in student_df.columns and '강도' in student_df.columns:
        d_intensity = student_df.groupby('행동발생 날짜')['강도'].mean().sort_index()
        daily_intensity = [{"date": k, "intensity": round(float(v), 1)} for k, v in d_intensity.items()]

    # -- Separation (분리지도) Stats --
    separation_stats = []
    if '분리지도 여부' in student_df.columns and 'date_obj' in student_df.columns:
        student_df['sep_month'] = student_df['date_obj'].dt.strftime('%Y-%m')
        sep_df = student_df[student_df['분리지도 여부'] == 'O']
        if not sep_df.empty:
            s_counts = sep_df.groupby('sep_month').size().reset_index(name='count')
            separation_stats = [{"month": row['sep_month'], "count": int(row['count'])} for _, row in s_counts.iterrows()]

    # -- Daily Report Frequency (일별 행동발생 보고 빈도) --
    daily_report_freq = []
    if '입력일' in student_df.columns:
        r_counts = student_df['입력일'].value_counts().sort_index()
        daily_report_freq = [{"date": k, "count": int(v)} for k, v in r_counts.items()]

    # -- Monthly Report Frequency (월별 행동발생 보고 빈도) --
    monthly_report_freq = []
    if 'date_obj' in student_df.columns:
        student_df['report_month'] = student_df['date_obj'].dt.strftime('%Y-%m')
        mr_counts = student_df.groupby('report_month').size().reset_index(name='count')
        monthly_report_freq = [{"month": row['report_month'], "count": int(row['count'])} for _, row in mr_counts.iterrows()]

    # -- Get Student Code --
    student_code_val = resolved_code if resolved_code != "-" else "-"
    if student_code_val == "-" and '코드번호' in student_df.columns:
        beable_mapping = get_beable_code_mapping()
        beable_code = str(student_df['코드번호'].iloc[0]).strip()
        if beable_code in beable_mapping:
            student_code_val = beable_mapping[beable_code]['student_code']
    
    return {
        "profile": {
            "name": resolved_name,
            "student_code": student_code_val,
            "class": student_class,
            "tier": tier,
            "total_incidents": total_incidents,
            "avg_intensity": avg_intensity
        },
        "abc_data": abc_data,
        "functions": function_stats,
        "cico_trend": cico_trend,
        "weekly_trend": weekly_trend,
        "behavior_types": behavior_types,
        "location_stats": location_stats,
        "time_stats": time_stats,
        "weekday_dist": weekday_dist,
        "monthly_trend": monthly_trend,
        "daily_intensity": daily_intensity,
        "separation_stats": separation_stats,
        "daily_report_freq": daily_report_freq,
        "monthly_report_freq": monthly_report_freq
    }

from datetime import timedelta, datetime

def analyze_meeting_data(target_date: str = None):
    # Default: Last 4 weeks from today (or target date)
    if not target_date:
        end_dt = datetime.now()
    else:
        end_dt = pd.to_datetime(target_date)
    
    start_dt = end_dt - timedelta(days=28) # 4 weeks
    
    raw_data = fetch_all_records()
    if not raw_data:
        return {"error": "No data found"}

    df = pd.DataFrame(raw_data)
    
    # Preprocessing
    if '행동발생 날짜' in df.columns:
        df['date_obj'] = pd.to_datetime(df['행동발생 날짜'], errors='coerce')
        # Filter for last 4 weeks
        df = df[(df['date_obj'] >= start_dt) & (df['date_obj'] <= end_dt)]
    
    if '강도' in df.columns:
        df['강도'] = pd.to_numeric(df['강도'], errors='coerce').fillna(0)

    # --- Decision Algorithm ---
    student_analysis = []
    
    if '학생명' in df.columns:
        for name, group in df.groupby('학생명'):
            # 1. Emergency Check (Red Line)
            # Criteria: Intensity >= 5 OR Keywords in Type/Note (Restraint, Injury)
            is_emergency = False
            emergency_reason = []
            
            # Check Intensity
            if (group['강도'] >= 5).any():
                is_emergency = True
                emergency_reason.append("강도 5 (고위험)")

            # Check Keywords (Simulation: assuming '행동유형' or '비고' might contain them)
            # Ideally user adds 'Physical Restraint' column. checking '행동유형' for now.
            if '행동유형' in group.columns:
                 restraint_mask = group['행동유형'].astype(str).str.contains('제지|상해', regex=True)
                 if restraint_mask.any():
                     is_emergency = True
                     emergency_reason.append("신체 상해/물리적 제지 키워드 감지")
            
            # 2. Tier 2 Entry Check
            # Criteria: 2 consecutive weeks with >= 2 incidents
            is_tier2_candidate = False
            
            # Resample to weekly counts (W-MON: Weekly starting Monday)
            group.set_index('date_obj', inplace=True)
            weekly_counts = group.resample('W-MON').size()
            
            consecutive_weeks = 0
            for count in weekly_counts:
                if count >= 2:
                    consecutive_weeks += 1
                else:
                    consecutive_weeks = 0
                
                if consecutive_weeks >= 2:
                    is_tier2_candidate = True
                    break
            
            # 3. Current Tier Status (Mock - need DB for real state)
            # Default to Tier 1 unless we find a way to store state
            current_tier = "Tier 1"
            
            # 4. Teacher Opinion (Placeholder - to be fetched from DB or Sheet)
            teacher_opinion = ""

            # 5. CICO Data (Placeholder)
            cico_avg = 0 # Mock
            
            student_analysis.append({
                "name": name,
                "class": group['코드번호'].iloc[0] if '코드번호' in group.columns else "-",
                "total_incidents": len(group),
                "weekly_avg": round(len(group) / 4, 1),
                "is_emergency": is_emergency,
                "emergency_reason": ", ".join(emergency_reason),
                "is_tier2_candidate": is_tier2_candidate,
                "decision_recommendation": "Tier 3 (Immediate)" if is_emergency else ("Tier 2 (Entry)" if is_tier2_candidate else "Maintain Tier 1")
            })

    # Sort: Emergency -> Tier 2 Candidate -> Regular
    # Custom sort key
    def sort_key(x):
        if x['is_emergency']: return 0
        if x['is_tier2_candidate']: return 1
        return 2

    student_analysis.sort(key=sort_key)

    return {
        "period": f"{start_dt.strftime('%Y-%m-%d')} ~ {end_dt.strftime('%Y-%m-%d')}",
        "students": student_analysis,
        "summary": {
            "emergency_count": sum(1 for x in student_analysis if x['is_emergency']),
            "tier2_candidate_count": sum(1 for x in student_analysis if x['is_tier2_candidate'])
        }
    }
