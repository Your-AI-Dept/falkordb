# Backend API

This page used to hold the frontend's earlier REST proposal (`/v1/events/:eventId/...`). That proposal is retired.

The API the app uses is the backend's:

- **Schema:** [`backend/openapi.json`](../../backend/openapi.json), or `GET /openapi.json` and `/docs` on a running backend.
- **Field-by-field mapping to this app:** [`docs/api-alignment.md`](../../docs/api-alignment.md).
- **Where the mapping lives in code:** `src/backend-adapter.js` (payload → UI shape) and `src/graph-api.js` / `src/live.js` (routes). Fixture mode builds the same backend payloads in `src/demo-graph.js` and `src/demo-promotions.js` and maps them through the same adapter.
