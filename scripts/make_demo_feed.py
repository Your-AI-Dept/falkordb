"""Record a demo feed for the graph page: 15 simulated speed-dating sessions plus ad-hoc check-ins, as backend events.

  python3 scripts/make_demo_feed.py      # reads data/, writes graph-view/public/demo/feed.json.gz

The page's demo mode replays this file through the same code path as the backend's live SSE events,
so the page works before the backend exists. The simulation follows design_doc.md: seed data and
cold-start priors (3.1, 3.3, 8.1), pairing at session open (4.2), question targets (4.1), the
date-close pipeline (section 5) and synthetic check-ins (3.10), with answers from the simulator's
private latent profile (8.2) and the metrics in 8.3. Simplifications: pairing uses only the greedy
refinement pass (no maxFlow floor), questions skip RELATED topic neighbors and use template text,
and label propagation treats POS_TIE as undirected. It is a stand-in, not the backend's implementation.
"""
import csv
import gzip
import itertools
import json
import math
import os
import random
import re
import time
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "graph-view", "public", "demo", "feed.json.gz")  # gzipped: about a tenth of the size

N_SESSIONS, DATES, SESSION_SIZE = 15, 4, 200
DATE_SECONDS, SESSION_GAP = 20, 4  # playback seconds at 1x speed
# Design doc constants (section 9 and backend/app/config.py)
A0, B0 = 1.0, 2.0
S_REG, S_SIGNUP, S_SCAN, S_DISCUSS, S_LEARNER = 1.0, 1.0, 0.25, 0.5, 0.5
PRIOR_LINKEDIN, PRIOR_ADHOC, PRIOR_SPEED = (0.5, 1.5, 0.05), (1.0, 1.0, 0.05), (1.0, 1.0, 1.0)
GAMMA, W0, SPEAKER_PRIOR, EXHIBITOR_PRIOR, SENIORITY_BOOST = 1.0, 2.0, 0.8, 0.7, 0.2
REL_PRIOR, LIKE_PRIOR, POS_THRESH, NEG_THRESH = (2, 1), (1, 1), 0.4, 0.4
ADHOC_PER_TICK = 100
Q_MIN_TOPICS, Q_MAX_TOPICS, ATTENTION_COST, W_BASE = 2, 3, 0.02, 1.0
ENJOY, BETA, MU, LAMBDA, DELTA = 0.5, 0.2, 0.3, 0.3, 0.2
DAMPING, LPA_ITERATIONS = 0.85, 10
# Simulator (8.2)
KAPPA, SIGMA, EPS, P_FORGET, P_CLASH = 0.15, 0.1, 0.08, 0.1, 0.05
# years_exp (8.1): title words that skew experience down or up
JUNIOR = {"intern", "associate", "assistant", "coordinator", "rep", "representative", "trainee", "junior"}
SENIOR = {"owner", "founder", "ceo", "president", "vp", "chef", "director", "partner", "proprietor", "principal", "chief", "head"}
SLOT = {"yes": 0, "maybe": 1, "no": 2}
TEMPLATE = {"partner_taught": "{name} taught me something about {topic}.", "self_taught": "I taught {name} something about {topic}."}
REDUCE = {("true", "false"): "LEARNED_MORE", ("false", "true"): "TAUGHT_MORE", ("true", "true"): "EVEN", ("false", "false"): "NEUTRAL"}
SINGLE = {"LEARNED_MORE": {"uv"}, "TAUGHT_MORE": {"vu"}, "EVEN": {"uv", "vu"}}  # u's answer; "uv" = u learned from v
R = random.Random(42)


def load(*path):
    return json.load(open(os.path.join(DATA, *path), encoding="utf-8"))


def rows(name):
    return list(csv.DictReader(open(os.path.join(DATA, "program", name), encoding="utf-8")))


def sigmoid(x):
    return 1 / (1 + math.exp(-x))


