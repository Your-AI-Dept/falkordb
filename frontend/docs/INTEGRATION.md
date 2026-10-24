# Frontend integration handoff

## Current state

The shared app is `frontend/`. It replaces the starter counter page while preserving the repository's React/Vite/TypeScript tooling and default port 5173. JavaScript/JSX is allowed alongside future TypeScript pages. The existing Docker Compose frontend command still works.

The user has confirmed that the backend endpoint names and responses will change. Do not implement backend routes to satisfy the older frontend proposal. `docs/API.md` and `api-examples.json` describe the current adapter's expectations, not an agreed team contract. The round routes in `../../design_doc.md` are also provisional.

At integration time, update `src/api.js`, `src/graph-api.js`, `src/rest.js`, and `src/graph-contract.js` to normalize the settled responses for the existing components. Keep domain decisions and graph algorithms on the backend. `VITE_API_BASE_URL` is currently a public frontend setting that enables the earlier REST proposal; leave it blank for fixture mode until the adapter is aligned. Never place credentials in it. Configured API failures do not fall back to fixtures.

## UI coverage and gaps

| Capability | UI today | Backend handoff still needed |
| --- | --- | --- |
| Profile and event goals | Two-step setup and goal cards | Real attendee/session identity and profile read/write |
| Chance QR connection | Scan/manual/sample save; no survey | Resolve badges, persist a directional encounter; a scan is not trust or endorsement |
| Post-meeting questions | Same modal, one question at a time, save on tap, completion required | Meeting/round identity; server questions and completion; map topic-learning and tie answers without changing their meaning |
| Two participants | Separate local Paul/Theo responses | Independent live rater identity, durable answers, safe retry/duplicate handling |
| Dynamic follow-ups | Generic prompts/options, queued refresh, active-question stability | Actual graph-driven selection and agreed revision/update semantics |
| Graph simulation and visualization | Completed-feedback modal links to `VITE_VISUALIZATION_URL` in a new tab, then offers Top people; disabled until URL supplied | Teammate-owned graph UI, seed/simulation controls, convergence view; handoff only, no data synchronization added |
| Top X people for Y topic | Topic/count controls; server-order renderer | Agreed ranked-result response with identities, reason, applied revision, and definition of the ranking |
| Assigned itinerary | One next stop plus agenda; arrival, finish, and unavailability; no browse/request/RSVP UX | Server-owned assignments, availability and capacity, shared attendee/exhibitor schedule, persistence |
| Booth activation | One contact, preset slot, scheduled visitors; arrival updates agenda, finish requires private feedback | Shared assignment/attendance records; exhibitor remains local-only |

The current local usefulness question is not the backend design's topic-learning signal. The shared renderer can display “I learned more,” “We learned evenly,” “They learned more,” and “It didn't come up,” followed by tie questions. Map returned question IDs/options in the adapter when the payload is finalized. An explicit “It didn't come up” answer should count as completion, not manufacture competence evidence. Do not convert a generic yes/no usefulness response into a learned-from edge.

The existing proposed renderer expects question versions, graph/survey revisions, respondent/subject display objects, and saved-answer receipts. If the settled API omits those, agree the equivalent lifecycle and duplicate protection or simplify the renderer; do not fabricate authoritative revisions or receipts locally.

## Scheduling seam

`Dashboard.agenda` is a frontend display shape with an ID, kind (`meeting` or `booth`), person, time, location, topic, optional reason, and status (`scheduled`, `checked_in`, `feedback_due`, `completed`, or `missed`). The server chooses the next stop; the UI displays the first active entry in the returned schedule. This is not a finalized endpoint proposal. `api.assignment(id, action)` supports `check_in`, `finish`, and `miss` only in local mode; configured live mode returns an explicit unavailable error until the team wires the settled API. No scheduling route has been invented or added.

`src/demo-agenda.js` contains the clearly separated fixture plan, and `agendaFor`/`updateAssignment` in `src/demo.js` manage local progress. Check-in is attendance, finish triggers required feedback, and unavailability is neither usefulness nor expertise evidence. Active assignments are retained through topic changes. The old requests and invitation responses remain dormant adapter compatibility code; the current attendee UI does not call them. Shared booth agenda state uses scheduled/unavailable/check-in, never a fabricated RSVP.

## Product meaning

The product is an adaptive itinerary for a physical event: the app tells an attendee who to meet, where, and when. Feedback improves subsequent assignments. Lead with the attendee's need and a counterpart's relevant experience. A name identifies the person; it does not establish relevance. One chance encounter does not make somebody a trusted intermediary. Render a connection path only when each edge is supported and its meaning is clear. A graph path is not automatically an endorsement or introduction.

“Top” must name what the backend ranks: topic expertise, likely usefulness to a specific person, or relevant reach for a vendor. These are different queries. For the current video, agree on topic expertise and show the same topic before and after simulated feedback. Do not call that buyer intent, broad influence, or guaranteed commercial ROI.

## Merge validation

The port-5173 app, frontend tests, production build, and repository lint command are the integration checks. API tests use mocked responses; they are not proof that the evolving FastAPI routes work. Lint currently reports non-fatal React migration warnings. Backend/database behavior is owned and validated separately.

## Profile, survey review, and meeting preferences

The logo returns to the current role's home. Demo participant links preserve `participant=theo` through feedback, rankings, and Theo's own home; that preview reads Theo's feedback and cannot edit Paul's profile. Live identity remains server-owned.

The avatar opens a profile summary. Profile/goals editing and the badge are explicit actions. Survey Back/Next is read-only navigation; choosing a different saved answer explicitly revises it. The demo requires a current revision for edits, removes dependent follow-ups when the first answer changes, and preserves other people/meetings. X, Escape, and backdrop dismissal explain that feedback is required while keeping the modal open.

Two local demo follow-up options:
- `other` requires `answerText` (1–300 trimmed characters). Store the attendee's words without inferring expertise, topic competence, or a structured goal.
- `no_similar` requires confirming the named topic. Store a separate `{kind: 'avoid_topic', topicId, topicLabel}` preference. It suppresses unstarted future peer assignments on that topic for this event, while preserving the current meetup, already-started stops, and booth visits. The attendee can turn it back on from their profile. The other participant's schedule is unaffected.

All route definitions remain unchanged. Optional `questions` metadata supports reviewing historical options in the local demo. In live mode the UI can navigate saved answer receipts, but answer revision, free text, and preference writes are deliberately not sent until their backend mappings are agreed. The new backend alignment note at `docs/api-alignment.md` is available for that next adapter task. No backend files or endpoints were changed for this UX pass.
