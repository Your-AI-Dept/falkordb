"""FastAPI app, routers, SSE."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from redis.exceptions import RedisError

from app import db
from app.config import settings
from app.events import bus
from app.models import Health


@asynccontextmanager
async def lifespan(app: FastAPI):
    bus.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title="Conference Knowledge Graph", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=Health)
def health(response: Response) -> Health:
    try:
        db.ping()
        graphs = db.get_db().list_graphs()
    except RedisError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return Health(status="unavailable", falkordb=False, graphs=[])
    return Health(status="ok", falkordb=True, graphs=graphs)


@app.get("/events")
async def events() -> StreamingResponse:
    return StreamingResponse(
        bus.stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
