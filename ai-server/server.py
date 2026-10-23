"""
AccessLens server — everything the app and the staff website need, on your Mac.

    http://<mac>:8000/staff        staff & admin website
    http://<mac>:8000/api/...      database API (see api.py)
    http://<mac>:8000/analyse      AI photo check
    http://<mac>:8000/health       status

Run it with:  npm run ai   (or: bash start-ai.sh)
"""

from __future__ import annotations

import os
import socket
import threading
import time
from pathlib import Path

from flask import Flask, jsonify, redirect, request, send_from_directory
from flask_cors import CORS

import db
from accesslens_ai import make_analyser
from api import ANALYSER, bp

HERE = Path(__file__).resolve().parent
STAFF_DIR = HERE / "staff"
PORT = int(os.environ.get("ACCESSLENS_PORT", "8000"))
MAX_MB = 25

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_MB * 1024 * 1024
app.json.sort_keys = False
CORS(app)  # lets the browser preview of the resident app call the server too
app.register_blueprint(bp)

db.init()
print(f"Database ready: {db.DB_PATH}", flush=True)

analyser = None
if os.environ.get("ACCESSLENS_NO_AI") == "1":
    print("AI switched off (ACCESSLENS_NO_AI=1). The website and database still work.", flush=True)
else:
    print("Loading AI models… (usually 10–30 s; the very first run downloads about 1 GB)", flush=True)
    started = time.time()
    try:
        analyser = make_analyser(with_box=os.environ.get("ACCESSLENS_NO_BOX") != "1")
        print(f"Models ready in {time.time() - started:.1f}s  [{analyser.name}]", flush=True)
    except Exception as e:  # keep the website and database running even if the AI can't load
        print(f"AI could not load ({e}). The website and database still work; residents pick categories themselves.", flush=True)

_ai_lock = threading.Lock()  # one photo at a time keeps memory use predictable


def analyse_bytes(data: bytes) -> dict:
    if analyser is None:
        raise RuntimeError("The AI is not loaded on this server.")
    with _ai_lock:
        return analyser.analyse(data).to_json()


ANALYSER["fn"] = analyse_bytes if analyser else None


@app.get("/health")
def health():
    con = db.connect()
    reports = con.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
    con.close()
    return jsonify(ok=True, model=analyser.name if analyser else None, ai=analyser is not None, database=True, reports=reports)


@app.post("/analyse")
def analyse():
    if analyser is None:
        return jsonify(error="The AI is not loaded on this server."), 503
    photo = request.files.get("photo")
    if photo is None:
        return jsonify(error="Send the image as a multipart field called 'photo'."), 400
    data = photo.read()
    if not data:
        return jsonify(error="The photo was empty."), 400
    t = time.time()
    try:
        body = analyse_bytes(data)
    except Exception as e:  # unreadable image etc.
        return jsonify(error=f"Could not analyse this photo: {e}"), 422
    body["ms"] = int((time.time() - t) * 1000)
    label = body["category"] or "no barrier"
    print(f"analysed: {label} {body['confidence']:.0%} in {body['ms']} ms", flush=True)
    return jsonify(body)


@app.get("/media/<path:name>")
def media(name):
    return send_from_directory(db.UPLOADS, name, max_age=3600)


# Hosted demo (one public link): an entry page at /, the resident app (web build) at /app,
# the staff website at /staff. All three use this server and its database.
APP_DIR = Path(os.environ["ACCESSLENS_APP_DIR"]) if os.environ.get("ACCESSLENS_APP_DIR") else None
ENTRY_PAGE = Path(os.environ["ACCESSLENS_ENTRY_PAGE"]) if os.environ.get("ACCESSLENS_ENTRY_PAGE") else None


@app.get("/")
def root():
    if ENTRY_PAGE and ENTRY_PAGE.is_file():
        resp = send_from_directory(ENTRY_PAGE.parent, ENTRY_PAGE.name)
        resp.headers["Cache-Control"] = "no-cache"
        return resp
    return redirect("/staff/")


@app.get("/app")
@app.get("/app/")
@app.get("/app/<path:name>")
def resident_web_app(name=""):
    # Files of the web app, or index.html for its screens (/app/reports, /app/track/12 …).
    if not APP_DIR:
        return jsonify(error="The resident web app is not part of this server."), 404
    if name and (APP_DIR / name).is_file():
        return send_from_directory(APP_DIR, name)
    resp = send_from_directory(APP_DIR, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/staff")
def staff_redirect():
    return redirect("/staff/")


@app.get("/staff/")
@app.get("/staff/<path:name>")
def staff(name="index.html"):
    target = STAFF_DIR / name
    if not target.exists() or target.is_dir():
        name = "index.html"
    resp = send_from_directory(STAFF_DIR, name)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


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
    print("  AccessLens server is running.")
    print(f"  Staff website:   http://127.0.0.1:{PORT}/staff   (or http://{ip}:{PORT}/staff on other devices)")
    print(f"  App connection:  http://{ip}:{PORT}   (the app finds it automatically)")
    print(f"  Demo logins:     admin  email {db.DEMO_ADMIN[0]} / {db.DEMO_ADMIN[1]}")
    print(f"                   staff  ID {db.DEMO_STAFF[0][0]} / {db.DEMO_STAFF[0][2]}  ·  ID {db.DEMO_STAFF[1][0]} / {db.DEMO_STAFF[1][2]}")
    print("  AccessLens AI is running." if analyser else "  AI is off — residents choose the category themselves.")
    print("  Keep this window open. Press Ctrl+C to stop.")
    print("")
    app.run(host="0.0.0.0", port=PORT, threaded=True)
