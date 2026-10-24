"""Record the graph view's demo feed from the real backend.

    docker compose up -d falkordb
    .venv/bin/python scripts/make_demo_feed.py        # writes graph-view/public/demo/feed.json.gz

Runs the actual backend code in-process (seed, then all 15 speed-dating sessions: open, simulate,
close each date, synthetic check-ins) and records every event it publishes on GET /events, plus the
starting GET /graph/snapshot. The graph view's demo mode replays this file through the same store
code as live mode, so demo and live show exactly the same product.

WARNING: this reseeds the `content` and `people` graphs and resets the event state on the FalkorDB
it connects to (FALKORDB_HOST/FALKORDB_PORT, default localhost:6379).
"""

import gzip
import json
import os
import random
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))

from app import state  # noqa: E402
from app.config import DATES_PER_SESSION, N_SESSIONS  # noqa: E402
from app.events import bus  # noqa: E402
from app.services import graph_events, pipeline, seed  # noqa: E402

OUT = os.path.join(ROOT, "graph-view", "public", "demo", "feed.json.gz")

# Playback timing at 1x speed
DATE_SECONDS = 20  # one 15-minute date
SESSION_GAP = 4  # between sessions
CHECKIN_SECONDS = 2  # check-ins after a close


def main() -> None:
    t_start = time.time()
    rng = random.Random(7)
    seed.seed()
    state.reset()
    snapshot = graph_events.snapshot()

    buffer: list[tuple[str, dict]] = []
    bus.add_listener(lambda event, data: buffer.append((event, data)))
    timeline: list[dict] = []

    def emit(t: float, items: list[tuple[str, dict]]) -> None:
        timeline.extend({"t": round(t, 2), "event": e, "data": d} for e, d in items)

    def spread(t0: float, t1: float, items: list[tuple[str, dict]]) -> None:
        for e, d in items:
            timeline.append({"t": round(rng.uniform(t0, t1), 2), "event": e, "data": d})

    def take() -> list[tuple[str, dict]]:
        items = buffer[:]
        buffer.clear()
        return items

    for s in range(N_SESSIONS):
        t_s = s * (DATES_PER_SESSION * DATE_SECONDS + SESSION_GAP)
        pipeline.open_session(s)
        opened = take()  # session_opened, date_opened(0)
        emit(t_s, opened[:1])
        emit(t_s + 0.5, opened[1:])
        for d in range(DATES_PER_SESSION):
            start = t_s + d * DATE_SECONDS + 0.5
            pipeline.simulate_date(s, d)
            spread(start + 1, start + 0.75 * DATE_SECONDS, take())  # answers arrive during the date
            pipeline.close_date(s, d)
            closed = take()
            t_close = start + DATE_SECONDS - 1.5
            i = 0
            while i < len(closed) and closed[i][0] != "date_closed":
                i += 1
            emit(t_close, closed[: i + 1])
            rest = closed[i + 1 :]
            tail = [x for x in rest if x[0] in ("date_opened", "session_closed")]
            checkins = [x for x in rest if x not in tail]
            spread(t_close + 0.1, t_close + CHECKIN_SECONDS, checkins)
            emit(t_close + CHECKIN_SECONDS + 0.1, tail)
        print(f"session {s + 1}/{N_SESSIONS} recorded ({time.time() - t_start:.0f}s)", flush=True)

    timeline.sort(key=lambda e: e["t"])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with gzip.open(OUT, "wt", encoding="utf-8") as f:
        json.dump({
            "note": "Recorded from the real backend: seed plus 15 simulated speed-dating sessions and check-ins (scripts/make_demo_feed.py).",
            "date_seconds": DATE_SECONDS, "snapshot": snapshot, "timeline": timeline,
        }, f, separators=(",", ":"))
    print(f"wrote {OUT}: {len(timeline)} events, {os.path.getsize(OUT) / 1e6:.1f} MB, {time.time() - t_start:.0f}s")


if __name__ == "__main__":
    main()
