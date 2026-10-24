"""Contract between the Mini App and the API for the endpoints used before login."""

from httpx import AsyncClient

# Must stay in sync with frontend/src/api/contracts.ts (MetaSchema) and types/api.ts (Meta).
META_FIELDS = {
    "env": str,
    "dev_auth": bool,
    "ai_available": bool,
    "bot_username": (str, type(None)),
    "storage": str,
    "max_upload_mb": int,
}


async def test_meta_contract(client: AsyncClient) -> None:
    r = await client.get("/api/v1/meta")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    body = r.json()
    assert set(body) == set(META_FIELDS)
    for key, expected in META_FIELDS.items():
        assert isinstance(body[key], expected), key
    # /meta is public: it must never expose secrets or tokens.
    assert "token" not in r.text.lower()


async def test_unknown_api_path_is_json_404(client: AsyncClient) -> None:
    r = await client.get("/api/v1/does-not-exist")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/json")


async def test_cors_allows_configured_frontend_origin_only(client: AsyncClient) -> None:
    allowed = "http://localhost:5173"  # default CORS_ORIGINS in tests
    preflight = {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
    }
    ok = await client.options("/api/v1/auth/telegram", headers={"Origin": allowed, **preflight})
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == allowed
    assert "authorization" in ok.headers["access-control-allow-headers"].lower()

    bad = await client.options(
        "/api/v1/auth/telegram", headers={"Origin": "https://evil.example", **preflight}
    )
    assert "access-control-allow-origin" not in bad.headers
