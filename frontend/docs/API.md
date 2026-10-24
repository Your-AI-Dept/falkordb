# Earlier frontend REST proposal

> Integration note: the team is updating the endpoints. These paths and payloads are frontend examples, not a requirement for the backend. See [INTEGRATION.md](INTEGRATION.md) before connecting the app. Keep route and payload changes in the adapter.

This is a proposal, not a running backend or a contract already agreed with the graph teammate. The frontend consumes this contract through `src/api.js`, with survey/ranking routes in `src/graph-api.js`. The API URL and payloads have not yet been supplied by the teammate. The exhibitor prototype is still local-only.

## Configuration and reads

Set `VITE_API_BASE_URL` to the backend API origin and `VITE_EVENT_ID=pizza-expo`. Requests use `/v1/events/:eventId`, `credentials: include`, JSON, and a 12-second timeout. Writes carry an `Idempotency-Key`. The server owns authentication, authorization, eligibility, capacity, cookie/CSRF handling, and CORS for the exact frontend origin. No secret belongs in a Vite variable.

`GET /me/dashboard` returns `Dashboard` from `src/contracts.d.ts`. Ordinary attendee writes re-fetch this snapshot; peer response writes re-fetch the recipient inbox. Survey writes return an updated survey directly; closing the survey refreshes the dashboard. `meetingRequests` contains the viewer’s outgoing requests with stable IDs, saved time/location, and pending/accepted/declined status. `invitation.visit` is null before check-in, then contains `checkedInAt` and the viewer’s private feedback. A required unanswered `meeting.feedbackRequired` or checked-in booth visit opens its feedback modal automatically. `people` must contain everyone referenced by recommendations, encounters, the displayed arranged meeting, and the invitation. `meeting` and `invitation` may be null. Return `meeting.surveyComplete` for the authenticated participant; it must remain false until all required survey answers save. Include display-ready time labels; the server should also store real timestamps and the event timezone.

`GET /me/meeting-requests` returns `PeerInbox`: authenticated `viewer` and incoming `requests`, each including sender identity/context. The live route `?view=peer` uses that authenticated viewer; it never sends the demo `person` query parameter as authorization. Local-only persona links appear after requesting a peer meeting.

Generate the exact current sample from the project directory:

```sh
node --input-type=module -e "import {freshState,snapshot} from './src/demo.js'; console.log(JSON.stringify(snapshot(freshState()),null,2))"
```

Recommendations contain a person, plain-language reason, source label, and optional path. Do not invent confidence percentages or reveal private feedback. The frontend does not compute the real graph score.

## Writes

All paths below follow `/v1/events/:eventId`. Ordinary writes may return JSON or 204; encounter writes must return the resolved person and duplicate flag.

| Method/path | Body | Semantics |
| --- | --- | --- |
| POST `/me/profile` | `Profile` | Save business context, ordered goals, per-goal goalFocus answers, optional intention/LinkedIn URL. |
| POST `/encounters` | `{badgeToken, kind: "chosen_qr_connection"}` | Resolve event-scoped badge, reject self/invalid, deduplicate directional chosen connection. Return `{person, duplicate}`. No survey. |
| POST `/meeting-requests` | `{personId, durationMinutes: 15}` | Request a meeting; do not treat this as acceptance or attendance. |
| POST `/meeting-requests/:requestId/response` | `{response: "accepted" | "declined"}` | Only the addressed attendee may reply. Acceptance confirms the proposed time/location, not attendance or usefulness. |
| POST `/invitations/:invitationId/check-in` | `{}` | Record an idempotent self-reported booth arrival after acceptance; do not fabricate feedback. |
| POST `/invitations/:invitationId/feedback` | `{usefulness: "yes" | "somewhat" | "no"}` | Upsert private visit feedback after check-in, independent of arranged-meeting feedback. |
| POST `/recommendation-feedback` | `{personId, action: "not_now"}` | Suppress a suggestion without making a negative interpersonal edge. |
| POST `/invitations/:invitationId/response` | `{response: "accepted" | "declined"}` | Record RSVP, respecting current availability and capacity. Acceptance is not a check-in. |

