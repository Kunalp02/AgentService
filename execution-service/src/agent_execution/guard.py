"""Routes excluded from ccil_webapi_middleware_fastapi JWT protection."""

from __future__ import annotations

# OpenAPI / Swagger
PUBLIC: list[str] = [
    "/docs",
    "/openapi.json",
    "/redoc",
]

# Kubernetes probes (router prefix is /api/v1)
PUBLIC.extend(
    [
        "/api/v1/health/live",
        "/api/v1/health/ready",
    ]
)

# Published invoke API uses X-Api-Key in route handlers, not platform JWT.
PUBLIC_PREFIX: str = "/api/v1/invoke"
