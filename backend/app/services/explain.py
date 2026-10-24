"""Explainability: why two people were matched, why micro-influencers were picked.

Everything here is graph-backed: the score breakdown recorded when the pair was
planned (design doc 4.2), competence from PageRank over LEARNED_FROM_T{k}
layers (3.3), likability (3.6), communities on POS_TIE (3.9), and social paths
found with FalkorDB's shortestPath. Reasons are display-safe: counts and public
roles, never an individual's answer. Each explanation lists the Cypher behind it.
"""

import json

import numpy as np
from fastapi import HTTPException

from app import db
from app.config import LIKE_PRIOR
from app.cypher import learned_from
from app.snapshot import People, load_people, person_ref
from app.topics import topic_ids, topic_names

PATH_QUERY = (
    "MATCH (a:Attendee {id: $you}), (b:Attendee {id: $them}) "
    "WITH shortestPath((a)-[:LINKEDIN|ADHOC|POS_TIE*1..4]-(b)) AS p "
    "RETURN [n IN nodes(p) | n.id], [r IN relationships(p) | type(r)]"
)


def _pct(values: np.ndarray, v: float) -> float:
    """Share of values strictly below v, 0-100."""
    return round(100.0 * float(np.mean(values < v)), 1) if len(values) else 0.0


def _people_say(n: int) -> str:
    return f"{n} person they met says" if n == 1 else f"{n} people they met say"


def _top_share(values: np.ndarray, v: float) -> int:
    """'Top N%' for v among values (1 = best percent)."""
    return max(1, int(np.ceil(100.0 * float(np.mean(values >= v)))))


def learners(k: int, expert: str) -> int:
    """Distinct people who reported learning from `expert` on topic k."""
    rows = db.people().query(
        f"MATCH (l:Attendee)-[r:{learned_from(k)}]->(x:Attendee {{id: $id}}) RETURN count(DISTINCT l)", {"id": expert}
    ).result_set
    return int(rows[0][0]) if rows else 0


def social_path(you: str, them: str, people: People) -> list[dict] | None:
    rows = db.people().query(PATH_QUERY, {"you": you, "them": them}).result_set
    if not rows or not rows[0][0]:
        return None
    nodes, rels = rows[0]
    return [
        {"person": person_ref(people.rows[people.ix[n]]), "via": rels[i] if i < len(rels) else None}
        for i, n in enumerate(nodes)
    ]


def _expertise_detail(people: People, i: int, k: int, first: str) -> str:
    name = topic_names()[k]
    n = learners(k, people.ids[i])
    top = _top_share(people.comp[:, k], people.comp[i, k])
    row = people.rows[i]
    if n:
        return f"{first} ranks in the top {top}% on {name} ({_people_say(n)} they learned from them)"
    if k in (row["speaker_topics"] or []):
        return f"{first} is speaking on {name} (top {top}% on the graph's estimate, not yet confirmed by peers)"
    return f"{first} ranks in the top {top}% on {name} from their background ({row['title'] or 'attendee'} at {row['company'] or 'their business'})"


# --- Why we matched you ------------------------------------------------------


