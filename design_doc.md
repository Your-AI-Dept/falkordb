# Conference Knowledge Graph: Design Spec

Hackathon build (FalkorDB hackathon), 2026-10-24. Stack: **FalkorDB** (graph database and all graph algorithms), **FastAPI** (REST + server-sent events), **React** (Vite + TypeScript), **Claude** (question phrasing).

Dataset: **Pizza Expo 2027** (`data/`), 1,000 attendees, 10 topics, 73 exhibitors, 47 sessions. See `data/README.md`.

---

## 0. What we're building

A live graph of who knows what, who cares about what, who people enjoy talking to, and whose word carries weight. It is fed by structured speed-dating sessions and by ad-hoc check-ins (two people scan each other's QR code in the app after meeting), and powers three things:

1. **Pairing.** Each speed-dating session plans 4 dates per person that maximize learning and enjoyment, with a fairness floor so nobody gets a dud.
2. **Agentic questions.** After each date, both people answer 6–8 short questions; after an ad-hoc check-in, 2–3. An algorithm chooses what to ask for maximum information gain; Claude phrases the questions for that specific pair.
3. **Micro-influencers.** Exhibitors and sponsors host parties and events for their topic but struggle to know whom to invite. For each topic (or vendor), we find a few attendees who are **knowledgeable, well liked and well connected** to the right people, so the host can give them tickets to hand out. Invitations then spread organically, through people the invitees already trust.

### Event format

- **15 speed-dating sessions** across the 3 show days (5 per day), each **1 hour**.
- About **200 attendees per session**, drawn from the 1,000. The average attendee comes to about 3 sessions; some come to more, some fewer, some none.
- Each session is **4 dates of 15 minutes**. All 4 pairings are planned when the session opens, so the system sees only 4 dates ahead.
- After each date, both people answer their questions and the graph updates. The next session is planned with everything learned so far.
- Outside sessions, attendees meet around the show floor. Scanning each other's QR code creates an ad-hoc tie and prompts both people with 2–3 quick questions. For the demo these encounters are synthetic: a batch of random encounters is generated at every date close.

**Hero demo:** run a session live. After each date, the topic graph visibly updates who is knowledgeable and uncertainty rings tighten. Across sessions, the matcher gets measurably better at producing pairs who want to meet again.

### Design principles

- **Attendees are the only nodes in the people graph.** Relations between two people are edges. Facts about one person are node properties. Labels are cached on/off filters.
- **Topics are the shared coordinate system.** Topics have human-readable string ids (`cheese-dairy`, `dough-flour`, ...) in the API and payloads. Internally every vector (interests, competence, exhibitor profiles) is a list indexed `0..T−1` in the order of `data/program/topics.json`. That is the only link between the people graph and the content graph.
- **All graph algorithms run in FalkorDB**, including the matching (`algo.maxFlow`). Python does arithmetic on values read from FalkorDB and writes results back.
- **FalkorDB's centrality and community algorithms ignore edge weights and select edges by relationship type.** Any subgraph an algorithm must run on is materialized as its own relationship type (that is why `POS_TIE` exists).
- **Keep it demo-simple.** No hidden ground truth, no wall-clock scheduler: the system advances one date at a time when the operator (or simulator) closes it.

---

## 1. Architecture

```
React (Vite + TypeScript)
   │  REST (JSON) + SSE (GET /events) for live updates
FastAPI (Python 3.11, falkordb-py, anthropic)
   │  Cypher over the Redis protocol
FalkorDB (Docker)   graphs: content, people, match_scratch
```

- **REST, not GraphQL.** The frontend needs a fixed set of views. FastAPI's OpenAPI schema generates a typed client for React (`openapi-typescript`).
- **SSE** pushes date and session updates to the graph view. Everything else is request/response.
- **FalkorDB:** `docker compose up falkordb`, or `docker run -p 6379:6379 -p 3000:3000 -it --rm falkordb/falkordb`. Port 3000 is the FalkorDB Browser, useful for debugging.
- **Event state** (current session, current date, open/closed) lives in process for the hackathon. All durable data lives in FalkorDB.

### Repo layout

```
data/                      Pizza Expo dataset (see data/README.md)
backend/
  app/main.py              FastAPI app, routers, SSE
  app/events.py            SSE broadcaster
  app/config.py            all constants (section 9)
  app/db.py                FalkorDB client, graph handles, batched writes
  app/cypher.py            query strings; relationship type names built from whitelists
  app/models.py            Pydantic models (the API contract)
  app/mathcore.py          pure math functions (unit-tested, no DB access)
  app/topics.py            topic id <-> index mapping
  app/snapshot.py          reads all attendees into numpy arrays
  app/state.py             event state (session/date lifecycle, metrics) in a Redis key
  app/surveys.py           survey lifecycle: answers, revisions, completion
  app/routers/             admin, catalog, sessions, checkins, insights
  app/services/
    seed.py                load data, synthesize missing fields, create indexes, cold-start priors
    evidence.py            answers -> interest, reliability, likability deltas and LEARNED_FROM edges
    competence.py          LEARNED_FROM_T{k} writes, PageRank, competence, expert ranking
    ties.py                Dirichlet tie table, POS_TIE rebuild
    encounters.py          ad-hoc QR check-ins: ADHOC edges, check-in questions, synthetic encounters
    questions.py           question target selection (what to ask) and survey assembly
    llm.py                 Claude phrasing of questions (how to ask), with template fallback
    survey_store.py        surveys persisted on SPEED_DATE / ADHOC edges
    pairing.py             pair values, per-date bipartite split, maxFlow matching, refinement
    influencers.py         micro-influencer selection per topic or vendor event
    pipeline.py            session/date lifecycle, date-close pipeline, fast-forward
    simulator.py           mock answers for the demo
    metrics.py             learning and matching-quality metrics
  tests/
frontend/
  src/pages/SessionConsole.tsx
  src/pages/MeetingFlow.tsx
  src/pages/GraphView.tsx
  src/pages/Influencers.tsx
docker-compose.yml
```

---

## 2. Graphs and data model

### 2.1 `content` graph

Nodes:

- `Topic {idx, id, name, description}`, with `idx` in `0..T−1` and `id` the string id (e.g. `cheese-dairy`)
- `Talk {id, title, type, day, start, end, room, topic_vec}`, from `sessions.json` (Keynote, Seminar, Panel, Demo). `topic_vec` is a list of T floats.
- `Vendor {id, name, category, booth, booth_size, profile}`, from `exhibitors.json`. `profile` is a list of T floats summing to 1.

Edges:

- `(Talk)-[:ABOUT {w}]->(Topic)`
- `(Topic)-[:RELATED {w}]->(Topic)`, stored as two directed edges per pair
- `(Vendor)-[:TARGETS {w}]->(Topic)`

Talk and vendor topic weights split 1 evenly across their listed topics. `RELATED` weights come from topic co-occurrence across talks, exhibitors and registration interests.

"Talks" in this spec are the show's conference sessions. "Sessions" without qualification always mean speed-dating sessions.

### 2.2 `people` graph: nodes

Every node has the label `Attendee`. The label `InSession` is on the attendees of the currently open speed-dating session.

| Property | Type | Meaning |
| --- | --- | --- |
| `id`, `name` | string | identity (`attendee_id`, e.g. `PE27-00001`) |
| `company`, `title`, `business_type`, `ticket_type` | string | from registration |
| `is_speaker` | bool | speaks at one or more talks |
| `speaker_topics` | list[int] | topics of their talks |
| `exhibitor_id` | string or null | exhibitor they staff, if any |
| `years_exp` | int | synthetic years of experience (section 8.1) |
| `sessions` | list[int] | speed-dating sessions they attend (synthetic) |
| `int_a`, `int_b` | list[T] float | Beta counts for interest per topic |
| `interest` | list[T] float | cache: `int_a / (int_a + int_b)` |
| `comp_prior` | list[T] float | cold-start competence (3.3) |
| `pr` | list[T] float | cache: PageRank score per topic layer |
| `m` | list[T] int | distinct partners compared with on each topic |
| `comp` | list[T] float | cache: competence score per topic |
| `comp_unc` | list[T] float | cache: competence uncertainty per topic |
| `rel_a`, `rel_b` | float | Beta counts for rater reliability |
| `like_a`, `like_b` | float | Beta counts for likability |
| `like` | float | cache: `like_a / (like_a + like_b)` |
| `tribe` | int | CDLP community on `POS_TIE` |
| `broker` | float | betweenness on `POS_TIE` |
| `reach` | float | harmonic centrality on `POS_TIE` |
| `cum_value` | float | value received from pairings so far (fairness) |
| `sat_out` | int | dates sat out because of an odd headcount (fairness) |
| `reached` | list[string] | vendor ids this attendee has already engaged with |

Optional, for "people like me": `interest_vec` as a `vecf32` copy of `interest`, with a vector index.

### 2.3 `people` graph: edge types

T + 3 persisted types, plus 1 derived type rebuilt after every date.

| Type | Direction | Created by | Properties |
| --- | --- | --- | --- |
| `LINKEDIN` | both directions (two edges) | seed (synthetic, 8.1) | `since` |
| `ADHOC` | both directions (two edges); empty at start | QR check-ins (3.10) | `count`, `last_tick`, `questions` (JSON string), `answers` (JSON string), `act`, `meet_again`: the edge u → v holds u's latest answers about v |
| `SPEED_DATE` | rater → ratee | opening a session | `session`, `date_no`, `tick`, `questions` (JSON string), `answers` (JSON string), `act` (`'yes'`/`'maybe'`/`'no'`/null), `meet_again` (bool/null), `complete` (bool) |
| `LEARNED_FROM_T{k}`, k = 0..T−1 | learner → expert | date close | `session`, `date_no`, `tick` |
| `POS_TIE` (derived) | sender → receiver | rebuilt at every date close | `p_pos` |

`session` is 0..14, `date_no` is 0..3, and `tick = 4·session + date_no` is a global date counter used to highlight "new this date" in the UI.

Direction rules, which are easy to get wrong:

- **Symmetric relationships** (`LINKEDIN`, `ADHOC`) are stored as two directed edges. Harmonic centrality and PageRank respect direction.
- **`SPEED_DATE`** points from the person answering to the person they describe. Each date creates two edges, one per rater.
- **Influence flows opposite to the `SPEED_DATE` edge it was learned from.** v's `act` answer about u lives on the edge v → u and is evidence for influence u → v.
- **`LEARNED_FROM_T{k}`** points from learner to expert, so PageRank mass flows to experts. "We learned evenly" creates both directions.
- **`POS_TIE`** points from sender to receiver.

Relationship type names use the integer topic index (`LEARNED_FROM_T3`), never the string id: hyphens are not valid in unquoted type names, and type names are built only from whitelisted integers.

### 2.4 Scratch graph `match_scratch`

Used only for matching (4.2), rebuilt for each date. It holds a `Source` node, a `Sink` node and one `P {id, side}` node per attendee in the date's split. `CAP {cap: 1}` edges run Source → A-side, A-side → B-side for feasible pairs, and B-side → Sink. Keeping it separate leaves the people graph attendee-only.

### 2.5 Indexes

```cypher
CREATE INDEX FOR (a:Attendee) ON (a.id)
```

In the content graph: `Talk.id`, `Topic.idx`, `Topic.id` and `Vendor.id`.

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
int_a[k] = A0 + S_REG · registered[k]
              + S_SIGNUP · Σ(signed-up talks) topic_vec[k]
              + S_SCAN · Σ(booths scanned at) profile[k]
int_b[k] = B0
```

`registered[k]` is 1 if topic k was ticked on the registration form (`registration.interests`, topic names separated by semicolons). All of `booth_scans.csv` is used as a cold-start interest signal (the demo ignores its timestamps).

After each date or check-in, for each topic k that came up (any answer other than "didn't come up" from either person):

- Both people: `int_a[k] += S_DISCUSS`
- The learner or learners, per the combined direction in 3.4: `int_a[k] += S_LEARNER`

"It didn't come up" adds nothing. It is not evidence against.

```
interest[k] = int_a[k] / (int_a[k] + int_b[k])
```

### 3.2 Tie belief: Dirichlet counts per ordered pair

For sender u and receiver v ("would v act on u's recommendation?"), the counts `(c_pos, c_neu, c_neg)` are the sum of:

- `PRIOR_LINKEDIN`, if a `LINKEDIN` edge exists between them
- `PRIOR_ADHOC`, if an `ADHOC` edge exists between them, plus 1 in the slot matching v's `act` answer on the `ADHOC` edge v → u, if any
- `PRIOR_SPEED`, if a `SPEED_DATE` edge v → u exists, plus 1 in the slot matching v's `act` answer (yes → `c_pos`, maybe → `c_neu`, no → `c_neg`)

If none of these exist, there is no tie and all three probabilities are 0, so there is no influence path.

```
p_pos = c_pos / (c_pos + c_neu + c_neg)    (likewise p_neu and p_neg)
```

These are computed in Python from one Cypher read of all tie evidence. They are not stored as a separate edge type.

### 3.3 Competence per attendee and topic

**Cold-start prior.** Start at 0.5 and take the highest applicable value:

- `SPEAKER_PRIOR` on the topics of talks they speak at
- `EXHIBITOR_PRIOR` on the topics of the exhibitor they staff
- `0.5 + SENIORITY_BOOST · seniority` on topics they registered interest in, where `seniority = min(years_exp, 20) / 20` (synthetic, 8.1)

**Learned estimate:**

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

### 3.4 From answers to learning directions

**Reduction.** For each topic asked, a rater answers two claims (4.1): `partner_taught` ("{partner} taught me something about {topic}") and `self_taught` ("I taught {partner} something about {topic}"). Each claim is True, False or Didn't come up. Reduce them to one per-topic answer:

| `partner_taught` | `self_taught` | Reduced answer |
| --- | --- | --- |
| Didn't come up (either claim) | | `SKIP` |
| True | False | `LEARNED_MORE` |
| False | True | `TAUGHT_MORE` |
| True | True | `EVEN` |
| False | False | `NEUTRAL` (came up, nobody learned) |

`NEUTRAL` counts as "came up" for interest (3.1) but behaves like `SKIP` below.

**Combination.** For a pair (u, v), where `u→v` means u was the learner and v the expert:

| u answers | v answers | Resulting edges | Reliability |
| --- | --- | --- | --- |
| SKIP/NEUTRAL | SKIP/NEUTRAL | none | none |
| any directional answer | SKIP/NEUTRAL (or the reverse) | the directional answer's direction | none |
| LEARNED_MORE | TAUGHT_MORE | u→v | agree |
| TAUGHT_MORE | LEARNED_MORE | v→u | agree |
| EVEN | EVEN | both directions | agree |
| EVEN | LEARNED_MORE or TAUGHT_MORE (or the reverse) | the non-even answer's direction | none |
| LEARNED_MORE | LEARNED_MORE | both directions (modesty) | none |
| TAUGHT_MORE | TAUGHT_MORE | both directions | disagree |

Single-answer directions:

- u's answer: LEARNED_MORE → u→v, TAUGHT_MORE → v→u, EVEN → both
- v's answer: LEARNED_MORE → v→u, TAUGHT_MORE → u→v, EVEN → both

A topic only one person was asked about uses the single-answer direction. Check-ins (3.10) ask only `partner_taught`: True reduces to `LEARNED_MORE`, False to `NEUTRAL`, Didn't come up to `SKIP`. Write each resulting direction as a `LEARNED_FROM_T{k}` edge from learner to expert.

Unit-test every row of both tables.

### 3.5 Rater reliability

```
r(u) = rel_a / (rel_a + rel_b)      prior: (rel_a, rel_b) = REL_PRIOR
```

"Agree" adds 1 to `rel_a` for both people. "Disagree" adds 1 to `rel_b` for both. Reliability is used in question scoring (4.1). Votes stay unweighted for PageRank.

### 3.6 Likability

```
like(u) = like_a / (like_a + like_b)      prior: (like_a, like_b) = LIKE_PRIOR
```

Each `meet_again` answer about u, from a date or a check-in, adds 1 to `like_a` (yes) or `like_b` (no). Likability feeds pairing (4.2) and micro-influencer selection (4.3).

### 3.7 Predicted enjoyment of a pair

```
enjoy(u,v) = (cos(interest_u − mean, interest_v − mean) + like(v)) / 2
```

Interests are centered on the population mean before the cosine: raw interest vectors are all positive, so their plain cosine is close to 1 for every pair and can't tell pairs apart. (Measured on session 0 with the simulator: centering lifts expected "meet again" from +1 point over random pairing to +9 points.)

At cold start `like` sits at its prior for everyone, so this is driven by interest overlap. As `meet_again` answers accumulate, people others enjoy talking to rise.

### 3.8 POS_TIE rebuild, at every date close

1. `MATCH ()-[p:POS_TIE]->() DELETE p`
2. Compute `p_pos(u→v)` from 3.2 for every ordered pair with tie evidence.
3. Create `POS_TIE (u→v {p_pos})` wherever `p_pos ≥ POS_THRESH`.

Negative ties never get their own type. Queries filter on `p_neg` computed in Python.

### 3.9 Structure features on POS_TIE, at every date close

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

### 3.10 Ad-hoc check-ins (QR scans)

`ADHOC` starts empty. When attendee a scans attendee b's QR code:

1. Create the `ADHOC` edge pair, or increment `count`, and set `last_tick` to the current tick.
2. Prompt **both** people with 2–3 questions about the other (4.1, check-in variant), stored on their outgoing `ADHOC` edge.
3. Apply answers as they arrive: the topic claim through 3.4 and 3.1, `act` into the tie counts (3.2), `meet_again` into likability (3.6). Check-ins don't write reliability.

**Synthetic encounters (demo).** At every date close, generate `ADHOC_PER_TICK` random encounters among all 1,000 attendees. Pick a with uniform probability; pick b with weights 3 for a LinkedIn tie, 2 for a shared top-interest topic, 1 otherwise. The simulator (8.2) answers both sides. Check-in effects become visible in the graph at the next date close.

---

## 4. Applications

### 4.1 Agentic questions, per rater per date

Each rater gets an attendance check, then **6–8 questions** after a date:

0. **"Did you meet {partner}?"** Yes, we met / We didn't meet. "We didn't meet" completes the survey immediately and writes nothing to the graph: no edges, no interest, likability, reliability or tie evidence. A no-show is not a judgment of either person.
1. **4–6 generated true/false questions** on 2–3 topics, chosen by the algorithm below and phrased by Claude.
2. **Two fixed questions**, asked last to limit spillover from liking:
   1. "Would you act on {partner}'s recommendation?" Yes / Maybe / No, stored as `act`.
   2. "Would you like to meet {partner} again?" Yes / No, stored as `meet_again`.

**What to ask (algorithm, `questions.py`).**

Candidate topics for rater u about partner v:

- the top 3 topics by `interest` for u
- the top 3 topics by `interest` for v
- the top 3 topics by `comp` for v
- the `RELATED` neighbors of all of these, from the content graph

Score for topic k:

```
plaus_k  = (interest_k(u) + interest_k(v)) / 2                      did it likely come up?
p_hat    = 1 / (1 + exp(−(s_k(v) − s_k(u))))                         Bradley–Terry on log-ratio scores
H(p)     = −p·ln(p) − (1−p)·ln(1−p)
IG_k     = H(p_hat) · (comp_unc_k(u) + comp_unc_k(v)) / 2
demand_k = Σ(vendors) profile[k], normalized so the maximum is 1
score_k  = plaus_k · (W_BASE + demand_k) · r(u) · IG_k
```

Take topics in score order, skipping a topic if a `RELATED` neighbor was already taken with a higher score (a cheap diversity rule). Stop at `Q_MAX_TOPICS` topics, or earlier once at least `Q_MIN_TOPICS` are taken and the next score is below `ATTENTION_COST`. Each chosen topic gets both claims, `partner_taught` and `self_taught` (3.4).

**How to ask (Claude, `llm.py`).** One call per rater per date, with:

- rater and partner context: name, company, title, business type, top interests
- the chosen targets: `[{topic_id, topic_name, claim}]`

Claude returns JSON `[{question_id, topic_id, claim, text}]`, one entry per target, phrasing each claim as a natural statement specific to the pair (e.g. "Maria showed me a dough fermentation trick I'd actually try in my shop"). The server validates that the targets match exactly what was requested. On a timeout, error or mismatch, it falls back to template text ("{partner} taught me something about {topic}"). Answers are mapped through the requested `claim`, never the generated text, so phrasing can't corrupt the graph.

Questions are generated when a date opens (all pairs are known then), while the 15-minute date runs. Claude phrases questions only for raters selected by `LLM_MODE` (default: the human raters in the live demo, concurrently, up to 20 at a time); everyone else gets template text, so fast-forwarding never waits on the API. They are stored on the rater's `SPEED_DATE` edge in `questions`.

**Survey lifecycle** (`app/surveys.py`, shared by dates and check-ins). The question set is fixed once generated. Answers can be saved one at a time (save on tap) or in a batch; each save returns the updated survey. Answers are keyed by `question_id`, so re-sending an identical answer is a no-op (safe retries) and a changed answer bumps `survey_revision`. `current_question_id` is the first unanswered question in order; `complete` is true once every required question is answered or the rater said they didn't meet. Both participants' surveys share one `meeting_id`.

**"Didn't come up" is always an option** on every generated question, so the answers are always True / False / Didn't come up. Without it, "False" can't separate "they didn't teach me" from "we never discussed it". Each question carries a `why` object (`score`, `ig`, `plausibility`) that drives the hero visual.

**Check-in variant (3.10).** 2–3 questions: one generated `partner_taught` claim on the top-scoring topic (omitted if its score is below `ATTENTION_COST`), then `act` and `meet_again`. Same scoring, same Claude call shape, same fallback.

### 4.2 Pairing, at session open

When a session opens, plan its 4 dates in order, d = 0..3. The schedule is fixed once planned.

**Value of meeting v, for u:**

```
teach_u(v)    = Σ_k comp_k(v) · interest_k(u) / Σ_k interest_k(u)
bridge(u,v)   = 1 if tribe(u) ≠ tribe(v), else 0
familiar(u,v) = 1 if a LINKEDIN or ADHOC edge exists between them, else 0
explore(u,v)  = mean of IG_k over the pair's 3 most plausible topics
V_u(v)        = teach_u(v) + ENJOY·enjoy(u,v) + BETA·bridge − MU·familiar + LAMBDA·explore
```

**For each date d:**

1. **Split.** Randomly split the session's attendees into two equal halves A and B. If the headcount is odd, one person sits out this date: the one with the fewest `sat_out`, ties broken at random.
2. **Feasible pairs** (u in A, v in B):
   - They have never had a `SPEED_DATE` (any earlier session, or an earlier date of this session's plan).
   - `p_neg(u→v) < NEG_THRESH` and `p_neg(v→u) < NEG_THRESH`.
3. **Score** each pair by `w(u,v) = min(V_u(v), V_v(u))`, so both people must get value.
4. **Floor matching.** The target size is `K = |A|`. Binary-search the sorted distinct `w` values for the largest τ at which maxFlow, run over `CAP` edges for pairs with `w ≥ τ`, equals K. For each τ:
   - Delete the A → B `CAP` edges in `match_scratch` and recreate them for pairs with `w ≥ τ`.
   - Run:
     ```cypher
     MATCH (s:Source), (t:Sink)
     CALL algo.maxFlow({sourceNodes: [s], targetNodes: [t], capacityProperty: 'cap', relationshipTypes: ['CAP']})
     YIELD edges, edgeFlows, maxFlow
     RETURN [i IN range(0, size(edges) - 1) | [startNode(edges[i]).id, endNode(edges[i]).id, edgeFlows[i]]] AS flows, maxFlow
     ```
   - The matching is the A → B edges with flow 1.
   If no τ reaches K, use the largest maxFlow found at the lowest τ; unmatched people sit out this date.
5. **Refine above the floor τ*.** Run a greedy pass over pairs with `w ≥ τ*`, sorted by `w + DELTA·(deficit_u + deficit_v)` descending, taking a pair if both people are still free. If it matches as many pairs as maxFlow did, use it; otherwise use the maxFlow matching.
6. **Fairness.** `deficit_u = max(0, mean(cum_value) − cum_value_u)`. After planning date d, `cum_value_u += V_u(partner)` before planning d + 1.

The random split means each date sees about half of the possible pairs. That is accepted for the hackathon; a cheap upgrade if time allows is to try a few random splits per date and keep the one with the highest floor τ*.

After planning, create the `SPEED_DATE` edges for all 4 dates (both directions, `complete = false`).

### 4.3 Micro-influencers, per topic or vendor

**The use case.** An exhibitor or sponsor is hosting a party or event for their topic, and knowing whom to invite is hard. Instead of cold invites, the host gives a bundle of tickets to a few **micro-influencers**: attendees who are **competent** in the topic, **well liked**, and **well connected to receptive people**. The micro-influencers hand the tickets to people they think should come, so invitations travel through trusted relationships and reach the right people organically.

"Micro" means influential within a topic's circles, not the show's most famous names. Reach counts only ties to people interested in the topic, and each pick is scored by the *new* targets it adds, so the host gets several well-placed people in different circles rather than a cluster of friends who would all invite the same crowd.

**Event profile x** (sums to 1): either a single topic (one-hot, e.g. a "Dough & Flour" party) or a vendor's `profile`.

```
interest_x(v) = Σ_k x_k · interest_k(v)
comp_x(u)     = Σ_k x_k · comp_k(u)
p_x(u→v)      = p_pos(u→v) · comp_x(u) · like(u) · interest_x(v)     for pairs with tie evidence, else 0
```

`p_x(u→v)` reads as "if u hands v a ticket, how likely is v to come?": v trusts u's recommendations (`p_pos`), u knows the topic (`comp_x`), people enjoy u (`like`), and v cares about the topic (`interest_x`).

**Targets** (people worth inviting): attendees with `interest_x(v) ≥ TARGET_MIN` who don't have this vendor in `reached`, excluding the vendor's own staff.

**Candidates** (possible ticket holders): attendees, excluding the vendor's own staff, who meet all of:

- `comp_x(u) ≥ CRED_MIN`
- `like(u) ≥ LIKE_MIN`
- backfire `bf(u) = Σ(v in targets) p_neg(u→v)` is below `BACKFIRE_MAX`

**Expected reach** (expected number of targets who receive a ticket and come), one hop, in closed form:

```
σ(S) = Σ(v in targets) [ 1 − Π(u in S) (1 − p_x(u→v)) ]
```

This is monotone submodular: a second influencer whose friends overlap the first's adds little.

**Selection:** pick `N_INFLUENCERS` people greedily. Repeatedly add the candidate with the largest marginal reach `Δσ = σ(S ∪ {u}) − σ(S)`, stopping early if no candidate adds positive reach. For monotone submodular σ this greedy is within 63% (1 − 1/e) of the best possible set.

**Explanation per micro-influencer** ("why invite them"):

- competence: `comp_x(u)` and the evidence count `m`
- likability: `like(u)` and the number of `meet_again` answers behind it
- connections: marginal reach, and the top 5 targets they'd likely bring with their `p_x`
- `tribe`, `broker` and `reach` (which circle they open up, and how far it extends)

Off by default, for later: a discounted second hop through `POS_TIE`.

---

## 5. Session lifecycle

A session is OPEN → its 4 dates run in turn → CLOSED. Each date is OPEN → (answers arrive) → CLOSED.

- **`POST /sessions/{s}/open`** labels the session's attendees `InSession`, plans all 4 dates (4.2), creates the `SPEED_DATE` edges and emits SSE `session_opened`. Date 0 opens automatically.
- **Opening a date** generates questions for every rater in it (4.1) and emits `date_opened`.
- **Answers** flow through `GET .../questions` and `POST .../answers` per rater. Each submission emits `answer_recorded`.
- **`POST /sessions/{s}/dates/{d}/close`** runs the date pipeline, then opens the next date:
  1. For each meeting, reduce and combine the answers per topic (3.4). Write the `LEARNED_FROM_T{k}` edges, and update reliability (3.5), likability (3.6) and interests (3.1).
  2. For the touched topics, recompute PageRank, `m`, `comp` and `comp_unc` (3.3), and write the caches.
  3. Rebuild `POS_TIE` (3.8), then recompute tribes, brokers and reach (3.9).
  4. Compute metrics (section 8.3), then emit `date_closed` with the metrics and the nodes and edges that changed.
  5. Generate the next batch of synthetic check-ins (3.10) and have the simulator answer them.
- **After date 3 closes**, the session closes: recompute micro-influencers (4.3), remove `InSession` and emit `session_closed`.
- **Check-ins** can arrive at any time through `POST /checkins`; each emits `checkin_recorded`.
- **`POST /admin/simulate/sessions/{s}/dates/{d}`** answers every incomplete meeting in that date through the simulator, using the same questions and answer path. This lets the demo run many sessions quickly while a human answers one meeting live.

---

## 6. REST API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | FalkorDB ping |
| POST | `/admin/seed` | Load data, synthesize missing fields, create indexes, set cold-start priors |
| POST | `/admin/reset` | Drop and recreate the graphs |
| POST | `/admin/simulate/sessions/{s}/dates/{d}` | Simulator answers all incomplete, non-human meetings in a date |
| POST | `/admin/fast_forward?to_session=N` | Seed if needed, then simulate every session before N |
| GET/PUT | `/admin/humans` | Raters answered by people in the live demo: the simulator skips them and their questions are Claude-phrased |
| GET | `/questions/latest` | Most recently generated question with its `why`, for the graph view's side panel |
| GET | `/topics` | Topics |
| GET | `/talks` | Talks with topic weights |
| GET | `/vendors` | Vendors |
| GET | `/attendees` | Attendee summaries |
| GET | `/attendees/{id}` | Interests, competence, uncertainty, likability, tribe, tie summary |
| GET | `/sessions` | All 15 sessions with slot times, headcounts and state |
| POST | `/sessions/{s}/open` | Plan the session's 4 dates and open date 0 |
| GET | `/sessions/{s}` | The 4-date plan with pair values, completion status |
| GET | `/sessions/{s}/dates/{d}/meetings/{rater_id}/questions` | This rater's survey: questions, saved answers, current question, revisions |
| POST | `/sessions/{s}/dates/{d}/meetings/{rater_id}/answers` | Save one or more answers; returns the updated survey |
| POST | `/sessions/{s}/dates/{d}/close` | Run the date pipeline; returns metrics |
| POST | `/checkins` | QR check-in `{scanner_id, scanned_id}`: creates or bumps `ADHOC`, returns both people's question sets |
| GET | `/checkins/{rater_id}/{partner_id}/questions` | This rater's check-in questions |
| POST | `/checkins/{rater_id}/{partner_id}/answers` | Submit check-in answers |
| GET | `/graph/topics/{topic_id}` | Nodes (`comp_k`, `comp_unc_k`, `tribe`, `like`) and `LEARNED_FROM_T{k}` edges, for the visual |
| GET | `/graph/ties` | `POS_TIE` edges and tribes |
| GET | `/topics/{topic_id}/experts?limit=5` | Top people for a topic, ranked by `comp − RANK_UNC_PENALTY · comp_unc` (peer-confirmed competence outranks an unconfirmed prior), with a display-safe reason and evidence each |
| GET | `/topics/{topic_id}/influencers` | Micro-influencers for a topic event, with explanations |
| GET | `/vendors/{id}/influencers` | Micro-influencers for a vendor's event, with explanations |
| GET | `/metrics` | Per-date learning and matching-quality metrics |
| GET | `/events` | SSE stream: `session_opened`, `date_opened`, `answer_recorded`, `date_closed`, `session_closed`, `checkin_recorded` |

Payload sketches:

Authoritative schema: `backend/openapi.json` (or `GET /openapi.json` on a running backend).

```json
{
  "meeting_id": "s3-d1-PE27-00001-PE27-00288",
  "rater_id": "PE27-00001",
  "partner": {"id": "PE27-00288", "name": "Maria Lopez", "company": "Lopez Pizzeria", "title": "Owner"},
  "context": "date",
  "phrased_by": "claude",
  "graph_revision": 13,
  "survey_revision": 1,
  "complete": false,
  "current_question_id": "q1",
  "answers": {"met": "yes"},
  "questions": [
    {"question_id": "met", "version": 1, "kind": "met", "required": true, "text": "Did you meet Maria?",
     "options": [{"value": "yes", "label": "Yes, we met"}, {"value": "no", "label": "We didn't meet"}]},
    {
      "question_id": "q1",
      "version": 1,
      "kind": "claim",
      "required": true,
      "topic_id": "dough-flour",
      "claim": "partner_taught",
      "text": "Maria showed me a dough fermentation trick I'd actually try in my shop.",
      "options": [
        {"value": "true", "label": "True"},
        {"value": "false", "label": "False"},
        {"value": "skip", "label": "Didn't come up"}
      ],
      "why": {"score": 0.21, "ig": 0.34, "plausibility": 0.62}
    },
    {"question_id": "act", "kind": "act", "text": "Would you act on Maria's recommendation?",
     "options": [{"value": "yes"}, {"value": "maybe"}, {"value": "no"}]},
    {"question_id": "meet_again", "kind": "meet_again", "text": "Would you like to meet Maria again?",
     "options": [{"value": "yes"}, {"value": "no"}]}
  ]
}
```

```json
{"answers": [{"question_id": "q1", "value": "true"}]}
```

---

## 7. Frontend

Pages:

- **SessionConsole:** pick a session, open it, see the 4-date plan with pair values, run the simulator on a date, close dates.
- **MeetingFlow:** phone-sized. Shows one question at a time for one rater, with the partner's name. Also handles check-ins: shows "my QR code" and a "scan" button (for the demo, scanning is picking an attendee from a list).
- **GraphView:**
  - A topic selector, and a force-directed graph of one `LEARNED_FROM_T{k}` layer.
  - Node size is `comp_k`, ring opacity is `comp_unc_k`, and color is `tribe`.
  - Arrows run from learner to expert, and edges added this date (latest `tick`) are highlighted.
  - A side panel shows the metrics chart (8.3) and the last generated question with its `why`.
- **Influencers:** pick a topic or vendor event and see who to give tickets to: each micro-influencer's competence, likability, expected reach and the targets they'd likely bring.

Libraries:

- `react-force-graph-2d` for the graph
- `recharts` for charts
- `EventSource` for SSE
- `openapi-typescript` for API types

FalkorDB's Canvas web component is an alternative for the graph view if time allows.

---

## 8. Data, synthetic fields and simulator

### 8.1 Source data and synthesized fields

From `data/` (see its README):

| File | Feeds |
| --- | --- |
| `program/topics.json` | `Topic` nodes; list order defines `idx` |
| `program/sessions.json` | `Talk` nodes, `ABOUT` edges, speakers (`is_speaker`, `speaker_topics`) |
| `program/exhibitors.json` | `Vendor` nodes, `TARGETS` edges, `profile`; `staff` sets attendees' `exhibitor_id` |
| `program/session_signups.csv` | cold-start interest (3.1) |
| `program/booth_scans.csv` | cold-start interest (3.1) |
| `pizza_expo_attendees_enriched.json` | `Attendee` nodes: registration fields, registered interests, LinkedIn company and `people_also_viewed` |

Google Maps data is not used.

Synthesized by `seed.py` with a fixed random seed (`RNG_SEED`), so every run builds the same graph:

- **`years_exp`:** drawn per attendee, skewed by title (owner/founder/VP/chef higher, intern/associate lower).
- **`LINKEDIN` network,** 5–10 ties per person, with community structure:
  1. coworkers (same company) are tied
  2. `people_also_viewed` links that resolve to another attendee are tied
  3. the rest is filled at random, 70% within the same primary registered topic or business type and 30% anywhere
- **Speed-dating attendance:** each attendee gets a propensity drawn from a Gamma distribution (shape 5) so attendance is uneven, then each of the 15 sessions samples `SESSION_SIZE` attendees by propensity. Mean 3 sessions per person; most attend 2–4, about 80 attend none, the maximum is about 11.

### 8.2 Simulator

There is no hidden ground truth in the graph or the metrics. The simulator keeps its own private latent profile per attendee, derived from the same signals as the priors plus noise, purely so simulated answers are coherent rather than random:

- **latent expertise** per topic: from `comp_prior` plus noise, sparse (1–3 strong topics)
- **latent interest** per topic: from `interest` plus noise
- **talkativeness** and **modesty**: random per attendee

Simulated date or check-in (u, v):

- **Topics discussed:** up to 3 distinct topics, sampled with probability proportional to `interest_u + interest_v` (latent).
- **Outcome per discussed topic k:** `d = e_v − e_u + KAPPA · (talk_v − talk_u) + noise(SIGMA)`. EVEN if `|d| < EPS`; if `d > 0` u learned more, otherwise v learned more.
- **Claims:** answer `partner_taught` and `self_taught` consistently with the outcome. Topics not discussed get "didn't come up". With probability `modesty` a rater claims `partner_taught = True`; with probability `P_FORGET` they answer "didn't come up" on a discussed topic.
- **`act` (v about u):** `rapport = cosine(latent interest_u, latent interest_v) + charm_u + noise(0.2)`, where `charm` is a small latent likability term per attendee. Yes if rapport > 0.6, maybe if > 0.3, else no. With probability `P_CLASH`, no regardless.
- **`meet_again`:** yes if rapport > 0.45.

Simulator constants: `KAPPA = 0.15`, `SIGMA = 0.1`, `EPS = 0.08`, `P_FORGET = 0.1`, `P_CLASH = 0.05`.

### 8.3 Metrics

Without ground truth, metrics show that the graph is learning and the matcher is improving. Computed after every date:

- **Uncertainty:** mean `comp_unc` across attendees and topics. It should fall.
- **Coverage:** fraction of attendee-topic cells with `m_k > 0`.
- **Stability:** Spearman correlation of `comp_k` rankings with the previous date's, averaged over topics. It should rise as estimates settle.
- **Match quality:** `meet_again` yes rate and `act` yes rate per date. These should rise across sessions as pairing learns likability.

---

## 9. Config constants

All values are starting guesses, kept in `config.py` and tuned during the build.

| Name | Default | Used in |
| --- | --- | --- |
| `T` | 10 | everywhere |
| `N_SESSIONS`, `SESSIONS_PER_DAY` | 15, 5 | 0, 3.10 |
| `DATES_PER_SESSION`, `DATE_MINUTES` | 4, 15 | 0, 4.2 |
| `SESSION_SIZE` | 200 | 8.1 |
| `RNG_SEED` | 42 | 8.1, 4.2 |
| `A0`, `B0` | 1.0, 2.0 | 3.1 |
| `S_REG`, `S_SIGNUP`, `S_SCAN` | 1.0, 1.0, 0.25 | 3.1 |
| `S_DISCUSS`, `S_LEARNER` | 0.5, 0.5 | 3.1 |
| `PRIOR_LINKEDIN` | (0.5, 1.5, 0.05) | 3.2 |
| `PRIOR_ADHOC` | (1.0, 1.0, 0.05) | 3.2 |
| `PRIOR_SPEED` | (1.0, 1.0, 1.0) | 3.2 |
| `GAMMA` | 1.0 | 3.3 |
| `W0` | 2.0 | 3.3 |
| `SPEAKER_PRIOR`, `EXHIBITOR_PRIOR` | 0.8, 0.7 | 3.3 |
| `SENIORITY_BOOST` | 0.2 | 3.3 |
| `RANK_UNC_PENALTY` | 0.3 | 6: expert ranking |
| `REL_PRIOR` | (2, 1) | 3.5 |
| `LIKE_PRIOR` | (1, 1) | 3.6 |
| `POS_THRESH`, `NEG_THRESH` | 0.4, 0.4 | 3.8, 4.2 |
| `Q_MIN_TOPICS`, `Q_MAX_TOPICS` | 2, 3 | 4.1 |
| `ATTENTION_COST` | 0.02 | 4.1 |
| `W_BASE` | 1.0 | 4.1 |
| `LLM_MODEL` | `claude-opus-5-5` | 4.1 |
| `LLM_MODE` | `humans` | 4.1: who gets Claude phrasing (`humans`, `all`, `off`); everyone else gets templates |
| `LLM_TIMEOUT_S` | 20 | 4.1 |
| `ENJOY`, `BETA`, `MU`, `LAMBDA` | 0.5, 0.2, 0.3, 0.3 | 4.2 |
| `DELTA` | 0.2 | 4.2 |
| `ADHOC_PER_TICK` | 100 | 3.10 |
| `TARGET_MIN`, `CRED_MIN`, `LIKE_MIN` | 0.4, 0.55, 0.5 | 4.3 |
| `N_INFLUENCERS` | 5 | 4.3 |
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
- `algo.HarmonicCentrality` is approximate and treats edges as directed. It raises an error if a named label or relationship type doesn't exist yet, so skip it until `POS_TIE` has edges. Likewise, run PageRank only for topic layers that have at least one `LEARNED_FROM_T{k}` edge.
- `algo.maxFlow` adds a virtual super-source and super-sink with unlimited capacity when given several sources or sinks. That would let one person match several partners, so matching uses explicit `Source` and `Sink` nodes with capacity-1 edges (2.4).

**Query construction:**

- Relationship type names can't be parameterized in patterns. Build `LEARNED_FROM_T{k}` from whitelisted integers (`cypher.learned_from`), never from user input or string topic ids.
- If a pattern never references a relationship's alias, FalkorDB only checks that at least one matching edge exists. Reference the alias whenever you count edges.
- Verify on first use: multi-type patterns such as `[r:LINKEDIN|ADHOC|SPEED_DATE]`, and empty-list properties. If either misbehaves, run one query per type, or seed lists with a placeholder.

**Storage:**

- Each graph is a separate key, and there are no cross-graph queries. Join on topic indices in Python.
- Store symmetric relationships as two directed edges.
- Store question sets and answer maps as JSON strings.

**Key queries:**

```cypher
// Symmetric seed edges
UNWIND $pairs AS p
MATCH (a:Attendee {id: p.a}), (b:Attendee {id: p.b})
CREATE (a)-[:LINKEDIN]->(b), (b)-[:LINKEDIN]->(a)
```

```cypher
// Create the planned dates of a session
UNWIND $pairs AS p
MATCH (a:Attendee {id: p.a}), (b:Attendee {id: p.b})
CREATE (a)-[:SPEED_DATE {session: $s, date_no: p.d, tick: p.tick, complete: false, questions: '[]', answers: '{}'}]->(b),
       (b)-[:SPEED_DATE {session: $s, date_no: p.d, tick: p.tick, complete: false, questions: '[]', answers: '{}'}]->(a)
```

```cypher
// Record a rater's answers
MATCH (u:Attendee {id: $rater})-[e:SPEED_DATE {session: $s, date_no: $d}]->(v:Attendee)
SET e.answers = $answers_json, e.act = $act, e.meet_again = $meet_again, e.complete = $complete
```

```cypher
// Write votes for topic 3
UNWIND $edges AS e
MATCH (l:Attendee {id: e.learner}), (x:Attendee {id: e.expert})
CREATE (l)-[:LEARNED_FROM_T3 {session: $s, date_no: $d, tick: $tick}]->(x)
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
// Check-ins: create or increment ADHOC
UNWIND $checkins AS c
MATCH (a:Attendee {id: c.a}), (b:Attendee {id: c.b})
MERGE (a)-[x:ADHOC]->(b) ON CREATE SET x.count = 0
SET x.count = x.count + 1, x.last_tick = $tick
MERGE (b)-[y:ADHOC]->(a) ON CREATE SET y.count = 0
SET y.count = y.count + 1, y.last_tick = $tick
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

Each step is done when its check passes. About 4 hours remain. The detailed, owner-assignable version is `build_plan.md`.

1. **Infrastructure.** docker-compose with FalkorDB, backend and frontend; `/health` pings FalkorDB. *(Scaffolded.)*
   Check: `docker compose up`, then `/health` returns `ok`.
2. **Seed.** Load `data/` into the content and people graphs, synthesize `years_exp`, the LinkedIn network and session attendance, create indexes, set cold-start interests and `comp_prior`.
   Check: `GET /attendees/{id}` returns vectors; the FalkorDB Browser shows both graphs.
3. **Pure math module with unit tests:** Beta and Dirichlet updates, answer reduction and `combine_answers` (every row of both tables in 3.4), the competence blend, enjoyment, IG, σ(S) and greedy micro-influencer selection.
4. **Pairing** with per-date random split, maxFlow and refinement (4.2).
   Check: a session plan has 4 dates, no repeat pairs, and feasibility is respected.
5. **Questions** (4.1): target selection, then Claude phrasing with template fallback.
   Check: 6–8 questions per rater, each with `why`; killing the API key still yields template questions.
6. **Date-close pipeline, check-ins and simulator** (sections 5, 3.10 and 8.2). Run all 15 sessions.
   Check: `LEARNED_FROM_T{k}` and `ADHOC` edges appear, `comp` changes, `POS_TIE` is rebuilt, tribes are assigned, and uncertainty falls.
7. **Frontend:** MeetingFlow (dates and check-ins), GraphView with SSE, SessionConsole.
8. **Micro-influencers** (4.3) and the Influencers page.
9. **Demo rehearsal** (section 12).

Run in parallel where possible: the frontend can start at step 3 against mocked endpoints, and steps 3–5 are independent once seeding works.

---

## 12. Demo script (3 minutes)

1. Show the graph view of one topic layer before session 0: everyone sits near their prior, with wide uncertainty rings.
2. Open a session and show its 4-date plan. Run one date live: two people answer on their phones, and the screen shows the questions Claude phrased for them and why each target was chosen.
3. Close the date, with the simulator filling in the rest. Arrows appear, nodes resize and rings tighten.
4. Fast-forward several sessions. Uncertainty falls, rankings stabilize, and the `meet_again` rate climbs as the matcher learns who people enjoy.
5. Play a sponsor hosting a "Dough & Flour" party: open the Influencers tab and see the handful of people to give tickets to (competent, well liked, well connected), who they'd likely bring, and why.

---

## 13. Open decisions

These are parameters, not blockers.

- **Tickets per influencer:** not modeled; each influencer's reach is uncapped. Could cap it later (each holder gets a fixed number of tickets).
- **Question generation:** the algorithm picks targets and Claude only phrases them. We may later let Claude propose additional claim types (e.g. "came up but too basic for me"), as long as each maps to a defined graph update.
- **Vendor visibility** (`VENDOR_SEES_NAMES`, default false): vendors see reach by tribe, plus only the names of attendees who opted in.
- **Second hop for influence:** off by default.
- **Smarter bipartite split:** best-of-N random splits per date, if time allows.
