# Frontend integration

The shared app is `frontend/` (React + Vite, port 5173). It speaks the backend's vocabulary in both modes:

- **Fixture mode (default, offline):** the original onboarding and guided attendee/exhibitor journeys on real dataset people and canonical topics. Fixtures build the backend's exact payloads and run them through the same adapter as live mode.
- **Live mode (`VITE_DATA_MODE=live` in `.env.local`):** the same original journeys on the backend's real data, through the `/api` proxy in `vite.config.ts` (target `http://localhost:8001`, or `BACKEND_PROXY_TARGET`).

Backend contract: [`backend/openapi.json`](../../backend/openapi.json) · mapping notes: [`docs/api-alignment.md`](../../docs/api-alignment.md) · design: [`design_doc.md`](../../design_doc.md) §4.1 and §6.

## One vocabulary

| Concept | Everywhere (backend, graph view, this app) |
| --- | --- |
| Topics | The 10 canonical ids from `data/program/topics.json` (`cheese-dairy` … `tech-ordering-delivery`), labeled with their canonical names. Mirrored in `src/data/topics.js`; `tests/dataset.test.js` keeps them identical. |
| People | Dataset attendees with `PE27-xxxxx` ids. Badge tokens are the attendee id (as in `POST /checkins`). |
| Speed session | One session = 4 planned 15-minute dates. Numbered from 0 in data, shown 1-based ("Date 1 of 4"). |
| Meeting id | Dates: `s{session}-d{date}-{a}-{b}`; check-ins: `c{tick}-{a}-{b}` (attendee ids sorted). Both participants' surveys share one id. Fixture meetings use the same format. |
| Survey | `met` (Yes, we met / We didn't meet), then true/false `claim` statements, each with **Didn't come up** (`true`/`false`/`skip`), then `act` (yes/maybe/no) and `meet_again` (yes/no). "We didn't meet" completes the survey and nothing reaches the graph. Answers save on tap; re-sending is idempotent; a changed answer bumps `survey_revision`. |
| Topic experts | `GET /topics/{id}/experts`: ranked by peer-confirmed competence, each with a `reason` and `evidence`. |
| Micro-influencers | `GET /topics/{id}/influencers` (or `/vendors/{id}/influencers`): knowledgeable, well-liked, well-connected attendees to give event tickets to. `marginal_reach` = expected additional attendees, not a count of connections. |
| Booth feedback | Yes / Somewhat / Not really after a booth visit. Local only: the backend has no booth-visit model. |

## Demo people (persona → attendee)

Persona keys still work in demo links (`?participant=theo`); the identity shown is the real attendee.

| Persona | Attendee | Role in the demo |
| --- | --- | --- |
| paul | PE27-00952 Drita Krasniqi, Co-Owner, Pizzeria Lupa | the signed-in attendee |
| theo | PE27-00009 Sunil Desai, Restaurant Consultant, Crust Consulting Group | date 1 |
| maya | PE27-00382 Simran Mehta, Chef & Owner, Stubborn Dough Co. | date 2; saved connection; invitee |
| elena | PE27-00032 Francesca Napolitano, Owner, Barone Pizza Co. | date 3 |
| samir | PE27-00092 William Clark, Territory Mgr, Sysco Corporation | date 4 |
| nia | PE27-00176 Steven Stewart, Owner/Operator, Uptown Wood Fired | ovens expert |
| luca | PE27-00559 Bassam Khoury, Sales Specialist, Mutti (EX-067, booth 1128) | exhibitor contact |

## What live mode covers

| Flow | Backend routes |
| --- | --- |
| Identity (picker standing in for auth) | `GET /attendees`, `GET /attendees/{id}` |
| Onboarding | Prefilled from `GET /attendees/{id}`; edits stay local (no endpoint) |
| My day: the 4 dates | `GET /sessions` + `GET /sessions/{s}` (the attendee's open session, else latest closed, else next) |
| Speed-date survey | `GET/POST /sessions/{s}/dates/{d}/meetings/{rater}/questions\|answers` |
| QR check-in + 2–3 questions | `POST /checkins`, `GET/POST /checkins/{rater}/{partner}/questions\|answers` |
| Topic experts | `GET /topics`, `GET /topics/{id}/experts` |
| Exhibitor audience | `GET /vendors`, `GET /topics/{id}/experts`, `GET /topics/{id}/influencers` |

Date states drive the agenda: a planned date can't be checked into yet, an open date runs check in → finish → survey, and a closed date without answers shows as missed (answers after close no longer reach the graph). "I'm here" / "Finish" are UI lifecycle only, stored per attendee in the browser.

## Still local (no backend endpoint yet)

- Profile and goal edits.
- The saved-connections list (the backend stores the ADHOC tie but has no per-attendee list route).
- Check-in/finish progress for a date.
- Booth invitations, RSVPs, check-ins and booth feedback (the exhibitor promotion flow).
- "Pause this topic" preferences from earlier survey versions (saved ones can still be turned back on).

## Checks

`npm test` (includes `tests/dataset.test.js`, which checks fixtures against `../data`), `npm run build`, `npm run lint` (warnings only).
