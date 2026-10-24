# Graph view contract

The graph view needs one new endpoint and payloads for the six events that `backend/app/events.py` already names. Once the backend serves them, set `VITE_GRAPH_SOURCE=api` in `graph-view/.env.local` and the page goes live. `VITE_API_URL` defaults to `http://localhost:8000`. The page runs on port 5174, so add `http://localhost:5174` to `cors_origins` in `backend/app/config.py`.

Until then the page replays `public/demo/feed.json.gz`: all 15 sessions recorded in exactly these shapes. Rebuild it with `python3 scripts/make_demo_feed.py`.

## Status against the backend on main (8c3d183)

Demo mode and the HQ buttons work today. Live mode was written against the payloads below, and the backend's events are thinner for now:

| Event | Sends now | The page also needs | Already available from |
| --- | --- | --- | --- |
| `session_opened` | `session`, `meetings` | `attendees` and the 4-date plan | `GET /sessions/{s}` |
| `date_opened` | `session`, `date_no`, `tick` | the field named `date` | rename, or the page reads `date_no` |
| `answer_recorded` | `session`, `date_no`, `rater_id`, `complete` | `partner_id` and the `answers` | `GET /sessions/{s}/dates/{d}/meetings/{rater_id}/questions` |
| `date_closed` | `session`, `date_no`, `tick`, `metrics`, `new_edges` (a count) | changed `nodes` and the new `edges` | `GET /graph/topics/{topic_id}` |
| `checkin_recorded` | `scanner_id`, `scanned_id`, `count` | `tick` | the current tick |

There are two ways to close the gap: add those fields to the `bus.publish` calls (the smallest change), or have the page fetch them from the routes in the last column (an adapter in `src/graph/sources.ts`, not built yet). `GET /graph/snapshot` doesn't exist yet; the same routes can assemble it. `cors_origins` only allows port 5173, so add `http://localhost:5174`.

Types are in `src/graph/types.ts`. Payloads name topics by string id (`dough-flour`); vectors (`comp`, `comp_unc`, `interest`, `m`, `profile`) are lists indexed by topic `idx`, in the order of `data/program/topics.json`. `tick` is `4 · session + date`, as on the edges (design doc 2.3).

## `GET /graph/snapshot` (new)

Everything the three tabs need at load, and again after a reconnect.

```json
{
  "topics": [{"idx": 2, "id": "dough-flour", "name": "Dough & Flour"}],
  "attendees": [{
    "id": "PE27-00042", "name": "Ana Ruiz", "company": "Grande Cheese Company", "title": "Corporate Chef",
    "is_speaker": false, "tribe": 3, "like": 0.62, "sessions": [0, 4, 11],
    "comp": [10 floats], "comp_unc": [10 floats], "interest": [10 floats], "m": [10 ints]
  }],
  "edges": [{"topic_id": "dough-flour", "source": "PE27-00042", "target": "PE27-00107", "tick": 9}],
  "talks": [{"id": "S-101", "title": "...", "type": "Keynote", "topics": [{"idx": 7, "w": 0.5}]}],
  "vendors": [{"id": "EX-024", "name": "Toast", "profile": [10 floats]}],
  "metrics": [{"tick": 9, "session": 2, "date": 1, "uncertainty": 0.71, "coverage": 0.18, "stability": 0.93, "meet_again_rate": 0.52, "act_rate": 0.31}],
  "meetings": [{"kind": "date", "tick": 9, "a": "PE27-00042", "b": "PE27-00107", "act_a": "yes", "act_b": "maybe"}],
  "session": {"session": 3, "date": 0, "attendees": ["PE27-00042"], "dates": [[{"a": "PE27-00042", "b": "PE27-00107", "value": 0.41}]]},
  "tick": 11
}
```

- `attendees`: the `Attendee` nodes with their cached vectors. `tribe` is -1 until someone has a `POS_TIE`. `m`, `like` and `sessions` are optional.
- `edges`: every `LEARNED_FROM_T{k}` edge. `source` is the learner, `target` the expert.
- `metrics`: the per-date history from `GET /metrics`. Every numeric field except `tick`, `session` and `date` is drawn as its own line, so new metrics need no frontend change.
- `meetings` (optional): past `SPEED_DATE` pairs (`kind: "date"`) and `ADHOC` pairs (`kind: "checkin"`), with each side's `act`. Without it the HQ room starts empty after a reload.
- `session`: the open session and its 4-date plan, or null. `date` is the open date, or null between dates.
- `tick`: the latest closed tick, -1 before the first close.

