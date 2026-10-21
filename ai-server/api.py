"""
AccessLens REST API.

Resident app  (header  X-Resident-Token: <token>)
    POST /api/residents                    register this phone → {id, token}
    PATCH /api/residents/me                name, how they get around
    GET  /api/residents/me/reports         my reports (with timeline)
    GET  /api/residents/me/updates         my updates
    POST /api/residents/me/updates/read    mark updates read
    POST /api/reports                      new report (multipart: photo, voice, data=JSON)
    POST /api/reports/<id>/feedback        "is it fixed?" after confirmation
    GET  /api/public/reports               anonymised pins for the map

Staff website  (header  Authorization: Bearer <token>)
    POST /api/auth/login  admin: {role:'admin', email, password} · staff: {role:'staff', staffId, password}
    GET  /api/auth/me     POST /api/auth/logout
    GET  /api/staff/reports            ?stage=&category=&team=&q=&mine=1
    GET  /api/staff/reports/<id>
    POST /api/staff/reports/<id>/verify       {category, team, note}
    POST /api/staff/reports/<id>/assign       {workType, team, assigneeId, dueDate, note}
    POST /api/staff/reports/<id>/completion   multipart: photo, note
    POST /api/staff/reports/<id>/confirm      {note}
    POST /api/staff/reports/<id>/rework       {note}
    POST /api/staff/reports/<id>/close        {reason}
    POST /api/staff/reports/<id>/message      {text}
    POST /api/staff/reports/<id>/reanalyse
    GET  /api/staff/stats      GET /api/staff/hotspots     GET /api/staff/export.csv
    GET  /api/staff/teams      GET /api/staff/people

Admin only
    GET/POST /api/admin/users      PATCH /api/admin/users/<id>
    POST /api/admin/teams          DELETE /api/admin/teams/<id>
    GET  /api/admin/residents      GET /api/admin/activity
    POST /api/admin/reset-demo
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import secrets
import statistics
import uuid
from datetime import date, datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Blueprint, Response, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

import db
from db import CATEGORIES, CATEGORY_LABELS, add_event, add_update, now

bp = Blueprint("api", __name__)
ANALYSER = {"fn": None}  # set by server.py: fn(bytes) -> dict

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".heic", ".webp"}
# Fields the app fills in from the photo; the resident keeps ("accepted") or changes ("edited") each one.
AUTO_FIELD_KEYS = ("location", "category", "severity", "impacts", "affected")
# camera = GPS when the photo was taken; photo = GPS saved in a gallery photo;
# current = phone's location when a gallery photo had none; manual = resident moved the pin; none = no location access
LOCATION_SOURCES = ("camera", "photo", "current", "manual", "none")
AUDIO_EXT = {".m4a", ".aac", ".mp3", ".wav", ".caf", ".webm", ".3gp", ".mp4"}


# --------------------------------------------------------------------------- helpers

def con():
    if "con" not in g:
        g.con = db.connect()
    return g.con


@bp.teardown_app_request
def _close(_exc):
    c = g.pop("con", None)
    if c is not None:
        c.close()


def err(msg, status=400):
    return jsonify(error=msg), status


def body() -> dict:
    return request.get_json(silent=True) or {}


def jl(s, default=None):
    try:
        return json.loads(s) if s else (default if default is not None else [])
    except (TypeError, ValueError):
        return default if default is not None else []


def media_url(path):
    if not path:
        return None
    return f"{request.host_url.rstrip('/')}/media/{path}"


def save_upload(file, kind: str) -> str | None:
    if not file or not file.filename:
        return None
    ext = Path(file.filename).suffix.lower()
    is_audio = kind == "voice"
    allowed = AUDIO_EXT if is_audio else IMAGE_EXT
    if ext not in allowed:
        ext = ".m4a" if is_audio else ".jpg"
    name = f"{kind}-{uuid.uuid4().hex[:12]}{ext}"
    file.save(db.UPLOADS / name)
    return name


def save_signature(sig, kind: str) -> str | None:
    """Store a signature as a clean PNG.
    Accepts an uploaded/drawn image as a data URL (PNG/JPEG), or finger strokes
    {"strokes": [[[x, y], ...], ...], "width": w, "height": h} drawn in the app."""
    import base64
    from PIL import Image, ImageDraw

    if not sig:
        return None
    try:
        if isinstance(sig, str):
            head, _, data = sig.partition(",")
            if not head.startswith("data:image/") or ";base64" not in head:
                return None
            raw = base64.b64decode(data, validate=False)
            if len(raw) > 15 * 1024 * 1024:
                return None
            img = Image.open(io.BytesIO(raw))
            img.load()
            img = img.convert("RGBA")
            img.thumbnail((900, 400))
        elif isinstance(sig, dict) and isinstance(sig.get("strokes"), list):
            w = max(1.0, float(sig.get("width") or 300))
            h = max(1.0, float(sig.get("height") or 150))
            scale = 600 / w
            img = Image.new("RGBA", (600, max(60, int(h * scale))), (255, 255, 255, 0))
            d = ImageDraw.Draw(img)
            drawn = 0
            for stroke in sig["strokes"][:200]:
                pts = [(float(p[0]) * scale, float(p[1]) * scale) for p in stroke[:2000] if isinstance(p, (list, tuple)) and len(p) >= 2]
                if len(pts) == 1:
                    x, y = pts[0]
                    d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(20, 20, 40, 255))
                elif len(pts) > 1:
                    d.line(pts, fill=(20, 20, 40, 255), width=4, joint="curve")
                drawn += len(pts)
            if not drawn:
                return None
        else:
            return None
    except Exception:
        return None
    name = f"sign-{kind}-{uuid.uuid4().hex[:12]}.png"
    img.save(db.UPLOADS / name, "PNG")
    return name


def parse_iso(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def hours_between(a, b):
    da, dbb = parse_iso(a), parse_iso(b)
    if not da or not dbb:
        return None
    return (dbb - da).total_seconds() / 3600


def user_name(uid):
    if not uid:
        return None
    r = con().execute("SELECT name FROM users WHERE id = ?", (uid,)).fetchone()
    return r["name"] if r else None


# --------------------------------------------------------------------------- formal defect report

SEVERITY_LABELS = {"blocked": "Blocks the journey", "difficult": "Makes it difficult", "minor": "Minor inconvenience"}
PRIORITY = {"blocked": "High", "difficult": "Medium", "minor": "Low"}
IMPACT_LABELS = {
    "cannot_pass": "could not get past at all", "road": "had to go onto the road", "turn_back": "had to turn back",
    "longer_route": "took a longer route", "needed_help": "needed someone to help", "risk_fall": "risk of tripping or falling",
}
AFFECTED_LABELS = {"wheelchair": "wheelchair users", "older": "older residents",
                   "walking_aid": "people using walking aids", "stroller": "parents with strollers"}
# Rectification asked of the contractor, per barrier type (like a consultant's defect comment).
DEFECT_ACTION = {
    "obstruction": "To clear the obstruction{seen} from the walkway and keep the full width free for pedestrians.",
    "surface": "To make good the surface damage{seen} on the walkway and reinstate a level, even finish.",
    "steps": "To provide step-free access{seen} at the level change, e.g. a kerb ramp with a gentle gradient.",
}
SECTION = {"obstruction": "Walkway — Obstruction", "surface": "Walkway — Surface damage", "steps": "Walkway — Step-free access"}


# --------------------------------------------------------------------------- priority score
# Points: effect on the journey (3/2/1) + 1 each if it affects wheelchair users or
# older residents + 1 or 2 if the same barrier type was reported within 60 m.
# High = 4+ points, Medium = 2–3, Low = 0–1. Staff can override when verifying.
EFFECT_POINTS = {"blocked": 3, "difficult": 2, "minor": 1}
PRIORITY_LEVELS = ("high", "medium", "low")


def priority_for(r, nearby=None) -> dict:
    reasons = []
    eff = r["severity"]
    pts = EFFECT_POINTS.get(eff, 2)
    reasons.append({"text": SEVERITY_LABELS.get(eff, "Effect not given").lower() if eff else "effect not given", "points": pts})
    affected = jl(r["affected"])
    if "wheelchair" in affected:
        pts += 1
        reasons.append({"text": "affects wheelchair users", "points": 1})
    if "older" in affected:
        pts += 1
        reasons.append({"text": "affects older residents", "points": 1})
    if nearby is None:
        nearby = nearby_reports(r) if r["lat"] is not None else []
    same = [n for n in nearby if n["category"] == r["category"]]
    if same:
        extra = 2 if len(same) >= 2 else 1
        pts += extra
        nth = len(same) + 1
        suffix = {2: "nd", 3: "rd"}.get(nth, "th")
        reasons.append({"text": f"{nth}{suffix} report of this barrier within 60 m", "points": extra})
    auto = "high" if pts >= 4 else "medium" if pts >= 2 else "low"
    override = r["priority_override"] if "priority_override" in r.keys() else None
    level = override if override in PRIORITY_LEVELS else auto
    return {"level": level, "label": level.capitalize(), "score": pts, "auto": auto,
            "overridden": bool(override), "reasons": reasons}


def _join(words):
    words = [w for w in words if w]
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1] if words else ""


def build_formal_report(r) -> dict:
    """The formal defect report created automatically when a resident submits a report."""
    ai = jl(r["ai"], None) or {}
    cat = r["category"]
    seen = ""
    box = ai.get("box") or {}
    if box.get("label") and ai.get("category") == cat:
        seen = f" ({box['label'].removeprefix('a ').removeprefix('an ')})"
    comments = [DEFECT_ACTION.get(cat, "To inspect and rectify the reported barrier on the walkway.").format(seen=seen)]
    imp = [IMPACT_LABELS[k] for k in jl(r["impacts"]) if k in IMPACT_LABELS]
    aff = [AFFECTED_LABELS[k] for k in jl(r["affected"]) if k in AFFECTED_LABELS]
    if r["severity"]:
        line = f"Reported effect: {SEVERITY_LABELS.get(r['severity'], r['severity']).lower()}"
        if imp:
            line += f" — resident {_join(imp)}"
        comments.append(line + ".")
    if aff:
        comments.append(f"Affects {_join(aff)}.")
    if r["landmark"]:
        comments.append(f"Location note: {r['landmark']}.")
    if ai.get("category") and not ai.get("noBarrier"):
        comments.append(f"AI assessment: {CATEGORY_LABELS.get(ai['category'], ai['category'])}, "
                        f"{round((ai.get('confidence') or 0) * 100)}% confidence (to be verified on site).")
    digits = r["code"].split("-")[-1]
    return {
        "number": f"DR-{digits}",
        "generatedAt": r["created_at"],
        "section": SECTION.get(cat, "Walkway"),
        "category": cat,
        "priority": PRIORITY.get(r["severity"], "Medium"),
        "comments": comments,
        "residentWords": (r["description"] or "").strip() or None,
    }


def formal_report_for(r) -> dict:
    """Stored report, or create and store it for reports made before this feature existed."""
    stored = jl(r["formal_report"], None) if "formal_report" in r.keys() else None
    if stored:
        return stored
    fr = build_formal_report(r)
    c = con()
    c.execute("UPDATE reports SET formal_report = ? WHERE id = ?", (json.dumps(fr), r["id"]))
    c.commit()
    return fr


# --------------------------------------------------------------------------- serialisers

def report_for_resident(r) -> dict:
    events = con().execute(
        "SELECT stage, at, note FROM events WHERE report_id = ? AND public = 1 AND stage IS NOT NULL ORDER BY at, id", (r["id"],)
    ).fetchall()
    return {
        "id": str(r["id"]),
        "code": r["code"],
        "createdAt": r["created_at"],
        "photoUri": media_url(r["photo"]),
        "location": {"latitude": r["lat"], "longitude": r["lng"], "address": r["address"], "confirmed": True}
        if r["lat"] is not None else None,
        "landmark": r["landmark"] or "",
        "ai": jl(r["ai"], None),
        "category": r["category"],
        "categoryCorrected": bool(r["category_corrected"]),
        "affected": jl(r["affected"]),
        "impacts": jl(r["impacts"]),
        "severity": r["severity"],
        "autoFields": jl(r["auto_fields"], {}),
        "locationSource": r["location_source"],
        "description": r["description"] or "",
        "voiceUri": media_url(r["voice"]),
        "voiceSeconds": r["voice_seconds"] or 0,
        "stage": r["stage"],
        "assignedTo": r["team"] if r["assigned_at"] else None,
        "workType": r["work_type"],
        "dueDate": r["due_date"],
        "completionPhotoUri": media_url(r["completion_photo"]),
        "resolvedAt": r["resolved_at"],
        "closedReason": r["closed_reason"],
        "rejected": r["closed_kind"] == "rejected",
        "feedback": {"fixed": bool(r["feedback_fixed"]), "comment": r["feedback_comment"], "at": r["feedback_at"],
                     "signed": bool(r["resident_signature"])}
        if r["feedback_at"] else None,
        "timeline": [{"stage": e["stage"], "at": e["at"], "note": e["note"]} for e in events],
        "synced": True,
    }


def report_for_staff(r, full=False) -> dict:
    res = None
    if r["resident_id"]:
        rr = con().execute("SELECT id, name, get_around FROM residents WHERE id = ?", (r["resident_id"],)).fetchone()
        if rr:
            res = {"id": rr["id"], "name": rr["name"] or f"Resident #{rr['id']}", "getAround": jl(rr["get_around"])}
    due = r["due_date"]
    overdue = bool(due and r["stage"] in ("review",) and r["assigned_at"] and due < date.today().isoformat())
    out = {
        "id": r["id"],
        "code": r["code"],
        "createdAt": r["created_at"],
        "updatedAt": r["updated_at"],
        "photo": media_url(r["photo"]),
        "lat": r["lat"],
        "lng": r["lng"],
        "address": r["address"],
        "landmark": r["landmark"],
        "ai": jl(r["ai"], None),
        "residentCategory": r["resident_category"],
        "categoryCorrected": bool(r["category_corrected"]),
        "staffCategory": r["staff_category"],
        "category": r["category"],
        "severity": r["severity"],
        "affected": jl(r["affected"]),
        "impacts": jl(r["impacts"]),
        "autoFields": jl(r["auto_fields"], {}),
        "locationSource": r["location_source"],
        "rejected": r["closed_kind"] == "rejected",
        "priority": priority_for(r),
        "description": r["description"],
        "stage": r["stage"],
        "status": status_key(r),
        "team": r["team"],
        "workType": r["work_type"],
        "assigneeId": r["assignee_id"],
        "assignee": user_name(r["assignee_id"]),
        "dueDate": due,
        "overdue": overdue,
        "resident": res,
    }
    if full:
        events = con().execute(
            "SELECT e.*, u.name AS user_name FROM events e LEFT JOIN users u ON u.id = e.actor_id AND e.actor_type IN ('staff','admin') "
            "WHERE report_id = ? ORDER BY at, e.id", (r["id"],)
        ).fetchall()
        out.update({
            "voice": media_url(r["voice"]),
            "voiceSeconds": r["voice_seconds"],
            "reportSeconds": r["report_seconds"],
            "workNote": r["work_note"],
            "completionPhoto": media_url(r["completion_photo"]),
            "completionNote": r["completion_note"],
            "verifiedBy": user_name(r["verified_by"]),
            "verifiedAt": r["verified_at"],
            "assignedAt": r["assigned_at"],
            "completedAt": r["completed_at"],
            "resolvedAt": r["resolved_at"],
            "resolvedBy": user_name(r["resolved_by"]),
            "closedReason": r["closed_reason"],
            "feedback": {"fixed": bool(r["feedback_fixed"]), "comment": r["feedback_comment"], "at": r["feedback_at"]}
            if r["feedback_at"] else None,
            "events": [
                {"at": e["at"], "stage": e["stage"], "kind": e["kind"], "note": e["note"], "actor": e["actor_type"],
                 "by": e["user_name"], "public": bool(e["public"])}
                for e in events
            ],
            "nearby": nearby_reports(r),
            "formalReport": formal_report_for(r),
            "signatures": {
                "verify": media_url(r["verify_signature"]),
                "completion": media_url(r["completion_signature"]),
                "completedBy": user_name(r["completed_by"]),
                "resident": media_url(r["resident_signature"]),
                "residentName": r["resident_sign_name"],
            },
        })
    return out


def status_key(r) -> str:
    s = r["stage"]
    if s in ("report", "ai"):
        return "new"
    if s == "review":
        return "assigned" if r["assigned_at"] else "verified"
    if s == "completion":
        return "awaiting_confirmation"
    return s  # confirmed | closed


def distance_m(a_lat, a_lng, b_lat, b_lng):
    if None in (a_lat, a_lng, b_lat, b_lng):
        return math.inf
    k = 111_320
    dx = (a_lng - b_lng) * k * math.cos(math.radians((a_lat + b_lat) / 2))
    dy = (a_lat - b_lat) * k
    return math.hypot(dx, dy)


def nearby_reports(r, radius=60):
    rows = con().execute("SELECT id, code, category, stage, created_at, lat, lng, assigned_at FROM reports WHERE id != ?", (r["id"],)).fetchall()
    out = []
    for x in rows:
        d = distance_m(r["lat"], r["lng"], x["lat"], x["lng"])
        if d <= radius:
            out.append({"id": x["id"], "code": x["code"], "category": x["category"], "status": status_key(x),
                        "createdAt": x["created_at"], "distance": round(d)})
    return sorted(out, key=lambda x: x["createdAt"], reverse=True)


# --------------------------------------------------------------------------- auth

def staff_required(admin=False):
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            auth = request.headers.get("Authorization", "")
            token = auth[7:] if auth.startswith("Bearer ") else request.args.get("token")
            if not token:
                return err("Please log in.", 401)
            row = con().execute(
                "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1",
                (token, now()),
            ).fetchone()
            if not row:
                return err("Your session has ended. Please log in again.", 401)
            if admin and row["role"] != "admin":
                return err("Only admins can do this.", 403)
            g.user = row
            return fn(*a, **kw)
        return wrapper
    return deco


def resident_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        token = request.headers.get("X-Resident-Token") or request.args.get("rt")
        row = con().execute("SELECT * FROM residents WHERE token = ?", (token or "",)).fetchone()
        if not row:
            return err("Unknown device. Please register again.", 401)
        con().execute("UPDATE residents SET last_seen = ? WHERE id = ?", (now(), row["id"]))
        con().commit()
        g.resident = row
        return fn(*a, **kw)
    return wrapper


def user_json(u):
    return {"id": u["id"], "email": u["email"], "staffId": u["staff_id"], "name": u["name"], "role": u["role"], "team": u["team"],
            "active": bool(u["active"]), "lastLogin": u["last_login"], "createdAt": u["created_at"]}


@bp.post("/api/auth/login")
def login():
    b = body()
    pw = b.get("password") or ""
    want = "admin" if b.get("role") == "admin" else "staff"
    if want == "admin":
        # Admins sign in with their email address.
        ident = (b.get("email") or "").strip().lower()
        u = con().execute("SELECT * FROM users WHERE email = ? COLLATE NOCASE", (ident,)).fetchone()
        wrong = "Admin email or password is incorrect."
    else:
        # Staff sign in with the staff ID the admin gave them (e.g. S1001).
        ident = (b.get("staffId") or b.get("email") or "").strip()
        u = con().execute("SELECT * FROM users WHERE staff_id = ? COLLATE NOCASE", (ident,)).fetchone()
        wrong = "Staff ID or password is incorrect."
    if not u or not check_password_hash(u["password_hash"], pw):
        return err(wrong, 401)
    if not u["active"]:
        return err("This account has been deactivated. Ask an admin.", 403)
    if want == "admin" and u["role"] != "admin":
        return err("This is a staff account. Use the Staff tab and your staff ID.", 403)
    if want == "staff" and u["role"] != "staff":
        return err("This is an admin account. Use the Admin tab and your email.", 403)
    token = secrets.token_urlsafe(32)
    exp = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(timespec="seconds")
    con().execute("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)", (token, u["id"], now(), exp))
    con().execute("UPDATE users SET last_login = ? WHERE id = ?", (now(), u["id"]))
    con().commit()
    return jsonify(token=token, user=user_json(u))


@bp.get("/api/auth/me")
@staff_required()
def me():
    return jsonify(user=user_json(g.user))


@bp.post("/api/auth/logout")
@staff_required()
def logout():
    auth = request.headers.get("Authorization", "")
    con().execute("DELETE FROM sessions WHERE token = ?", (auth[7:],))
    con().commit()
    return jsonify(ok=True)


# --------------------------------------------------------------------------- resident app

@bp.post("/api/residents")
def register_resident():
    b = body()
    token = secrets.token_urlsafe(24)
    cur = con().execute(
        "INSERT INTO residents (token, name, get_around, created_at, last_seen) VALUES (?,?,?,?,?)",
        (token, (b.get("name") or "").strip() or None, json.dumps(b.get("getAround") or []), now(), now()),
    )
    con().commit()
    return jsonify(id=cur.lastrowid, token=token), 201


@bp.patch("/api/residents/me")
@resident_required
def update_resident():
    b = body()
    con().execute(
        "UPDATE residents SET name = ?, get_around = ? WHERE id = ?",
        ((b.get("name") or "").strip() or None, json.dumps(b.get("getAround") or []), g.resident["id"]),
    )
    con().commit()
    return jsonify(ok=True)


@bp.get("/api/residents/me/reports")
@resident_required
def my_reports():
    rows = con().execute("SELECT * FROM reports WHERE resident_id = ? ORDER BY created_at DESC", (g.resident["id"],)).fetchall()
    return jsonify(reports=[report_for_resident(r) for r in rows])


@bp.get("/api/residents/me/updates")
@resident_required
def my_updates():
    rows = con().execute(
        "SELECT * FROM updates WHERE resident_id = ? ORDER BY at DESC, id DESC LIMIT 200", (g.resident["id"],)
    ).fetchall()
    return jsonify(updates=[
        {"id": f"s{u['id']}", "reportId": str(u["report_id"]), "title": u["title"], "body": u["body"], "at": u["at"], "read": bool(u["read"])}
        for u in rows
    ])


@bp.post("/api/residents/me/updates/read")
@resident_required
def read_updates():
    b = body()
    if b.get("reportId"):
        con().execute("UPDATE updates SET read = 1 WHERE resident_id = ? AND report_id = ?", (g.resident["id"], int(b["reportId"])))
    else:
        con().execute("UPDATE updates SET read = 1 WHERE resident_id = ?", (g.resident["id"],))
    con().commit()
    return jsonify(ok=True)


@bp.post("/api/reports")
@resident_required
def create_report():
    try:
        data = json.loads(request.form.get("data") or "{}")
    except ValueError:
        return err("Report details were not valid JSON.")
    photo = save_upload(request.files.get("photo"), "photo")
    if not photo:
        return err("A photo is required.")
    category = data.get("category")
    if category not in CATEGORIES:
        return err("Choose a barrier category.")
    voice = save_upload(request.files.get("voice"), "voice")
    loc = data.get("location") or {}
    ai = data.get("ai")
    if not ai and ANALYSER["fn"]:
        # The phone couldn't reach the AI earlier (e.g. offline) — check the photo now so staff still see a suggestion.
        try:
            ai = ANALYSER["fn"]((db.UPLOADS / photo).read_bytes())
        except Exception:
            ai = None
    c = con()
    code = db.next_code(c)
    t = data.get("createdAt") or now()
    corrected = 1 if (ai and ai.get("category") and ai.get("category") != category) else 0
    auto = data.get("autoFields") if isinstance(data.get("autoFields"), dict) else {}
    auto = {k: v for k, v in auto.items() if k in AUTO_FIELD_KEYS and v in ("accepted", "edited")}
    loc_source = data.get("locationSource") if data.get("locationSource") in LOCATION_SOURCES else None
    cur = c.execute(
        """INSERT INTO reports (code, resident_id, created_at, updated_at, photo, voice, voice_seconds, lat, lng, address, landmark,
           ai, resident_category, category, category_corrected, affected, impacts, severity, description, report_seconds,
           auto_fields, location_source, stage)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'ai')""",
        (code, g.resident["id"], t, now(), photo, voice, int(data.get("voiceSeconds") or 0), loc.get("latitude"), loc.get("longitude"),
         loc.get("address"), data.get("landmark") or None, json.dumps(ai) if ai else None, category, category, corrected,
         json.dumps(data.get("affected") or []), json.dumps(data.get("impacts") or []), data.get("severity"),
         (data.get("description") or "").strip() or None, data.get("reportSeconds"),
         json.dumps(auto) if auto else None, loc_source),
    )
    rid = cur.lastrowid
    fr = build_formal_report(c.execute("SELECT * FROM reports WHERE id = ?", (rid,)).fetchone())
    c.execute("UPDATE reports SET formal_report = ? WHERE id = ?", (json.dumps(fr), rid))
    add_event(c, rid, "submitted", "Photo and location submitted.", "resident", g.resident["id"], "report", at=t)
    add_event(c, rid, "formal_report", f"Formal defect report {fr['number']} generated.", "ai", None, None, public=False, at=t)
    if not ai:
        note = f"AI check unavailable; resident chose {CATEGORY_LABELS[category]}."
    elif not data.get("ai"):
        note = (f"AI checked the photo after it was sent: {CATEGORY_LABELS.get(ai.get('category'), 'no barrier')}"
                f" ({round((ai.get('confidence') or 0) * 100)}%). Resident chose {CATEGORY_LABELS[category]}.")
    elif ai.get("noBarrier"):
        note = f"AI didn’t spot a barrier; resident chose {CATEGORY_LABELS[category]}."
    elif corrected:
        note = f"AI suggested {CATEGORY_LABELS.get(ai['category'], ai['category'])}; resident corrected it to {CATEGORY_LABELS[category]}."
    else:
        note = f"AI flagged possible {CATEGORY_LABELS[category].lower()}; resident confirmed it."
    add_event(c, rid, "ai", note, "ai", None, "ai", at=t)
    add_update(c, rid, f"{code} received", "Thanks. Township staff will review your report and assign the right team.")
    c.commit()
    row = c.execute("SELECT * FROM reports WHERE id = ?", (rid,)).fetchone()
    return jsonify(report=report_for_resident(row)), 201


@bp.post("/api/reports/<int:rid>/feedback")
@resident_required
def feedback(rid):
    b = body()
    r = con().execute("SELECT * FROM reports WHERE id = ? AND resident_id = ?", (rid, g.resident["id"])).fetchone()
    if not r:
        return err("Report not found.", 404)
    if r["stage"] != "confirmed":
        return err("You can give feedback once the report is resolved.")
    fixed = bool(b.get("fixed"))
    comment = (b.get("comment") or "").strip() or None
    sign = save_signature(b.get("signature"), "resident") if fixed else None
    if fixed and b.get("signature") and not sign:
        return err("We couldn’t read that signature. Please draw it again or choose another picture.")
    sign_name = ((b.get("name") or "").strip()[:80] or g.resident["name"] or None) if sign else None
    con().execute("UPDATE reports SET feedback_fixed = ?, feedback_comment = ?, feedback_at = ?, updated_at = ?, "
                  "resident_signature = ?, resident_sign_name = ? WHERE id = ?",
                  (1 if fixed else 0, comment, now(), now(), sign, sign_name, rid))
    add_event(con(), rid, "feedback", ("Resident says the walkway is usable now." if fixed else "Resident says the barrier is NOT fixed.")
              + (f" “{comment}”" if comment else "") + (" Signed the defect report." if sign else ""), "resident", g.resident["id"], None)
    if not fixed:
        # A closure only counts if the resident agrees: put it back in the team's queue.
        con().execute("UPDATE reports SET stage = 'review', resolved_at = NULL, resolved_by = NULL WHERE id = ?", (rid,))
        add_event(con(), rid, "rework", "Reopened because the resident says it is not fixed.", "system", None, "review")
        add_update(con(), rid, "Report reopened",
                   f"Thanks for telling us. {r['code']} is back with the {r['team'] or 'maintenance'} team to finish the job.")
    con().commit()
    row = con().execute("SELECT * FROM reports WHERE id = ?", (rid,)).fetchone()
    return jsonify(report=report_for_resident(row))


@bp.get("/api/public/reports")
def public_reports():
    rows = con().execute("SELECT id, code, category, stage, lat, lng, address, assigned_at FROM reports WHERE stage != 'closed' AND lat IS NOT NULL").fetchall()
    return jsonify(reports=[
        {"id": str(r["id"]), "code": r["code"], "category": r["category"], "stage": r["stage"],
         "latitude": r["lat"], "longitude": r["lng"], "address": r["address"]}
        for r in rows
    ])


# --------------------------------------------------------------------------- staff: reports

def get_report(rid):
    return con().execute("SELECT * FROM reports WHERE id = ?", (rid,)).fetchone()


def actor():
    return g.user["role"], g.user["id"]


def touch(rid):
    con().execute("UPDATE reports SET updated_at = ? WHERE id = ?", (now(), rid))


@bp.get("/api/staff/reports")
@staff_required()
def staff_reports():
    rows = con().execute("SELECT * FROM reports ORDER BY created_at DESC").fetchall()
    out = [report_for_staff(r) for r in rows]
    stage = request.args.get("status")
    cat = request.args.get("category")
    team = request.args.get("team")
    q = (request.args.get("q") or "").strip().lower()
    if stage and stage != "all":
        if stage == "open":
            out = [x for x in out if x["status"] not in ("confirmed", "closed")]
        else:
            out = [x for x in out if x["status"] == stage]
    if cat and cat != "all":
        out = [x for x in out if x["category"] == cat]
    if team and team != "all":
        out = [x for x in out if x["team"] == team]
    if request.args.get("mine") == "1":
        out = [x for x in out if x["assigneeId"] == g.user["id"] or (g.user["team"] and x["team"] == g.user["team"])]
    if q:
        out = [x for x in out if q in " ".join(str(v) for v in (x["code"], x["address"], x["landmark"], x["description"], x["team"])).lower()]
    return jsonify(reports=out)


@bp.get("/api/staff/reports/<int:rid>")
@staff_required()
def staff_report(rid):
    r = get_report(rid)
    if not r:
        return err("Report not found.", 404)
    return jsonify(report=report_for_staff(r, full=True))


@bp.post("/api/staff/reports/<int:rid>/verify")
@staff_required()
def verify(rid):
    r = get_report(rid)
    if not r:
        return err("Report not found.", 404)
    if r["stage"] not in ("report", "ai", "review"):
        return err("This report is past the review stage.")
    b = body()
    cat = b.get("category")
    team = b.get("team")
    if cat not in CATEGORIES:
        return err("Choose the confirmed barrier category.")
    if not team:
        return err("Choose the responsible maintenance team.")
    sign = save_signature(b.get("signature"), "verify")
    if not sign:
        return err("Add your signature (upload it or draw it) to verify the report.")
    prio = b.get("priority") if b.get("priority") in PRIORITY_LEVELS else None
    kind, uid = actor()
    c = con()
    c.execute("UPDATE reports SET priority_override = ? WHERE id = ?", (prio, rid))
    if prio:
        add_event(c, rid, "priority", f"Priority set to {prio.capitalize()} by staff.", kind, uid, None, public=False)
    re_verify = r["verified_at"] is not None
    c.execute("UPDATE reports SET stage = 'review', staff_category = ?, category = ?, team = ?, verified_by = ?, verified_at = ?, verify_signature = ? WHERE id = ?",
              (cat, cat, team, uid, now(), sign, rid))
    note = f"Staff verified the report as {CATEGORY_LABELS[cat].lower()}. Responsible team: {team}."
    if b.get("note"):
        add_event(c, rid, "note", b["note"], kind, uid, None, public=False)
    add_event(c, rid, "verified", note, kind, uid, "review")
    if not re_verify:
        changed = cat != r["resident_category"]
        add_update(c, rid, "Report verified",
                   f"Staff checked {r['code']} and confirmed it" + (f" as {CATEGORY_LABELS[cat].lower()}" if changed else "") + f". The {team} team is responsible.")
    touch(rid)
    c.commit()
    return jsonify(report=report_for_staff(get_report(rid), full=True))


@bp.post("/api/staff/reports/<int:rid>/assign")
@staff_required()
def assign(rid):
    r = get_report(rid)
    if not r:
        return err("Report not found.", 404)
    if r["stage"] != "review" or not r["verified_at"]:
        return err("Verify the report before assigning work.")
    b = body()
    work = b.get("workType") if b.get("workType") in ("inspection", "repair") else "repair"
    team = b.get("team") or r["team"]
    if not team:
        return err("Choose a team.")
    assignee = b.get("assigneeId") or None
    due = b.get("dueDate") or None
    kind, uid = actor()
    c = con()
    first = r["assigned_at"] is None
    c.execute("UPDATE reports SET work_type = ?, team = ?, assignee_id = ?, due_date = ?, work_note = ?, assigned_at = ? WHERE id = ?",
              (work, team, assignee, due, (b.get("note") or "").strip() or None, now(), rid))
    who = user_name(assignee)
    add_event(c, rid, "assigned", f"{work.capitalize()} assigned to {team}" + (f" ({who})" if who else "") + (f", due {due}" if due else "") + ".",
              kind, uid, "review")
    if first:
        add_update(c, rid, "Repair work assigned" if work == "repair" else "Inspection scheduled",
                   f"{r['code']} has been assigned to the {team} team for {work}." + (f" Target date: {due}." if due else ""))
    touch(rid)
    c.commit()
    return jsonify(report=report_for_staff(get_report(rid), full=True))


@bp.post("/api/staff/reports/<int:rid>/completion")
@staff_required()
def completion(rid):
    r = get_report(rid)
    if not r:
        return err("Report not found.", 404)
    if r["stage"] != "review" or not r["assigned_at"]:
        return err("Assign the work before submitting completion evidence.")
    photo = save_upload(request.files.get("photo"), "completion")
    if not photo:
        return err("Add a photo taken after the work.")
    note = (request.form.get("note") or "").strip() or None
    sign = save_signature(request.form.get("signature"), "completion")
    if not sign:
        (db.UPLOADS / photo).unlink(missing_ok=True)
        return err("Add your signature (upload it or draw it) to submit the completion evidence.")
    kind, uid = actor()
    c = con()
    c.execute("UPDATE reports SET stage = 'completion', completion_photo = ?, completion_note = ?, completed_at = ?, "
              "completion_signature = ?, completed_by = ? WHERE id = ?",
              (photo, note, now(), sign, uid, rid))
    add_event(c, rid, "completion", f"The {r['team']} team uploaded a completion photo." + (f" Note: {note}" if note else ""), kind, uid, "completion")
    add_update(c, rid, "Fix submitted", f"The {r['team']} team uploaded a photo after the work on {r['code']}. Staff are checking it.")
    touch(rid)
    c.commit()
    return jsonify(report=report_for_staff(get_report(rid), full=True))


@bp.post("/api/staff/reports/<int:rid>/confirm")
@staff_required()
def confirm(rid):
    r = get_report(rid)
    if not r:
        return err("Report not found.", 404)
    if r["stage"] != "completion":
        return err("There is no completion evidence to confirm yet.")
    kind, uid = actor()
    c = con()
    c.execute("UPDATE reports SET stage = 'confirmed', resolved_at = ?, resolved_by = ? WHERE id = ?", (now(), uid, rid))
    if r["feedback_at"] and not r["feedback_fixed"]:
        # The resident said "not fixed" last time — ask them again about this new fix.
        c.execute("UPDATE reports SET feedback_fixed = NULL, feedback_comment = NULL, feedback_at = NULL WHERE id = ?", (rid,))
    note = (body().get("note") or "").strip()
    add_event(c, rid, "confirmed", "Staff confirmed the completion evidence." + (f" {note}" if note else ""), kind, uid, "confirmed")
    add_update(c, rid, "Barrier resolved",
               f"Staff confirmed {r['code']} is fixed. Thank you for making the walkway better for everyone. Is it usable now? Let us know in the app.")
    touch(rid)
    c.commit()
    return jsonify(report=report_for_staff(get_report(rid), full=True))


@bp.post("/api/staff/reports/<int:rid>/rework")
@staff_required()
def rework(rid):
    r = get_report(rid)
    if not r:
        return err("Report not found.", 404)
    if r["stage"] not in ("completion", "confirmed"):
        return err("Only completed work can be sent back.")
    note = (body().get("note") or "").strip() or "Completion evidence not accepted."
    kind, uid = actor()
    c = con()
    c.execute("UPDATE reports SET stage = 'review', resolved_at = NULL, resolved_by = NULL WHERE id = ?", (rid,))
    add_event(c, rid, "rework", f"Sent back for more work: {note}", kind, uid, "review")
    add_update(c, rid, "More work needed", f"Staff checked the work on {r['code']} and asked the {r['team']} team to finish it.")
    touch(rid)
    c.commit()
    return jsonify(report=report_for_staff(get_report(rid), full=True))


@bp.post("/api/staff/reports/<int:rid>/close")
@staff_required()
def close(rid):
    r = get_report(rid)
    if not r:
        return err("Report not found.", 404)
    reason = (body().get("reason") or "").strip()
    if not reason:
        return err("Give a reason so the resident understands.")
    kind, uid = actor()
    c = con()
    c.execute("UPDATE reports SET stage = 'closed', closed_reason = ? WHERE id = ?", (reason, rid))
    add_event(c, rid, "closed", f"Closed: {reason}", kind, uid, "closed")
    add_update(c, rid, "Report closed", reason)
    touch(rid)
    c.commit()
    return jsonify(report=report_for_staff(get_report(rid), full=True))


@bp.post("/api/staff/reports/delete")
@staff_required()
def delete_reports():
    """Permanently delete the selected reports, their timeline, resident updates and photos."""
    ids = [int(i) for i in (body().get("ids") or []) if str(i).isdigit()]
    if not ids:
        return err("Select at least one report to delete.")
    c = con()
    marks = ",".join("?" * len(ids))
    rows = c.execute(f"SELECT id, code, photo, voice, completion_photo FROM reports WHERE id IN ({marks})", ids).fetchall()
    if not rows:
        return err("Those reports no longer exist.", 404)
    found = [r["id"] for r in rows]
    marks = ",".join("?" * len(found))
    c.execute(f"DELETE FROM events WHERE report_id IN ({marks})", found)
    c.execute(f"DELETE FROM updates WHERE report_id IN ({marks})", found)
    c.execute(f"DELETE FROM reports WHERE id IN ({marks})", found)
    c.commit()
    for r in rows:  # remove the uploaded files too
        for name in (r["photo"], r["voice"], r["completion_photo"]):
            if name:
                try:
                    (db.UPLOADS / name).unlink(missing_ok=True)
                except OSError:
                    pass
    kind, uid = actor()
    codes = [r["code"] for r in rows]
    print(f"deleted by {kind} #{uid}: {', '.join(codes)}", flush=True)
    return jsonify(deleted=codes)


REJECT_REASONS = {
    "no_barrier": "We checked your photo and could not see a barrier on the walkway.",
    "not_walkway": "Your photo doesn’t show a walkway, so we couldn’t find the barrier.",
    "unclear": "Your photo is too dark or unclear to see the barrier. Please send a new report with a clearer photo.",
}


@bp.post("/api/staff/reports/<int:rid>/reject")
@staff_required()
def reject(rid):
    """Reject a new report when staff agree with the AI that there is no barrier."""
    r = get_report(rid)
    if not r:
        return err("Report not found.", 404)
    if r["stage"] in ("confirmed", "closed") or r["verified_at"]:
        return err("Only new reports that haven’t been verified can be rejected.")
    ai = jl(r["ai"], None) or {}
    if not ai.get("noBarrier"):
        return err("Reject is only for reports where the AI found no barrier. Use Close report instead.")
    data = body()
    reason = REJECT_REASONS.get(data.get("reason"), REJECT_REASONS["no_barrier"])
    extra = (data.get("extra") or "").strip()
    text = f"{reason} {extra}".strip()
    kind, uid = actor()
    c = con()
    c.execute("UPDATE reports SET stage = 'closed', closed_reason = ?, closed_kind = 'rejected' WHERE id = ?", (text, rid))
    add_event(c, rid, "rejected", f"Rejected (no barrier): {text}", kind, uid, "closed")
    add_update(c, rid, "Report not accepted", text)
    touch(rid)
    c.commit()
    return jsonify(report=report_for_staff(get_report(rid), full=True))


@bp.post("/api/staff/reports/<int:rid>/message")
@staff_required()
def message(rid):
    r = get_report(rid)
    if not r:
        return err("Report not found.", 404)
    text = (body().get("text") or "").strip()
    if not text:
        return err("Write a message first.")
    kind, uid = actor()
    c = con()
    add_update(c, rid, "Message from township staff", text)
    add_event(c, rid, "message", f"Message to resident: {text}", kind, uid, None, public=False)
    touch(rid)
    c.commit()
    return jsonify(report=report_for_staff(get_report(rid), full=True))


@bp.post("/api/staff/reports/<int:rid>/note")
@staff_required()
def internal_note(rid):
    text = (body().get("text") or "").strip()
    if not text or not get_report(rid):
        return err("Write a note first.")
    kind, uid = actor()
    add_event(con(), rid, "note", text, kind, uid, None, public=False)
    con().commit()
    return jsonify(report=report_for_staff(get_report(rid), full=True))


@bp.post("/api/staff/reports/<int:rid>/reanalyse")
@staff_required()
def reanalyse(rid):
    r = get_report(rid)
    if not r or not r["photo"]:
        return err("Report not found.", 404)
    if not ANALYSER["fn"]:
        return err("The AI is not loaded on this server.", 503)
    data = (db.UPLOADS / r["photo"]).read_bytes()
    result = ANALYSER["fn"](data)
    kind, uid = actor()
    con().execute("UPDATE reports SET ai = ? WHERE id = ?", (json.dumps(result), rid))
    label = CATEGORY_LABELS.get(result.get("category"), "no barrier")
    add_event(con(), rid, "ai", f"AI re-checked the photo: {label} ({round(result.get('confidence', 0) * 100)}%).", kind, uid, None, public=False)
    con().commit()
    return jsonify(report=report_for_staff(get_report(rid), full=True))


# --------------------------------------------------------------------------- staff: insight

@bp.get("/api/staff/teams")
@staff_required()
def teams():
    rows = con().execute("SELECT * FROM teams ORDER BY id").fetchall()
    return jsonify(teams=[{"id": t["id"], "name": t["name"], "categories": jl(t["categories"])} for t in rows])


@bp.get("/api/staff/people")
@staff_required()
def people():
    rows = con().execute("SELECT * FROM users WHERE active = 1 ORDER BY role, name").fetchall()
    return jsonify(people=[{"id": u["id"], "name": u["name"], "team": u["team"], "role": u["role"]} for u in rows])


def evaluation(rows):
    """AI precision/recall against staff-verified categories (slide: Expected value & evaluation)."""
    pairs = []
    for r in rows:
        ai = jl(r["ai"], None)
        if not ai:
            continue
        pred = "none" if ai.get("noBarrier") else ai.get("category")
        if r["staff_category"]:
            pairs.append((r["staff_category"], pred))
        elif r["closed_kind"] == "rejected":  # staff agreed: no barrier
            pairs.append(("none", pred))
    per = {}
    for c in CATEGORIES:
        tp = sum(1 for t, p in pairs if t == c and p == c)
        fp = sum(1 for t, p in pairs if t != c and p == c)
        fn = sum(1 for t, p in pairs if t == c and p != c)
        per[c] = {
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "support": sum(1 for t, _ in pairs if t == c),
        }
    agree = sum(1 for t, p in pairs if t == p)
    return {"verified": len(pairs), "accuracy": agree / len(pairs) if pairs else None, "perCategory": per}


@bp.get("/api/staff/stats")
@staff_required()
def stats():
    rows = con().execute("SELECT * FROM reports").fetchall()
    by_status = {k: 0 for k in ("new", "verified", "assigned", "awaiting_confirmation", "confirmed", "closed")}
    for r in rows:
        by_status[status_key(r)] += 1
    by_cat = {c: sum(1 for r in rows if r["category"] == c) for c in CATEGORIES}
    resolved = [r for r in rows if r["stage"] == "confirmed"]
    res_hours = [h for h in (hours_between(r["created_at"], r["resolved_at"]) for r in resolved) if h is not None]
    report_secs = [r["report_seconds"] for r in rows if r["report_seconds"]]
    with_ai = [r for r in rows if r["ai"]]
    fb = [r for r in rows if r["feedback_at"]]
    overdue = sum(1 for r in rows if r["stage"] == "review" and r["assigned_at"] and r["due_date"] and r["due_date"] < date.today().isoformat())
    completeness = []
    for r in rows:
        fields = [r["photo"], r["lat"], r["category"], r["severity"], jl(r["affected"]) or None, r["description"] or r["voice"]]
        completeness.append(sum(1 for f in fields if f) / len(fields))
    # last 8 weeks
    weeks = []
    today = datetime.now(timezone.utc)
    for i in range(7, -1, -1):
        start = today - timedelta(days=today.weekday() + 7 * i)
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=7)
        weeks.append({
            "week": start.date().isoformat(),
            "reported": sum(1 for r in rows if (d := parse_iso(r["created_at"])) and start <= d < end),
            "resolved": sum(1 for r in rows if (d := parse_iso(r["resolved_at"])) and start <= d < end),
        })
    return jsonify(
        total=len(rows),
        byStatus=by_status,
        byCategory=by_cat,
        open=sum(1 for r in rows if r["stage"] not in ("confirmed", "closed")),
        overdue=overdue,
        verifiedClosures=sum(1 for r in resolved if r["completion_photo"]),
        medianResolutionHours=statistics.median(res_hours) if res_hours else None,
        medianReportSeconds=statistics.median(report_secs) if report_secs else None,
        avgCompleteness=sum(completeness) / len(completeness) if completeness else None,
        residentCorrectionRate=(sum(1 for r in with_ai if r["category_corrected"]) / len(with_ai)) if with_ai else None,
        staffOverrideRate=(sum(1 for r in rows if r["staff_category"] and r["staff_category"] != r["resident_category"])
                           / max(1, sum(1 for r in rows if r["staff_category"]))),
        feedback={"total": len(fb), "fixed": sum(1 for r in fb if r["feedback_fixed"]), "notFixed": sum(1 for r in fb if not r["feedback_fixed"])},
        ai=evaluation(rows),
        autoFill=auto_fill_stats(rows),
        weeks=weeks,
    )


def auto_fill_stats(rows) -> dict:
    """How often residents kept what the app filled in from the photo (lecturer's auto-summary flow)."""
    summaries = [jl(r["auto_fields"], {}) for r in rows if r["auto_fields"]]
    per = {}
    for k in AUTO_FIELD_KEYS:
        vals = [s[k] for s in summaries if k in s]
        per[k] = {"filled": len(vals), "edited": sum(1 for v in vals if v == "edited"),
                  "keptRate": (sum(1 for v in vals if v == "accepted") / len(vals)) if vals else None}
    untouched = sum(1 for s in summaries if s and all(v == "accepted" for v in s.values()))
    return {"reports": len(summaries), "acceptedUnchanged": untouched,
            "acceptedRate": (untouched / len(summaries)) if summaries else None, "perField": per}


def area_of(address) -> str:
    """The street / place part of an address: drops house numbers like '291B'."""
    if not address:
        return "Pinned location (no address)"
    for part in (p.strip() for p in address.split(",")):
        if part and not re.fullmatch(r"(no\.?\s*)?\d+[a-zA-Z]?(-\d+)?", part, re.I):
            return part
    return address


@bp.get("/api/staff/overview")
@staff_required()
def overview():
    """Dashboard insights: busiest areas, barrier types and performance so far."""
    rows = con().execute("SELECT * FROM reports").fetchall()
    today = datetime.now(timezone.utc)
    month_ago = today - timedelta(days=30)
    is_open = lambda r: r["stage"] not in ("confirmed", "closed")  # noqa: E731

    # busiest areas
    areas = {}
    for r in rows:
        a = areas.setdefault(area_of(r["address"]), {"total": 0, "open": 0, "high": 0, "categories": {}, "last": None})
        a["total"] += 1
        a["categories"][r["category"]] = a["categories"].get(r["category"], 0) + 1
        if is_open(r):
            a["open"] += 1
            if priority_for(r)["level"] == "high":
                a["high"] += 1
        if not a["last"] or r["created_at"] > a["last"]:
            a["last"] = r["created_at"]
    top_areas = sorted(({"area": k, **v, "top": max(v["categories"], key=v["categories"].get)} for k, v in areas.items()),
                       key=lambda x: (-x["total"], -x["open"]))[:5]

    # barrier types
    types = {}
    for c in CATEGORIES:
        rs = [r for r in rows if r["category"] == c]
        types[c] = {"total": len(rs), "open": sum(1 for r in rs if is_open(r)),
                    "last30": sum(1 for r in rs if (d := parse_iso(r["created_at"])) and d >= month_ago)}
    most = max(CATEGORIES, key=lambda c: types[c]["total"]) if rows else None

    # performance
    resolved = [r for r in rows if r["stage"] == "confirmed"]
    verify_h = [h for h in (hours_between(r["created_at"], r["verified_at"]) for r in rows if r["verified_at"]) if h is not None]
    resolve_h = [h for h in (hours_between(r["created_at"], r["resolved_at"]) for r in resolved) if h is not None]
    with_due = [r for r in resolved if r["due_date"] and r["resolved_at"]]
    on_time = sum(1 for r in with_due if r["resolved_at"][:10] <= r["due_date"])
    fb = [r for r in rows if r["feedback_at"]]
    ev = evaluation(rows)
    return jsonify(
        areas=top_areas,
        types=types,
        mostCommon=most,
        performance={
            "total": len(rows),
            "resolved": len(resolved),
            "resolved30": sum(1 for r in resolved if (d := parse_iso(r["resolved_at"])) and d >= month_ago),
            "reported30": sum(1 for r in rows if (d := parse_iso(r["created_at"])) and d >= month_ago),
            "resolutionRate": len(resolved) / len(rows) if rows else None,
            "medianVerifyHours": statistics.median(verify_h) if verify_h else None,
            "medianResolveHours": statistics.median(resolve_h) if resolve_h else None,
            "onTimeRate": on_time / len(with_due) if with_due else None,
            "onTime": on_time,
            "withDue": len(with_due),
            "satisfaction": (sum(1 for r in fb if r["feedback_fixed"]) / len(fb)) if fb else None,
            "feedbackCount": len(fb),
            "aiAccuracy": ev["accuracy"],
            "aiChecked": ev["verified"],
        },
    )


@bp.get("/api/staff/hotspots")
@staff_required()
def hotspots():
    """Recurring barriers: reports within ~60 m of each other with the same category."""
    radius = float(request.args.get("radius") or 60)
    rows = [r for r in con().execute("SELECT * FROM reports WHERE lat IS NOT NULL ORDER BY created_at").fetchall()]
    clusters = []
    for r in rows:
        for cl in clusters:
            if cl["category"] == r["category"] and distance_m(cl["lat"], cl["lng"], r["lat"], r["lng"]) <= radius:
                cl["items"].append(r)
                n = len(cl["items"])
                cl["lat"] += (r["lat"] - cl["lat"]) / n
                cl["lng"] += (r["lng"] - cl["lng"]) / n
                break
        else:
            clusters.append({"category": r["category"], "lat": r["lat"], "lng": r["lng"], "items": [r]})
    out = []
    for cl in clusters:
        items = cl["items"]
        if len(items) < 2:
            continue
        out.append({
            "category": cl["category"],
            "lat": cl["lat"],
            "lng": cl["lng"],
            "address": items[-1]["address"],
            "count": len(items),
            "open": sum(1 for x in items if x["stage"] not in ("confirmed", "closed")),
            "first": items[0]["created_at"],
            "last": items[-1]["created_at"],
            "reports": [{"id": x["id"], "code": x["code"], "status": status_key(x), "createdAt": x["created_at"]} for x in items],
        })
    out.sort(key=lambda x: x["last"], reverse=True)
    out.sort(key=lambda x: -x["count"])
    return jsonify(hotspots=out, radius=radius)


@bp.get("/api/staff/export.csv")
@staff_required()
def export_csv():
    rows = con().execute("SELECT * FROM reports ORDER BY created_at").fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["code", "created_at", "status", "resident_category", "ai_category", "ai_confidence", "staff_category", "severity",
                "address", "lat", "lng", "team", "work_type", "due_date", "verified_at", "assigned_at", "completed_at",
                "resolved_at", "resolution_hours", "report_seconds", "resident_feedback"])
    for r in rows:
        ai = jl(r["ai"], None) or {}
        h = hours_between(r["created_at"], r["resolved_at"])
        w.writerow([r["code"], r["created_at"], status_key(r), r["resident_category"],
                    "none" if ai.get("noBarrier") else ai.get("category"), ai.get("confidence"), r["staff_category"], r["severity"],
                    r["address"], r["lat"], r["lng"], r["team"], r["work_type"], r["due_date"], r["verified_at"], r["assigned_at"],
                    r["completed_at"], r["resolved_at"], round(h, 1) if h is not None else "", r["report_seconds"],
                    "" if r["feedback_at"] is None else ("fixed" if r["feedback_fixed"] else "not fixed")])
    return Response(buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=accesslens-reports-{date.today().isoformat()}.csv"})


# --------------------------------------------------------------------------- admin

@bp.get("/api/admin/users")
@staff_required(admin=True)
def list_users():
    rows = con().execute("SELECT * FROM users ORDER BY role, name").fetchall()
    return jsonify(users=[user_json(u) for u in rows])


@bp.post("/api/admin/users")
@staff_required(admin=True)
def create_user():
    b = body()
    email = (b.get("email") or "").strip().lower()
    name = (b.get("name") or "").strip()
    pw = b.get("password") or ""
    role = b.get("role") if b.get("role") in ("admin", "staff") else "staff"
    if "@" not in email or not name:
        return err("Enter a name and a valid email.")
    staff_id = None
    if role == "staff":
        staff_id = (b.get("staffId") or "").strip().upper() or db.next_staff_id(con())
        if con().execute("SELECT 1 FROM users WHERE staff_id = ? COLLATE NOCASE", (staff_id,)).fetchone():
            return err(f"Staff ID {staff_id} is already used.")
    if len(pw) < 6:
        return err("Password must be at least 6 characters.")
    if con().execute("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE", (email,)).fetchone():
        return err("An account with this email already exists.")
    cur = con().execute(
        "INSERT INTO users (email, staff_id, name, role, team, password_hash, active, created_at) VALUES (?,?,?,?,?,?,1,?)",
        (email, staff_id, name, role, b.get("team") or None, generate_password_hash(pw), now()),
    )
    con().commit()
    return jsonify(user=user_json(con().execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone())), 201


@bp.patch("/api/admin/users/<int:uid>")
@staff_required(admin=True)
def update_user(uid):
    u = con().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not u:
        return err("User not found.", 404)
    b = body()
    if uid == g.user["id"] and (b.get("active") is False or b.get("role") == "staff"):
        return err("You can't deactivate or demote your own account.")
    fields, vals = [], []
    for key, col in (("name", "name"), ("team", "team"), ("role", "role")):
        if key in b:
            if key == "role" and b[key] not in ("admin", "staff"):
                continue
            fields.append(f"{col} = ?")
            vals.append(b[key] or None)
    if "active" in b:
        fields.append("active = ?")
        vals.append(1 if b["active"] else 0)
        if not b["active"]:
            con().execute("DELETE FROM sessions WHERE user_id = ?", (uid,))
    if b.get("password"):
        if len(b["password"]) < 6:
            return err("Password must be at least 6 characters.")
        fields.append("password_hash = ?")
        vals.append(generate_password_hash(b["password"]))
    new_role = b.get("role") if b.get("role") in ("admin", "staff") else u["role"]
    if new_role == "staff" and not u["staff_id"]:
        fields.append("staff_id = ?")
        vals.append(db.next_staff_id(con()))
    if fields:
        con().execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", (*vals, uid))
        con().commit()
    return jsonify(user=user_json(con().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()))


@bp.post("/api/admin/teams")
@staff_required(admin=True)
def create_team():
    b = body()
    name = (b.get("name") or "").strip()
    if not name:
        return err("Enter a team name.")
    cats = [c for c in (b.get("categories") or []) if c in CATEGORIES]
    try:
        con().execute("INSERT INTO teams (name, categories) VALUES (?, ?)", (name, json.dumps(cats)))
    except Exception:
        return err("A team with this name already exists.")
    con().commit()
    return teams()


@bp.patch("/api/admin/teams/<int:tid>")
@staff_required(admin=True)
def update_team(tid):
    cats = [c for c in (body().get("categories") or []) if c in CATEGORIES]
    con().execute("UPDATE teams SET categories = ? WHERE id = ?", (json.dumps(cats), tid))
    con().commit()
    return teams()


@bp.delete("/api/admin/teams/<int:tid>")
@staff_required(admin=True)
def delete_team(tid):
    t = con().execute("SELECT name FROM teams WHERE id = ?", (tid,)).fetchone()
    if not t:
        return err("Team not found.", 404)
    in_use = con().execute("SELECT COUNT(*) FROM reports WHERE team = ? AND stage NOT IN ('confirmed','closed')", (t["name"],)).fetchone()[0]
    if in_use:
        return err(f"{t['name']} still has {in_use} open report(s). Reassign them first.")
    con().execute("DELETE FROM teams WHERE id = ?", (tid,))
    con().commit()
    return teams()


@bp.get("/api/admin/residents")
@staff_required(admin=True)
def residents():
    rows = con().execute(
        """SELECT r.*, COUNT(p.id) AS reports, SUM(CASE WHEN p.stage = 'confirmed' THEN 1 ELSE 0 END) AS resolved
           FROM residents r LEFT JOIN reports p ON p.resident_id = r.id GROUP BY r.id ORDER BY r.last_seen DESC"""
    ).fetchall()
    return jsonify(residents=[
        {"id": r["id"], "name": r["name"] or f"Resident #{r['id']}", "getAround": jl(r["get_around"]), "createdAt": r["created_at"],
         "lastSeen": r["last_seen"], "reports": r["reports"], "resolved": r["resolved"] or 0}
        for r in rows
    ])


@bp.get("/api/admin/activity")
@staff_required(admin=True)
def activity():
    rows = con().execute(
        """SELECT e.*, r.code, u.name AS user_name FROM events e JOIN reports r ON r.id = e.report_id
           LEFT JOIN users u ON u.id = e.actor_id AND e.actor_type IN ('staff','admin')
           ORDER BY e.at DESC, e.id DESC LIMIT 100"""
    ).fetchall()
    return jsonify(activity=[
        {"at": e["at"], "code": e["code"], "reportId": e["report_id"], "kind": e["kind"], "note": e["note"],
         "actor": e["actor_type"], "by": e["user_name"]}
        for e in rows
    ])


@bp.post("/api/admin/reset-demo")
@staff_required(admin=True)
def reset_demo():
    g.pop("con").close()
    db.reset()
    return jsonify(ok=True)
