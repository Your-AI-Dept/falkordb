# Conference Knowledge Graph: Design Spec

Hackathon build, 2026-10-24. Stack: **FalkorDB** (graph database and all graph algorithms), **FastAPI** (REST + server-sent events), **React** (Vite + TypeScript).

---

## 0. What we're building

A live graph of who knows what, who cares about what, and whose word carries weight. It updates after every speed-dating round and powers three things:

1. **Pairing.** High-value speed-dating pairs each round, with a fairness floor so nobody gets a dud.
2. **Adaptive questions.** After each 1-on-1, both people answer 4–8 short questions chosen for information value.
3. **Micro-influencers.** For each vendor, a small set of credible attendees whose recommendations reach the most receptive people.

**Hero demo:** a live "conversation feedback" session. After each round, the topic graph visibly updates who is knowledgeable, and estimated expertise converges on the mock dataset's hidden truth.

### Design principles

- **Attendees are the only nodes in the people graph.** Relations between two people are edges. Facts about one person are node properties. Labels are cached on/off filters.
- **Topics are the shared coordinate system.** Every vector (interests, competence, talk topics, vendor profiles) is indexed by topic `0..T−1`. That is the only link between the people graph and the content graph.
- **All graph algorithms run in FalkorDB.** Python does arithmetic on values read from FalkorDB and writes results back.
- **FalkorDB's centrality and community algorithms ignore edge weights and select edges by relationship type.** Any subgraph an algorithm must run on is materialized as its own relationship type (that is why `POS_TIE` exists).

---

## 1. Architecture

```
React (Vite + TypeScript)
   │  REST (JSON) + SSE (GET /events) for live updates
FastAPI (Python 3.11, falkordb-py)
   │  Cypher over the Redis protocol
FalkorDB (Docker)   graphs: content, people, match_scratch
```

- **REST, not GraphQL.** The frontend needs a fixed set of views. FastAPI's OpenAPI schema generates a typed client for React (`openapi-typescript`).
- **SSE** pushes round updates to the graph view. Everything else is request/response.
- **FalkorDB:** `docker run -p 6379:6379 -p 3000:3000 -it --rm falkordb/falkordb`. Port 3000 is the FalkorDB Browser, useful for debugging.
- **Round state** (current round number, open/closed) can live in process for the hackathon. All durable data lives in FalkorDB.

### Repo layout

```
backend/
  app/main.py              FastAPI app, routers, SSE
  app/config.py            all constants (section 9)
  app/db.py                FalkorDB client and graph handles
  app/cypher.py            query strings; relationship type names built from whitelists
  app/models.py            Pydantic models
  app/mathcore.py          pure math functions (unit-tested, no DB access)
  app/services/
    seed.py                load mock data, create indexes, cold-start priors
    interests.py           Beta updates for interest
    ties.py                Dirichlet counts, POS_TIE rebuild
    competence.py          answer combination, LEARNED_FROM_T{k}, PageRank, competence scores
    questions.py           adaptive question selection
    pairing.py             pair values, maxFlow matching, refinement
    influencers.py         vendor seed selection
    pipeline.py            round-close orchestration
    simulator.py           mock conversation answers (holds the hidden truth)
    metrics.py             convergence metrics
  tests/
frontend/
  src/pages/RoundConsole.tsx
  src/pages/MeetingFlow.tsx
  src/pages/GraphView.tsx
  src/pages/Vendors.tsx
scripts/tag_talks.py       optional: LLM-tag talks into topics
docker-compose.yml
```

---

## 2. Graphs and data model

### 2.1 `content` graph

Nodes:

- `Topic {idx, name}`, with `idx` in `0..T−1`
- `Talk {id, title, abstract, slot, room, start, end, topic_vec}`, where `topic_vec` is a list of T floats
- `Vendor {id, name, profile, budget}`, where `profile` is a list of T floats summing to 1

Edges:

- `(Talk)-[:ABOUT {w}]->(Topic)`
- `(Topic)-[:RELATED {w}]->(Topic)`, stored as two directed edges per pair
- `(Vendor)-[:TARGETS {w}]->(Topic)`

Talk topic weights come from an offline LLM tagging script (1–3 topics per talk), or directly from the mock data.

### 2.2 `people` graph: nodes

Every node has the label `Attendee`. The label `Present` is on attendees who are still at the venue.

