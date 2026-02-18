import sys
import os
sys.path.append(os.getcwd())
from app.services.sheets import fetch_board_posts, get_board_worksheet, add_board_post

print("Fetching posts...")
try:
    posts = fetch_board_posts()
    print(f"Posts: {posts}")
except Exception as e:
    print(f"Fetch Error: {e}")

print("Checking Worksheet...")
try:
    ws = get_board_worksheet()
    if ws:
        print(f"Headers: {ws.row_values(1)}")
        print(f"All values (first 5 rows): {ws.get_all_values()[:5]}")
    else:
        print("WS is None")
except Exception as e:
    print(f"Values Error: {e}")
