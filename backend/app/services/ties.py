"""Dirichlet tie counts and POS_TIE rebuild (design doc 3.2, 3.8)."""

from collections import defaultdict
from dataclasses import dataclass, field

from app import db, mathcore
from app.config import POS_THRESH

ALL_EVIDENCE = """
MATCH (u:Attendee)-[r:LINKEDIN|ADHOC|SPEED_DATE]->(v:Attendee)
RETURN u.id, v.id, type(r), r.act
"""

DELETE_POS_TIES = "MATCH ()-[p:POS_TIE]->() DELETE p"

CREATE_POS_TIES = """
UNWIND $rows AS t
MATCH (u:Attendee {id: t.sender}), (v:Attendee {id: t.receiver})
CREATE (u)-[:POS_TIE {p_pos: t.p}]->(v)
"""


@dataclass
class TieTable:
    """Tie probabilities for ordered pairs (sender, receiver) with any evidence."""

    probs: dict[tuple[str, str], tuple[float, float, float]] = field(default_factory=dict)
    familiar: set[frozenset] = field(default_factory=set)  # LINKEDIN or ADHOC, unordered
    met: set[frozenset] = field(default_factory=set)  # any SPEED_DATE, unordered

    def p_pos(self, sender: str, receiver: str) -> float:
        return self.probs.get((sender, receiver), (0.0, 0.0, 0.0))[0]

    def p_neg(self, sender: str, receiver: str) -> float:
        return self.probs.get((sender, receiver), (0.0, 0.0, 0.0))[2]


def load_tie_table() -> TieTable:
    """One read of all tie evidence, folded into Dirichlet probabilities.

    Evidence for influence u -> v: LINKEDIN/ADHOC between them, and v's `act`
    answers on edges v -> u (influence flows opposite to the answer's edge).
    """
    rows = db.people().query(ALL_EVIDENCE).result_set
    linkedin: set[tuple[str, str]] = set()
    adhoc: dict[tuple[str, str], str | None] = {}
    speed: dict[tuple[str, str], list] = defaultdict(list)
    table = TieTable()
    for src, dst, typ, act in rows:
        if typ == "LINKEDIN":
            linkedin.add((src, dst))
            table.familiar.add(frozenset((src, dst)))
        elif typ == "ADHOC":
            adhoc[(dst, src)] = act  # src's answer about dst -> evidence for dst -> src
            table.familiar.add(frozenset((src, dst)))
        else:
            speed[(dst, src)].append(act)
            table.met.add(frozenset((src, dst)))
    pairs = linkedin | set(adhoc) | set(speed)
    for sender, receiver in pairs:
        counts = mathcore.tie_counts(
            linkedin=(sender, receiver) in linkedin,
            adhoc=(sender, receiver) in adhoc or (receiver, sender) in adhoc,
            adhoc_act=adhoc.get((sender, receiver)),
            speed_acts=speed.get((sender, receiver), ()),
        )
        table.probs[(sender, receiver)] = mathcore.tie_probs(counts)
    return table


def rebuild_pos_ties(table: TieTable) -> int:
    g = db.people()
    g.query(DELETE_POS_TIES)
    rows = [{"sender": s, "receiver": r, "p": p[0]} for (s, r), p in table.probs.items() if p[0] >= POS_THRESH]
    db.run_batched(g, CREATE_POS_TIES, rows)
    return len(rows)
