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
    "/topics/dough-flour/experts",
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
    kinds = [q["kind"] for q in qs["questions"]]
    assert kinds[0] == "met", "attendance check comes first"
    assert 6 <= len(kinds) - 1 <= 8, "6-8 questions after the attendance check"
    assert kinds[-2:] == ["act", "meet_again"]
    claims = [q for q in qs["questions"] if q["kind"] == "claim"]
    assert all("skip" in [o["value"] for o in q["options"]] for q in claims), "Didn't come up must always be offered"
    assert qs["current_question_id"] == "met" and qs["survey_revision"] == 0 and not qs["complete"]
    assert qs["meeting_id"].startswith("s1-d1-")


def _answer(path, question_id, value):
    return client.post(path, json={"answers": [{"question_id": question_id, "value": value}]})


def test_save_on_tap_advances_and_completes():
    rater = "PE27-00003"
    base = f"/sessions/2/dates/0/meetings/{rater}"
    qs = client.get(f"{base}/questions").json()
    for i, q in enumerate(qs["questions"], start=1):
        body = _answer(f"{base}/answers", q["question_id"], q["options"][0]["value"]).json()
        assert body["survey_revision"] == i
    assert body["complete"] and body["current_question_id"] is None


def test_retry_is_idempotent():
    rater = "PE27-00004"
    path = f"/sessions/2/dates/0/meetings/{rater}/answers"
    first = _answer(path, "met", "yes").json()
    again = _answer(path, "met", "yes").json()
    assert first["survey_revision"] == again["survey_revision"] == 1
    assert again["current_question_id"] != "met"


def test_didnt_meet_completes_without_other_answers():
    rater = "PE27-00005"
    body = _answer(f"/sessions/2/dates/0/meetings/{rater}/answers", "met", "no").json()
    assert body["complete"] and body["current_question_id"] is None
    assert body["answers"] == {"met": "no"}


def test_both_participants_share_a_meeting_id():
    plan = client.get("/sessions/1").json()
    pair = plan["dates"][1]["pairs"][0]
    a = client.get(f"/sessions/1/dates/1/meetings/{pair['a']['id']}/questions").json()
    b = client.get(f"/sessions/1/dates/1/meetings/{pair['b']['id']}/questions").json()
    assert a["meeting_id"] == b["meeting_id"]
    assert a["partner"]["id"] == pair["b"]["id"]


@pytest.mark.parametrize(
    "question_id,value", [("nope", "true"), ("met", "maybe")], ids=["unknown question", "invalid option"]
)
def test_submit_answers_rejects_bad_input(question_id, value):
    r = _answer(f"/sessions/1/dates/1/meetings/{ATTENDEE}/answers", question_id, value)
    assert r.status_code == 422


def test_topic_experts_ranking():
    body = client.get("/topics/dough-flour/experts?limit=5").json()
    assert body["topic"]["id"] == "dough-flour" and body["limit"] == 5
    assert [i["rank"] for i in body["items"]] == list(range(1, len(body["items"]) + 1))
    assert len({i["person"]["id"] for i in body["items"]}) == len(body["items"])
    comps = [i["comp"] for i in body["items"]]
    assert comps == sorted(comps, reverse=True)
    assert all(i["reason"] and i["evidence"] for i in body["items"])


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
