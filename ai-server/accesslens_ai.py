"""
AccessLens zero-shot barrier analysis.

No training data is needed. Two open-source models describe the photo:

  * CLIP     — compares the photo with written descriptions of each category
               and returns how well each one matches (category + confidence).
  * OWL-ViT  — looks for the objects named in those descriptions and returns
               where the strongest one is (the dashed box in the app).

Both are downloaded once from Hugging Face (free) and then run offline.
"""

from __future__ import annotations

import io
import os
from dataclasses import dataclass

from PIL import Image, ImageOps

CATEGORIES = ["obstruction", "surface", "steps", "none"]

# Step 1 — is this photo of a walkway at all? A ceiling, wall, room, screen or
# person is "no barrier" however much it looks like tiles or cracks.
SCENE_KEYS = ["walkway", "other"]
SCENE_PROMPTS: dict[str, list[str]] = {
    "walkway": [
        "a photo of an outdoor pedestrian walkway",
        "a photo of a sidewalk next to a road",
        "a photo of a footpath or pavement taken outdoors",
        "a photo of a street with a kerb",
        "a photo of steps or a ramp outside a building",
        "a photo of a covered walkway outside shops",
        "a photo of a path in a park or housing area",
        "a photo of a road or parking area",
        "a close-up photo of a cracked pavement or a pothole",
        "a photo of a drain cover on a footpath",
        "a photo of paving tiles on an outdoor walkway",
        "a photo of a motorcycle or bins parked on a pavement",
    ],
    "other": [
        "a photo of a ceiling",
        "a photo looking up at ceiling tiles or a roof from below",
        "a photo of a wall",
        "a photo of the inside of a room",
        "a photo of a floor inside a house or office",
        "a photo of the sky",
        "a photo of a person or a face",
        "a photo of a computer, phone or TV screen",
        "a photo of a document, paper or text",
        "a photo of food or a drink",
        "a photo of furniture",
        "a very dark or blurry photo",
    ],
}

# Several phrasings per category; their probabilities are added together
# (prompt ensembling), which makes zero-shot results steadier.
PROMPTS: dict[str, list[str]] = {
    "obstruction": [
        "a photo of a motorcycle parked on a pedestrian walkway",
        "a photo of a sidewalk blocked by parked motorcycles or cars",
        "a photo of a footpath blocked by bins, signboards or objects",
        "a photo of an obstacle blocking a pedestrian path",
        "a photo of plants or construction barriers blocking a walkway",
    ],
    "surface": [
        "a photo of a cracked and broken pavement",
        "a photo of a pothole or hole in a footpath",
        "a photo of a broken or missing drain cover on a walkway",
        "a photo of damaged, uneven or sunken paving tiles",
        "a photo of a crumbling concrete sidewalk",
    ],
    "steps": [
        "a photo of steps on a walkway with no ramp",
        "a photo of a high kerb at a pedestrian crossing",
        "a photo of stairs that a wheelchair cannot use",
        "a photo of a raised curb without a curb ramp",
        "a photo of a sudden level change on a footpath",
    ],
    "none": [
        "a photo of a clear, smooth pedestrian walkway",
        "a photo of an empty sidewalk with nothing blocking it",
        "a photo of a footpath with a proper wheelchair ramp",
        "a photo of a tidy, undamaged pavement",
        "a photo of a smooth path with no obstacles",
    ],
}

# How badly the barrier affects the journey (the resident can change it).
SEVERITY_KEYS = ["blocked", "difficult", "minor"]
SEVERITY_PROMPTS: dict[str, list[str]] = {
    "blocked": [
        "a photo of a walkway that is completely blocked, impossible to walk through",
        "a photo of a footpath fully covered by an obstacle, with no space to pass",
        "a photo of a footpath that ends in steps with no other way through",
        "a photo of a walkway with a huge hole across its whole width",
    ],
    "difficult": [
        "a photo of a walkway that is partly blocked, leaving only a narrow gap",
        "a photo of a footpath with a large hole or broken section that is hard to cross",
        "a photo of a high kerb that is hard to get over",
        "a photo of a footpath where people must squeeze past an obstacle",
    ],
    "minor": [
        "a photo of a walkway with a small crack that is easy to walk past",
        "a photo of a footpath with minor damage, mostly clear",
        "a photo of a small object at the edge of an otherwise clear walkway",
        "a photo of a low step that is easy to get over",
    ],
}

# What OWL-ViT looks for, per category, to place the box.
DETECT: dict[str, list[str]] = {
    "obstruction": ["a motorcycle", "a parked car", "a rubbish bin", "a signboard", "an obstacle on the path"],
    "surface": ["a crack in the pavement", "a pothole", "a broken drain cover", "a hole in the ground"],
    "steps": ["stairs", "a step", "a high curb", "a kerb"],
}

