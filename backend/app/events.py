"""In-process SSE broadcaster for GET /events.

Lives outside main.py so services (e.g. pipeline.py) can publish without
importing the app. publish() is safe to call from sync endpoints, which
FastAPI runs in a worker thread.
"""

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

EVENT_TYPES = frozenset(
    {
        "session_opened",
        "date_opened",
        "answer_recorded",
        "date_closed",
        "session_closed",
        "checkin_recorded",
    }
)


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def publish(self, event: str, data: Any) -> None:
        if event not in EVENT_TYPES:
            raise ValueError(f"unknown event type {event!r}")
        if self._loop is None:
            return
        message = f"event: {event}\ndata: {json.dumps(data)}\n\n"
        self._loop.call_soon_threadsafe(self._fan_out, message)

    def _fan_out(self, message: str) -> None:
        for queue in self._subscribers:
            queue.put_nowait(message)

    async def stream(self, keepalive: float = 15.0) -> AsyncIterator[str]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        self._subscribers.add(queue)
        try:
            yield ": connected\n\n"
            while True:
                try:
                    yield await asyncio.wait_for(queue.get(), timeout=keepalive)
                except TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            self._subscribers.discard(queue)


bus = EventBus()
