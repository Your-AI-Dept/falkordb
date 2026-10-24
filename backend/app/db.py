"""FalkorDB client and graph handles."""

from functools import lru_cache

from falkordb import FalkorDB, Graph

from app.config import CONTENT_GRAPH, MATCH_GRAPH, PEOPLE_GRAPH, settings


@lru_cache
def get_db() -> FalkorDB:
    return FalkorDB(host=settings.falkordb_host, port=settings.falkordb_port)


def content() -> Graph:
    return get_db().select_graph(CONTENT_GRAPH)


def people() -> Graph:
    return get_db().select_graph(PEOPLE_GRAPH)


def match_scratch() -> Graph:
    return get_db().select_graph(MATCH_GRAPH)


def ping() -> bool:
    return bool(get_db().connection.ping())


def run_batched(graph: Graph, query: str, rows: list, key: str = "rows", size: int = 500, params: dict | None = None) -> None:
    """Run an UNWIND query over rows in chunks of `size`, passing each chunk as $key."""
    for i in range(0, len(rows), size):
        graph.query(query, {**(params or {}), key: rows[i : i + size]})


def graph_exists(name: str) -> bool:
    return name in get_db().list_graphs()
