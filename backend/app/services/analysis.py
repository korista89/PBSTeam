from app.services.sheets import fetch_all_records, fetch_student_codes
from app.schemas import BehaviorRecord
import pandas as pd
from typing import List, Dict
from app.services.ai_insight import generate_ai_insight

def get_analytics_data(start_date: str = None, end_date: str = None):
    raw_data = fetch_all_records()
    if not raw_data:
        return {"error": "No data found"}

    df = pd.DataFrame(raw_data)
    
    # --- Apply Masking (Phase 5) ---
    code_map = fetch_student_codes() # Returns {Name: Code}
    
    if '학생명' in df.columns and code_map:
        # replace names with codes if they exist in the map
        df['학생명'] = df['학생명'].apply(lambda x: code_map.get(x, x))
    
    # Ensure numeric columns are actually numeric
    if '강도' in df.columns:
        df['강도'] = pd.to_numeric(df['강도'], errors='coerce').fillna(0)
    if '발생빈도' in df.columns:
        df['발생빈도'] = pd.to_numeric(df['발생빈도'], errors='coerce').fillna(1) # Default to 1 if missing

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

    # 6. At Risk Students (Frequency >= 3 OR Intensity >= 5)
    at_risk_list = []
    if '학생명' in df.columns:
        # Group by Student
        student_groups = df.groupby('학생명')
        for name, group in student_groups:
            count = len(group)
            max_intensity = group['강도'].max()
            
            tier = "Tier 1"
            if count >= 6 or max_intensity >= 5:
                tier = "Tier 3"
            elif count >= 3:
                tier = "Tier 2"
            
            if tier != "Tier 1":
                at_risk_list.append({
                    "name": name,
                    "count": int(count),
                    "max_intensity": int(max_intensity),
                    "tier": tier,
                    "class": group['코드번호'].iloc[0] if '코드번호' in group.columns else "-" # Proxied Class/Code
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
                 "student": row.get('학생명', '-'),
                 "location": row.get('장소', '-'),
                 "type": row.get('행동유형', '-'),
                 "intensity": int(row.get('강도', 5))
             })




    
    # Calculate Summary Stats
    total_incidents = len(df)
    avg_intensity = float(df['강도'].mean()) if not df.empty and '강도' in df.columns else 0.0

    # Generate AI Insight
    ai_comment = generate_ai_insight(
        summary={"total_incidents": total_incidents, "risk_student_count": len(at_risk_list)},
        trends=[], # Simplified for now
        risk_list=at_risk_list
    )

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
        "ai_comment": ai_comment
    }


def get_student_analytics(student_name: str):
    raw_data = fetch_all_records()
    if not raw_data:
        return {"error": "No data found"}
    
    df = pd.DataFrame(raw_data)
    # Filter by student name
    # Using simple filtering. In production, use ID preferably.
    if '학생명' not in df.columns:
        return {"error": "Student name column missing"}
        
    student_df = df[df['학생명'] == student_name].copy()
    
    if student_df.empty:
        return {"error": "Student not found"}

    # Numeric conversion
    if '강도' in student_df.columns:
        student_df['강도'] = pd.to_numeric(student_df['강도'], errors='coerce').fillna(0)
    
    # -- Profile Info --
    total_incidents = len(student_df)
    avg_intensity = float(student_df['강도'].mean()) if not student_df.empty else 0
    student_class = student_df['코드번호'].iloc[0] if '코드번호' in student_df.columns else "-"
    
    # Tier Calculation
    tier = "Tier 1"
    if total_incidents >= 6 or student_df['강도'].max() >= 5:
        tier = "Tier 3"
    elif total_incidents >= 3:
        tier = "Tier 2"

    # -- ABC Analysis (Scatter Plot: Time vs Location vs Antecedent) --
    # Simplified ABC: X=Time, Y=Location, Size=Intensity, Color=Function (Proxy for Antecedent/Consequence)
    abc_data = []
    if '시간대' in student_df.columns and '장소' in student_df.columns:
        for _, row in student_df.iterrows():
            abc_data.append({
                "x": row.get('시간대', 'Unknown'),
                "y": row.get('장소', 'Unknown'),
                "z": int(row.get('강도', 1)), # Size
                "function": row.get('기능', 'Unknown')
            })
            
    # -- Function Pie --
    function_stats = []
    if '기능' in student_df.columns:
        f_counts = student_df['기능'].value_counts()
        function_stats = [{"name": k, "value": int(v)} for k, v in f_counts.items()]

    # -- CICO Trend (Daily Counts) --
    cico_trend = []
    if '행동발생 날짜' in student_df.columns:
        d_counts = student_df['행동발생 날짜'].value_counts().sort_index()
        cico_trend = [{"date": k, "count": int(v)} for k, v in d_counts.items()]

    return {
        "profile": {
            "name": student_name,
            "class": student_class,
            "tier": tier,
            "total_incidents": total_incidents,
            "avg_intensity": avg_intensity
        },
        "abc_data": abc_data,
        "functions": function_stats,
        "cico_trend": cico_trend
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
