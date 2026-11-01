import subprocess
import sys

def run_git(cmd):
    p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, err = p.communicate()
    print(f"[{cmd}] Exit Code: {p.returncode}")
    if out:
        print("STDOUT:\n" + out.strip())
    if err:
        print("STDERR:\n" + err.strip())
    return p.returncode

print("Checking git status...")
run_git("git status")

print("\nAdding files...")
run_git("git add -A")

print("\nCommitting...")
run_git('git commit -m "feat: complete BCBA normalization layer and Evidence Packet architecture"')

print("\nPushing to GitHub main...")
run_git("git push origin main")
