FROM python:3.12-slim
WORKDIR /app
COPY storage-service/pyproject.toml storage-service/README.md ./
COPY storage-service/src ./src
RUN pip install --no-cache-dir .
EXPOSE 8770
CMD ["storage-service"]