Errors: appropriate 4xx/5xx with `{message: "Readable explanation"}`. The client preserves its prior snapshot on a failed write. The server must also deduplicate semantic operations when a timeout leaves a write’s outcome ambiguous (e.g. one QR connection per source/target/event, one feedback response per participant/meeting, one RSVP per invitation/recipient). Survey answer retries preserve their idempotency key for the same payload. Other adapter operations still generate a new key per invocation and also require semantic deduplication. The old `/meetings/:meetingId/feedback` adapter remains for compatibility but is no longer called by the UI; implement the versioned survey endpoint below for the demo.

## Questions and signal semantics

Onboarding has broad goal cards followed by an optional contextual choice, currently a local template in `focusQuestion`. Each selected goal gets its own follow-up, with answers stored in `profile.goalFocus` by goal ID. The legacy `focus` field mirrors the first goal’s answer. The business type can change the question framing. Free text supplies extra context but demo rules do not interpret it. LLM-generated questions are not implemented.

Arranged-meetup feedback is inline in the meeting modal and saves on tap. Its usefulness answer is required; Close, Escape, and backdrop cannot dismiss unanswered feedback. Booth feedback follows the same rule after check-in. The local arranged-meetup review flag is UI lifecycle metadata, not a graph edge or new REST endpoint. The live backend owns when a meeting is due for feedback via `meeting.feedbackRequired` and must enforce the requirement server-side. Do not demand a usefulness rating for a future meeting.

## Adaptive surveys

Implemented as a generic frontend renderer, pending the real API. Local mode has separate Paul and Theo fixture surveys. Live mode renders the server's question IDs, versions, prompts, choices, queued questions, and completion flag; it does not generate questions or calculate graph edges.

Use one meeting ID with two participant-scoped surveys. Preserve `(eventId, meetingId, respondentId, subjectId, questionId, questionVersion)` on the backend. Derive respondent identity from authentication and validate the counterpart. `participant=paul|theo` is a local-only preview parameter, never sent as live authorization. Each response includes only that respondent's saved answers. Keep Paul → Theo and Theo → Paul separate; missing feedback stays unknown.

| Method/path | Shape |
| --- | --- |
| GET `/meetings/:meetingId/survey` | `MeetingSurvey` below |
| POST `/meetings/:meetingId/survey/answers` | Body `{questionId, questionVersion, answerKey, surveyRevision}`; response `{survey: MeetingSurvey}`. Optional additional `answerId` is ignored by the UI. |

```ts
MeetingSurvey = {
  meetingId: string,
  respondent: {id: string, name: string, role?: string, company?: string},
  subject: {id: string, name: string, role?: string, company?: string},
  time?: string, location?: string,
  graphRevision: number, surveyRevision: number,
  complete: boolean,
  currentQuestion: Question | null,
  queuedQuestions: Question[],
  answers: SavedAnswer[]
}
Question = {
  id: string, version: number, prompt: string, required: boolean,
  choices: {id: string, label: string}[]
}
SavedAnswer = {
  questionId: string, questionVersion: number, prompt: string,
  answerKey: string, answerLabel: string,
  id?: string, meetingId?: string, respondentId?: string, subjectId?: string,
  submittedAt?: string
}
```

Question/choice IDs are arbitrary strings; do not parse display labels. The current renderer supports single-choice questions with at least two choices. All versions/revisions are nonnegative safe integers. An incomplete survey must contain a current question. A complete survey must have `currentQuestion: null` and no required queued questions. On temporary unavailability, return a retryable error instead of an empty question that could bypass feedback.

Answers save on tap in the same modal. Dismissal unlocks only when the server returns `complete: true`. In local mode, a usefulness answer is followed by one required branching question; “We didn't meet” completes without inventing attendance or a negative interpersonal relationship. Live question selection and required completion belong to the backend. Do not demand a usefulness rating for a future meeting.