| Property | Type | Meaning |
| --- | --- | --- |
| `id`, `name` | string | identity |
| `side` | `'A'` or `'B'` | speed-dating side (seated or rotating) |
| `is_speaker` | bool | speaker flag |
| `speaker_topics` | list[int] | topics they speak on |
| `int_a`, `int_b` | list[T] float | Beta counts for interest per topic |
| `interest` | list[T] float | cache: `int_a / (int_a + int_b)` |
| `comp_prior` | list[T] float | cold-start competence from resume tags and speaker topics, default 0.5 |
| `pr` | list[T] float | cache: PageRank score per topic layer |
| `m` | list[T] int | distinct partners compared with on each topic |
| `comp` | list[T] float | cache: competence score per topic |
| `comp_unc` | list[T] float | cache: competence uncertainty per topic |
| `rel_a`, `rel_b` | float | Beta counts for rater reliability |
| `tribe` | int | CDLP community on `POS_TIE` |
| `broker` | float | betweenness on `POS_TIE` |
| `reach` | float | harmonic centrality on `POS_TIE` |
| `cum_value` | float | value received from pairings so far (fairness) |
| `reached` | list[string] | vendor ids this attendee has already engaged with |

Optional, for "people like me": `interest_vec` as a `vecf32` copy of `interest`, with a vector index.

### 2.3 `people` graph: edge types

T + 3 persisted types, plus 1 derived type rebuilt every round.

| Type | Direction | Created by | Properties |
| --- | --- | --- | --- |
| `LINKEDIN` | both directions (two edges) | seed | `since` |
| `ADHOC` | both directions (two edges) | seed or check-ins | `count`, `last_round` |
| `SPEED_DATE` | rater → ratee | opening a round | `round`, `topic_answers` (JSON string), `act` (`'yes'`/`'maybe'`/`'no'`/null), `meet_again` (bool/null), `complete` (bool) |
| `LEARNED_FROM_T{k}`, k = 0..T−1 | learner → expert | round close | `round` |
| `POS_TIE` (derived) | sender → receiver | rebuilt at every round close | `p_pos` |

Direction rules, which are easy to get wrong:

- **Symmetric relationships** (`LINKEDIN`, `ADHOC`) are stored as two directed edges. Harmonic centrality and PageRank respect direction.
- **`SPEED_DATE`** points from the person answering to the person they describe. Each meeting creates two edges, one per rater.
- **Influence flows opposite to the `SPEED_DATE` edge it was learned from.** v's `act` answer about u lives on the edge v → u and is evidence for influence u → v.
- **`LEARNED_FROM_T{k}`** points from learner to expert, so PageRank mass flows to experts. "We learned evenly" creates both directions.
- **`POS_TIE`** points from sender to receiver.

### 2.4 Scratch graph `match_scratch`

This graph is used only for the matching step (section 4.2). It holds a `Source` node, a `Sink` node and one `P {id, side}` node per present attendee. `CAP {cap: 1}` edges run Source → A-side, A-side → B-side for feasible pairs, and B-side → Sink. Keeping it separate leaves the people graph attendee-only.

### 2.5 Indexes

```cypher
CREATE INDEX FOR (a:Attendee) ON (a.id)
```

In the content graph: `Talk.id`, `Topic.idx` and `Vendor.id`.

Optional vector index:

```cypher
CREATE VECTOR INDEX FOR (a:Attendee) ON (a.interest_vec) OPTIONS {dimension: 10, similarityFunction: 'cosine'}
```

---

## 3. Core math and update rules

All functions in this section belong in `mathcore.py` as pure functions with unit tests.

### 3.1 Interest: Beta counts per attendee and topic

Cold start:

```
int_a[k] = A0 + S_SIGNUP · Σ(signed-up talks) topic_vec[k] + S_RESUME · resume_tags[k]
int_b[k] = B0 + S_PASS · Σ(talks passed over in the same slots) topic_vec[k]
```

A sign-up is a choice among the talks in that slot, so topics passed over count as mild evidence against.

After each round, for each topic k that came up in a conversation (any non-skip answer from either person):

- Both people: `int_a[k] += S_DISCUSS`
- The learner or learners, per the combined direction in 3.4: `int_a[k] += S_LEARNER`

"It didn't come up" adds nothing. It is not evidence against.

```
interest[k] = int_a[k] / (int_a[k] + int_b[k])
```

### 3.2 Tie belief: Dirichlet counts per ordered pair

For sender u and receiver v ("would v act on u's recommendation?"), the counts `(c_pos, c_neu, c_neg)` are the sum of:

