"""Verify every FalkorDB behavior the design doc relies on (build plan P0).

Runs against a throwaway graph key and deletes it afterwards.
Usage: python scripts/probe_falkordb.py [--host localhost] [--port 6379]
"""

import argparse
import sys

from falkordb import FalkorDB

GRAPH = "probe_tmp"
results: list[tuple[str, bool, str]] = []


def check(name):
    def wrap(fn):
        try:
            detail = fn()
            results.append((name, True, detail or ""))
        except Exception as e:  # noqa: BLE001 - report every failure, keep going
            results.append((name, False, f"{type(e).__name__}: {e}"))
        return fn

    return wrap


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", type=int, default=6379)
    args = ap.parse_args()

    db = FalkorDB(host=args.host, port=args.port)
    g = db.select_graph(GRAPH)
    if GRAPH in db.list_graphs():
        g.delete()

    # Toy people graph: 6 attendees, two triangles joined by one bridge.
    g.query(
        """
        UNWIND range(0, 5) AS i
        CREATE (:Attendee {id: 'p' + toString(i), reached: []})
        """
    )
    g.query(
        """
        UNWIND [['p0','p1'],['p1','p2'],['p2','p0'],['p3','p4'],['p4','p5'],['p5','p3'],['p2','p3']] AS e
        MATCH (a:Attendee {id: e[0]}), (b:Attendee {id: e[1]})
        CREATE (a)-[:POS_TIE {p_pos: 0.6}]->(b), (b)-[:POS_TIE {p_pos: 0.6}]->(a)
        """
    )
    # Votes: everyone learned from p0 on topic 0.
    g.query(
        """
        MATCH (l:Attendee), (x:Attendee {id: 'p0'}) WHERE l.id <> 'p0'
        CREATE (l)-[:LEARNED_FROM_T0 {tick: 0}]->(x)
        """
    )

    @check("algo.pageRank(label, relType): scores sum to 1, expert ranks first")
    def _():
        rows = g.query(
            "CALL algo.pageRank('Attendee', 'LEARNED_FROM_T0') YIELD node, score "
            "RETURN node.id, score ORDER BY score DESC"
        ).result_set
        total = sum(r[1] for r in rows)
        assert abs(total - 1) < 1e-6, f"sum={total}"
        assert rows[0][0] == "p0", rows
        return f"sum={total:.4f}, top={rows[0][0]} ({rows[0][1]:.3f})"

    @check("algo.labelPropagation({nodeLabels, relationshipTypes, maxIterations})")
    def _():
        rows = g.query(
            "CALL algo.labelPropagation({nodeLabels: ['Attendee'], relationshipTypes: ['POS_TIE'], maxIterations: 10}) "
            "YIELD node, communityId RETURN node.id, communityId ORDER BY node.id"
        ).result_set
        assert len(rows) == 6, rows
        return f"communities={len({r[1] for r in rows})}: {dict(rows)}"

    @check("algo.betweenness({..., samplingSize, samplingSeed}): bridge nodes score highest")
    def _():
        rows = g.query(
            "CALL algo.betweenness({nodeLabels: ['Attendee'], relationshipTypes: ['POS_TIE'], samplingSize: 6, samplingSeed: 42}) "
            "YIELD node, score RETURN node.id, score ORDER BY score DESC"
        ).result_set
        assert {rows[0][0], rows[1][0]} == {"p2", "p3"}, rows
        return f"top={rows[0][0]},{rows[1][0]}"

    @check("algo.HarmonicCentrality({nodeLabels, relationshipTypes})")
    def _():
        rows = g.query(
            "CALL algo.HarmonicCentrality({nodeLabels: ['Attendee'], relationshipTypes: ['POS_TIE']}) "
            "YIELD node, score RETURN node.id, score ORDER BY score DESC"
        ).result_set
        assert len(rows) == 6, rows
        return f"top={rows[0][0]} ({rows[0][1]:.3f})"

    @check("algo.HarmonicCentrality errors on a missing relationship type (doc section 10)")
    def _():
        try:
            g.query(
                "CALL algo.HarmonicCentrality({nodeLabels: ['Attendee'], relationshipTypes: ['NO_SUCH_TYPE']}) "
                "YIELD node, score RETURN count(node)"
            )
        except Exception as e:  # noqa: BLE001
            return f"raises as documented: {e}"
        return "does NOT raise (guard is still harmless)"

    @check("algo.WCC({nodeLabels, relationshipTypes})")
    def _():
        rows = g.query(
            "CALL algo.WCC({nodeLabels: ['Attendee'], relationshipTypes: ['LEARNED_FROM_T0']}) "
            "YIELD node, componentId RETURN count(DISTINCT componentId)"
        ).result_set
        return f"components={rows[0][0]}"

    @check("algo.maxFlow over explicit Source/Sink with cap-1 edges yields a valid matching")
    def _():
        m = db.select_graph(GRAPH + "_match")
        if GRAPH + "_match" in db.list_graphs():
            m.delete()
        # A = a0..a2, B = b0..b2. a0 can only take b0; a1 takes b0 or b1; a2 takes b1 or b2.
        m.query(
            """
            CREATE (s:Source), (t:Sink)
            WITH s, t
            UNWIND ['a0','a1','a2'] AS a CREATE (s)-[:CAP {cap: 1}]->(:P {id: a, side: 'A'})
            """
        )
        m.query(
            """
            MATCH (t:Sink)
            UNWIND ['b0','b1','b2'] AS b CREATE (:P {id: b, side: 'B'})-[:CAP {cap: 1}]->(t)
            """
        )
        m.query(
            """
            UNWIND [['a0','b0'],['a1','b0'],['a1','b1'],['a2','b1'],['a2','b2']] AS e
            MATCH (a:P {id: e[0]}), (b:P {id: e[1]})
            CREATE (a)-[:CAP {cap: 1}]->(b)
            """
        )
        try:
            row = m.query(
                """
                MATCH (s:Source), (t:Sink)
                CALL algo.maxFlow({sourceNodes: [s], targetNodes: [t], capacityProperty: 'cap', relationshipTypes: ['CAP']})
                YIELD edges, edgeFlows, maxFlow
                RETURN [i IN range(0, size(edges) - 1) | [startNode(edges[i]).id, endNode(edges[i]).id, edgeFlows[i]]] AS flows, maxFlow
                """
            ).result_set[0]
        finally:
            m.delete()
        flows, max_flow = row
        pairs = sorted((a, b) for a, b, f in flows if a and b and f >= 1 and a.startswith("a") and b.startswith("b"))
        assert max_flow == 3, f"maxFlow={max_flow}"
        assert pairs == [("a0", "b0"), ("a1", "b1"), ("a2", "b2")], pairs
        return f"maxFlow={max_flow}, matching={pairs}"

    @check("multi-type pattern [r:A|B|C] returns all types, with alias referenced")
    def _():
        g.query(
            """
            MATCH (a:Attendee {id: 'p0'}), (b:Attendee {id: 'p4'})
            CREATE (a)-[:LINKEDIN]->(b), (a)-[:ADHOC {count: 1}]->(b), (b)-[:SPEED_DATE {act: 'yes'}]->(a)
            """
        )
        rows = g.query(
            "MATCH (u:Attendee)-[r:LINKEDIN|ADHOC|SPEED_DATE]->(v:Attendee) RETURN type(r), count(r)"
        ).result_set
        types = dict(rows)
        assert set(types) == {"LINKEDIN", "ADHOC", "SPEED_DATE"}, types
        return str(types)

    @check("empty-list property round-trips and can be appended to")
    def _():
        row = g.query("MATCH (a:Attendee {id: 'p1'}) RETURN a.reached, size(a.reached)").result_set[0]
        assert row == [[], 0], row
        row = g.query(
            "MATCH (a:Attendee {id: 'p1'}) SET a.reached = a.reached + ['EX-001'] RETURN a.reached"
        ).result_set[0]
        assert row == [["EX-001"]], row
        return "[] -> ['EX-001']"

    @check("float-list properties (T-length vectors) round-trip")
    def _():
        vec = [round(0.1 * i, 3) for i in range(10)]
        row = g.query(
            "MATCH (a:Attendee {id: 'p1'}) SET a.interest = $v RETURN a.interest", {"v": vec}
        ).result_set[0]
        assert row[0] == vec, row
        return "ok"

    @check("MERGE relationship ... ON CREATE SET, then increment (check-ins)")
    def _():
        q = """
            MATCH (a:Attendee {id: 'p1'}), (b:Attendee {id: 'p5'})
            MERGE (a)-[x:ADHOC]->(b) ON CREATE SET x.count = 0
            SET x.count = x.count + 1
            RETURN x.count
            """
        first = g.query(q).result_set[0][0]
        second = g.query(q).result_set[0][0]
        assert (first, second) == (1, 2), (first, second)
        return "1 -> 2"

    @check("relationship property filter in pattern {session: $s, date_no: $d}")
    def _():
        g.query(
            "MATCH (a:Attendee {id: 'p1'}), (b:Attendee {id: 'p2'}) "
            "CREATE (a)-[:SPEED_DATE {session: 0, date_no: 1, complete: false}]->(b)"
        )
        row = g.query(
            "MATCH (u:Attendee {id: 'p1'})-[e:SPEED_DATE {session: $s, date_no: $d}]->(v) "
            "SET e.complete = true RETURN v.id, e.complete",
            {"s": 0, "d": 1},
        ).result_set
        assert row == [["p2", True]], row
        return "ok"

    @check("POS_TIE delete-all and recreate")
    def _():
        g.query("MATCH ()-[p:POS_TIE]->() DELETE p")
        n = g.query("MATCH ()-[p:POS_TIE]->() RETURN count(p)").result_set[0][0]
        assert n == 0, n
        return "ok"

    g.delete()

    width = max(len(n) for n, _, _ in results)
    failed = 0
    for name, ok, detail in results:
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {detail}")
    print(f"\n{len(results) - failed}/{len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
