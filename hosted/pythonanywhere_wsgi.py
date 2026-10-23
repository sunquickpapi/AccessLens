"""
Free hosted demo of AccessLens on PythonAnywhere (https://<username>.pythonanywhere.com).

One web app serves everything:
    /          entry page: choose Resident or Township staff (hosted/entry.html)
    /app       resident app (web version, built into hosted/web)
    /staff     management website
    /api/...   database API, shared by both, so a resident's report reaches staff at once

The free plan can't run the real AI models (about 1 GB), so this demo uses a scripted
AI (ACCESSLENS_DEMO=1) that gives realistic, repeatable results. The real zero-shot AI
(CLIP + OWL-ViT) runs when you start the project locally with `npm run server`.

In the PythonAnywhere Web tab, the WSGI configuration file only needs:
    import sys
    sys.path.insert(0, "/home/<username>/AccessLens/hosted")
    from pythonanywhere_wsgi import application
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("ACCESSLENS_DEMO", "1")
os.environ.setdefault("ACCESSLENS_APP_DIR", str(ROOT / "hosted" / "web"))
os.environ.setdefault("ACCESSLENS_ENTRY_PAGE", str(ROOT / "hosted" / "entry.html"))
os.environ.setdefault("ACCESSLENS_DATA", str(Path.home() / "accesslens-data"))
sys.path.insert(0, str(ROOT / "ai-server"))

from server import app as application  # noqa: E402
