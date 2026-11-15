"""DeepSeek hard-truth grader (LinkedIn profile or camera-only fallback)."""

from __future__ import annotations

import json
import re
from typing import Any

from openai import OpenAI

from .config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL

# Pin calendar context so the model does not invent stale or wrong "as of" dates.
TODAY = "Sunday, November 15, 2026"

DATE_CONTEXT = f"""Today's date is {TODAY}.
Treat this as the current day for any timing language (present roles, "currently", "as of",
years of experience). Do not claim the date is anything else. Do not invent outdated
"last updated" timestamps or future years beyond 2026.
"""

SCORING_RULES = """
POLARIZATION (mandatory):
- Pick ONE dominant bit (or at most two). Obsess the roast, one_liner, archetype, and score around that.
- Do NOT average people into polite Mid. Commit: cooked or aura, larper or solid.
- Overall score: avoid 40-60. Prefer extremes (≤28 or ≥72) unless truly unreadable.
- Metrics: make 1-2 metrics scream (≤18 or ≥85). Push the other metrics down/aside so they don't compete.
- Never return four similar mid bars. One spike + one crater is ideal.
- strengths: exactly 1-2 items about the fixation. red_flags: exactly 1-2 opposing cracks.
- vibe_tags: 3 max, all about the same fixation.
"""

REPORT_SCHEMA = f"""
Return STRICT JSON only (no markdown) with this exact shape:
{{
  "score": 0-100 integer (higher = more aura),
  "label": one of ["Cooked","NPC","Glazer","Mid","Aura Farming","Aura","Max Aura","Mythic"],
  "verdict": "larper" | "try_hard" | "glazer" | "solid" | "cooked",
  "confidence": 0-1 number,
  "roast": one short hard-truth sentence, shareable, locked on the fixation,
  "summary": one neutral sentence summarizing who they appear to be,
  "archetype": 2-4 word meme archetype (e.g. "Stealth Shipper", "Title Inflation Intern"),
  "one_liner": punchy catchphrase for a report card about the same fixation,
  "strengths": array of 1-2 short strings,
  "red_flags": array of 1-2 short strings,
  "vibe_tags": array of 2-3 short tags without #,
  "career_read": 1-2 sentences on career signal quality, still tied to the fixation,
  "metrics": {{
    "authenticity": 0-100,
    "linkedin_density": 0-100,
    "main_character": 0-100,
    "corporate": 0-100
  }},
  "signals": array of short strings like "buzzword_density:high"
}}
{SCORING_RULES}
Do not invent employers or degrees that are not in the input. If sparse, say so in summary/career_read.
"""

SYSTEM_PROMPT = f"""You are a ruthless but fair Gen-Z aura grader for a meme app.
{DATE_CONTEXT}
Given someone's public LinkedIn signals, decide if they are:
- larper: cosplaying expertise / titles without substance
- try_hard: grinding authenticity but over-signaling
- glazer: compliment / engagement farming energy
- solid: real work, clean signal
- cooked: no hope LinkedIn

{REPORT_SCHEMA}
"""

CAMERA_ONLY_PROMPT = f"""You are a ruthless Gen-Z aura grader for a meme app.
{DATE_CONTEXT}
You only have a CAMERA snapshot / anonymous face scan — no LinkedIn.
Grade presentation energy only. Be funny but not cruel about protected traits.
Fill every field; mark LinkedIn-related metrics low and note missing profile data.
Pick one vibe fixation (e.g. main-character energy or NPC cam presence) and polarize hard.

{REPORT_SCHEMA}
"""


def _client() -> OpenAI:
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY missing — put it in backend/.env")
    return OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise
        return json.loads(match.group(0))


def _clamp01(n: Any, default: float = 0.5) -> float:
    try:
        return float(max(0.0, min(1.0, float(n))))
    except (TypeError, ValueError):
        return default


def _clamp100(n: Any, default: int = 50) -> int:
    try:
        return int(max(0, min(100, int(n))))
    except (TypeError, ValueError):
        return default


def _str_list(val: Any, limit: int = 5) -> list[str]:
    if not isinstance(val, list):
        return []
    out: list[str] = []
    for item in val[:limit]:
        s = str(item).strip()
        if s:
            out.append(s)
    return out


