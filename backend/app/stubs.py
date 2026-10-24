"""Fixture responses for not-yet-implemented routes (build plan P0).

Built deterministically from the real files in data/, so the frontend sees
real topic ids, talk titles, exhibitor names and attendee names. Delete each
stub as its route gets a real implementation.
"""

import json
import random
from functools import lru_cache

from fastapi import Response

from app.config import DATES_PER_SESSION, N_SESSIONS, SESSIONS_PER_DAY, T, settings
from app.models import (
    AttendeeDetail,
    AttendeeSummary,
    DatePlan,
    Influencer,
    InfluencerEvent,
    InfluencerResult,
    InfluencerTarget,
    MetricsPoint,
    Option,
    Pair,
    PersonRef,
    Question,
    QuestionSet,
    SessionPlan,
    SessionSummary,
    Talk,
    TieEdge,
    TieGraph,
    TieNode,
    TieSummary,
    Topic,
    TopicEstimate,
    TopicGraph,
    TopicGraphEdge,
    TopicGraphNode,
    TopicWeight,
    Vendor,
    Why,
)

N_STUB_PEOPLE = 40
SESSION_HOURS = ["10:00", "11:00", "13:00", "14:00", "15:00"]

CLAIM_OPTIONS = [
    Option(value="true", label="True"),
    Option(value="false", label="False"),
    Option(value="skip", label="Didn't come up"),
]
ACT_OPTIONS = [
    Option(value="yes", label="Yes"),
    Option(value="maybe", label="Maybe"),
    Option(value="no", label="No"),
]
MEET_OPTIONS = [Option(value="yes", label="Yes"), Option(value="no", label="No")]


def _load(rel: str):
    return json.loads((settings.data_dir / rel).read_text())


@lru_cache
def topics() -> list[Topic]:
    return [
        Topic(id=t["topic_id"], idx=i, name=t["name"], description=t["description"])
        for i, t in enumerate(_load("program/topics.json"))
    ]


def _topic_names() -> dict[str, str]:
    return {t.id: t.name for t in topics()}


@lru_cache
def talks() -> list[Talk]:
    out = []
    for s in _load("program/sessions.json"):
        w = 1 / len(s["topics"]) if s["topics"] else 0
        out.append(
            Talk(
                id=s["session_id"],
                title=s["title"],
                type=s["type"],
                day=s["day"],
                start=s["start"],
                end=s["end"],
                room=s["room"],
                topics=[TopicWeight(topic_id=t, w=w) for t in s["topics"]],
                speaker_ids=[sp["attendee_id"] for sp in s["speakers"]],
            )
        )
    return out


@lru_cache
def vendors() -> list[Vendor]:
    out = []
    for e in _load("program/exhibitors.json"):
        w = 1 / len(e["topics"]) if e["topics"] else 0
        out.append(
            Vendor(
                id=e["exhibitor_id"],
                name=e["name"],
                category=e["category"],
                booth=str(e["booth"]),
                booth_size=e["booth_size"],
                profile={t: w for t in e["topics"]},
            )
        )
    return out


@lru_cache
def _people_raw() -> list[dict]:
    return [r["registration"] for r in _load("pizza_expo_attendees_enriched.json")[:N_STUB_PEOPLE]]


def _ref(r: dict) -> PersonRef:
    return PersonRef(
        id=r["attendee_id"],
        name=f"{r['first_name']} {r['last_name']}",
        company=r["company"],
        title=r["job_title"],
    )


def people() -> list[PersonRef]:
    return [_ref(r) for r in _people_raw()]


def person(attendee_id: str) -> PersonRef:
    for p in people():
        if p.id == attendee_id:
            return p
    return PersonRef(id=attendee_id, name="Unknown Attendee", company="", title="")


def _rng(*key) -> random.Random:
    return random.Random("|".join(map(str, key)))


def _vec(rng: random.Random) -> list[float]:
    return [round(rng.random(), 3) for _ in range(T)]


def attendee_summaries() -> list[AttendeeSummary]:
    ids = [t.id for t in topics()]
    out = []
    for r in _people_raw():
        rng = _rng("summary", r["attendee_id"])
        interest = _vec(rng)
        top = [ids[i] for i in sorted(range(T), key=lambda i: -interest[i])[:3]]
        out.append(
            AttendeeSummary(
                **_ref(r).model_dump(),
                business_type=r["business_type"],
                ticket_type=r["ticket_type"],
                is_speaker=r["ticket_type"] == "Speaker",
                tribe=rng.randrange(5),
                like=round(rng.uniform(0.3, 0.9), 3),
                top_interests=top,
            )
        )
    return out


