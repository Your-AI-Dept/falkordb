# Build Plan

Companion to `design_doc.md`. Section references like (4.2) point there.

Ordered to put the riskiest unknowns first, unblock the frontend early, and always leave a demoable state behind. Time estimates assume about 3.5 hours remain; fill in owners and adjust.

---

## Critical path

```
P0 infra + FalkorDB probe ─► P1 seed ─► P3 pairing ─► P5 date pipeline + simulator ─► P7 influencers ─► P9 rehearsal
          │                    │          P4 questions ─┘          │
          │                    └──► P2 mathcore (parallel, no DB)  └──► P6 check-ins
          └──► F0 API contract ─► F1–F4 frontend (parallel, against mocks, then live)
```

| Phase | What | Est. | Owner | Depends on |
| --- | --- | --- | --- | --- |
| P0 | Infra up, FalkorDB algorithm probe, API contract | 30m | | none |
| P1 | Seed: data → graphs, synthetic fields, priors | 45m | | P0 |
| P2 | `mathcore.py` + unit tests | 45m | | none |
| P3 | Pairing (split + maxFlow + refine) | 40m | | P1, P2 |
| P4 | Questions: target selection + Claude phrasing | 40m | | P1, P2 |
| P5 | Date/session pipeline, simulator, metrics | 50m | | P3, P4 |
| P6 | Check-ins | 20m | | P5 |
| P7 | Micro-influencers | 25m | | P5 |
| F0–F4 | Frontend | ~2.5h | | F0 |
| P8 | Integration, demo state, perf | 20m | | all |
| P9 | Demo rehearsal | 15m | | P8 |

With 2–3 people: one on P1 → P3 → P5, one on P2 → P4 → P6/P7, one on the frontend.

---

## P0: Infrastructure and de-risking (30m) ✅ done

**Status:** Docker via Colima; FalkorDB pinned to `6.0.3`; `docker compose up` brings up all three services. Probe: 13/13 checks pass, including `algo.maxFlow` (one maxFlow run plus CAP rewrite on 100×100 with 5k edges takes ~30ms, so a full 4-date plan is well under a second). API contract: all section 6 routes live with fixtures (`X-Stub: true` header), admin routes return 501, schema exported to `backend/openapi.json`, `openapi-typescript` generates cleanly.

**Goal:** a running stack, proof that every FalkorDB call we rely on behaves as the doc assumes, and an API contract the frontend can build against.

1. **Docker.** Install Docker Desktop or OrbStack (not on this machine yet). `docker compose up -d falkordb`. Pin the image tag in `docker-compose.yml` once verified (currently `latest`).
2. **Health.** Run the backend locally (`uvicorn app.main:app --reload`) against the container. Check: `GET /health` → `{"status": "ok", "falkordb": true}`.
3. **FalkorDB probe** (`scripts/probe_falkordb.py`). Build a 6-node toy graph in a throwaway graph key and run every call from section 10, printing results:
   - `algo.pageRank('Attendee', 'LEARNED_FROM_T0')`: scores sum to 1
   - `algo.labelPropagation`, `algo.betweenness` (with `samplingSize`, `samplingSeed`), `algo.HarmonicCentrality`: accept the map-argument signature
   - `algo.maxFlow` on a 2×2 bipartite toy with Source/Sink and `cap: 1`: returns `edges`, `edgeFlows`, `maxFlow`, and the flows give a valid matching
   - multi-type pattern `[r:LINKEDIN|ADHOC|SPEED_DATE]` returns all three types
   - empty-list properties (`reached: []`) round-trip
   - `MERGE ... ON CREATE SET` on relationships (used by check-ins)

   **This is the highest-risk step.** If `algo.maxFlow` is missing or behaves differently, we learn it now. Fallback: a Python matcher (Hopcroft–Karp) on the same CAP edges, keeping the rest of the design.
4. **API contract.** Write all request/response models in `models.py` and register every route from section 6 as a stub returning fixture data (`app/fixtures/*.json`). FastAPI then serves the full OpenAPI schema at `/openapi.json`. Check: `npx openapi-typescript http://localhost:8000/openapi.json -o frontend/src/api/schema.ts` succeeds.

**Done when:** health is green, the probe prints sane results for every call, and the frontend has generated types.

---

## P1: Seed (45m) ✅ done

