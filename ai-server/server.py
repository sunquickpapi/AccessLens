"""
AccessLens AI server.

    POST /analyse   multipart form field "photo"  ->  JSON result
    GET  /health                                   ->  {"ok": true, "model": ...}

Run it with ./start-ai.sh (macOS) or:  python server.py
"""

from __future__ import annotations

import os
import socket
import time

from flask import Flask, jsonify, request
from flask_cors import CORS

from accesslens_ai import make_analyser

PORT = int(os.environ.get("ACCESSLENS_PORT", "8000"))
MAX_MB = 15

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_MB * 1024 * 1024
CORS(app)  # lets the browser preview of the app call the server too

print("Loading AI models… (the first run downloads them, about 1 GB)", flush=True)
started = time.time()
analyser = make_analyser(with_box=os.environ.get("ACCESSLENS_NO_BOX") != "1")
print(f"Models ready in {time.time() - started:.1f}s  [{analyser.name}]", flush=True)


@app.get("/health")
def health():
    return jsonify(ok=True, model=analyser.name)


@app.post("/analyse")
def analyse():
    photo = request.files.get("photo")
    if photo is None:
        return jsonify(error="Send the image as a multipart field called 'photo'."), 400
    data = photo.read()
    if not data:
        return jsonify(error="The photo was empty."), 400
    t = time.time()
    try:
        result = analyser.analyse(data)
    except Exception as e:  # unreadable image etc.
        return jsonify(error=f"Could not analyse this photo: {e}"), 422
    body = result.to_json()
    body["ms"] = int((time.time() - t) * 1000)
    label = body["category"] or "no barrier"
    print(f"analysed: {label} {body['confidence']:.0%} in {body['ms']} ms", flush=True)
    return jsonify(body)


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # no packets are sent; this just picks the Wi-Fi address
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    ip = lan_ip()
    print("")
    print("  AccessLens AI is running.")
    print(f"  On this Mac:   http://127.0.0.1:{PORT}/health")
    print(f"  On your Wi-Fi: http://{ip}:{PORT}/health")
    print("  The app finds it automatically when it's opened with `npx expo start`.")
    print("  Keep this window open. Press Ctrl+C to stop.")
    print("")
    app.run(host="0.0.0.0", port=PORT, threaded=False)
