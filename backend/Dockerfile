# ============================================================
# Synapse API — production image
# Build context: backend/   (see docker-compose.yml / render.yaml)
# ============================================================
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    CHROMA_TELEMETRY_OPTOUT=true

WORKDIR /app

# System deps:
#  - tesseract-ocr : OCR for scanned image uploads (pytesseract)
#  - libgl/libsm/libxext6 : shared libs some ML/torch wheels expect
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libtesseract-dev \
    libgl1 \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Chroma + file storage persist inside the container; mount volumes
# in compose / Render disks so data survives restarts.
RUN mkdir -p /app/chroma_db /app/storage

EXPOSE 8000

# Apply migrations, then serve. (Render uses preDeployCommand for the
# migration and startCommand for the server instead of this CMD.)
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
