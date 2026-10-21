# Platform auth middleware (`ccil_webapi_middleware_fastapi`)

Execution service can enforce platform JWT + Redis session validation via the CCIL FastAPI middleware wheels.

## Step 1 — Install wheels

Place the `.whl` files in `execution-service/wheels/` (or any folder), then install:

```bash
cd execution-service
python -m pip install --upgrade pip
python -m pip install --find-links "./wheels" \
  ccil-webapi-middleware-fastapi==1.2.0 \
  ccil-webapi-middleware==2.1.0 \
  ccil-cache-redis==1.1.0
```

Or install the platform extra (same versions; requires wheels on `--find-links`):

```bash
pip install --find-links "./wheels" -e ".[platform-auth]"
```

Verify:

```bash
python -m pip show ccil-webapi-middleware-fastapi ccil-webapi-middleware ccil-cache-redis
```

Expected: **1.2.0**, **2.1.0**, **1.1.0**.

## Step 2 — Configuration file

```bash
cp ai-platform-config.yml.example ai-platform-config.yml
# edit Redis and JWT settings
```

Keep `ai-platform-config.yml` in the **execution-service** directory (same level as `pyproject.toml`), not under `src/`.

## Step 3 — Check configuration

From `execution-service`:

```bash
python -m ccil_webapi_middleware
```

## Step 4 — Enable middleware on the API process

In `.env`:

```env
AUTH_MIDDLEWARE_ENABLED=true
```

Start the service from `execution-service` so the middleware can resolve `ai-platform-config.yml`:

```bash
agent-execution
```

## Step 5 — Run locally

```bash
python -m uvicorn agent_execution.main:app --host 127.0.0.1 --port 8765
```

Public routes and invoke API-key routes are defined in `src/agent_execution/guard.py`.

**Note:** Requests with header `x-service-key` skip JWT middleware (`skip` callback). Only use this if downstream code validates that key.
