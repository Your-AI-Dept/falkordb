"""Pure math functions (design doc sections 3 and 4). No DB access; unit-tested.

Vectors are numpy arrays indexed by topic 0..T-1.
"""

from collections.abc import Iterable, Mapping, Sequence

import numpy as np

from app.config import (
    BETA,
    ENJOY,
    GAMMA,
    LAMBDA,
    MU,
    PRIOR_ADHOC,
    PRIOR_LINKEDIN,
    PRIOR_SPEED,
    W0,
    W_BASE,
)

EPS = 1e-12

# --- 3.1, 3.5, 3.6 Beta means ------------------------------------------------


def beta_mean(a, b):
    return np.asarray(a, dtype=float) / (np.asarray(a, dtype=float) + np.asarray(b, dtype=float))


# --- 3.2 Tie belief ----------------------------------------------------------

ACT_SLOT = {"yes": 0, "maybe": 1, "no": 2}


def tie_counts(
    linkedin: bool = False,
    adhoc: bool = False,
    adhoc_act: str | None = None,
    speed_acts: Iterable[str | None] = (),
) -> np.ndarray:
    """Dirichlet counts (c_pos, c_neu, c_neg) for sender u -> receiver v.

    `adhoc_act` and `speed_acts` are v's `act` answers about u (on the edges
    v -> u). Each speed date adds PRIOR_SPEED plus 1 in its answer's slot.
    """
    c = np.zeros(3)
    if linkedin:
        c += PRIOR_LINKEDIN
    if adhoc:
        c += PRIOR_ADHOC
        if adhoc_act in ACT_SLOT:
            c[ACT_SLOT[adhoc_act]] += 1
    for act in speed_acts:
        c += PRIOR_SPEED
        if act in ACT_SLOT:
            c[ACT_SLOT[act]] += 1
    return c


def tie_probs(counts: np.ndarray) -> tuple[float, float, float]:
    """(p_pos, p_neu, p_neg); all zero when there is no tie evidence."""
    total = float(np.sum(counts))
    if total <= 0:
        return 0.0, 0.0, 0.0
    p = np.asarray(counts, dtype=float) / total
    return float(p[0]), float(p[1]), float(p[2])


# --- 3.4 From answers to learning directions ---------------------------------

LEARNED_MORE, TAUGHT_MORE, EVEN, NEUTRAL, SKIP = "LEARNED_MORE", "TAUGHT_MORE", "EVEN", "NEUTRAL", "SKIP"
DIRECTIONAL = frozenset({LEARNED_MORE, TAUGHT_MORE, EVEN})

U_LEARNED = ("u", "v")  # u learned from v: edge u -> v
V_LEARNED = ("v", "u")  # v learned from u: edge v -> u
BOTH = frozenset({U_LEARNED, V_LEARNED})
NONE: frozenset = frozenset()


def reduce_claims(partner_taught: str | None, self_taught: str | None) -> str:
    """Reduce one rater's two claims on a topic to one answer (3.4 reduction table).

    Values are "true", "false", "skip", or None when the claim wasn't asked
    (check-ins ask only partner_taught).
    """
    if partner_taught is None and self_taught is None:
        return SKIP
    if "skip" in (partner_taught, self_taught):
        return SKIP
    pt, st = partner_taught == "true", self_taught == "true"
    if self_taught is None:
        return LEARNED_MORE if pt else NEUTRAL
    if partner_taught is None:
        return TAUGHT_MORE if st else NEUTRAL
    if pt and st:
        return EVEN
    if pt:
        return LEARNED_MORE
    if st:
        return TAUGHT_MORE
    return NEUTRAL


def _single(ans: str, rater: str) -> frozenset:
    if ans == EVEN:
        return BOTH
    learned = ans == LEARNED_MORE
    if rater == "u":
        return frozenset({U_LEARNED if learned else V_LEARNED})
    return frozenset({V_LEARNED if learned else U_LEARNED})


