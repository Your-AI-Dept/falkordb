"""Read the people graph into numpy arrays for vectorized math.

One query for all attendees (1,000 rows); callers index rows by `People.ix`.
"""

from dataclasses import dataclass

import numpy as np
from fastapi import HTTPException

from app import db

_FIELDS = [
    "id", "name", "company", "title", "business_type", "ticket_type", "is_speaker", "speaker_topics",
    "exhibitor_id", "years_exp", "sessions", "int_a", "int_b", "interest", "comp_prior", "pr", "m",
    "comp", "comp_unc", "rel_a", "rel_b", "like_a", "like_b", "like", "tribe", "broker", "reach",
    "cum_value", "sat_out", "reached",
]


@dataclass
class People:
    ids: list[str]
    ix: dict[str, int]
    rows: list[dict]  # raw properties per attendee
    interest: np.ndarray  # [N, T]
    int_a: np.ndarray
    int_b: np.ndarray
    comp_prior: np.ndarray
    comp: np.ndarray
    comp_unc: np.ndarray
    pr: np.ndarray
    m: np.ndarray
    like: np.ndarray  # [N]
    like_a: np.ndarray
    like_b: np.ndarray
    rel_a: np.ndarray
    rel_b: np.ndarray
    tribe: np.ndarray
    broker: np.ndarray
    reach: np.ndarray

    @property
    def n(self) -> int:
        return len(self.ids)

    def s(self) -> np.ndarray:
        """Log-ratio PageRank scores s_k(u) (design doc 3.3). Layers never
        ranked (pr == 0) count as average, s = 0."""
        pr = np.where(self.pr > 0, self.pr, 1.0 / self.n)
        return np.log(self.n * pr)

    def reliability(self) -> np.ndarray:
        return self.rel_a / (self.rel_a + self.rel_b)


def load_people() -> People:
    ret = ", ".join(f"a.{f}" for f in _FIELDS)
    rows = db.people().query(f"MATCH (a:Attendee) RETURN {ret} ORDER BY a.id").result_set
    if not rows:
        raise HTTPException(409, "graph not seeded; POST /admin/seed")
    dicts = [dict(zip(_FIELDS, r)) for r in rows]
    ids = [d["id"] for d in dicts]

    def mat(f):
        return np.array([d[f] for d in dicts], dtype=float)

    return People(
        ids=ids,
        ix={a: i for i, a in enumerate(ids)},
        rows=dicts,
        interest=mat("interest"),
        int_a=mat("int_a"),
        int_b=mat("int_b"),
        comp_prior=mat("comp_prior"),
        comp=mat("comp"),
        comp_unc=mat("comp_unc"),
        pr=mat("pr"),
        m=mat("m"),
        like=mat("like"),
        like_a=mat("like_a"),
        like_b=mat("like_b"),
        rel_a=mat("rel_a"),
        rel_b=mat("rel_b"),
        tribe=np.array([d["tribe"] for d in dicts], dtype=int),
        broker=mat("broker"),
        reach=mat("reach"),
    )


def person_ref(row: dict) -> dict:
    return {"id": row["id"], "name": row["name"], "company": row["company"] or "", "title": row["title"] or ""}
