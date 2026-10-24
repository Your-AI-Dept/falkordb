"""Graph views, metrics, expert rankings and micro-influencers (design doc 4.3, 7, 8.3)."""

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query

from app import db, state
from app.cypher import learned_from
from app.models import InfluencerResult, Metrics, TieGraph, TopicGraph, TopicRanking
from app.routers.catalog import require_seeded
from app.services import competence, influencers, ties
from app.snapshot import load_people
from app.topics import idx, is_topic, topic_descriptions, topic_ids, topic_names

router = APIRouter(tags=["insights"], dependencies=[Depends(require_seeded)])


def _topic(topic_id: str) -> int:
    if not is_topic(topic_id):
        raise HTTPException(404, f"topic {topic_id} not found")
    return idx(topic_id)


def _topic_model(k: int) -> dict:
    return {"id": topic_ids()[k], "idx": k, "name": topic_names()[k], "description": topic_descriptions()[k]}


@router.get("/graph/topics/{topic_id}", response_model=TopicGraph)
def topic_graph(topic_id: str):
    """One LEARNED_FROM_T{k} layer: every attendee (size comp, ring comp_unc, color tribe) and learner -> expert edges."""
    k = _topic(topic_id)
    people = load_people()
    edges = db.people().query(
        f"MATCH (l:Attendee)-[r:{learned_from(k)}]->(x:Attendee) RETURN l.id, x.id, r.tick"
    ).result_set
    nodes = [
        {"id": a, "name": people.rows[i]["name"], "comp": round(float(people.comp[i, k]), 4),
         "comp_unc": round(float(people.comp_unc[i, k]), 4), "tribe": int(people.tribe[i]),
         "like": round(float(people.like[i]), 4), "m": int(people.m[i, k])}
        for i, a in enumerate(people.ids)
    ]
    return {"topic_id": topic_id, "tick": max((t for *_, t in edges), default=-1), "nodes": nodes,
            "edges": [{"source": l, "target": x, "tick": t} for l, x, t in edges]}


@router.get("/graph/ties", response_model=TieGraph)
def tie_graph():
    people = load_people()
    edges = db.people().query("MATCH (u:Attendee)-[p:POS_TIE]->(v:Attendee) RETURN u.id, v.id, p.p_pos").result_set
    nodes = [{"id": a, "name": people.rows[i]["name"], "tribe": int(people.tribe[i]),
              "broker": float(people.broker[i]), "reach": float(people.reach[i])} for i, a in enumerate(people.ids)]
    return {"nodes": nodes, "edges": [{"source": u, "target": v, "p_pos": p} for u, v, p in edges]}


@router.get("/topics/{topic_id}/experts", response_model=TopicRanking)
def topic_experts(topic_id: str, limit: int = Query(5, ge=1, le=50)):
    """Top people for a topic, ranked by estimated competence (comp), with reasons."""
    k = _topic(topic_id)
    return {"topic": _topic_model(k), "limit": limit, "graph_revision": state.load().closed_ticks, "status": "ready",
            "items": competence.rank_experts(load_people(), k, limit)}


def _influencers(kind: str, event_id: str, name: str, x: np.ndarray, vendor_id: str | None) -> dict:
    result = influencers.select(load_people(), ties.load_tie_table(), x, vendor_id)
    profile = {topic_ids()[k]: round(float(w), 4) for k, w in enumerate(x) if w > 0}
    return {"event": {"kind": kind, "id": event_id, "name": name, "profile": profile}, **result}


@router.get("/topics/{topic_id}/influencers", response_model=InfluencerResult)
def topic_influencers(topic_id: str):
    """Who to give tickets to for a party on this topic."""
    k = _topic(topic_id)
    x = np.zeros(len(topic_ids()))
    x[k] = 1.0
    return _influencers("topic", topic_id, topic_names()[k], x, None)


@router.get("/vendors/{vendor_id}/influencers", response_model=InfluencerResult)
def vendor_influencers(vendor_id: str):
    """Who to give tickets to for this vendor's event (profile = the vendor's topics)."""
    rows = db.content().query("MATCH (v:Vendor {id: $id}) RETURN v.name, v.profile", {"id": vendor_id}).result_set
    if not rows:
        raise HTTPException(404, f"vendor {vendor_id} not found")
    name, profile = rows[0]
    return _influencers("vendor", vendor_id, name, np.asarray(profile, dtype=float), vendor_id)


@router.get("/metrics", response_model=Metrics)
def metrics():
    return {"points": state.load().metrics}


@router.get("/questions/latest")
def latest_question():
    """The most recently generated question with its `why`, for the graph view's side panel."""
    return state.load().last_question
