"""Load data, synthesize missing fields, create indexes, cold-start priors (design doc 2.5, 3.1, 3.3, 8.1).

Deterministic: every run with the same RNG_SEED builds the same graphs.
"""

import csv
import json
import math
import random
import time
from collections import defaultdict
from functools import lru_cache

import numpy as np

from app import cypher, db
from app.config import (
    A0,
    B0,
    CONTENT_GRAPH,
    EXHIBITOR_PRIOR,
    LIKE_PRIOR,
    MATCH_GRAPH,
    N_SESSIONS,
    PEOPLE_GRAPH,
    REL_PRIOR,
    RNG_SEED,
    S_REG,
    S_SCAN,
    S_SIGNUP,
    SENIORITY_BOOST,
    SESSION_SIZE,
    SPEAKER_PRIOR,
    T,
    settings,
)
from app.models import SeedResult
from app.topics import idx, idx_from_name, topic_descriptions, topic_ids, topic_names

# Seed-only constants
ATTENDANCE_GAMMA_SHAPE = 5.0  # higher = more even attendance (5: most attend 2-4, max ~11)
LINKEDIN_MIN, LINKEDIN_MAX = 5, 10
FULL_CLIQUE_MAX = 8  # companies up to this size are fully connected
COWORKER_TIES = 3  # in bigger companies, each person links to this many random coworkers
FILL_LOCAL_SHARE = 0.7  # random fill: share within same primary topic or business type
RELATED_TOP_N = 3
GENERIC_COMPANIES = {"", "self-employed", "self employed", "independent", "freelance", "n/a", "none", "retired"}
SENIOR_WORDS = ("owner", "founder", "ceo", "president", "vp", "vice president", "director", "chef", "head", "chief", "partner", "principal")
JUNIOR_WORDS = ("intern", "associate", "coordinator", "assistant", "junior", "trainee", "student")


# --- Raw data loaders (cached; the simulator reuses these) -----------------


def _read_json(rel: str):
    return json.loads((settings.data_dir / rel).read_text())


def _read_csv(rel: str) -> list[dict]:
    with open(settings.data_dir / rel, newline="") as f:
        return list(csv.DictReader(f))


@lru_cache
def load_attendees_raw() -> list[dict]:
    return _read_json("pizza_expo_attendees_enriched.json")


@lru_cache
def load_talks_raw() -> list[dict]:
    return _read_json("program/sessions.json")


@lru_cache
def load_exhibitors_raw() -> list[dict]:
    return _read_json("program/exhibitors.json")


@lru_cache
def load_signups_raw() -> list[dict]:
    return _read_csv("program/session_signups.csv")


@lru_cache
def load_booth_scans_raw() -> list[dict]:
    return _read_csv("program/booth_scans.csv")


def even_vec(topic_id_list: list[str]) -> list[float]:
    """Split weight 1 evenly across the listed topics (list of T floats)."""
    vec = [0.0] * T
    ks = [idx(t) for t in topic_id_list]
    for k in ks:
        vec[k] = 1 / len(ks)
    return vec


def registered_topics(reg: dict) -> list[int]:
    """Topic indices ticked on the registration form, in form order."""
    out = []
    for name in (reg.get("interests") or "").split(";"):
        k = idx_from_name(name)
        if k is not None and k not in out:
            out.append(k)
    return out


# --- Synthetic fields ------------------------------------------------------


def synth_years_exp(title: str, rng: random.Random) -> int:
    t = (title or "").lower()
    years = rng.gauss(10, 5)
    if any(w in t for w in SENIOR_WORDS):
        years += 8
    elif "manager" in t or "gm" == t.strip():
        years += 3
    if any(w in t for w in JUNIOR_WORDS):
        years -= 6
    return int(min(40, max(0, round(years))))


def synth_attendance(ids: list[str], np_rng: np.random.Generator) -> dict[str, list[int]]:
    """Each session samples SESSION_SIZE attendees by Gamma propensity."""
    propensity = np_rng.gamma(ATTENDANCE_GAMMA_SHAPE, 1.0, size=len(ids))
    p = propensity / propensity.sum()
    sessions: dict[str, list[int]] = {i: [] for i in ids}
    for s in range(N_SESSIONS):
        for j in np_rng.choice(len(ids), size=min(SESSION_SIZE, len(ids)), replace=False, p=p):
            sessions[ids[j]].append(s)
    return sessions


