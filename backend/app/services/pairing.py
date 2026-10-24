"""Pair values, per-date bipartite split, maxFlow matching, refinement (design doc 4.2)."""

import random
from dataclasses import dataclass, field

import numpy as np

from app import db, mathcore
from app.config import DATES_PER_SESSION, DELTA, NEG_THRESH, RNG_SEED
from app.snapshot import People
from app.services.ties import TieTable

MAX_FLOW = """
MATCH (s:Source), (t:Sink)
CALL algo.maxFlow({sourceNodes: [s], targetNodes: [t], capacityProperty: 'cap', relationshipTypes: ['CAP']})
YIELD edges, edgeFlows, maxFlow
RETURN [i IN range(0, size(edges) - 1) | [startNode(edges[i]).id, endNode(edges[i]).id, edgeFlows[i]]] AS flows, maxFlow
"""


@dataclass
class DatePairs:
    date_no: int
    pairs: list[tuple[str, str]]  # (a, b)
    sitting_out: list[str] = field(default_factory=list)
    floor: float | None = None  # tau*


def value_matrix(people: People, ids: list[str], ties: TieTable) -> np.ndarray:
    """V[i, j] = V_u(v) for u = ids[i], v = ids[j] (design doc 4.2)."""
    rows = [people.ix[a] for a in ids]
    interest = people.interest[rows]
    comp = people.comp[rows]
    unc = people.comp_unc[rows]
    s = people.s()[rows]
    like = people.like[rows]
    tribe = people.tribe[rows]

    # teach_u(v) = sum_k comp_k(v) interest_k(u) / sum_k interest_k(u)
    teach = (interest @ comp.T) / np.maximum(interest.sum(axis=1, keepdims=True), 1e-12)

    # enjoy(u,v) = (cos(interest_u, interest_v) + like(v)) / 2, interests centered on the population mean
    centered = interest - people.interest.mean(axis=0)
    norm = centered / np.maximum(np.linalg.norm(centered, axis=1, keepdims=True), 1e-12)
    enjoy = (norm @ norm.T + like[None, :]) / 2

    bridge = (tribe[:, None] != tribe[None, :]) & (tribe[:, None] >= 0) & (tribe[None, :] >= 0)
    familiar = np.zeros((len(ids), len(ids)), dtype=bool)
    pos = {a: i for i, a in enumerate(ids)}
    for pair in ties.familiar:
        a, b = tuple(pair)
        if a in pos and b in pos:
            familiar[pos[a], pos[b]] = familiar[pos[b], pos[a]] = True

    # explore(u,v): mean IG over the pair's 3 most plausible topics
    plaus = (interest[:, None, :] + interest[None, :, :]) / 2
    p_hat = 1 / (1 + np.exp(-(s[None, :, :] - s[:, None, :])))
    ig = mathcore.entropy(p_hat) * (unc[:, None, :] + unc[None, :, :]) / 2
    top3 = np.argsort(-plaus, axis=2)[:, :, :3]
    explore = np.take_along_axis(ig, top3, axis=2).mean(axis=2)

    return np.vectorize(mathcore.pair_value)(teach, enjoy, bridge, familiar, explore)


def _write_scratch(a_side: list[str], b_side: list[str]) -> None:
    g = db.match_scratch()
    if db.graph_exists(g.name):
        g.delete()
    g.query("CREATE (:Source), (:Sink)")
    g.query("MATCH (s:Source) UNWIND $ids AS id CREATE (s)-[:CAP {cap: 1}]->(:P {id: id, side: 'A'})", {"ids": a_side})
    g.query("MATCH (t:Sink) UNWIND $ids AS id CREATE (:P {id: id, side: 'B'})-[:CAP {cap: 1}]->(t)", {"ids": b_side})
    g.query("CREATE INDEX FOR (p:P) ON (p.id)")


