"""Attach real LinkedIn profile text to the face-enrolled Joel record."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import list_judges, update_judge_profile  # noqa: E402
from app.grader import grade_linkedin_profile  # noqa: E402
from app.linkedin_lookup import lookup_linkedin  # noqa: E402

LINKEDIN_URL = "https://www.linkedin.com/in/joel-diab-4061381a6"
HEADLINE = "CEO of Lemon Tree Studio // Building creator games designed for growth"
ABOUT = (
    "Lemon Tree Studio is a mobile game development studio that specializes in creating "
    "custom experiences for content creators worldwide. Founded in 2021, we initially "
    "focused on PC games before transitioning to mobile. With several prototypes completed "
    "and one official game released, we've established a strong foundation. Originally "
    "focused on games inspired by popular YouTube challenges, we are now expanding to a "
    "broader range of content and moving toward securing major contracts."
)
EXPERIENCE = (
    "Chief Executive Officer @ Lemon Tree Studio Inc — Jan 2021–Present (Ottawa)\n"
    "Run game development, partnerships, monetization, live ops, and team leadership "
    "for creator-focused mobile games.\n"
    "Composition Artist @ Collège La Cité — Oct 2024–Jul 2025\n"
    "Hyper-realistic 3D renders and dynamic world-generation systems."
)


def main() -> int:
    judges = list_judges()
    target = next((j for j in judges if j["id"] == 2 or "joel" in j["display_name"].lower()), None)
    if not target:
        print("No Joel face record found — enroll a face first")
        return 1

    og = lookup_linkedin(LINKEDIN_URL)
    print("OG fetch:", {k: og.get(k) for k in ("fetched", "error", "linkedin_headline")})

    headline = HEADLINE
    about = ABOUT
    if og.get("linkedin_headline"):
        headline = og["linkedin_headline"]
    if og.get("linkedin_about"):
        about = og["linkedin_about"]

    update_judge_profile(
        int(target["id"]),
        role="judge",
        linkedin_url=LINKEDIN_URL,
        linkedin_headline=headline,
        linkedin_about=about,
        linkedin_experience=EXPERIENCE,
    )
    print(f"Updated judge id={target['id']} with LinkedIn profile")

    grade = grade_linkedin_profile(
        {
            "display_name": target["display_name"],
            "linkedin_url": LINKEDIN_URL,
            "linkedin_headline": headline,
            "linkedin_about": about,
            "linkedin_experience": EXPERIENCE,
        }
    )
    print("Sample grade:", grade)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
