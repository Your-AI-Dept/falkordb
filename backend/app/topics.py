"""Topic coordinate system (design doc 0, 2.1).

String ids in the API; integer indices (order of data/program/topics.json)
for every vector and relationship type name.
"""

import json
from functools import lru_cache

from app.config import T, settings


@lru_cache
def _topics() -> list[dict]:
    topics = json.loads((settings.data_dir / "program/topics.json").read_text())
    assert len(topics) == T, f"expected {T} topics, found {len(topics)}"
    return topics


def topic_ids() -> list[str]:
    return [t["topic_id"] for t in _topics()]


def topic_names() -> list[str]:
    return [t["name"] for t in _topics()]


def topic_descriptions() -> list[str]:
    return [t["description"] for t in _topics()]


@lru_cache
def _idx_by_id() -> dict[str, int]:
    return {t: i for i, t in enumerate(topic_ids())}


@lru_cache
def _idx_by_name() -> dict[str, int]:
    return {n.lower(): i for i, n in enumerate(topic_names())}


def idx(topic_id: str) -> int:
    """Topic index for a string id; KeyError if unknown."""
    return _idx_by_id()[topic_id]


def idx_from_name(name: str) -> int | None:
    """Topic index for a display name (registration interests use names)."""
    return _idx_by_name().get(name.strip().lower())


def is_topic(topic_id: str) -> bool:
    return topic_id in _idx_by_id()
