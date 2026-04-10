FROM python:3.11-slim

WORKDIR /app

# System deps for faster-whisper + FFmpeg + native Python wheels (e.g. webrtcvad)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
# torch is NOT installed — transcription.py detects its absence and uses CPU automatically
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data

ENV PIXEL_HOST=0.0.0.0
ENV PIXEL_PORT=8000
ENV PIXEL_DATA_DIR=/data
ENV PIXEL_OPEN_BROWSER=false

EXPOSE 8000

CMD ["python", "main.py"]
