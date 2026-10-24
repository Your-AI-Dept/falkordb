"""Session and date lifecycle, date-close pipeline, simulation (design doc 5)."""

import json
import logging
import time
from collections import defaultdict

from fastapi import HTTPException

from app import db, state
from app.config import DATES_PER_SESSION, LLM_MODE, N_SESSIONS, SESSIONS_PER_DAY
from app.events import bus
from app.models import Answer
from app.services import competence, encounters, graph_events, metrics, pairing, questions, seed, simulator, ties
from app.services.evidence import Evidence
from app.services.survey_store import save_date_answers
from app.snapshot import load_people

log = logging.getLogger(__name__)

SESSION_HOURS = ["10:00", "11:00", "13:00", "14:00", "15:00"]

CREATE_DATES = """
UNWIND $rows AS r
MATCH (a:Attendee {id: r.a}), (b:Attendee {id: r.b})
CREATE (a)-[:SPEED_DATE {session: $s, date_no: r.d, tick: r.tick, complete: false, questions: '[]', answers: '{}',
                         value: r.va, w: r.w, a_id: r.a, meeting_id: r.mid, survey_revision: 0, graph_revision: 0,
                         phrased_by: 'template', didnt_meet: false, why: r.why_a, floor: r.floor}]->(b),
       (b)-[:SPEED_DATE {session: $s, date_no: r.d, tick: r.tick, complete: false, questions: '[]', answers: '{}',
                         value: r.vb, w: r.w, a_id: r.a, meeting_id: r.mid, survey_revision: 0, graph_revision: 0,
                         phrased_by: 'template', didnt_meet: false, why: r.why_b, floor: r.floor}]->(a)
"""

DATE_EDGES = """
MATCH (u:Attendee)-[e:SPEED_DATE {session: $s, date_no: $d}]->(v:Attendee)
RETURN u.id, v.id, e.questions, e.answers, e.complete, e.didnt_meet, e.act, e.meet_again
"""


def tick_of(s: int, d: int) -> int:
    return DATES_PER_SESSION * s + d


def session_slot(s: int) -> tuple[int, str, str]:
    day = s // SESSIONS_PER_DAY + 1
    start = SESSION_HOURS[s % SESSIONS_PER_DAY]
    return day, start, f"{int(start[:2]) + 1:02d}:00"


def _require(cond: bool, msg: str, code: int = 409) -> None:
    if not cond:
        raise HTTPException(code, msg)


# --- open --------------------------------------------------------------------


def open_session(s: int) -> None:
    st = state.load()
    _require(st.sessions[s] == "planned", f"session {s} is {st.sessions[s]}")
    _require(st.current() is None, f"session {st.current()[0] if st.current() else ''} is still open; close it first")
    t0 = time.time()
    people = load_people()
    table = ties.load_tie_table()
    ids = seed.session_attendees(s)
    sat_out = {a: int(people.rows[people.ix[a]]["sat_out"]) for a in ids}
    dates, V, comps, cum = pairing.plan_session(s, ids, people, table, sat_out)
    pos = {a: i for i, a in enumerate(ids)}
    rows = []
    for dp in dates:
        for a, b in dp.pairs:
            va, vb = float(V[pos[a], pos[b]]), float(V[pos[b], pos[a]])
            lo, hi = sorted((a, b))
            i, j = pos[a], pos[b]
            rows.append({"a": a, "b": b, "d": dp.date_no, "tick": tick_of(s, dp.date_no), "va": round(va, 4),
                         "vb": round(vb, 4), "w": round(min(va, vb), 4), "mid": f"s{s}-d{dp.date_no}-{lo}-{hi}",
                         "floor": round(dp.floor, 4) if dp.floor is not None else None,
                         # each side's score breakdown at planning time, for "why we matched you"
                         "why_a": json.dumps({k: round(float(c[i, j]), 4) for k, c in comps.items()}),
                         "why_b": json.dumps({k: round(float(c[j, i]), 4) for k, c in comps.items()})})
    g = db.people()
    db.run_batched(g, CREATE_DATES, rows, params={"s": s})
    db.run_batched(
        g,
        "UNWIND $rows AS r MATCH (a:Attendee {id: r.id}) SET a.cum_value = r.cum, a.sat_out = r.out",
        [{"id": a, "cum": round(cum[a], 4), "out": sat_out[a]} for a in ids],
    )
    g.query("MATCH (a:InSession) REMOVE a:InSession")
    g.query("UNWIND $ids AS id MATCH (a:Attendee {id: id}) SET a:InSession", {"ids": ids})
    st.sessions[s] = "open"
    st.dates[str(s)] = ["planned"] * DATES_PER_SESSION
    state.save(st)
    log.info("planned session %s (%d people, %d meetings) in %.1fs", s, len(ids), len(rows), time.time() - t0)
    bus.publish("session_opened", {"session": s, "attendees": ids, "dates": graph_events.plan_payload(s)})
    open_date(s, 0)


