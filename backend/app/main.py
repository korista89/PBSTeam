import sys
import os

# Vercel runs from project root (/var/task/), but app module is under backend/
# Add backend directory to sys.path so Python can find it
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from app.core.config import settings

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")

def get_allowed_origins() -> list:
    """Exact allowlist of trusted origins (no wildcard or preview regex in production)."""
    origins = ["https://pbs-team.vercel.app"]
    frontend_env = os.environ.get("FRONTEND_URL") or getattr(settings, "FRONTEND_URL", None)
    if frontend_env and frontend_env not in origins:
        origins.append(frontend_env)

    if settings.ENVIRONMENT.lower() != "production":
        for dev_origin in [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "http://127.0.0.1:8000"
        ]:
            if dev_origin not in origins:
                origins.append(dev_origin)
    return origins

ALLOWED_ORIGINS = get_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.middleware("http")
async def verify_origin_header(request: Request, call_next):
    # Origin verification for state-changing requests (CSRF defense)
    if request.method in ["POST", "PUT", "PATCH", "DELETE"]:
        origin = request.headers.get("origin")
        if not origin:
            # In production browser-centric app, mutation requests require a trusted Origin header
            if settings.ENVIRONMENT.lower() == "production":
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Forbidden: Origin header required for mutation requests in production."}
                )
        else:
            allowed = get_allowed_origins()
            if origin not in allowed:
                return JSONResponse(
                    status_code=403,
                    content={"detail": f"Forbidden: Untrusted Origin '{origin}'"}
                )
    return await call_next(request)

from app.api.endpoints import analytics
from app.api.endpoints import student
from app.api.endpoints import roster
from app.api.endpoints import auth
from app.api.endpoints import tier
from app.api.endpoints import cico
from app.api.endpoints import meeting_notes

app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
app.include_router(student.router, prefix="/api/v1/students", tags=["students"])
app.include_router(roster.router, prefix="/api/v1/roster", tags=["roster"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(tier.router, prefix="/api/v1/tier", tags=["tier"])
app.include_router(cico.router, prefix="/api/v1/cico", tags=["cico"])
app.include_router(meeting_notes.router, prefix="/api/v1/meeting-notes", tags=["meeting-notes"])
from app.api.endpoints import board
app.include_router(board.router, prefix="/api/v1/board", tags=["board"])

from app.api.endpoints import bip
from app.api.endpoints import picture_words
from app.api.endpoints import behavior
from app.api.endpoints import ebp
from app.api.endpoints import workspace
from app.api.endpoints import class_rules

app.include_router(bip.router, prefix="/api/v1/bip", tags=["bip"])
app.include_router(picture_words.router, prefix="/api/v1/picture-words", tags=["picture-words"])
app.include_router(behavior.router, prefix="/api/v1/behavior-log", tags=["behavior-log"])
app.include_router(ebp.router, prefix="/api/v1/ebp", tags=["ebp"])
app.include_router(workspace.router, prefix="/api/v1/workspace", tags=["workspace"])
app.include_router(class_rules.router, prefix="/api/v1/class-rules", tags=["class-rules"])

@app.get("/")
async def root():
    return {"message": "IBSD Backend API Operational"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/health")
async def api_health_check():
    return {"status": "ok"}

