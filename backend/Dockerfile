FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# SQLite lives on a mounted persistent disk (see render.yaml); the app creates tables and
# seeds the course on first boot (AUTO_SEED=1) and never overwrites existing learner data.
ENV DATABASE_URL=sqlite:////data/app.db
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
