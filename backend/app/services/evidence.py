"""Fold answers into graph updates (design doc 3.1, 3.4, 3.5, 3.6).

Accumulates interest, reliability and likability deltas plus LEARNED_FROM
edges for a batch of meetings, then writes them in one pass.
"""

from collections import defaultdict

import numpy as np

from app import db, mathcore
from app.config import LIKE_PRIOR, S_DISCUSS, S_LEARNER
from app.services.competence import write_learned_edges
from app.services.survey_store import claim_answers
from app.snapshot import People


class Evidence:
    def __init__(self, people: People):
        self.p = people
        self.edges: dict[int, list[tuple[str, str]]] = defaultdict(list)
        self.touched: set[int] = set()

    def _learn(self, k: int, learner: str, expert: str) -> None:
        self.edges[k].append((learner, expert))
        self.p.int_a[self.p.ix[learner], k] += S_LEARNER
        self.touched.add(self.p.ix[learner])

    def _discussed(self, k: int, *ids: str) -> None:
        for a in ids:
            self.p.int_a[self.p.ix[a], k] += S_DISCUSS
            self.touched.add(self.p.ix[a])

    def _like(self, rater_answers: dict, partner: str) -> None:
        meet = rater_answers.get("meet_again")
        if meet is None:
            return
        i = self.p.ix[partner]
        if meet == "yes":
            self.p.like_a[i] += 1
        else:
            self.p.like_b[i] += 1
        self.touched.add(i)

    def meeting(self, a: str, b: str, qa: list[dict] | None, aa: dict | None, qb: list[dict] | None, ab: dict | None) -> None:
        """One date between a and b. Pass None questions/answers for a rater
        who said they didn't meet or never answered; they contribute nothing."""
        ca = claim_answers(qa, aa) if qa is not None else {}
        cb = claim_answers(qb, ab) if qb is not None else {}
        sym = {"u": a, "v": b}
        for k in set(ca) | set(cb):
            ra = mathcore.reduce_claims(ca[k].get("partner_taught"), ca[k].get("self_taught")) if k in ca else None
            rb = mathcore.reduce_claims(cb[k].get("partner_taught"), cb[k].get("self_taught")) if k in cb else None
            dirs, rel = mathcore.combine_answers(ra, rb)
            if mathcore.came_up(ra) or mathcore.came_up(rb):
                self._discussed(k, a, b)
            for learner, expert in dirs:
                self._learn(k, sym[learner], sym[expert])
            if rel:
                for x in (a, b):
                    i = self.p.ix[x]
                    if rel == "agree":
                        self.p.rel_a[i] += 1
                    else:
                        self.p.rel_b[i] += 1
                    self.touched.add(i)
        if aa is not None:
            self._like(aa, b)
        if ab is not None:
            self._like(ab, a)

    def checkin(self, rater: str, partner: str, questions: list[dict], answers: dict) -> None:
        """One rater's check-in survey: single-answer directions only, no reliability."""
        sym = {"u": rater, "v": partner}
        for k, claims in claim_answers(questions, answers).items():
            r = mathcore.reduce_claims(claims.get("partner_taught"), claims.get("self_taught"))
            if mathcore.came_up(r):
                self._discussed(k, rater, partner)
            dirs, _ = mathcore.combine_answers(r, None)
            for learner, expert in dirs:
                self._learn(k, sym[learner], sym[expert])
        self._like(answers, partner)

    def flush(self, s: int | None, d: int | None, tick: int) -> int:
        """Write edges and node updates. Returns the number of edges written."""
        write_learned_edges(self.edges, s, d, tick)
        p = self.p
        p.interest = mathcore.beta_mean(p.int_a, p.int_b)
        p.like = mathcore.beta_mean(p.like_a, p.like_b)
        rows = [
            {
                "id": p.ids[i],
                "int_a": p.int_a[i].round(4).tolist(),
                "interest": p.interest[i].round(4).tolist(),
                "rel_a": float(p.rel_a[i]),
                "rel_b": float(p.rel_b[i]),
                "like_a": float(p.like_a[i]),
                "like_b": float(p.like_b[i]),
                "like": round(float(p.like[i]), 4),
            }
            for i in sorted(self.touched)
        ]
        db.run_batched(
            db.people(),
            """UNWIND $rows AS r MATCH (a:Attendee {id: r.id})
            SET a.int_a = r.int_a, a.interest = r.interest, a.rel_a = r.rel_a, a.rel_b = r.rel_b,
                a.like_a = r.like_a, a.like_b = r.like_b, a.like = r.like""",
            rows,
        )
        return int(sum(len(v) for v in self.edges.values()))


def like_counts(people: People) -> np.ndarray:
    """meet_again answers behind each attendee's likability."""
    return people.like_a + people.like_b - sum(LIKE_PRIOR)