def _norm_company(name: str) -> str:
    return " ".join((name or "").lower().replace(",", " ").replace(".", " ").split())


def synth_linkedin(raw: list[dict], rng: random.Random) -> set[tuple[str, str]]:
    """Undirected LinkedIn ties with community structure (design doc 8.1)."""
    ids = [r["attendee_id"] for r in raw]
    edges: set[tuple[str, str]] = set()
    deg: dict[str, int] = defaultdict(int)

    def add(a: str, b: str) -> bool:
        if a == b:
            return False
        e = (a, b) if a < b else (b, a)
        if e in edges:
            return False
        edges.add(e)
        deg[a] += 1
        deg[b] += 1
        return True

    # 1. Coworkers
    by_company: dict[str, list[str]] = defaultdict(list)
    for r in raw:
        c = _norm_company(r["registration"].get("company", ""))
        if c not in GENERIC_COMPANIES:
            by_company[c].append(r["attendee_id"])
    for members in by_company.values():
        if len(members) <= FULL_CLIQUE_MAX:
            for i, a in enumerate(members):
                for b in members[i + 1 :]:
                    add(a, b)
        else:
            for a in members:
                for b in rng.sample(members, COWORKER_TIES + 1):
                    add(a, b)

    # 2. people_also_viewed links that resolve to another attendee
    by_url = {r["linkedin_profile"]["url"]: r["attendee_id"] for r in raw if r.get("linkedin_profile") and r["linkedin_profile"].get("url")}
    for r in raw:
        lp = r.get("linkedin_profile")
        for v in (lp or {}).get("people_also_viewed") or []:
            other = by_url.get(v.get("profile_link"))
            if other:
                add(r["attendee_id"], other)

    # 3. Random fill to 5-10 ties: mostly within primary topic or business type
    groups: dict[str, list[str]] = defaultdict(list)
    keys: dict[str, list[str]] = {}
    for r in raw:
        reg = r["registration"]
        topics = registered_topics(reg)
        ks = [f"bt:{reg.get('business_type', '')}"] + ([f"topic:{topics[0]}"] if topics else [])
        keys[r["attendee_id"]] = ks
        for k in ks:
            groups[k].append(r["attendee_id"])

    order = ids[:]
    rng.shuffle(order)
    target = {a: rng.randint(LINKEDIN_MIN, LINKEDIN_MAX) for a in ids}
    for a in order:
        tries = 0
        while deg[a] < target[a] and tries < 60:
            tries += 1
            if rng.random() < FILL_LOCAL_SHARE:
                pool = groups[rng.choice(keys[a])]
            else:
                pool = ids
            b = rng.choice(pool)
            if deg[b] >= LINKEDIN_MAX and tries < 40:
                continue
            add(a, b)
    return edges


# --- Content graph ---------------------------------------------------------


def _related_rows(raw: list[dict]) -> list[dict]:
    """Topic co-occurrence -> top-N cosine neighbors per topic, both directions."""
    c = np.zeros((T, T))
    lists = [[idx(t) for t in s["topics"]] for s in load_talks_raw()]
    lists += [[idx(t) for t in e["topics"]] for e in load_exhibitors_raw()]
    lists += [registered_topics(r["registration"]) for r in raw]
    for ks in lists:
        for a in ks:
            for b in ks:
                c[a, b] += 1
    diag = np.sqrt(np.outer(np.diag(c), np.diag(c)))
    cos = np.divide(c, diag, out=np.zeros_like(c), where=diag > 0)
    np.fill_diagonal(cos, 0)
    pairs: dict[tuple[int, int], float] = {}
    for k in range(T):
        for j in np.argsort(-cos[k])[:RELATED_TOP_N]:
            if cos[k, j] > 0:
                pairs[(min(k, int(j)), max(k, int(j)))] = float(cos[k, j])
    top = max(pairs.values(), default=1.0)
    rows = []
    for (a, b), w in pairs.items():
        rows.append({"a": a, "b": b, "w": round(w / top, 4)})
        rows.append({"a": b, "b": a, "w": round(w / top, 4)})
    return rows