- `PRIOR_LINKEDIN`, if a `LINKEDIN` edge exists between them
- `PRIOR_ADHOC`, if an `ADHOC` edge exists between them
- `PRIOR_SPEED`, if a `SPEED_DATE` edge v → u exists, plus 1 in the slot matching v's `act` answer (yes → `c_pos`, maybe → `c_neu`, no → `c_neg`)

If none of these exist, there is no tie and all three probabilities are 0, so there is no influence path.

```
p_pos = c_pos / (c_pos + c_neu + c_neg)    (likewise p_neu and p_neg)
```

Optional decay: multiply the answer counts by `DECAY_PER_ROUND` at each round close.

These are computed in Python from one Cypher read of all tie evidence. They are not stored as a separate edge type.

### 3.3 Competence per attendee and topic

1. **Votes** are the `LEARNED_FROM_T{k}` edges written in 3.4.
2. **PageRank per touched topic layer:**
   ```cypher
   CALL algo.pageRank('Attendee', 'LEARNED_FROM_T3') YIELD node, score
   ```
   Scores sum to 1 across attendees.
3. **Log-ratio to uniform:** `s_k(u) = ln(n · pr_k(u))`, where n is the number of attendees. This is 0 for an average attendee.
4. **Evidence-based estimate:** `c_pr = 1 / (1 + exp(−GAMMA · s_k(u)))`.
5. **Blend with the cold-start prior** by evidence count `m_k(u)`, the number of distinct partners compared with on topic k:
   ```
   comp[k]     = (W0 · comp_prior[k] + m_k(u) · c_pr) / (W0 + m_k(u))
   comp_unc[k] = W0 / (W0 + m_k(u))
   ```

Speakers get `comp_prior[k] = SPEAKER_PRIOR` on their speaker topics. This is blended in step 5, so no pseudo-nodes are added to the graph.

### 3.4 Combining the two answers on a topic

Each person answers about their partner on topic k with one of:

- `LEARNED_MORE`: "I learned more from them"
- `EVEN`: "We learned evenly from each other"
- `TAUGHT_MORE`: "They learned more from me"
- `SKIP`: "It didn't come up"

For a pair (u, v), where `u→v` means u was the learner and v the expert:

| u answers | v answers | Resulting edges | Reliability |
| --- | --- | --- | --- |
| SKIP | SKIP | none | none |
| any non-skip answer | SKIP (or the reverse) | the non-skip answer's direction | none |
| LEARNED_MORE | TAUGHT_MORE | u→v | agree |
| TAUGHT_MORE | LEARNED_MORE | v→u | agree |
| EVEN | EVEN | both directions | agree |
| EVEN | LEARNED_MORE or TAUGHT_MORE (or the reverse) | the non-even answer's direction | none |
| LEARNED_MORE | LEARNED_MORE | both directions (modesty) | none |
| TAUGHT_MORE | TAUGHT_MORE | both directions | disagree |

Single-answer directions:

- u's answer: LEARNED_MORE → u→v, TAUGHT_MORE → v→u, EVEN → both
- v's answer: LEARNED_MORE → v→u, TAUGHT_MORE → u→v, EVEN → both

Write each resulting direction as a `LEARNED_FROM_T{k}` edge from learner to expert, with property `round`.

Unit-test every row of this table.

### 3.5 Rater reliability

```
r(u) = rel_a / (rel_a + rel_b)      prior: (rel_a, rel_b) = REL_PRIOR
```

"Agree" adds 1 to `rel_a` for both people. "Disagree" adds 1 to `rel_b` for both. Reliability is used in question scoring (4.1). In the MVP, votes stay unweighted for PageRank.

### 3.6 POS_TIE rebuild, at every round close

1. `MATCH ()-[p:POS_TIE]->() DELETE p`
2. Compute `p_pos(u→v)` from 3.2 for every ordered pair with tie evidence.
3. Create `POS_TIE (u→v {p_pos})` wherever `p_pos ≥ POS_THRESH`.

Negative ties never get their own type. Queries filter on `p_neg` computed in Python.

### 3.7 Structure features on POS_TIE, at every round close

Skip these calls while `POS_TIE` has no edges (see section 10).

```cypher
CALL algo.labelPropagation({nodeLabels: ['Attendee'], relationshipTypes: ['POS_TIE'], maxIterations: 10})
YIELD node, communityId
```

This sets `tribe`. Nodes are processed in random order, so community ids change between runs; compare memberships, not ids.

