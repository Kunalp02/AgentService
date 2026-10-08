from __future__ import annotations

import asyncio
import logging
from uuid import UUID

import httpx

from agent_execution.core.exceptions import ServiceError
from agent_execution.infrastructure.platform.platform_clients import PlatformClients
from agent_execution.schemas.runtime import (
    AgentMemoryScope,
    AgentToolRef,
    KnowledgeBaseMode,
    KnowledgeBaseRef,
    MemoryConfig,
    ModelConfig,
    RemoteMcpServerConfig,
    RuntimeManifest,
    ToolType,
)
from agent_execution.services.manifest_cache import ManifestCache
from agent_execution.services.manifest_hash import compute_manifest_hash
from agent_execution.services.model_cache import ModelCache
from agent_execution.settings import Settings

logger = logging.getLogger(__name__)


class ManifestService:
    def __init__(self, settings: Settings, platform: PlatformClients) -> None:
        self._settings = settings
        self._platform = platform
        self._cache = ManifestCache(settings.manifest_cache_ttl_seconds)
        self._model_cache = ModelCache(settings.model_cache_ttl_seconds)

    async def resolve(
        self,
        agent_id: UUID,
        bearer_token: str | None,
        *,
        revision_id: UUID | None = None,
        published_only: bool = False,
    ) -> RuntimeManifest:
        cache_key = f"{agent_id}:{revision_id or 'live'}:{int(published_only)}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        raw = await self._load_raw(
            agent_id,
            bearer_token,
            revision_id=revision_id,
            published_only=published_only,
        )
        if raw is not None and self._settings.use_runtime_manifest_endpoint:
            manifest = self._from_runtime_payload(raw, agent_id)
        else:
            agent = await self._platform.agent.get_agent(agent_id, bearer_token)
            model_raw = await self._resolve_model(agent, bearer_token)
            manifest = self._build_manifest(agent_id, agent, model_raw)

        if published_only and not manifest.is_published:
            raise ServiceError(
                "AGENT_NOT_PUBLISHED",
                "This caller can only run a published agent revision.",
                400,
            )
        self._cache.set(cache_key, manifest)
        return manifest

    async def _load_raw(
        self,
        agent_id: UUID,
        bearer_token: str | None,
        *,
        revision_id: UUID | None,
        published_only: bool,
    ) -> dict | None:
        if not self._settings.use_runtime_manifest_endpoint:
            return None
        if revision_id is not None:
            return await self._platform.agent.get_revision_manifest(
                agent_id, revision_id, bearer_token
            )
        if published_only:
            try:
                return await self._platform.agent.get_current_published_manifest(
                    agent_id, bearer_token
                )
            except ServiceError as exc:
                if exc.status_code not in (404, 405):
                    raise
        try:
            return await self._platform.agent.get_runtime_manifest(
                agent_id, bearer_token
            )
        except ServiceError as exc:
            if exc.status_code not in (404, 405):
                raise
            return None

    async def _resolve_model(self, agent: dict, bearer_token: str | None) -> dict:
        model_name = agent.get("modelName") or agent.get("model_name")
        if self._settings.skip_model_registry_lookup and model_name:
            return {
                "name": model_name,
                "modelIdentifier": model_name,
                "provider": "openai",
            }
        model_id = UUID(str(agent["modelId"]))
        return await self._model_cache.get_or_fetch(
            model_id, bearer_token, self._platform.tools.get_model
        )

    @staticmethod
    def _from_runtime_payload(raw: dict, agent_id: UUID) -> RuntimeManifest:
        model = raw.get("model") or {}
        memory = raw.get("memory") or {}
        scope_raw = memory.get("scope")
        scope = AgentMemoryScope(scope_raw) if scope_raw else None
        revision_raw = raw.get("revisionId")
        manifest = RuntimeManifest(
            agent_id=UUID(str(raw.get("agentId") or agent_id)),
            name=raw["name"],
            status=raw.get("status", "Draft"),
            group_ids=[UUID(str(g)) for g in raw.get("groupIds") or []],
            system_prompt=raw.get("systemPrompt") or "You are a helpful assistant.",
            temperature=float(raw.get("temperature") or 0.7),
            model=ModelConfig(
                model_id=UUID(str(model.get("modelId") or raw.get("modelId"))),
                name=model.get("name"),
                model_identifier=model.get("modelIdentifier")
                or model.get("name")
                or "gpt-4o-mini",
                provider=(model.get("provider") or "openai").lower(),
                base_url=model.get("baseUrl"),
                group_ids=[UUID(str(g)) for g in model.get("groupIds") or []],
            ),
            tools=[
                AgentToolRef(
                    tool_id=UUID(str(t["toolId"])),
                    tool_name=t.get("toolName"),
                    tool_type=ToolType(t.get("toolType", "Remote")),
                )
                for t in raw.get("tools") or []
            ],
            remote_mcp_servers=ManifestService._remote_servers(raw),
            knowledge_bases=[
                KnowledgeBaseRef(
                    knowledge_base_id=UUID(str(kb["knowledgeBaseId"])),
                    knowledge_base_name=kb.get("knowledgeBaseName"),
                    mode=KnowledgeBaseMode(kb.get("mode", "Context")),
                )
                for kb in raw.get("knowledgeBases") or []
            ],
            memory=MemoryConfig(
                enabled=bool(memory.get("enabled")),
                scope=scope,
                retention=memory.get("retention"),
                instructions=memory.get("instructions"),
            ),
            manifest_hash=raw.get("manifestHash") or "",
            revision_id=UUID(str(revision_raw)) if revision_raw else None,
        )
        if not manifest.manifest_hash:
            manifest.manifest_hash = _hash_manifest(manifest)
        return manifest

    @staticmethod
    def _build_manifest(
        agent_id: UUID, agent: dict, model_raw: dict
    ) -> RuntimeManifest:
        scope_raw = agent.get("memoryScope")
        scope = AgentMemoryScope(scope_raw) if scope_raw else None
        manifest = RuntimeManifest(
            agent_id=agent_id,
            name=agent["name"],
            status=agent.get("status", "Draft"),
            group_ids=[UUID(str(g)) for g in agent.get("groupIds") or []],
            system_prompt=agent.get("systemPrompt") or "You are a helpful assistant.",
            temperature=float(agent.get("temperature") or 0.7),
            model=ModelConfig(
                model_id=UUID(str(agent["modelId"])),
                name=model_raw.get("name") or agent.get("modelName"),
                model_identifier=model_raw.get("modelIdentifier")
                or model_raw.get("name")
                or "gpt-4o-mini",
                provider=(
                    model_raw.get("provider")
                    or model_raw.get("classification")
                    or "openai"
                ).lower(),
                base_url=model_raw.get("baseUrl") or model_raw.get("endpoint"),
                group_ids=[UUID(str(g)) for g in model_raw.get("groupIds") or []],
            ),
            tools=[
                AgentToolRef(
                    tool_id=UUID(str(t["toolId"])),
                    tool_name=t.get("toolName"),
                    tool_type=ToolType(t.get("toolType", "Remote")),
                )
                for t in agent.get("tools") or []
            ],
            remote_mcp_servers=ManifestService._remote_servers(agent),
            knowledge_bases=[
                KnowledgeBaseRef(
                    knowledge_base_id=UUID(str(kb["knowledgeBaseId"])),
                    knowledge_base_name=kb.get("knowledgeBaseName"),
                    mode=KnowledgeBaseMode(kb.get("mode", "Context")),
                )
                for kb in agent.get("knowledgeBases") or []
            ],
            memory=MemoryConfig(
                enabled=bool(agent.get("memoryEnabled")),
                scope=scope,
                retention=agent.get("memoryRetention"),
                instructions=agent.get("memoryInstructions"),
            ),
        )
        manifest.manifest_hash = _hash_manifest(manifest)
        return manifest


    @staticmethod
    def _remote_servers(raw: dict) -> list[RemoteMcpServerConfig]:
        servers: list[RemoteMcpServerConfig] = []
        for server in raw.get("remoteMcpServers") or []:
            server_id = server.get("id")
            if not server_id:
                continue
            tools = []
            for tool in server.get("tools") or []:
                tool_id = tool.get("toolId") or tool.get("id")
                if not tool_id:
                    continue
                tools.append(
                    AgentToolRef(
                        tool_id=UUID(str(tool_id)),
                        tool_name=tool.get("toolName") or tool.get("name"),
                        tool_type=ToolType.REMOTE,
                    )
                )
            group_ids = []
            for group_id in server.get("groupIds") or []:
                group_ids.append(UUID(str(group_id)))
            servers.append(
                RemoteMcpServerConfig(
                    id=UUID(str(server_id)),
                    name=server.get("name"),
                    remote_mcp_server_url=server.get("remoteMcpServerUrl"),
                    transport_type=server.get("transportType"),
                    auth_option=server.get("authOption"),
                    api_key=server.get("apiKey"),
                    group_ids=group_ids,
                    tools=tools,
                )
            )
        return servers


