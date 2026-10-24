"""Persist surveys on the rater's outgoing edge (design doc 2.3, 4.1).

Date surveys live on SPEED_DATE (rater -> partner, filtered by session and
date); check-in surveys on ADHOC (rater -> partner). Questions and answers are
JSON strings; `act` and `meet_again` are mirrored as plain properties because
tie belief and likability read them directly.
"""

import json

from fastapi import HTTPException

from app import db
from app.events import bus
from app.services.graph_events import answers_payload
from app.models import Answer, PersonRef, Question, QuestionSet
from app.surveys import apply_answers, didnt_meet, refresh
from app.topics import idx

_RETURN = "e.questions, e.answers, e.survey_revision, e.graph_revision, e.phrased_by, e.meeting_id, v.id, v.name, v.company, v.title, coalesce(e.tick, e.last_tick)"

_DATE_MATCH = "MATCH (u:Attendee {id: $rater})-[e:SPEED_DATE {session: $s, date_no: $d}]->(v:Attendee)"
_CHECKIN_MATCH = "MATCH (u:Attendee {id: $rater})-[e:ADHOC]->(v:Attendee {id: $partner})"

_SAVE = """
SET e.answers = $answers, e.survey_revision = $rev, e.complete = $complete,
    e.act = $act, e.meet_again = $meet_again, e.didnt_meet = $didnt_meet
"""


def _to_set(row, rater: str, context: str) -> QuestionSet:
    questions, answers, rev, graph_rev, phrased_by, meeting_id, vid, vname, vcompany, vtitle, _tick = row
    if not questions or questions == "[]":
        raise HTTPException(409, "questions for this meeting haven't been generated yet (the date isn't open)")
    return refresh(QuestionSet(
        meeting_id=meeting_id,
        rater_id=rater,
        partner=PersonRef(id=vid, name=vname, company=vcompany or "", title=vtitle or ""),
        context=context,
        phrased_by=phrased_by or "template",
        graph_revision=graph_rev or 0,
        survey_revision=rev or 0,
        complete=False,
        current_question_id=None,
        questions=[Question(**q) for q in json.loads(questions)],
        answers=json.loads(answers or "{}"),
    ))


def _mirrors(qs: QuestionSet) -> dict:
    meet = qs.answers.get("meet_again")
    return {
        "act": qs.answers.get("act"),
        "meet_again": None if meet is None else meet == "yes",
        "didnt_meet": didnt_meet(qs),
    }


def _date_row(s: int, d: int, rater: str):
    rows = db.people().query(f"{_DATE_MATCH} RETURN {_RETURN}", {"rater": rater, "s": s, "d": d}).result_set
    if not rows:
        raise HTTPException(404, f"{rater} has no meeting in session {s}, date {d}")
    return rows[0]


def get_date_survey(s: int, d: int, rater: str) -> QuestionSet:
    return _to_set(_date_row(s, d, rater), rater, "date")


def save_date_answers(s: int, d: int, rater: str, answers: list[Answer]) -> QuestionSet:
    row = _date_row(s, d, rater)
    qs = apply_answers(_to_set(row, rater, "date"), answers)
    db.people().query(
        f"{_DATE_MATCH} {_SAVE}",
        {"rater": rater, "s": s, "d": d, "answers": json.dumps(qs.answers), "rev": qs.survey_revision,
         "complete": qs.complete, **_mirrors(qs)},
    )
    bus.publish("answer_recorded", {
        "source": "date", "session": s, "date_no": d, "tick": row[-1], "rater_id": rater, "partner_id": qs.partner.id,
        "complete": qs.complete, "answers": answers_payload(qs, answers),
    })
    return qs


def _checkin_row(rater: str, partner: str):
    rows = db.people().query(f"{_CHECKIN_MATCH} RETURN {_RETURN}", {"rater": rater, "partner": partner}).result_set
    if not rows:
        raise HTTPException(404, f"no check-in between {rater} and {partner}")
    return rows[0]


def get_checkin_survey(rater: str, partner: str) -> QuestionSet:
    return _to_set(_checkin_row(rater, partner), rater, "checkin")


def save_checkin_answers(rater: str, partner: str, answers: list[Answer]) -> QuestionSet:
    row = _checkin_row(rater, partner)
    qs = apply_answers(_to_set(row, rater, "checkin"), answers)
    db.people().query(
        f"{_CHECKIN_MATCH} {_SAVE}",
        {"rater": rater, "partner": partner, "answers": json.dumps(qs.answers), "rev": qs.survey_revision,
         "complete": qs.complete, **_mirrors(qs)},
    )
    bus.publish("answer_recorded", {
        "source": "checkin", "tick": row[-1], "rater_id": rater, "partner_id": partner,
        "complete": qs.complete, "answers": answers_payload(qs, answers),
    })
    return qs


def claim_answers(questions: list[dict], answers: dict[str, str]) -> dict[int, dict[str, str]]:
    """{topic_idx: {claim: value}} for one rater's claim answers."""
    out: dict[int, dict[str, str]] = {}
    for q in questions:
        if q["kind"] == "claim" and q["question_id"] in answers:
            out.setdefault(idx(q["topic_id"]), {})[q["claim"]] = answers[q["question_id"]]
    return out