```cypher
CALL algo.betweenness({nodeLabels: ['Attendee'], relationshipTypes: ['POS_TIE'], samplingSize: $n, samplingSeed: 42})
YIELD node, score
```

This sets `broker`. Pass `samplingSize = n` for exact scores; the default samples 32 sources.

```cypher
CALL algo.HarmonicCentrality({nodeLabels: ['Attendee'], relationshipTypes: ['POS_TIE']})
YIELD node, score
```

This sets `reach`. It is approximate (HyperLogLog) and treats edges as directed.

Optional, per topic, to see which competence scores are comparable:

```cypher
CALL algo.WCC({nodeLabels: ['Attendee'], relationshipTypes: ['LEARNED_FROM_T3']})
YIELD node, componentId
```

---

## 4. Applications

### 4.1 Adaptive questions, per rater per meeting

Order of questions:

1. 2–6 topic questions, chosen adaptively.
2. Two fixed tie questions, asked last to limit spillover from liking.

That gives 4–8 questions in total.

**Topic question:** "On {topic}, how did the learning go between you and {partner}?" The options are the four answers in 3.4.

**Fixed questions:**

1. "Would you act on {partner}'s recommendation?" Yes / Maybe / No, stored as `act`.
2. "Would you like to meet {partner} again?" Yes / No, stored as `meet_again`.

**Candidate topics** for rater u about partner v:

- the top 3 topics by `interest` for u
- the top 3 topics by `interest` for v
- the top 3 topics by `comp` for v
- the `RELATED` neighbors of all of these, from the content graph

Exclude topics already asked in this meeting.

**Score for topic k:**

```
plaus_k  = (interest_k(u) + interest_k(v)) / 2                      did it likely come up?
p_hat    = 1 / (1 + exp(−(s_k(v) − s_k(u))))                         Bradley–Terry on log-ratio scores
H(p)     = −p·ln(p) − (1−p)·ln(1−p)
IG_k     = H(p_hat) · (comp_unc_k(u) + comp_unc_k(v)) / 2
demand_k = Σ(vendors) profile[k], normalized so the maximum is 1
score_k  = plaus_k · (W_BASE + demand_k) · r(u) · IG_k
```

**Loop:**

1. Ask the highest-scoring topic.
2. If the answer is SKIP, multiply the scores of that topic's `RELATED` neighbors by 0.5 for the rest of this meeting.
3. Stop asking topic questions once at least `Q_MIN_TOPIC` have been asked and either the best score is below `ATTENTION_COST` or `Q_MAX_TOPIC` have been asked.
4. Ask the two fixed questions.

Write each answer to the rater's `SPEED_DATE` edge immediately. `topic_answers` is a JSON string keyed by topic index.

Each question returned by the API carries a `why` object (`score`, `ig`, `plausibility`). It drives the hero visual.

### 4.2 Pairing, each round

**Value of meeting v, for u:**

```
teach_u(v)    = Σ_k comp_k(v) · interest_k(u) / Σ_k interest_k(u)
bridge(u,v)   = 1 if tribe(u) ≠ tribe(v), else 0
familiar(u,v) = 1 if a LINKEDIN or ADHOC edge exists between them, else 0
explore(u,v)  = mean of IG_k over the pair's 3 most plausible topics
V_u(v)        = teach_u(v) + BETA·bridge − MU·familiar + LAMBDA·explore
```

**A pair (u, v) is feasible when all of these hold:**

- u and v are on opposite sides, and both are `Present`.
- They have no previous `SPEED_DATE` edge between them.
- `p_neg(u→v) < NEG_THRESH` and `p_neg(v→u) < NEG_THRESH`.

**Matching:**

1. Score each pair by `w(u,v) = min(V_u(v), V_v(u))`, so both people must get value.
2. The target matching size is `K = min(|A present|, |B present|)`.
3. Binary-search the sorted distinct `w` values for the largest τ at which maxFlow, run over `CAP` edges for pairs with `w ≥ τ`, equals K. For each τ:
   - Delete the A → B `CAP` edges in `match_scratch` and recreate them for pairs with `w ≥ τ`.
   - Run:
     ```cypher
     MATCH (s:Source), (t:Sink)
     CALL algo.maxFlow({sourceNodes: [s], targetNodes: [t], capacityProperty: 'cap', relationshipTypes: ['CAP']})
     YIELD edges, edgeFlows, maxFlow
     RETURN [i IN range(0, size(edges) - 1) | [startNode(edges[i]).id, endNode(edges[i]).id, edgeFlows[i]]] AS flows, maxFlow
     ```
   - The matching is the A → B edges with flow 1.
