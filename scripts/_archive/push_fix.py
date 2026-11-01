import subprocess

cmds = [
    ("git add -A", 15),
    ('git commit -m "fix: Gemini API v1beta only, remove v1 404 errors, clean model list"', 15),
    ("git push origin main", 30),
]

for cmd, timeout in cmds:
    print(f"\n>>> {cmd}")
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        if result.stdout:
            print(result.stdout.strip())
        if result.stderr:
            print(result.stderr.strip())
        print(f"Exit: {result.returncode}")
    except subprocess.TimeoutExpired:
        print("Timeout - sent to background")
    except Exception as e:
        print(f"Error: {e}")