def _hash_manifest(manifest: RuntimeManifest) -> str:
    return compute_manifest_hash(
        {
            "system_prompt": manifest.system_prompt,
            "temperature": manifest.temperature,
            "model": manifest.model.model_identifier,
            "tools": [t.model_dump(mode="json") for t in manifest.tools],
            "kbs": [k.model_dump(mode="json") for k in manifest.knowledge_bases],
            "memory": manifest.memory.model_dump(mode="json"),
            "status": manifest.status,
            "revision": str(manifest.revision_id or ""),
        }
    )


class RagContextService:
    ASK_TIMEOUT_SECONDS = 20.0

    def __init__(self, platform: PlatformClients) -> None:
        self._platform = platform

    async def fetch_context(
        self, manifest: RuntimeManifest, user_input: str, bearer_token: str | None
    ) -> tuple[list[str], list[dict]]:
        context_kbs = [
            kb
            for kb in manifest.knowledge_bases
            if kb.mode == KnowledgeBaseMode.CONTEXT
        ]
        if not context_kbs:
            return [], []

        async def fetch_one(kb: KnowledgeBaseRef) -> dict:
            entry: dict = {
                "knowledge_base_id": str(kb.knowledge_base_id),
                "knowledge_base_name": kb.knowledge_base_name,
                "label": kb.knowledge_base_name or str(kb.knowledge_base_id),
                "claims": [],
            }
            try:
                result = await asyncio.wait_for(
                    self._platform.rag_ask.ask(
                        kb.knowledge_base_id, user_input, bearer_token
                    ),
                    timeout=self.ASK_TIMEOUT_SECONDS,
                )
            except (
                ServiceError,
                httpx.HTTPError,
                asyncio.TimeoutError,
                ValueError,
            ) as exc:
                # Any failure of one KB must not fail the run, and must leave a trace in the run record.
                logger.warning(
                    "RAG ask failed for kb=%s: %s",
                    kb.knowledge_base_id,
                    type(exc).__name__,
                    exc_info=True,
                )
                return {**entry, "error": type(exc).__name__}

            embedding = result.get("embedding_used") or {}
            if embedding.get("available") is False:
                logger.warning(
                    "RAG kb=%s answered without embeddings: %s",
                    kb.knowledge_base_id,
                    embedding.get("problem"),
                )
            evidence = result.get("evidence") or []
            entry.update(
                evidence=evidence,
                answer=result.get("answer"),
                confidence=result.get("confidence"),
                groundedness=result.get("groundedness"),
                retrieval_mode=result.get("mode"),
                embedding_available=embedding.get("available"),
            )
            # Only live claims go to the model: skip empty text and anything superseded/retired.
            entry["claims"] = [
                (str(item["claim"]).strip(), item.get("source"))
                for item in evidence
                if str(item.get("claim") or "").strip()
                and str(item.get("status") or "ACTIVE").upper() == "ACTIVE"
            ]
            return entry

        results = await asyncio.gather(*(fetch_one(kb) for kb in context_kbs))
        blocks: list[str] = []
        raw_context: list[dict] = []
        number = (
            0  # one running number across all KBs so [n] is unambiguous for the model
        )
        for entry in results:
            claims = entry.pop("claims")
            label = entry.pop("label")
            raw_context.append(entry)
            if not claims:
                continue
            lines = []
            for claim, source in claims:
                number += 1
                lines.append(
                    f"[{number}] {claim}" + (f" (source: {source})" if source else "")
                )
            blocks.append(f"KB: {label}\n" + "\n".join(lines))
        return blocks, raw_context
