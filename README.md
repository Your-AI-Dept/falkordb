# Conference Knowledge Graph

FalkorDB + FastAPI backend with the Rally React frontend for the Pizza Expo demo.

## Start the frontend

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. The frontend runs with local fixtures until the team finalizes and connects the API. Do not point it at the current backend expecting every route to work yet.

```sh
npm test
npm run build
npm run lint
```

Attendee: `/?view=attendee` · Exhibitor: `/?view=exhibitor` · Topic results: `/?view=rankings`

For the backend and FalkorDB, use `docker compose up --build`. The compose frontend remains on port 5173. Backend: 8000; FalkorDB Browser: 3000.

- [Frontend walkthrough and capabilities](frontend/README.md)
- [Integration handoff and remaining gaps](frontend/docs/INTEGRATION.md)
- [Demo walkthrough](frontend/docs/DEMO-WALKTHROUGH.md)
- [Graph design](design_doc.md)
- [Dataset provenance](data/README.md)
- [Graph view](graph-view/README.md): Event HQ, topic and overview graphs on port 5174, with a recorded show until the backend's events are live

The backend, dataset, and frontend are separate areas so team members can work concurrently. Endpoint sketches are changing; update the frontend adapter when the backend responses settle.