**Goal:** `POST /admin/seed` builds both graphs deterministically from `data/`.

File: `services/seed.py`, plus `cypher.py` for query strings.

| Step | Detail | Source |
| --- | --- | --- |
| 1. Topic order | Load `topics.json`; `TOPIC_IDS` list defines `idx`. Expose `topic_idx(id)` and a name → id map (registration uses names). | 2.1 |
| 2. Content graph | `Topic`, `Talk` (from `sessions.json`), `Vendor` (from `exhibitors.json`), `ABOUT`, `TARGETS` (even split), `RELATED` (co-occurrence counts across talks, exhibitors and registration interests; keep top 3 per topic). Indexes. | 2.1, 2.5 |
| 3. Attendees | One `Attendee` per enriched record: registration fields, `is_speaker`/`speaker_topics` from talk speakers, `exhibitor_id` from exhibitor `staff`. | 2.2 |
| 4. Synthetic `years_exp` | Seeded RNG; base distribution skewed by title keywords (owner, founder, VP, chef → higher; intern, associate, coordinator → lower). | 8.1 |
| 5. LinkedIn network | Coworkers (same company), resolved `people_also_viewed`, random fill to 5–10 ties per person (70% same primary topic or business type). Write as two directed edges. | 8.1 |
| 6. Session attendance | Gamma propensities; each of 15 sessions samples ~200 by propensity. Store `sessions` list per attendee. | 8.1 |
| 7. Cold-start interest | `int_a`/`int_b` from registration, sign-ups, booth scans; write `interest`. | 3.1 |
| 8. Competence prior | `comp_prior` from speaker, exhibitor and seniority rules; initialize `comp = comp_prior`, `comp_unc = 1`, `m = 0`, `pr = 0`. | 3.3 |
| 9. Remaining props | `rel_a/b`, `like_a/b`, `like`, `tribe = -1`, `broker = 0`, `reach = 0`, `cum_value = 0`, `sat_out = 0`, `reached = []`. | 2.2 |

Also `POST /admin/reset` (drop the three graph keys) and `GET /topics`, `/talks`, `/vendors`, `/attendees`, `/attendees/{id}` as real queries.

**Checks:**
- Seeding twice gives identical graphs (same RNG seed).
- 1,000 attendees, 10 topics, 47 talks, 73 vendors; mean LinkedIn degree 5–10; session sizes ≈ 200; mean sessions per attendee ≈ 3.
- `GET /attendees/PE27-00001` returns all vectors with length 10.
- FalkorDB Browser (localhost:3000) shows `content` and `people`.
- Seed runs in under 30s (batch writes with `UNWIND`, ~500 rows per query).

---

## P2: `mathcore.py` (45m, parallel, no DB) ✅ done

**Goal:** every formula from section 3 and 4 as a pure function with tests. Can start immediately.

| Function | Spec | Tests |
| --- | --- | --- |
| `beta_mean(a, b)` | 3.1, 3.5, 3.6 | trivial |
| `tie_probs(evidence) → (p_pos, p_neu, p_neg)` | 3.2 | no evidence → zeros; each prior; act slots |
| `reduce_claims(partner_taught, self_taught)` | 3.4 reduction table | every row |
| `combine_answers(u_ans, v_ans) → (directions, reliability)` | 3.4 combination table | **every row**, including SKIP/NEUTRAL variants and single-answer cases |
| `competence(pr, n, m, prior)` → `(comp, unc)` | 3.3 steps 3–5 | average PR → prior when m=0; converges to `c_pr` as m grows |
| `enjoy(int_u, int_v, like_v)` | 3.7 | cosine edge cases (zero vectors) |
| `topic_scores(...)` | 4.1 | known values; diversity rule |
| `pair_value(...)`, `pair_weight(...)` | 4.2 | components add up; `min` symmetry |
| `greedy_match(pairs, deficits)` | 4.2 step 5 | never double-books |
| `sigma(S, p_x)`, `greedy_influencers(cands, p_x, n)` | 4.3 | monotone; overlapping candidates get diminishing gain |

**Done when:** `pytest` is green and covers every table row in 3.4.

---

## P3: Pairing (40m) ✅ done

**Goal:** `POST /sessions/{s}/open` produces a valid 4-date plan.

File: `services/pairing.py`.

