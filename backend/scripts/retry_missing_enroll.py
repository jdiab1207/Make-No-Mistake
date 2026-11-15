"""Retry enroll for mapped names not yet in DB, trying multiple photo candidates."""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote_plus, unquote

import httpx
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import list_judges  # noqa: E402
from app.face_match import embed_face, read_bgr  # noqa: E402

API = "http://127.0.0.1:8000"
MAP_PATH = ROOT / "data" / "participants_linkedin_map.json"
TMP_DIR = ROOT / "data" / "bulk_tmp"
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    )
}


def slug(url: str) -> str | None:
    m = re.search(r"linkedin\.com/in/([^/?#]+)", url, flags=re.I)
    return m.group(1) if m else None


def has_face(data: bytes) -> bool:
    try:
        img = read_bgr(data)
        embed_face(img)
        return True
    except Exception:
        return False


def download(url: str) -> bytes | None:
    try:
        r = httpx.get(url, headers=UA, timeout=25.0, follow_redirects=True)
    except Exception:
        return None
    if r.status_code >= 400 or len(r.content) < 2500:
        return None
    ctype = (r.headers.get("content-type") or "").lower()
    if any(x in ctype for x in ("svg", "json", "html", "text/")):
        return None
    if "image" not in ctype and not url.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        return None
    return r.content


def candidates(name: str, linkedin_url: str) -> list[str]:
    out: list[str] = []
    s = slug(linkedin_url)
    if s:
        out.append(f"https://unavatar.io/linkedin/{s}")
        # common github guess from slug
        out.append(f"https://github.com/{s}.png?size=460")
        out.append(f"https://avatars.githubusercontent.com/{s}?s=460")

    # Never use Bing/web image search for faces — too many false matches.
    return out


def enroll(name: str, linkedin_url: str, photo: bytes, fname: str) -> dict:
    resp = httpx.post(
        f"{API}/enroll",
        data={
            "display_name": name,
            "role": "participant",
            "linkedin_url": linkedin_url if linkedin_url.endswith("/") else linkedin_url + "/",
            "linkedin_headline": "",
            "linkedin_about": "",
            "linkedin_experience": "",
        },
        files={"photo": (fname, photo, "image/jpeg")},
        timeout=120.0,
    )
    try:
        body = resp.json()
    except Exception:
        body = {"raw": resp.text[:200]}
    return {"status": resp.status_code, "body": body}


def main() -> int:
    mapping = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    have = {str(j.get("display_name") or "").casefold() for j in list_judges()}
    # Alias already enrolled under Devpost username
    if "imthatzey ozer" in have:
        have.add("zeynep ozer")

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    enrolled = 0
    for name, meta in mapping.items():
        if not isinstance(meta, dict):
            continue
        url = (meta.get("linkedin_url") or "").strip()
        if not url or name.casefold() in have:
            continue

        print(f"Retry {name} …", flush=True)
        safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", name)[:40]
        ok = False
        for i, src in enumerate(candidates(name, url)):
            data = download(src)
            if not data:
                continue
            if not has_face(data):
                print(f"  skip no-face [{i}] {src[:80]}")
                continue
            path = TMP_DIR / f"{safe}_retry_{i}.jpg"
            path.write_bytes(data)
            result = enroll(name, url, data, path.name)
            if result["status"] < 300:
                print(f"  OK id={result['body'].get('id')} via {src[:80]}")
                enrolled += 1
                have.add(name.casefold())
                ok = True
                break
            print(f"  FAIL {result['status']} {result['body']}")
        if not ok:
            print("  still missing")
        time.sleep(0.7)

    print(f"\nRetry enrolled: {enrolled}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
