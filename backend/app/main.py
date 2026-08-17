import sys
import os

# Vercel runs from project root (/var/task/), but app module is under backend/
# Add backend directory to sys.path so Python can find it
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")

# CORS setup — specific allowlist + regex for preview deployments
cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
]
frontend_env = os.environ.get("FRONTEND_URL")
if frontend_env:
    cors_origins.append(frontend_env)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

app.include_router(bip.router, prefix="/api/v1/bip", tags=["bip"])
app.include_router(picture_words.router, prefix="/api/v1/picture-words", tags=["picture-words"])
app.include_router(behavior.router, prefix="/api/v1/behavior-log", tags=["behavior-log"])
app.include_router(ebp.router, prefix="/api/v1/ebp", tags=["ebp"])
app.include_router(workspace.router, prefix="/api/v1/workspace", tags=["workspace"])

@app.get("/")
@app.get("/api")
@app.get("/api/")
async def root():
    return {"message": "IBSD Backend API Operational"}


@app.get("/health")
@app.get("/api/health")
@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok"}

