
import gspread
print("gspread dir:", dir(gspread))
try:
    from gspread.formatting import DataValidationRule
    print("Found gspread.formatting.DataValidationRule")
except ImportError:
    print("gspread.formatting not found")
    
# Try checking where DataValidationRule might be
import inspect
try:
    print(inspect.getmodule(gspread.DataValidationRule))
except:
    pass