4. Refine above the floor τ*:
   - Run a greedy pass over pairs with `w ≥ τ*`, sorted by `w + DELTA·(deficit_u + deficit_v)` descending. Take a pair if both people are still free.
   - If the greedy pass matches K pairs, use it. Otherwise use the maxFlow matching from τ*.
5. Track fairness:
   - `deficit_u = max(0, mean(cum_value) − cum_value_u)`.
   - After the round, `cum_value_u += V_u(partner)`.
6. People left unmatched sit out this round and gain priority through `deficit` next round.

When the round opens, create the `SPEED_DATE` edges (both directions, `complete = false`).

### 4.3 Micro-influencers, per vendor

With the vendor's profile x (sums to 1):

```
interest_x(v) = Σ_k x_k · interest_k(v)
comp_x(u)     = Σ_k x_k · comp_k(u)
p_x(u→v)      = p_pos(u→v) · comp_x(u) · interest_x(v)     for pairs with tie evidence, else 0
```

**Targets:** `Present` attendees with `interest_x(v) ≥ TARGET_MIN` who don't have this vendor in `reached`.

**Candidates:** `Present` attendees who meet both conditions:

- `comp_x(u) ≥ CRED_MIN`
- backfire `bf(u) = Σ(v in targets) p_neg(u→v)` is below `BACKFIRE_MAX`

**Expected reach**, one hop, in closed form:

```
σ(S) = Σ(v in targets) [ 1 − Π(u in S) (1 − p_x(u→v)) ]
```

This is monotone submodular.

**Cost:** `cost(u) = COST_BASE + COST_PROMINENCE · reach_norm(u)`, where `reach_norm` is harmonic centrality on `POS_TIE` normalized to [0, 1]. Prominent people cost more, which is what makes the picks "micro."

**Selection:**

1. Run a cost-benefit greedy within the budget: repeatedly add the affordable candidate with the largest `Δσ / cost`, until no affordable candidate adds positive reach.
2. Compare the result with the best single affordable candidate, and return whichever reaches more. This is the standard safeguard for budgeted submodular maximization.

**Explanation per seed:**

- marginal gain
- top 5 targets with their `p_x`
- `comp_x(u)` and the evidence count `m`
- `tribe` and `broker` score

Off by default, for later: a discounted second hop through `POS_TIE`, or sampled cascade worlds.

---

## 5. Round lifecycle

States: OPEN → (answers arrive) → CLOSED.

- **`POST /rounds`** computes the pairing (4.2), creates the `SPEED_DATE` edges, sets the state to OPEN and emits SSE `round_opened`.
- **Answers** flow through `GET .../next` and `POST .../answers` per rater (4.1). Each answer emits SSE `answer_recorded`.
- **`POST /rounds/{r}/close`** runs the pipeline. It can also run automatically once all meetings are complete.
  1. For each meeting, combine the answers per topic (3.4). Write the `LEARNED_FROM_T{k}` edges, update reliability (3.5) and update interests (3.1).
  2. For the touched topics, recompute PageRank, `m`, `comp` and `comp_unc` (3.3), and write the caches.
  3. Rebuild `POS_TIE` (3.6), then recompute tribes, brokers and reach (3.7).
  4. Recompute vendor seeds (4.3).
  5. Compute metrics (section 8), then emit SSE `round_closed` with the metrics and the nodes and edges that changed.
- **`POST /admin/simulate/{r}`** answers every incomplete meeting in round r through the simulator. It goes through the same next/answer logic, so the adaptive selection is exercised. This lets the demo run many rounds quickly while a human answers one meeting live.

---

