"""Read-only snapshot for the graph viewer; existing API contracts stay unchanged."""
from fastapi import APIRouter, Depends
from app import db, state
from app.cypher import learned_from
from app.routers.catalog import require_seeded, list_topics, list_talks, list_vendors
from app.routers.sessions import _plan
from app.snapshot import load_people
from app.topics import topic_ids

router = APIRouter(tags=["visualization"], dependencies=[Depends(require_seeded)])

@router.get("/graph/snapshot")
def graph_snapshot():
    people = load_people()
    st = state.load()
    ids = topic_ids()
    fields = ("id", "name", "company", "title", "is_speaker", "tribe", "comp", "comp_unc", "interest", "m", "like", "sessions")
    edges = []
    for k, topic_id in enumerate(ids):
        rows = db.people().query(f"MATCH (a)-[e:{learned_from(k)}]->(b) RETURN a.id, b.id, e.tick").result_set
        edges.extend({"topic_id": topic_id, "source": a, "target": b, "tick": tick} for a, b, tick in rows)
    current = st.current()
    session = None
    if current:
        s, d = current
        plan = _plan(s)
        dates = [[{"a": p.a.id, "b": p.b.id, "value": p.w} for p in date.pairs] for date in plan.dates]
        session = {"session": s, "date": d, "attendees": sorted({p[x] for date in dates for p in date for x in ("a", "b")}), "dates": dates}
    meetings = []
    rows = db.people().query("MATCH (a)-[e:SPEED_DATE]->(b) WHERE a.id < b.id MATCH (b)-[f:SPEED_DATE {session:e.session, date_no:e.date_no}]->(a) RETURN a.id,b.id,e.tick,e.act,f.act,e.session,e.date_no").result_set
    for a, b, tick, act_a, act_b, s, d in rows:
        if st.date_states(s)[d] != "planned":
            meetings.append({"kind":"date", "a":a,"b":b,"tick":tick,"act_a":act_a,"act_b":act_b})
    return {
        "topics": [t.model_dump() for t in list_topics()],
        "attendees": [{key: row[key] for key in fields} for row in people.rows],
        "edges": edges,
        "talks": [{"id": t.id,"title":t.title,"type":t.type,"topics":[{"idx":ids.index(w.topic_id),"w":w.w} for w in t.topics]} for t in list_talks()],
        "vendors": [{"id":v.id,"name":v.name,"profile":[v.profile.get(id,0) for id in ids]} for v in list_vendors()],
        "metrics": st.metrics, "meetings": meetings, "session":session, "tick":st.closed_ticks-1,
    }
