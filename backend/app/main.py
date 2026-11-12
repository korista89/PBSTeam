import sys
import os

# Vercel runs from project root (/var/task/), but app module is under backend/
# Add backend directory to sys.path so Python can find it
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import logging
import time


def _setup_logging():
    # Vercel은 stderr 줄을 error로 표시한다. 정보는 stdout, 경고 이상만 stderr로 보낸다.
    fmt = logging.Formatter("%(levelname)s %(name)s: %(message)s")
    out = logging.StreamHandler(sys.stdout)
    out.setLevel(logging.INFO)
    out.addFilter(lambda r: r.levelno < logging.WARNING)
    err = logging.StreamHandler(sys.stderr)
    err.setLevel(logging.WARNING)
    for h in (out, err):
        h.setFormatter(fmt)
    root = logging.getLogger()
    root.handlers[:] = [out, err]
    root.setLevel(logging.INFO)


_setup_logging()
logger = logging.getLogger("app.main")

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from urllib.parse import quote
from app.core.config import settings
from app.adapters.sheets.resilience import SheetUnavailable, begin_request, end_request, request_reads

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")

def get_allowed_origins() -> list:
    """Exact allowlist of trusted origins (no wildcard or preview regex in production)."""
    origins = ["https://pbs-team.vercel.app", "https://gespbs.com", "https://www.gespbs.com"]
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
    expose_headers=["X-PBST-Data-Stale", "Retry-After"],
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


POLL_MAX_AGE_SECONDS = 20


@app.exception_handler(SheetUnavailable)
async def sheet_unavailable_handler(request: Request, exc: SheetUnavailable):
    logger.warning("시트 응답 없음 → 503: %s %s (%s)", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "구글 시트 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.", "source": exc.source},
        headers={"Retry-After": "10"},
    )


@app.middleware("http")
async def sheet_sync_and_api_cache_control(request: Request, call_next):
    """Provide an explicit fresh-read path for live Google Sheets screens.

    Vercel may serve consecutive requests from different warm instances, so a
    write-side in-memory invalidation cannot guarantee that the next GET lands
    on the same cache.  Live-refresh requests therefore clear the local cache
    of whichever instance receives the GET before the endpoint reads Sheets.
    """
    t0 = time.perf_counter()
    is_api = request.url.path.startswith("/api/")
    refresh_mode = request.headers.get("x-pbst-sheet-refresh", "").strip()
    is_sheet_get = request.method == "GET" and request.url.path.startswith("/api/v1/")

    if is_sheet_get and refresh_mode == "poll":
        # Periodic/focus polls only need "recent enough" data: re-read entries
        # older than POLL_MAX_AGE_SECONDS instead of wiping the whole cache on
        # every tick of every open tab (the main driver of Sheets 429s).
        from app.services.sheets import clear_cache
        await run_in_threadpool(clear_cache, None, ("users",), POLL_MAX_AGE_SECONDS)
    elif is_sheet_get and refresh_mode == "1":
        # Sent right after this client's own write: must see it, so clear fully.
        from app.services.sheets import clear_cache
        # clear_cache() and clear_pw_cache() are synchronous (plain dict/module
        # state), but this middleware runs on the event loop for every GET. On
        # a Vercel warm instance shared across concurrent requests, doing this
        # inline briefly holds up every other in-flight request; run it off
        # the event loop like the rest of the (also-synchronous) request path.
        # Keep the Users cache: it is auth data, not screen data. Wiping it here made
        # every 30s live-refresh re-read Users, and a 429 on that read became a 401.
        # Worksheet lookups are kept: re-fetching spreadsheet metadata after every
        # write burned read quota (lookup cache TTL is 5 min; new sheets by exact
        # title are never negatively cached).
        await run_in_threadpool(clear_cache, None, ("users",), None, False)
        try:
            from app.services.picture_words import clear_pw_cache
            await run_in_threadpool(clear_pw_cache)
        except Exception:
            # Picture-word sheets are optional to the core PBST data contract.
            pass

    # Reads may fall back to the last good copy only for GETs; see resilience.py.
    sheet_ctx = begin_request(allow_stale=request.method == "GET")
    try:
        response = await call_next(request)
    finally:
        reads = request_reads()
        stale_sources = end_request(sheet_ctx)
    if reads:
        # 시트 읽기 한도(분당) 관리를 위해 요청마다 실제 읽기 수를 남긴다.
        logger.info("sheet_reads=%d %s %s", reads, request.method, request.url.path)
        response.headers["X-PBST-Sheet-Reads"] = str(reads)
    if stale_sources:
        response.headers["X-PBST-Data-Stale"] = ",".join(quote(s) for s in sorted(stale_sources))
    if is_api:
        # Prevent browser/CDN reuse on authenticated, mutable Sheet-backed APIs.
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["X-Content-Type-Options"] = "nosniff"
    # 접속 불량 원인 추적: 점검 요청(/health)은 항상, 나머지는 2초 넘게 걸린 요청만 처리 시간을 남긴다.
    ms = int((time.perf_counter() - t0) * 1000)
    if request.url.path.endswith("/health") or ms >= 2000:
        logger.info("req_ms=%d status=%s %s %s", ms, response.status_code, request.method, request.url.path)
    return response

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
from app.api.endpoints import target_behavior
from app.api.endpoints import briefing

app.include_router(bip.router, prefix="/api/v1/bip", tags=["bip"])
app.include_router(picture_words.router, prefix="/api/v1/picture-words", tags=["picture-words"])
app.include_router(behavior.router, prefix="/api/v1/behavior-log", tags=["behavior-log"])
app.include_router(ebp.router, prefix="/api/v1/ebp", tags=["ebp"])
app.include_router(workspace.router, prefix="/api/v1/workspace", tags=["workspace"])
app.include_router(class_rules.router, prefix="/api/v1/class-rules", tags=["class-rules"])
app.include_router(target_behavior.router, prefix="/api/v1/target-behaviors", tags=["target-behaviors"])
app.include_router(briefing.router, prefix="/api/v1/briefing", tags=["briefing"])

@app.get("/")
async def root():
    return {"message": "IBSD Backend API Operational"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/health")
async def api_health_check():
    return {"status": "ok"}