def combine_answers(u_ans: str | None, v_ans: str | None) -> tuple[frozenset, str | None]:
    """Combine u's answer about v and v's answer about u on one topic (3.4 table).

    Returns (directions, reliability). Directions are (learner, expert) pairs
    over the symbols "u"/"v"; reliability is "agree", "disagree" or None.
    """
    u_dir = u_ans in DIRECTIONAL
    v_dir = v_ans in DIRECTIONAL
    if not u_dir and not v_dir:
        return NONE, None
    if u_dir and not v_dir:
        return _single(u_ans, "u"), None
    if v_dir and not u_dir:
        return _single(v_ans, "v"), None
    pair = (u_ans, v_ans)
    if pair == (LEARNED_MORE, TAUGHT_MORE):
        return frozenset({U_LEARNED}), "agree"
    if pair == (TAUGHT_MORE, LEARNED_MORE):
        return frozenset({V_LEARNED}), "agree"
    if pair == (EVEN, EVEN):
        return BOTH, "agree"
    if u_ans == EVEN:
        return _single(v_ans, "v"), None
    if v_ans == EVEN:
        return _single(u_ans, "u"), None
    if pair == (LEARNED_MORE, LEARNED_MORE):
        return BOTH, None  # modesty
    return BOTH, "disagree"  # TAUGHT_MORE, TAUGHT_MORE


def came_up(ans: str | None) -> bool:
    """True when the topic was discussed (any answer but SKIP / not asked)."""
    return ans in DIRECTIONAL or ans == NEUTRAL


# --- 3.3 Competence ----------------------------------------------------------


def log_ratio(pr, n: int):
    """s_k(u) = ln(n * pr_k(u)); 0 for an average attendee."""
    return np.log(np.maximum(n * np.asarray(pr, dtype=float), EPS))


def competence(pr, n: int, m, prior, gamma: float = GAMMA, w0: float = W0):
    """(comp, comp_unc) blending the PageRank estimate with the prior by evidence m."""
    c_pr = 1.0 / (1.0 + np.exp(-gamma * log_ratio(pr, n)))
    m = np.asarray(m, dtype=float)
    comp = (w0 * np.asarray(prior, dtype=float) + m * c_pr) / (w0 + m)
    unc = w0 / (w0 + m)
    return comp, unc


# --- 3.7 Enjoyment -----------------------------------------------------------


def cosine(a, b) -> float:
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < EPS or nb < EPS:
        return 0.0
    return float(a @ b / (na * nb))


def enjoy(interest_u, interest_v, like_v: float, mean_interest=None) -> float:
    """(cos(interest_u, interest_v) + like(v)) / 2, with interests centered on
    the population mean: raw interest vectors are all positive, so their plain
    cosine is near 1 for everyone and can't tell pairs apart."""
    if mean_interest is not None:
        interest_u = np.asarray(interest_u) - mean_interest
        interest_v = np.asarray(interest_v) - mean_interest
    return (cosine(interest_u, interest_v) + float(like_v)) / 2


# --- 4.1 Question target selection --------------------------------------------


def entropy(p):
    p = np.clip(np.asarray(p, dtype=float), EPS, 1 - EPS)
    return -p * np.log(p) - (1 - p) * np.log(1 - p)


def vendor_demand(profiles) -> np.ndarray:
    """demand_k = sum over vendors of profile[k], normalized so the max is 1."""
    d = np.asarray(profiles, dtype=float).sum(axis=0)
    top = d.max() if d.size else 0
    return d / top if top > 0 else d


def topic_scores(interest_u, interest_v, s_u, s_v, unc_u, unc_v, demand, r_u: float, w_base: float = W_BASE):
    """(score, ig, plaus) per topic for rater u asking about partner v."""
    plaus = (np.asarray(interest_u) + np.asarray(interest_v)) / 2
    p_hat = 1.0 / (1.0 + np.exp(-(np.asarray(s_v) - np.asarray(s_u))))
    ig = entropy(p_hat) * (np.asarray(unc_u) + np.asarray(unc_v)) / 2
    score = plaus * (w_base + np.asarray(demand)) * r_u * ig
    return score, ig, plaus


def top_k(vec, k: int = 3) -> list[int]:
    return [int(i) for i in np.argsort(-np.asarray(vec), kind="stable")[:k]]


