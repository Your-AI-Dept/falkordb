"""Explainability: why two people were matched, why micro-influencers were picked."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import db, mathcore, state
from app.main import app
from app.services import pairing, pipeline, seed, ties
from app.snapshot import load_people

client = TestClient(app)


@pytest.fixture(scope="module")
def show():
    try:
        db.ping()
    except Exception:  # noqa: BLE001
        pytest.skip("FalkorDB not reachable")
    seed.seed()
    state.reset()
    pipeline.open_session(0)
    pipeline.simulate_date(0, 0)
    pipeline.close_date(0, 0)
    return client.get("/sessions/0").json()


def test_components_sum_to_pair_value(show):
    people = load_people()
    ids = seed.session_attendees(1)[:30]
    V, comps = pairing.value_components(people, ids, ties.load_tie_table())
    assert np.allclose(V, sum(comps.values()))
    i, j = 0, 1
    expected = mathcore.pair_value(
        comps["learn"][i, j], comps["enjoy"][i, j] / 0.5, comps["new_circle"][i, j] > 0,
        comps["already_connected"][i, j] < 0, comps["explore"][i, j] / 0.3,
    )
    assert V[i, j] == pytest.approx(expected)


def test_why_we_matched_shape(show):
    pair = show["dates"][1]["pairs"][0]
    w = client.get(f"/sessions/0/dates/1/meetings/{pair['a']['id']}/why").json()
    assert w["partner"]["id"] == pair["b"]["id"] and w["headline"]
    score = w["score"]
    assert score["pair_score"] == pytest.approx(min(score["value_for_you"], score["value_for_them"]), abs=1e-3)
    assert sum(score["components"].values()) == pytest.approx(score["value_for_you"], abs=1e-3)
    assert score["date_floor"] is not None and score["pair_score"] >= score["date_floor"] - 1e-6
    kinds = [r["kind"] for r in w["reasons"]]
    assert kinds[0] in {"learn_from_them", "shared_interest", "new_circle", "explore"}
    assert "learn_from_you" in kinds and kinds[-1] == "fair_floor"
    weights = [r["weight"] for r in w["reasons"] if r["weight"] is not None]
    assert weights == sorted(weights, reverse=True)
    assert w["path"] is None or (w["path"][0]["person"]["id"] == pair["a"]["id"] and w["path"][-1]["via"] is None)
    assert any("shortestPath" in q["cypher"] for q in w["evidence_queries"])


def test_why_is_display_safe(show):
    pair = show["dates"][0]["pairs"][0]
    w = client.get(f"/sessions/0/dates/0/meetings/{pair['a']['id']}/why").json()
    text = " ".join(r["detail"] for r in w["reasons"]).lower()
    for private in ("answered", "said true", "said false", "rated you"):
        assert private not in text


def test_why_for_someone_without_a_meeting_is_404(show):
    assert client.get("/sessions/0/dates/0/meetings/PE27-99999/why").status_code == 404


def test_influencer_explanations(show):
    r = client.get("/topics/dough-flour/influencers").json()
    a = r["audience"]
    assert a["interested"] == r["n_targets"] and 0 <= a["covered"] <= a["interested"]
    assert a["expected_attendees"] == pytest.approx(r["expected_reach"], abs=1e-3)
    for n, inf in enumerate(r["influencers"], start=1):
        why = inf["why"]
        assert why["pick_order"] == n
        assert 0 <= why["competence_percentile"] <= 100 and 0 <= why["likability_percentile"] <= 100
        assert 0 <= why["unique_targets"] <= why["direct_targets"]
        assert [x["kind"] for x in why["reasons"]] == ["competent", "liked", "reach"]
    picked = {i["person"]["id"] for i in r["influencers"]}
    assert all(x["person"]["id"] not in picked for x in r["runners_up"])
    assert r["evidence_queries"]
