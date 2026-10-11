# AccessLens AI server

Free, zero-shot barrier detection that runs on your Mac. No training photos needed.

- **CLIP** (open source) compares each photo with written descriptions of
  Obstruction, Surface damage, Steps and "no barrier", and returns the best
  match with a confidence score.
- **OWL-ViT** (open source) finds where the barrier is, for the dashed box.

## Demo day: two Terminal windows

**Window 1: the AI**
```bash
cd ~/Downloads/accesslens
npm run ai
```
The first run sets everything up and downloads the models (about 1 GB, a few
minutes). After that it starts in about 20 seconds. Wait for **"AccessLens AI is running."**

**Window 2: the app**
```bash
cd ~/Downloads/accesslens
npx expo start
```
Scan the QR code. The app finds the AI on the same Mac by itself.
Check it in the app under **Settings → AI connection**.

Phones must be on the same Wi-Fi as the Mac. If the AI is off or unreachable,
residents can still report; they just pick the category themselves.

## Requirements

Python 3.10 or newer. Check with `python3 --version`. If it's older, install
Python from https://www.python.org/downloads/ (free), then run `npm run ai` again.

## Measure accuracy (slide 8: precision and recall)

Put test photos into folders named after the right answer:

```
ai-server/test_photos/obstruction/
ai-server/test_photos/surface/
ai-server/test_photos/steps/
ai-server/test_photos/none/        ← clear walkways (optional)
```

Then:
```bash
cd ~/Downloads/accesslens/ai-server
./.venv/bin/python evaluate.py test_photos
```
You get precision, recall and F1 per category, overall accuracy, a confusion
matrix, and `results.csv` with every prediction.

## Tuning

- Edit the descriptions in `PROMPTS` inside `accesslens_ai.py` to improve
  results (e.g. add "a photo of a drain grate with gaps"). Re-run `evaluate.py`
  to see whether it helped.
- `ACCESSLENS_NO_BOX=1 npm run ai` skips the box model to save time and memory.
- `ACCESSLENS_CLIP=openai/clip-vit-large-patch14 npm run ai` uses a bigger,
  more accurate (and slower) CLIP model.

## Using Expo tunnel mode

`npx expo start --tunnel` hides your Mac's address, so the app can't find the
AI on its own. Tell it the address instead (shown when the AI starts):
```bash
EXPO_PUBLIC_AI_URL=http://192.168.x.x:8000 npx expo start --tunnel
```
The phone still needs to reach that address, so it must be on the same network.
