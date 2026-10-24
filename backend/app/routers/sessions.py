"""Speed-dating sessions, dates, questions and answers (design doc 4.1, 4.2, 5)."""

from collections import defaultdict

from fastapi import APIRouter, Depends, Path

from app import db, state
from app.config import DATES_PER_SESSION, N_SESSIONS
from app.models import (
    AnswerSubmission,
    DateCloseResult,
    DatePlan,
    MeetingWhy,
    Pair,
    PersonRef,
    QuestionSet,
    SessionPlan,
    SessionSummary,
)
from app.routers.catalog import require_seeded
from app.services import explain, pipeline, seed
from app.services.survey_store import get_date_survey, save_date_answers

router = APIRouter(prefix="/sessions", tags=["sessions"], dependencies=[Depends(require_seeded)])

SessionNo = Path(ge=0, lt=N_SESSIONS)
DateNo = Path(ge=0, lt=DATES_PER_SESSION)

PLAN = """
MATCH (u:Attendee)-[e:SPEED_DATE {session: $s}]->(v:Attendee)
WHERE e.a_id = u.id
MATCH (v)-[f:SPEED_DATE {session: $s, date_no: e.date_no}]->(u)
RETURN e.date_no, u.id, u.name, u.company, u.title, v.id, v.name, v.company, v.title,
       e.w, e.value, f.value, e.complete, f.complete
ORDER BY e.date_no, e.w DESC
"""


@router.get("", response_model=list[SessionSummary])
def list_sessions():
    st = state.load()
    counts: dict[int, int] = defaultdict(int)
    for (sessions,) in db.people().query("MATCH (a:Attendee) RETURN a.sessions").result_set:
        for s in sessions or []:
            counts[s] += 1
    cur = st.current()
    out = []
    for s in range(N_SESSIONS):
        day, start, end = pipeline.session_slot(s)
        out.append(SessionSummary(
            session=s, day=day, start=start, end=end, headcount=counts[s], state=st.sessions[s],
            current_date=cur[1] if cur and cur[0] == s else None,
        ))
    return out


def _plan(s: int) -> SessionPlan:
    st = state.load()
    dates = {d: [] for d in range(DATES_PER_SESSION)}
    for d, ai, an, ac, at, bi, bn, bc, bt, w, va, vb, ca, cb in db.people().query(PLAN, {"s": s}).result_set:
        dates[d].append(Pair(
            a=PersonRef(id=ai, name=an, company=ac or "", title=at or ""),
            b=PersonRef(id=bi, name=bn, company=bc or "", title=bt or ""),
            w=w, value_a=va, value_b=vb, complete_a=bool(ca), complete_b=bool(cb),
        ))
    attendees = set(seed.session_attendees(s)) if st.sessions[s] != "planned" else set()
    out = []
    for d, pairs in dates.items():
        matched = {p.a.id for p in pairs} | {p.b.id for p in pairs}
        out.append(DatePlan(
            date_no=d, tick=pipeline.tick_of(s, d), state=st.date_states(s)[d], pairs=pairs,
            sitting_out=[PersonRef(id=a, name="", company="", title="") for a in sorted(attendees - matched)],
        ))
    return SessionPlan(session=s, state=st.sessions[s], dates=out)


@router.post("/{s}/open", response_model=SessionPlan)
def open_session(s: int = SessionNo):
    """Plan the session's 4 dates (maxFlow matching), create SPEED_DATE edges, open date 0."""
    pipeline.open_session(s)
    return _plan(s)


@router.get("/{s}", response_model=SessionPlan)
def get_session(s: int = SessionNo):
    return _plan(s)


@router.get("/{s}/dates/{d}/meetings/{rater_id}/questions", response_model=QuestionSet)
def get_questions(rater_id: str, s: int = SessionNo, d: int = DateNo):
    return get_date_survey(s, d, rater_id)


@router.get("/{s}/dates/{d}/meetings/{rater_id}/why", response_model=MeetingWhy)
def why_we_matched(rater_id: str, s: int = SessionNo, d: int = DateNo):
    """Why this pair was planned: the score breakdown recorded at planning time, graph evidence
    (competence, shared interests, likability, communities, shortest social path) and the Cypher behind it."""
    return explain.meeting_why(s, d, rater_id)


@router.post("/{s}/dates/{d}/meetings/{rater_id}/answers", response_model=QuestionSet)
def submit_answers(body: AnswerSubmission, rater_id: str, s: int = SessionNo, d: int = DateNo):
    """Save one or more answers; returns the updated survey."""
    return save_date_answers(s, d, rater_id, body.answers)


@router.post("/{s}/dates/{d}/close", response_model=DateCloseResult)
def close_date(s: int = SessionNo, d: int = DateNo):
    """Run the date pipeline (edges, PageRank, POS_TIE, tribes, metrics), then open the next date."""
    return pipeline.close_date(s, d)