## 6. REST API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | FalkorDB ping |
| POST | `/admin/seed` | Load mock data into the content and people graphs, create indexes, set cold-start priors |
| POST | `/admin/reset` | Drop and recreate the graphs |
| POST | `/admin/simulate/{round}` | Simulator answers all incomplete meetings in a round |
| GET | `/topics` | Topics |
| GET | `/talks` | Talks with topic weights |
| GET | `/vendors` | Vendors |
| GET | `/attendees` | Attendee summaries |
| GET | `/attendees/{id}` | Interests, competence, uncertainty, tribe, tie summary |
| POST | `/rounds` | Open the next round: pairing plus `SPEED_DATE` edges |
| GET | `/rounds/{r}` | Pairs with values, completion status |
| GET | `/rounds/{r}/meetings/{rater_id}/next` | Next question for this rater, or `done` |
| POST | `/rounds/{r}/meetings/{rater_id}/answers` | Submit an answer; returns the next question |
| POST | `/rounds/{r}/close` | Run the update pipeline; returns metrics |
| GET | `/graph/topics/{k}` | Nodes (`comp_k`, `comp_unc_k`, `tribe`) and `LEARNED_FROM_T{k}` edges, for the visual |
| GET | `/graph/ties` | `POS_TIE` edges and tribes |
| GET | `/vendors/{id}/influencers` | Seeds with explanations |
| GET | `/metrics/convergence` | Per-round convergence (mock data only) |
| GET | `/events` | SSE stream: `round_opened`, `answer_recorded`, `round_closed` |

Payload sketches:

```json
{
  "done": false,
  "question": {
    "question_id": "t3",
    "kind": "topic",
    "topic_idx": 3,
    "text": "On AI agents, how did the learning go between you and Sam?",
    "options": [
      {"value": "LEARNED_MORE", "label": "I learned more from them"},
      {"value": "EVEN", "label": "We learned evenly from each other"},
      {"value": "TAUGHT_MORE", "label": "They learned more from me"},
      {"value": "SKIP", "label": "It didn't come up"}
    ],
    "why": {"score": 0.21, "ig": 0.34, "plausibility": 0.62}
  }
}
```

```json
{"question_id": "t3", "value": "EVEN"}
```

Fixed questions use `kind: "act"` (values `yes` / `maybe` / `no`) and `kind: "meet_again"` (values `yes` / `no`).

---

## 7. Frontend

Pages:

- **RoundConsole:** open a round, list pairs with their values, run the simulator, close the round.
- **MeetingFlow:** phone-sized. Shows one question at a time for one rater, with the partner's name.
- **GraphView:**
  - A topic selector, and a force-directed graph of one `LEARNED_FROM_T{k}` layer.
  - Node size is `comp_k`, ring opacity is `comp_unc_k`, and color is `tribe`.
  - Arrows run from learner to expert, and edges added this round are highlighted.
  - A side panel shows the convergence chart and the last chosen question with its `why`.
- **Vendors:** for each vendor, the chosen seeds, expected reach and explanations.

Libraries:

- `react-force-graph-2d` for the graph
- `recharts` for charts
- `EventSource` for SSE
- `openapi-typescript` for API types

FalkorDB's Canvas web component is an alternative for the graph view if time allows.

---

## 8. Mock data and simulator

### 8.1 Files (built by the data teammate)

- `topics.json`: `[{idx, name}]`, with T = 10
- `talks.json`: `[{id, title, abstract, slot, room, start, end, topics: [{idx, w}]}]`, 30–60 talks
- `vendors.json`: `[{id, name, profile: [T], budget}]`, 3–5 vendors
- `attendees.json`: 60–200 attendees, sides balanced. Each record has:
  - `id`, `name`, `side`
  - `is_speaker`, `speaker_topics`
  - `resume_tags: [T]`, which is noisy truth
  - `signups: [talk ids]`, chosen from true interest with noise
  - `truth: {expertise: [T], interest: [T], talkativeness, modesty}`
- `linkedin.json` and `adhoc.json`: `[{a, b}]`, with community structure (for example grouped by primary topic or company), 5–10 LinkedIn ties per person

Rules for the hidden truth:

- Expertise is sparse: 1–3 strong topics per person.
- Interest comes from a Dirichlet over topics.
- It is loaded only into `simulator.py`, never into the graph.

### 8.2 Simulated conversation (u, v)

- **Topics discussed:** up to 3 distinct topics, sampled with probability proportional to `truth.interest_u + truth.interest_v`.
- **True outcome per discussed topic k:**
  - `d = e_v − e_u + KAPPA · (talk_v − talk_u) + noise(SIGMA)`, where e is true expertise and talk is talkativeness.
  - If `|d| < EPS`, the outcome is EVEN.
  - If `d > 0`, u learned more; otherwise v learned more.
- **Each rater's answer** is the true outcome from their perspective, with two distortions:
  - With probability `modesty`, a rater who would have said EVEN or TAUGHT_MORE says LEARNED_MORE instead.
  - With probability `P_FORGET`, a rater says SKIP on a topic that was discussed.
