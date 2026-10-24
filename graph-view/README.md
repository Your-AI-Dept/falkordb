# Graph view

Event HQ, topic and overview graphs for the Pizza Expo demo, drawn with [FalkorDB Canvas](https://github.com/FalkorDB/falkordb-canvas). It runs beside the Rally app in `../frontend` and follows the backend's event stream.

```sh
npm install
npm run dev        # http://localhost:5174
```

**Live (default):** loads `GET /graph/snapshot`, then applies the backend's `GET /events` through the `/api` proxy (`BACKEND_PROXY_TARGET`, default `http://127.0.0.1:8001`; in docker compose it points at the backend container). The HQ header has buttons that open sessions and simulate and close dates.

**Demo:** set `VITE_GRAPH_SOURCE=demo` in `.env.local` to replay `public/demo/feed.json.gz` with play, pause, speed and restart: 15 speed-dating sessions over 1,000 attendees, recorded from the real backend. Re-record it with `../.venv/bin/python ../scripts/make_demo_feed.py` (needs FalkorDB on localhost:6379; it reseeds the graph).

[CONTRACT.md](src/graph/CONTRACT.md) lists the snapshot and event payloads. Checks: `npm run lint` and `npm run build`.
