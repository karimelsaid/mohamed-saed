# Watin Transcriber - Python Backend

This is the Python FastAPI backend for the Watin (Lecture Transcription) application.

## Setup

1. Create virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install fastapi uvicorn faster-whisper rapidfuzz python-multipart
```

3. Run the server:
```bash
python server.py
```

The server will run on port 5050.