CLIP_MODEL = os.environ.get("ACCESSLENS_CLIP", "openai/clip-vit-base-patch16")
OWL_MODEL = os.environ.get("ACCESSLENS_OWL", "google/owlvit-base-patch32")
UNCERTAIN_BELOW = float(os.environ.get("ACCESSLENS_UNCERTAIN_BELOW", "0.5"))
BOX_THRESHOLD = float(os.environ.get("ACCESSLENS_BOX_THRESHOLD", "0.08"))


@dataclass
class Result:
    category: str | None  # None when the AI thinks there is no barrier
    confidence: float
    scores: dict[str, float]
    box: dict[str, float] | None
    uncertain: bool
    no_barrier: bool
    model: str
    severity: str | None = None
    severity_scores: dict[str, float] | None = None
    walkway: float | None = None  # how sure the AI is the photo shows a walkway at all

    def to_json(self) -> dict:
        return {
            "severity": self.severity,
            "severityScores": {k: round(v, 4) for k, v in (self.severity_scores or {}).items()},
            "walkway": None if self.walkway is None else round(self.walkway, 4),
            "reason": ("not_walkway" if self.no_barrier and self.walkway is not None and self.walkway < 0.5
                       else "clear_walkway" if self.no_barrier else None),
            "category": self.category,
            "confidence": round(self.confidence, 4),
            "scores": {k: round(v, 4) for k, v in self.scores.items()},
            "box": self.box,
            "uncertain": self.uncertain,
            "noBarrier": self.no_barrier,
            "model": self.model,
        }


def load_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)  # respect phone camera rotation
    img = img.convert("RGB")
    img.thumbnail((1024, 1024))
    return img


def _load(cls, name):
    """Use the copy already on this computer first (instant, works offline).
    Only go online if the model has never been downloaded."""
    try:
        return cls.from_pretrained(name, local_files_only=True)
    except Exception:
        return cls.from_pretrained(name)


class Analyser:
    """Real models. Loading takes ~10–30 s the first time (and downloads ~1 GB once)."""

    def __init__(self, with_box: bool = True):
        import torch
        from transformers import CLIPModel, CLIPProcessor

        torch.set_grad_enabled(False)
        self.torch = torch
        self.clip_processor = _load(CLIPProcessor, CLIP_MODEL)
        self.clip = _load(CLIPModel, CLIP_MODEL).eval()

        self.prompt_list, self.prompt_owner = self._flatten(PROMPTS, CATEGORIES)
        self.sev_list, self.sev_owner = self._flatten(SEVERITY_PROMPTS, SEVERITY_KEYS)
        self.scene_list, self.scene_owner = self._flatten(SCENE_PROMPTS, SCENE_KEYS)

        self.owl = None
        if with_box:
            from transformers import OwlViTForObjectDetection, OwlViTProcessor

            self.owl_processor = _load(OwlViTProcessor, OWL_MODEL)
            self.owl = _load(OwlViTForObjectDetection, OWL_MODEL).eval()

        self.name = f"zero-shot:{CLIP_MODEL.split('/')[-1]}" + (f"+{OWL_MODEL.split('/')[-1]}" if with_box else "")

    @staticmethod
    def _flatten(prompts: dict[str, list[str]], keys: list[str]):
        texts, owner = [], []
        for ki, k in enumerate(keys):
            for p in prompts[k]:
                texts.append(p)
                owner.append(ki)
        return texts, owner

    def _zero_shot(self, img: Image.Image, texts: list[str], owner: list[int], keys: list[str]) -> dict[str, float]:
        torch = self.torch
        inputs = self.clip_processor(text=texts, images=img, return_tensors="pt", padding=True)
        out = self.clip(**inputs)
        probs = out.logits_per_image.softmax(dim=-1)[0]
        own = torch.tensor(owner)
        # Average per group (not sum), so a group with more prompts doesn't win just by having more.
        means = {k: float(probs[own == ki].mean()) for ki, k in enumerate(keys)}
        total = sum(means.values()) or 1.0
        return {k: v / total for k, v in means.items()}

    def classify(self, img: Image.Image) -> dict[str, float]:
        return self._zero_shot(img, self.prompt_list, self.prompt_owner, CATEGORIES)

    def scene(self, img: Image.Image) -> dict[str, float]:
        return self._zero_shot(img, self.scene_list, self.scene_owner, SCENE_KEYS)

    def severity(self, img: Image.Image) -> dict[str, float]:
        return self._zero_shot(img, self.sev_list, self.sev_owner, SEVERITY_KEYS)

    def locate(self, img: Image.Image, category: str) -> dict[str, float] | None:
        if self.owl is None or category not in DETECT:
            return None
        torch = self.torch
        queries = DETECT[category]
        inputs = self.owl_processor(text=[queries], images=img, return_tensors="pt")
        outputs = self.owl(**inputs)
        target = torch.tensor([[img.height, img.width]])
        post = getattr(self.owl_processor, "post_process_grounded_object_detection", None) or getattr(
            self.owl_processor, "post_process_object_detection"
        )
        det = post(outputs=outputs, threshold=BOX_THRESHOLD, target_sizes=target)[0]
        if len(det["scores"]) == 0:
            return None
        best = int(det["scores"].argmax())
        x0, y0, x1, y1 = [float(v) for v in det["boxes"][best]]
        x0, y0 = max(0.0, x0), max(0.0, y0)
        x1, y1 = min(float(img.width), x1), min(float(img.height), y1)
        if x1 <= x0 or y1 <= y0:
            return None
        return {
            "x": round(x0 / img.width, 4),
            "y": round(y0 / img.height, 4),
            "w": round((x1 - x0) / img.width, 4),
            "h": round((y1 - y0) / img.height, 4),
            "label": queries[int(det["labels"][best])],
            "score": round(float(det["scores"][best]), 4),
        }

    def analyse(self, data: bytes) -> Result:
        img = load_image(data)
        walkway = self.scene(img)["walkway"]
        cat = self.classify(img)
        # P(barrier type) = P(walkway) x P(type | walkway); everything that isn't a walkway counts as "no barrier".
        scores = {c: walkway * cat[c] for c in CATEGORIES if c != "none"}
        scores["none"] = (1 - walkway) + walkway * cat["none"]
        top = max(scores, key=scores.get)
        best_barrier = max((c for c in CATEGORIES if c != "none"), key=scores.get)
        no_barrier = top == "none"
        box = None if no_barrier else self.locate(img, best_barrier)
        sev = None if no_barrier else self.severity(img)
        return Result(
            severity=max(sev, key=sev.get) if sev else None,
            severity_scores=sev,
            category=None if no_barrier else best_barrier,
            confidence=scores[top],
            scores=scores,
            box=box,
            uncertain=scores[top] < UNCERTAIN_BELOW,
            no_barrier=no_barrier,
            model=self.name,
            walkway=walkway,
        )


