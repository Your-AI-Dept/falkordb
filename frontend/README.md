# Rally · Pizza Expo demo

React attendee and exhibitor frontend for the conference graph demo. This is the canonical shared app; the earlier local `rally/` directory is not part of the repository. Local UI fixtures are fictional. The team backend and dataset live in `../backend` and `../data`.

```sh
npm install
npm run dev
```

Open [attendee](http://localhost:5173/) or [exhibitor](http://localhost:5173/?view=exhibitor). Nothing is published. `npm test` covers signal and response invariants; `npm run build` creates the production bundle.

## Submission demo

1. Open [Paul’s survey](http://localhost:5173/?view=survey&meeting=meet-theo&participant=paul) and [Theo’s survey](http://localhost:5173/?view=survey&meeting=meet-theo&participant=theo). These are local preview personas; live identity comes from the server.
2. Paul chooses **Yes, useful**; Theo chooses **Not really**. They get different required follow-ups in the same modal. Every answer saves on tap, with separate respondent/subject IDs and question versions. Complete the follow-ups before leaving.
3. After all required answers save, the same modal offers **Open visualization**. This opens the teammate’s separate graph UI in a new tab while preserving the feedback receipt. Set `VITE_VISUALIZATION_URL` to its HTTP(S) address; until supplied, the button is disabled with “Visualization link pending.” The visualization and simulation remain teammate-owned.
4. Return to the feedback tab and choose **Continue to top people**. Select a topic and Top 3, 5, 10, or 20. Live mode displays the backend’s ordered results and reasons, refreshing every 2.5 seconds while visible.

Without an API URL, surveys use branching fixtures and rankings use fixed sample ordering. The local revision counter synchronizes views; it is not a computed graph or evidence that rankings improved. Real data, graph-selected follow-ups, and changed ranking order must come from the teammate’s API.

## Other attendee and exhibitor flows

1. Continue with Paul’s profile. Choose **Find better suppliers → Tomatoes & ingredients**. Optional: “A more reliable tomato grower in Italy.”
2. Open **Save a connection → Sample scan**. Maya is now a chosen connection. There is no survey after a scan.
3. Return home. The explanation shows **You → Maya → Luca** and a relevant booth invitation appears.
4. Open the invitation and choose **I’ll be there**. The exhibitor’s tomato session reflects Paul’s acceptance in the same browser.
5. In the same invitation, tap **I’m at the booth**, then **Yes**, **Somewhat**, or **Not really**. The agenda now shows Paul as checked in. Usefulness stays private.
6. Open Theo’s meetup. Feedback is inline and saves on tap; there is no separate feedback screen or Skip action. **We didn’t meet** records a missed meeting. Choose **Yes, useful → Flour & fermentation** to see Elena become the next suggestion.
7. Ask Elena for 15 minutes, then use **View as Elena → Accept meeting**. **Back to Paul’s view** shows the confirmed meeting. The two views also synchronize across tabs in the same browser.

The booth invitation, request, attendance, and usefulness are distinct states. An accepted invitation is not a check-in. An arranged meeting is not evidence that people liked one another.

## What is implemented

- Two-step attendee setup with tappable goal cards and a contextual optional follow-up.
- Editable business context and optional LinkedIn URL, without scraping or login.
- Suggested people, a saved-connections list, a QR badge, manual entry and sample scanning.
- Required inline arranged-meetup feedback, outgoing peer requests, recipient accept/decline, and confirmed meeting status.
- Separate Paul/Theo surveys, API-rendered questions, required follow-ups, saved-answer receipts, and revision-aware live refresh.
- Topic rankings with count controls, server ordering, safe reasons/evidence, and loading, updating, empty, and error states.
- One booth invitation with accept/decline, check-in, and required one-tap visit feedback. Check-in updates the exhibitor agenda.
- One-screen exhibitor setup with company, booth, one contact, and expertise. One preset Wednesday 1–2 PM activation, with accepted/pending/declined and checked-in visitors.
- Browser persistence and attendee reset.

**Integration status:** the frontend REST adapter and response validation are implemented. The team is updating the endpoints; neither the older frontend proposal nor the route sketches in `../design_doc.md` are a finalized contract. Two-sided persistence, different follow-ups, cross-tab refresh, and ranking controls work locally; API transport and failures are tested with mocked responses. No real graph/database or Bright Data feed has been connected or verified.

The exhibitor prototype lives in `src/exhibitor/`. Its sample Paul RSVP and check-in read the attendee demo state; other RSVP statuses are illustrative. It is not connected to REST yet.

## Integration

[Team integration handoff](docs/INTEGRATION.md) · [Earlier REST proposal](docs/API.md) · [UI types](src/contracts.d.ts) · [Hackathon priorities and demo proof](docs/HACKATHON.md)

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to the backend API origin. The attendee adapter in `src/api.js` switches to REST and never silently falls back to demo data. `VITE_EVENT_ID` defaults to `pizza-expo`. These are public build variables; API credentials belong on the server.

Set `VITE_VISUALIZATION_URL` independently of the API setting, then restart the dev server (or rebuild for deployment). The link opens only the supplied URL; no attendee IDs, feedback, or tokens are appended. This handoff does not run a simulation or connect the visualization to the database.

Start the teammate handoff with [sample JSON](docs/api-examples.json). The four survey/ranking routes live in `src/graph-api.js`, response validation in `src/graph-contract.js`, and transport in `src/rest.js`. The survey and rankings pages can integrate independently of the larger dashboard. No ranking algorithm or database is implemented here.

Fixtures: `src/data/pizza-expo.js`. Local behavior: `src/demo.js` and `src/demo-graph.js`. Frontend: `src/main.jsx`, `src/components/`, and `src/styles.css`. Saved state keys: `rally-pizza-attendee-v2` and `rally.pizza-exhibitor.v2`.

## Current limits

Recommendations and invitation eligibility use fixture rules, not the real graph. The QR URL is real, but local personas share browser storage, not authenticated accounts. No real invitation is sent. Camera support depends on the browser and has not been tested on a physical device. These frontend flows do not yet provide authentication, scraping, notification delivery, calendar sync, or live capacity enforcement. The team backend is FastAPI, separately developed under `../backend`. Opening the arranged meetup starts a local feedback requirement; booth check-in starts the booth feedback requirement. Close, Escape, and backdrop dismissal stay blocked until all required answers save; outstanding feedback reopens on reload. For live mode, the server must set `meeting.feedbackRequired` after the actual meeting, return `surveyComplete`, and enforce completion. A client-only gate is not server enforcement.

Earlier strategy and sketches in `docs/PRODUCT.md`, `docs/FLOW.md`, and `docs/LOOP-SKETCHES.md` are historical exploration. This README and the API contract describe the current implementation.

UI copy stays limited to labels, actions, match reasons, and operational states; see `AGENTS.md`. The draggable badge adapts the pointer and spring behavior from the Showdesks badge playground, using Rally styling.
