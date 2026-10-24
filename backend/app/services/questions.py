"""Question target selection: what to ask (design doc 4.1).

Builds each rater's survey: attendance check (dates only), 2-3 topics x
claims chosen for information value, then the two fixed questions. Text
comes from `llm.py` (Claude, or templates).
"""

from dataclasses import dataclass

import numpy as np

from app import db, mathcore
from app.config import ATTENTION_COST, Q_MAX_TOPICS, Q_MIN_TOPICS
from app.models import Option, Question, Why
from app.services import llm
from app.snapshot import People
from app.surveys import MET_QUESTION_ID
from app.topics import topic_descriptions, topic_ids, topic_names

CLAIM_OPTIONS = [
    Option(value="true", label="True"),
    Option(value="false", label="False"),
    Option(value="skip", label="Didn't come up"),
]
ACT_OPTIONS = [Option(value="yes", label="Yes"), Option(value="maybe", label="Maybe"), Option(value="no", label="No")]
MEET_OPTIONS = [Option(value="yes", label="Yes"), Option(value="no", label="No")]
MET_OPTIONS = [Option(value="yes", label="Yes, we met"), Option(value="no", label="We didn't meet")]


@dataclass
class Target:
    question_id: str
    topic_idx: int
    claim: str  # partner_taught | self_taught
    why: Why


@dataclass
class ContentContext:
    related: dict[int, list[int]]
    demand: np.ndarray


def load_content_context() -> ContentContext:
    g = db.content()
    related: dict[int, list[int]] = {}
    for a, b in g.query("MATCH (a:Topic)-[:RELATED]->(b:Topic) RETURN a.idx, b.idx").result_set:
        related.setdefault(a, []).append(b)
    profiles = [r[0] for r in g.query("MATCH (v:Vendor) RETURN v.profile").result_set]
    return ContentContext(related=related, demand=mathcore.vendor_demand(profiles) if profiles else np.zeros(len(topic_ids())))


def select_targets(people: People, ctx: ContentContext, rater: str, partner: str, checkin: bool = False) -> list[Target]:
    u, v = people.ix[rater], people.ix[partner]
    s = people.s()
    score, ig, plaus = mathcore.topic_scores(
        people.interest[u], people.interest[v], s[u], s[v], people.comp_unc[u], people.comp_unc[v],
        ctx.demand, float(people.reliability()[u]),
    )
    candidates = mathcore.candidate_topics(people.interest[u], people.interest[v], people.comp[v], ctx.related)
    if checkin:
        best = max(candidates, key=lambda t: (score[t], -t))
        chosen = [best] if score[best] >= ATTENTION_COST else []
        claims = ["partner_taught"]
    else:
        chosen = mathcore.select_topics(score, candidates, ctx.related, Q_MIN_TOPICS, Q_MAX_TOPICS, ATTENTION_COST)
        claims = ["partner_taught", "self_taught"]
    targets = []
    for i, k in enumerate(chosen):
        why = Why(score=round(float(score[k]), 4), ig=round(float(ig[k]), 4), plausibility=round(float(plaus[k]), 4))
        for c in claims:
            targets.append(Target(question_id=f"t{i}{'a' if c == 'partner_taught' else 'b'}", topic_idx=k, claim=c, why=why))
    return targets


def template_text(target: Target, partner_first: str) -> str:
    topic = topic_names()[target.topic_idx]
    if target.claim == "partner_taught":
        return f"{partner_first} taught me something about {topic}."
    return f"I taught {partner_first} something about {topic}."


def build_questions(targets: list[Target], texts: dict[str, str], partner_first: str, checkin: bool) -> list[Question]:
    qs: list[Question] = []
    if not checkin:
        qs.append(Question(question_id=MET_QUESTION_ID, kind="met", text=f"Did you meet {partner_first}?", options=MET_OPTIONS))
    ids = topic_ids()
    for t in targets:
        qs.append(Question(
            question_id=t.question_id, kind="claim", topic_id=ids[t.topic_idx], claim=t.claim,
            text=texts.get(t.question_id) or template_text(t, partner_first), options=CLAIM_OPTIONS, why=t.why,
        ))
    qs.append(Question(question_id="act", kind="act", text=f"Would you act on {partner_first}'s recommendation?", options=ACT_OPTIONS))
    qs.append(Question(question_id="meet_again", kind="meet_again", text=f"Would you like to meet {partner_first} again?", options=MEET_OPTIONS))
    return qs


def generate(
    people: People,
    ctx: ContentContext,
    jobs: list[tuple[str, str]],
    checkin: bool,
    use_claude: set[str],
) -> list[tuple[list[Question], str]]:
    """Surveys for (rater, partner) jobs: [(questions, phrased_by)]. Raters in
    `use_claude` get Claude phrasing (templates on any failure)."""
    targets = [select_targets(people, ctx, r, p, checkin=checkin) for r, p in jobs]
    names, descriptions = topic_names(), topic_descriptions()

    def who(aid: str) -> dict:
        row = people.rows[people.ix[aid]]
        return {k: row[k] for k in ("name", "company", "title", "business_type")}

    claude_ix = [i for i, (r, _) in enumerate(jobs) if r in use_claude and targets[i]]
    phrased = llm.phrase_batch([
        llm.PhraseJob(
            rater=who(jobs[i][0]),
            partner=who(jobs[i][1]),
            claims=[{"question_id": t.question_id, "claim": t.claim, "topic_name": names[t.topic_idx],
                     "topic_description": descriptions[t.topic_idx]} for t in targets[i]],
        )
        for i in claude_ix
    ])
    texts: dict[int, dict[str, str] | None] = dict(zip(claude_ix, phrased))
    out = []
    for i, (rater, partner) in enumerate(jobs):
        first = people.rows[people.ix[partner]]["name"].split()[0]
        t = texts.get(i)
        out.append((build_questions(targets[i], t or {}, first, checkin), "claude" if t else "template"))
    return out
