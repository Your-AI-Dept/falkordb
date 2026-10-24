"""Survey state: saving answers, revisions and completion (design doc 4.1).

Pure functions over QuestionSet, shared by date and check-in surveys and by
the stub and real storage layers.
"""

from fastapi import HTTPException

from app.models import Answer, QuestionSet

MET_QUESTION_ID = "met"
DIDNT_MEET = "no"


def didnt_meet(qs: QuestionSet) -> bool:
    return qs.answers.get(MET_QUESTION_ID) == DIDNT_MEET


def refresh(qs: QuestionSet) -> QuestionSet:
    """Recompute complete and current_question_id from the saved answers."""
    if didnt_meet(qs):
        qs.complete, qs.current_question_id = True, None
        return qs
    pending = [q for q in qs.questions if q.question_id not in qs.answers]
    qs.current_question_id = pending[0].question_id if pending else None
    qs.complete = not any(q.required for q in pending)
    return qs


def apply_answers(qs: QuestionSet, answers: list[Answer]) -> QuestionSet:
    """Validate and upsert answers. Re-sending an identical answer is a no-op,
    so retries never double-count; a changed answer bumps survey_revision."""
    by_id = {q.question_id: q for q in qs.questions}
    for a in answers:
        q = by_id.get(a.question_id)
        if q is None:
            raise HTTPException(422, f"unknown question id {a.question_id!r}")
        allowed = {o.value for o in q.options}
        if a.value not in allowed:
            raise HTTPException(422, f"{a.value!r} is not an option for {a.question_id!r}; expected one of {sorted(allowed)}")
    for a in answers:
        if qs.answers.get(a.question_id) != a.value:
            qs.answers[a.question_id] = a.value
            qs.survey_revision += 1
    return refresh(qs)
