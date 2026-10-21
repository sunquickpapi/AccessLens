# AccessLens server

One program on your Mac that runs everything behind the resident app:

- **Database** (SQLite, one file: `ai-server/data/accesslens.db`): residents, reports,
  photos, voice notes, staff accounts, teams, the timeline of every report and the
  updates sent to residents.
- **Staff website** at `http://127.0.0.1:8000/staff`: admin and staff log in here.
- **AI**: free, zero-shot barrier detection (CLIP for the category and the effect on the
  journey, OWL-ViT for the box). After a resident snaps a photo the app fills in the whole
  report from this; the resident checks and edits it before sending.

## Demo day: two Terminal windows

**Window 1: the server**
```bash
cd ~/Downloads/accesslens
npm run server        # same as: npm run ai
```
Wait for **"AccessLens server is running."** The first run creates the database
with demo data.

**Window 2: the app**
```bash
cd ~/Downloads/accesslens
npx expo start
```
Scan the QR code. The app finds the server on the same Mac by itself.
Check it under **Settings → Server connection**.

**The staff website:** open `http://127.0.0.1:8000/staff` in Safari or Chrome on the Mac,
or `http://<your Mac's Wi-Fi address>:8000/staff` on another laptop or tablet on the same Wi-Fi.

## Logins

| Type  | Tab   | Logs in with | Demo account |
|-------|-------|--------------|--------------|
| Admin | Admin | Email        | `admin@accesslens.my` / `admin123` |
| Staff | Staff | Staff ID     | `S1001` (Aina, Civil Maintenance) / `staff123` |
| Staff | Staff | Staff ID     | `S1002` (Farid, Enforcement & Facilities) / `staff123` |

Admins create more accounts under **Staff accounts**. New staff get the next free
staff ID automatically (S1003, S1004…), or you can type one.

**Admins** can do everything: verify, assign, confirm, plus manage staff accounts,
maintenance teams, residents and the activity log, and reset the demo data.
**Staff** handle reports: verify, assign, upload completion photos, confirm, message residents.

## How the app and the website are connected

1. A resident sends a report → it is saved in the database (photo, location, AI result,
   what they said). It appears on the staff dashboard within seconds.
2. Staff **verify** it (confirm the category and the responsible team) → the resident's
   app shows "Report verified".
3. Staff **assign** inspection or repair work → "Repair work assigned".
4. The team uploads a **completion photo** → "Fix submitted".
5. Staff **confirm** it → "Barrier resolved". The resident is asked "Is the walkway
   usable now?" If they say **not yet**, the report reopens for the team automatically.

The app checks for updates every 10 seconds while it's open, and shows a phone
notification for each new update.

## Database tools

```bash
cd ~/Downloads/accesslens/ai-server
./.venv/bin/python db.py reset     # wipe everything and reload the demo data
```
Admins can also reset from the website (Activity log page → Reset demo data). To look inside the database,
open `ai-server/data/accesslens.db` with the free "DB Browser for SQLite" app.

Exports: the **Export CSV** button on the staff dashboard downloads every report.

## Switches

- `ACCESSLENS_NO_AI=1 npm run server` — skip the AI (starts instantly; residents pick
  the category themselves). Useful when you only want to test the website.
- `ACCESSLENS_NO_BOX=1` — skip the box model to save memory.
- `ACCESSLENS_CLIP=openai/clip-vit-large-patch14` — a bigger, more accurate CLIP model.

## Auto-filled reports

The app sends which fields it filled in and whether the resident kept or changed each one
(`auto_fields` in the database, e.g. `{"severity": "edited", "category": "accepted"}`).
The staff report page tags each line "AI suggested" / "From GPS" / "Resident edited", and
**Recurring issues & evaluation → Auto-filled reports** shows how often each guess was kept.

## Measuring the AI (slide 8: precision and recall)

Two ways:
- **Live:** the staff website's **Recurring issues & evaluation** page compares the AI's
  suggestion with the category staff verified, for every report.
- **Offline test set:** put photos in folders named after the right answer:
  ```
  ai-server/test_photos/obstruction/   surface/   steps/   none/
  ```
  then run `./.venv/bin/python evaluate.py test_photos`.

## Privacy note

This is a prototype for one small area. Photos are served to anyone on the same
Wi-Fi who knows the link, and the server has no HTTPS. Before real use, put it behind
HTTPS, change the demo passwords and limit who can reach it.