def meeting_why(s: int, d: int, rater: str) -> dict:
    rows = db.people().query(
        "MATCH (u:Attendee {id: $r})-[e:SPEED_DATE {session: $s, date_no: $d}]->(v:Attendee) "
        "MATCH (v)-[f:SPEED_DATE {session: $s, date_no: $d}]->(u) "
        "RETURN v.id, e.meeting_id, e.value, f.value, e.w, e.floor, e.why",
        {"r": rater, "s": s, "d": d},
    ).result_set
    if not rows:
        raise HTTPException(404, f"{rater} has no meeting in session {s}, date {d}")
    partner, meeting_id, v_you, v_them, w, floor, why_json = rows[0]
    comps = json.loads(why_json) if why_json else {}
    people = load_people()
    u, v = people.ix[rater], people.ix[partner]
    first = people.rows[v]["name"].split()[0]
    names, ids = topic_names(), topic_ids()
    reasons: list[dict] = []

    # Learn from them: their competence on what you care about
    k_learn = int(np.argmax(people.comp[v] * people.interest[u]))
    reasons.append({"kind": "learn_from_them", "title": f"Learn about {names[k_learn]}",
                    "detail": _expertise_detail(people, v, k_learn, first),
                    "weight": comps.get("learn"), "topic_id": ids[k_learn]})

    # Mutual: what they can learn from you (pair score is the min of both sides)
    teach = people.comp[u] * people.interest[v]
    alt = teach.copy()
    alt[k_learn] = -1
    k_teach = int(np.argmax(alt)) if alt.max() >= 0.7 * teach.max() else int(np.argmax(teach))  # prefer a different topic
    reasons.append({"kind": "learn_from_you", "title": "They can learn from you",
                    "detail": f"You're strong on {names[k_teach]}, one of {first}'s top interests",
                    "weight": None, "topic_id": ids[k_teach]})

    # Shared interests: interests above the population average for both
    centered = people.interest - people.interest.mean(axis=0)
    both = np.minimum(centered[u], centered[v])
    shared = [int(k) for k in np.argsort(-both)[:2] if both[k] > 0]
    if shared:
        reasons.append({"kind": "shared_interest", "title": "Shared interests",
                        "detail": f"Both of you rank {' and '.join(names[k] for k in shared)} highly",
                        "weight": comps.get("enjoy"), "topic_id": ids[shared[0]]})

    # Well liked: aggregate meet-again answers about them
    yes = int(round(people.like_a[v] - LIKE_PRIOR[0]))
    total = int(round(people.like_a[v] + people.like_b[v] - sum(LIKE_PRIOR)))
    if total >= 3 and people.like[v] >= 0.6:
        reasons.append({"kind": "well_liked", "title": "Well liked",
                        "detail": f"{yes} of {total} people {first} met would meet them again", "weight": None})

    if comps.get("new_circle", 0) > 0:
        reasons.append({"kind": "new_circle", "title": "A new circle",
                        "detail": f"{first} is in a different community of the trust graph than you",
                        "weight": comps["new_circle"]})
    if comps.get("already_connected", 0) < 0:
        reasons.append({"kind": "already_connected", "title": "You already know each other",
                        "detail": "You're connected on LinkedIn or met at the show, which counts slightly against a match",
                        "weight": comps["already_connected"]})

    # Explore: the most plausible topic where the graph is least sure who knows more
    plaus = (people.interest[u] + people.interest[v]) / 2
    unc = (people.comp_unc[u] + people.comp_unc[v]) / 2
    k_exp = int(np.argmax(plaus * unc))
    if comps.get("explore", 0) > 0:
        unsure = people.m[u, k_exp] == 0 and people.m[v, k_exp] == 0
        reasons.append({"kind": "explore", "title": "Fills a gap in the graph",
                        "detail": (f"Neither of you has been compared on {names[k_exp]} yet" if unsure
                                   else f"The graph is still unsure who knows more about {names[k_exp]}"),
                        "weight": comps["explore"], "topic_id": ids[k_exp]})

    reasons.sort(key=lambda r: (r["weight"] is None, -(r["weight"] or 0)))
    if floor is not None:
        reasons.append({"kind": "fair_floor", "title": "Fair for everyone",
                        "detail": f"Every pair this date scores at least {floor:.2f}; yours scores {w:.2f}", "weight": None})

    path = social_path(rater, partner, people)
    top = [r for r in reasons if r["weight"] and r["weight"] > 0][:2]
    phrases = {
        "learn_from_them": f"{first} can teach you about {names[k_learn]}",
        "shared_interest": "you care about the same things",
        "new_circle": f"{first} opens a new circle for you",
        "explore": f"your conversation fills a gap on {names[k_exp]}",
    }
    parts = [phrases[r["kind"]] for r in top if r["kind"] in phrases] or [f"{first} is a strong match for you"]
    headline = (parts[0][0].upper() + parts[0][1:] + (f", and {parts[1]}" if len(parts) > 1 else "") + ".")

    return {
        "meeting_id": meeting_id, "session": s, "date_no": d,
        "rater": person_ref(people.rows[u]), "partner": person_ref(people.rows[v]),
        "headline": headline,
        "score": {"value_for_you": v_you, "value_for_them": v_them, "pair_score": w, "date_floor": floor,
                  "components": {k: round(float(x), 4) for k, x in comps.items()}},
        "reasons": reasons,
        "path": path,
        "evidence_queries": [
            {"label": "Score recorded when the pair was planned",
             "cypher": "MATCH (u:Attendee {id: $you})-[e:SPEED_DATE {session: $s, date_no: $d}]->(v) RETURN e.value, e.w, e.floor, e.why"},
            {"label": f"Who learned from {first} on {names[k_learn]}",
             "cypher": f"MATCH (l:Attendee)-[:{learned_from(k_learn)}]->(x:Attendee {{id: $them}}) RETURN count(DISTINCT l)"},
            {"label": f"Expertise ranking on {names[k_learn]} (PageRank over learned-from votes)",
             "cypher": f"CALL algo.pageRank('Attendee', '{learned_from(k_learn)}') YIELD node, score RETURN node.name, score ORDER BY score DESC LIMIT 10"},
            {"label": "Shortest social path", "cypher": PATH_QUERY},
        ],
    }


