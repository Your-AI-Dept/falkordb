"""Topics, talks, vendors and attendees."""

from fastapi import APIRouter, Depends, HTTPException

from app import stubs
from app.models import AttendeeDetail, AttendeeSummary, Talk, Topic, Vendor

router = APIRouter(tags=["catalog"], dependencies=[Depends(stubs.mark_stub)])


@router.get("/topics", response_model=list[Topic])
def list_topics():
    return stubs.topics()


@router.get("/talks", response_model=list[Talk])
def list_talks():
    return stubs.talks()


@router.get("/vendors", response_model=list[Vendor])
def list_vendors():
    return stubs.vendors()


@router.get("/attendees", response_model=list[AttendeeSummary])
def list_attendees():
    return stubs.attendee_summaries()


@router.get("/attendees/{attendee_id}", response_model=AttendeeDetail)
def get_attendee(attendee_id: str):
    detail = stubs.attendee_detail(attendee_id)
    if detail is None:
        raise HTTPException(404, f"attendee {attendee_id} not found")
    return detail
