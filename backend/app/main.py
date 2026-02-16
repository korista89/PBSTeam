from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for Vercel deployment
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
app.include_router(bip.router, prefix="/api/v1/bip", tags=["bip"])

@app.get("/")
async def root():
    return {"message": "IBSD Backend API Operational"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}
