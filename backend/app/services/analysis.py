from app.services.sheets import fetch_all_records, fetch_student_codes, get_beable_code_mapping, fetch_student_status, get_enrolled_student_count
from app.schemas import BehaviorRecord
import pandas as pd
import re
from typing import List, Dict
from app.services.ai_insight import generate_ai_insight, generate_meeting_agent_report

def extract_numeric(val, default=0):
    if pd.isna(val):
        return default
    match = re.search(r'^\s*(\d+)', str(val))
    if match:
        return float(match.group(1))
    # Fallback to pure digits anywhere
    match = re.search(r'(\d+)', str(val))
    if match:
        return float(match.group(1))
    return default

def robust_parse_dates(date_series):
    import pandas as pd
    cleaned = date_series.astype(str).replace(r'[^\d]+', '-', regex=True).str.strip('-')
    return pd.to_datetime(cleaned, errors='coerce')

def sort_time_slots(slots):
    """Sort time slots like '09:00', '10:00', '오전 9시' chronologically."""
    def parse_time(name):
        # Extract digits
        digit_match = re.search(r'(\d+)', name)
        if not digit_match:
            return 99 # Push invalid to end
        hour = int(digit_match.group(1))
        
        # Handle Korean AM/PM
        if '오후' in name and hour < 12:
            hour += 12
        elif '오전' in name and hour == 12:
            hour = 0
        return hour
    
    return sorted(slots, key=lambda x: parse_time(x['name']))

