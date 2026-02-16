import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from app.services.sheets import save_bip, get_bip, ensure_bip_sheet

def test_bip():
    print("Testing BIP functionality...")
    
    # 1. Ensure/Create Sheet
    print("1. Ensuring BIP sheet exists...")
    ws = ensure_bip_sheet()
    if ws:
        print("   - BIP sheet accessible.")
    else:
        print("   - FAILED to access BIP sheet.")
        return

    # 2. Save Mock BIP
    mock_bip = {
        "StudentCode": "TEST-9999",
        "TargetBehavior": "Testing behavior",
        "Hypothesis": "Testing hypothesis",
        "PreventionStrategies": "Prevent",
        "TeachingStrategies": "Teach",
        "ConsequenceStrategies": "Consequence",
        "CrisisPlan": "Crisis",
        "EvaluationPlan": "Evaluate",
        "UpdatedAt": "2025-01-01",
        "Author": "Tester"
    }
    
    print(f"2. Saving BIP for {mock_bip['StudentCode']}...")
    res = save_bip(mock_bip)
    if "error" in res:
         print(f"   - FAILED to save: {res['error']}")
         return
    print("   - Save successful.")

    # 3. Read BIP
    print(f"3. Reading BIP for {mock_bip['StudentCode']}...")
    bip = get_bip(mock_bip['StudentCode'])
    if bip:
        print(f"   - Retrieval successful. TargetBehavior: {bip.get('TargetBehavior')}")
        if bip.get('TargetBehavior') == "Testing behavior":
            print("   - Data verification PASSED.")
        else:
            print("   - Data verification FAILED (mismatch).")
    else:
        print("   - FAILED to retrieve BIP.")
        
    print("\nBIP Test Complete.")

if __name__ == "__main__":
    test_bip()