def attendee_detail(attendee_id: str) -> AttendeeDetail | None:
    summary = next((a for a in attendee_summaries() if a.id == attendee_id), None)
    if summary is None:
        return None
    rng = _rng("detail", attendee_id)
    return AttendeeDetail(
        **summary.model_dump(),
        years_exp=rng.randrange(1, 30),
        sessions=sorted(rng.sample(range(N_SESSIONS), 3)),
        broker=round(rng.random(), 3),
        reach=round(rng.uniform(0, 50), 2),
        topics=[
            TopicEstimate(
                topic_id=t.id,
                interest=round(rng.random(), 3),
                comp=round(rng.random(), 3),
                comp_unc=round(rng.uniform(0.2, 1), 3),
                m=rng.randrange(4),
            )
            for t in topics()
        ],
        ties=TieSummary(linkedin=rng.randrange(5, 11), adhoc=rng.randrange(4), speed_dates=4, pos_ties_out=3, pos_ties_in=2),
    )


def session_slot(s: int) -> tuple[int, str, str]:
    day = s // SESSIONS_PER_DAY + 1
    start = SESSION_HOURS[s % SESSIONS_PER_DAY]
    end = f"{int(start[:2]) + 1:02d}:00"
    return day, start, end


def sessions() -> list[SessionSummary]:
    out = []
    for s in range(N_SESSIONS):
        day, start, end = session_slot(s)
        state = "closed" if s == 0 else "open" if s == 1 else "planned"
        out.append(
            SessionSummary(
                session=s,
                day=day,
                start=start,
                end=end,
                headcount=_rng("headcount", s).randrange(185, 215),
                state=state,
                current_date=1 if state == "open" else None,
            )
        )
    return out


def session_plan(s: int) -> SessionPlan:
    ps = people()
    dates = []
    for d in range(DATES_PER_SESSION):
        rng = _rng("plan", s, d)
        order = ps[:]
        rng.shuffle(order)
        half = len(order) // 2
        pairs = []
        for a, b in zip(order[:half], order[half:]):
            va, vb = round(rng.uniform(0.3, 0.9), 3), round(rng.uniform(0.3, 0.9), 3)
            done = d == 0
            pairs.append(Pair(a=a, b=b, w=min(va, vb), value_a=va, value_b=vb, complete_a=done, complete_b=done))
        state = "closed" if d == 0 else "open" if d == 1 else "planned"
        dates.append(DatePlan(date_no=d, tick=DATES_PER_SESSION * s + d, state=state, pairs=pairs, sitting_out=[]))
    return SessionPlan(session=s, state="open", dates=dates)


def date_questions(s: int, d: int, rater_id: str) -> QuestionSet:
    plan = session_plan(s).dates[d]
    partner = next(
        (p.b if p.a.id == rater_id else p.a for p in plan.pairs if rater_id in (p.a.id, p.b.id)),
        people()[1],
    )
    rng = _rng("questions", s, d, rater_id)
    names = _topic_names()
    first = partner.name.split()[0]
    chosen = rng.sample(list(names), 3)
    qs: list[Question] = []
    for i, topic_id in enumerate(chosen):
        why = Why(score=round(rng.uniform(0.05, 0.3), 3), ig=round(rng.uniform(0.2, 0.6), 3), plausibility=round(rng.uniform(0.3, 0.8), 3))
        topic = names[topic_id]
        qs.append(Question(question_id=f"t{i}a", kind="claim", topic_id=topic_id, claim="partner_taught",
                           text=f"{first} taught me something about {topic}.", options=CLAIM_OPTIONS, why=why))
        qs.append(Question(question_id=f"t{i}b", kind="claim", topic_id=topic_id, claim="self_taught",
                           text=f"I taught {first} something about {topic}.", options=CLAIM_OPTIONS, why=why))
    qs += _fixed_questions(first)
    return QuestionSet(rater_id=rater_id, partner=partner, context="date", phrased_by="template", complete=False, questions=qs)


