# Synchronization status — 24 October (after harmonization)

PR #9 (`codex/live-backend-alignment`) is merged into main together with a harmonization pass across all three apps. This replaces the earlier handoff of the same name.

## One language, one dataset, one event stream

- **Vocabulary:** defined once in `design_doc.md` §0.1 (attendee, topic, session, date / `date_no`, tick, meeting, survey, claim, act / meet again, competence, topic expert, micro-influencer, tribe, vendor). Backend field names are canonical; UIs show dates 1-based.
- **Dataset:** every app uses the 1,000 Pizza Expo attendees (PE27 ids) and the 10 topic ids from `data/program/topics.json`. Rally's fixture personas are now real attendees (persona → PE27 map in `frontend/src/data/pizza-expo.js`; `?participant=theo` still works).
- **Events:** the backend publishes the graph view's full contract on `GET /events` (`session_opened` with the plan, `answer_recorded` with each answer's question, `date_closed` with changed attendees and new edges, …) and `GET /graph/snapshot` uses the same builder (`backend/app/services/graph_events.py`). The graph view applies live events directly, the same path as demo mode.
- **One implementation:** the graph view's demo feed is recorded from the real backend (`scripts/make_demo_feed.py`), replacing the separate Python approximation.
- **Ports:** backend 8001 (override `BACKEND_PORT`), Rally 5173, graph view 5174; `docker compose up -d --build` runs all four services, and both apps proxy `/api` to the backend.

## Rally live mode (`VITE_DATA_MODE=live`) inside the original flows

Attendee picker (stands in for auth) → onboarding prefilled from `/attendees/{id}` → "My day" with the 4 planned dates → backend survey (met, claims with "Didn't come up", act, meet again) → QR check-in via `POST /checkins` with its 2–3 questions → topic experts. Exhibitor audiences come from `/topics|vendors/{id}/experts|influencers`. Default mode is fixtures, in the same shapes and with the same people.

## Still browser-local (backend endpoints needed)

| Feature | Endpoint it would need |
| --- | --- |
| Profile / goal edits | `PUT /attendees/{id}/profile` |
| Saved connections list | `GET /attendees/{id}/checkins` |
| Booth invitations, RSVP, booth check-in and feedback | invitation / campaign routes |
| Avoid-topic preference | preference route (feeds pairing) |
| Date arrival / finish progress | UI lifecycle only |

## Verification at merge

Backend 122 tests (including `test_events.py`, which pins the event payloads); Rally 52 tests, build and lint (warnings only); graph view build and lint. Live check: one open → simulate → close streamed 504 events through the graph view's `/api` proxy.
