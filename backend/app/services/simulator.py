"""Mock answers for dates and check-ins (design doc 8.2).

Each attendee gets a private latent profile, derived from the same signals as
the priors plus noise, so simulated answers are coherent rather than random.
Latents never enter the graph or the metrics. Everything is seeded, so the
same show replays identically.
"""

import random
from dataclasses import dataclass

import numpy as np

from app.config import RNG_SEED, T
from app.snapshot import People
from app.topics import idx

KAPPA, SIGMA, EPS = 0.15, 0.1, 0.08
P_FORGET, P_CLASH = 0.1, 0.05
MAX_DISCUSSED = 3


@dataclass
class Latent:
    expertise: np.ndarray  # [N, T]
    interest: np.ndarray  # [N, T], rows sum to 1
    talk: np.ndarray  # [N]
    modesty: np.ndarray  # [N]
    charm: np.ndarray  # [N]
    ix: dict[str, int]


_latent: Latent | None = None


def latent(people: People) -> Latent:
    """Built once per process from the seeded priors (stable across restarts)."""
    global _latent
    if _latent is None or _latent.ix != people.ix:
        rng = np.random.default_rng(RNG_SEED + 1)
        n = people.n
        expertise = 0.1 + 0.1 * rng.random((n, T))
        signal = people.comp_prior + 0.15 * rng.standard_normal((n, T))
        for i in range(n):
            strong = np.argsort(-signal[i])[: rng.integers(1, 4)]
            expertise[i, strong] = rng.uniform(0.6, 0.95, len(strong))
        raw = np.clip(people.interest + 0.15 * rng.standard_normal((n, T)), 0.01, None) ** 2
        _latent = Latent(
            expertise=expertise,
            interest=raw / raw.sum(axis=1, keepdims=True),
            talk=rng.random(n),
            modesty=rng.uniform(0, 0.3, n),
            charm=rng.normal(0, 0.15, n),
            ix=dict(people.ix),
        )
    return _latent


def _rapport(L: Latent, rater: int, partner: int, rng: random.Random) -> float:
    """How much the rater enjoyed the partner: centered interest similarity +
    the partner's charm + noise."""
    mean = L.interest.mean(axis=0)
    a, b = L.interest[rater] - mean, L.interest[partner] - mean
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    sim = float(a @ b / denom) if denom > 1e-12 else 0.0
    return 0.45 + 0.3 * sim + float(L.charm[partner]) + rng.gauss(0, 0.2)


def _discussion(L: Latent, u: int, v: int, rng: random.Random) -> dict[int, str]:
    """Topics discussed and the true outcome from u's side: 'u' (u learned
    more), 'v' (v learned more) or 'even'."""
    w = L.interest[u] + L.interest[v]
    topics: list[int] = []
    pool = list(range(T))
    weights = list(w)
    for _ in range(MAX_DISCUSSED):
        k = rng.choices(pool, weights=weights)[0]
        if k not in topics:
            topics.append(k)
    out = {}
    for k in topics:
        d = L.expertise[v, k] - L.expertise[u, k] + KAPPA * (L.talk[v] - L.talk[u]) + rng.gauss(0, SIGMA)
        out[k] = "even" if abs(d) < EPS else ("u" if d > 0 else "v")
    return out


def answer_meeting(people: People, key: str, a: str, b: str, questions_a: list[dict], questions_b: list[dict]) -> tuple[dict, dict]:
    """Answers for both raters of one meeting. `key` makes the shared
    randomness (what was discussed) the same for both sides."""
    L = latent(people)
    lo, hi = sorted((a, b))
    shared = random.Random(f"{RNG_SEED}|meet|{key}|{lo}|{hi}")
    u, v = L.ix[lo], L.ix[hi]
    outcome = _discussion(L, u, v, shared)
    answers = {}
    for rater, partner, qs in ((a, b, questions_a), (b, a, questions_b)):
        if qs is None:
            continue
        r_ix, p_ix = L.ix[rater], L.ix[partner]
        rng = random.Random(f"{RNG_SEED}|rater|{key}|{rater}")
        ans: dict[str, str] = {}
        for q in qs:
            kind = q["kind"]
            if kind == "met":
                ans[q["question_id"]] = "yes"
            elif kind == "claim":
                k = idx(q["topic_id"])
                if k not in outcome or rng.random() < P_FORGET:
                    ans[q["question_id"]] = "skip"
                    continue
                o = outcome[k]
                learned = o == "even" or (o == "u") == (rater == lo)
                taught = o == "even" or (o == "v") == (rater == lo)
                if q["claim"] == "partner_taught":
                    val = learned or rng.random() < L.modesty[r_ix]
                else:
                    val = taught
                ans[q["question_id"]] = "true" if val else "false"
            elif kind == "act":
                rap = _rapport(L, r_ix, p_ix, rng)
                ans["act"] = "no" if rng.random() < P_CLASH else ("yes" if rap > 0.6 else "maybe" if rap > 0.3 else "no")
                ans["meet_again"] = "yes" if rap > 0.45 else "no"
        answers[rater] = ans
    return answers.get(a, {}), answers.get(b, {})
