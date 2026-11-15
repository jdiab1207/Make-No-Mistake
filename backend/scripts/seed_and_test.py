"""
Seed a demo judge + run face match + DeepSeek grade end-to-end.

Usage (from backend/):
  python scripts/seed_and_test.py
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import DEEPSEEK_API_KEY, JUDGES_DIR  # noqa: E402
from app.db import clear_judges, enroll_judge, init_db, list_judges  # noqa: E402
from app.face_match import embed_face, match_face, read_bgr  # noqa: E402
from app.grader import grade_linkedin_profile  # noqa: E402

# Public-domain style sample faces (same person twice for match test)
SAMPLE_FACE_URL = (
    "https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/lena.jpg"
)


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        print(f"Downloading {url} → {dest}")
        urllib.request.urlretrieve(url, dest)
    return dest


def main() -> int:
    init_db()
    clear_judges()

    face_path = download(SAMPLE_FACE_URL, JUDGES_DIR / "sample_lena.jpg")
    img = read_bgr(face_path)
    print("Embedding sample face with multi-scanner…")
    emb, scanner = embed_face(img)
    print(f"Scanner hit: {scanner}")

    # Intentionally try-hard / larper LinkedIn copy for DeepSeek to roast
    judge_id = enroll_judge(
        display_name="Alex Visionary",
        role="demo_judge",
        linkedin_url="https://www.linkedin.com/in/example-alex-visionary",
        linkedin_headline="Visionary Thought Leader | Ex-FAANG | Synergy Evangelist | #OpenToWork",
        linkedin_about=(
            "Passionate about leveraging cutting-edge paradigms to disrupt the "
            "disruption. 10x engineer mindset. Aspiring polymath. Keynote speaker "
            "at three Meetup groups. Building the Uber of AI for vibes."
        ),
        linkedin_experience=(
            "Founder @ SynergyLabs (Stealth) — 2 mo\n"
            "Growth Hacker @ CryptoAdjacent — 4 mo\n"
            "Intern @ RealCompany — 3 mo (left for founder journey)"
        ),
        photo_path=str(face_path),
        embedding=emb,
    )
    print(f"Enrolled judge id={judge_id}: {list_judges()}")

    print("Matching same face against gallery…")
    match = match_face(img)
    print(json.dumps({k: v for k, v in match.items() if k != "matches"}, indent=2, default=str))
    print("Top matches:", json.dumps(match.get("matches", [])[:2], indent=2, default=str))

    if not match.get("matched"):
        print("FAIL: expected a face match")
        return 1

    if not DEEPSEEK_API_KEY:
        print("WARN: DEEPSEEK_API_KEY not set in backend/.env — skipping live DeepSeek call")
        print("Add your key, then re-run: python scripts/seed_and_test.py")
        return 0

    print("Grading LinkedIn with DeepSeek…")
    grade = grade_linkedin_profile(match["best"])
    print(json.dumps(grade, indent=2))
    print("OK — face match + DeepSeek grade succeeded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
