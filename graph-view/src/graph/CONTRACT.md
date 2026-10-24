# Graph view contract

The backend serves everything below today: `GET /graph/snapshot` once at load (and after a reconnect), then the six events on `GET /events`. Both are built by `backend/app/services/graph_events.py`, and the demo feed (`public/demo/feed.json.gz`) is recorded from the same backend by `scripts/make_demo_feed.py`, so live and demo mode go through the same `store.apply` path with identical payloads. Backend tests in `backend/tests/test_events.py` pin these shapes.

Types are in `types.ts`. Names follow the shared vocabulary in `design_doc.md` §0.1:

- Topics are string ids (`dough-flour`); vectors (`comp`, `comp_unc`, `interest`, `m`, `profile`) are lists indexed by topic `idx`, in the order of `data/program/topics.json`.
- `session` is 0–14, `date_no` is 0–3 (shown 1-based), `tick = 4 · session + date_no`.
- Evidence from a check-in belongs to the tick of the open date, or the next date after the last close if none is open; it shows up in that tick's `date_closed.edges`.

Live mode is the default (`VITE_GRAPH_SOURCE` unset or `api`) and reads the backend through the `/api` proxy (`BACKEND_PROXY_TARGET`, default `http://127.0.0.1:8001`). Set `VITE_GRAPH_SOURCE=demo` to replay the recorded show.

## `GET /graph/snapshot`

```json
{
  "topics": [{"idx": 2, "id": "dough-flour", "name": "Dough & Flour"}],
  "attendees": [{
    "id": "PE27-00042", "name": "Ana Ruiz", "company": "Grande Cheese Company", "title": "Corporate Chef",
    "is_speaker": false, "sessions": [0, 4, 11], "tribe": 3, "like": 0.62,
    "comp": [10 floats], "comp_unc": [10 floats], "interest": [10 floats], "m": [10 ints]
  }],
  "edges": [{"topic_id": "dough-flour", "source": "PE27-00042", "target": "PE27-00107", "tick": 9}],
  "talks": [{"id": "S-101", "title": "...", "type": "Keynote", "topics": [{"idx": 7, "w": 0.5}]}],
  "vendors": [{"id": "EX-024", "name": "Toast", "profile": [10 floats]}],
  "metrics": [{"tick": 9, "session": 2, "date_no": 1, "uncertainty": 0.71, "coverage": 0.18, "stability": 0.93, "meet_again_rate": 0.52, "act_yes_rate": 0.31}],
  "meetings": [{"kind": "date", "tick": 9, "a": "PE27-00042", "b": "PE27-00107", "act_a": "yes", "act_b": "maybe"}],
  "session": {"session": 3, "date_no": 0, "attendees": ["PE27-00042"], "dates": [[{"a": "PE27-00042", "b": "PE27-00107", "value": 0.41}]]},
  "tick": 11,
  "last_question": {"rater_id": "PE27-00042", "partner_id": "PE27-00107", "question_id": "t0a", "topic_id": "dough-flour", "text": "...", "why": {"score": 0.21, "ig": 0.34, "plausibility": 0.62}}
}
```

- `edges`: every `LEARNED_FROM_T{k}` edge; `source` is the learner, `target` the expert.
- `metrics`: per-date history. Every numeric field except `tick`, `session` and `date_no` is drawn as its own line.
- `meetings`: speed dates from opened dates (`kind: "date"`) and check-ins (`kind: "checkin"`), with each side's `act`.
- `session`: the open session and its 4-date plan (`value` is the pair weight), or null. `date_no` is the open date, or null between dates.
- `tick`: the latest closed tick, -1 before the first close.

## `GET /events`

`session_opened`, from `POST /sessions/{s}/open`:

```json
{"session": 3, "attendees": ["PE27-00042", "..."], "dates": [[{"a": "PE27-00042", "b": "PE27-00107", "value": 0.41}], [], [], []]}
```

`date_opened`: `{"session": 3, "date_no": 0, "tick": 12}`

`answer_recorded`, once per survey submission (a single answer when saved on tap, or a batch), from people or the simulator:

```json
{
  "source": "date", "session": 3, "date_no": 0, "tick": 12, "rater_id": "PE27-00042", "partner_id": "PE27-00107", "complete": false,
  "answers": [
    {"question_id": "met", "kind": "met", "value": "yes"},
    {"question_id": "t0a", "kind": "claim", "topic_id": "dough-flour", "claim": "partner_taught", "value": "true",
     "text": "Sam showed me a cold-ferment trick I'd try in my shop.", "why": {"score": 0.21, "ig": 0.34, "plausibility": 0.62}},
    {"question_id": "act", "kind": "act", "value": "yes"},
    {"question_id": "meet_again", "kind": "meet_again", "value": "no"}
  ]
}
```

Claim values are `true`, `false` or `skip` (didn't come up); `met: "no"` means they didn't meet. Check-in answers use `"source": "checkin"` with no `session` or `date_no`.

`date_closed`, after the pipeline in design doc section 5:

```json
{
  "session": 3, "date_no": 0, "tick": 12,
  "metrics": {"tick": 12, "session": 3, "date_no": 0, "uncertainty": 0.70, "coverage": 0.19, "stability": 0.94, "meet_again_rate": 0.55, "act_yes_rate": 0.33},
  "nodes": [{"id": "PE27-00042", "comp": [10 floats], "like": 0.64, "tribe": 3}],
  "edges": [{"topic_id": "dough-flour", "source": "PE27-00042", "target": "PE27-00107", "tick": 12}]
}
```

`nodes` lists only attendees whose values changed since the last close (or snapshot), with only the changed fields among `comp`, `comp_unc`, `interest`, `m`, `like`, `tribe`. `edges` are this tick's learned-from edges, including check-ins since the last close. Tribe ids can change between closes; the page keeps colors on the same groups of people.

`session_closed`: `{"session": 3}`

`checkin_recorded`, from `POST /checkins` or the synthetic encounters at each close: `{"scanner_id": "PE27-00042", "scanned_id": "PE27-00311", "tick": 13, "count": 1}`

## HQ buttons (live mode)

| Button | Route |
| --- | --- |
| Open session N | `POST /sessions/{s}/open` (s = sessions closed so far) |
| Simulate date | `POST /admin/simulate/sessions/{s}/dates/{d}` |
| Close date | `POST /sessions/{s}/dates/{d}/close` |
| Auto-run | Loops the three until session 15 closes: open, then for each date simulate, pause 2.5 s, close |

Seed, reset and fast-forward stay on the command line (`POST /admin/seed`, `POST /admin/fast_forward?to_session=N`).

## What the page does with them

- **Event HQ:** all attendees seated and colored by the topic they came for. A date shows as a dashed line from its first answer until it closes, then stays: warm if both would act on each other's advice, gray if not. Check-ins are teal dotted lines. Earlier sessions keep only their warm lines, faint, and people outside the running session fade back.
- **Topic view:** one `LEARNED_FROM_T{k}` layer. Size is `comp`, the ring is `comp_unc`, color is tribe. Arrows from the latest close are orange, older ones gray, and the open date's pairs are dashed. Only people with evidence on the topic show, unless "Everyone" is on. `?attendee=PE27-…` focuses one person.
- **Overview:** talks, vendors and topics in fixed columns, with the top 5 people per topic by `comp`.
