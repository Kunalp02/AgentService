# CCIL AI Platform — AgentService monorepo

| Folder | Description |
|--------|-------------|
| [agent-config-service](./agent-config-service/) | .NET agent configuration API and `Config_AIAgent.cnf` |
| [execution-service](./execution-service/) | Python agent runtime (threads, runs, LangGraph) |
| [storage-service](./storage-service/) | Artifact storage API |
| [platform-auth](./platform-auth/) | Shared JWT verification library |
| [rag-config-service](./rag-config-service/) | OpenAPI contract for RAG / knowledge-base config |
| [tools-model-config-service](./tools-model-config-service/) | OpenAPI contract for tools, gateways, and model registry |
| [frontend](./frontend/) | Vite/React management console |
| [studio-ui](./studio-ui/) | Docker/nginx wrapper for the console (build from `frontend` sources when wired) |