1. Load the session's attendees (`s in a.sessions`), their vectors, tribes and tie evidence, plus all prior `SPEED_DATE` pairs. Set `InSession`.
2. Compute `V_u(v)` and `w(u,v)` for all pairs in Python (≈20k pairs, numpy).
3. For each date d = 0..3:
   - random balanced split (odd person out by `sat_out`)
   - feasible pairs, excluding pairs met earlier (including dates 0..d−1 of this plan)
   - rebuild `match_scratch` (Source, Sink, `P` nodes, CAP edges)
   - binary search τ with `algo.maxFlow`; refine greedily; update `cum_value`
4. Create `SPEED_DATE` edges for all 4 dates in one `UNWIND`.
5. Return the plan; emit `session_opened`.

**Checks:**
- 4 dates, each a matching (nobody twice per date), no pair repeated across dates or sessions.
- No infeasible pair (negative ties) chosen.
- Opening a session takes under 10s. If the binary search is slow, cap at 8 iterations.

---

## P4: Questions and Claude phrasing (40m) ✅ done (Claude path untested until an API key is set)

**Goal:** each rater in an open date has 6–8 questions with `why`; check-ins get 2–3.

Files: `services/questions.py` (what), `services/llm.py` (how).

1. `select_targets(rater, partner)` → 2–3 topics × 2 claims, with `why` (4.1).
2. `phrase(targets, rater, partner)` → Claude call returning JSON; validate against targets; template fallback on any error or timeout.
3. On date open: generate for all raters concurrently (`asyncio` with a semaphore of ~20), store in `SPEED_DATE.questions`.
4. Routes: `GET .../questions`, `POST .../answers` (write `answers`, `act`, `meet_again`, `complete`; emit `answer_recorded`).

**Decision for you: when to call Claude.** About 200 Opus calls per date could take a minute or more. Proposal: `LLM_MODE` = `live` for raters flagged as human (the live demo meeting) and `template` for simulated raters. Fast-forwarding 15 sessions then never waits on the API, while the live demo still shows Claude-phrased questions. Alternative: call Claude for everyone and accept the latency on date open.

**Checks:**
- With `ANTHROPIC_API_KEY` unset, every rater still gets template questions.
- Generated questions always map 1:1 to requested targets; "Didn't come up" is on every topic question.

---

## P5: Date pipeline, simulator, metrics (50m) ✅ done

**Status:** 15 sessions run end to end in ~2 min. Uncertainty 0.996 → 0.763, coverage 1% → 52%. Open issue: the per-date `meet_again` rate is flat (~0.5) because partner charm is zero-sum under a perfect matching; pairing does beat random pairing by ~9 points (session 0, simulator).

**Goal:** a full simulated show runs end to end, and the graph visibly learns.

Files: `services/pipeline.py`, `competence.py`, `interests.py`, `likability.py`, `ties.py`, `simulator.py`, `metrics.py`.

1. **Simulator** (8.2): latent profiles built once at seed time from priors plus noise, held in memory; `answer(rater, partner, questions)`.
2. **`POST /admin/simulate/sessions/{s}/dates/{d}`**: answer every incomplete rater through the normal answer path.
3. **Date close** (section 5): reduce and combine → `LEARNED_FROM_T{k}` + reliability + likability + interests → PageRank/`m`/`comp`/`comp_unc` for touched topics → `POS_TIE` rebuild → tribes, broker, reach → metrics → `date_closed` SSE with changed nodes and edges → open the next date (or close the session).
4. **Metrics** (8.3): uncertainty, coverage, stability, `meet_again`/`act` yes rates; `GET /metrics`.
5. **Script** `scripts/run_show.py`: seed, then for each session open → (simulate, close) × 4. Prints metrics per date.

**Checks:**
- After session 0: `LEARNED_FROM_T{k}` edges exist, `comp` has moved, `POS_TIE` is non-empty and tribes are assigned.
- Across 15 sessions: uncertainty falls, coverage rises, stability rises. `meet_again` rate trends up (if it doesn't, tune `ENJOY` and the simulator's `charm` term).
- Date close under 5s, excluding LLM time.

---

## P6: Check-ins (20m) ✅ done

**Goal:** QR check-ins work live and synthetically.

File: `services/encounters.py`.

