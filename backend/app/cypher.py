"""Cypher query strings.

Relationship type names can't be parameterized in patterns, so any dynamic
type name is built here from whitelisted values, never from user input
(design doc 10).
"""

from app.config import T

PERSISTED_REL_TYPES = frozenset({"LINKEDIN", "ADHOC", "SPEED_DATE"})
DERIVED_REL_TYPES = frozenset({"POS_TIE"})


def learned_from(k: int) -> str:
    """Relationship type for topic layer k: LEARNED_FROM_T{k}."""
    if not isinstance(k, int) or isinstance(k, bool) or not 0 <= k < T:
        raise ValueError(f"topic index must be an int in 0..{T - 1}, got {k!r}")
    return f"LEARNED_FROM_T{k}"


# 2.5 Indexes
PEOPLE_INDEXES = [
    "CREATE INDEX FOR (a:Attendee) ON (a.id)",
]
CONTENT_INDEXES = [
    "CREATE INDEX FOR (t:Talk) ON (t.id)",
    "CREATE INDEX FOR (t:Topic) ON (t.idx)",
    "CREATE INDEX FOR (t:Topic) ON (t.id)",
    "CREATE INDEX FOR (v:Vendor) ON (v.id)",
]


# --- Seed (design doc 2, 8.1) -------------------------------------------------

CREATE_TOPICS = """
UNWIND $rows AS r
CREATE (:Topic {idx: r.idx, id: r.id, name: r.name, description: r.description})
"""

CREATE_TALKS = """
UNWIND $rows AS r
CREATE (:Talk {id: r.id, title: r.title, type: r.type, day: r.day, start: r.start, end: r.end,
               room: r.room, topic_vec: r.topic_vec, speaker_ids: r.speaker_ids})
"""

CREATE_VENDORS = """
UNWIND $rows AS r
CREATE (:Vendor {id: r.id, name: r.name, category: r.category, booth: r.booth,
                 booth_size: r.booth_size, profile: r.profile, staff: r.staff})
"""

CREATE_ABOUT = """
UNWIND $rows AS r
MATCH (t:Talk {id: r.src}), (k:Topic {idx: r.k})
CREATE (t)-[:ABOUT {w: r.w}]->(k)
"""

CREATE_TARGETS = """
UNWIND $rows AS r
MATCH (v:Vendor {id: r.src}), (k:Topic {idx: r.k})
CREATE (v)-[:TARGETS {w: r.w}]->(k)
"""

CREATE_RELATED = """
UNWIND $rows AS r
MATCH (a:Topic {idx: r.a}), (b:Topic {idx: r.b})
CREATE (a)-[:RELATED {w: r.w}]->(b)
"""

CREATE_ATTENDEES = """
UNWIND $rows AS r
CREATE (a:Attendee)
SET a = r
"""

CREATE_LINKEDIN = """
UNWIND $rows AS r
MATCH (a:Attendee {id: r.a}), (b:Attendee {id: r.b})
CREATE (a)-[:LINKEDIN {since: r.since}]->(b), (b)-[:LINKEDIN {since: r.since}]->(a)
"""

SESSION_ATTENDEES = """
MATCH (a:Attendee) WHERE $s IN a.sessions
RETURN a.id ORDER BY a.id
"""
