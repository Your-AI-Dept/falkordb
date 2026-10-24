# Submission demo and integration cut line

**Positioning hypothesis:** Rally turns an event's changing relationship graph into useful conversations. Organizers buy relevance for attendees and exhibitors. Buyer demand and willingness to pay still need validation.

## The agreed sequence

1. **Two people meet.** Open Paul and Theo's participant-specific views of the same completed meeting. Assignment and acceptance alone are not usefulness evidence.
2. **They give different feedback.** Paul chooses “Yes, useful”; Theo chooses “Not really.” Preserve the two directions independently. Each gets a short required follow-up in the same modal, saved on tap. The API owns question selection; the UI can refresh queued questions without replacing the active question.
3. **Show many connections in the separate graph UI.** The teammate's visualization demonstrates a simulation over normalized real Pizza Expo data plus explicitly simulated interactions. Use the same event/entity IDs and graph revisions as the API. Graph visualization, data ingestion, and simulation controls are outside this frontend's scope.
4. **Finish with Top X people for Y topic.** Return to Rally's Top people screen. Select a topic and count, then show the backend's ranked people with a short reason for each. Capture the same query before and after the simulation to make a ranking change assessable. The UI preserves the server's order.

The exhibitor assigned-visit agenda is an optional commercial extension, not an extra step in the core demo. A relevant supplier, expert, or buyer discovered in the final results can explain why this becomes valuable to an exhibitor. Do not consume video time on team availability, coverage confirmation, or extra setup.

## Implemented versus remaining

| Capability | Current status |
| --- | --- |
| Profile/goals, chosen QR saves, assigned day | Working local frontend demo |
| Mandatory inline meetup survey and booth check-in/feedback | Working local frontend demo |
| One booth contact, preset activation, assigned-guest/check-in agenda | Working local frontend demo; exhibitor REST remains out of scope |
| Independent Paul/Theo answers and different follow-ups | Working local demo with directional records and saved question versions |
| Generic API-rendered current/queued questions | Implemented with response validation, retries, conflict handling, and revision-aware polling |
| Top X by topic | Implemented with server ordering, count controls, refresh, and empty/error states |
| REST transport and contract checks | Tested with mocked HTTP responses; backend alignment note exists, adapter mapping not connected |
| Graph/database, Bright Data ingestion, and graph visualization/simulation | Separate teammate's work, not connected or verified here |
| Genuine graph-selected questions and improved rankings | Require backend implementation and live integration verification |

Earlier frontend proposal (the team is replacing these endpoints): `GET /meetings/:id/survey`, `POST /meetings/:id/survey/answers`, `GET /topics`, and `GET /rankings`. The standalone survey/ranking pages do not require the dashboard routes. See [API.md](API.md) and [api-examples.json](api-examples.json). Update `src/graph-api.js` if the teammate chooses different route names; do not create a competing backend.

## Demo rehearsal

Use [DEMO-WALKTHROUGH.md](DEMO-WALKTHROUGH.md) for the current three-minute script, exact local clicks, presenter handoff, and fallback when the graph is not connected.

Use one completed meeting and two authenticated sessions in live mode. The local `participant` switch is not authentication. Verify:

- Different feedback survives reload for both participants without revealing the other's response.
- The active question stays stable while queued questions refresh. The server chooses at least one changed follow-up for a defensible graph-based reason.
- Every required response saves before the modal closes. A failed save remains answerable and retry does not create duplicate evidence.
- The separate graph visualization reaches the actual applied revision after answers and simulation batches.
- The same topic query finishes with the backend's top people at that revision. Imported profiles and simulated interactions remain distinguishable.

Current local fixture rankings have fixed ordering. A changing local revision number only exercises UI synchronization; it is not graph learning. Do not present this as evidence of better ranking quality.

## What makes the graph valuable

Keep imported context, professional ties with a supported source, chosen QR connections, assigned meetings, accepted invitations, self-reported attendance, and directional usefulness as distinct evidence. A match cannot become positive evidence simply because the app assigned it.

Return a readable reason for each ranked person. Compare a before/after query with profile/goal matching alone if the backend supports it. Topic fit, availability, capacity, and consent belong in eligibility; proximity in the graph alone is not buyer intent. Missing responses stay unknown.

Commercially, this can support more relevant attended conversations and booth activations. Keep the outcome trail separate: assigned → checked in → completed → feedback. Assignment alone is not consent, attendance, or usefulness evidence. This demo does not establish actual ROI, revenue, retention, or measured graph uplift.

## Cut line

Finish live survey → external simulation → topic ranking integration first. Defer CRM export, bulk outreach, discounts, cross-event identity, room allocation, and an organizer dashboard. Reserve the final thirty minutes for video and submission. Stop feature work before that and rehearse a reproducible run with the exact dataset and API the video will use.

## Current rehearsal update

The current attendee demo reveals four fixed meetings in one hour, then offers a graph handoff after all four stops resolve. The exhibitor demo now starts with profile setup and a pizza-sauce launch, followed by sample audience evidence, invitation preview, attendee acceptance, and booth response tracking. This supersedes the earlier automatic assigned-guest booth agenda below/above. Use DEMO-WALKTHROUGH.md for the current sequence. Audience selection and graph recomputation remain local fixtures/handoff pending API mapping.