def entropy(p):
    p = min(max(p, 1e-6), 1 - 1e-6)
    return -p * math.log(p) - (1 - p) * math.log(1 - p)


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)) or 1)


def num(x, digits=2):
    """Round for the feed; whole numbers drop the '.0' to keep the file small."""
    x = round(x, digits)
    return int(x) if x == int(x) else x


def spearman(xs, ys):
    def ranks(values):  # average ranks, so tied values (most priors) don't fake agreement
        order = sorted(range(len(values)), key=values.__getitem__)
        out, i = [0.0] * len(values), 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
                j += 1
            for q in order[i:j + 1]:
                out[q] = (i + j) / 2
            i = j + 1
        return out
    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    sd = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return cov / sd if sd else 0.0


def firm(company):
    """Company as typed, normalized so 'Nonna Pizza Bar LLC' and 'nonna pizza bar' match."""
    return " ".join(w for w in re.sub(r"[^a-z0-9]+", " ", company.lower()).split() if w not in ("llc", "inc"))


def reduce_claims(partner_taught, self_taught):
    """Table 3.4: one rater's two claims on a topic -> SKIP, LEARNED_MORE, TAUGHT_MORE, EVEN or NEUTRAL."""
    return "SKIP" if "skip" in (partner_taught, self_taught) else REDUCE[partner_taught, self_taught]


def combine(au, av):
    """Table 3.4 for pair (u, v): directions ("uv" = u learned from v) and reliability (1 agree, -1 disagree, 0 none)."""
    du, dv = SINGLE.get(au, set()), {d[::-1] for d in SINGLE.get(av, set())}  # v's answer seen from u's side
    if not du or not dv:
        return du | dv, 0
    if "EVEN" in (au, av):
        return (du, 1) if au == av else (dv if au == "EVEN" else du, 0)
    if du == dv:
        return du, 1
    return {"uv", "vu"}, -1 if au == "TAUGHT_MORE" else 0  # TAUGHT/TAUGHT disagree, LEARNED/LEARNED is modesty


def pagerank(n, edges, pr):
    """Power iteration over all n attendees (dangling mass spread uniformly), warm-started from pr."""
    out, ins = [0] * n, defaultdict(list)
    for a, b in edges:
        out[a] += 1
        ins[b].append(a)
    for _ in range(200):
        dangling = sum(p for p, o in zip(pr, out) if not o)
        new = [(1 - DAMPING + DAMPING * dangling) / n] * n
        for b, sources in ins.items():
            new[b] += DAMPING * sum(pr[a] / out[a] for a in sources)
        delta = sum(abs(x - y) for x, y in zip(new, pr))
        pr = new
        if delta < 1e-8:
            break
    return pr


def label_propagation(pos, previous):
    """Communities on POS_TIE (undirected), biggest first, reusing the previous id each one overlaps most."""
    adj = defaultdict(set)
    for a, b in pos:
        adj[a].add(b)
        adj[b].add(a)
    nodes = sorted(adj)
    label = {u: u for u in nodes}
    for _ in range(LPA_ITERATIONS):
        R.shuffle(nodes)
        for u in nodes:
            counts = Counter(label[v] for v in adj[u])
            top = max(counts.values())
            if counts[label[u]] != top:
                label[u] = R.choice([x for x, c in counts.items() if c == top])
    groups = defaultdict(list)
    for u in sorted(adj):
        groups[label[u]].append(u)
    groups = sorted(groups.values(), key=len, reverse=True)
    ids, taken = [None] * len(groups), set()
    for j, group in enumerate(groups):
        for t, _ in Counter(previous[u] for u in group if previous[u] >= 0).most_common():
            if t not in taken:
                ids[j] = t
                taken.add(t)
                break
    fresh = (t for t in itertools.count() if t not in taken)
    tribe = [-1] * len(previous)
    for j, group in enumerate(groups):
        ids[j] = next(fresh) if ids[j] is None else ids[j]
        for u in group:
            tribe[u] = ids[j]
    return tribe


