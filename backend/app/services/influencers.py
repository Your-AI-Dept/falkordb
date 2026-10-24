"""Micro-influencer selection per topic or vendor event (design doc 4.3).

"If u hands v a ticket, how likely is v to come?"
p_x(u->v) = p_pos(u->v) * comp_x(u) * like(u) * interest_x(v)
"""

import numpy as np

from app import mathcore
from app.services import explain
from app.config import BACKFIRE_MAX, CRED_MIN, LIKE_MIN, N_INFLUENCERS, TARGET_MIN
from app.services.evidence import like_counts
from app.services.ties import TieTable
from app.snapshot import People, person_ref


def select(people: People, table: TieTable, x: np.ndarray, vendor_id: str | None = None) -> dict:
    """Targets, candidates, greedy picks and explanations for event profile x."""
    interest_x = people.interest @ x
    comp_x = people.comp @ x
    staff = np.array([bool(vendor_id) and r["exhibitor_id"] == vendor_id for r in people.rows])
    reached = np.array([bool(vendor_id) and vendor_id in (r["reached"] or []) for r in people.rows])
    targets = np.where((interest_x >= TARGET_MIN) & ~staff & ~reached)[0]
    target_ids = [people.ids[i] for i in targets]
    tpos = {a: j for j, a in enumerate(target_ids)}

    # Sparse tie lookups: senders -> receivers with evidence
    out_edges: dict[str, list[tuple[str, float, float]]] = {}
    for (snd, rcv), (p_pos, _, p_neg) in table.probs.items():
        if rcv in tpos:
            out_edges.setdefault(snd, []).append((rcv, p_pos, p_neg))

    cand_rows = []
    for i in np.where((comp_x >= CRED_MIN) & (people.like >= LIKE_MIN) & ~staff)[0]:
        edges = out_edges.get(people.ids[i], [])
        if not edges:
            continue
        if sum(p_neg for _, _, p_neg in edges) >= BACKFIRE_MAX:
            continue
        cand_rows.append(i)

    P = np.zeros((len(cand_rows), len(target_ids)))
    for r, i in enumerate(cand_rows):
        for rcv, p_pos, _ in out_edges[people.ids[i]]:
            if rcv != people.ids[i]:
                P[r, tpos[rcv]] = p_pos * comp_x[i] * people.like[i] * interest_x[people.ix[rcv]]

    picks = mathcore.greedy_influencers(P, N_INFLUENCERS)
    likes_n = like_counts(people)
    chosen = []
    for r, gain in picks:
        i = cand_rows[r]
        top = np.argsort(-P[r])[:5]
        chosen.append({
            "person": person_ref(people.rows[i]),
            "marginal_reach": round(gain, 4),
            "comp_x": round(float(comp_x[i]), 4),
            "m": int(people.m[i][x > 0].sum()),
            "like": round(float(people.like[i]), 4),
            "like_n": int(likes_n[i]),
            "tribe": int(people.tribe[i]),
            "broker": round(float(people.broker[i]), 4),
            "reach": round(float(people.reach[i]), 4),
            "top_targets": [
                {"person": person_ref(people.rows[people.ix[target_ids[j]]]), "p_x": round(float(P[r, j]), 4)}
                for j in top if P[r, j] > 0
            ],
        })
    expected = mathcore.sigma(P[[r for r, _ in picks]]) if picks else 0.0
    why = explain.influencer_why(people, x, P, cand_rows, picks, target_ids, interest_x, comp_x)
    for item, w in zip(chosen, why["per_pick"]):
        item["why"] = w
    return {"n_targets": len(target_ids), "expected_reach": round(expected, 4), "influencers": chosen,
            "audience": why["audience"], "runners_up": why["runners_up"], "evidence_queries": why["evidence_queries"]}
