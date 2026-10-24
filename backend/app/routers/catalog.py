"""Topics, talks, vendors and attendees, read from the graphs."""

from fastapi import APIRouter, Depends, HTTPException

from app import db
from app.models import AttendeeDetail, AttendeeSummary, Talk, TieSummary, Topic, TopicEstimate, TopicWeight, Vendor
from app.services import seed
from app.topics import topic_ids


def require_seeded() -> None:
    if not seed.is_seeded():
        raise HTTPException(409, "graph not seeded; POST /admin/seed")


router = APIRouter(tags=["catalog"], dependencies=[Depends(require_seeded)])

ATTENDEE_FIELDS = (
    "a.id, a.name, a.company, a.title, a.business_type, a.ticket_type, a.is_speaker, "
    "a.tribe, a.like, a.interest"
)


def _weights(vec: list[float]) -> list[TopicWeight]:
    ids = topic_ids()
    return [TopicWeight(topic_id=ids[k], w=w) for k, w in enumerate(vec) if w > 0]


def _summary(row: list) -> AttendeeSummary:
    aid, name, company, title, business_type, ticket_type, is_speaker, tribe, like, interest = row[:10]
    ids = topic_ids()
    top = sorted(range(len(interest)), key=lambda k: -interest[k])[:3]
    return AttendeeSummary(
        id=aid, name=name, company=company, title=title, business_type=business_type,
        ticket_type=ticket_type, is_speaker=is_speaker, tribe=tribe, like=like,
        top_interests=[ids[k] for k in top],
    )


@router.get("/topics", response_model=list[Topic])
def list_topics():
    rows = db.content().query(
        "MATCH (t:Topic) RETURN t.id, t.idx, t.name, t.description ORDER BY t.idx"
    ).result_set
    return [Topic(id=r[0], idx=r[1], name=r[2], description=r[3]) for r in rows]


@router.get("/talks", response_model=list[Talk])
def list_talks():
    rows = db.content().query(
        "MATCH (t:Talk) RETURN t.id, t.title, t.type, t.day, t.start, t.end, t.room, t.topic_vec, t.speaker_ids "
        "ORDER BY t.start, t.id"
    ).result_set
    return [
        Talk(id=r[0], title=r[1], type=r[2], day=r[3], start=r[4], end=r[5], room=r[6],
             topics=_weights(r[7]), speaker_ids=r[8])
        for r in rows
    ]


@router.get("/vendors", response_model=list[Vendor])
def list_vendors():
    rows = db.content().query(
        "MATCH (v:Vendor) RETURN v.id, v.name, v.category, v.booth, v.booth_size, v.profile ORDER BY v.id"
    ).result_set
    return [
        Vendor(id=r[0], name=r[1], category=r[2], booth=r[3], booth_size=r[4],
               profile={w.topic_id: w.w for w in _weights(r[5])})
        for r in rows
    ]


@router.get("/attendees", response_model=list[AttendeeSummary])
def list_attendees():
    rows = db.people().query(f"MATCH (a:Attendee) RETURN {ATTENDEE_FIELDS} ORDER BY a.id").result_set
    return [_summary(r) for r in rows]


@router.get("/attendees/{attendee_id}", response_model=AttendeeDetail)
def get_attendee(attendee_id: str):
    g = db.people()
    rows = g.query(
        f"MATCH (a:Attendee {{id: $id}}) RETURN {ATTENDEE_FIELDS}, "
        "a.years_exp, a.sessions, a.broker, a.reach, a.comp, a.comp_unc, a.m",
        {"id": attendee_id},
    ).result_set
    if not rows:
        raise HTTPException(404, f"attendee {attendee_id} not found")
    r = rows[0]
    years_exp, sessions, broker, reach, comp, comp_unc, m = r[10:]
    interest = r[9]
    ties = g.query(
        """
        MATCH (a:Attendee {id: $id})
        OPTIONAL MATCH (a)-[l:LINKEDIN]->() WITH a, count(l) AS li
        OPTIONAL MATCH (a)-[h:ADHOC]->() WITH a, li, count(h) AS ad
        OPTIONAL MATCH (a)-[s:SPEED_DATE]->() WITH a, li, ad, count(s) AS sd
        OPTIONAL MATCH (a)-[po:POS_TIE]->() WITH a, li, ad, sd, count(po) AS pout
        OPTIONAL MATCH ()-[pi:POS_TIE]->(a)
        RETURN li, ad, sd, pout, count(pi)
        """,
        {"id": attendee_id},
    ).result_set[0]
    ids = topic_ids()
    return AttendeeDetail(
        **_summary(r).model_dump(),
        years_exp=years_exp,
        sessions=sessions,
        broker=broker,
        reach=reach,
        topics=[
            TopicEstimate(topic_id=ids[k], interest=interest[k], comp=comp[k], comp_unc=comp_unc[k], m=m[k])
            for k in range(len(ids))
        ],
        ties=TieSummary(linkedin=ties[0], adhoc=ties[1], speed_dates=ties[2], pos_ties_out=ties[3], pos_ties_in=ties[4]),
    )
