import pytest

from app.config import T
from app.cypher import learned_from


def test_learned_from_valid():
    assert learned_from(0) == "LEARNED_FROM_T0"
    assert learned_from(T - 1) == f"LEARNED_FROM_T{T - 1}"


@pytest.mark.parametrize("k", [-1, T, "3", 3.0, True, "3]->() DETACH DELETE n //"])
def test_learned_from_rejects_non_whitelisted(k):
    with pytest.raises(ValueError):
        learned_from(k)
