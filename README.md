# Conference Knowledge Graph (Rally × FalkorDB)

A live graph of who knows what at Pizza Expo 2027, built from structured speed dating and QR check-ins. It powers three things: 4-date speed-dating plans that maximize learning and enjoyment, short Claude-phrased surveys after every meeting, and micro-influencers that sponsors can hand event tickets to.

One backend, one dataset, one event stream, used by two apps:

| Service | Port | What it is |
| --- | --- | --- |
| `falkordb` | 6379 (Browser on 3000) | FalkorDB 6.0.3: the graph and every graph algorithm (PageRank, maxFlow, label propagation, betweenness, harmonic centrality) |
| `backend` | 8001 → 8000 | FastAPI: REST + server-sent events (`GET /events`). [OpenAPI schema](backend/openapi.json) |
| `frontend` | 5173 | Rally: the attendee and exhibitor app (speed-dating itinerary, post-meeting surveys, topic experts, exhibitor audiences) |
| `graph-view` | 5174 | Event HQ, topic and overview graphs, live from the backend's events (or a show recorded from the real backend) |

Both apps reach the backend through a same-origin `/api` proxy. Override the published backend port with `BACKEND_PORT`.

## Run everything

```sh
docker compose up -d --build
curl -X POST localhost:8001/admin/seed                              # 1,000 attendees, ~1s; resets the event
curl -X POST "localhost:8001/admin/fast_forward?to_session=3"      # optional: simulate 3 sessions (~7s each)
```

- Rally attendee: http://localhost:5173/?view=attendee · exhibitor: `/?view=exhibitor` · topic experts: `/?view=rankings`
- Graph view: http://localhost:5174 (live; its HQ buttons open sessions and simulate/close dates)
- API docs: http://localhost:8001/docs · FalkorDB Browser: http://localhost:3000

For the live two-person demo, mark the human raters so the simulator skips them and Claude phrases their questions: `curl -X PUT localhost:8001/admin/humans -H 'content-type: application/json' -d '{"ids": ["PE27-00001", "PE27-00002"]}'`. Claude needs `ANTHROPIC_API_KEY` in `backend/.env` (or the environment); without it every question uses template text.

## Develop and test

```sh
cd backend && ../.venv/bin/python -m pytest -q                      # needs FalkorDB on localhost:6379; reseeds the graph
cd frontend && npm test && npm run build && npm run lint
cd graph-view && npm run build && npm run lint
.venv/bin/python scripts/probe_falkordb.py                          # checks every FalkorDB call the design relies on
.venv/bin/python scripts/make_demo_feed.py                          # re-record graph-view's demo show from the real backend
```

## Docs

- [Design doc](design_doc.md): the model, the math, the API and the **shared vocabulary** (section 0.1) all three apps use
- [Backend ↔ Rally mapping](docs/api-alignment.md): routes and fields for the frontend adapter
- [Graph view contract](graph-view/src/graph/CONTRACT.md): the snapshot and event payloads
- [Frontend integration](frontend/docs/INTEGRATION.md) · [Demo walkthrough](frontend/docs/DEMO-WALKTHROUGH.md) · [Dataset provenance](data/README.md)
- Archived (development history, not current docs): [`docs/archived/`](docs/archived/) (build plan, sync handoff), [`frontend/docs/archived/`](frontend/docs/archived/) (early product sketches), [`data/archived/`](data/archived/) (first-design seed files)
