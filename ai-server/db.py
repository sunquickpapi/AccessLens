"""
AccessLens database (SQLite — a single file, free, no setup).

    data/accesslens.db     all records
    data/uploads/          report photos, voice notes, completion photos

Tables
    users       staff website accounts (role = admin | staff).
                Admins log in with their email, staff with their staff ID.
    sessions    staff website login sessions
    teams       maintenance teams
    residents   resident app installs (anonymous; optional first name)
    reports     one row per barrier report
    events      timeline of everything that happened to a report
    updates     messages shown to the resident in the app
"""

from __future__ import annotations

import json
import os
import secrets
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from werkzeug.security import generate_password_hash

HERE = Path(__file__).resolve().parent
DATA = Path(os.environ.get("ACCESSLENS_DATA", HERE / "data"))
UPLOADS = DATA / "uploads"
DB_PATH = DATA / "accesslens.db"
SEED = HERE / "seed"

CATEGORIES = ["obstruction", "surface", "steps"]
CATEGORY_LABELS = {"obstruction": "Obstruction", "surface": "Surface damage", "steps": "Steps"}
STAGES = ["report", "ai", "review", "completion", "confirmed", "closed"]

DEFAULT_TEAMS = [
    ("Civil Maintenance", ["surface", "steps"]),
    ("Enforcement & Facilities", ["obstruction"]),
    ("Landscape & Cleaning", []),
]

