import numpy as np
import pytest

from app import mathcore as mc
from app.config import PRIOR_ADHOC, PRIOR_LINKEDIN, PRIOR_SPEED
from app.mathcore import BOTH, EVEN, LEARNED_MORE, NEUTRAL, NONE, SKIP, TAUGHT_MORE, U_LEARNED, V_LEARNED

UV = frozenset({U_LEARNED})
VU = frozenset({V_LEARNED})

# --- 3.2 ----------------------------------------------------------------------


def test_no_tie_evidence_means_no_influence():
    assert mc.tie_probs(mc.tie_counts()) == (0.0, 0.0, 0.0)


def test_tie_priors_and_act_slots():
    assert np.allclose(mc.tie_counts(linkedin=True), PRIOR_LINKEDIN)
    assert np.allclose(mc.tie_counts(adhoc=True, adhoc_act="no"), np.add(PRIOR_ADHOC, [0, 0, 1]))
    c = mc.tie_counts(speed_acts=["yes"])
    assert np.allclose(c, np.add(PRIOR_SPEED, [1, 0, 0]))
    p_pos, p_neu, p_neg = mc.tie_probs(c)
    assert p_pos == pytest.approx(0.5) and p_pos + p_neu + p_neg == pytest.approx(1)


def test_unanswered_act_adds_prior_only():
    assert np.allclose(mc.tie_counts(speed_acts=[None]), PRIOR_SPEED)


# --- 3.4 reduction table ------------------------------------------------------


@pytest.mark.parametrize(
    "pt,st,expected",
    [
        ("skip", "true", SKIP),
        ("true", "skip", SKIP),
        ("skip", "skip", SKIP),
        ("true", "false", LEARNED_MORE),
        ("false", "true", TAUGHT_MORE),
        ("true", "true", EVEN),
        ("false", "false", NEUTRAL),
        (None, None, SKIP),
        # check-in variant: only partner_taught asked
        ("true", None, LEARNED_MORE),
        ("false", None, NEUTRAL),
        ("skip", None, SKIP),
        (None, "true", TAUGHT_MORE),
    ],
)
def test_reduce_claims(pt, st, expected):
    assert mc.reduce_claims(pt, st) == expected


# --- 3.4 combination table: every row -----------------------------------------


@pytest.mark.parametrize(
    "u,v,dirs,rel",
    [
        # SKIP/NEUTRAL with SKIP/NEUTRAL -> none
        (SKIP, SKIP, NONE, None),
        (NEUTRAL, SKIP, NONE, None),
        (SKIP, NEUTRAL, NONE, None),
        (NEUTRAL, NEUTRAL, NONE, None),
        (None, None, NONE, None),
        # one directional, the other SKIP/NEUTRAL/not asked -> single-answer direction
        (LEARNED_MORE, SKIP, UV, None),
        (TAUGHT_MORE, SKIP, VU, None),
        (EVEN, SKIP, BOTH, None),
        (SKIP, LEARNED_MORE, VU, None),
        (SKIP, TAUGHT_MORE, UV, None),
        (SKIP, EVEN, BOTH, None),
        (LEARNED_MORE, NEUTRAL, UV, None),
        (NEUTRAL, TAUGHT_MORE, UV, None),
        (LEARNED_MORE, None, UV, None),
        (None, LEARNED_MORE, VU, None),
        # agreement rows
        (LEARNED_MORE, TAUGHT_MORE, UV, "agree"),
        (TAUGHT_MORE, LEARNED_MORE, VU, "agree"),
        (EVEN, EVEN, BOTH, "agree"),
        # EVEN vs directional -> the non-even answer's direction
        (EVEN, LEARNED_MORE, VU, None),
        (EVEN, TAUGHT_MORE, UV, None),
        (LEARNED_MORE, EVEN, UV, None),
        (TAUGHT_MORE, EVEN, VU, None),
        # modesty and disagreement
        (LEARNED_MORE, LEARNED_MORE, BOTH, None),
        (TAUGHT_MORE, TAUGHT_MORE, BOTH, "disagree"),
    ],
)
def test_combine_answers(u, v, dirs, rel):
    assert mc.combine_answers(u, v) == (dirs, rel)


@pytest.mark.parametrize("ans,expected", [(LEARNED_MORE, True), (EVEN, True), (NEUTRAL, True), (SKIP, False), (None, False)])
def test_came_up(ans, expected):
    assert mc.came_up(ans) is expected


# --- 3.3 ----------------------------------------------------------------------


def test_competence_without_evidence_is_prior():
    prior = np.array([0.5, 0.8])
    comp, unc = mc.competence(pr=[0.0, 0.3], n=100, m=[0, 0], prior=prior)
    assert np.allclose(comp, prior) and np.allclose(unc, 1.0)


def test_competence_average_pagerank_is_half():
    comp, _ = mc.competence(pr=[0.01], n=100, m=[1_000_000], prior=[0.9])
    assert comp[0] == pytest.approx(0.5, abs=1e-3)


def test_competence_moves_toward_evidence_and_uncertainty_shrinks():
    comp1, unc1 = mc.competence(pr=[0.05], n=100, m=[1], prior=[0.5])
    comp4, unc4 = mc.competence(pr=[0.05], n=100, m=[4], prior=[0.5])
    assert 0.5 < comp1[0] < comp4[0]
    assert unc4[0] < unc1[0]


# --- 3.7 ----------------------------------------------------------------------


