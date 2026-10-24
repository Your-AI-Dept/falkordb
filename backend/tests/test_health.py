from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError as RedisConnectionError

from app import db
from app.main import app

client = TestClient(app)


def test_health_ok(monkeypatch):
    class FakeDB:
        def list_graphs(self):
            return ["people"]

    monkeypatch.setattr(db, "ping", lambda: True)
    monkeypatch.setattr(db, "get_db", lambda: FakeDB())

    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "falkordb": True, "graphs": ["people"]}


def test_health_falkordb_down(monkeypatch):
    def down():
        raise RedisConnectionError("refused")

    monkeypatch.setattr(db, "ping", down)

    r = client.get("/health")
    assert r.status_code == 503
    assert r.json()["falkordb"] is False
