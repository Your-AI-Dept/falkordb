"""Event state: session/date lifecycle, metrics history, human raters.

Stored as one JSON blob in a plain Redis key on the FalkorDB instance (not in
a graph), so it survives backend restarts and `--reload` during development.
"""

import json
from dataclasses import asdict, dataclass, field

from app import db
from app.config import DATES_PER_SESSION, N_SESSIONS

STATE_KEY = "kg:event_state"


@dataclass
class EventState:
    # "planned" | "open" | "closed" per session; same per date of an open/closed session
    sessions: list[str] = field(default_factory=lambda: ["planned"] * N_SESSIONS)
    dates: dict[str, list[str]] = field(default_factory=dict)  # str(session) -> date states
    closed_ticks: int = 0  # number of dates closed so far = graph revision
    last_tick: int = -1  # tick of the most recently closed date
    metrics: list[dict] = field(default_factory=list)
    prev_comp: list[list[float]] | None = None  # comp matrix at the last close, for stability
    humans: list[str] = field(default_factory=list)  # raters answered by people, not the simulator
    last_question: dict | None = None  # most recent generated question with its why, for the UI

    def date_states(self, s: int) -> list[str]:
        return self.dates.get(str(s), ["planned"] * DATES_PER_SESSION)

    def current_tick(self) -> int:
        """Tick that new evidence belongs to: the open date's, else the next one
        after the last close. Check-ins between dates count toward the next close."""
        cur = self.current()
        return DATES_PER_SESSION * cur[0] + cur[1] if cur else self.last_tick + 1

    def current(self) -> tuple[int, int] | None:
        """(session, date) currently open, if any."""
        for s, st in enumerate(self.sessions):
            if st == "open":
                ds = self.date_states(s)
                if "open" in ds:
                    return s, ds.index("open")
        return None


def load() -> EventState:
    raw = db.get_db().connection.get(STATE_KEY)
    if not raw:
        return EventState()
    return EventState(**json.loads(raw))


def save(st: EventState) -> None:
    db.get_db().connection.set(STATE_KEY, json.dumps(asdict(st)))


def reset() -> None:
    db.get_db().connection.delete(STATE_KEY)
