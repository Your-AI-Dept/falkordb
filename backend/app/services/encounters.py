"""Ad-hoc QR check-ins: ADHOC edges, check-in questions, synthetic encounters (design doc 3.10)."""

import json
import random

from fastapi import HTTPException

from app import db, state
from app.events import bus
from app.config import ADHOC_PER_TICK, LLM_MODE, RNG_SEED
from app.models import Answer
from app.services import questions, simulator
from app.services.evidence import Evidence
from app.services.survey_store import get_checkin_survey, save_checkin_answers
from app.snapshot import People, load_people

MERGE_ADHOC = """
UNWIND $rows AS c
MATCH (a:Attendee {id: c.a}), (b:Attendee {id: c.b})
MERGE (a)-[x:ADHOC]->(b) ON CREATE SET x.count = 0
SET x.count = x.count + 1, x.last_tick = $tick, x.questions = c.qa, x.answers = '{}', x.complete = false,
    x.applied = false, x.survey_revision = 0, x.graph_revision = $tick, x.phrased_by = c.pa, x.meeting_id = c.mid
MERGE (b)-[y:ADHOC]->(a) ON CREATE SET y.count = 0
SET y.count = y.count + 1, y.last_tick = $tick, y.questions = c.qb, y.answers = '{}', y.complete = false,
    y.applied = false, y.survey_revision = 0, y.graph_revision = $tick, y.phrased_by = c.pb, y.meeting_id = c.mid
RETURN x.count
"""


def _claude_for(rater: str, st: state.EventState) -> bool:
    return LLM_MODE == "all" or (LLM_MODE == "humans" and rater in st.humans)


def create_checkins(people: People, pairs: list[tuple[str, str]], tick: int, st: state.EventState) -> list[int]:
    """MERGE ADHOC pairs and attach fresh check-in surveys for both people."""
    ctx = questions.load_content_context()
    jobs = [j for a, b in pairs for j in ((a, b), (b, a))]
    use_claude = {r for r, _ in jobs if _claude_for(r, st)}
    surveys = questions.generate(people, ctx, jobs, checkin=True, use_claude=use_claude)
    rows = []
    for n, (a, b) in enumerate(pairs):
        (qa, pa), (qb, pb) = surveys[2 * n], surveys[2 * n + 1]
        lo, hi = sorted((a, b))
        rows.append({
            "a": a, "b": b, "mid": f"c{tick}-{lo}-{hi}",
            "qa": json.dumps([q.model_dump() for q in qa]), "pa": pa,
            "qb": json.dumps([q.model_dump() for q in qb]), "pb": pb,
        })
    counts = []
    for i in range(0, len(rows), 200):
        counts += [r[0] for r in db.people().query(MERGE_ADHOC, {"rows": rows[i : i + 200], "tick": tick}).result_set]
    for (a, b), count in zip(pairs, counts):
        bus.publish("checkin_recorded", {"scanner_id": a, "scanned_id": b, "tick": tick, "count": count})
    return counts


def checkin(scanner: str, scanned: str) -> int:
    if scanner == scanned:
        raise HTTPException(422, "cannot check in with yourself")
    people = load_people()
    for a in (scanner, scanned):
        if a not in people.ix:
            raise HTTPException(404, f"attendee {a} not found")
    st = state.load()
    return create_checkins(people, [(scanner, scanned)], st.current_tick(), st)[0]


APPLY = "MATCH (u:Attendee {id: $rater})-[e:ADHOC]->(v:Attendee {id: $partner}) SET e.applied = true"


def answer(rater: str, partner: str, answers) -> object:
    """Save check-in answers; apply them to the graph once the survey completes."""
    qs = save_checkin_answers(rater, partner, answers)
    if qs.complete:
        applied = db.people().query(
            "MATCH (u:Attendee {id: $rater})-[e:ADHOC]->(v:Attendee {id: $partner}) RETURN e.applied",
            {"rater": rater, "partner": partner},
        ).result_set[0][0]
        if not applied:
            people = load_people()
            ev = Evidence(people)
            ev.checkin(rater, partner, [q.model_dump() for q in qs.questions], qs.answers)
            ev.flush(None, None, state.load().current_tick())
            db.people().query(APPLY, {"rater": rater, "partner": partner})
    return qs


def synthetic_checkins(people: People, tick: int, st: state.EventState) -> int:
    """ADHOC_PER_TICK random encounters among everyone, answered by the
    simulator and applied immediately. Partner weights: 3 for a LinkedIn tie,
    2 for a shared top-interest topic, 1 otherwise."""
    rng = random.Random(f"{RNG_SEED}|checkins|{tick}")
    linkedin: dict[str, set[str]] = {}
    for a, b in db.people().query("MATCH (a:Attendee)-[:LINKEDIN]->(b:Attendee) RETURN a.id, b.id").result_set:
        linkedin.setdefault(a, set()).add(b)
    top = people.interest.argmax(axis=1)
    humans = set(st.humans)
    pairs: list[tuple[str, str]] = []
    seen: set[frozenset] = set()
    while len(pairs) < ADHOC_PER_TICK:
        a = rng.choice(people.ids)
        if a in humans:
            continue
        ia = people.ix[a]
        cands = rng.sample(people.ids, 40)
        weights = [3 if c in linkedin.get(a, ()) else 2 if top[people.ix[c]] == top[ia] else 1 for c in cands]
        b = rng.choices(cands, weights=weights)[0]
        key = frozenset((a, b))
        if b == a or b in humans or key in seen:
            continue
        seen.add(key)
        pairs.append((a, b))
    create_checkins(people, pairs, tick, st)
    ev = Evidence(people)
    for a, b in pairs:
        sa, sb = get_checkin_survey(a, b), get_checkin_survey(b, a)
        qa, qb = [q.model_dump() for q in sa.questions], [q.model_dump() for q in sb.questions]
        ans_a, ans_b = simulator.answer_meeting(people, f"c{tick}", a, b, qa, qb)
        for rater, partner, ans, qs in ((a, b, ans_a, qa), (b, a, ans_b, qb)):
            saved = save_checkin_answers(rater, partner, [Answer(question_id=k, value=v) for k, v in ans.items()])
            if saved.complete:
                ev.checkin(rater, partner, qs, saved.answers)
                db.people().query(APPLY, {"rater": rater, "partner": partner})
    ev.flush(None, None, tick)
    return len(pairs)
