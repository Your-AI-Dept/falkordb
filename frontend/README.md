# Rally · Pizza Expo demo

React attendee and exhibitor frontend for the conference graph demo. It speaks the backend's vocabulary: the 10 canonical topics, real dataset attendees (PE27 ids), 4-date speed sessions, and the backend's survey and audience shapes. See [docs/INTEGRATION.md](docs/INTEGRATION.md).

```sh
npm install
npm run dev
```

Open [attendee](http://localhost:5173/) or [exhibitor](http://localhost:5173/?view=exhibitor). Fixture mode (default) runs offline; set `VITE_DATA_MODE=live` in `.env.local` to use the backend (see `.env.example`). `npm test` covers signal and response invariants; `npm run build` creates the production bundle.

## Submission demo

1. Open [Drita’s survey](http://localhost:5173/?view=survey&participant=paul) and [Sunil’s survey](http://localhost:5173/?view=survey&participant=theo): both sides of the same date (one meeting id, `s0-d0-PE27-00009-PE27-00952`).
2. Each answers the backend survey on their own: “Did you meet?”, true/false topic statements with **Didn’t come up**, then “Would you act on their recommendation?” and “Meet again?”. Every answer saves on tap; the two directions stay separate.
3. After the survey completes, **Open visualization** opens the graph view (`VITE_VISUALIZATION_URL`, default `http://127.0.0.1:5174/`), focused on that attendee.
4. **Continue to topic experts**: pick a topic and Top 3, 5, 10 or 20. Live mode shows `GET /topics/{id}/experts` in server order with reasons.

In fixture mode the surveys and rankings are sample payloads in the backend's shape; real graph-selected questions and changing rankings come from live mode.

## Guided attendee and exhibitor flows

The app assigns a plan; attendees do not browse people, swipe, request meetings, or RSVP to booth invitations. The home screen leads with one next stop and shows the rest of the day underneath. Topic experts remains a graph-demo output accessible from the footer and completed survey, not the attendee's matchmaking interface.

1. Complete the two-step profile and goals setup; choose **Show my day**.
2. Open the next stop. It gives a person or booth, time, place, and topic. **I’m here** records arrival. **Can’t make it** records unavailability without an opinion about the person.
3. **Finish meetup** opens required questions in the same modal. Answers save on tap. Close, Escape, backdrop, reload, and starting another stop cannot bypass outstanding feedback in the local app.
4. The completed modal offers **Back to my day**, the separate visualization, and topic experts. The next scheduled stop becomes the primary card.
5. At the booth, **I’m here** updates the exhibitor's guest status without an RSVP. **Finish visit** opens required one-tap usefulness feedback. Check-in alone never asks whether the conversation was useful.
6. Chance encounters use QR/manual/sample saving with attendee ids as badges. In live mode a scan calls `POST /checkins` and offers the 2–3 check-in questions.

The scripted plan is session 0: Sunil Desai, Simran Mehta, Francesca Napolitano and William Clark, one per date. A tomato focus plus a saved connection with Simran surfaces a Mutti booth invitation (booth 1128). Once an assignment has started, it remains stable even if later feedback changes the priority. The later assigned peers now have their own working surveys; answers stay scoped to the correct meeting and direction.

The exhibitor has one booth contact and a preset Wednesday 1–2 PM activation. Its agenda shows scheduled, unavailable, and checked-in visitors. It contains no attendee picker, invitations, coverage confirmations, or private usefulness answers.

**Integration status:** live mode builds `Dashboard.agenda` from the backend's session plan (`src/live.js`); see [docs/INTEGRATION.md](docs/INTEGRATION.md) for what is live and what stays local.

## Integration

[Team integration handoff](docs/INTEGRATION.md) · [Backend API](../backend/openapi.json) · [API mapping](../docs/api-alignment.md) · [UI types](src/contracts.d.ts) · [Hackathon priorities and demo proof](docs/HACKATHON.md)

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to the backend API origin. The attendee adapter in `src/api.js` switches to REST and never silently falls back to demo data. `VITE_EVENT_ID` defaults to `pizza-expo`. These are public build variables; API credentials belong on the server.

Set `VITE_VISUALIZATION_URL` independently of the API setting, then restart the dev server (or rebuild for deployment). The link opens only the supplied URL; no attendee IDs, feedback, or tokens are appended. This handoff does not run a simulation or connect the visualization to the database.

Start the teammate handoff with [sample JSON](docs/api-examples.json). The four survey/ranking routes live in `src/graph-api.js`, response validation in `src/graph-contract.js`, and transport in `src/rest.js`. The survey and rankings pages can integrate independently of the larger dashboard. No ranking algorithm or database is implemented here.

Fixtures: `src/data/pizza-expo.js`. Local behavior: `src/demo.js` and `src/demo-graph.js`. Frontend: `src/main.jsx`, `src/components/`, and `src/styles.css`. Saved state keys: `rally-pizza-attendee-v2` and `rally.pizza-exhibitor.v2`.

## Current limits

Assignments and next-topic branching use fictional fixtures, not a live graph. No real invitation or notification is sent. Authentication, profile enrichment, physical-device camera testing, live scheduling, server enforcement, and Bright Data integration remain teammate work. The visualization URL is still pending. Graph rankings remain fixed in local mode; local revision increments do not demonstrate improved expertise estimates.

The current survey measures usefulness and next-topic interest. Do not claim these answers implement the backend's topic-learning model until that payload is connected. Server-side feedback enforcement and coordinated schedules must be implemented in the backend.

Earlier strategy, request/invitation flows, sketches and screenshots are archived in `docs/archived/` as historical exploration. This README and `docs/INTEGRATION.md` describe the current guided UX. UI copy stays limited to labels, actions, match reasons, and operational states; see `AGENTS.md`.
