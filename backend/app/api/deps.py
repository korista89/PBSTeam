# backend/app/api/deps.py

from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, status
from app.core.config import settings
from app.core.security import decode_access_token

async def get_current_user_optional(request: Request) -> Optional[Dict[str, Any]]:
    """
    Extracts and decodes session token strictly from HttpOnly session cookie.
    Returns user claims dictionary or None if unauthenticated.
    """
    token: Optional[str] = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if not token:
        return None

    try:
        payload = decode_access_token(token)
        return payload
    except HTTPException:
        return None


async def require_authenticated_user(request: Request) -> Dict[str, Any]:
    """
    Strict dependency: Requires a valid authenticated HttpOnly session cookie.
    Raises HTTP 401 if cookie is missing or invalid.
    """
    token: Optional[str] = request.cookies.get(settings.AUTH_COOKIE_NAME)
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication session required. Please log in."
        )

    payload = decode_access_token(token)
    return payload

