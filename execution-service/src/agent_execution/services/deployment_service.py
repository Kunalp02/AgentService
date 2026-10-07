# from __future__ import annotations

# import hashlib
# import logging
# import re
# import secrets
# from datetime import datetime, timezone
# from uuid import UUID, uuid4

# from agent_execution.core.exceptions import ServiceError
# from agent_execution.infrastructure.persistence.deployment_repository import (
#     DeploymentRepository,
# )
# from agent_execution.schemas.runs import CreateDeploymentRequest, DeploymentResponse
# from agent_execution.schemas.threads import RetentionPolicy
# from agent_execution.services.manifest_service import ManifestService

# logger = logging.getLogger(__name__)
# _SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")


# def hash_api_key(api_key: str) -> str:
#     return hashlib.sha256(api_key.encode()).hexdigest()


# class DeploymentService:
#     def __init__(self, repo: DeploymentRepository, manifests: ManifestService) -> None:
#         self._repo = repo
#         self._manifests = manifests

#     async def create(
#         self, agent_id: UUID, request: CreateDeploymentRequest, bearer_token: str | None
#     ) -> DeploymentResponse:
#         slug = request.slug.strip().lower()
#         if not _SLUG.match(slug):
#             raise ServiceError(
#                 "VALIDATION_FAILED",
#                 "slug must be 2-63 characters of lowercase letters, numbers, and hyphens.",
#                 400,
#             )
#         try:
#             retention = RetentionPolicy(request.retention_policy)
#         except ValueError as exc:
#             raise ServiceError(
#                 "VALIDATION_FAILED", "Unknown retention policy.", 400
#             ) from exc
#         manifest = await self._manifests.resolve(
#             agent_id,
#             bearer_token,
#             revision_id=request.revision_id,
#             published_only=True,
#         )
#         api_key = f"ak_{secrets.token_urlsafe(32)}"
#         deployment_id = uuid4()
#         await self._repo.insert(
#             deployment_id=deployment_id,
#             agent_id=agent_id,
#             slug=slug,
#             revision_id=manifest.revision_id or request.revision_id,
#             api_key_hash=hash_api_key(api_key),
#             retention_policy=retention.value,
#         )
#         logger.info(
#             "deployment.created deploymentId=%s agentId=%s slug=%s revisionId=%s",
#             deployment_id,
#             agent_id,
#             slug,
#             manifest.revision_id or request.revision_id,
#         )
#         return DeploymentResponse(
#             deployment_id=deployment_id,
#             agent_id=agent_id,
#             slug=slug,
#             revision_id=manifest.revision_id or request.revision_id,
#             retention_policy=retention.value,
#             enabled=True,
#             created_at=datetime.now(timezone.utc),
#             api_key=api_key,
#         )

#     async def list(
#         self, agent_id: UUID, bearer_token: str | None
#     ) -> list[DeploymentResponse]:
#         await self._manifests.resolve(agent_id, bearer_token)
#         return [self._row(row) for row in await self._repo.list_for_agent(agent_id)]

#     # async def authenticate(self, slug: str, api_key: str | None):
#     #     if not api_key:
#     #         raise ServiceError("UNAUTHORIZED", "X-Api-Key is required.", 401)
#     #     row = await self._repo.get_by_api_key_hash(hash_api_key(api_key))
#     #     if row is None or row["slug"] != slug or not row["enabled"]:
#     #         raise ServiceError("UNAUTHORIZED", "API key is not valid for this agent.", 401)
#     #     return row
#     async def authenticate(self, slug: str, api_key: str | None):
#         row = await self._row_for_key(api_key)
#         if row["slug"] != slug:
#             raise ServiceError(
#                 "UNAUTHORIZED", "API key is not valid for this agent.", 401
#             )
#         return row

#     async def authenticate_for_agent(self, agent_id: UUID, api_key: str | None):
#         row = await self._row_for_key(api_key)
#         if row["agent_id"] != agent_id:
#             raise ServiceError(
#                 "UNAUTHORIZED", "API key is not valid for this agent.", 401
#             )
#         return row

#     async def require_published(self, agent_id: UUID) -> None:
#         await self._manifests.resolve(agent_id, None, published_only=True)

#     async def _row_for_key(self, api_key: str | None):
#         if not api_key:
#             raise ServiceError("UNAUTHORIZED", "X-Api-Key is required.", 401)
#         row = await self._repo.get_by_api_key_hash(hash_api_key(api_key))
#         if row is None or not row["enabled"]:
#             raise ServiceError(
#                 "UNAUTHORIZED", "API key is not valid for this agent.", 401
#             )
#         return row

#     @staticmethod
#     def _row(row, api_key: str | None = None) -> DeploymentResponse:
#         return DeploymentResponse(
#             deployment_id=row["deployment_id"],
#             agent_id=row["agent_id"],
#             slug=row["slug"],
#             revision_id=row["revision_id"],
#             retention_policy=row["retention_policy"],
#             enabled=row["enabled"],
#             created_at=row["created_at"],
#             api_key=api_key,
#         )


from __future__ import annotations

import hashlib
import logging
import re
import secrets
from datetime import datetime, timezone
from uuid import UUID, uuid4

from agent_execution.core.exceptions import ServiceError
from agent_execution.infrastructure.persistence.deployment_repository import (
    DeploymentRepository,
)
from agent_execution.schemas.runs import CreateDeploymentRequest, DeploymentResponse
from agent_execution.schemas.threads import RetentionPolicy
from agent_execution.services.key_crypto import decrypt_key, encrypt_key
from agent_execution.services.manifest_service import ManifestService
from agent_execution.settings import Settings