def get_analytics_data(start_date: str = None, end_date: str = None, class_id: str = None):
    raw_data = fetch_all_records()
    
    empty_res = {
        "summary": {"total_incidents": 0, "avg_intensity": 0, "risk_student_count": 0},
        "trends": [], "weekly_trends": [],
        "big5": {"locations": [], "times": [], "behaviors": [], "weekdays": []},
        "risk_list": [], "functions": [], "antecedents": [], "consequences": [],
        "heatmap": [], "safety_alerts": [], "ai_comment": "데이터가 없습니다."
    }

    if not raw_data:
        return empty_res

    df = pd.DataFrame(raw_data)
    
    # 2. Get BeAble code mapping
    beable_mapping = get_beable_code_mapping()
    
    # 3. Filter & Map Data
    # Use '학생코드' (4-digit) as primary, fallback to name
    def resolve_student_info(row):
        # Primary Student Code
        s_code = str(row.get('학생코드', '')).strip()
        
        # In our updated system, beable_to_info might have BeAble OR student_code as key.
        # But we know info dict ALWAYS has 'student_code'.
        # Let's find the matching info directly by its inner 'student_code' property.
        if s_code:
            for info in beable_mapping.values():
                if info.get('student_code') == s_code:
                    return info
            
        # Fallback to pure Name mapping
        s_name = str(row.get('학생명', '')).strip()
        for info in beable_mapping.values():
            if info.get('student_name') == s_name:
                return info
        return None

    resolved_records = []
    for _, row in df.iterrows():
        info = resolve_student_info(row)
        new_row = row.to_dict()
        if info:
            new_row['student_code'] = info['student_code']
            new_row['student_name_labeled'] = info.get('student_name', info['student_code'])
        else:
            raw_name = str(row.get('학생명', '')).strip()
            new_row['student_code'] = raw_name if raw_name else "Unknown"
            new_row['student_name_labeled'] = raw_name if raw_name else "Unknown"
            
        resolved_records.append(new_row)
    
    if not resolved_records:
        return empty_res

    df = pd.DataFrame(resolved_records)
    # Ensure columns exist for downstream logic
    if '학생코드' not in df.columns:
        df['학생코드'] = df['student_code']
    
    # Ensure numeric columns are actually numeric using regex extraction
    if '강도' in df.columns:
        df['강도'] = df['강도'].apply(lambda x: extract_numeric(x, 0))
    if '발생빈도' in df.columns:
        df['발생빈도'] = df['발생빈도'].apply(lambda x: extract_numeric(x, 1))
    else:
        df['발생빈도'] = 1

    # --- Date Filtering ---
    if '행동발생 날짜' in df.columns:
        df['date_obj'] = robust_parse_dates(df['행동발생 날짜'])
        
        if start_date:
            df = df[df['date_obj'] >= pd.to_datetime(start_date)]
        if end_date:
            df = df[df['date_obj'] <= pd.to_datetime(end_date)]
            
    # --- Class Filtering ---
    if class_id and not df.empty:
        # Filter by student_code starting with class_id
        df = df[df['student_code'].str.startswith(str(class_id), na=False)]
    
    # --- Tier 1: Big 5 Analysis ---
    if not df.empty:
        # Daily trend: count form submissions per date (not frequency sum)
        date_counts = df.groupby('행동발생 날짜').size().sort_index().to_dict()
        
        # Weekly Trend: count submissions per week
        weekly_counts = {}
        if 'date_obj' in df.columns:
            df['week'] = df['date_obj'].dt.isocalendar().week.fillna(-1).astype(int)
            df['year'] = df['date_obj'].dt.year.fillna(-1).astype(int)
            # Filter valid dates for weekly
            valid_df = df[df['year'] > 0]
            w_grouped = valid_df.groupby(['year', 'week']).size()  # count rows
            for (y, w), count in w_grouped.items():
                label = f"{y}-W{w:02d}"
                weekly_counts[label] = int(count)
    else:
        date_counts = {}
        weekly_counts = {}

    # 3. Location Stats (Big 5) - count submissions per location
    location_stats = []
    if '장소' in df.columns:
        loc_counts = df.groupby('장소').size().sort_values(ascending=False).head(10)
        location_stats = [{"name": k, "value": int(v)} for k, v in loc_counts.items()]

    # 4. Time Stats (Big 5) - count submissions per time slot
    time_stats = []
    if '시간대' in df.columns:
        t_counts = df.groupby('시간대').size()
        time_stats = sort_time_slots([{"name": k, "value": int(v)} for k, v in t_counts.items()])

    # 5. Behavior Type Stats (Big 5) - count submissions per behavior type
    behavior_stats = []
    if '행동유형' in df.columns:
        b_counts = df.groupby('행동유형').size().sort_values(ascending=False).head(5)
        behavior_stats = [{"name": k, "value": int(v)} for k, v in b_counts.items()]

    # --- Tier 2: Screening & Hot Spots ---

    # 6. At Risk Students (Frequency >= 3 OR Intensity >= 5) - Use 학생코드
    at_risk_list = []
    # Cache TierStatus for class lookup
    tier_status_cache = {}
    try:
        for s in fetch_student_status():
            code = str(s.get('학생코드', '')).strip()
            if code:
                tier_status_cache[code] = s.get('학급', '-')
    except Exception:
        pass
    
    if '학생코드' in df.columns:
        # Group by Student Code (4-digit), sum 발생빈도 for accurate PBIS incident count
        student_groups = df.groupby('학생코드')
        for student_code, group in student_groups:
            freq_count = len(group)  # PBIS: number of submissions (report frequency)
            max_intensity = group['강도'].max()
            
            tier = "Tier 1"
            if freq_count >= 6 or max_intensity >= 5:
                tier = "Tier 3"
            elif freq_count >= 3:
                tier = "Tier 2"
            
            if tier != "Tier 1":
                student_name_label = group['student_name_labeled'].iloc[0] if 'student_name_labeled' in group.columns else str(student_code)
                at_risk_list.append({
                    "name": student_name_label,
                    "student_code": str(student_code),
                    "count": freq_count,
                    "max_intensity": int(max_intensity),
                    "tier": tier,
                    "class": tier_status_cache.get(str(student_code), '-')
                })
    
    # Sort risk list by Tier (desc) then Count (desc)
    at_risk_list.sort(key=lambda x: (x['tier'], x['count']), reverse=True)

    # 7. Function Analysis (Why?) - row count
    function_stats = []
    if '기능' in df.columns:
        f_counts = df.groupby('기능').size().sort_values(ascending=False)
        function_stats = [{"name": k, "value": int(v)} for k, v in f_counts.items()]

    # 8. Heatmap (Location x Time) - Hotspot Analysis using row count
    heatmap_data = []
    if '장소' in df.columns and '시간대' in df.columns:
        ct = df.groupby(['장소', '시간대']).size().unstack(fill_value=0)
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




    
    # Summary Stats — use ROW COUNT (= number of form submissions, not frequency sum)
    total_incidents = len(df)
    
    # Calculate daily average
    daily_avg = 0.0
    if start_date and end_date:
        try:
            d1 = pd.to_datetime(start_date)
            d2 = pd.to_datetime(end_date)
            days = (d2 - d1).days + 1
            if days > 0:
                daily_avg = round(total_incidents / days, 1)
        except Exception:
            pass
    elif not df.empty and 'date_obj' in df.columns:
        # Fallback to unique dates if range not provided
        days = df['date_obj'].nunique()
        if days > 0:
            daily_avg = round(total_incidents / days, 1)

    # Unweighted average intensity (mean across all submission rows)
    avg_intensity = float(df['강도'].mean()) if not df.empty and '강도' in df.columns else 0.0
    avg_intensity = round(avg_intensity, 2)
        
    risk_student_count = len(at_risk_list)
    # 9. Weekday Analysis - count submissions per weekday
    weekday_stats = []
    weekday_names = ['월', '화', '수', '목', '금', '토', '일']
    if 'date_obj' in df.columns:
        df['weekday'] = df['date_obj'].dt.dayofweek
        wd_counts = df.groupby('weekday').size().sort_index()  # row count
        for wd, cnt in wd_counts.items():
             name = weekday_names[int(wd)] if int(wd) < 7 else str(wd)
             weekday_stats.append({"name": name, "value": int(cnt)})

    # 10. Intensity Distribution (Replacing Antecedent)
    intensity_dist = []
    if '강도' in df.columns:
        i_counts = df.groupby('강도').size().sort_index()
        intensity_dist = [{"name": f"강도 {int(k)}", "value": int(v)} for k, v in i_counts.items()]

    # 11. Monthly Intensity Trend (Replacing Consequence)
    intensity_trend = []
    if 'date_obj' in df.columns and '강도' in df.columns:
        df['month_label'] = df['date_obj'].dt.strftime('%Y-%m')
        # Average intensity per month
        m_intensity = df.groupby('month_label')['강도'].mean().reset_index()
        intensity_trend = [{"month": row['month_label'], "value": round(float(row['강도']), 2)} for _, row in m_intensity.iterrows()]


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

    # Monthly trend — row count per month (for monthly bar chart)
    monthly_trend = []
    if 'date_obj' in df.columns:
        df['month_label'] = df['date_obj'].dt.strftime('%Y-%m')
        m_counts = df.groupby('month_label').size().reset_index(name='count')
        monthly_trend = [{"month": row['month_label'], "count": int(row['count'])} for _, row in m_counts.iterrows()]

    # Build tier_distribution for donut chart
    tier_distribution = []
    if tier_stats:
        enr = tier_stats["enrolled"]
        t1 = tier_stats["tier1"]["count"]
        t2c = tier_stats["tier2_cico"]["pure"]
        t2s = tier_stats["tier2_sst"]["count"]
        t3 = tier_stats["tier3"]["count"]
        t3p = tier_stats["tier3_plus"]["count"]
        tier_distribution = [
            {"name": "Tier 1 (보편)", "value": t1, "color": "#22c55e"},
            {"name": "Tier 2-CICO (선별)", "value": t2c, "color": "#f59e0b"},
            {"name": "Tier 2-SST (집중)", "value": t2s, "color": "#f97316"},
            {"name": "Tier 3 (개별집중)", "value": t3, "color": "#ef4444"},
            {"name": "Tier 3+ (위기)", "value": t3p, "color": "#7c3aed"},
        ]
        tier_distribution = [t for t in tier_distribution if t["value"] > 0]

    return {
        "summary": {
            "total_incidents": total_incidents,
            "daily_avg": daily_avg,
            "avg_intensity": avg_intensity,
            "risk_student_count": risk_student_count,
            "enrolled_count": tier_stats["enrolled"] if tier_stats else 0,
        },
        "trends": [{"date": k, "count": v} for k, v in date_counts.items()],
        "weekly_trends": [{"week": k, "count": v} for k, v in weekly_counts.items()],
        "monthly_trend": monthly_trend,
        "tier_distribution": tier_distribution,
        "big5": {
            "locations": location_stats,
            "times": time_stats,
            "behaviors": behavior_stats,
            "weekdays": weekday_stats
        },
        "risk_list": at_risk_list,
        "functions": function_stats,
        "intensity_distribution": intensity_dist,
        "intensity_trend": intensity_trend,
        "heatmap": heatmap_data,
        "safety_alerts": safety_alerts,
        "ai_comment": ai_comment,
        "ai_report": ai_report
    }


