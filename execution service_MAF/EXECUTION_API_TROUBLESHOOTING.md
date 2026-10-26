# Execution API 404 / "Resource not found"

## Correct URLs (execution service, port 8765)

All routes are under **`/api/v1`**. In Swagger, use paths like:

- `POST /api/v1/agents/{agent_id}/threads` — body: `{"executionType":"TEST"}`
- `POST /api/v1/agents/{agent_id}/threads/{thread_id}/runs` — body: `{"input":"hello","stream":false,"background":false}`
- `GET /api/v1/agents/{agent_id}/threads`

**Authorization:** `Bearer <platform JWT>` (same token as the UI).  
Invoke routes (`/api/v1/invoke/...`) use **X-Api-Key**, not JWT.

## If you see `Agent config returned 404 for /api/v1/agents/...`

The execution service reached **agent-config**, but that service returned 404. Fix:

1. **`AGENT_CONFIG_BASE_URL`** in `execution-service/.env` — must be the agent-config root (e.g. `http://host:port` with **no** trailing path).  
   Client calls: `{base}/api/v1/agents/{id}` and `{base}/api/v1/agents/{id}/runtime-manifest`.
2. **Agent id** must exist in agent-config (same id as in the studio UI).
3. Use the **same Bearer token** in Swagger as in the UI so agent-config authorizes the read.

## If you see plain `{"detail":"Not Found"}`

- Wrong path (missing `/api/v1`) or wrong host/port.
- Frontend: set `VITE_EXECUTION_BASE_URL=http://localhost:8765` **or** proxy via `VITE_EXECUTION_PREFIX` + `VITE_API_BASE_URL`.

## Frontend env (local)

```env
VITE_EXECUTION_BASE_URL=http://localhost:8765
```

Or behind a gateway:

```env
VITE_API_BASE_URL=https://your-gateway
VITE_EXECUTION_PREFIX=/execution
```
