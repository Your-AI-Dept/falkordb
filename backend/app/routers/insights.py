"""Graph views, metrics and micro-influencers (design doc 4.3, 7, 8.3)."""

from fastapi import APIRouter, Depends, HTTPException

from app import stubs
from app.models import InfluencerResult, Metrics, TieGraph, TopicGraph

router = APIRouter(tags=["insights"], dependencies=[Depends(stubs.mark_stub)])


def _known_topic(topic_id: str) -> str:
    if topic_id not in {t.id for t in stubs.topics()}:
        raise HTTPException(404, f"topic {topic_id} not found")
    return topic_id


@router.get("/graph/topics/{topic_id}", response_model=TopicGraph)
def topic_graph(topic_id: str):
    return stubs.topic_graph(_known_topic(topic_id))


@router.get("/graph/ties", response_model=TieGraph)
def tie_graph():
    return stubs.tie_graph()


@router.get("/topics/{topic_id}/influencers", response_model=InfluencerResult)
def topic_influencers(topic_id: str):
    return stubs.influencers("topic", _known_topic(topic_id))


@router.get("/vendors/{vendor_id}/influencers", response_model=InfluencerResult)
def vendor_influencers(vendor_id: str):
    result = stubs.influencers("vendor", vendor_id)
    if result is None:
        raise HTTPException(404, f"vendor {vendor_id} not found")
    return result


@router.get("/metrics", response_model=Metrics)
def metrics():
    return Metrics(points=stubs.metrics_points())
