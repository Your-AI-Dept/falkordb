"""Claude phrasing of question targets, with template fallback (design doc 4.1).

The algorithm decides *what* to ask (questions.py); Claude only decides *how*
to say it. Answers map through each target's claim, never the generated
text, so a bad phrasing can't corrupt the graph. Any error, timeout, refusal
or mismatch falls back to template text for that rater.
"""

import asyncio
import logging
import os
from dataclasses import dataclass

import anthropic
from pydantic import BaseModel, ValidationError

from app.config import LLM_MODEL, LLM_TIMEOUT_S, settings

log = logging.getLogger(__name__)

CONCURRENCY = 20
MAX_TEXT_LEN = 160

SYSTEM = """You write short post-meeting survey statements for attendees of Pizza Expo, a pizza industry trade show. After a 15-minute one-on-one conversation, the rater answers each statement with True, False, or "Didn't come up".

You get the rater, their conversation partner, and a list of claims. Rewrite each claim as one natural first-person statement from the rater's point of view.

Rules:
- Keep the claim's meaning exactly: who taught whom, and about which topic. "partner_taught" means the partner taught the rater something on the topic; "self_taught" means the rater taught the partner something.
- Make it concrete and specific to this pair (their roles, businesses and the topic's description), but never assert that a particular detail was discussed. The statement must still be answerable with "Didn't come up".
- Refer to the partner by first name only. Do not mention anyone else.
- One sentence, at most 20 words, plain language, no quotes or emoji.
- Return exactly one statement per claim, with the same question_id."""


class PhrasedQuestion(BaseModel):
    question_id: str
    text: str


class Phrasing(BaseModel):
    questions: list[PhrasedQuestion]


@dataclass
class PhraseJob:
    rater: dict  # {name, company, title, business_type}
    partner: dict
    claims: list[dict]  # [{question_id, claim, topic_name, topic_description}]


def enabled() -> bool:
    return bool(settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY"))


def _prompt(job: PhraseJob) -> str:
    def who(p: dict) -> str:
        return f"{p['name']}, {p.get('title') or 'attendee'} at {p.get('company') or 'an independent business'} ({p.get('business_type') or 'unknown business type'})"

    lines = [f"Rater: {who(job.rater)}", f"Partner: {who(job.partner)}", "", "Claims:"]
    for c in job.claims:
        lines.append(f"- question_id={c['question_id']} claim={c['claim']} topic={c['topic_name']} ({c['topic_description']})")
    return "\n".join(lines)


def _validate(job: PhraseJob, out: Phrasing | None) -> dict[str, str] | None:
    if out is None:
        return None
    wanted = {c["question_id"] for c in job.claims}
    got = {q.question_id: " ".join(q.text.split()) for q in out.questions}
    if set(got) != wanted or any(not t or len(t) > MAX_TEXT_LEN for t in got.values()):
        return None
    return got


async def _phrase_one(client: anthropic.AsyncAnthropic, sem: asyncio.Semaphore, job: PhraseJob) -> dict[str, str] | None:
    if not job.claims:
        return {}
    async with sem:
        try:
            resp = await client.beta.messages.parse(
                model=LLM_MODEL,
                max_tokens=4000,
                system=SYSTEM,
                messages=[{"role": "user", "content": _prompt(job)}],
                output_format=Phrasing,
                output_config={"effort": "low"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except anthropic.APITimeoutError:
            log.warning("claude phrasing timed out; using templates")
            return None
        except anthropic.RateLimitError:
            log.warning("claude phrasing rate limited; using templates")
            return None
        except anthropic.APIStatusError as e:
            log.warning("claude phrasing failed (%s): %s; using templates", e.status_code, e.message)
            return None
        except anthropic.APIConnectionError:
            log.warning("claude phrasing connection error; using templates")
            return None
        except (ValidationError, ValueError) as e:
            log.warning("claude phrasing returned unparseable output (%s); using templates", e)
            return None
    if resp.stop_reason == "refusal":
        log.warning("claude phrasing refused; using templates")
        return None
    return _validate(job, resp.parsed_output)


async def _phrase_all(jobs: list[PhraseJob]) -> list[dict[str, str] | None]:
    api_key = settings.anthropic_api_key or None  # None -> SDK reads the environment
    async with anthropic.AsyncAnthropic(api_key=api_key, timeout=LLM_TIMEOUT_S, max_retries=1) as client:
        sem = asyncio.Semaphore(CONCURRENCY)
        return await asyncio.gather(*(_phrase_one(client, sem, j) for j in jobs))


def phrase_batch(jobs: list[PhraseJob]) -> list[dict[str, str] | None]:
    """Phrase many raters' claims concurrently. Returns, per job, a
    {question_id: text} map, or None to use templates. Call from sync code
    (FastAPI runs sync routes in a worker thread, which has no event loop)."""
    if not jobs or not enabled():
        return [None] * len(jobs)
    return asyncio.run(_phrase_all(jobs))