logger = logging.getLogger(__name__)
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")


def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:50].strip("-")
    return s if len(s) >= 2 else "agent"


class DeploymentService:
    def __init__(
        self, repo: DeploymentRepository, manifests: ManifestService, settings: Settings
    ) -> None:
        self._repo = repo
        self._manifests = manifests
        self._settings = settings

    def _base(self, request_base: str) -> str:
        return (self._settings.public_base_url or request_base).rstrip("/")

    def _row(
        self, row, request_base: str, api_key: str | None = None
    ) -> DeploymentResponse:
        base = self._base(request_base)
        revealed = api_key or decrypt_key(
            self._settings.api_key_encryption_secret, row.get("api_key_enc")
        )
        return DeploymentResponse(
            deployment_id=row["deployment_id"],
            agent_id=row["agent_id"],
            slug=row["slug"],
            revision_id=row["revision_id"],
            retention_policy=row["retention_policy"],
            enabled=row["enabled"],
            created_at=row["created_at"],
            api_key=revealed,
            key_available=revealed is not None,
            invoke_url=f"{base}/api/v1/invoke/{row['slug']}",
            threads_url=f"{base}/api/v1/invoke/{row['slug']}/threads",
        )

    async def _unique_slug(self, wanted: str) -> str:
        slug, n = wanted, 1
        while await self._repo.get_by_slug(slug):
            n += 1
            slug = f"{wanted[:58]}-{n}"
        return slug

    async def create(
        self,
        agent_id: UUID,
        request: CreateDeploymentRequest,
        bearer_token: str | None,
        request_base: str,
    ) -> DeploymentResponse:
        try:
            retention = RetentionPolicy(request.retention_policy)
        except ValueError as exc:
            raise ServiceError(
                "VALIDATION_FAILED", "Unknown retention policy.", 400
            ) from exc
        manifest = await self._manifests.resolve(
            agent_id, bearer_token, revision_id=request.revision_id, published_only=True
        )

        existing = await self._repo.get_by_agent(agent_id)
        if existing:  # idempotent: one endpoint per agent
            return self._row(dict(existing), request_base)

        if request.slug:
            slug = request.slug.strip().lower()
            if not _SLUG.match(slug):
                raise ServiceError(
                    "VALIDATION_FAILED",
                    "slug must be 2-63 characters of lowercase letters, numbers, and hyphens.",
                    400,
                )
            if await self._repo.get_by_slug(slug):
                raise ServiceError("CONFLICT", f"Slug '{slug}' is already in use.", 409)
        else:
            slug = await self._unique_slug(_slugify(manifest.name))

        api_key = f"ak_{secrets.token_urlsafe(32)}"
        enc = encrypt_key(self._settings.api_key_encryption_secret, api_key)
        deployment_id = uuid4()
        try:
            await self._repo.insert(
                deployment_id=deployment_id,
                agent_id=agent_id,
                slug=slug,
                revision_id=manifest.revision_id or request.revision_id,
                api_key_hash=hash_api_key(api_key),
                api_key_enc=enc,
                retention_policy=retention.value,
            )
        except Exception as exc:
            if "duplicate key" in str(exc).lower():
                raise ServiceError(
                    "CONFLICT", f"Slug '{slug}' is already in use.", 409
                ) from exc
            raise
        logger.info(
            "deployment.created deploymentId=%s agentId=%s slug=%s",
            deployment_id,
            agent_id,
            slug,
        )
        row = await self._repo.get_by_slug(slug)
        return self._row(dict(row), request_base, api_key)

    async def list(
        self, agent_id: UUID, bearer_token: str | None, request_base: str
    ) -> list[DeploymentResponse]:
        await self._manifests.resolve(agent_id, bearer_token)
        return [
            self._row(dict(r), request_base)
            for r in await self._repo.list_for_agent(agent_id)
        ]

    async def rotate(
        self,
        agent_id: UUID,
        deployment_id: UUID,
        bearer_token: str | None,
        request_base: str,
    ) -> DeploymentResponse:
        await self._manifests.resolve(agent_id, bearer_token)
        row = next(
            (
                r
                for r in await self._repo.list_for_agent(agent_id)
                if r["deployment_id"] == deployment_id
            ),
            None,
        )
        if row is None:
            raise ServiceError("NOT_FOUND", "Deployment not found.", 404)
        api_key = f"ak_{secrets.token_urlsafe(32)}"
        await self._repo.rotate_key(
            deployment_id,
            hash_api_key(api_key),
            encrypt_key(self._settings.api_key_encryption_secret, api_key),
        )
        return self._row(dict(row), request_base, api_key)

    async def authenticate(self, slug: str, api_key: str | None):
        row = await self._row_for_key(api_key)
        if row["slug"] != slug:
            raise ServiceError(
                "UNAUTHORIZED", "API key is not valid for this agent.", 401
            )
        return row

    async def authenticate_for_agent(self, agent_id: UUID, api_key: str | None):
        row = await self._row_for_key(api_key)
        if row["agent_id"] != agent_id:
            raise ServiceError(
                "UNAUTHORIZED", "API key is not valid for this agent.", 401
            )
        return row

    async def require_published(self, agent_id: UUID) -> None:
        await self._manifests.resolve(agent_id, None, published_only=True)

    async def _row_for_key(self, api_key: str | None):
        if not api_key:
            raise ServiceError("UNAUTHORIZED", "X-Api-Key is required.", 401)
        row = await self._repo.get_by_api_key_hash(hash_api_key(api_key))
        if row is None or not row["enabled"]:
            raise ServiceError(
                "UNAUTHORIZED", "API key is not valid for this agent.", 401
            )
        return row