## `GET /events` (server-sent events)

`session_opened`, from `POST /sessions/{s}/open`, with the whole plan:

```json
{"session": 3, "attendees": ["PE27-00042", "..."], "dates": [[{"a": "PE27-00042", "b": "PE27-00107", "value": 0.41}], [], [], []]}
```

`date_opened`: `{"session": 3, "date": 0, "tick": 12}`

`answer_recorded`, one per submission to `.../meetings/{rater_id}/answers` (all of a rater's answers at once, or a few at a time). Each answer carries what its question asked, so the page never needs the question set:

```json
{
  "source": "date", "session": 3, "date": 0, "tick": 12, "rater_id": "PE27-00042", "partner_id": "PE27-00107",
  "answers": [
    {"question_id": "q1", "kind": "claim", "topic_id": "dough-flour", "claim": "partner_taught", "value": "true",
     "text": "Sam showed me a cold-ferment trick I'd try in my shop.", "why": {"score": 0.21, "ig": 0.34, "plausibility": 0.62}},
    {"question_id": "act", "kind": "act", "value": "yes"},
    {"question_id": "meet_again", "kind": "meet_again", "value": "no"}
  ]
}
```

Claim values are `true`, `false` or `skip` (didn't come up). `text` and `why` are optional; the latest answer that has them fills the "Why this question" panel. Check-in answers can use the same event with `"source": "checkin"` and no `session` or `date`.

`date_closed`, after the pipeline in design doc section 5:

```json
{
  "session": 3, "date": 0, "tick": 12,
  "metrics": {"tick": 12, "session": 3, "date": 0, "uncertainty": 0.70, "coverage": 0.19, "stability": 0.94, "meet_again_rate": 0.55, "act_rate": 0.33},
  "nodes": [{"id": "PE27-00042", "comp": [10 floats], "comp_unc": [10 floats], "interest": [10 floats], "m": [10 ints], "like": 0.64, "tribe": 3}],
  "edges": [{"topic_id": "dough-flour", "source": "PE27-00042", "target": "PE27-00107", "tick": 12}]
}
```

`nodes` only needs the attendees that changed, and only the fields that changed. `edges` are the `LEARNED_FROM` edges written at this close. Community ids can change between runs: the page keeps colors on the same groups of people.

`session_closed`: `{"session": 3}`

`checkin_recorded`, from `POST /checkins` or the synthetic encounters: `{"scanner_id": "PE27-00042", "scanned_id": "PE27-00311", "tick": 12}`

## HQ buttons (live mode)

The Event HQ header calls existing routes from design doc section 6, then waits for the events above:

| Button | Route |
| --- | --- |
| Open session N | `POST /sessions/{s}/open` (s = sessions closed so far) |
| Simulate date | `POST /admin/simulate/sessions/{s}/dates/{d}` |
| Close date | `POST /sessions/{s}/dates/{d}/close` |
| Auto-run | Loops the three until session 15 closes: open, then for each date simulate, pause 2.5 s, close |

The calls send no body. Seed, reset and fast-forward stay on the command line.

## What the page does with them

- **Event HQ:** all attendees seated and colored by the topic they came for. A date shows as a dashed line from its first answer until it closes, then stays: warm if both would act on each other's advice (`act` yes from both sides), gray if not. Check-ins are teal dotted lines. Earlier sessions keep only their warm lines, faint, and people outside the running session fade back. The stats strip counts sessions, dates talking now, speed dates, check-ins, answers, new votes and the latest meet-again rate.
- **Topic view:** one `LEARNED_FROM_T{k}` layer. Size is `comp`, the ring is `comp_unc`, color is tribe. Arrows from the latest close are orange, older ones gray, and the open date's pairs are dashed. It redraws when a date opens or closes. Only people with evidence on the topic show, unless "Everyone" is on.
- **Overview:** talks, vendors and topics in fixed columns, with the top 5 people per topic by `comp`.
