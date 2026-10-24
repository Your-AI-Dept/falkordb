"""LEARNED_FROM_T{k} writes, PageRank, competence, expert ranking (design doc 3.3, 3.4)."""

import numpy as np

from app import db, mathcore
from app.config import RANK_UNC_PENALTY, T
from app.cypher import learned_from
from app.snapshot import People, person_ref
from app.topics import topic_names


def write_learned_edges(edges: dict[int, list[tuple[str, str]]], s: int | None, d: int | None, tick: int) -> None:
    """edges: {topic_idx: [(learner, expert), ...]}"""
    g = db.people()
    for k, pairs in edges.items():
        if not pairs:
            continue
        db.run_batched(
            g,
            f"""UNWIND $rows AS e
            MATCH (l:Attendee {{id: e.learner}}), (x:Attendee {{id: e.expert}})
            CREATE (l)-[:{learned_from(k)} {{session: $s, date_no: $d, tick: $tick}}]->(x)""",
            [{"learner": a, "expert": b} for a, b in pairs],
            params={"s": s if s is not None else -1, "d": d if d is not None else -1, "tick": tick},
        )


def layers_with_edges() -> list[int]:
    g = db.people()
    out = []
    for k in range(T):
        n = g.query(f"MATCH ()-[r:{learned_from(k)}]->() RETURN count(r)").result_set
        if n and n[0][0] > 0:
            out.append(k)
    return out


def recompute(people: People) -> list[int]:
    """PageRank, m, comp and comp_unc for every topic layer with votes; writes
    the caches back. Returns the layers recomputed."""
    g = db.people()
    layers = layers_with_edges()
    pr, m = people.pr.copy(), people.m.copy()
    for k in layers:
        rel = learned_from(k)
        for aid, score in g.query(f"CALL algo.pageRank('Attendee', '{rel}') YIELD node, score RETURN node.id, score").result_set:
            pr[people.ix[aid], k] = score
        m[:, k] = 0
        for aid, cnt in g.query(f"MATCH (a:Attendee)-[r:{rel}]-(b:Attendee) RETURN a.id, count(DISTINCT b)").result_set:
            m[people.ix[aid], k] = cnt
    comp, unc = mathcore.competence(np.where(pr > 0, pr, 1.0 / people.n), people.n, m, people.comp_prior)
    people.pr, people.m, people.comp, people.comp_unc = pr, m, comp, unc
    db.run_batched(
        g,
        "UNWIND $rows AS r MATCH (a:Attendee {id: r.id}) SET a.pr = r.pr, a.m = r.m, a.comp = r.comp, a.comp_unc = r.unc",
        [
            {"id": aid, "pr": pr[i].tolist(), "m": [int(x) for x in m[i]], "comp": comp[i].round(4).tolist(), "unc": unc[i].round(4).tolist()}
            for i, aid in enumerate(people.ids)
        ],
    )
    return layers


def rank_experts(people: People, k: int, limit: int) -> list[dict]:
    """Top people on topic k by a conservative estimate, comp - RANK_UNC_PENALTY
    * comp_unc, so peer-confirmed competence outranks an unconfirmed prior.
    Reasons are display-safe: counts and public roles, never an individual's answer."""
    name = topic_names()[k]
    score = people.comp[:, k] - RANK_UNC_PENALTY * people.comp_unc[:, k]
    order = np.argsort(-score, kind="stable")[:limit]
    items = []
    for rank, i in enumerate(order, start=1):
        row = people.rows[i]
        m = int(people.m[i, k])
        evidence = []
        if m:
            evidence.append({"label": f"Compared notes on {name} with {m} {'person' if m == 1 else 'people'} at the show", "kind": "peer_votes"})
        if k in (row["speaker_topics"] or []):
            evidence.append({"label": f"Speaking on {name}", "kind": "speaker"})
        if row["exhibitor_id"]:
            if people.comp_prior[i, k] >= 0.7 - 1e-9 and k not in (row["speaker_topics"] or []):
                evidence.append({"label": f"Exhibiting in {name}", "kind": "exhibitor"})
        if not evidence:
            evidence.append({"label": f"{row['title'] or 'Attendee'} at {row['company'] or 'an independent business'}", "kind": "profile"})
        if m:
            reason = f"People they met at the show rate them highly on {name} ({m} {'conversation' if m == 1 else 'conversations'})"
        elif k in (row["speaker_topics"] or []):
            reason = f"Speaking on {name}; not yet confirmed by peers"
        else:
            reason = f"Background suggests expertise in {name}; not yet confirmed by peers"
        items.append({
            "rank": rank,
            "person": person_ref(row),
            "comp": round(float(people.comp[i, k]), 4),
            "comp_unc": round(float(people.comp_unc[i, k]), 4),
            "m": m,
            "reason": reason,
            "evidence": evidence,
        })
    return items
