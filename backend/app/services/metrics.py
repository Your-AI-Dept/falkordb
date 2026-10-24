"""Learning and matching-quality metrics (design doc 8.3). No ground truth:
these show the graph is learning and the matcher is improving."""

import numpy as np

from app.snapshot import People


def _ranks(x: np.ndarray) -> np.ndarray:
    order = np.argsort(x, kind="stable")
    r = np.empty(len(x))
    r[order] = np.arange(len(x))
    return r


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra, rb = _ranks(a), _ranks(b)
    if ra.std() == 0 or rb.std() == 0:
        return 1.0
    return float(np.corrcoef(ra, rb)[0, 1])


def compute(people: People, prev_comp: list[list[float]] | None, surveys: list[dict], tick: int, s: int, d: int) -> dict:
    """surveys: this date's per-rater mirrors [{act, meet_again, didnt_meet}]."""
    stability = None
    if prev_comp is not None:
        prev = np.asarray(prev_comp)
        if prev.shape == people.comp.shape:
            stability = round(float(np.mean([spearman(prev[:, k], people.comp[:, k]) for k in range(people.comp.shape[1])])), 4)
    met = [x for x in surveys if not x.get("didnt_meet")]
    meet = [x["meet_again"] for x in met if x.get("meet_again") is not None]
    act = [x["act"] for x in met if x.get("act")]
    return {
        "tick": tick,
        "session": s,
        "date_no": d,
        "uncertainty": round(float(people.comp_unc.mean()), 4),
        "coverage": round(float((people.m > 0).mean()), 4),
        "stability": stability,
        "meet_again_rate": round(sum(meet) / len(meet), 4) if meet else None,
        "act_yes_rate": round(sum(a == "yes" for a in act) / len(act), 4) if act else None,
    }