**Refresh:** the open survey polls every 2.5 seconds while visible and refreshes on window focus. Local tabs also use storage events. Requests are serialized, canceled on unmount, and older revisions ignored. A poll may update queued questions, but pins the active question until its answer is saved. A partner's answer must advance the shared graph revision; any changed survey must advance its survey revision. Graph computation/queue selection may be asynchronous, so return `graphRevision` for the state actually used to choose the questions.

**Conflicts/retries:** accept an older displayed revision if that question/version remains valid, or return HTTP 409 with `{message, survey}`. The UI explicitly replaces a conflicted question using that response. Retries of the same payload retain an `Idempotency-Key`; the server must return the original result without inserting a second answer. A failed write preserves the active question. Transient poll recovery does not silently dismiss a failed-write message. API failures never fall back to fixtures.

## Top X people for Y topic

These routes can run independently of `/me/dashboard`, so the teammate can integrate the submission demo with just the four survey/ranking routes. Show this page **after** the separate graph simulation. There is no simulation/import controller in this frontend.

| Method/path | Shape |
| --- | --- |
| GET `/topics` | `{topics: [{id, label}]}` |
| GET `/rankings?topicId=...&limit=5` | `TopicRanking` below |

```ts
TopicRanking = {
  topic: {id: string, label: string},
  limit: 3 | 5 | 10 | 20,
  graphRevision: number,
  generatedAt?: string, // ISO 8601
  status: 'ready' | 'updating',
  items: [{
    rank: number, // contiguous 1-based positions, in server order
    person: {id: string, name: string, role?: string, company?: string},
    reason: string,
    evidence?: [{label: string, kind?: string}],
    profileSource?: {kind: 'bright_data' | 'attendee' | 'fixture', sourceUrl?: string, sourceId?: string}
  }]
}
```

Topic IDs, person IDs, and question IDs are not restricted to the fixtures. Return at most `limit` distinct people; fewer is valid. The UI preserves server order, never pads results, and does not calculate scores or percentages. Reasons and evidence labels must be display-safe and must not disclose somebody else's private response. `graphRevision` must describe the ranking calculation, not a newer revision that has not been applied yet.

The ranking page polls every 2.5 seconds while visible, refreshes on focus, ignores older revisions, and cancels requests when filters change or the page unmounts. Return `status: 'updating'` while recomputing, optionally with the last valid ranked set; then return `ready` with the new revision/order. Empty, loading, and failed-refresh states are handled. Selection is preserved in the URL (`?view=rankings&topic=...&limit=5`).

## Bright Data and simulation boundary

The teammate owns import, entity resolution, database storage, graph updates, and simulation. Normalize scraped profiles/companies to stable IDs and keep source URL/source ID. Store interaction provenance separately: a real imported company can have simulated interactions. A scraped profile is context, not proof of a professional connection, attendance, endorsement, or willingness to meet.

The frontend only consumes normalized topics, people, survey questions, and ranked results. No Bright Data credentials or database credentials belong here. `profileSource` is optional metadata; simulation/observed provenance and full edge evidence should remain in the backend and the separate graph view. The graph view and this UI must refer to the same event, entity IDs, and applied graph revision.

Machine-readable fixture payloads: [api-examples.json](api-examples.json). Full UI types: [contracts.d.ts](../src/contracts.d.ts). Those examples show serialization, not real imported data or a proven ranking algorithm.

## Demo boundary

Local fixture rules open the tomato booth invitation after a tomato goal and Maya QR save. They show the path You → Maya → Luca. The exhibitor sample reads Paul’s RSVP and check-in from the same browser storage, without receiving his usefulness answer. Peer accept/decline uses the same store and updates the sender across tabs. Writes re-read the current store so a later attendee action preserves the recipient’s response. Local storage does not coordinate separate browsers or devices. This is a demonstration of the desired round trip, not a server implementation, capacity check, or a claim of recommendation quality. In production both surfaces must read the same invitation record from the backend.
