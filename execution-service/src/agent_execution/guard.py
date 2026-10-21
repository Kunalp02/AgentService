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

# Published agent APIs: validated with X-Api-Key in invoke_controller handlers,
# not with platform JWT at the middleware layer.
PUBLIC_API_KEY_ROUTE_PATTERNS: list[str] = [
    "/api/v1/invoke*",
    "/api/v1/agents/*/execute",
]