- **Topics not discussed** are answered SKIP.
- **`act` (v about u):**
  - `rapport = cosine(truth.interest_u, truth.interest_v) + noise(0.2)`.
  - Answer yes if rapport is above 0.6, maybe if above 0.3, otherwise no.
  - With probability `P_CLASH`, the answer is no regardless.
- **`meet_again`:** yes if rapport is above 0.45.

Simulator constants: `KAPPA = 0.15`, `SIGMA = 0.1`, `EPS = 0.08`, `P_FORGET = 0.1`, `P_CLASH = 0.05`.

### 8.3 Convergence metrics

After each round, for each topic, compute the Spearman correlation between `comp_k` and true expertise over attendees with `m_k > 0`. Report the mean across topics and the mean absolute error, by round.

---

## 9. Config constants

All values are starting guesses, kept in `config.py` and tuned during the build.

| Name | Default | Used in |
| --- | --- | --- |
| `T` | 10 | everywhere |
| `A0`, `B0` | 1.0, 2.0 | 3.1 |
| `S_SIGNUP`, `S_RESUME`, `S_PASS` | 1.0, 0.5, 0.25 | 3.1 |
| `S_DISCUSS`, `S_LEARNER` | 0.5, 0.5 | 3.1 |
| `PRIOR_LINKEDIN` | (0.5, 1.5, 0.05) | 3.2 |
| `PRIOR_ADHOC` | (1.0, 1.0, 0.05) | 3.2 |
| `PRIOR_SPEED` | (1.0, 1.0, 1.0) | 3.2 |
| `DECAY_PER_ROUND` | 1.0 (off) | 3.2 |
| `GAMMA` | 1.0 | 3.3 |
| `W0` | 2.0 | 3.3 |
| `SPEAKER_PRIOR` | 0.8 | 3.3 |
| `REL_PRIOR` | (2, 1) | 3.5 |
| `POS_THRESH`, `NEG_THRESH` | 0.4, 0.4 | 3.6, 4.2 |
| `Q_MIN_TOPIC`, `Q_MAX_TOPIC` | 2, 6 | 4.1 |
| `ATTENTION_COST` | 0.02 | 4.1 |
| `W_BASE` | 1.0 | 4.1 |
| `BETA`, `MU`, `LAMBDA` | 0.2, 0.3, 0.3 | 4.2 |
| `DELTA` | 0.2 | 4.2 |
| `TARGET_MIN`, `CRED_MIN` | 0.4, 0.55 | 4.3 |
| `COST_BASE`, `COST_PROMINENCE` | 1.0, 4.0 | 4.3 |
| `BACKFIRE_MAX` | 0.5 | 4.3 |
| `VENDOR_SEES_NAMES` | false | 13 |

---

## 10. FalkorDB notes and gotchas

**Client setup:**

```python
from falkordb import FalkorDB
db = FalkorDB(host="localhost", port=6379)
people = db.select_graph("people")
people.query(cypher, params)
```

**Algorithm behavior:**

- Algorithms ignore edge weights and select edges by relationship type. That is why `POS_TIE` exists.
- `algo.pageRank(label, relationshipType)` takes one label and one relationship type. Scores sum to 1, and no damping parameter is exposed.
- `algo.betweenness` samples 32 source nodes by default. Pass `samplingSize = n` and a fixed `samplingSeed`.
- `algo.labelPropagation` processes nodes in random order, so results can vary between runs.
- `algo.HarmonicCentrality` is approximate and treats edges as directed. It raises an error if a named label or relationship type doesn't exist yet, so skip it until `POS_TIE` has edges. Likewise, run PageRank and WCC only for topic layers that have at least one `LEARNED_FROM_T{k}` edge.
- `algo.maxFlow` adds a virtual super-source and super-sink with unlimited capacity when given several sources or sinks. That would let one person match several partners, so matching uses explicit `Source` and `Sink` nodes with capacity-1 edges (2.4).

**Query construction:**

- Relationship type names can't be parameterized in patterns. Build `LEARNED_FROM_T{k}` from whitelisted integers, never from user input.
- If a pattern never references a relationship's alias, FalkorDB only checks that at least one matching edge exists. Reference the alias whenever you count edges.
- Verify on first use: multi-type patterns such as `[r:LINKEDIN|ADHOC|SPEED_DATE]`, and empty-list properties. If either misbehaves, run one query per type, or seed lists with a placeholder.

**Storage:**