def test_cosine_and_enjoy():
    assert mc.cosine([1, 0], [0, 0]) == 0.0
    assert mc.cosine([1, 2], [2, 4]) == pytest.approx(1.0)
    assert mc.enjoy([1, 0], [1, 0], like_v=0.5) == pytest.approx(0.75)


# --- 4.1 ----------------------------------------------------------------------


def test_entropy_peaks_at_half():
    assert mc.entropy(0.5) == pytest.approx(np.log(2))
    assert mc.entropy(0.99) < mc.entropy(0.5)


def test_topic_scores_prefer_uncertain_plausible_topics():
    interest_u = np.array([0.9, 0.9, 0.1])
    interest_v = np.array([0.9, 0.9, 0.1])
    s = np.zeros(3)
    unc_u = np.array([1.0, 0.1, 1.0])
    unc_v = np.array([1.0, 0.1, 1.0])
    score, ig, plaus = mc.topic_scores(interest_u, interest_v, s, s, unc_u, unc_v, np.zeros(3), r_u=1.0)
    assert score[0] > score[1], "same plausibility, more uncertainty wins"
    assert score[0] > score[2], "same uncertainty, more plausible wins"
    assert plaus[0] == pytest.approx(0.9)


def test_select_topics_diversity_and_stopping():
    score = np.array([0.5, 0.4, 0.3, 0.001, 0.0])
    related = {0: [1], 1: [0]}
    assert mc.select_topics(score, range(5), related, q_min=2, q_max=3, attention_cost=0.02) == [0, 2]
    assert mc.select_topics(score, range(5), {}, q_min=2, q_max=3, attention_cost=0.02) == [0, 1, 2]
    assert mc.select_topics(score, range(5), {}, q_min=2, q_max=2, attention_cost=0.02) == [0, 1]
    # below attention cost after q_min is reached -> stop early
    assert mc.select_topics(np.array([0.5, 0.01, 0.009]), range(3), {}, q_min=1, q_max=3, attention_cost=0.02) == [0]


def test_candidate_topics_include_related():
    T = 6
    iu = np.array([0.9, 0.8, 0.7, 0, 0, 0])
    assert 5 in mc.candidate_topics(iu, iu, iu, related={0: [5]})
    assert mc.candidate_topics(iu, iu, iu, related={}) == {0, 1, 2}
    assert len(iu) == T


def test_vendor_demand_normalized():
    d = mc.vendor_demand([[1, 0, 0], [0.5, 0.5, 0]])
    assert d.max() == pytest.approx(1.0) and d[2] == 0


# --- 4.2 ----------------------------------------------------------------------


def test_teach_and_explore():
    assert mc.teach([1.0, 0.0], [1.0, 1.0]) == pytest.approx(0.5)
    assert mc.teach([1.0], [0.0]) == 0.0
    assert mc.explore(ig=[0.1, 0.9, 0.5, 0.0], plaus=[0.0, 1.0, 0.9, 0.8], k=2) == pytest.approx(0.7)


def test_pair_value_components():
    v = mc.pair_value(0.5, 1.0, bridge=True, familiar=True, explore_uv=1.0, enjoy_w=0.5, beta=0.2, mu=0.3, lam=0.3)
    assert v == pytest.approx(0.5 + 0.5 + 0.2 - 0.3 + 0.3)


def test_greedy_match_never_double_books():
    pairs = [("a1", "b1", 0.9), ("a1", "b2", 0.8), ("a2", "b1", 0.7), ("a2", "b2", 0.1)]
    assert mc.greedy_match(pairs) == [("a1", "b1"), ("a2", "b2")]


def test_deficits():
    assert mc.deficits({"a": 1.0, "b": 3.0}) == {"a": 1.0, "b": 0.0}


# --- 4.3 ----------------------------------------------------------------------


def test_sigma_closed_form():
    assert mc.sigma([[0.5, 0.0]]) == pytest.approx(0.5)
    assert mc.sigma([[0.5, 0.0], [0.5, 0.0]]) == pytest.approx(0.75)
    assert mc.sigma([]) == 0.0


def test_greedy_influencers_prefers_new_circles():
    # c0 and c1 reach the same two targets; c2 reaches different ones, slightly weaker.
    p = np.array([[0.6, 0.6, 0, 0], [0.6, 0.6, 0, 0], [0, 0, 0.5, 0.5]])
    picks = mc.greedy_influencers(p, n=2)
    assert [i for i, _ in picks] == [0, 2]
    gains = [g for _, g in picks]
    assert gains[0] == pytest.approx(1.2) and gains[1] == pytest.approx(1.0)


def test_greedy_influencers_stops_without_gain():
    assert mc.greedy_influencers(np.array([[0.5], [0.0]]), n=2) == [(0, 0.5)]


def test_enjoy_centered_separates_all_positive_interests():
    mean = np.array([0.5, 0.5])
    same = mc.enjoy([0.9, 0.1], [0.8, 0.2], like_v=0.5, mean_interest=mean)
    opposite = mc.enjoy([0.9, 0.1], [0.1, 0.9], like_v=0.5, mean_interest=mean)
    assert same == pytest.approx(0.75) and opposite == pytest.approx(-0.25)  # (cos + like) / 2
    # uncentered, both pairs look alike-ish
    assert mc.enjoy([0.9, 0.1], [0.1, 0.9], like_v=0.5) > 0.3
