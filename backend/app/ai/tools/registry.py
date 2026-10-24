"""Registry of the only operations the AI may perform.

Each tool has a strict Pydantic argument schema and a mode:
  read    - executed immediately, returns data the user may see
  auto    - simple explicit change; executed immediately when the family allows AI
            auto-actions, otherwise turned into a confirmation proposal
  confirm - always becomes a proposal that the user must confirm in the UI/bot
Family and user always come from the verified session (ToolContext), never from arguments.
"""

from __future__ import annotations

import copy
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Channel
from app.security.access import FamilyContext

Mode = Literal["read", "auto", "confirm"]


@dataclass
class ToolContext:
    db: AsyncSession
    ctx: FamilyContext
    channel: Channel
    conversation_id: Any = None


class ToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


@dataclass
class Prepared:
    """Result of preparing a confirm-mode call: normalized arguments + human preview."""

    arguments: dict[str, Any]
    summary: str
    details: list[str]
    target_version: str | None = None


Handler = Callable[[ToolContext, Any], Awaitable[dict[str, Any]]]
Preparer = Callable[[ToolContext, Any], Awaitable[Prepared]]
VersionCheck = Callable[[ToolContext, dict[str, Any]], Awaitable[str | None]]


@dataclass
class Tool:
    name: str
    description: str
    args: type[ToolArgs]
    mode: Mode
    handler: Handler
    # For auto/confirm tools: resolve names to ids and build a preview without side effects.
    prepare: Preparer | None = None
    # For update tools: returns the current version of the target to detect stale proposals.
    current_version: VersionCheck | None = None

    def schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": _inline_refs(self.args.model_json_schema()),
        }


def _inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Inline $defs/$ref and drop titles for a compact, widely compatible JSON schema."""
    defs = schema.pop("$defs", {})

    def walk(node: Any, is_properties: bool = False) -> Any:
        if isinstance(node, dict):
            if "$ref" in node and not is_properties:
                ref = node["$ref"].split("/")[-1]
                return walk(copy.deepcopy(defs[ref]))
            if is_properties:  # keys are field names: keep them all (a field may be "title")
                return {k: walk(v) for k, v in node.items()}
            return {
                k: walk(v, is_properties=(k == "properties"))
                for k, v in node.items()
                if not (k == "title" and isinstance(v, str))
            }
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    out = walk(schema)
    out.setdefault("properties", {})
    return out


REGISTRY: dict[str, Tool] = {}


def register(tool: Tool) -> Tool:
    if tool.name in REGISTRY:
        raise ValueError(f"duplicate tool {tool.name}")
    if tool.mode != "read" and tool.prepare is None:
        raise ValueError(f"tool {tool.name} changes data and needs a prepare step")
    REGISTRY[tool.name] = tool
    return tool


def tool_schemas() -> list[dict[str, Any]]:
    return [t.schema() for t in REGISTRY.values()]
