"""Pydantic models for the REST API (design doc section 6).

Topics are identified by their string id (e.g. "dough-flour") everywhere in
the API; integer topic indices stay internal.
"""

from typing import Literal

from pydantic import BaseModel, Field


class Health(BaseModel):
    status: str
    falkordb: bool
    graphs: list[str]


# --- Catalog -----------------------------------------------------------------


class Topic(BaseModel):
    id: str
    idx: int
    name: str
    description: str


class TopicWeight(BaseModel):
    topic_id: str
    w: float


class Talk(BaseModel):
    id: str
    title: str
    type: str
    day: int
    start: str
    end: str
    room: str
    topics: list[TopicWeight]
    speaker_ids: list[str]


class Vendor(BaseModel):
    id: str
    name: str
    category: str
    booth: str
    booth_size: str
    profile: dict[str, float] = Field(description="topic_id -> weight, sums to 1")


# --- Attendees ---------------------------------------------------------------


class PersonRef(BaseModel):
    id: str
    name: str
    company: str
    title: str


class AttendeeSummary(PersonRef):
    business_type: str
    ticket_type: str
    is_speaker: bool
    tribe: int
    like: float
    top_interests: list[str] = Field(description="top 3 topic ids by interest")


class TopicEstimate(BaseModel):
    topic_id: str
    interest: float
    comp: float
    comp_unc: float
    m: int


class TieSummary(BaseModel):
    linkedin: int
    adhoc: int
    speed_dates: int
    pos_ties_out: int
    pos_ties_in: int


class AttendeeDetail(AttendeeSummary):
    years_exp: int
    sessions: list[int]
    broker: float
    reach: float
    topics: list[TopicEstimate]
    ties: TieSummary


# --- Sessions and dates ------------------------------------------------------

SessionState = Literal["planned", "open", "closed"]
DateState = Literal["planned", "open", "closed"]


class SessionSummary(BaseModel):
    session: int
    day: int
    start: str
    end: str
    headcount: int
    state: SessionState
    current_date: int | None


class Pair(BaseModel):
    a: PersonRef
    b: PersonRef
    w: float = Field(description="min(V_a(b), V_b(a))")
    value_a: float
    value_b: float
    complete_a: bool
    complete_b: bool


class DatePlan(BaseModel):
    date_no: int
    tick: int
    state: DateState
    pairs: list[Pair]
    sitting_out: list[PersonRef]


class SessionPlan(BaseModel):
    session: int
    state: SessionState
    dates: list[DatePlan]


# --- Questions and answers ---------------------------------------------------


class Option(BaseModel):
    value: str
    label: str


class Why(BaseModel):
    score: float
    ig: float
    plausibility: float


class Question(BaseModel):
    question_id: str
    version: int = Field(1, description="bumps if the question is regenerated; answers carry no version yet")
    kind: Literal["met", "claim", "act", "meet_again"]
    required: bool = True
    topic_id: str | None = None
    claim: Literal["partner_taught", "self_taught"] | None = None
    text: str
    options: list[Option]
    why: Why | None = None


class QuestionSet(BaseModel):
    meeting_id: str = Field(description="stable id for this rater's survey, e.g. s3-d1-PE27-00001-PE27-00288")
    rater_id: str
    partner: PersonRef
    context: Literal["date", "checkin"]
    phrased_by: Literal["claude", "template"]
    graph_revision: int = Field(description="tick of the graph state the questions were chosen from")
    survey_revision: int = Field(description="increments whenever a saved answer changes")
    complete: bool = Field(description="all required questions answered, or the rater said they didn't meet")
    current_question_id: str | None = Field(description="first unanswered question in order; null when complete")
    questions: list[Question] = Field(description="full ordered list; already-answered ones included")
    answers: dict[str, str] = Field(default_factory=dict, description="question_id -> value so far")


class Answer(BaseModel):
    question_id: str
    value: str


class AnswerSubmission(BaseModel):
    answers: list[Answer] = Field(min_length=1, description="one answer (save on tap) or several at once")


# --- Check-ins ---------------------------------------------------------------


class CheckinRequest(BaseModel):
    scanner_id: str
    scanned_id: str


class CheckinResult(BaseModel):
    count: int = Field(description="times these two have checked in with each other")
    scanner_questions: QuestionSet
    scanned_questions: QuestionSet


# --- Metrics -----------------------------------------------------------------


class MetricsPoint(BaseModel):
    tick: int
    session: int
    date_no: int
    uncertainty: float
    coverage: float
    stability: float | None
    meet_again_rate: float | None
    act_yes_rate: float | None


class Metrics(BaseModel):
    points: list[MetricsPoint]


class DateCloseResult(BaseModel):
    session: int
    date_no: int
    metrics: MetricsPoint
    next_date: int | None = Field(description="date opened next, or null if the session closed")
    session_state: SessionState


# --- Graph views -------------------------------------------------------------


class TopicGraphNode(BaseModel):
    id: str
    name: str
    comp: float
    comp_unc: float
    tribe: int
    like: float
    m: int


class TopicGraphEdge(BaseModel):
    source: str = Field(description="learner")
    target: str = Field(description="expert")
    tick: int


class TopicGraph(BaseModel):
    topic_id: str
    tick: int = Field(description="latest tick; edges with this tick are new")
    nodes: list[TopicGraphNode]
    edges: list[TopicGraphEdge]


class TieNode(BaseModel):
    id: str
    name: str
    tribe: int
    broker: float
    reach: float


class TieEdge(BaseModel):
    source: str = Field(description="sender")
    target: str = Field(description="receiver")
    p_pos: float


class TieGraph(BaseModel):
    nodes: list[TieNode]
    edges: list[TieEdge]


# --- Topic expert ranking ----------------------------------------------------


class Evidence(BaseModel):
    label: str
    kind: Literal["peer_votes", "speaker", "exhibitor", "profile", "prior"]


class RankedExpert(BaseModel):
    rank: int = Field(description="contiguous, 1-based, in server order")
    person: PersonRef
    comp: float
    comp_unc: float
    m: int = Field(description="distinct partners compared with on this topic")
    reason: str = Field(description="display-safe; never reveals an individual's private answer")
    evidence: list[Evidence]


class TopicRanking(BaseModel):
    topic: Topic
    limit: int
    graph_revision: int = Field(description="tick the ranking was computed from")
    status: Literal["ready", "updating"]
    items: list[RankedExpert]


# --- Micro-influencers -------------------------------------------------------


class InfluencerTarget(BaseModel):
    person: PersonRef
    p_x: float = Field(description="chance this person comes if handed a ticket")


class Influencer(BaseModel):
    person: PersonRef
    marginal_reach: float
    comp_x: float
    m: int
    like: float
    like_n: int = Field(description="meet_again answers behind like")
    tribe: int
    broker: float
    reach: float
    top_targets: list[InfluencerTarget]


class InfluencerEvent(BaseModel):
    kind: Literal["topic", "vendor"]
    id: str
    name: str
    profile: dict[str, float]


class InfluencerResult(BaseModel):
    event: InfluencerEvent
    n_targets: int
    expected_reach: float
    influencers: list[Influencer]


# --- Admin -------------------------------------------------------------------


class SeedResult(BaseModel):
    topics: int
    talks: int
    vendors: int
    attendees: int
    linkedin_edges: int
    seconds: float


class SimulateResult(BaseModel):
    answered: int