def main():
    started = time.time()
    topics, talks = load("program", "topics.json"), load("program", "sessions.json")
    vendors, people = load("program", "exhibitors.json"), load("pizza_expo_attendees_enriched.json")
    T, n = len(topics), len(people)
    k_of = {t["topic_id"]: k for k, t in enumerate(topics)}
    k_of_name = {t["name"]: k for k, t in enumerate(topics)}
    ids = [p["attendee_id"] for p in people]
    ix = {a: i for i, a in enumerate(ids)}
    reg = [p["registration"] for p in people]

    # Content (2.1): talk and vendor weights split 1 evenly across their topics
    split = lambda topic_ids: [topic_ids.count(t["topic_id"]) / len(topic_ids) for t in topics]
    talk_vec = {t["session_id"]: split(t["topics"]) for t in talks}
    profile = {v["exhibitor_id"]: split(v["topics"]) for v in vendors}
    demand = [sum(p[k] for p in profile.values()) for k in range(T)]
    demand = [x / max(demand) for x in demand]

    # Attendees (2.2, 8.1) and the cold-start competence prior (3.3)
    registered = [[k_of_name[x.strip()] for x in (r["interests"] or "").split(";") if x.strip()] for r in reg]
    speaker_topics, staff_topics = [set() for _ in range(n)], [set() for _ in range(n)]
    for t in talks:
        for speaker in t["speakers"]:
            speaker_topics[ix[speaker["attendee_id"]]].update(k_of[x] for x in t["topics"])
    for v in vendors:
        for a in v["staff"]:
            staff_topics[ix[a]].update(k_of[x] for x in v["topics"])
    years = []
    for r in reg:
        words = set(re.findall(r"[a-z]+", r["job_title"].lower()))
        mean = 4 if words & JUNIOR else 16 if words & SENIOR else 9
        years.append(max(0, round(R.gauss(mean, mean / 3))))
    prior = [[max(0.5, SPEAKER_PRIOR * (k in speaker_topics[i]), EXHIBITOR_PRIOR * (k in staff_topics[i]),
                  (0.5 + SENIORITY_BOOST * min(years[i], 20) / 20) * (k in registered[i])) for k in range(T)] for i in range(n)]

    # Cold-start interest counts (3.1)
    int_a = [[A0 + S_REG * (k in registered[i]) for k in range(T)] for i in range(n)]
    int_b = [[B0] * T for _ in range(n)]
    for r in rows("session_signups.csv"):
        i = ix[r["attendee_id"]]
        int_a[i] = [a + S_SIGNUP * w for a, w in zip(int_a[i], talk_vec[r["session_id"]])]
    for r in rows("booth_scans.csv"):  # one row per booth an attendee was scanned at
        i = ix[r["attendee_id"]]
        int_a[i] = [a + S_SCAN * w for a, w in zip(int_a[i], profile[r["exhibitor_id"]])]
    interest = [[a / (a + b) for a, b in zip(int_a[i], int_b[i])] for i in range(n)]

    # LINKEDIN (8.1): coworkers, people_also_viewed that resolve to an attendee, then a random fill, up to 5-10 ties each
    linked, goal = [set() for _ in range(n)], [R.randint(5, 10) for _ in range(n)]

    def link(a, b):
        if a != b and len(linked[a]) < goal[a] and len(linked[b]) < goal[b]:
            linked[a].add(b)
            linked[b].add(a)
    firms = defaultdict(list)
    for i, r in enumerate(reg):
        firms[firm(r["company"])].append(i)
    for name, staff in firms.items():
        if name not in ("", "self employed"):
            for a, b in itertools.combinations(staff, 2):
                link(a, b)
    profiles = [p["linkedin_profile"] or {} for p in people]
    by_url = {p["url"].rstrip("/"): i for i, p in enumerate(profiles) if p.get("url")}
    for i, p in enumerate(profiles):
        for seen in p.get("people_also_viewed") or []:
            j = by_url.get((seen.get("profile_link") or "").rstrip("/"))
            if j is not None:
                link(i, j)
    primary = [r[0] if r else None for r in registered]
    by_topic, by_type = defaultdict(list), defaultdict(list)
    for i in range(n):
        by_topic[primary[i]].append(i)
        by_type[reg[i]["business_type"]].append(i)
    for i in R.sample(range(n), n):
        for _ in range(200):
            if len(linked[i]) >= goal[i]:
                break
            near = by_topic[primary[i]] if primary[i] is not None and R.random() < 0.5 else by_type[reg[i]["business_type"]]
            link(i, R.choice(near) if R.random() < 0.7 else R.randrange(n))
    linkedin_pairs = {(a, b) for a in range(n) for b in linked[a] if a < b}

    # Speed-dating attendance (8.1): a Gamma propensity, then each session samples about SESSION_SIZE by propensity
    propensity = [R.gammavariate(2.0, 1.0) for _ in range(n)]
    members = []
    for _ in range(N_SESSIONS):
        size = SESSION_SIZE + R.randint(-10, 10)  # weighted sampling without replacement: keep the largest random()^(1/w)
        members.append(sorted(sorted(range(n), key=lambda i: R.random() ** (1 / propensity[i]))[-size:]))
    member_sets = [set(group) for group in members]

    # The simulator's private latent profile (8.2); nothing below reads it except discuss(), claims() and rate()
    lat_e, lat_i, talk, modesty, charm = [], [], [], [], []
    for i in range(n):
        strong = sorted(range(T), key=lambda k: prior[i][k] + R.gauss(0, 0.1))[-R.randint(1, 3):]
        lat_e.append([R.uniform(0.65, 0.95) if k in strong else R.uniform(0.02, 0.25) for k in range(T)])
        lat_i.append([max(0.02, x - A0 / (A0 + B0) + R.gauss(0, 0.1)) for x in interest[i]])  # interest above the cold-start floor
        talk.append(R.random())
        modesty.append(R.uniform(0, 0.3))
        charm.append(R.gauss(0, 0.15))

    # Graph state (2.2, 2.3)
    comp, unc, m = [list(p) for p in prior], [[1.0] * T for _ in range(n)], [[0] * T for _ in range(n)]
    logr = [[0.0] * T for _ in range(n)]  # s_k(u) = ln(n * pr_k(u)), 0 while a layer is empty
    pr = [[1 / n] * n for _ in range(T)]
    rel, likes = [list(REL_PRIOR) for _ in range(n)], [list(LIKE_PRIOR) for _ in range(n)]
    tribe, cum_value, sat_out = [-1] * n, [0.0] * n, [0] * n
    layer, partners = [set() for _ in range(T)], [defaultdict(set) for _ in range(T)]  # LEARNED_FROM_T{k}, and partners for m_k
    adhoc, adhoc_act, speed_act, dated = set(), {}, {}, set()  # act dicts hold the rater's latest answer about the ratee
    tiebreak = [[R.random() for _ in range(T)] for _ in range(n)]  # random order among equal values, so low topic indexes aren't favored
    like = lambda i: likes[i][0] / sum(likes[i])
    pair = lambda a, b: (a, b) if a < b else (b, a)
    top3 = lambda values, i: sorted(range(T), key=lambda k: (-values[k], tiebreak[i][k]))[:3]
    vec = lambda values: [num(x) for x in values]
    node = lambda i: {"id": ids[i], "comp": vec(comp[i]), "comp_unc": vec(unc[i]), "interest": vec(interest[i]),
                      "m": list(m[i]), "like": num(like(i)), "tribe": tribe[i]}

    def tie(u, v):
        """3.2: (p_pos, p_neu, p_neg) for sender u and receiver v; v's act answers about u add to the counts."""
        c = [0.0, 0.0, 0.0]
        for present, counts, act in ((v in linked[u], PRIOR_LINKEDIN, None),
                                     (pair(u, v) in adhoc, PRIOR_ADHOC, adhoc_act.get((v, u))),
                                     ((v, u) in speed_act, PRIOR_SPEED, speed_act.get((v, u)))):
            if present:
                c = [x + y for x, y in zip(c, counts)]
                if act:
                    c[SLOT[act]] += 1
        total = sum(c)
        return [x / total for x in c] if total else c

    def feasible(u, v):
        """4.2: never dated, and p_neg < NEG_THRESH both ways (before a date, only LINKEDIN or ADHOC evidence can exist)."""
        if pair(u, v) in dated:
            return False
        return not (v in linked[u] or pair(u, v) in adhoc) or max(tie(u, v)[2], tie(v, u)[2]) < NEG_THRESH

    def info_gain(u, v, k):
        """4.1: IG_k = H(p_hat) * mean uncertainty, with p_hat from the PageRank log-ratios."""
        return entropy(sigmoid(logr[v][k] - logr[u][k])) * (unc[u][k] + unc[v][k]) / 2

    def targets(u, v):
        """4.1: candidate topics for rater u about partner v, best first, as (score, k, ig, plausibility)."""
        reliability = rel[u][0] / sum(rel[u])
        scored = []
        for k in set(top3(interest[u], u) + top3(interest[v], v) + top3(comp[v], v)):
            plaus = (interest[u][k] + interest[v][k]) / 2
            ig = info_gain(u, v, k)
            scored.append((plaus * (W_BASE + demand[k]) * reliability * ig, k, ig, plaus))
        return sorted(scored, reverse=True)

    def plan(group):
        """4.2: all 4 dates of a session, planned at open from the current state."""
        V = {}  # V_u(v) for every ordered pair in the session
        for j, u in enumerate(group):
            for v in group[j + 1:]:
                iu, iv = interest[u], interest[v]
                plausible = sorted(range(T), key=lambda k: -(iu[k] + iv[k]))[:3]
                shared = (BETA * (tribe[u] < 0 or tribe[u] != tribe[v])  # no POS_TIE yet counts as its own circle
                          - MU * (v in linked[u] or pair(u, v) in adhoc)
                          + LAMBDA * sum(info_gain(u, v, k) for k in plausible) / 3)
                cos = cosine(iu, iv)
                V[u, v] = sum(c * x for c, x in zip(comp[v], iu)) / sum(iu) + ENJOY * (cos + like(v)) / 2 + shared
                V[v, u] = sum(c * x for c, x in zip(comp[u], iv)) / sum(iv) + ENJOY * (cos + like(u)) / 2 + shared
        dates = []
        for _ in range(DATES):
            pool = R.sample(group, len(group))
            if len(pool) % 2:  # odd headcount: whoever has sat out least sits out
                fewest = min(sat_out[u] for u in pool)
                out = R.choice([u for u in pool if sat_out[u] == fewest])
                pool.remove(out)
                sat_out[out] += 1
            A, B = pool[:len(pool) // 2], pool[len(pool) // 2:]
            mean = sum(cum_value[u] for u in group) / len(group)
            deficit = {u: max(0.0, mean - cum_value[u]) for u in group}
            options = sorted(((min(V[u, v], V[v, u]) + DELTA * (deficit[u] + deficit[v]), u, v)
                              for u in A for v in B if feasible(u, v)), reverse=True)
            busy, pairs = set(), []
            for _, u, v in options:  # greedy refinement pass
                if u not in busy and v not in busy:
                    busy |= {u, v}
                    pairs.append((u, v, min(V[u, v], V[v, u])))
                    dated.add(pair(u, v))
            for u, v, _ in pairs:
                cum_value[u] += V[u, v]
                cum_value[v] += V[v, u]
                speed_act[u, v] = speed_act[v, u] = None  # SPEED_DATE edges exist from session open
            dates.append(pairs)
        return dates

    def discuss(u, v):
        """8.2: up to 3 distinct topics, each mapped to who learned more (None = even)."""
        outcome = {}
        for k in sorted(set(R.choices(range(T), [a + b for a, b in zip(lat_i[u], lat_i[v])], k=3))):
            d = lat_e[v][k] - lat_e[u][k] + KAPPA * (talk[v] - talk[u]) + R.gauss(0, SIGMA)
            outcome[k] = None if abs(d) < EPS else u if d > 0 else v
        return outcome

    def claims(rater, k, outcome):
        """8.2: (partner_taught, self_taught) from the rater's side, with modesty and forgetting."""
        if k not in outcome or R.random() < P_FORGET:
            return "skip", "skip"
        learner = outcome[k]
        partner_taught = learner in (rater, None) or R.random() < modesty[rater]
        return ("true" if partner_taught else "false"), ("false" if learner == rater else "true")

    def rate(rater, partner):
        """8.2: the rater's act and meet_again answers about the partner."""
        rapport = cosine(lat_i[rater], lat_i[partner]) + charm[partner] + R.gauss(0, 0.2)
        act = "no" if R.random() < P_CLASH else "yes" if rapport > 0.6 else "maybe" if rapport > 0.3 else "no"
        return act, "yes" if rapport > 0.45 else "no"

    def record(u, v, red_u, red_v, answers_u, answers_v, checkin, tick, new_edges, touched):
        """Section 5 step 1 for one date or check-in: votes (3.4), reliability (3.5), interest (3.1), act (3.2), likability (3.6)."""
        for k in sorted(set(red_u) | set(red_v)):
            au, av = red_u.get(k, "SKIP"), red_v.get(k, "SKIP")
            directions, agreement = combine(au, av)
            if agreement and not checkin:  # check-ins don't write reliability
                for x in (u, v):
                    rel[x][0 if agreement > 0 else 1] += 1
            if au != "SKIP" or av != "SKIP":  # it came up
                for x in (u, v):
                    int_a[x][k] += S_DISCUSS
            for d in sorted(directions):
                learner, expert = (u, v) if d == "uv" else (v, u)
                int_a[learner][k] += S_LEARNER
                if (learner, expert) not in layer[k]:
                    layer[k].add((learner, expert))
                    partners[k][learner].add(expert)
                    partners[k][expert].add(learner)
                    new_edges.append({"topic_id": topics[k]["topic_id"], "source": ids[learner], "target": ids[expert], "tick": tick})
                    touched.add(k)
        for rater, ratee, (act, meet_again) in ((u, v, answers_u), (v, u, answers_v)):
            (adhoc_act if checkin else speed_act)[rater, ratee] = act
            likes[ratee][0 if meet_again == "yes" else 1] += 1

    def close(answered, tick):
        """Section 5 steps 1-3: apply answers, recompute competence on touched layers (3.3), rebuild POS_TIE (3.8) and tribes."""
        new_edges, touched = [], set()
        for meeting in answered:
            record(*meeting, tick, new_edges, touched)
        for i in {x for meeting in answered for x in meeting[:2]}:
            interest[i] = [a / (a + b) for a, b in zip(int_a[i], int_b[i])]
        for k in sorted(touched):
            pr[k] = pagerank(n, layer[k], pr[k])
            for i in range(n):
                logr[i][k] = math.log(n * pr[k][i])
                m[i][k] = len(partners[k][i])
                comp[i][k] = (W0 * prior[i][k] + m[i][k] * sigmoid(GAMMA * logr[i][k])) / (W0 + m[i][k])
                unc[i][k] = W0 / (W0 + m[i][k])
        pos = {(a, b) for x, y in linkedin_pairs | adhoc | dated for a, b in ((x, y), (y, x)) if tie(a, b)[0] >= POS_THRESH}
        tribe[:] = label_propagation(pos, tribe)
        return new_edges, pos

    def checkins(tick, t0):
        """3.10: synthetic encounters, answered now by the simulator (check-in variant), applied at the next close."""
        top = [top3(interest[i], i)[0] for i in range(n)]
        pending = []
        for _ in range(ADHOC_PER_TICK):
            a = R.randrange(n)
            b = R.choices(range(n), [0 if x == a else 3 if x in linked[a] else 2 if top[x] == top[a] else 1 for x in range(n)])[0]
            adhoc.add(pair(a, b))
            outcome, red, answers = discuss(a, b), {}, {}
            for rater, partner in ((a, b), (b, a)):
                score, k, _, _ = targets(rater, partner)[0]  # one partner_taught claim; true -> LEARNED_MORE, false -> NEUTRAL
                red[rater] = {k: reduce_claims(claims(rater, k, outcome)[0], "false")} if score >= ATTENTION_COST else {}
                answers[rater] = rate(rater, partner)
            pending.append((a, b, red[a], red[b], answers[a], answers[b], True))
            timeline.append({"t": round(R.uniform(t0, t0 + DATE_SECONDS), 2), "event": "checkin_recorded",
                             "data": {"scanner_id": ids[a], "scanned_id": ids[b], "tick": tick}})
        return pending

    snapshot = {
        "topics": [{"idx": k, "id": t["topic_id"], "name": t["name"]} for k, t in enumerate(topics)],
        "attendees": [{"id": ids[i], "name": f"{reg[i]['first_name']} {reg[i]['last_name']}", "company": reg[i]["company"],
                       "title": reg[i]["job_title"], "is_speaker": bool(speaker_topics[i]), **node(i),
                       "sessions": [s for s in range(N_SESSIONS) if i in member_sets[s]]} for i in range(n)],
        "edges": [],
        "talks": [{"id": t["session_id"], "title": t["title"], "type": t["type"],
                   "topics": [{"idx": k_of[x], "w": num(1 / len(t["topics"]))} for x in t["topics"]]} for t in talks],
        "vendors": [{"id": v["exhibitor_id"], "name": v["name"], "profile": vec(profile[v["exhibitor_id"]])} for v in vendors],
        "metrics": [], "meetings": [], "session": None, "tick": -1,
    }
    sent = [node(i) for i in range(n)]  # node payloads as last sent, to find what changed
    previous_comp = [list(c) for c in comp]
    timeline, pending = [], []
    for s in range(N_SESSIONS):
        t_s = s * (DATES * DATE_SECONDS + SESSION_GAP)
        dates = plan(members[s])
        timeline.append({"t": t_s, "event": "session_opened", "data": {
            "session": s, "attendees": [ids[i] for i in members[s]],
            "dates": [[{"a": ids[u], "b": ids[v], "value": num(w, 3)} for u, v, w in pairs] for pairs in dates]}})
        for d, pairs in enumerate(dates):
            tick, start = DATES * s + d, t_s + d * DATE_SECONDS + 0.5
            timeline.append({"t": start, "event": "date_opened", "data": {"session": s, "date": d, "tick": tick}})
            meetings, yes = [], Counter()
            for u, v, _ in pairs:
                outcome, red, rated = discuss(u, v), {}, {}
                for rater, partner in ((u, v), (v, u)):
                    red[rater], answers, picked = {}, [], []
                    for target in targets(rater, partner):
                        if len(picked) == Q_MAX_TOPICS or (len(picked) >= Q_MIN_TOPICS and target[0] < ATTENTION_COST):
                            break
                        picked.append(target)
                    for q, (score, k, ig, plaus) in enumerate(picked):
                        both = claims(rater, k, outcome)
                        red[rater][k] = reduce_claims(*both)
                        for j, (claim, value) in enumerate(zip(("partner_taught", "self_taught"), both)):
                            answer = {"question_id": f"q{2 * q + j + 1}", "kind": "claim", "topic_id": topics[k]["topic_id"],
                                      "claim": claim, "value": value}
                            if not answers:  # text and why only on the first claim, to keep the file small
                                answer["text"] = TEMPLATE[claim].format(name=reg[partner]["first_name"], topic=topics[k]["name"])
                                answer["why"] = {"score": num(score, 3), "ig": num(ig, 3), "plausibility": num(plaus, 3)}
                            answers.append(answer)
                    act, meet_again = rated[rater] = rate(rater, partner)
                    yes["act"] += act == "yes"
                    yes["meet_again"] += meet_again == "yes"
                    answers += [{"question_id": "act", "kind": "act", "value": act},
                                {"question_id": "meet_again", "kind": "meet_again", "value": meet_again}]
                    timeline.append({"t": round(R.uniform(start + 1, start + 0.75 * DATE_SECONDS), 2), "event": "answer_recorded",
                                     "data": {"source": "date", "session": s, "date": d, "tick": tick, "rater_id": ids[rater],
                                              "partner_id": ids[partner], "answers": answers}})
                meetings.append((u, v, red[u], red[v], rated[u], rated[v], False))

            # Date close (section 5): check-ins from the last close and this date's answers, then metrics (8.3)
            new_edges, pos = close(pending + meetings, tick)
            stability = sum(spearman([c[k] for c in comp], [c[k] for c in previous_comp]) for k in range(T)) / T
            previous_comp = [list(c) for c in comp]
            metrics = {"tick": tick, "session": s, "date": d, "uncertainty": sum(map(sum, unc)) / (n * T),
                       "coverage": sum(x > 0 for row in m for x in row) / (n * T), "stability": stability,
                       "meet_again_rate": yes["meet_again"] / (2 * len(pairs)), "act_rate": yes["act"] / (2 * len(pairs))}
            nodes = [node(i) for i in range(n)]
            # Only the fields that changed, as the contract allows; whole vectors were half the file
            changed = [{"id": x["id"], **{f: v for f, v in x.items() if v != y[f]}} for x, y in zip(nodes, sent) if x != y]
            sent = nodes
            t_close = start + DATE_SECONDS - 1.5
            timeline.append({"t": t_close, "event": "date_closed", "data": {
                "session": s, "date": d, "tick": tick, "metrics": {k: num(x) for k, x in metrics.items()},
                "nodes": changed, "edges": new_edges}})
            sizes = Counter(t for t in tribe if t >= 0)
            print(f"tick {tick:2d}: {len(pairs)} pairs, {2 * len(pairs)} answers, {len(new_edges)} new edges, "
                  f"uncertainty {metrics['uncertainty']:.3f}, coverage {metrics['coverage']:.3f}, stability {stability:.4f}, "
                  f"meet_again {metrics['meet_again_rate']:.2f}, act {metrics['act_rate']:.2f}, POS_TIE {len(pos)}, "
                  f"communities>=3 {sum(c >= 3 for c in sizes.values())}")
            last = s == N_SESSIONS - 1 and d == DATES - 1
            pending = [] if last else checkins(tick, t_close)
        timeline.append({"t": t_close + 0.5, "event": "session_closed", "data": {"session": s}})

    timeline.sort(key=lambda e: e["t"])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with gzip.open(OUT, "wt", encoding="utf-8") as f:
        json.dump({"note": "Simulated show: 15 speed-dating sessions and check-ins approximating the design doc, not the backend.",
                   "date_seconds": DATE_SECONDS, "snapshot": snapshot, "timeline": timeline}, f,
                  ensure_ascii=False, separators=(",", ":"))
    print(", ".join(f"{c} {e}" for e, c in Counter(e["event"] for e in timeline).items()))
    print(f"{len(timeline)} events -> {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB) in {time.time() - started:.0f} s")


if __name__ == "__main__":
    main()
