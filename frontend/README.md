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

## Guided attendee and exhibitor flows

The app assigns a plan; attendees do not browse people, swipe, request meetings, or RSVP to booth invitations. The home screen leads with one next stop and shows the rest of the day underneath. Top people remains a graph-demo output accessible from the footer and completed survey, not the attendee's matchmaking interface.

1. Complete the two-step profile and goals setup; choose **Show my day**.
2. Open the next stop. It gives a person or booth, time, place, and topic. **I’m here** records arrival. **Can’t make it** records unavailability without an opinion about the person.
3. **Finish meetup** opens required questions in the same modal. Answers save on tap. Close, Escape, backdrop, reload, and starting another stop cannot bypass outstanding feedback in the local app.
4. The completed modal offers **Back to my day**, the separate visualization, and Top people. The next scheduled stop becomes the primary card.
5. At the booth, **I’m here** updates the exhibitor's guest status without an RSVP. **Finish visit** opens required one-tap usefulness feedback. Check-in alone never asks whether the conversation was useful.
6. Chance encounters still use QR/manual/sample saving. Saved profiles are read-only; there is no meeting-request button.

The scripted plan starts with Theo at 12:15. A tomato-sourcing focus adds Terra Rossa at Booth 412 at 1:00. A later peer assignment follows a fixture topic branch. Once an assignment has started, it remains stable even if later feedback changes the priority. The later assigned peers now have their own working surveys; answers stay scoped to the correct meeting and direction.

The exhibitor has one booth contact and a preset Wednesday 1–2 PM activation. Its agenda shows scheduled, unavailable, and checked-in visitors. It contains no attendee picker, invitations, coverage confirmations, or private usefulness answers.

**Integration status:** scheduling and assignment actions are local fixtures. All existing REST paths remain unchanged. The new `api.assignment` seam deliberately rejects live-mode actions until the teammate supplies scheduling endpoints; it never writes fixture state as a fallback. The attendee view expects normalized `Dashboard.agenda` entries (see `AgendaStop` in `src/contracts.d.ts`); without them, live mode shows that the schedule is unavailable. The backend owns actual matching, time/capacity constraints, counterpart coordination, and updates after feedback. Legacy request/invitation adapter methods and tests remain for compatibility but are not exposed in the attendee UX.

## Integration

[Team integration handoff](docs/INTEGRATION.md) · [Earlier REST proposal](docs/API.md) · [UI types](src/contracts.d.ts) · [Hackathon priorities and demo proof](docs/HACKATHON.md)

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to the backend API origin. The attendee adapter in `src/api.js` switches to REST and never silently falls back to demo data. `VITE_EVENT_ID` defaults to `pizza-expo`. These are public build variables; API credentials belong on the server.

Set `VITE_VISUALIZATION_URL` independently of the API setting, then restart the dev server (or rebuild for deployment). The link opens only the supplied URL; no attendee IDs, feedback, or tokens are appended. This handoff does not run a simulation or connect the visualization to the database.

Start the teammate handoff with [sample JSON](docs/api-examples.json). The four survey/ranking routes live in `src/graph-api.js`, response validation in `src/graph-contract.js`, and transport in `src/rest.js`. The survey and rankings pages can integrate independently of the larger dashboard. No ranking algorithm or database is implemented here.

Fixtures: `src/data/pizza-expo.js`. Local behavior: `src/demo.js` and `src/demo-graph.js`. Frontend: `src/main.jsx`, `src/components/`, and `src/styles.css`. Saved state keys: `rally-pizza-attendee-v2` and `rally.pizza-exhibitor.v2`.

## Current limits

Assignments and next-topic branching use fictional fixtures, not a live graph. No real invitation or notification is sent. Authentication, profile enrichment, physical-device camera testing, live scheduling, server enforcement, and Bright Data integration remain teammate work. The visualization URL is still pending. Graph rankings remain fixed in local mode; local revision increments do not demonstrate improved expertise estimates.

The current survey measures usefulness and next-topic interest. Do not claim these answers implement the backend's topic-learning model until that payload is connected. Server-side feedback enforcement and coordinated schedules must be implemented in the backend.

Earlier strategy, request/invitation flows, and sketches in `docs/PRODUCT.md`, `docs/FLOW.md`, and `docs/LOOP-SKETCHES.md` are historical exploration. This README and `docs/INTEGRATION.md` describe the current guided UX. UI copy stays limited to labels, actions, match reasons, and operational states; see `AGENTS.md`.
