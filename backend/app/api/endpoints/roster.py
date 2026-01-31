from fastapi import APIRouter
from app.services.roster import get_full_roster

router = APIRouter()

@router.get("/")
async def get_roster():
    return get_full_roster()