class FakeAnalyser:
    """For testing the plumbing without downloading models (ACCESSLENS_FAKE=1)."""

    name = "fake"

    def analyse(self, data: bytes) -> Result:
        img = load_image(data)
        seed = sum(data[:4096]) % 97
        raw = [1 + (seed * (i + 3)) % 7 for i in range(len(CATEGORIES))]
        total = sum(raw)
        scores = {c: r / total for c, r in zip(CATEGORIES, raw)}
        top = max(scores, key=scores.get)
        best_barrier = max((c for c in CATEGORIES if c != "none"), key=scores.get)
        no_barrier = top == "none"
        box = None if no_barrier else {"x": 0.2, "y": 0.3, "w": 0.5, "h": 0.4, "label": "test", "score": 0.5}
        _ = img.size
        sev = None if no_barrier else {k: 0.25 for k in SEVERITY_KEYS} | {SEVERITY_KEYS[seed % 3]: 0.5}
        return Result(
            walkway=0.2 if no_barrier else 0.9,
            severity=SEVERITY_KEYS[seed % 3] if sev else None,
            severity_scores=sev,
            category=None if no_barrier else best_barrier,
            confidence=scores[top],
            scores=scores,
            box=box,
            uncertain=scores[top] < UNCERTAIN_BELOW,
            no_barrier=no_barrier,
            model=self.name,
        )


def make_analyser(with_box: bool = True):
    if os.environ.get("ACCESSLENS_FAKE") == "1":
        return FakeAnalyser()
    return Analyser(with_box=with_box)


if __name__ == "__main__":
    # Check single photos from Terminal:  ./.venv/bin/python accesslens_ai.py photo1.jpg photo2.jpg
    import sys

    a = make_analyser()
    for path in sys.argv[1:]:
        r = a.analyse(open(path, "rb").read())
        verdict = "NO BARRIER" if r.no_barrier else r.category
        print(f"\n{path}: {verdict} ({r.confidence:.0%}){'  [not sure]' if r.uncertain else ''}")
        print(f"  looks like a walkway: {r.walkway:.0%}")
        for k, v in sorted(r.scores.items(), key=lambda kv: -kv[1]):
            print(f"  {k:<12} {v:6.1%}")
        if r.severity:
            print(f"  effect: {r.severity}")
