# Graph view

Event HQ, topic and overview graphs for the Pizza Expo demo, drawn with [FalkorDB Canvas](https://github.com/FalkorDB/falkordb-canvas). It runs beside the Rally app in `../frontend` and follows the backend's event stream.

```sh
npm install
npm run dev
```

Open http://localhost:5174. By default it replays a recorded show from `public/demo/feed.json.gz` (15 speed-dating sessions over 1,000 attendees) with play, pause, speed and restart.

To run on the backend, create `.env.local` with `VITE_GRAPH_SOURCE=api`, plus `VITE_API_URL` if the backend isn't on `http://localhost:8000`. The HQ header then shows buttons that open sessions and simulate and close dates. [CONTRACT.md](src/graph/CONTRACT.md) lists the endpoint and event payloads the backend needs to serve.

Rebuild the demo feed from `../data` with `python3 ../scripts/make_demo_feed.py`. It approximates the design doc's math in plain Python; it is not the backend.

Checks: `npm run lint` and `npm run build`.
