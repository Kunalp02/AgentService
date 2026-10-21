FROM python:3.12-slim
WORKDIR /app
COPY execution-service/pyproject.toml execution-service/README.md ./
COPY execution-service/src ./src
RUN pip install --no-cache-dir .
EXPOSE 8765
CMD ["agent-execution"]