def get_student_analytics(student_name: str, start_date: str = None, end_date: str = None):
    raw_data = fetch_all_records()
    if not raw_data:
        return {
            "profile": {"name": student_name, "student_code": "-", "class": "-", "tier": "Tier 1", "total_incidents": 0, "avg_intensity": 0},
            "abc_data": [], "functions": [], "cico_trend": [], "weekly_trend": [],
            "behavior_types": [], "location_stats": [], "time_stats": [],
            "weekday_dist": [], "monthly_trend": [], "daily_intensity": [],
            "separation_stats": [], "daily_report_freq": [], "monthly_report_freq": []
        }
    
    df = pd.DataFrame(raw_data)
    if '학생명' not in df.columns:
        return {"error": "Student name column missing"}
    
    student_df = pd.DataFrame()  # Ensures it's always initialized
    resolved_name = student_name
    resolved_code = "-"

    # Strategy 1: Try exact match on '학생코드' (4-digit code) if input is numeric
    if student_name.isdigit() and len(student_name) == 4 and '학생코드' in df.columns:
        student_df = df[df['학생코드'] == student_name].copy()
        resolved_code = student_name
        resolved_name = student_df['학생명'].iloc[0] if not student_df.empty else student_name
    
    # Strategy 2: Direct search by 학생명
    if student_df is None or student_df.empty:
        student_df = df[df['학생명'] == student_name].copy()
        resolved_name = student_name
        resolved_code = student_df['학생코드'].iloc[0] if not student_df.empty and '학생코드' in student_df.columns else "-"
        
    # Strategy 3: Try partial match on 학생명
    if student_df.empty:
        student_df = df[df['학생명'].str.contains(student_name, na=False)].copy()
        if not student_df.empty:
            resolved_name = student_df['학생명'].iloc[0]
            resolved_code = student_df['학생코드'].iloc[0] if '학생코드' in student_df.columns else "-"
    
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
        student_df['강도'] = student_df['강도'].apply(lambda x: extract_numeric(x, 0))
    if '발생빈도' in student_df.columns:
        student_df['발생빈도'] = student_df['발생빈도'].apply(lambda x: extract_numeric(x, 1))
    else:
        student_df['발생빈도'] = 1
    
    # Date parsing & filtering
    if '행동발생 날짜' in student_df.columns:
        student_df['date_obj'] = robust_parse_dates(student_df['행동발생 날짜'])
        if start_date:
            student_df = student_df[student_df['date_obj'] >= pd.to_datetime(start_date)]
        if end_date:
            student_df = student_df[student_df['date_obj'] <= pd.to_datetime(end_date)]
    
    if student_df.empty:
        empty_result["profile"]["name"] = resolved_name
        empty_result["profile"]["student_code"] = resolved_code if resolved_code != "-" else student_name
        return empty_result

    # -- Profile Info --
    total_incidents = int(student_df['발생빈도'].sum())
    
    # Row count = 보고빈도 for student (not frequency-weighted)
    total_incidents = len(student_df)
    avg_intensity = float(student_df['강도'].mean()) if not student_df.empty and '강도' in student_df.columns else 0.0
    avg_intensity = round(avg_intensity, 2)
    # Get class from TierStatus lookup using the resolved 4-digit student code
    student_class = "-"
    try:
        tier_status = fetch_student_status()
        for s in tier_status:
            if str(s.get('학생코드', '')).strip() == str(resolved_code).strip():
                student_class = s.get('학급', '-')
                break
    except Exception:
        pass
    
    # -- Tier Calculation --
    detected_tiers = []
    
    # 1. Behavioral Thresholds (Calculated)
    if total_incidents >= 6 or (not student_df.empty and student_df['강도'].max() >= 5):
        detected_tiers.append("Tier 3")
    elif total_incidents >= 3:
        detected_tiers.append("Tier 2")
    else:
        detected_tiers.append("Tier 1")

    # 2. Manual Sheet settings (from TierStatus)
    try:
        tier_status = fetch_student_status()
        for s in tier_status:
            if str(s.get('학생코드', '')).strip() == str(resolved_code).strip():
                if str(s.get('Tier2(CICO)', '')).upper() == 'O':
                    if "Tier 2" not in detected_tiers: detected_tiers.append("Tier 2(CICO)")
                if str(s.get('Tier2(SST)', '')).upper() == 'O':
                    if "Tier 2" not in detected_tiers: detected_tiers.append("Tier 2(SST)")
                if str(s.get('Tier3', '')).upper() == 'O':
                    if "Tier 3" not in detected_tiers: detected_tiers.append("Tier 3")
                if str(s.get('Tier3+', '')).upper() == 'O':
                    if "Tier 3+" not in detected_tiers: detected_tiers.append("Tier 3+")
                break
    except Exception:
        pass
    
    # Unique tiers while maintaining order, but Tier 1 is excluded if Tier 2/3 exists
    final_tiers = []
    has_high_tier = any(t for t in detected_tiers if "Tier 2" in t or "Tier 3" in t)
    for t in detected_tiers:
        if has_high_tier and t == "Tier 1":
            continue
        if t not in final_tiers:
            final_tiers.append(t)
            
    tier_string = ", ".join(final_tiers) if final_tiers else "Tier 1"

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
            
    # -- Function Stats -- (row count per function)
    function_stats = []
    if '기능' in student_df.columns:
        f_counts = student_df.groupby('기능').size().sort_values(ascending=False)
        function_stats = [{"name": k, "value": int(v)} for k, v in f_counts.items()]

    # -- Daily CICO Trend --
    cico_trend = []
    if '행동발생 날짜' in student_df.columns:
        d_counts = student_df.groupby('행동발생 날짜')['발생빈도'].sum().sort_index()
        cico_trend = [{"date": k, "count": int(v)} for k, v in d_counts.items()]

    # -- Weekly Trend --
    weekly_trend = []
    if 'date_obj' in student_df.columns:
        student_df['week'] = student_df['date_obj'].dt.isocalendar().week.fillna(-1).astype(int)
        student_df['year'] = student_df['date_obj'].dt.year.fillna(-1).astype(int)
        s_valid = student_df[student_df['year'] > 0]
        w_counts = s_valid.groupby(['year', 'week'])['발생빈도'].sum().reset_index(name='count')
        for _, row in w_counts.iterrows():
            weekly_trend.append({"week": f"{int(row['year'])}-W{int(row['week']):02d}", "count": int(row['count'])})

    # -- Behavior Types --
    behavior_types = []
    if '행동유형' in student_df.columns:
        b_counts = student_df.groupby('행동유형')['발생빈도'].sum()
        behavior_types = [{"name": k, "value": int(v)} for k, v in b_counts.items()]

    # -- Location & Time Stats --
    location_stats = []
    # -- Location Stats -- (row count)
    location_stats = []
    if '장소' in student_df.columns:
        l_counts = student_df.groupby('장소').size().sort_values(ascending=False)
        location_stats = [{"name": k, "value": int(v)} for k, v in l_counts.items()]
        
    # -- Time Stats -- (row count)
    time_stats = []
    if '시간대' in student_df.columns:
        t_counts = student_df.groupby('시간대').size().sort_values(ascending=False)
        time_stats = [{"name": k, "value": int(v)} for k, v in t_counts.items()]

    # -- Weekday Distribution --
    weekday_dist = []
    weekday_names_map = {
        'Monday': '월', 'Tuesday': '화', 'Wednesday': '수', 'Thursday': '목',
        'Friday': '금', 'Saturday': '토', 'Sunday': '일'
    }
    if 'date_obj' in student_df.columns:
        student_df['weekday'] = student_df['date_obj'].dt.day_name()
        wd_counts = student_df.groupby('weekday')['발생빈도'].sum()
        weekdays_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        for wd in weekdays_order:
            if wd in wd_counts:
                weekday_dist.append({"name": weekday_names_map.get(wd, wd), "value": int(wd_counts[wd])})

    # -- Monthly Trend -- (row count per month)
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

    # -- Get Student Code (4-digit from 학생코드 column) --
    student_code_val = resolved_code
    if student_code_val == "-" and '학생코드' in student_df.columns:
        candidate = str(student_df['학생코드'].iloc[0]).strip()
        if candidate:
            student_code_val = candidate
    
    return {
        "profile": {
            "name": resolved_name,
            "student_code": student_code_val,
            "class": student_class,
            "tier": tier_string,
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
        return {
            "period": f"{start_dt.strftime('%Y-%m-%d')} ~ {end_dt.strftime('%Y-%m-%d')}",
            "students": [],
            "summary": {"emergency_count": 0, "tier2_candidate_count": 0}
        }

    df = pd.DataFrame(raw_data)
    
    # Preprocessing
    if '행동발생 날짜' in df.columns:
        df['date_obj'] = robust_parse_dates(df['행동발생 날짜'])
        # Filter for last 4 weeks
        df = df[(df['date_obj'] >= start_dt) & (df['date_obj'] <= end_dt)]
    
    if '강도' in df.columns:
        df['강도'] = pd.to_numeric(df['강도'], errors='coerce').fillna(0)

    # --- Prepare Tier Status Map ---
    all_status = fetch_student_status()
    student_tier_map = {}
    for s in all_status:
        # Determine max tier
        tier = "Tier 1"
        if s.get('Tier3+') == 'O': tier = "Tier 3+"
        elif s.get('Tier3') == 'O': tier = "Tier 3"
        elif s.get('Tier2(CICO)') == 'O' or s.get('Tier2(SST)') == 'O': tier = "Tier 2"
        
        # Map by Name (assuming unique names for now, or use Code if available)
        s_name = s.get('학생명')
        if s_name:
            student_tier_map[s_name] = tier

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
            
            # 3. Current Tier Status (Real Data)
            # Fetch from student_tier_map derived from all_status
            current_tier = student_tier_map.get(name, "Tier 1")
            
            # 4. Teacher Opinion (Placeholder)
            teacher_opinion = ""

            # 5. CICO Data (Placeholder - could fetch if needed)
            cico_avg = 0 
            
            student_analysis.append({
                "name": name,
                "class": group['코드번호'].iloc[0] if '코드번호' in group.columns else "-",
                "total_incidents": len(group),
                "weekly_avg": round(len(group) / 4, 1),
                "is_emergency": is_emergency,
                "emergency_reason": ", ".join(emergency_reason),
                "is_tier2_candidate": is_tier2_candidate,
                "current_tier": current_tier,
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
