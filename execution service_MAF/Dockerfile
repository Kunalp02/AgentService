FROM python:3.12-slim
WORKDIR /app
COPY execution-service/pyproject.toml execution-service/README.md ./
COPY execution-service/src ./src
# Optional platform-auth wheels (ccil-webapi-middleware-fastapi, etc.):
# COPY execution-service/wheels /wheels
# RUN pip install --no-cache-dir /wheels/*.whl
COPY execution-service/ai-platform-config.yml.example ./ai-platform-config.yml.example
RUN pip install --no-cache-dir .
EXPOSE 8765
CMD ["agent-execution"]



