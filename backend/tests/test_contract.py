"""Every route in the API contract responds and validates against its model."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ATTENDEE = "PE27-00001"
PARTNER = "PE27-00002"

GETS = [
    "/topics",
    "/talks",
    "/vendors",
    "/attendees",
    f"/attendees/{ATTENDEE}",
    "/sessions",
    "/sessions/1",
    f"/sessions/1/dates/1/meetings/{ATTENDEE}/questions",
    f"/checkins/{ATTENDEE}/{PARTNER}/questions",
    "/graph/topics/dough-flour",
    "/graph/ties",
    "/topics/dough-flour/influencers",
    "/vendors/EX-001/influencers",
    "/metrics",
]


@pytest.mark.parametrize("path", GETS)
def test_get_routes(path):
    r = client.get(path)
    assert r.status_code == 200, r.text
    assert r.headers["X-Stub"] == "true"


def test_topics_use_string_ids_in_file_order():
    topics = client.get("/topics").json()
    assert len(topics) == 10
    assert [t["idx"] for t in topics] == list(range(10))
    assert topics[0]["id"] == "cheese-dairy"


def test_open_session_plans_four_matchings():
    plan = client.post("/sessions/1/open").json()
    assert len(plan["dates"]) == 4
    for date in plan["dates"]:
        ids = [p["a"]["id"] for p in date["pairs"]] + [p["b"]["id"] for p in date["pairs"]]
        assert len(ids) == len(set(ids)), "someone is double-booked"


def test_date_questions_shape():
    qs = client.get(f"/sessions/1/dates/1/meetings/{ATTENDEE}/questions").json()
    assert 6 <= len(qs["questions"]) <= 8
    claims = [q for q in qs["questions"] if q["kind"] == "claim"]
    assert all("skip" in [o["value"] for o in q["options"]] for q in claims), "Didn't come up must always be offered"
    assert [q["kind"] for q in qs["questions"][-2:]] == ["act", "meet_again"]


def test_submit_answers_rejects_unknown_question():
    r = client.post(
        f"/sessions/1/dates/1/meetings/{ATTENDEE}/answers",
        json={"answers": [{"question_id": "nope", "value": "true"}]},
    )
    assert r.status_code == 422


def test_close_last_date_closes_session():
    body = client.post("/sessions/1/dates/3/close").json()
    assert body["next_date"] is None and body["session_state"] == "closed"


def test_checkin_returns_both_question_sets():
    r = client.post("/checkins", json={"scanner_id": ATTENDEE, "scanned_id": PARTNER})
    assert r.status_code == 200
    body = r.json()
    assert 2 <= len(body["scanner_questions"]["questions"]) <= 3
    assert body["scanned_questions"]["partner"]["id"] == ATTENDEE


def test_checkin_with_self_rejected():
    r = client.post("/checkins", json={"scanner_id": ATTENDEE, "scanned_id": ATTENDEE})
    assert r.status_code == 422


@pytest.mark.parametrize("path", ["/sessions/15", "/sessions/0/dates/4/close"])
def test_out_of_range_session_or_date(path):
    r = client.post(path) if path.endswith("close") else client.get(path)
    assert r.status_code == 422


def test_unknown_topic_404():
    assert client.get("/graph/topics/not-a-topic").status_code == 404


def test_admin_routes_are_honest_501():
    assert client.post("/admin/seed").status_code == 501