def seed_content(raw: list[dict]) -> tuple[int, int, int]:
    g = db.content()
    for q in cypher.CONTENT_INDEXES:
        g.query(q)
    g.query(cypher.CREATE_TOPICS, {"rows": [
        {"idx": i, "id": tid, "name": n, "description": d}
        for i, (tid, n, d) in enumerate(zip(topic_ids(), topic_names(), topic_descriptions()))
    ]})

    talks, about = [], []
    for s in load_talks_raw():
        vec = even_vec(s["topics"])
        talks.append({
            "id": s["session_id"], "title": s["title"], "type": s["type"], "day": s["day"],
            "start": s["start"], "end": s["end"], "room": s["room"], "topic_vec": vec,
            "speaker_ids": [sp["attendee_id"] for sp in s["speakers"]],
        })
        about += [{"src": s["session_id"], "k": k, "w": w} for k, w in enumerate(vec) if w > 0]
    db.run_batched(g, cypher.CREATE_TALKS, talks)
    db.run_batched(g, cypher.CREATE_ABOUT, about)

    vendors, targets = [], []
    for e in load_exhibitors_raw():
        vec = even_vec(e["topics"])
        vendors.append({
            "id": e["exhibitor_id"], "name": e["name"], "category": e["category"], "booth": str(e["booth"]),
            "booth_size": e["booth_size"], "profile": vec, "staff": list(e.get("staff") or []),
        })
        targets += [{"src": e["exhibitor_id"], "k": k, "w": w} for k, w in enumerate(vec) if w > 0]
    db.run_batched(g, cypher.CREATE_VENDORS, vendors)
    db.run_batched(g, cypher.CREATE_TARGETS, targets)
    db.run_batched(g, cypher.CREATE_RELATED, _related_rows(raw))
    return T, len(talks), len(vendors)


# --- People graph ----------------------------------------------------------


def attendee_rows(raw: list[dict], rng: random.Random, np_rng: np.random.Generator) -> list[dict]:
    ids = [r["attendee_id"] for r in raw]
    talk_vec = {s["session_id"]: even_vec(s["topics"]) for s in load_talks_raw()}
    vendor_vec = {e["exhibitor_id"]: even_vec(e["topics"]) for e in load_exhibitors_raw()}

    speaker_topics: dict[str, set[int]] = defaultdict(set)
    for s in load_talks_raw():
        for sp in s["speakers"]:
            speaker_topics[sp["attendee_id"]].update(idx(t) for t in s["topics"])
    staff_of: dict[str, str] = {}
    for e in load_exhibitors_raw():
        for a in e.get("staff") or []:
            staff_of.setdefault(a, e["exhibitor_id"])

    signup_sum: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(T))
    for row in load_signups_raw():
        if row["session_id"] in talk_vec:
            signup_sum[row["attendee_id"]] += talk_vec[row["session_id"]]
    scan_sum: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(T))
    for row in load_booth_scans_raw():
        if row["exhibitor_id"] in vendor_vec:
            scan_sum[row["attendee_id"]] += vendor_vec[row["exhibitor_id"]]

    sessions = synth_attendance(ids, np_rng)
    like = LIKE_PRIOR[0] / (LIKE_PRIOR[0] + LIKE_PRIOR[1])

    rows = []
    for r in raw:
        aid, reg = r["attendee_id"], r["registration"]
        title = reg.get("job_title") or ""
        years = synth_years_exp(title, rng)
        reg_topics = registered_topics(reg)

        reg_vec = np.zeros(T)
        reg_vec[reg_topics] = 1
        int_a = A0 + S_REG * reg_vec + S_SIGNUP * signup_sum[aid] + S_SCAN * scan_sum[aid]
        int_b = np.full(T, B0)

        prior = np.full(T, 0.5)
        seniority = min(years, 20) / 20
        for k in reg_topics:
            prior[k] = max(prior[k], 0.5 + SENIORITY_BOOST * seniority)
        exhibitor_id = staff_of.get(aid, "")
        if exhibitor_id:
            for k, w in enumerate(vendor_vec[exhibitor_id]):
                if w > 0:
                    prior[k] = max(prior[k], EXHIBITOR_PRIOR)
        for k in speaker_topics.get(aid, ()):
            prior[k] = max(prior[k], SPEAKER_PRIOR)

        comp_prior = [round(float(x), 4) for x in prior]
        rows.append({
            "id": aid,
            "name": f"{reg.get('first_name', '')} {reg.get('last_name', '')}".strip(),
            "company": reg.get("company") or "",
            "title": title,
            "business_type": reg.get("business_type") or "",
            "ticket_type": reg.get("ticket_type") or "",
            "city": reg.get("city") or "",
            "state": reg.get("state") or "",
            "country": reg.get("country") or "",
            "is_speaker": aid in speaker_topics,
            "speaker_topics": sorted(speaker_topics.get(aid, ())),
            "exhibitor_id": exhibitor_id,  # "" when not staff: null properties are dropped by SET
            "registered_topics": reg_topics,
            "years_exp": years,
            "sessions": sessions[aid],
            "int_a": [round(float(x), 4) for x in int_a],
            "int_b": [round(float(x), 4) for x in int_b],
            "interest": [round(float(x), 4) for x in int_a / (int_a + int_b)],
            "comp_prior": comp_prior,
            "comp": comp_prior,
            "comp_unc": [1.0] * T,
            "m": [0] * T,
            "pr": [0.0] * T,
            "rel_a": float(REL_PRIOR[0]),
            "rel_b": float(REL_PRIOR[1]),
            "like_a": float(LIKE_PRIOR[0]),
            "like_b": float(LIKE_PRIOR[1]),
            "like": like,
            "tribe": -1,
            "broker": 0.0,
            "reach": 0.0,
            "cum_value": 0.0,
            "sat_out": 0,
            "reached": [],
        })
    return rows


