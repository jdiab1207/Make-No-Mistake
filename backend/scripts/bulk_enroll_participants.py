"""
Bulk-find LinkedIn profiles for hackathon participants and enroll faces.

Usage (from backend/):
  python scripts/bulk_enroll_participants.py
  python scripts/bulk_enroll_participants.py --limit 20
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote_plus

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from urllib.parse import unquote

from app.db import list_judges  # noqa: E402
from app.linkedin_lookup import download_linkedin_photo, is_linkedin_cdn, lookup_linkedin  # noqa: E402

API = "http://127.0.0.1:8000"
NAMES_FILE = Path(__file__).with_name("participants_bulk.txt")
TMP_DIR = ROOT / "data" / "bulk_tmp"
REPORT_PATH = ROOT / "data" / "bulk_enroll_report.json"
LINKEDIN_RE = re.compile(
    r"https?://(?:www\.)?linkedin\.com/in/[a-zA-Z0-9\-_%]+/?",
    re.I,
)

SKIP_NAMES = {
    "private user",
    "team yolo",
    "k y",
    "ky",
    "g fhu",
    "j tan",
    "john m",
    "anhowab w",
    "rez dada",
    "sunday time",
    "alice mp4",
    "alan wake",
}

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    )
}


def load_names() -> list[str]:
    raw = NAMES_FILE.read_text(encoding="utf-8")
    names: list[str] = []
    seen: set[str] = set()
    for line in raw.splitlines():
        name = " ".join(line.strip().split())
        if not name or name.casefold() in SKIP_NAMES:
            continue
        key = name.casefold()
        if key in seen:
            continue
        parts = name.split()
        if len(parts) == 1 and len(name) <= 2:
            continue
        seen.add(key)
        names.append(name)
    return names


def existing_name_keys() -> set[str]:
    return {str(j.get("display_name") or "").casefold() for j in list_judges()}


def _name_tokens(name: str) -> list[str]:
    return [t for t in re.split(r"[^A-Za-z0-9]+", name) if len(t) >= 2]


def _url_matches_name(url: str, name: str) -> bool:
    slug = url.rstrip("/").split("/")[-1].lower().replace("%20", "-")
    tokens = [t.lower() for t in _name_tokens(name)]
    if not tokens:
        return False
    # Prefer slug containing first + last token when both exist
    if len(tokens) >= 2:
        first, last = tokens[0], tokens[-1]
        if first in slug and last in slug:
            return True
        # hyphenated full-name style
        joined = "-".join(tokens)
        if joined in slug or "".join(tokens) in slug.replace("-", ""):
            return True
        # last-name dominant unique matches
        hits = sum(1 for t in tokens if t in slug)
        return hits >= max(2, len(tokens) - 1) if len(tokens) <= 3 else hits >= 2
    return tokens[0] in slug


def _extract_linkedin_urls(html: str) -> list[str]:
    out: list[str] = []
    for m in LINKEDIN_RE.finditer(html):
        u = unquote(m.group(0)).split("?")[0].rstrip("/") + "/"
        u = re.sub(r"^http://", "https://", u, flags=re.I)
        if "/in/" not in u.lower():
            continue
        if u not in out:
            out.append(u)
    return out


def search_linkedin(name: str) -> str | None:
    queries = [
        f'site:linkedin.com/in "{name}"',
        f'site:linkedin.com/in "{name}" Ottawa OR Toronto OR Canada OR Carleton',
        f'"{name}" site:linkedin.com/in',
    ]
    for q in queries:
        try:
            resp = httpx.get(
                f"https://www.bing.com/search?q={quote_plus(q)}",
                headers=UA,
                timeout=25.0,
                follow_redirects=True,
            )
            for url in _extract_linkedin_urls(resp.text):
                if _url_matches_name(url, name):
                    return url
            # If exact-quote search and only one /in/ result, accept it
            urls = _extract_linkedin_urls(resp.text)
            if len(urls) == 1 and q.startswith("site:linkedin.com/in"):
                return urls[0]
        except Exception:
            continue
        time.sleep(0.4)
    return None


def fetch_photo(linkedin_url: str, safe_name: str) -> Path | None:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    og = lookup_linkedin(linkedin_url)
    image = (og.get("og_image") or "").strip()
    dest = TMP_DIR / f"{safe_name}_linkedin.jpg"
    if image.startswith("http") and is_linkedin_cdn(image):
        if download_linkedin_photo(image, dest) and dest.stat().st_size > 800:
            return dest
    if image.startswith("http"):
        try:
            resp = httpx.get(
                image,
                follow_redirects=True,
                timeout=20.0,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
                    ),
                    "Referer": "https://www.linkedin.com/",
                },
            )
            if resp.status_code < 400 and resp.content and len(resp.content) > 800:
                ctype = (resp.headers.get("content-type") or "").lower()
                if "image" in ctype or image.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    dest.write_bytes(resp.content)
                    return dest
        except Exception:
            pass
    return None


def enroll(name: str, linkedin_url: str, photo: Path) -> dict:
    og = lookup_linkedin(linkedin_url)
    headline = og.get("linkedin_headline") or ""
    about = og.get("linkedin_about") or ""
    with photo.open("rb") as f:
        files = {"photo": (photo.name, f, "image/jpeg")}
        data = {
            "display_name": name,
            "role": "participant",
            "linkedin_url": linkedin_url,
            "linkedin_headline": str(headline)[:500],
            "linkedin_about": str(about)[:2000],
            "linkedin_experience": "",
        }
        resp = httpx.post(f"{API}/enroll", data=data, files=files, timeout=120.0)
    try:
        body = resp.json()
    except Exception:
        body = {"raw": resp.text[:300]}
    return {"status": resp.status_code, "body": body}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Max new enrolls (0 = all)")
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--start", type=int, default=0)
    args = parser.parse_args()

    names = load_names()[args.start :]
    have = existing_name_keys()
    report: list[dict] = []
    enrolled = 0

    print(f"Loaded {len(names)} names; {len(have)} already in DB", flush=True)
    for i, name in enumerate(names):
        if args.limit and enrolled >= args.limit:
            break
        if name.casefold() in have:
            report.append({"name": name, "status": "skipped_exists"})
            print(f"[{i + 1}] SKIP exists: {name}", flush=True)
            continue

        print(f"[{i + 1}] Searching LinkedIn: {name} …", flush=True)
        url = search_linkedin(name)
        if not url:
            report.append({"name": name, "status": "no_linkedin"})
            print("    no LinkedIn", flush=True)
            time.sleep(args.sleep)
            continue

        safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", name)[:40]
        photo = fetch_photo(url, safe)
        if not photo:
            report.append({"name": name, "status": "no_photo", "linkedin_url": url})
            print(f"    LinkedIn {url} but no usable photo", flush=True)
            time.sleep(args.sleep)
            continue

        try:
            result = enroll(name, url, photo)
        except Exception as e:
            report.append(
                {
                    "name": name,
                    "status": "enroll_error",
                    "linkedin_url": url,
                    "error": str(e),
                }
            )
            print(f"    enroll error: {e}", flush=True)
            time.sleep(args.sleep)
            continue

        ok = result["status"] < 300
        report.append(
            {
                "name": name,
                "status": "enrolled" if ok else "enroll_failed",
                "linkedin_url": url,
                "http": result["status"],
                "body": result["body"],
            }
        )
        if ok:
            enrolled += 1
            have.add(name.casefold())
            print(f"    OK id={result['body'].get('id')} {url}", flush=True)
        else:
            print(f"    FAIL {result['status']} {result['body']}", flush=True)
        time.sleep(args.sleep)

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    summary = {
        "enrolled": enrolled,
        "total_attempted": len(report),
        "by_status": {},
        "rows": report,
    }
    for row in report:
        st = row["status"]
        summary["by_status"][st] = summary["by_status"].get(st, 0) + 1
    REPORT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("\nDone:", json.dumps(summary["by_status"], indent=2), flush=True)
    print("Report:", REPORT_PATH, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
