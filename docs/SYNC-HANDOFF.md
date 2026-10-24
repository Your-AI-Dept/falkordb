# Synchronization handoff — 24 October

## Quick handoff

Branch: **`codex/live-backend-alignment`** · [Draft PR #9](https://github.com/Your-AI-Dept/falkordb/pull/9). Not merged at handoff.

- **Keep the original UI and flows.** Preserve attendee/exhibitor onboarding and the guided event journey. They remain the default. `VITE_DATA_MODE=live` enables an integration preview, not a replacement design. Reuse its adapters inside the original components.
- **Connected:** backend adapters for attendee IDs, session matches, surveys/answers, topic rankings, and exhibitor audiences. Added a graph snapshot endpoint and attendee-specific visualization links. Live answer persistence/retries verified; 43 frontend tests and both builds pass.
- **Left:** wire the adapters into the original flows; synchronize profiles/goals and booth invitations/responses; finish and test graph event synchronization. Full live exhibitor and graph-canvas flows remain unverified.
- **Local ports:** app 5173, graph 5174, backend 8001. Booth invitations are still browser-local; the default original demo still uses fixtures.

Based on main including graph-view PR #8.

## Preserve the approved UX

**The default frontend remains the approved local attendee/exhibitor demo.** A separate live integration preview was built during API wiring. It is intentionally opt-in with `VITE_DATA_MODE=live` in `frontend/.env.local`. Do not replace the approved onboarding and guided journey with that preview. Next owner should reuse the adapter inside those original components.

The live preview uses real backend identities and four planned matches but does not reproduce onboarding, local arrival/finish steps, or saved-connections UI. Profile reads work; edits/goals have no backend endpoint. The exhibitor setup UI remains, with catalog vendor selection and live expert/influencer audience when live mode is enabled. Contact/product/offer and invitation responses are browser-local, not synchronized to FalkorDB. Old local campaigns should not be reused as live campaigns.

## Implemented

- `backend-adapter.js` + `graph-api.js`: actual QuestionSet, TopicRanking and topic schemas; PE27 IDs, zero-based session/date routes; snake_case answer payload; FastAPI detail errors. No obsolete event prefix.
- Saved-answer revisions and server completion supported. A survey is fixed when its date opens; graph updates happen when the organizer closes a date. Do not pitch per-answer question regeneration or end-of-hour-only graph updates.
- Live ranking order/evidence retained. Influencer `marginal_reach` is labeled expected additional attendees, never a count of actual connections. `m` is distinct comparison partners, not total endorsements.
- New additive read-only `/graph/snapshot` endpoint assembles the graph-view contract from existing graph/state. No existing routes changed.
- Graph viewer defaults to API mode through same-origin proxy. Thin SSE events trigger snapshot refresh rather than being misread as recorded-feed events.
- `http://127.0.0.1:5174/?attendee=PE27-00262` focuses topic view on that person and direct learned-from / planned-session neighbors. Current topic starts at index 0; add topic-ID deep linking if needed. `VisualizationHandoff` adds attendee ID only for real PE27 identities.

## Remaining synchronization work

1. Move live identity/session/survey data into the approved onboarding and guided attendee flow. Establish identity selection/auth for deployment; current preview dropdown is not authentication.
2. Implement or agree persistence for onboarding/goals and booth invitation/acceptance/visit feedback. These currently stay local. Existing legacy API methods in api.js are dormant and not mapped; do not call them as supported endpoints.
3. Complete graph snapshot/event parity: snapshot currently includes date meetings but not historical ADHOC meetings, pending answer counts, or last-question detail. SSE snapshot reload refreshes current graphs but does not preserve the recorded feed's fine-grained answer animation/activity. Full simulation/close/reconnect cycle was not browser-verified.
4. Topic-focused graph shows learned-from edges and current meetings, not LinkedIn or positive-tie layers. Empty learned edges before the first date closes are expected. Avoid calling an initial prior an observed endorsement.
5. Check settings before demo: `frontend` defaults to original demo; graph-view defaults to live. Do not present the original Paul/Maya fixtures as the same graph dataset. Use live preview for integration tests only until original UI is wired.

## Local runtime

OrbStack hosts project containers. Port 8000 belongs to another local Python process, left untouched. Compose publishes backend at **8001** (override with BACKEND_PORT), container internal port remains 8000. Both Vite proxies target 8001 locally. Frontend 5173; graph viewer 5174.

Started a new empty persistent project volume, seeded repo data, opened session 0. Dataset: 1,000 synthetic attendees, 10 topics, 73 vendors, 47 talks, 4,729 LinkedIn edges. See data/README.md for mixed real-company/synthetic-person provenance. No prior graph was reset. A live API smoke test saved the attendance answer for the second pair in date 0; repeated save was idempotent and the opposite rater unchanged. No date was closed or simulated.

## Verification

- 43 frontend tests pass; frontend production build passes.
- Graph-view build and lint pass. Frontend lint has non-fatal React warnings.
- Live backend health + frontend proxy healthy.
- Live answer save/retry, respondent isolation, 5 expert results and 10 union audience results verified through adapter.
- Snapshot returned 1,000 attendees, 10 topics, 100 active date meetings, zero learned edges at initial tick.
- Browser verified live four-match lineup. Full exhibitor live invitation flow and graph canvas event loop remain to be checked by next owner.

Run: `docker compose up -d --build falkordb backend`, then `npm run dev` in frontend and graph-view separately. Seed only an empty graph; /admin/seed resets an existing event.
