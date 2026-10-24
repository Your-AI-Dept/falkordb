"""The graph event language: payloads for GET /events and GET /graph/snapshot.

One place builds every shape the graph view reads (graph-view/src/graph/types.ts),
so the live stream, the snapshot and the recorded demo feed are identical.
Names follow the backend everywhere: `date_no`, `tick = 4 * session + date_no`,
string topic ids, vectors indexed by topic idx.
"""

from app import db, state
from app.cypher import learned_from
from app.models import Answer, QuestionSet
from app.services.seed import load_exhibitors_raw, load_talks_raw, session_attendees
from app.snapshot import People, load_people
from app.topics import topic_ids, topic_names

NODE_FIELDS = ("comp", "comp_unc", "interest", "m", "like", "tribe")

# Last node values sent, so date_closed carries only what changed.
_sent: dict[str, dict] = {}


def _r(v: float) -> float:
    return round(float(v), 3)


def node_values(people: People, i: int) -> dict:
    return {
        "comp": [_r(x) for x in people.comp[i]],
        "comp_unc": [_r(x) for x in people.comp_unc[i]],
        "interest": [_r(x) for x in people.interest[i]],
        "m": [int(x) for x in people.m[i]],
        "like": _r(people.like[i]),
        "tribe": int(people.tribe[i]),
    }


def attendee(people: People, i: int) -> dict:
    row = people.rows[i]
    return {
        "id": row["id"], "name": row["name"], "company": row["company"] or "", "title": row["title"] or "",
        "is_speaker": bool(row["is_speaker"]), "sessions": list(row["sessions"] or []),
        **node_values(people, i),
    }


def remember_all(people: People) -> None:
    _sent.clear()
    for i, a in enumerate(people.ids):
        _sent[a] = node_values(people, i)


def changed_nodes(people: People) -> list[dict]:
    """Attendees whose values changed since the last call, with only the changed fields."""
    out = []
    for i, a in enumerate(people.ids):
        now = node_values(people, i)
        before = _sent.get(a)
        diff = {k: v for k, v in now.items() if before is None or before.get(k) != v}
        if diff:
            out.append({"id": a, **diff})
            _sent[a] = now
    return out


def learned_edges(tick: int | None = None) -> list[dict]:
    """LEARNED_FROM edges (source = learner, target = expert), optionally only one tick's."""
    g = db.people()
    where = "WHERE r.tick = $tick" if tick is not None else ""
    out = []
    for k, tid in enumerate(topic_ids()):
        for src, dst, t in g.query(
            f"MATCH (l:Attendee)-[r:{learned_from(k)}]->(x:Attendee) {where} RETURN l.id, x.id, r.tick", {"tick": tick}
        ).result_set:
            out.append({"topic_id": tid, "source": src, "target": dst, "tick": t})
    return out


def answers_payload(qs: QuestionSet, answers: list[Answer]) -> list[dict]:
    """The submitted answers, each carrying what its question asked."""
    by_id = {q.question_id: q for q in qs.questions}
    out = []
    for a in answers:
        q = by_id[a.question_id]
        item = {"question_id": q.question_id, "kind": q.kind, "value": a.value}
        if q.kind == "claim":
            item.update(topic_id=q.topic_id, claim=q.claim, text=q.text, why=q.why.model_dump() if q.why else None)
        out.append(item)
    return out


def plan_payload(s: int) -> list[list[dict]]:
    rows = db.people().query(
        "MATCH (u:Attendee)-[e:SPEED_DATE {session: $s}]->(v:Attendee) WHERE e.a_id = u.id "
        "RETURN e.date_no, u.id, v.id, e.w ORDER BY e.date_no, e.w DESC",
        {"s": s},
    ).result_set
    dates: list[list[dict]] = [[] for _ in range(4)]
    for d, a, b, w in rows:
        dates[d].append({"a": a, "b": b, "value": w})
    return dates


def snapshot() -> dict:
    """Everything the graph view needs at load and after a reconnect."""
    people = load_people()
    remember_all(people)
    st = state.load()
    ids = topic_ids()
    pos = {t: k for k, t in enumerate(ids)}

    meetings = []
    for a, b, tick, act_a, act_b, s, d in db.people().query(
        "MATCH (a:Attendee)-[e:SPEED_DATE]->(b:Attendee) WHERE a.id < b.id "
        "MATCH (b)-[f:SPEED_DATE {session: e.session, date_no: e.date_no}]->(a) "
        "RETURN a.id, b.id, e.tick, e.act, f.act, e.session, e.date_no"
    ).result_set:
        if st.date_states(s)[d] != "planned":
            meetings.append({"kind": "date", "tick": tick, "a": a, "b": b, "act_a": act_a, "act_b": act_b})
    for a, b, tick, act_a, act_b in db.people().query(
        "MATCH (a:Attendee)-[e:ADHOC]->(b:Attendee) WHERE a.id < b.id MATCH (b)-[f:ADHOC]->(a) "
        "RETURN a.id, b.id, e.last_tick, e.act, f.act"
    ).result_set:
        meetings.append({"kind": "checkin", "tick": tick, "a": a, "b": b, "act_a": act_a, "act_b": act_b})

    cur = st.current()
    open_s = next((s for s, x in enumerate(st.sessions) if x == "open"), None)
    session = None
    if open_s is not None:
        session = {"session": open_s, "date_no": cur[1] if cur else None,
                   "attendees": session_attendees(open_s), "dates": plan_payload(open_s)}

    return {
        "topics": [{"idx": k, "id": t, "name": topic_names()[k]} for k, t in enumerate(ids)],
        "attendees": [attendee(people, i) for i in range(people.n)],
        "edges": learned_edges(),
        "talks": [{"id": t["session_id"], "title": t["title"], "type": t["type"],
                   "topics": [{"idx": pos[x], "w": round(1 / len(t["topics"]), 4)} for x in t["topics"]]}
                  for t in load_talks_raw()],
        "vendors": [{"id": e["exhibitor_id"], "name": e["name"],
                     "profile": [round(1 / len(e["topics"]), 4) if t in e["topics"] else 0.0 for t in ids]}
                    for e in load_exhibitors_raw()],
        "metrics": st.metrics,
        "meetings": meetings,
        "session": session,
        "tick": st.last_tick,
        "last_question": st.last_question,
    }