def open_date(s: int, d: int) -> None:
    st = state.load()
    people = load_people()
    ctx = questions.load_content_context()
    pairs = db.people().query(
        "MATCH (u:Attendee)-[e:SPEED_DATE {session: $s, date_no: $d}]->(v:Attendee) RETURN u.id, v.id", {"s": s, "d": d}
    ).result_set
    jobs = [(u, v) for u, v in pairs]
    use_claude = {r for r, _ in jobs if LLM_MODE == "all" or (LLM_MODE == "humans" and r in st.humans)}
    surveys = questions.generate(people, ctx, jobs, checkin=False, use_claude=use_claude)
    rows = [{"u": u, "v": v, "q": json.dumps([q.model_dump() for q in qs]), "p": p} for (u, v), (qs, p) in zip(jobs, surveys)]
    db.run_batched(
        db.people(),
        """UNWIND $rows AS r
        MATCH (u:Attendee {id: r.u})-[e:SPEED_DATE {session: $s, date_no: $d}]->(v:Attendee {id: r.v})
        SET e.questions = r.q, e.phrased_by = r.p, e.graph_revision = $rev""",
        rows,
        params={"s": s, "d": d, "rev": st.closed_ticks},
    )
    # Remember a question for the UI's "why" panel, preferring a human rater's.
    pick = next((i for i, (u, _) in enumerate(jobs) if u in st.humans), 0 if jobs else None)
    if pick is not None:
        claim = next((q for q in surveys[pick][0] if q.kind == "claim"), None)
        if claim:
            st.last_question = {"rater_id": jobs[pick][0], "partner_id": jobs[pick][1], "session": s, "date_no": d,
                                **claim.model_dump(), "phrased_by": surveys[pick][1]}
    st.dates[str(s)][d] = "open"
    state.save(st)
    bus.publish("date_opened", {"session": s, "date_no": d, "tick": tick_of(s, d)})


# --- simulate ----------------------------------------------------------------


def simulate_date(s: int, d: int) -> int:
    """Answer every incomplete, non-human survey of an open date via the simulator."""
    st = state.load()
    _require(st.date_states(s)[d] == "open", f"session {s} date {d} is not open")
    people = load_people()
    by_pair: dict[frozenset, dict] = defaultdict(dict)
    for u, v, q, a, complete, *_ in db.people().query(DATE_EDGES, {"s": s, "d": d}).result_set:
        by_pair[frozenset((u, v))][u] = (v, json.loads(q), complete)
    humans = set(st.humans)
    answered = 0
    for pair, raters in by_pair.items():
        a, b = sorted(pair)
        qa = raters[a][1] if a in raters and not raters[a][2] and a not in humans else None
        qb = raters[b][1] if b in raters and not raters[b][2] and b not in humans else None
        if qa is None and qb is None:
            continue
        ans_a, ans_b = simulator.answer_meeting(people, f"s{s}d{d}", a, b, qa, qb)
        for rater, ans in ((a, ans_a), (b, ans_b)):
            if ans:
                save_date_answers(s, d, rater, [Answer(question_id=k, value=v) for k, v in ans.items()])
                answered += 1
    return answered


# --- close -------------------------------------------------------------------


def _remap_tribes(communities: dict[str, int]) -> dict[str, int]:
    """Stable small tribe ids: largest community first; singletons -> -1."""
    members: dict[int, list[str]] = defaultdict(list)
    for aid, c in communities.items():
        members[c].append(aid)
    ranked = sorted((m for m in members.values() if len(m) > 1), key=lambda m: (-len(m), min(m)))
    out = {aid: -1 for aid in communities}
    for t, m in enumerate(ranked):
        for aid in m:
            out[aid] = t
    return out


