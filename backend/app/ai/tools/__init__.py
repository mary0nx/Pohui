"""Importing this package registers every AI tool."""

from app.ai.tools import calendar_tools, finance_tools, home_tools, memory_tools  # noqa: F401
from app.ai.tools.registry import REGISTRY, tool_schemas

__all__ = ["REGISTRY", "tool_schemas"]
