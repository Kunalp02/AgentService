from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_execution.api.exception_handlers import register_exception_handlers
from agent_execution.api.middleware import RequestContextMiddleware
from agent_execution.api.router import create_api_router
from agent_execution.core.container import get_container, shutdown_container
from agent_execution.guard import PUBLIC, PUBLIC_API_KEY_ROUTE_PATTERNS
from agent_execution.logging_config import configure_logging, uvicorn_log_config
from agent_execution.settings import get_settings

os.environ.pop("SSL_CERT_FILE", None)
logger = logging.getLogger(__name__)

_SERVICE_ROOT = Path(__file__).resolve().parents[2]


def _configure_platform_auth_config() -> None:
    """Point the middleware package at ai-platform-config.yml when enabled."""
    settings = get_settings()
    if not settings.auth_middleware_enabled:
        return
    config_path = _SERVICE_ROOT / settings.ai_platform_config_file
    os.environ.setdefault("AI_PLATFORM_CONFIG", str(config_path.resolve()))


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    logger.info("Execution service starting")
    container = get_container(settings)
    await container.database.ping()
    logger.info("Execution database is ready")
    yield
    logger.info("Execution service stopping")
    await shutdown_container()


def _apply_auth_middleware(app: FastAPI) -> None:
    settings = get_settings()
    if not settings.auth_middleware_enabled:
        logger.info("Platform auth middleware disabled (set AUTH_MIDDLEWARE_ENABLED=true)")
        return
    try:
        from ccil_webapi_middleware_fastapi import FastAPIAuth
    except ImportError as exc:
        raise RuntimeError(
            "AUTH_MIDDLEWARE_ENABLED is true but ccil_webapi_middleware_fastapi is not "
            "installed. See execution-service/PLATFORM_AUTH_MIDDLEWARE.md."
        ) from exc

    _configure_platform_auth_config()
    FastAPIAuth().protect(
        app,
        public=[*PUBLIC, *PUBLIC_API_KEY_ROUTE_PATTERNS],
    )
    logger.info("Platform auth middleware enabled")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_format)
    app = FastAPI(
        title="Agent Execution Service",
        version="4.0.0",
        description="Thread and run runtime for studio test and published agent APIs.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)
    app.include_router(create_api_router())
    _apply_auth_middleware(app)
    return app


app = create_app()


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_format)
    uvicorn.run(
        "agent_execution.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level,
        log_config=uvicorn_log_config(settings.log_level, settings.log_format),
    )


if __name__ == "__main__":
    main()