def structure_features(n_pos_ties: int, n: int) -> None:
    """Tribes, brokers and reach on POS_TIE (design doc 3.9). Skipped while
    POS_TIE is empty, since the algorithms error on a missing type."""
    if n_pos_ties == 0:
        return
    g = db.people()
    comm = dict(g.query(
        "CALL algo.labelPropagation({nodeLabels: ['Attendee'], relationshipTypes: ['POS_TIE'], maxIterations: 10}) "
        "YIELD node, communityId RETURN node.id, communityId"
    ).result_set)
    broker = dict(g.query(
        "CALL algo.betweenness({nodeLabels: ['Attendee'], relationshipTypes: ['POS_TIE'], samplingSize: $n, samplingSeed: 42}) "
        "YIELD node, score RETURN node.id, score", {"n": n}
    ).result_set)
    reach = dict(g.query(
        "CALL algo.HarmonicCentrality({nodeLabels: ['Attendee'], relationshipTypes: ['POS_TIE']}) "
        "YIELD node, score RETURN node.id, score"
    ).result_set)
    tribes = _remap_tribes(comm)
    db.run_batched(
        g,
        "UNWIND $rows AS r MATCH (a:Attendee {id: r.id}) SET a.tribe = r.t, a.broker = r.b, a.reach = r.r",
        [{"id": a, "t": tribes.get(a, -1), "b": float(broker.get(a, 0.0)), "r": float(reach.get(a, 0.0))} for a in tribes],
    )


def close_date(s: int, d: int) -> dict:
    st = state.load()
    _require(st.date_states(s)[d] == "open", f"session {s} date {d} is not open")
    t0 = time.time()
    tick = tick_of(s, d)
    people = load_people()

    # 1. Reduce and combine answers per meeting -> edges, reliability, likability, interests
    rows = db.people().query(DATE_EDGES, {"s": s, "d": d}).result_set
    by_pair: dict[frozenset, dict] = defaultdict(dict)
    surveys = []
    for u, v, q, a, complete, didnt, act, meet in rows:
        by_pair[frozenset((u, v))][u] = (json.loads(q), json.loads(a or "{}"), bool(didnt))
        surveys.append({"act": act, "meet_again": meet, "didnt_meet": bool(didnt)})
    ev = Evidence(people)
    for pair, raters in by_pair.items():
        a, b = sorted(pair)

        def side(x):
            if x not in raters or raters[x][2] or not raters[x][1]:
                return None, None
            return raters[x][0], raters[x][1]

        (qa, aa), (qb, ab) = side(a), side(b)
        ev.meeting(a, b, qa, aa, qb, ab)
    n_edges = ev.flush(s, d, tick)

    # 2. PageRank, m, comp, comp_unc
    competence.recompute(people)

    # 3. POS_TIE rebuild, then tribes, brokers, reach
    table = ties.load_tie_table()
    n_pos = ties.rebuild_pos_ties(table)
    structure_features(n_pos, people.n)

    # 4. Metrics
    point = metrics.compute(people, st.prev_comp, surveys, tick, s, d)
    st = state.load()
    st.metrics.append(point)
    st.prev_comp = people.comp.round(4).tolist()
    st.closed_ticks += 1
    st.last_tick = tick
    st.dates[str(s)][d] = "closed"
    state.save(st)
    after = load_people()  # includes tribes, brokers and reach just written
    bus.publish("date_closed", {
        "session": s, "date_no": d, "tick": tick, "metrics": point,
        "nodes": graph_events.changed_nodes(after),
        "edges": graph_events.learned_edges(tick),  # this date's votes plus check-ins since the last close
    })

    # 5. Synthetic check-ins around the show floor (they count toward the next close)
    encounters.synthetic_checkins(after, st.current_tick(), st)

    # 6. Next date, or close the session
    next_date = d + 1 if d + 1 < DATES_PER_SESSION else None
    if next_date is not None:
        open_date(s, next_date)
        session_state = "open"
    else:
        db.people().query("MATCH (a:InSession) REMOVE a:InSession")
        st = state.load()
        st.sessions[s] = "closed"
        state.save(st)
        session_state = "closed"
        bus.publish("session_closed", {"session": s})
    log.info("closed s%s d%s: %d learned edges, %d pos ties, %.1fs", s, d, n_edges, n_pos, time.time() - t0)
    return {"session": s, "date_no": d, "metrics": point, "next_date": next_date, "session_state": session_state}


def fast_forward(to_session: int) -> list[dict]:
    """Seed if needed, then simulate every session before `to_session`."""
    _require(0 <= to_session <= N_SESSIONS, f"to_session must be in 0..{N_SESSIONS}", 422)
    if not seed.is_seeded():
        seed.seed()
    points = []
    for s in range(to_session):
        st = state.load()
        if st.sessions[s] == "closed":
            continue
        if st.sessions[s] == "planned":
            open_session(s)
        while True:
            cur = state.load().current()
            if cur is None or cur[0] != s:
                break
            simulate_date(*cur)
            points.append(close_date(*cur)["metrics"])
    return points