- Each graph is a separate key, and there are no cross-graph queries. Join on topic indices in Python.
- Store symmetric relationships as two directed edges.
- Store answer maps as JSON strings.

**Key queries:**

```cypher
// Symmetric seed edges
UNWIND $pairs AS p
MATCH (a:Attendee {id: p.a}), (b:Attendee {id: p.b})
CREATE (a)-[:LINKEDIN]->(b), (b)-[:LINKEDIN]->(a)
```

```cypher
// Open a round
UNWIND $pairs AS p
MATCH (a:Attendee {id: p.a}), (b:Attendee {id: p.b})
CREATE (a)-[:SPEED_DATE {round: $r, complete: false, topic_answers: '{}'}]->(b),
       (b)-[:SPEED_DATE {round: $r, complete: false, topic_answers: '{}'}]->(a)
```

```cypher
// Record a rater's answers
MATCH (u:Attendee {id: $rater})-[e:SPEED_DATE {round: $r}]->(v:Attendee)
SET e.topic_answers = $answers_json, e.act = $act, e.meet_again = $meet_again, e.complete = $complete
```

```cypher
// Write votes for topic 3
UNWIND $edges AS e
MATCH (l:Attendee {id: e.learner}), (x:Attendee {id: e.expert})
CREATE (l)-[:LEARNED_FROM_T3 {round: $r}]->(x)
```

```cypher
// Distinct partners compared on topic 3
MATCH (a:Attendee)-[r:LEARNED_FROM_T3]-(b:Attendee)
RETURN a.id AS id, count(DISTINCT b) AS m
```

```cypher
// All tie evidence
MATCH (u:Attendee)-[r:LINKEDIN|ADHOC|SPEED_DATE]->(v:Attendee)
RETURN u.id AS src, v.id AS dst, type(r) AS t, r.act AS act
```

```cypher
// Rebuild POS_TIE
MATCH ()-[p:POS_TIE]->() DELETE p
```

```cypher
UNWIND $ties AS t
MATCH (u:Attendee {id: t.sender}), (v:Attendee {id: t.receiver})
CREATE (u)-[:POS_TIE {p_pos: t.p}]->(v)
```

---

## 11. Build plan

Each step is done when its check passes.

1. **Infrastructure.** docker-compose with FalkorDB, backend and frontend; `/health` pings FalkorDB.
   Check: the FalkorDB Browser shows both graphs after seeding.
2. **Seed.** Load mock JSON into the content and people graphs, create indexes, set cold-start interests and `comp_prior`.
   Check: `GET /attendees/{id}` returns vectors.
3. **Pure math module with unit tests:** Beta and Dirichlet updates, `combine_answers` (every row of table 3.4), the competence blend, IG, σ(S) and greedy seed selection.
4. **Questions and answers for one meeting** (4.1), written to `SPEED_DATE`.
   Check: 4–8 questions per rater, each with `why` populated.
5. **Round-close pipeline** (section 5).
   Check: `LEARNED_FROM_T{k}` edges appear, `comp` changes, `POS_TIE` is rebuilt and tribes are assigned.
6. **Pairing** with maxFlow and refinement (4.2), plus the simulator. Run 8 rounds.
   Check: no repeat pairs, feasibility is respected, and convergence correlation rises across rounds.
7. **Frontend:** MeetingFlow, GraphView with SSE, RoundConsole.
8. **Vendor influencers** (4.3) and the Vendors page.
9. **Demo rehearsal** (section 12).

Run in parallel where possible: the frontend can start at step 3 against mocked endpoints, while the data teammate builds the mock data and simulator.

---

## 12. Demo script (3 minutes)

1. Show the graph view of one topic layer at round 0: everyone sits near their prior, with wide uncertainty rings.
2. Run a live speed date. Two people answer on their phones, and the screen shows which question the system chose and why.
3. Close the round, with the simulator filling in the rest. Arrows appear, nodes resize, rings tighten and the convergence chart ticks up.
4. Fast-forward five rounds. The estimated experts now match the hidden truth.
5. Open the vendor tab: the micro-influencers for one vendor, with their expected reach and the reasons.

---

## 13. Open decisions

These are parameters, not blockers.

- **Influencer cost model** (`COST_BASE`, `COST_PROMINENCE`): placeholders until decided.
- **Vendor visibility** (`VENDOR_SEES_NAMES`, default false): vendors see reach by tribe, plus only the names of attendees who opted in.
- **Second hop or sampled worlds for influence:** off by default.