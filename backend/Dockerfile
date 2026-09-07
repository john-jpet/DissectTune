FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Real Demucs/Torch are heavy GPU deps; skip them for the default stubbed API/worker image.
# Set INSTALL_DEMUCS=true to build a worker image capable of real HTDemucs inference.
ARG INSTALL_DEMUCS=false
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
RUN if [ "$INSTALL_DEMUCS" = "true" ]; then \
      pip install --no-cache-dir torch==2.4.1 torchaudio==2.4.1 --index-url "$TORCH_INDEX_URL" && \
      pip install --no-cache-dir -r requirements.txt; \
    else \
      grep -vE '^(demucs|torch|pyrubberband)' requirements.txt > requirements.min.txt && \
      pip install --no-cache-dir -r requirements.min.txt; \
    fi

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
