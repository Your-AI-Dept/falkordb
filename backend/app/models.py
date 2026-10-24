"""Pydantic models for the REST API."""

from pydantic import BaseModel


class Health(BaseModel):
    status: str
    falkordb: bool
    graphs: list[str]
