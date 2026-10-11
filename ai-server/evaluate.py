"""
Measure how well the AI does on your own test photos.

Put photos in folders named after the correct answer:

    test_photos/
        obstruction/   (motorcycles, bins, signboards on the path …)
        surface/       (cracks, holes, broken drain covers …)
        steps/         (steps, high kerbs with no ramp …)
        none/          (clear walkways — optional but recommended)

Then run:   ./.venv/bin/python evaluate.py test_photos

It prints precision, recall and F1 per category, overall accuracy and a
confusion matrix, and saves every prediction to results.csv.
Use photos from locations the prompts were NOT tuned on (slide 7, step 02).
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

from accesslens_ai import CATEGORIES, make_analyser

EXTS = {".jpg", ".jpeg", ".png", ".heic", ".webp"}
NAMES = {"obstruction": "Obstruction", "surface": "Surface damage", "steps": "Steps", "none": "No barrier"}


def main(root: str) -> None:
    root_path = Path(root)
    photos = [(p, p.parent.name) for p in sorted(root_path.glob("*/*")) if p.suffix.lower() in EXTS and p.parent.name in CATEGORIES]
    if not photos:
        sys.exit(f"No photos found. Make folders inside '{root}' named: {', '.join(CATEGORIES)}")

    if any(p.suffix.lower() == ".heic" for p, _ in photos):
        try:
            from pillow_heif import register_heif_opener

            register_heif_opener()
        except ImportError:
            sys.exit("Some photos are .heic. Run: ./.venv/bin/python -m pip install pillow-heif   (or export them as JPEG)")

    analyser = make_analyser(with_box=False)
    rows = []
    for i, (path, truth) in enumerate(photos, 1):
        r = analyser.analyse(path.read_bytes())
        pred = r.category or "none"
        rows.append({"file": str(path), "truth": truth, "predicted": pred, "confidence": round(r.confidence, 3)})
        mark = "✓" if pred == truth else "✗"
        print(f"[{i}/{len(photos)}] {mark} {path.name}: {NAMES[truth]} → {NAMES[pred]} ({r.confidence:.0%})")

    present = [c for c in CATEGORIES if any(r["truth"] == c or r["predicted"] == c for r in rows)]
    print("\nCategory          Precision  Recall   F1     Photos")
    for c in present:
        tp = sum(r["truth"] == c and r["predicted"] == c for r in rows)
        fp = sum(r["truth"] != c and r["predicted"] == c for r in rows)
        fn = sum(r["truth"] == c and r["predicted"] != c for r in rows)
        p = tp / (tp + fp) if tp + fp else 0.0
        rc = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * p * rc / (p + rc) if p + rc else 0.0
        n = sum(r["truth"] == c for r in rows)
        print(f"{NAMES[c]:<17} {p:>8.0%} {rc:>8.0%} {f1:>6.0%} {n:>8}")

    acc = sum(r["truth"] == r["predicted"] for r in rows) / len(rows)
    print(f"\nOverall accuracy: {acc:.0%} on {len(rows)} photos")

    print("\nConfusion matrix (rows = correct answer, columns = AI's answer)")
    head = "".join(f"{NAMES[c][:12]:>14}" for c in present)
    print(f"{'':<17}{head}")
    for t in present:
        line = "".join(f"{sum(r['truth'] == t and r['predicted'] == p for r in rows):>14}" for p in present)
        print(f"{NAMES[t]:<17}{line}")

    with open("results.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file", "truth", "predicted", "confidence"])
        w.writeheader()
        w.writerows(rows)
    print("\nSaved every prediction to results.csv")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "test_photos")
