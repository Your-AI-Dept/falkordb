"""Admin: seed, reset, simulate, fast-forward, human raters."""

from fastapi import APIRouter, Path, Query
from pydantic import BaseModel

from app import state
from app.config import DATES_PER_SESSION, N_SESSIONS
from app.models import MetricsPoint, SeedResult, SimulateResult
from app.services import pipeline
from app.services import seed as seed_service

router = APIRouter(prefix="/admin", tags=["admin"])


class Humans(BaseModel):
    ids: list[str]


@router.post("/seed", response_model=SeedResult)
def seed():
    """Drop and rebuild the content and people graphs from data/ (deterministic). Resets the event."""
    result = seed_service.seed()
    humans = state.load().humans
    state.reset()
    st = state.load()
    st.humans = humans
    state.save(st)
    return result


@router.post("/reset", status_code=204)
def reset():
    """Drop the content, people and match_scratch graphs and the event state."""
    seed_service.reset()
    state.reset()


@router.post("/simulate/sessions/{s}/dates/{d}", response_model=SimulateResult)
def simulate(s: int = Path(ge=0, lt=N_SESSIONS), d: int = Path(ge=0, lt=DATES_PER_SESSION)):
    """Simulator answers every incomplete, non-human survey in an open date."""
    return SimulateResult(answered=pipeline.simulate_date(s, d))


@router.post("/fast_forward", response_model=list[MetricsPoint])
def fast_forward(to_session: int = Query(ge=0, le=N_SESSIONS)):
    """Seed if needed, then simulate every session before `to_session` (open, answer, close all 4 dates)."""
    return pipeline.fast_forward(to_session)


@router.get("/humans", response_model=Humans)
def get_humans():
    return Humans(ids=state.load().humans)


@router.put("/humans", response_model=Humans)
def set_humans(body: Humans):
    """Raters answered by people (live demo): the simulator skips them and their questions are Claude-phrased."""
    st = state.load()
    st.humans = sorted(set(body.ids))
    state.save(st)
    return Humans(ids=st.humans)
