# backend/app/core/security.py

import os
import hashlib
from typing import Optional, Dict, Any
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError, InvalidHash
import jwt
from fastapi import Response, HTTPException, status
from app.core.config import settings

# Argon2id Hasher instance
_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=65536,  # 64 MB
    parallelism=1,
    hash_len=32,
    type=Type.ID
)

@dataclass
class PasswordVerificationResult:
    verified: bool
    needs_rehash: bool
    legacy_type: Optional[str] = None


def hash_password(plain_password: str) -> str:
    """Hashes a plain password using Argon2id."""
    if not plain_password:
        raise ValueError("Password cannot be empty")
    return _hasher.hash(plain_password)


def verify_password_compat(plain_password: str, stored_password: str) -> PasswordVerificationResult:
    """
    Verifies a password against stored value supporting Argon2id, legacy SHA256, and legacy Plaintext.
    Does NOT write to database; returns verification status and rehash necessity.
    """
    if not stored_password or not plain_password:
        return PasswordVerificationResult(verified=False, needs_rehash=False)

    # 1. Argon2id check
    if stored_password.startswith("$argon2"):
        try:
            _hasher.verify(stored_password, plain_password)
            needs_rehash = _hasher.check_needs_rehash(stored_password)
            return PasswordVerificationResult(verified=True, needs_rehash=needs_rehash, legacy_type=None)
        except (VerifyMismatchError, InvalidHash):
            return PasswordVerificationResult(verified=False, needs_rehash=False)

    # 2. Legacy SHA-256 (64 hex characters) check
    if len(stored_password) == 64 and all(c in "0123456789abcdefABCDEF" for c in stored_password):
        sha256_hash = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
        if stored_password.lower() == sha256_hash.lower():
            return PasswordVerificationResult(verified=True, needs_rehash=True, legacy_type="SHA256")
        # In rare case stored plaintext happens to be 64 hex chars
        if stored_password == plain_password:
            return PasswordVerificationResult(verified=True, needs_rehash=True, legacy_type="PLAINTEXT")
        return PasswordVerificationResult(verified=False, needs_rehash=False)

    # 3. Legacy Plaintext comparison
    if stored_password == plain_password:
        return PasswordVerificationResult(verified=True, needs_rehash=True, legacy_type="PLAINTEXT")

    return PasswordVerificationResult(verified=False, needs_rehash=False)


def _get_auth_secret() -> str:
    """Retrieves AUTH_SECRET, raising an exception if not configured."""
    secret = settings.AUTH_SECRET
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service configuration error: AUTH_SECRET is not configured."
        )
    return secret


ALLOWED_JWT_CLAIMS = {"sub", "role", "class_id"}

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Creates a signed JWT session token with strictly minimal claims (sub, role, class_id, exp, iat)."""
    secret = _get_auth_secret()
    
    # Strictly whitelist safe minimal claims only (no PII, no names, no passwords)
    payload = {
        k: v for k, v in data.items()
        if k in ALLOWED_JWT_CLAIMS
    }

    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.AUTH_TOKEN_TTL_MINUTES))
    
    payload.update({
        "exp": expire,
        "iat": now
    })

    return jwt.encode(payload, secret, algorithm="HS256")


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decodes and validates a signed JWT session token."""
    secret = _get_auth_secret()
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired. Please log in again."
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token."
        )


def set_session_cookie(response: Response, token: str) -> None:
    """Sets a Secure HttpOnly session cookie on the response."""
    is_production = settings.ENVIRONMENT.lower() == "production"
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        path="/",
        max_age=settings.AUTH_TOKEN_TTL_MINUTES * 60
    )


def delete_session_cookie(response: Response) -> None:
    """Clears the session cookie on logout."""
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax"
    )
