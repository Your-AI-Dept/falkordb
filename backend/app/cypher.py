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
    "CREATE INDEX FOR (v:Vendor) ON (v.id)",
]