def _max_flow(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Rewrite the A -> B CAP edges to `pairs` and return the maxFlow matching."""
    g = db.match_scratch()
    g.query("MATCH (:P {side: 'A'})-[c:CAP]->(:P {side: 'B'}) DELETE c")
    db.run_batched(
        g,
        "UNWIND $rows AS e MATCH (a:P {id: e.a}), (b:P {id: e.b}) CREATE (a)-[:CAP {cap: 1}]->(b)",
        [{"a": a, "b": b} for a, b in pairs],
        size=5000,
    )
    if not pairs:
        return []
    flows, _ = g.query(MAX_FLOW).result_set[0]
    return [(a, b) for a, b, f in flows if a is not None and b is not None and f >= 1]


def match_date(
    a_side: list[str],
    b_side: list[str],
    w: dict[tuple[str, str], float],
    deficit: dict[str, float],
) -> tuple[list[tuple[str, str]], float | None]:
    """Floor matching by binary search over tau with algo.maxFlow, then greedy
    refinement above the floor (design doc 4.2 steps 4-5)."""
    _write_scratch(a_side, b_side)
    feasible = list(w)
    if not feasible:
        return [], None
    k = min(len(a_side), len(b_side))
    taus = sorted(set(w.values()))

    best = _max_flow(feasible)  # lowest tau: every feasible pair
    best_tau = taus[0]
    if len(best) == k:
        lo, hi = 0, len(taus) - 1
        while lo < hi:  # largest tau with a perfect matching
            mid = (lo + hi + 1) // 2
            m = _max_flow([p for p in feasible if w[p] >= taus[mid]])
            if len(m) == k:
                lo, best, best_tau = mid, m, taus[mid]
            else:
                hi = mid - 1

    above = [(a, b, w[(a, b)] + DELTA * (deficit.get(a, 0) + deficit.get(b, 0))) for a, b in feasible if w[(a, b)] >= best_tau]
    greedy = mathcore.greedy_match(above)
    return (greedy if len(greedy) >= len(best) else best), best_tau


def plan_session(s: int, ids: list[str], people: People, ties: TieTable, sat_out: dict[str, int]) -> tuple[list[DatePairs], np.ndarray, dict[str, float]]:
    """Plan all 4 dates of session s. Returns (dates, V matrix over ids, cum_value updates)."""
    rng = random.Random(f"{RNG_SEED}|pairing|{s}")
    pos = {a: i for i, a in enumerate(ids)}
    V = value_matrix(people, ids, ties)
    cum = {a: float(people.rows[people.ix[a]]["cum_value"]) for a in ids}
    met = set(ties.met)
    dates = []
    for d in range(DATES_PER_SESSION):
        order = ids[:]
        rng.shuffle(order)
        out: list[str] = []
        if len(order) % 2:
            fewest = min(sat_out.get(a, 0) for a in order)
            candidates = [a for a in order if sat_out.get(a, 0) == fewest]
            out.append(rng.choice(candidates))
            order.remove(out[0])
        half = len(order) // 2
        a_side, b_side = order[:half], order[half:]
        w = {}
        for a in a_side:
            for b in b_side:
                if frozenset((a, b)) in met:
                    continue
                if ties.p_neg(a, b) >= NEG_THRESH or ties.p_neg(b, a) >= NEG_THRESH:
                    continue
                w[(a, b)] = float(min(V[pos[a], pos[b]], V[pos[b], pos[a]]))
        pairs, tau = match_date(a_side, b_side, w, mathcore.deficits(cum))
        matched = {x for p in pairs for x in p}
        out += [a for a in order if a not in matched]
        for a in out:
            sat_out[a] = sat_out.get(a, 0) + 1
        for a, b in pairs:
            met.add(frozenset((a, b)))
            cum[a] += float(V[pos[a], pos[b]])
            cum[b] += float(V[pos[b], pos[a]])
        dates.append(DatePairs(date_no=d, pairs=pairs, sitting_out=out, floor=tau))
    return dates, V, cum
