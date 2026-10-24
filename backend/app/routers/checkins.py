"""Ad-hoc QR check-ins (design doc 3.10)."""

from fastapi import APIRouter, Depends, HTTPException

from app import stubs
from app.models import AnswerResult, AnswerSubmission, CheckinRequest, CheckinResult, QuestionSet

router = APIRouter(prefix="/checkins", tags=["checkins"], dependencies=[Depends(stubs.mark_stub)])


@router.post("", response_model=CheckinResult)
def create_checkin(body: CheckinRequest):
    if body.scanner_id == body.scanned_id:
        raise HTTPException(422, "cannot check in with yourself")
    return CheckinResult(
        count=1,
        scanner_questions=stubs.checkin_questions(body.scanner_id, body.scanned_id),
        scanned_questions=stubs.checkin_questions(body.scanned_id, body.scanner_id),
    )


@router.get("/{rater_id}/{partner_id}/questions", response_model=QuestionSet)
def get_checkin_questions(rater_id: str, partner_id: str):
    return stubs.checkin_questions(rater_id, partner_id)


@router.post("/{rater_id}/{partner_id}/answers", response_model=AnswerResult)
def submit_checkin_answers(rater_id: str, partner_id: str, body: AnswerSubmission):
    qs = stubs.checkin_questions(rater_id, partner_id)
    known = {q.question_id for q in qs.questions}
    unknown = [a.question_id for a in body.answers if a.question_id not in known]
    if unknown:
        raise HTTPException(422, f"unknown question ids: {unknown}")
    return AnswerResult(accepted=len(body.answers), complete=len(body.answers) == len(known))
