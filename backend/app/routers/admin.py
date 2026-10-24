"""Admin: seed, reset, simulate. Not stubbed with fake data: they return 501
until implemented, since a fake "seeded" response would be misleading."""

from fastapi import APIRouter, HTTPException, Path

from app.config import DATES_PER_SESSION, N_SESSIONS
from app.models import SeedResult, SimulateResult

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/seed", response_model=SeedResult)
def seed():
    raise HTTPException(501, "seeding is not implemented yet (build plan P1)")


@router.post("/reset", status_code=204)
def reset():
    raise HTTPException(501, "reset is not implemented yet (build plan P1)")


@router.post("/simulate/sessions/{s}/dates/{d}", response_model=SimulateResult)
def simulate(s: int = Path(ge=0, lt=N_SESSIONS), d: int = Path(ge=0, lt=DATES_PER_SESSION)):
    raise HTTPException(501, "the simulator is not implemented yet (build plan P5)")
