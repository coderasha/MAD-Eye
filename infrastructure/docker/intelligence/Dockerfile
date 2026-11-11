FROM python:3.11-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY intelligence ./intelligence
COPY model-factory ./model-factory
RUN uv sync --frozen --package madeye-intelligence --no-dev
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/intelligence"
EXPOSE 8000
CMD ["uvicorn", "services.gateway.app:app", "--host", "0.0.0.0", "--port", "8000"]
