"""The graph event language: GET /events payloads and GET /graph/snapshot match
graph-view/src/graph/types.ts (the same shapes the recorded demo feed uses)."""

import pytest
from fastapi.testclient import TestClient

from app import db, state
from app.events import bus
from app.main import app
from app.services import pipeline, seed

client = TestClient(app)

REQUIRED = {
    "session_opened": {"session", "attendees", "dates"},
    "date_opened": {"session", "date_no", "tick"},
    "answer_recorded": {"source", "tick", "rater_id", "partner_id", "answers", "complete"},
    "date_closed": {"session", "date_no", "tick", "metrics", "nodes", "edges"},
    "session_closed": {"session"},
    "checkin_recorded": {"scanner_id", "scanned_id", "tick", "count"},
}


@pytest.fixture(scope="module")
def recorded():
    try:
        db.ping()
    except Exception:  # noqa: BLE001
        pytest.skip("FalkorDB not reachable")
    seed.seed()
    state.reset()
    events: list[tuple[str, dict]] = []
    listener = lambda e, d: events.append((e, d))  # noqa: E731
    bus.add_listener(listener)
    try:
        snap_before = client.get("/graph/snapshot").json()
        pipeline.open_session(0)
        pipeline.simulate_date(0, 0)
        pipeline.close_date(0, 0)
    finally:
        bus.remove_listener(listener)
    return snap_before, events


def of(events, name):
    return [d for e, d in events if e == name]


def test_every_event_has_its_contract_fields(recorded):
    _, events = recorded
    assert {e for e, _ in events} >= {"session_opened", "date_opened", "answer_recorded", "date_closed", "checkin_recorded"}
    for e, d in events:
        assert REQUIRED[e] <= set(d), (e, REQUIRED[e] - set(d))
        assert "date" not in d, "the field is date_no everywhere"


def test_session_opened_carries_the_plan(recorded):
    (so,) = of(recorded[1], "session_opened")
    assert len(so["attendees"]) == 200 and len(so["dates"]) == 4
    assert all({"a", "b", "value"} <= set(p) for date in so["dates"] for p in date)


def test_answers_carry_what_was_asked(recorded):
    date_answers = [d for d in of(recorded[1], "answer_recorded") if d["source"] == "date"]
    assert date_answers and all(d["session"] == 0 and d["date_no"] == 0 and d["tick"] == 0 for d in date_answers)
    claims = [a for d in date_answers for a in d["answers"] if a["kind"] == "claim"]
    assert claims and all({"topic_id", "claim", "value", "text", "why"} <= set(a) for a in claims)
    assert {a["value"] for a in claims} <= {"true", "false", "skip"}


def test_date_closed_has_changed_nodes_and_new_edges(recorded):
    (dc,) = of(recorded[1], "date_closed")
    assert dc["tick"] == 0 and dc["edges"] and dc["nodes"]
    assert all(e["tick"] == 0 and {"topic_id", "source", "target"} <= set(e) for e in dc["edges"])
    assert all("id" in n and len(n) > 1 for n in dc["nodes"])
    assert {"act_yes_rate", "meet_again_rate", "date_no"} <= set(dc["metrics"])


def test_checkins_after_a_close_count_toward_the_next_tick(recorded):
    ticks = {d["tick"] for d in of(recorded[1], "checkin_recorded")}
    assert ticks == {1}
    checkin_answers = [d for d in of(recorded[1], "answer_recorded") if d["source"] == "checkin"]
    assert checkin_answers and all(d["tick"] == 1 for d in checkin_answers)


def test_snapshot_shape(recorded):
    before, _ = recorded
    assert before["tick"] == -1 and before["session"] is None and before["edges"] == []
    assert len(before["attendees"]) == 1000 and len(before["topics"]) == 10
    a = before["attendees"][0]
    assert {"id", "name", "comp", "comp_unc", "interest", "m", "like", "tribe", "sessions"} <= set(a)
    after = client.get("/graph/snapshot").json()
    assert after["tick"] == 0 and after["session"]["session"] == 0 and after["session"]["date_no"] == 1
    assert {m["kind"] for m in after["meetings"]} == {"date", "checkin"}