def seed_people(raw: list[dict], rng: random.Random, np_rng: np.random.Generator) -> tuple[int, int]:
    g = db.people()
    for q in cypher.PEOPLE_INDEXES:
        g.query(q)
    rows = attendee_rows(raw, rng, np_rng)
    db.run_batched(g, cypher.CREATE_ATTENDEES, rows)
    edges = synth_linkedin(raw, rng)
    li_rows = [{"a": a, "b": b, "since": rng.randint(2010, 2026)} for a, b in sorted(edges)]
    db.run_batched(g, cypher.CREATE_LINKEDIN, li_rows)
    return len(rows), len(edges)


# --- Entry points ----------------------------------------------------------


def reset() -> None:
    for name in (CONTENT_GRAPH, PEOPLE_GRAPH, MATCH_GRAPH):
        if db.graph_exists(name):
            db.get_db().select_graph(name).delete()


def seed() -> SeedResult:
    t0 = time.time()
    reset()
    rng = random.Random(RNG_SEED)
    np_rng = np.random.default_rng(RNG_SEED)
    raw = load_attendees_raw()
    n_topics, n_talks, n_vendors = seed_content(raw)
    n_attendees, n_linkedin = seed_people(raw, rng, np_rng)
    return SeedResult(
        topics=n_topics, talks=n_talks, vendors=n_vendors, attendees=n_attendees,
        linkedin_edges=n_linkedin, seconds=round(time.time() - t0, 2),
    )


def is_seeded() -> bool:
    return db.graph_exists(PEOPLE_GRAPH) and db.graph_exists(CONTENT_GRAPH)


def session_attendees(s: int) -> list[str]:
    """Attendee ids registered for speed-dating session s, sorted."""
    return [r[0] for r in db.people().query(cypher.SESSION_ATTENDEES, {"s": s}).result_set]


__all__ = [
    "even_vec",
    "is_seeded",
    "load_attendees_raw",
    "load_booth_scans_raw",
    "load_exhibitors_raw",
    "load_signups_raw",
    "load_talks_raw",
    "registered_topics",
    "reset",
    "seed",
    "session_attendees",
]

_ = math  # reserved for future priors