1. `POST /checkins {scanner_id, scanned_id}`: MERGE `ADHOC` pair, generate both question sets (check-in variant), emit `checkin_recorded`.
2. Check-in question and answer routes; answers apply through the same update functions (no reliability).
3. Pipeline step: `ADHOC_PER_TICK` synthetic encounters per date close, answered by the simulator.

**Check:** after a few dates, `ADHOC` edges exist and `p_pos` reflects their `act` answers.

---

## P7: Micro-influencers (25m) ✅ done (picks currently all land in one tribe: the POS_TIE graph is one big community)

**Goal:** "who should I give tickets to?" for any topic or vendor.

File: `services/influencers.py`.

1. Build x (one-hot topic or vendor profile), targets, candidates, `p_x` (4.3).
2. Greedy top `N_INFLUENCERS` by marginal reach.
3. Explanations per pick.
4. Routes: `GET /topics/{topic_id}/influencers`, `GET /vendors/{id}/influencers`. Compute on demand (it is cheap), plus refresh at session close for SSE.

**Checks:**
- Picks span more than one tribe when the topic has several.
- Every pick meets `CRED_MIN` and `LIKE_MIN`; nobody is the vendor's own staff.

---

## Frontend track (parallel, ~2.5h)

| Step | What | Against |
| --- | --- | --- |
| F0 | Install `react-router`, `react-force-graph-2d`, `recharts`, `openapi-typescript`; generate `schema.ts`; tiny typed fetch client; Vite proxy `/api` → `localhost:8000` | P0 contract |
| F1 | **SessionConsole:** session list, open, 4-date plan table with pair values, "simulate date", "close date" | fixtures, then live after P3/P5 |
| F2 | **MeetingFlow:** phone layout, pick rater, one question at a time, submit; check-in mode (my QR, pick who I met) | fixtures, then live after P4/P6 |
| F3 | **GraphView:** topic selector, force graph (size `comp`, ring `comp_unc`, color `tribe`, arrows learner → expert, highlight latest `tick`), SSE subscription, metrics chart, last question's `why` | fixtures, then live after P5 |
| F4 | **Influencers:** topic/vendor picker, picks with competence, likability, reach and likely invitees | fixtures, then live after P7 |

GraphView is the hero visual: prioritize it over styling the others. 1,000 nodes is fine for `react-force-graph-2d`, but show only nodes with `m_k > 0` plus their neighbors by default, with a toggle for all.

---

## P8: Integration and demo state (20m) ✅ fast-forward and human raters done; rehearsal pending

1. `POST /admin/fast_forward?to_session=N`: seed if needed and simulate through session N−1, so the demo can start mid-show with an interesting graph.
2. Mark 2 attendees as "human" for the live meeting (their questions use Claude, and the simulator skips them).
3. End-to-end smoke test: fresh `docker compose up`, seed, fast-forward, run one live date from two phones.
4. Pin the FalkorDB image tag.

---

## P9: Demo rehearsal (15m)

Run section 12 of the doc twice end to end and time it. Have a reset-and-fast-forward command ready in case of mistakes during the demo.

---

## Cut lines (if behind, drop in this order)

1. Greedy refinement in pairing (use the maxFlow floor matching directly).
2. Stability metric and coverage (keep uncertainty and `meet_again` rate).
3. Check-in UI (keep synthetic check-ins in the pipeline).
4. `RELATED` topic edges (drop the neighbor expansion in candidate topics).
5. Claude phrasing (template text everywhere). Painful for the pitch, but the graph still works.

Never cut: seed, pairing via `algo.maxFlow`, the date pipeline, GraphView, and influencers. Those are the demo.

---

## Known risks

| Risk | Mitigation |
| --- | --- |
| ~~`algo.maxFlow` missing or different in the pulled image~~ | Verified in P0 on 6.0.3 |
| ~~Docker not installed~~ | Colima installed in P0 |
| Opus latency for ~200 calls per date | `LLM_MODE` split (P4) |
| Local venv is Python 3.15, container is 3.11 | Run the real thing in Docker; avoid 3.12+ only syntax |
| Simulated `meet_again` rate doesn't visibly improve | Tune `ENJOY` and simulator `charm`; the metric is chosen to tell that story |
| Label propagation ids change every run | Compare memberships, map colors by largest overlap with the previous run |
