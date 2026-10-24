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
