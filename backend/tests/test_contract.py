"""End-to-end API tests against a real seeded graph (FalkorDB must be running).

One module-scoped fixture seeds and opens session 0; tests then walk the
survey, close-date, check-in, ranking and influencer flows through HTTP.
"""

import pytest
from fastapi.testclient import TestClient

from app import db, state
from app.main import app
from app.services import seed

client = TestClient(app)


def _db_up() -> bool:
    try:
        return db.ping()
    except Exception:  # noqa: BLE001
        return False


@pytest.fixture(scope="module")
def session0():
    """Fresh seed, session 0 open with date 0 questions generated."""
    if not _db_up():
        pytest.skip("FalkorDB not reachable")
    seed.seed()
    state.reset()
    r = client.post("/sessions/0/open")
    assert r.status_code == 200, r.text
    return r.json()


def _pair(plan, d=0, i=0):
    p = plan["dates"][d]["pairs"][i]
    return p["a"]["id"], p["b"]["id"]


def _answer(path, question_id, value):
    return client.post(path, json={"answers": [{"question_id": question_id, "value": value}]})


GETS = [
    "/topics",
    "/talks",
    "/vendors",
    "/attendees",
    "/attendees/PE27-00001",
    "/sessions",
    "/sessions/0",
    "/graph/topics/dough-flour",
    "/graph/ties",
    "/topics/dough-flour/experts",
    "/topics/dough-flour/influencers",
    "/vendors/EX-001/influencers",
    "/metrics",
    "/admin/humans",
]


@pytest.mark.parametrize("path", GETS)
def test_get_routes(session0, path):
    r = client.get(path)
    assert r.status_code == 200, r.text


def test_topics_use_string_ids_in_file_order(session0):
    topics = client.get("/topics").json()
    assert [t["idx"] for t in topics] == list(range(10))
    assert topics[0]["id"] == "cheese-dairy"


def test_session_plan_is_four_valid_matchings(session0):
    plan = client.get("/sessions/0").json()
    assert plan["state"] == "open" and len(plan["dates"]) == 4
    seen = set()
    for date in plan["dates"]:
        ids = [p["a"]["id"] for p in date["pairs"]] + [p["b"]["id"] for p in date["pairs"]]
        assert len(ids) == len(set(ids)), "someone is double-booked within a date"
        assert len(date["pairs"]) >= 90, "nearly everyone is matched"
        for p in date["pairs"]:
            key = frozenset((p["a"]["id"], p["b"]["id"]))
            assert key not in seen, "pair repeated across dates"
            seen.add(key)
    assert [d["state"] for d in plan["dates"]] == ["open", "planned", "planned", "planned"]


def test_reopening_an_open_session_is_409(session0):
    assert client.post("/sessions/0/open").status_code == 409


def test_planned_date_questions_not_generated_yet(session0):
    a, _ = _pair(session0, d=1)
    assert client.get(f"/sessions/0/dates/1/meetings/{a}/questions").status_code == 409


def test_date_questions_shape(session0):
    a, b = _pair(session0)
    qs = client.get(f"/sessions/0/dates/0/meetings/{a}/questions").json()
    kinds = [q["kind"] for q in qs["questions"]]
    assert kinds[0] == "met" and kinds[-2:] == ["act", "meet_again"]
    assert 4 <= kinds.count("claim") <= 6
    claims = [q for q in qs["questions"] if q["kind"] == "claim"]
    assert all("skip" in [o["value"] for o in q["options"]] for q in claims), "Didn't come up must always be offered"
    assert all(q["why"] is not None for q in claims)
    assert qs["partner"]["id"] == b and qs["current_question_id"] == "met"
    other = client.get(f"/sessions/0/dates/0/meetings/{b}/questions").json()
    assert other["meeting_id"] == qs["meeting_id"]


def test_save_on_tap_retry_and_bad_input(session0):
    a, _ = _pair(session0, i=1)
    path = f"/sessions/0/dates/0/meetings/{a}/answers"
    first = _answer(path, "met", "yes").json()
    again = _answer(path, "met", "yes").json()
    assert first["survey_revision"] == again["survey_revision"] == 1
    assert _answer(path, "met", "maybe").status_code == 422
    assert _answer(path, "nope", "true").status_code == 422


def test_didnt_meet_completes(session0):
    a, _ = _pair(session0, i=2)
    body = _answer(f"/sessions/0/dates/0/meetings/{a}/answers", "met", "no").json()
    assert body["complete"] and body["current_question_id"] is None


def test_simulate_close_and_next_date(session0):
    r = client.post("/admin/simulate/sessions/0/dates/0")
    assert r.status_code == 200 and r.json()["answered"] > 150
    body = client.post("/sessions/0/dates/0/close").json()
    assert body["next_date"] == 1 and body["session_state"] == "open"
    assert body["metrics"]["uncertainty"] < 1.0
    graph = client.get("/graph/topics/dough-flour").json()
    assert graph["nodes"] and isinstance(graph["edges"], list)
    assert client.get("/metrics").json()["points"][-1]["tick"] == 0
    a, _ = _pair(session0, d=1)
    assert client.get(f"/sessions/0/dates/1/meetings/{a}/questions").status_code == 200


def test_checkin_flow(session0):
    r = client.post("/checkins", json={"scanner_id": "PE27-00001", "scanned_id": "PE27-00002"})
    assert r.status_code == 200, r.text
    qs = r.json()["scanner_questions"]
    assert 2 <= len(qs["questions"]) <= 3 and qs["context"] == "checkin"
    path = "/checkins/PE27-00001/PE27-00002/answers"
    for q in qs["questions"]:
        last = _answer(path, q["question_id"], q["options"][0]["value"]).json()
    assert last["complete"]


def test_checkin_with_self_rejected(session0):
    r = client.post("/checkins", json={"scanner_id": "PE27-00001", "scanned_id": "PE27-00001"})
    assert r.status_code == 422


def test_topic_experts_ranking(session0):
    body = client.get("/topics/dough-flour/experts?limit=5").json()
    assert body["topic"]["id"] == "dough-flour" and len(body["items"]) == 5
    assert [i["rank"] for i in body["items"]] == [1, 2, 3, 4, 5]
    from app.config import RANK_UNC_PENALTY

    scores = [i["comp"] - RANK_UNC_PENALTY * i["comp_unc"] for i in body["items"]]
    assert scores == sorted(scores, reverse=True)
    assert all(i["reason"] and i["evidence"] for i in body["items"])


def test_influencers_shape(session0):
    body = client.get("/topics/dough-flour/influencers").json()
    assert body["event"]["profile"] == {"dough-flour": 1.0}
    assert len(body["influencers"]) <= 5
    gains = [i["marginal_reach"] for i in body["influencers"]]
    assert gains == sorted(gains, reverse=True), "greedy gains are non-increasing"


@pytest.mark.parametrize("path", ["/sessions/15", "/graph/topics/not-a-topic"])
def test_bad_paths(session0, path):
    assert client.get(path).status_code in (404, 422)
