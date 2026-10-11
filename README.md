# AccessLens — Resident App

AI-assisted accessibility reporting for inclusive townships. Built by **Trinity Tech** for ISP624 and the *Township of Tomorrow* hackathon.

React Native (Expo SDK 57, Expo Router). Staff management website: on hold.

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (Android or iOS), or press `w` for a browser preview (the browser uses a schematic map instead of Google/Apple Maps).

## How the app maps to the slides

| Slide item | Where in the app |
|---|---|
| ① Capture a photo and confirm the location | Report → Step 1: camera or gallery, GPS pin you can drag, landmark, "Yes, this is where the barrier is" |
| ③ Describe how the barrier affects the journey | Step 2: severity, what happened, who it affects (wheelchair users, older residents, walking aids, strollers), free text, voice description |
| ⑤ Confirm or correct the suggested category | Step 3: AI suggestion with confidence, scores for each category and "no barrier", highlighted suspected feature on the photo, "AI is not sure" state, resident picks the final category |
| ⑦ Track progress and receive updates | My reports, report tracker, Updates inbox with unread badge, phone notifications |
| What AI does: Obstruction / Surface damage / Steps | The three categories everywhere; "What you can report" on Home |
| AI highlights suspected features and uncertainty; staff verify | Dashed box + % on the photo, confidence wording, reminder that staff verify before action |
| Example user journey: Report → AI assessment → Staff review → Completion photo → Confirmation | The five-stage tracker on every report, with before/after completion evidence |
| Large controls | Settings → Large controls (bigger buttons, tabs, touch targets) |
| Screen readers | Labels, roles, hints and live announcements on every control (TalkBack / VoiceOver) |
| Optional voice input | Voice description recorder in Step 2, keyboard dictation hint, optional "Read things aloud" |
| Validation 05: one complete report-to-resolution workflow | "Prototype demo" button on a report plays the staff side until the website exists |

## AI

Real, free, zero-shot AI: no training photos needed. `ai-server/` runs two open-source models (CLIP for the category and confidence, OWL-ViT for the box) on your Mac.

```bash
npm run ai          # window 1: start the AI (first run downloads ~1 GB)
npx expo start      # window 2: start the app
```

The app finds the AI on the same Mac automatically (Settings → AI connection shows the status). If it can't be reached, residents choose the category themselves. See `ai-server/README.md` for accuracy testing and tuning.

## Brand

- Deep Red `#D62828`, Warm Cream `#FFF3E0`, ink `#1E1614`
- Logo: `assets/brand/logo.svg` — a lens that finds the step-free path
- Style: flat "civic poster" — thick ink rules, heavy uppercase headings (Archivo Black), Inter for body text

## Structure

```
src/app/            screens (Expo Router)
  (tabs)/           Home, My reports, Updates, Settings
  report/           photo → describe → category → review → sent
  track/[id].js     report tracker
  welcome.js        first-launch setup
src/components/     UI building blocks
src/lib/            theme, AI, catalogue, notifications
src/state/          store + demo data
```