def checkin_questions(rater_id: str, partner_id: str) -> QuestionSet:
    partner = person(partner_id)
    first = partner.name.split()[0]
    rng = _rng("checkin", rater_id, partner_id)
    topic = rng.choice(topics())
    why = Why(score=0.12, ig=0.4, plausibility=0.5)
    qs = [
        Question(question_id="t0a", kind="claim", topic_id=topic.id, claim="partner_taught",
                 text=f"{first} taught me something about {topic.name}.", options=CLAIM_OPTIONS, why=why),
        *_fixed_questions(first),
    ]
    return QuestionSet(rater_id=rater_id, partner=partner, context="checkin", phrased_by="template", complete=False, questions=qs)


def _fixed_questions(first: str) -> list[Question]:
    return [
        Question(question_id="act", kind="act", text=f"Would you act on {first}'s recommendation?", options=ACT_OPTIONS),
        Question(question_id="meet_again", kind="meet_again", text=f"Would you like to meet {first} again?", options=MEET_OPTIONS),
    ]


def metrics_points(n_ticks: int = 8) -> list[MetricsPoint]:
    pts = []
    for tick in range(n_ticks):
        pts.append(
            MetricsPoint(
                tick=tick,
                session=tick // DATES_PER_SESSION,
                date_no=tick % DATES_PER_SESSION,
                uncertainty=round(1 / (1 + 0.25 * (tick + 1)), 3),
                coverage=round(min(1, 0.04 * (tick + 1)), 3),
                stability=None if tick == 0 else round(0.5 + 0.05 * tick, 3),
                meet_again_rate=round(0.45 + 0.02 * tick, 3),
                act_yes_rate=round(0.35 + 0.015 * tick, 3),
            )
        )
    return pts


def topic_graph(topic_id: str) -> TopicGraph:
    rng = _rng("topic_graph", topic_id)
    ps = people()
    nodes = [
        TopicGraphNode(id=p.id, name=p.name, comp=round(rng.random(), 3), comp_unc=round(rng.uniform(0.2, 1), 3),
                       tribe=rng.randrange(5), like=round(rng.uniform(0.3, 0.9), 3), m=rng.randrange(4))
        for p in ps
    ]
    experts = [n.id for n in sorted(nodes, key=lambda n: -n.comp)[:6]]
    edges = [
        TopicGraphEdge(source=p.id, target=rng.choice(experts), tick=rng.randrange(8))
        for p in ps
        if p.id not in experts and rng.random() < 0.7
    ]
    return TopicGraph(topic_id=topic_id, tick=7, nodes=nodes, edges=edges)


def tie_graph() -> TieGraph:
    rng = _rng("ties")
    ps = people()
    nodes = [TieNode(id=p.id, name=p.name, tribe=i % 5, broker=round(rng.random(), 3), reach=round(rng.uniform(0, 50), 2))
             for i, p in enumerate(ps)]
    edges = []
    for a in ps:
        for b in rng.sample(ps, 3):
            if a.id != b.id:
                edges.append(TieEdge(source=a.id, target=b.id, p_pos=round(rng.uniform(0.4, 0.8), 3)))
    return TieGraph(nodes=nodes, edges=edges)


def influencers(kind: str, event_id: str) -> InfluencerResult | None:
    if kind == "topic":
        t = next((t for t in topics() if t.id == event_id), None)
        if t is None:
            return None
        event = InfluencerEvent(kind="topic", id=t.id, name=t.name, profile={t.id: 1.0})
    else:
        v = next((v for v in vendors() if v.id == event_id), None)
        if v is None:
            return None
        event = InfluencerEvent(kind="vendor", id=v.id, name=v.name, profile=v.profile)
    rng = _rng("influencers", kind, event_id)
    ps = people()
    picks = rng.sample(ps, 5)
    others = [p for p in ps if p not in picks]
    infl = []
    for i, p in enumerate(picks):
        infl.append(
            Influencer(
                person=p,
                marginal_reach=round(4.0 / (i + 1), 2),
                comp_x=round(rng.uniform(0.6, 0.9), 3),
                m=rng.randrange(2, 8),
                like=round(rng.uniform(0.6, 0.9), 3),
                like_n=rng.randrange(3, 10),
                tribe=i,
                broker=round(rng.random(), 3),
                reach=round(rng.uniform(5, 40), 2),
                top_targets=[InfluencerTarget(person=t, p_x=round(rng.uniform(0.1, 0.5), 3)) for t in rng.sample(others, 5)],
            )
        )
    return InfluencerResult(event=event, n_targets=120, expected_reach=round(sum(i.marginal_reach for i in infl), 2),
                            influencers=infl)


def mark_stub(response: Response) -> None:
    """Router dependency: flag fixture responses so the frontend can tell."""
    response.headers["X-Stub"] = "true"
