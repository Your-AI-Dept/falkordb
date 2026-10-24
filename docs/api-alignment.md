# Backend API ↔ Rally frontend: alignment note

**For:** @mtolaru (frontend) · **From:** backend · **Date:** 2026-10-24

Your docs said the frontend proposal (now archived in `frontend/docs/archived/API.md`) wasn't a contract and that route changes belong in your adapter. This note describes the backend API that now exists, maps it onto the four routes your core demo needs, and lists what we adopted from your proposal, what differs and why, and two open product questions. Please reply here on GitHub (PR or issue comments) with anything that doesn't work for your renderer.

> **Status (harmonization pass, merged with PR #9):** the Rally adapter now implements the mapping below inside the original flows (`frontend/src/live.js`, `backend-adapter.js`, `graph-api.js`), fixtures use the same shapes, real PE27 attendees and the 10 canonical topic ids, and the graph view consumes the backend's event stream directly. Shared terms are defined once in `design_doc.md` §0.1. What's still browser-local is listed in `frontend/docs/INTEGRATION.md`.

## What exists right now

- Run it: `docker compose up -d --build` (FalkorDB, backend on `:8001`, Rally on `:5173`, graph view on `:5174`). Both apps call the backend through their `/api` proxy; CORS also allows 5173 and 5174 directly.
- Schema: `backend/openapi.json`, or `GET http://localhost:8001/openapi.json` / `/docs` on a running backend.
- **Update: every route is now real**, backed by the FalkorDB graph (no more fixtures or `X-Stub` header). To get data: `POST /admin/seed` (about 1s), then `POST /admin/fast_forward?to_session=N` to simulate N sessions (about 7s per session), or open a session yourself with `POST /sessions/{s}/open`. The field shapes didn't change.
- For the live two-person demo: `PUT /admin/humans {"ids": ["PE27-...", "PE27-..."]}` makes the simulator skip those raters and gives them Claude-phrased questions.
- One event, no `/v1/events/:eventId` prefix, no auth. Identity is the attendee id in the path (`PE27-00001`), which lines up with your local participant switch.
- Design context: `design_doc.md` §4.1 (questions), §6 (API).

## Your four core-demo routes → ours

### 1. Topics

| Yours | Ours |
| --- | --- |
| `GET /topics` → `{topics: [{id, label}]}` | `GET /topics` → `[{id, idx, name, description}]` |

Map `label = name`. Topic ids are strings like `dough-flour`, the same ids used everywhere else.

### 2. Get a survey

| Yours | Ours |
| --- | --- |
| `GET /meetings/:meetingId/survey` | `GET /sessions/{s}/dates/{d}/meetings/{rater_id}/questions` |

Response (`QuestionSet`) → your `MeetingSurvey`:

| `MeetingSurvey` | `QuestionSet` |
| --- | --- |
| `meetingId` | `meeting_id`, e.g. `s3-d1-PE27-00001-PE27-00288`; shared by both participants' surveys; `s`/`d` are its prefix |
| `respondent` | `rater_id` (it's in the path) |
| `subject` | `partner` `{id, name, company, title}` (`role = title`) |
| `graphRevision` | `graph_revision` (the graph tick the questions were chosen from) |
| `surveyRevision` | `survey_revision` (increments whenever a saved answer changes) |
| `complete` | `complete` |
| `currentQuestion` | the question whose `question_id == current_question_id` (null when complete) |
| `queuedQuestions` | unanswered questions after the current one, in `questions` order |
| `answers: SavedAnswer[]` | `answers: {question_id: value}`; look up prompt and label from `questions` |
| `Question.id / version / prompt / required` | `question_id / version / text / required` |
| `choices: [{id, label}]` | `options: [{value, label}]` |

Extra fields you can show or ignore: `kind` (`met`, `claim`, `act`, `meet_again`), `topic_id`, `claim`, `why` (`score`, `ig`, `plausibility`: why the backend chose this question, for the hero visual), `phrased_by` (`claude` or `template`), `context` (`date` or `checkin`).

### 3. Save an answer

| Yours | Ours |
| --- | --- |
| `POST /meetings/:id/survey/answers` `{questionId, questionVersion, answerKey, surveyRevision}` → `{survey}` | `POST /sessions/{s}/dates/{d}/meetings/{rater_id}/answers` `{answers: [{question_id, value}]}` → the updated `QuestionSet` directly |

- Save on tap works: send one answer per request. Batches also work.
- **Retries are safe without an `Idempotency-Key`.** Answers are keyed by `question_id`, so re-sending the same answer is a no-op and doesn't bump `survey_revision`.
- **No 409s.** The question set is fixed once generated (`version` is always 1 today), so there's nothing for a stale client to conflict with. Polling is fine; `GET /events` (SSE) is also available if you'd rather push.
- Unknown question ids or values not in `options` → 422 with `{detail: "..."}` (FastAPI's error shape, not `{message}`).

### 4. Top X people for topic Y

| Yours | Ours |
| --- | --- |
| `GET /rankings?topicId=&limit=` | `GET /topics/{topic_id}/experts?limit=5` |

Response (`TopicRanking`): `{topic, limit, graph_revision, status: "ready" | "updating", items: [{rank, person, comp, comp_unc, m, reason, evidence: [{label, kind}]}]}`. Ranks are contiguous and 1-based, in server order, with no duplicate people. `limit` accepts 1–50, not only 3/5/10/20. Per your INTEGRATION.md, "top" here means one specific thing: **estimated topic competence**, learned from what meeting partners reported. Reasons are display-safe and never reveal an individual's answer.

### 5. Explanations ("why we matched you", "why these people")

- `GET /sessions/{s}/dates/{d}/meetings/{rater_id}/why` → `MeetingWhy`: `headline`, `score` (both sides' values, pair score, the date's fairness floor, component breakdown), ranked `reasons` (`kind`, `title`, `detail`, `weight`), `path` (shortest social path as people + tie type, or null) and `evidence_queries` (label + Cypher). 404 if the rater has no meeting that date.
- Influencer responses add `why` per pick (`pick_order`, percentiles, `direct_targets`, `unique_targets`, `reasons`), plus `audience` (coverage summary), `runners_up` and `evidence_queries`.
- Render `title`/`detail` as given; unknown reason kinds should still render.

## What we took from your proposal

- **"We didn't meet."** Every date survey now opens with "Did you meet {partner}?" (Yes, we met / We didn't meet). "We didn't meet" completes the survey and writes nothing to the graph.
- **Save on tap, server-owned completion.** `current_question_id` and `complete` are computed by the backend; you never decide completion locally.
- **One meeting id, two participant-scoped surveys.** Paul → Theo and Theo → Paul stay separate; missing answers stay unknown.
- **Rankings with a reason and evidence per person**, and "top" defined explicitly.
- **"It didn't come up"** is on every topic question and counts toward completion, not as evidence, as you specified.

## What differs, and why

1. **Questions are about topics, not usefulness.** After the attendance check, a rater gets 4–6 true/false statements on 2–3 topics (e.g. "Maria showed me a dough fermentation trick I'd actually try"), then "Would you act on {partner}'s recommendation?" and "Would you like to meet {partner} again?". The backend picks the topics that would teach the graph the most, and Claude phrases them for the specific pair. Answers update graph edges by what each question was meant to ask, never by the wording, so a generic "was it useful?" never becomes a "learned from" edge (your INTEGRATION.md asked for exactly this).
2. **The whole question set is generated up front**, while the 15-minute date is running (about 200 raters per date), instead of choosing each next question from the previous answer. That's why there are no question versions or conflicts to manage.
3. **Speed-dating structure.** Meetings come from organizer-run sessions: 15 one-hour sessions of about 200 people, each with 4 planned 15-minute dates. That's where `s` and `d` in the paths come from. Peer meeting requests aren't part of the backend.
4. **No dashboard, meeting-request, booth-invitation or profile routes.** Your HACKATHON.md cut line keeps those local for the demo; the backend doesn't plan to build them before the deadline.
5. **Graph UI and admin controls** (session console, simulate, topic graph, metrics, micro-influencers) are backend-side routes for the separate graph view, as your docs anticipated: `/sessions`, `/graph/topics/{id}`, `/graph/ties`, `/metrics`, `/topics/{id}/influencers`.

## Open questions for you (and the team)

1. **Should a QR scan prompt questions?** Your design saves the connection with no survey ("a scan is not trust or endorsement"). The current backend design prompts both people with 2–3 quick questions after a scan (`POST /checkins {scanner_id, scanned_id}` returns both surveys). The scan alone still records only an encounter; trust and likability come only from the answers. If you'd rather not prompt, the frontend can just not show the survey, and nothing breaks.
2. **Which exhibitor story does the video tell?** Your booth invitation flow (exhibitor invites fitting attendees directly) or the backend's micro-influencers (a sponsor hosting an event gives tickets to a few well-liked, competent, well-connected attendees, who invite others: `GET /topics/{id}/influencers`). They complement each other, but the video probably has time for one.

## Suggested next step

Point `src/graph-api.js` at the four routes above and do the field mapping in your adapter, as your INTEGRATION.md planned. You can do that against the fixture data now; it switches to real data without frontend changes.
