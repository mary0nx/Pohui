"""Importing this package registers every AI tool."""

from app.ai.tools import (  # noqa: F401
    calendar_tools,
    finance_tools,
    home_tools,
    kitchen_tools,
    memory_tools,
)
from app.ai.tools.registry import REGISTRY, tool_schemas

__all__ = ["REGISTRY", "tool_schemas"]
