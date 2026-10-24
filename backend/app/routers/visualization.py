"""Graph view: one snapshot to load from, then GET /events (graph-view/src/graph/CONTRACT.md)."""

from fastapi import APIRouter, Depends

from app.routers.catalog import require_seeded
from app.services import graph_events

router = APIRouter(tags=["visualization"], dependencies=[Depends(require_seeded)])


@router.get("/graph/snapshot")
def graph_snapshot():
    """Topics, attendees with their vectors, every learned-from edge, talks, vendors, metrics history,
    past meetings (dates and check-ins), the open session's plan, the latest closed tick and the last
    generated question. Built by the same code as the event payloads."""
    return graph_events.snapshot()
