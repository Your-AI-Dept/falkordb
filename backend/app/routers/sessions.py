"""Speed-dating sessions, dates, questions and answers (design doc 4.1, 4.2, 5)."""

from fastapi import APIRouter, Depends, Path

from app import stubs
from app.config import DATES_PER_SESSION, N_SESSIONS
from app.models import (
    AnswerSubmission,
    DateCloseResult,
    QuestionSet,
    SessionPlan,
    SessionSummary,
)
from app.surveys import apply_answers

router = APIRouter(prefix="/sessions", tags=["sessions"], dependencies=[Depends(stubs.mark_stub)])

SessionNo = Path(ge=0, lt=N_SESSIONS)
DateNo = Path(ge=0, lt=DATES_PER_SESSION)


@router.get("", response_model=list[SessionSummary])
def list_sessions():
    return stubs.sessions()


@router.post("/{s}/open", response_model=SessionPlan)
def open_session(s: int = SessionNo):
    return stubs.session_plan(s)


@router.get("/{s}", response_model=SessionPlan)
def get_session(s: int = SessionNo):
    return stubs.session_plan(s)


@router.get("/{s}/dates/{d}/meetings/{rater_id}/questions", response_model=QuestionSet)
def get_questions(rater_id: str, s: int = SessionNo, d: int = DateNo):
    return stubs.date_questions(s, d, rater_id)


@router.post("/{s}/dates/{d}/meetings/{rater_id}/answers", response_model=QuestionSet)
def submit_answers(body: AnswerSubmission, rater_id: str, s: int = SessionNo, d: int = DateNo):
    """Save one or more answers; returns the updated survey."""
    return apply_answers(stubs.date_questions(s, d, rater_id), body.answers)


@router.post("/{s}/dates/{d}/close", response_model=DateCloseResult)
def close_date(s: int = SessionNo, d: int = DateNo):
    tick = DATES_PER_SESSION * s + d
    point = stubs.metrics_points(tick + 1)[-1]
    last = d == DATES_PER_SESSION - 1
    return DateCloseResult(
        session=s,
        date_no=d,
        metrics=point,
        next_date=None if last else d + 1,
        session_state="closed" if last else "open",
    )