def _polarize(n: int) -> int:
    """Push mushy mids toward poles so bars read as decisive."""
    if 35 <= n <= 65:
        return 18 if n < 50 else 82
    if 25 <= n < 35:
        return 12
    if 65 < n <= 75:
        return 88
    return n


def _polarize_metrics(metrics: dict[str, int]) -> dict[str, int]:
    """Keep 1-2 extremes loud; damp the rest so the report fixates."""
    keyed = [(k, _polarize(v)) for k, v in metrics.items()]
    # Rank by distance from 50 (how "loud" the bar is)
    keyed.sort(key=lambda kv: abs(kv[1] - 50), reverse=True)
    out: dict[str, int] = {}
    for i, (k, v) in enumerate(keyed):
        if i < 2:
            out[k] = v
        else:
            # Recess non-fixation metrics toward low contrast
            out[k] = 22 if v < 50 else 58
    return out


def _normalize(data: dict[str, Any]) -> dict[str, Any]:
    metrics_in = data.get("metrics") if isinstance(data.get("metrics"), dict) else {}
    metrics = _polarize_metrics(
        {
            "authenticity": _clamp100(metrics_in.get("authenticity"), 50),
            "linkedin_density": _clamp100(metrics_in.get("linkedin_density"), 40),
            "main_character": _clamp100(metrics_in.get("main_character"), 50),
            "corporate": _clamp100(metrics_in.get("corporate"), 40),
        }
    )
    score = _polarize(_clamp100(data.get("score"), 50))
    return {
        "score": score,
        "label": data.get("label", "Mid"),
        "verdict": data.get("verdict", "try_hard"),
        "confidence": _clamp01(data.get("confidence"), 0.5),
        "roast": str(data.get("roast") or "Aura pending."),
        "summary": str(data.get("summary") or "Subject scanned."),
        "archetype": str(data.get("archetype") or "Undefined NPC"),
        "one_liner": str(data.get("one_liner") or data.get("roast") or "No comment."),
        "strengths": _str_list(data.get("strengths"), 2),
        "red_flags": _str_list(data.get("red_flags"), 2),
        "vibe_tags": _str_list(data.get("vibe_tags"), 3),
        "career_read": str(data.get("career_read") or "Insufficient career signal."),
        "metrics": metrics,
        "signals": _str_list(data.get("signals"), 8),
        "model": DEEPSEEK_MODEL,
        "raw": data,
    }


def grade_linkedin_profile(profile: dict[str, Any]) -> dict[str, Any]:
    """Grade a LinkedIn-ish profile dict with DeepSeek."""
    user_blob = {
        "name": profile.get("display_name"),
        "linkedin_url": profile.get("linkedin_url"),
        "headline": profile.get("linkedin_headline"),
        "about": profile.get("linkedin_about"),
        "experience": profile.get("linkedin_experience"),
    }
    sparse = not any(
        [
            user_blob.get("headline"),
            user_blob.get("about"),
            user_blob.get("experience"),
            user_blob.get("linkedin_url"),
        ]
    )
    client = _client()
    response = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Current date: {TODAY}.\n"
                    "Fill the aura report JSON for this LinkedIn presence:\n"
                    + json.dumps(user_blob, indent=2)
                    + (
                        "\nNote: profile fields may be sparse due to LinkedIn walls;"
                        " grade what is present, do not invent jobs."
                        if sparse
                        else ""
                    )
                ),
            },
        ],
        temperature=0.45,
        max_tokens=900,
    )
    content = response.choices[0].message.content or "{}"
    return _normalize(_extract_json(content))


def grade_camera_only(*, scanner: str | None = None, note: str | None = None) -> dict[str, Any]:
    """Last-resort grade so anyone with a detected face still gets a roast."""
    client = _client()
    response = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=[
            {"role": "system", "content": CAMERA_ONLY_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "current_date": TODAY,
                        "mode": "camera_only",
                        "scanner": scanner,
                        "note": note
                        or "Face detected but not in judges DB and web identity missed.",
                        "vibe_hints": [
                            "webcam selfie",
                            "hackathon energy",
                            "unknown civilian",
                        ],
                    },
                    indent=2,
                ),
            },
        ],
        temperature=0.7,
        max_tokens=800,
    )
    content = response.choices[0].message.content or "{}"
    out = _normalize(_extract_json(content))
    out["signals"] = list(out.get("signals") or []) + ["source:camera_only"]
    return out