DEMO_ADMIN = ("admin@accesslens.my", "admin123", "Township Admin")
# (staff ID, email, password, name, team)
DEMO_STAFF = [
    ("S1001", "aina@accesslens.my", "staff123", "Aina Rahman", "Civil Maintenance"),
    ("S1002", "farid@accesslens.my", "staff123", "Farid Hakim", "Enforcement & Facilities"),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    staff_id TEXT UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    team TEXT,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    categories TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS residents (
    id INTEGER PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    name TEXT,
    get_around TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    last_seen TEXT
);
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    resident_id INTEGER REFERENCES residents(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    photo TEXT,
    voice TEXT,
    voice_seconds INTEGER DEFAULT 0,
    lat REAL,
    lng REAL,
    address TEXT,
    landmark TEXT,
    ai TEXT,
    resident_category TEXT,
    category TEXT,
    category_corrected INTEGER DEFAULT 0,
    staff_category TEXT,
    affected TEXT NOT NULL DEFAULT '[]',
    impacts TEXT NOT NULL DEFAULT '[]',
    severity TEXT,
    auto_fields TEXT,
    location_source TEXT,
    description TEXT,
    report_seconds INTEGER,
    stage TEXT NOT NULL DEFAULT 'ai',
    team TEXT,
    work_type TEXT,
    assignee_id INTEGER REFERENCES users(id),
    due_date TEXT,
    work_note TEXT,
    completion_photo TEXT,
    completion_note TEXT,
    verified_by INTEGER REFERENCES users(id),
    verified_at TEXT,
    assigned_at TEXT,
    completed_at TEXT,
    resolved_at TEXT,
    resolved_by INTEGER REFERENCES users(id),
    closed_reason TEXT,
    closed_kind TEXT,
    formal_report TEXT,
    priority_override TEXT,
    verify_signature TEXT,
    completion_signature TEXT,
    completed_by INTEGER REFERENCES users(id),
    resident_signature TEXT,
    resident_sign_name TEXT,
    feedback_fixed INTEGER,
    feedback_comment TEXT,
    feedback_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    stage TEXT,
    kind TEXT NOT NULL,
    note TEXT,
    actor_type TEXT NOT NULL,
    actor_id INTEGER,
    public INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS updates (
    id INTEGER PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    resident_id INTEGER REFERENCES residents(id),
    at TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reports_stage ON reports(stage);
CREATE INDEX IF NOT EXISTS idx_reports_resident ON reports(resident_id);
CREATE INDEX IF NOT EXISTS idx_events_report ON events(report_id);
CREATE INDEX IF NOT EXISTS idx_updates_resident ON updates(resident_id);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DATA.mkdir(parents=True, exist_ok=True)
    UPLOADS.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


def init(seed_if_empty: bool = True) -> None:
    con = connect()
    con.executescript(SCHEMA)
    migrate(con)
    con.commit()
    empty = con.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
    con.close()
    if empty and seed_if_empty:
        seed()


def migrate(con: sqlite3.Connection) -> None:
    """Bring databases created by older versions up to date."""
    cols = {r["name"] for r in con.execute("PRAGMA table_info(users)")}
    if "staff_id" not in cols:
        con.execute("ALTER TABLE users ADD COLUMN staff_id TEXT")
        con.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_staff_id ON users(staff_id COLLATE NOCASE)")
        for sid, email, *_ in DEMO_STAFF:
            con.execute("UPDATE users SET staff_id = ? WHERE email = ? COLLATE NOCASE AND staff_id IS NULL", (sid, email))
        n = 1003
        for u in con.execute("SELECT id FROM users WHERE role = 'staff' AND staff_id IS NULL ORDER BY id").fetchall():
            con.execute("UPDATE users SET staff_id = ? WHERE id = ?", (f"S{n}", u["id"]))
            n += 1
    rcols = {r["name"] for r in con.execute("PRAGMA table_info(reports)")}
    if "auto_fields" not in rcols:
        # Which fields the app filled in from the photo, and whether the resident kept or edited them.
        con.execute("ALTER TABLE reports ADD COLUMN auto_fields TEXT")
    if "location_source" not in rcols:
        con.execute("ALTER TABLE reports ADD COLUMN location_source TEXT")
    for col, typ in (("priority_override", "TEXT"), ("verify_signature", "TEXT"), ("completion_signature", "TEXT"), ("completed_by", "INTEGER"),
                     ("resident_signature", "TEXT"), ("resident_sign_name", "TEXT")):
        if col not in rcols:  # signatures on the formal defect report
            con.execute(f"ALTER TABLE reports ADD COLUMN {col} {typ}")
    if "formal_report" not in rcols:
        # the formal defect report generated when the resident submits (JSON)
        con.execute("ALTER TABLE reports ADD COLUMN formal_report TEXT")
    if "closed_kind" not in rcols:
        # "rejected" = staff agreed with the AI that the photo shows no barrier
        con.execute("ALTER TABLE reports ADD COLUMN closed_kind TEXT")


def next_staff_id(con: sqlite3.Connection) -> str:
    n = 1001
    for r in con.execute("SELECT staff_id FROM users WHERE staff_id IS NOT NULL"):
        digits = "".join(ch for ch in r["staff_id"] if ch.isdigit())
        if digits:
            n = max(n, int(digits) + 1)
    return f"S{n}"


def next_code(con: sqlite3.Connection) -> str:
    row = con.execute("SELECT code FROM reports ORDER BY id DESC LIMIT 1").fetchone()
    n = int(row["code"].split("-")[1]) + 1 if row else 101
    while con.execute("SELECT 1 FROM reports WHERE code = ?", (f"AL-{n:04d}",)).fetchone():
        n += 1
    return f"AL-{n:04d}"


def add_event(con, report_id, kind, note, actor_type, actor_id=None, stage=None, public=True, at=None):
    con.execute(
        "INSERT INTO events (report_id, at, stage, kind, note, actor_type, actor_id, public) VALUES (?,?,?,?,?,?,?,?)",
        (report_id, at or now(), stage, kind, note, actor_type, actor_id, 1 if public else 0),
    )


def add_update(con, report_id, title, body, at=None):
    row = con.execute("SELECT resident_id FROM reports WHERE id = ?", (report_id,)).fetchone()
    con.execute(
        "INSERT INTO updates (report_id, resident_id, at, title, body, read) VALUES (?,?,?,?,?,0)",
        (report_id, row["resident_id"] if row else None, at or now(), title, body),
    )


def team_for(con, category: str) -> str | None:
    for t in con.execute("SELECT name, categories FROM teams ORDER BY id"):
        if category in json.loads(t["categories"] or "[]"):
            return t["name"]
    return None


# --------------------------------------------------------------------------- seed

def _copy_seed(name: str) -> str:
    dest = f"seed-{name}.png"
    src = SEED / f"{name}.png"
    if src.exists():
        shutil.copyfile(src, UPLOADS / dest)
    return dest


def reset() -> None:
    """Delete everything and start again with demo data."""
    if DB_PATH.exists():
        for suffix in ("", "-wal", "-shm"):
            p = Path(str(DB_PATH) + suffix)
            if p.exists():
                p.unlink()
    if UPLOADS.exists():
        shutil.rmtree(UPLOADS)
    init(seed_if_empty=True)


def seed() -> None:
    con = connect()
    con.executescript(SCHEMA)
    t0 = datetime.now(timezone.utc)

    def ago(days: float, hours: float = 0) -> str:
        return (t0 - timedelta(days=days, hours=hours)).isoformat(timespec="seconds")

    for name, cats in DEFAULT_TEAMS:
        con.execute("INSERT OR IGNORE INTO teams (name, categories) VALUES (?, ?)", (name, json.dumps(cats)))

    email, pw, name = DEMO_ADMIN
    con.execute(
        "INSERT INTO users (email, name, role, team, password_hash, active, created_at) VALUES (?,?,?,?,?,1,?)",
        (email, name, "admin", None, generate_password_hash(pw), now()),
    )
    staff_ids = {}
    for sid, email, pw, name, team in DEMO_STAFF:
        cur = con.execute(
            "INSERT INTO users (email, staff_id, name, role, team, password_hash, active, created_at) VALUES (?,?,?,?,?,?,1,?)",
            (email, sid, name, "staff", team, generate_password_hash(pw), now()),
        )
        staff_ids[team] = cur.lastrowid
    admin_id = 1

    residents = []
    for rname, around in [("Siti", ["wheelchair"]), ("Mr Lim", ["older", "walking_aid"]), ("Nurul", ["stroller"]), (None, [])]:
        cur = con.execute(
            "INSERT INTO residents (token, name, get_around, created_at, last_seen) VALUES (?,?,?,?,?)",
            (secrets.token_urlsafe(24), rname, json.dumps(around), ago(30), ago(1)),
        )
        residents.append(cur.lastrowid)

    def ai(cat, conf, others, box=None, none=0.05):
        scores = {c: others.get(c, 0.0) for c in CATEGORIES}
        scores[cat] = conf
        scores["none"] = none
        return {
            "category": cat, "confidence": conf, "scores": scores, "noBarrier": False,
            "uncertain": conf < 0.5, "box": box or {"x": 0.22, "y": 0.4, "w": 0.55, "h": 0.4},
            "model": "zero-shot:clip-vit-base-patch16+owlvit-base-patch32",
        }

    # (photo, lat, lng, address, landmark, ai, resident cat, staff cat, severity, affected, impacts, description, stage, days ago, resident index, report seconds)
    specs = [
        ("obstruction", 3.07462, 101.51712, "Covered walkway beside the community hall", "Next to the motorcycle bay",
         ai("obstruction", 0.87, {"surface": 0.05, "steps": 0.03}), "obstruction", "obstruction", "blocked",
         ["wheelchair", "stroller"], ["road", "cannot_pass"],
         "Motorcycles are parked across the pavement every morning. I had to go onto the road in my wheelchair.",
         "confirmed", 12, 0, 74),
        ("steps", 3.07291, 101.51963, "Pedestrian path to the surau, near the junction", "Kerb at the crossing",
         ai("surface", 0.46, {"steps": 0.38, "obstruction": 0.08}), "steps", "steps", "difficult",
         ["older", "walking_aid"], ["longer_route", "risk_fall"],
         "The kerb at the crossing is too high and there is no ramp. My mother uses a walking frame and cannot step down.",
         "assigned", 4, 1, 95),
        ("surface", 3.07521, 101.51993, "Walkway outside the shophouses, Block C", "Broken drain cover",
         ai("surface", 0.81, {"obstruction": 0.08, "steps": 0.06}), "surface", None, "difficult",
         ["wheelchair", "stroller", "older"], ["risk_fall"],
         "Drain cover is cracked and sinking. Stroller wheel got stuck.",
         "ai", 0.3, 2, 61),
        ("obstruction", 3.07468, 101.51718, "Covered walkway beside the community hall", "Same spot as last month",
         ai("obstruction", 0.79, {"surface": 0.06, "steps": 0.05}), "obstruction", "obstruction", "blocked",
         ["wheelchair"], ["road"], "Motorcycles again blocking the walkway near the hall.",
         "completion", 2, 0, 52),
        ("bins", 3.07355, 101.51802, "Footpath behind Block A flats", "Bin area",
         ai("obstruction", 0.72, {"surface": 0.1, "steps": 0.05}), "obstruction", "obstruction", "difficult",
         ["stroller"], ["road", "longer_route"], "Rubbish bins left on the footpath after collection day.",
         "verified", 1.5, 2, 48),
        ("surface", 3.07515, 101.51986, "Walkway outside the shophouses, Block C", "Near the pharmacy",
         ai("surface", 0.66, {"steps": 0.2, "obstruction": 0.07}), "surface", "surface", "minor",
         ["older"], ["risk_fall"], "Cracked tiles near the pharmacy entrance.",
         "confirmed", 20, 3, 40),
        ("steps", 3.07198, 101.51885, "Entrance to the community park", "Main gate",
         ai("steps", 0.58, {"surface": 0.22, "obstruction": 0.1}), "steps", "steps", "blocked",
         ["wheelchair", "stroller"], ["cannot_pass", "turn_back"], "Two steps at the park gate, no ramp at all.",
         "ai", 0.1, 1, 83),
        ("obstruction", 3.07601, 101.51755, "Bus stop on Jalan Utama", "Bus shelter",
         ai("steps", 0.41, {"obstruction": 0.39, "surface": 0.1}), "obstruction", None, "difficult",
         ["wheelchair"], ["road"], "Signboard placed in the middle of the walkway at the bus stop.",
         "ai", 0.05, 3, 57),
        ("surface", 3.07333, 101.52021, "Path between the school and the clinic", None,
         ai("surface", 0.84, {"steps": 0.06, "obstruction": 0.04}), "surface", "surface", "minor",
         [], [], "Pothole on the path. Reported by mistake twice, this one is the duplicate.",
         "closed", 6, 3, 35),
    ]

    A, E = "accepted", "edited"
    DEMO_AUTO = {
        1: {"location": A, "category": E, "severity": A, "impacts": E, "affected": E},
        2: {"location": A, "category": A, "severity": A, "impacts": A, "affected": A},
        3: {"location": A, "category": A, "severity": E, "impacts": A, "affected": E},
        4: {"location": A, "category": A, "severity": A, "impacts": A, "affected": A},
        6: {"location": E, "category": A, "severity": A, "impacts": A, "affected": A},
        7: {"location": A, "category": E, "severity": A, "impacts": A, "affected": A},
    }
    for i, (photo, lat, lng, addr, landmark, aiv, rcat, scat, sev, aff, imp, desc, stage, days, ridx, secs) in enumerate(specs):
        created = ago(days)
        code = f"AL-{101 + i:04d}"
        corrected = 1 if rcat != aiv["category"] else 0
        cur = con.execute(
            """INSERT INTO reports (code, resident_id, created_at, updated_at, photo, lat, lng, address, landmark, ai,
               resident_category, category, category_corrected, affected, impacts, severity, description, report_seconds, stage)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'ai')""",
            (code, residents[ridx], created, created, _copy_seed(photo), lat, lng, addr, landmark, json.dumps(aiv),
             rcat, rcat, corrected, json.dumps(aff), json.dumps(imp), sev, desc, secs),
        )
        rid = cur.lastrowid
        if i in DEMO_AUTO:  # newer reports were made with the snap → auto-fill → check flow
            con.execute("UPDATE reports SET auto_fields = ?, location_source = ? WHERE id = ?",
                        (json.dumps(DEMO_AUTO[i]), "camera", rid))
        add_event(con, rid, "submitted", "Photo and location submitted.", "resident", residents[ridx], "report", at=created)
        add_event(con, rid, "ai", (
            f"AI suggested {CATEGORY_LABELS[aiv['category']]}; resident corrected it to {CATEGORY_LABELS[rcat]}."
            if corrected else f"AI flagged possible {CATEGORY_LABELS[rcat].lower()}; resident confirmed it."
        ), "ai", None, "ai", at=created)
        add_update(con, rid, f"{code} received", "Thanks. Township staff will review your report and assign the right team.", at=created)

        if stage == "ai":
            continue
        team = team_for(con, scat) or "Civil Maintenance"
        staff_id = staff_ids.get(team, admin_id)
        if stage == "closed":
            t = ago(days - 0.5)
            con.execute("UPDATE reports SET stage='closed', closed_reason=?, updated_at=? WHERE id=?",
                        ("Duplicate of an earlier report at the same place.", t, rid))
            add_event(con, rid, "closed", "Closed: duplicate of an earlier report at the same place.", "admin", admin_id, "closed", at=t)
            add_update(con, rid, "Report closed", "This looks like a duplicate of an earlier report at the same place, so we merged them. Thank you!", at=t)
            continue

        tv = ago(days * 0.8)
        con.execute("UPDATE reports SET stage='review', staff_category=?, category=?, team=?, verified_by=?, verified_at=?, updated_at=? WHERE id=?",
                    (scat, scat, team, staff_id, tv, tv, rid))
        add_event(con, rid, "verified", f"Staff verified the report as {CATEGORY_LABELS[scat].lower()}. Responsible team: {team}.", "staff", staff_id, "review", at=tv)
        add_update(con, rid, "Report verified", f"Staff checked {code} and confirmed it. The {team} team is responsible.", at=tv)
        if stage == "verified":
            continue

        ta = ago(days * 0.7)
        due = (t0 + timedelta(days=5)).date().isoformat() if stage != "confirmed" else (t0 - timedelta(days=days * 0.4)).date().isoformat()
        work = "inspection" if scat == "steps" else "repair"
        con.execute("UPDATE reports SET team=?, work_type=?, assignee_id=?, due_date=?, assigned_at=?, work_note=?, updated_at=? WHERE id=?",
                    (team, work, staff_id, due, ta, "Please check on site and fix if possible.", ta, rid))
        add_event(con, rid, "assigned", f"{work.capitalize()} assigned to {team}.", "staff", staff_id, "review", at=ta)
        add_update(con, rid, "Repair work assigned", f"{code} has been assigned to the {team} team for {work}.", at=ta)
        if stage == "assigned":
            continue

        tc = ago(days * 0.4)
        fixed = "ramp" if scat == "steps" else "fixed"
        con.execute("UPDATE reports SET stage='completion', completion_photo=?, completion_note=?, completed_at=?, updated_at=? WHERE id=?",
                    (_copy_seed(fixed), "Cleared and bollards installed." if scat == "obstruction" else "Repaired.", tc, tc, rid))
        add_event(con, rid, "completion", f"The {team} team uploaded a completion photo.", "staff", staff_id, "completion", at=tc)
        add_update(con, rid, "Fix submitted", f"The {team} team uploaded a photo after the work. Staff are checking it.", at=tc)
        if stage == "completion":
            continue

        tr = ago(days * 0.3)
        con.execute("UPDATE reports SET stage='confirmed', resolved_at=?, resolved_by=?, updated_at=?, feedback_fixed=1, feedback_comment=?, feedback_at=? WHERE id=?",
                    (tr, admin_id, tr, "Much better now, thank you!", ago(days * 0.25), rid))
        add_event(con, rid, "confirmed", "Staff confirmed the completion evidence.", "admin", admin_id, "confirmed", at=tr)
        add_update(con, rid, "Barrier resolved", f"Staff confirmed {code} is fixed. Thank you for making the walkway better for everyone.", at=tr)
        con.execute("UPDATE updates SET read = 1 WHERE report_id = ?", (rid,))

    con.commit()
    con.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "reset":
        reset()
        print(f"Database reset with demo data: {DB_PATH}")
    else:
        init()
        print(f"Database ready: {DB_PATH}")
