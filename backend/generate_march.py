
import sys
import os
from dotenv import load_dotenv

sys.path.append(os.getcwd())
load_dotenv()

# Prioritize local service account if exists
if os.path.exists("service_account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_account.json"

try:
    from app.services.sheets import create_monthly_cico_sheet, fetch_student_status
    
    # Check if we have Tier2 students
    records = fetch_student_status()
    t2_students = [s for s in records if s.get('Tier2(CICO)') == 'O']
    print(f"Found {len(t2_students)} Tier2(CICO) students.")
    
    if not t2_students:
        print("Warning: No students marked as Tier2(CICO). Sheet might not be created.")
    
    print("Generating March 2026 Sheet...")
    result = create_monthly_cico_sheet(2026, 3)
    print("Result:", result)
    
except Exception as e:
    print(f"Error: {e}")
