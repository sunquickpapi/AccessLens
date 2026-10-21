# AccessLens

**Spot it. Snap it. Clear the way.**
AI-assisted accessibility reporting for inclusive townships.

Submission by **Trinity Tech** (Universiti Teknologi MARA) for the **Sime Darby Property University Hackathon 2026 — Township of Tomorrow**
Theme: People · Community Wellbeing

| Team | Role |
|---|---|
| Muhammad Naufal bin Mohd Nizam | Team leader & Developer |
| Muhammad Al Amin bin Muslaini | Researcher |
| Muhammad Hadiff bin Jusmera | Video Grapher | 

---

## What it is

Residents who use wheelchairs, walking aids or strollers report a walkway barrier with **one photo**.
AI fills in the report, township staff verify it, the right team fixes it, and every fix closes with a
**signed defect report**.

This folder holds the whole working prototype:

| Part | Folder | What it does |
|---|---|---|
| 📱 Resident app | `src/` | React Native (Expo SDK 57). Snap a photo → the app fills in the report → check and send → track it → sign to confirm the fix |
| 🖥️ Management website | `ai-server/staff/` | For township staff and admins: review, verify, assign, confirm, defect reports, dashboard. Works on laptops and phones |
| 🗄️ Server + database | `ai-server/` | Flask + SQLite. Connects the app and the website |
| 🤖 AI | `ai-server/accesslens_ai.py` | Free zero-shot AI (CLIP + OWL-ViT). No training and no dataset needed |

---

## What you need

- A **Mac** (tested on macOS, Apple silicon). Windows works through WSL or Git Bash.
- **Node.js** 20 or newer — https://nodejs.org
- **Python** 3.10 or newer — https://www.python.org/downloads/
- An **iPhone or Android phone** with the **Expo Go** app (SDK 57) from the App Store / Play Store
- The computer and the phone on the **same Wi-Fi** (or the same phone hotspot)
- Internet for the first run: app libraries, the AI models (about 1 GB, downloaded once) and map tiles

## Run it (about 10 minutes the first time)

**1. Install the app libraries** (first time only)
```bash
cd accesslens
npm install
```

**2. Window 1 — start the server, database, AI and website**
```bash
npm run server
```
The first run sets up Python and downloads the AI models, which takes a few minutes.
Wait for **"AccessLens server is running."** It also shows the computer's Wi-Fi address.

**3. Window 2 — start the resident app**
```bash
npx expo start
```
Scan the QR code with the phone's camera (iPhone) or with Expo Go (Android).

**4. Check the connection** — in the app: **Settings → Server connection → Check connection** should say **Connected**.
If it doesn't, type the Wi-Fi address from window 1 (e.g. `192.168.0.110:8000`), and on a Mac allow **python** in
System Settings → Network → Firewall.

**5. Open the management website** — `http://127.0.0.1:8000/staff` on the same computer,
or `http://<Wi-Fi address>:8000/staff` on a phone or another laptop.

### Demo logins

| Who | Tab | Login | Password |
|---|---|---|---|
| Admin | Admin | `admin@accesslens.my` | `admin123` |
| Staff — Aina, Civil Maintenance | Staff | `S1001` | `staff123` |
| Staff — Farid, Enforcement & Facilities | Staff | `S1002` | `staff123` |

Residents don't log in; the app registers the phone by itself. These are demo accounts for judging only.

### No AI? It still runs
If the AI can't download or load, start the server without it. Residents then pick the barrier type themselves; everything else works:
```bash
ACCESSLENS_NO_AI=1 npm run server
```

---

## Try it in 5 minutes

1. **App → Report a barrier** → take or choose a photo of a walkway barrier (e.g. a motorcycle blocking the path).
2. Watch **"Filling in your report"**: location, barrier type, effect on the journey and who it affects are filled in.
3. **Check and send**: every line is tagged *AI suggested*, *From GPS* or *Edited by you*. Tap any line to change it, then send.
   A photo of something that isn't a walkway (e.g. a ceiling) shows **Not a walkway → Retake photo**.
4. **Website (Admin)** → the new report pops up. Open it: photo with the AI box, AI scores, priority, location.
5. **Verify** (type, team, priority, signature) → **Assign** (repair, person, target date).
6. **Website (Staff S1002)** → My team's work → upload the after photo, sign → **Submit evidence**.
7. **Admin → Confirm completion.** The phone gets an update within about 10 seconds.
8. **App** → open the report → **"Yes, it's fixed"** → sign with a finger.
9. **Website → View report**: the formal defect report with all three signatures. Print or save it as PDF.

