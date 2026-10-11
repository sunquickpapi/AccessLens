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
        "a photo of a person's face",
        "a photo of an indoor room",
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

    def to_json(self) -> dict:
        return {
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


class Analyser:
    """Real models. Loading takes ~10–30 s the first time (and downloads ~1 GB once)."""

    def __init__(self, with_box: bool = True):
        import torch
        from transformers import CLIPModel, CLIPProcessor

        torch.set_grad_enabled(False)
        self.torch = torch
        self.clip_processor = CLIPProcessor.from_pretrained(CLIP_MODEL)
        self.clip = CLIPModel.from_pretrained(CLIP_MODEL).eval()

        self.prompt_list: list[str] = []
        self.prompt_owner: list[int] = []
        for ci, cat in enumerate(CATEGORIES):
            for p in PROMPTS[cat]:
                self.prompt_list.append(p)
                self.prompt_owner.append(ci)

        self.owl = None
        if with_box:
            from transformers import OwlViTForObjectDetection, OwlViTProcessor

            self.owl_processor = OwlViTProcessor.from_pretrained(OWL_MODEL)
            self.owl = OwlViTForObjectDetection.from_pretrained(OWL_MODEL).eval()

        self.name = f"zero-shot:{CLIP_MODEL.split('/')[-1]}" + (f"+{OWL_MODEL.split('/')[-1]}" if with_box else "")

    def classify(self, img: Image.Image) -> dict[str, float]:
        torch = self.torch
        inputs = self.clip_processor(text=self.prompt_list, images=img, return_tensors="pt", padding=True)
        out = self.clip(**inputs)
        probs = out.logits_per_image.softmax(dim=-1)[0]
        owner = torch.tensor(self.prompt_owner)
        return {cat: float(probs[owner == ci].sum()) for ci, cat in enumerate(CATEGORIES)}

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
        scores = self.classify(img)
        top = max(scores, key=scores.get)
        best_barrier = max((c for c in CATEGORIES if c != "none"), key=scores.get)
        no_barrier = top == "none"
        box = None if no_barrier else self.locate(img, best_barrier)
        return Result(
            category=None if no_barrier else best_barrier,
            confidence=scores[top],
            scores=scores,
            box=box,
            uncertain=scores[top] < UNCERTAIN_BELOW,
            no_barrier=no_barrier,
            model=self.name,
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
        return Result(
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
