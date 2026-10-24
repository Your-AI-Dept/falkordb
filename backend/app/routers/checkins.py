"""Ad-hoc QR check-ins (design doc 3.10)."""

from fastapi import APIRouter, Depends

from app.events import bus
from app.models import AnswerSubmission, CheckinRequest, CheckinResult, QuestionSet
from app.routers.catalog import require_seeded
from app.services import encounters
from app.services.survey_store import get_checkin_survey

router = APIRouter(prefix="/checkins", tags=["checkins"], dependencies=[Depends(require_seeded)])


@router.post("", response_model=CheckinResult)
def create_checkin(body: CheckinRequest):
    """Record a QR scan: create or bump the ADHOC tie and prompt both people with 2-3 questions."""
    count = encounters.checkin(body.scanner_id, body.scanned_id)
    bus.publish("checkin_recorded", {"scanner_id": body.scanner_id, "scanned_id": body.scanned_id, "count": count})
    return CheckinResult(
        count=count,
        scanner_questions=get_checkin_survey(body.scanner_id, body.scanned_id),
        scanned_questions=get_checkin_survey(body.scanned_id, body.scanner_id),
    )


@router.get("/{rater_id}/{partner_id}/questions", response_model=QuestionSet)
def get_checkin_questions(rater_id: str, partner_id: str):
    return get_checkin_survey(rater_id, partner_id)


@router.post("/{rater_id}/{partner_id}/answers", response_model=QuestionSet)
def submit_checkin_answers(rater_id: str, partner_id: str, body: AnswerSubmission):
    """Save one or more answers; returns the updated survey. Applied to the graph once complete."""
    return encounters.answer(rater_id, partner_id, body.answers)
