import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from app.services.analysis import get_analytics_data
    print("Function imported successfully.")
    
    print("Calling get_analytics_data()...")
    result = get_analytics_data()
    print("Result keys:", result.keys())
    print("Success!")
except Exception as e:
    import traceback
    traceback.print_exc()