---

## How AI and smart reporting help at each step

| Step | Who | How it helps |
|---|---|---|
| 01 Capture | Resident | **AI** fills in the barrier type and the effect on the journey from the photo; GPS fills the location; rules suggest who it affects |
| 02 Review | Staff | **AI** names the barrier, shows its confidence and boxes it on the photo; its walkway check flags photos to reject |
| 04 Verify | Staff | Barrier type comes pre-filled (**AI**); the right team is suggested and the priority is scored automatically (**smart rules**) — staff decide |
| 06 Assign | Staff | The priority score sets the order of work; Google Maps directions; repeat spots are flagged (**smart rules**) |
| 08 Confirm | Staff + resident | The system writes the formal defect report from the AI findings and collects the three signatures |
| Ongoing | Staff | Dashboard: busiest areas, most common barrier type, performance so far, how often the AI agrees with staff |

**About the AI:** zero-shot models `openai/clip-vit-base-patch16` (barrier type, effect, walkway check) and
`google/owlvit-base-patch32` (the box on the photo), run locally with Hugging Face Transformers. Nothing is trained,
no photos leave the computer, and there is no licence fee. AI only suggests: residents check it and staff verify before any action.

**Priority score:** points from the effect on the journey, the barrier type, who it affects and repeat reports nearby.
High = 4+ points, Medium = 2–3, Low = 0–1. Staff can change it.

---

## How the prototype maps to the pitch deck

| Pitch deck | Where to find it |
|---|---|
| ① Capture a photo; the app fills in the rest | App → Report → Step 1 of 2 |
| ③ ⑤ Check and edit, then send | App → Step 2 "Check and send" |
| ⑦ Track progress and sign to confirm the fix | App → My reports → report tracker, Updates, "Yes, it's fixed" |
| ② Review reports, AI and priority on a map | Website → Dashboard and Reports |
| ④ Verify type, team and priority, then sign | Report page → Verify |
| ⑥ Assign work with Google Maps directions | Report page → Assign; Location card → Directions in Google Maps |
| ⑧ Confirm the fix; signed defect report | Report page → Confirm; **View report** |
| Impact: precision/recall, staff corrections, auto-fill kept, resolution time, on-time rate, recurring barriers | Website → Dashboard and Recurring issues & evaluation |
| Accessibility: large controls, screen readers, optional voice input | App → Settings; labels on every control; voice description in Step 2 |

---

## Useful commands

```bash
# Reset the demo data (stop the server first with Ctrl+C)
cd ai-server && ./.venv/bin/python db.py reset

# Measure AI accuracy on your own labelled photos
#   ai-server/test_photos/obstruction/  surface/  steps/  none/
cd ai-server && ./.venv/bin/python evaluate.py test_photos

# Check one photo from Terminal
cd ai-server && ./.venv/bin/python accesslens_ai.py photo.jpg
```

## Folder map

```
accesslens/
├── src/                  Resident app (React Native / Expo Router)
│   ├── app/              screens: Home, Report (photo → check and send), My reports, Updates, Settings
│   ├── components/       buttons, cards, photo, AI score card, signature pad, loading screen
│   ├── lib/              AI connection, auto-fill rules, location, theme
│   └── state/            app data + offline queue
├── assets/               logo, icons
├── ai-server/            Server, database, AI and management website
│   ├── server.py         starts everything
│   ├── api.py            all actions (reports, verify, assign, defect reports, priority…)
│   ├── db.py             database tables + demo data
│   ├── accesslens_ai.py  zero-shot AI (CLIP + OWL-ViT)
│   ├── evaluate.py       accuracy test
│   ├── seed/             demo photos
│   └── staff/            management website (+ report.html: formal defect report)
└── README.md             this file
```

## Known limits (prototype)

- Everything runs on one computer; phones must be on the same Wi-Fi.
- Demo passwords and plain HTTP — fine for judging, not for a real deployment.
- Map tiles need internet.
- AI accuracy still has to be measured on photos from the pilot area (see `evaluate.py`).

## Credits

Built with Expo / React Native, Flask, SQLite, Leaflet with OpenStreetMap tiles, and the open models CLIP (OpenAI) and
OWL-ViT (Google) through Hugging Face Transformers. Fonts: Inter and Archivo Black (SIL Open Font License).
