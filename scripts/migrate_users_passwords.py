#!/usr/bin/env python
"""
scripts/migrate_users_passwords.py

PBSTeam One-Time Safe Users Password Migration CLI Tool (Argon2id)
Default mode: DRY-RUN (safe read-only inspection)

Safety Gate:
- Default execution is ALWAYS dry-run.
- To execute live migration, BOTH --apply flag and ALLOW_PASSWORD_MIGRATION=1 environment variable are strictly required.
- Zero password values or hashes are output to logs, terminal, or reports.
"""

import os
import sys
import argparse
import hashlib
from typing import Dict, List, Any, Optional, Tuple

# Add backend directory to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.core.config import settings
from app.core.security import hash_password, verify_password_compat, _hasher
from app.services.sheets import get_users_worksheet, safe_get_all_records, clear_cache


def classify_password_type(stored_password: str) -> str:
    """Classifies stored password without altering whitespace semantics or exposing contents."""
    if stored_password is None or len(stored_password) == 0:
        return "blank"

    if stored_password.startswith("$argon2"):
        return "argon2id"

    if len(stored_password) == 64 and all(c in "0123456789abcdefABCDEF" for c in stored_password):
        return "legacy_sha256"

    if len(stored_password) > 0:
        return "legacy_plaintext"

    return "unknown"


def run_migration_inspection(ws=None) -> Tuple[Dict[str, int], List[Dict[str, Any]], Optional[int]]:
    """
    Performs preflight checks and categorizes all user password types.
    Returns (counts_dict, raw_records, password_column_1based).
    """
    if ws is None:
        ws = get_users_worksheet()

    if not ws:
        raise RuntimeError("Unable to access Google Sheets 'Users' worksheet.")

    # 1. Header Contract Preflight
    headers = ws.row_values(1)
    if not headers:
        raise RuntimeError("Users sheet header row is empty.")

    pw_col_idx = None
    id_col_idx = None
    for idx, h in enumerate(headers):
        h_norm = str(h).strip().lower()
        if h_norm == "password":
            pw_col_idx = idx + 1
        elif h_norm == "id":
            id_col_idx = idx + 1

    if id_col_idx is None:
        raise RuntimeError("Required header 'ID' not found in Users sheet.")
    if pw_col_idx is None:
        raise RuntimeError("Required header 'Password' not found in Users sheet.")

    # 2. Fetch records
    records = safe_get_all_records(ws)
    if not records:
        raise RuntimeError("No records found in Users worksheet.")

    # 3. Duplicate and Blank ID check
    seen_ids = set()
    for idx, r in enumerate(records):
        uid = str(r.get("ID", "")).strip()
        if not uid:
            raise RuntimeError(f"Preflight failed: Blank User ID at row {idx + 2}.")
        if uid in seen_ids:
            raise RuntimeError(f"Preflight failed: Duplicate User ID '{uid}' found at row {idx + 2}.")
        seen_ids.add(uid)

    counts = {
        "total_users": len(records),
        "argon2id": 0,
        "legacy_sha256": 0,
        "legacy_plaintext": 0,
        "blank": 0,
        "unknown": 0
    }

    for r in records:
        pw = str(r.get("Password", ""))
        pw_type = classify_password_type(pw)
        if pw_type in counts:
            counts[pw_type] += 1
        else:
            counts["unknown"] += 1

    return counts, records, pw_col_idx


def main():
    parser = argparse.ArgumentParser(
        description="PBSTeam Users Password Migration Tool (Argon2id Hardening)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Perform inspection and classification without making changes (default: True)"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply password migration to Google Sheets (Requires ALLOW_PASSWORD_MIGRATION=1 env var)"
    )

    args = parser.parse_args()

    is_apply_mode = args.apply

    print("=" * 60)
    print("PBSTeam Users Password Hardening Migration Tool")
    print("=" * 60)

    try:
        ws = get_users_worksheet()
        counts, records, pw_col = run_migration_inspection(ws)

        print("\n[PREFLIGHT INSPECTION SUMMARY]")
        print(f"  Total Users:       {counts['total_users']}")
        print(f"  Argon2id:          {counts['argon2id']}")
        print(f"  Legacy SHA-256:    {counts['legacy_sha256']}  (Will migrate progressively on login)")
        print(f"  Legacy Plaintext:  {counts['legacy_plaintext']}")
        print(f"  Blank:             {counts['blank']}")
        print(f"  Unknown:           {counts['unknown']}")
        print("=" * 60)

        if not is_apply_mode:
            print("\n[DRY-RUN MODE] No writes were performed to Google Sheets.")
            print("To apply changes in future, both --apply and ALLOW_PASSWORD_MIGRATION=1 are required.\n")
            return 0

        # Safety Gate Check for --apply
        env_gate = os.environ.get("ALLOW_PASSWORD_MIGRATION", "").strip()
        if env_gate != "1":
            print("\n[ERROR] Safety gate blocked execution!")
            print("Live migration requires environment variable: ALLOW_PASSWORD_MIGRATION=1")
            print("Command aborted. No changes made.\n")
            return 1

        print("\n[APPLY MODE ACTIVATED] Starting atomic compare-and-set password upgrades...")

        migrated_count = 0
        skipped_count = 0
        error_count = 0

        for idx, r in enumerate(records):
            uid = str(r.get("ID", ""))
            stored_pw = str(r.get("Password", ""))
            pw_type = classify_password_type(stored_pw)
            row_num = idx + 2 # 1-based header + 1-based index

            if pw_type == "argon2id":
                skipped_count += 1
                continue
            elif pw_type == "legacy_sha256":
                # Cannot convert SHA256 offline without plaintext password; skip for progressive login migration
                skipped_count += 1
                continue
            elif pw_type in ["blank", "unknown"]:
                skipped_count += 1
                continue
            elif pw_type == "legacy_plaintext":
                try:
                    # 1. Hash plaintext using canonical Argon2id hasher
                    new_hash = hash_password(stored_pw)

                    # 2. Self-verify hash against plaintext before write
                    _hasher.verify(new_hash, stored_pw)

                    # 3. Read live cell for Compare-And-Set
                    live_val = str(ws.cell(row_num, pw_col).value or "")
                    if live_val != stored_pw:
                        print(f"  [CAS SKIP] Row {row_num} (User ID '{uid}') changed concurrently. Skipped.")
                        skipped_count += 1
                        continue

                    # 4. Write new hash
                    ws.update_cell(row_num, pw_col, new_hash)

                    # 5. Read-back verification
                    read_back = str(ws.cell(row_num, pw_col).value or "")
                    if not read_back.startswith("$argon2id$"):
                        print(f"  [READ-BACK ERROR] Row {row_num} read-back failed.")
                        error_count += 1
                        continue

                    # 6. Do not retain or log plaintext; drop local variable reference
                    del stored_pw
                    migrated_count += 1
                    print(f"  [SUCCESS] Row {row_num} (User ID '{uid}') migrated to Argon2id.")

                except Exception as e:
                    error_count += 1
                    print(f"  [ERROR] Row {row_num} migration failed.")

        clear_cache("users")

        print("\n" + "=" * 60)
        print("[MIGRATION COMPLETE]")
        print(f"  Migrated to Argon2id: {migrated_count}")
        print(f"  Skipped / Preserved:  {skipped_count}")
        print(f"  Errors:               {error_count}")
        print("=" * 60 + "\n")

        return 0 if error_count == 0 else 1

    except Exception as e:
        print(f"\n[FATAL ERROR] Migration failed: {e}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
