"""Seed (build plan P1): counts, determinism, synthetic-field distributions, catalog reads."""

import statistics

import pytest
from fastapi.testclient import TestClient

from app import db
from app.config import N_SESSIONS, SESSION_SIZE, T
from app.main import app
from app.services import seed


def _db_up() -> bool:
    try:
        return db.ping()
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(not _db_up(), reason="FalkorDB not reachable")

client = TestClient(app)


def _linkedin_edges() -> set[tuple[str, str]]:
    rows = db.people().query("MATCH (a:Attendee)-[r:LINKEDIN]->(b:Attendee) RETURN a.id, b.id").result_set
    return {(a, b) for a, b in rows}


def _sessions() -> dict[str, list[int]]:
    return dict(db.people().query("MATCH (a:Attendee) RETURN a.id, a.sessions").result_set)


@pytest.fixture(scope="module")
def seeded():
    first = seed.seed()
    snapshot = (_linkedin_edges(), _sessions())
    second = seed.seed()
    return first, second, snapshot


def test_counts(seeded):
    result = seeded[1]
    assert (result.topics, result.talks, result.vendors, result.attendees) == (10, 47, 73, 1000)
    g = db.content()
    assert g.query("MATCH (t:Topic) RETURN count(t)").result_set[0][0] == 10
    assert g.query("MATCH (t:Talk) RETURN count(t)").result_set[0][0] == 47
    assert g.query("MATCH (v:Vendor) RETURN count(v)").result_set[0][0] == 73
    assert db.people().query("MATCH (a:Attendee) RETURN count(a)").result_set[0][0] == 1000


def test_seed_is_fast(seeded):
    assert seeded[1].seconds < 30


def test_deterministic(seeded):
    edges, sessions = seeded[2]
    assert _linkedin_edges() == edges
    assert _sessions() == sessions


def test_linkedin_symmetric_and_degree(seeded):
    edges = _linkedin_edges()
    assert all((b, a) in edges for a, b in edges), "LINKEDIN must be stored in both directions"
    assert len(edges) // 2 == seeded[1].linkedin_edges
    degree = db.people().query(
        "MATCH (a:Attendee) OPTIONAL MATCH (a)-[l:LINKEDIN]->() RETURN a.id, count(l)"
    ).result_set
    degrees = [r[1] for r in degree]
    assert 5 <= statistics.mean(degrees) <= 10
    assert min(degrees) >= 5


def test_adhoc_starts_empty(seeded):
    assert db.people().query("MATCH ()-[r:ADHOC]->() RETURN count(r)").result_set[0][0] == 0


def test_session_attendance(seeded):
    sizes = [len(seed.session_attendees(s)) for s in range(N_SESSIONS)]
    assert sizes == [SESSION_SIZE] * N_SESSIONS
    per_person = [len(v) for v in _sessions().values()]
    assert 2.5 <= statistics.mean(per_person) <= 3.5
    assert min(per_person) == 0, "attendance should be uneven, some attend none"


def test_vectors_and_priors(seeded):
    rows = db.people().query(
        "MATCH (a:Attendee) RETURN a.int_a, a.int_b, a.interest, a.comp_prior, a.comp, a.comp_unc, a.m, a.pr"
    ).result_set
    for row in rows:
        assert all(len(v) == T for v in row)
        int_a, int_b, interest, comp_prior, comp, comp_unc, m, pr = row
        assert all(0 < x < 1 for x in interest)
        assert all(0.5 <= x <= 0.8 for x in comp_prior)
        assert comp == comp_prior and comp_unc == [1.0] * T and m == [0] * T


def test_speakers_and_staff_get_priors(seeded):
    g = db.people()
    speaker = g.query(
        "MATCH (a:Attendee) WHERE a.is_speaker RETURN a.speaker_topics, a.comp_prior LIMIT 1"
    ).result_set[0]
    topics, prior = speaker
    assert topics and all(prior[k] == 0.8 for k in topics)
    staff = g.query("MATCH (a:Attendee) WHERE a.exhibitor_id <> '' RETURN count(a)").result_set[0][0]
    assert staff > 0


def test_related_topics(seeded):
    rows = db.content().query("MATCH (a:Topic)-[r:RELATED]->(b:Topic) RETURN a.idx, b.idx, r.w").result_set
    pairs = {(a, b) for a, b, _ in rows}
    assert all((b, a) in pairs for a, b in pairs)
    assert all(0 < w <= 1 for _, _, w in rows)
    assert {a for a, _ in pairs} == set(range(T)), "every topic has a neighbor"


def test_attendee_route_returns_vectors(seeded):
    r = client.get("/attendees/PE27-00001")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["topics"]) == T
    assert body["ties"]["linkedin"] >= 5
    assert len(body["top_interests"]) == 3


def test_attendee_route_404(seeded):
    assert client.get("/attendees/PE27-99999").status_code == 404


def test_catalog_routes(seeded):
    talks = client.get("/talks").json()
    assert len(talks) == 47 and all(abs(sum(t["w"] for t in talk["topics"]) - 1) < 1e-6 for talk in talks)
    vendors = client.get("/vendors").json()
    assert len(vendors) == 73 and all(abs(sum(v["profile"].values()) - 1) < 1e-6 for v in vendors)
    assert len(client.get("/attendees").json()) == 1000


def test_unseeded_catalog_is_409():
    seed.reset()
    try:
        r = client.get("/topics")
        assert r.status_code == 409
        assert "not seeded" in r.json()["detail"]
    finally:
        seed.seed()