def candidate_topics(interest_u, interest_v, comp_v, related: Mapping[int, Iterable[int]], k: int = 3) -> set[int]:
    base = set(top_k(interest_u, k)) | set(top_k(interest_v, k)) | set(top_k(comp_v, k))
    out = set(base)
    for t in base:
        out |= set(related.get(t, ()))
    return out


def select_topics(
    score,
    candidates: Iterable[int],
    related: Mapping[int, Iterable[int]],
    q_min: int,
    q_max: int,
    attention_cost: float,
) -> list[int]:
    """Pick topics in score order, skipping RELATED neighbors of already-picked
    (higher-scoring) topics; stop at q_max, or once q_min are taken and the
    next score is below attention_cost."""
    score = np.asarray(score)
    chosen: list[int] = []
    for t in sorted(candidates, key=lambda t: (-score[t], t)):
        if len(chosen) >= q_max:
            break
        if len(chosen) >= q_min and score[t] < attention_cost:
            break
        if any(t in set(related.get(c, ())) for c in chosen):
            continue
        chosen.append(int(t))
    return chosen


# --- 4.2 Pairing -------------------------------------------------------------


def teach(comp_v, interest_u) -> float:
    interest_u = np.asarray(interest_u, dtype=float)
    total = interest_u.sum()
    return float(np.asarray(comp_v) @ interest_u / total) if total > 0 else 0.0


def explore(ig, plaus, k: int = 3) -> float:
    """Mean IG over the pair's k most plausible topics."""
    return float(np.mean(np.asarray(ig)[top_k(plaus, k)]))


def pair_value(
    teach_uv: float,
    enjoy_uv: float,
    bridge: bool,
    familiar: bool,
    explore_uv: float,
    enjoy_w: float = ENJOY,
    beta: float = BETA,
    mu: float = MU,
    lam: float = LAMBDA,
) -> float:
    """V_u(v) = teach + ENJOY*enjoy + BETA*bridge - MU*familiar + LAMBDA*explore."""
    return teach_uv + enjoy_w * enjoy_uv + beta * bridge - mu * familiar + lam * explore_uv


def deficits(cum_value: Mapping[str, float]) -> dict[str, float]:
    if not cum_value:
        return {}
    mean = sum(cum_value.values()) / len(cum_value)
    return {k: max(0.0, mean - v) for k, v in cum_value.items()}


def greedy_match(pairs: Sequence[tuple[str, str, float]]) -> list[tuple[str, str]]:
    """Take pairs in descending key order when both people are still free."""
    used: set[str] = set()
    out = []
    for a, b, _ in sorted(pairs, key=lambda p: (-p[2], p[0], p[1])):
        if a not in used and b not in used:
            used.update((a, b))
            out.append((a, b))
    return out


# --- 4.3 Micro-influencers ---------------------------------------------------


def sigma(p_selected) -> float:
    """Expected reach: sum over targets of 1 - prod over selected (1 - p)."""
    p = np.asarray(p_selected, dtype=float)
    if p.size == 0:
        return 0.0
    p = p.reshape(-1, p.shape[-1])
    return float(np.sum(1 - np.prod(1 - p, axis=0)))


def greedy_influencers(p_x, n: int) -> list[tuple[int, float]]:
    """Greedy top-n by marginal reach. p_x is [candidates x targets].

    Returns [(candidate_row, marginal_gain)], stopping early when no
    candidate adds positive reach.
    """
    p_x = np.asarray(p_x, dtype=float)
    if p_x.size == 0:
        return []
    miss = np.ones(p_x.shape[1])  # prob each target is not yet reached
    chosen: list[tuple[int, float]] = []
    available = np.ones(p_x.shape[0], dtype=bool)
    for _ in range(min(n, p_x.shape[0])):
        gains = np.where(available, p_x @ miss, -np.inf)
        best = int(np.argmax(gains))
        if gains[best] <= EPS:
            break
        chosen.append((best, float(gains[best])))
        available[best] = False
        miss *= 1 - p_x[best]
    return chosen