# --- Why these micro-influencers -----------------------------------------------


def influencer_why(
    people: People, x: np.ndarray, P: np.ndarray, cand_rows: list[int], picks: list[tuple[int, float]],
    target_ids: list[str], interest_x: np.ndarray, comp_x: np.ndarray,
) -> dict:
    """Per-pick reasons, audience summary and runners-up for a selected set.
    P is [candidates x targets] of p_x; picks are (candidate_row, marginal gain)."""
    names = topic_names()
    event_topics = [k for k in range(len(x)) if x[k] > 0]
    topic_label = " & ".join(names[k] for k in event_topics) if len(event_topics) <= 2 else "this event's topics"
    rated = (people.like_a + people.like_b - sum(LIKE_PRIOR)) > 0
    like_pool = people.like[rated] if rated.any() else people.like
    chosen_rows = [r for r, _ in picks]
    reach_mask = P[chosen_rows] > 0 if chosen_rows else np.zeros((0, P.shape[1]), dtype=bool)

    per_pick = []
    for order, (r, gain) in enumerate(picks, start=1):
        i = cand_rows[r]
        first = people.rows[i]["name"].split()[0]
        mine = P[r] > 0
        others = reach_mask[[o for o in range(len(chosen_rows)) if chosen_rows[o] != r]].any(axis=0) if len(chosen_rows) > 1 else np.zeros_like(mine)
        direct, unique = int(mine.sum()), int((mine & ~others).sum())
        n_learn = sum(learners(k, people.ids[i]) for k in event_topics)
        yes = int(round(people.like_a[i] - LIKE_PRIOR[0]))
        total = int(round(people.like_a[i] + people.like_b[i] - sum(LIKE_PRIOR)))
        top = _top_share(comp_x, comp_x[i])
        per_pick.append({
            "pick_order": order,
            "competence_percentile": _pct(comp_x, comp_x[i]),
            "likability_percentile": _pct(like_pool, people.like[i]),
            "direct_targets": direct,
            "unique_targets": unique,
            "reasons": [
                {"kind": "competent", "title": f"Top {top}% on {topic_label}",
                 "detail": (f"{_people_say(n_learn)} they learned from them" if n_learn
                            else f"{people.rows[i]['title'] or 'Attendee'} at {people.rows[i]['company'] or 'their business'}; not yet confirmed by peers"),
                 "weight": None},
                {"kind": "liked", "title": "Well liked" if people.like[i] >= 0.6 else "Liked",
                 "detail": (f"{yes} of {total} people {first} met would meet them again" if total
                            else "No meet-again answers yet"),
                 "weight": None},
                {"kind": "reach", "title": f"Reaches {direct} interested {'attendee' if direct == 1 else 'attendees'}",
                 "detail": (f"{unique} of them no other pick reaches" if len(picks) > 1 else "through people who trust their advice"),
                 "weight": round(gain, 4)},
            ],
        })

    covered = int(reach_mask.any(axis=0).sum()) if chosen_rows else 0
    tribes = len({int(people.tribe[cand_rows[r]]) for r in chosen_rows if people.tribe[cand_rows[r]] >= 0})
    expected = float(np.sum(1 - np.prod(1 - P[chosen_rows], axis=0))) if chosen_rows else 0.0

    # Runners-up: strongest unpicked candidates on their own, and why they add little now
    miss = np.prod(1 - P[chosen_rows], axis=0) if chosen_rows else np.ones(P.shape[1])
    alone = P.sum(axis=1)
    runners = []
    for r in np.argsort(-alone):
        if len(runners) >= 3 or r in chosen_rows or alone[r] <= 0:
            continue
        i = cand_rows[r]
        marginal = float(P[r] @ miss)
        overlap = [(int((reach_mask[o] & (P[r] > 0)).sum()), o) for o in range(len(chosen_rows))]
        shared, o = max(overlap) if overlap else (0, None)
        weakest = min(g for _, g in picks) if picks else 0.0
        if o is not None and shared > 0 and marginal < 0.8 * alone[r]:
            pick_first = people.rows[cand_rows[chosen_rows[o]]]["name"].split()[0]
            reason = f"Their circle overlaps {pick_first}'s: {shared} of the people they'd invite already get a ticket"
        elif marginal < weakest:
            reason = f"Would add {marginal:.2f} expected attendees, less than the weakest pick ({weakest:.2f})"
        else:
            reason = f"Just outside the top {len(picks)}: would add {marginal:.2f} expected attendees"
        runners.append({"person": person_ref(people.rows[i]), "comp_x": round(float(comp_x[i]), 4),
                        "like": round(float(people.like[i]), 4), "marginal_reach": round(marginal, 4), "reason": reason})

    audience = {
        "interested": len(target_ids),
        "covered": covered,
        "coverage_share": round(covered / len(target_ids), 4) if target_ids else 0.0,
        "expected_attendees": round(expected, 4),
        "tribes": tribes,
        "method": "Picked one at a time, each time the person who adds the most new expected attendees, "
                  "among people who are competent and well liked in these topics.",
    }
    k0 = event_topics[0] if event_topics else 0
    queries = [
        {"label": "Interested attendees (targets)",
         "cypher": "MATCH (v:Attendee) WITH v, reduce(s = 0.0, k IN range(0, 9) | s + $x[k] * v.interest[k]) AS interest_x "
                   "WHERE interest_x >= 0.4 RETURN count(v)"},
        {"label": f"Expertise ranking on {names[k0]} (PageRank over learned-from votes)",
         "cypher": f"CALL algo.pageRank('Attendee', '{learned_from(k0)}') YIELD node, score RETURN node.name, score ORDER BY score DESC LIMIT 10"},
        {"label": "Who trusts a pick's advice (positive ties)",
         "cypher": "MATCH (u:Attendee {id: $pick})-[t:POS_TIE]->(v:Attendee) RETURN v.name, t.p_pos ORDER BY t.p_pos DESC"},
        {"label": "Circles on the trust graph (label propagation)",
         "cypher": "CALL algo.labelPropagation({nodeLabels: ['Attendee'], relationshipTypes: ['POS_TIE']}) YIELD node, communityId "
                   "RETURN communityId, count(node) ORDER BY count(node) DESC"},
    ]
    return {"per_pick": per_pick, "audience": audience, "runners_up": runners, "evidence_queries": queries}
