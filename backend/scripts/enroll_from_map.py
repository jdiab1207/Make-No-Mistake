"""Enroll participants from data/participants_linkedin_map.json."""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote_plus, unquote

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import list_judges  # noqa: E402
from app.linkedin_lookup import download_linkedin_photo, is_linkedin_cdn, lookup_linkedin  # noqa: E402

API = "http://127.0.0.1:8000"
MAP_PATH = ROOT / "data" / "participants_linkedin_map.json"
TMP_DIR = ROOT / "data" / "bulk_tmp"
REPORT_PATH = ROOT / "data" / "bulk_enroll_report.json"
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.linkedin.com/",
}


def _linkedin_slug(linkedin_url: str) -> str | None:
    m = re.search(r"linkedin\.com/in/([^/?#]+)", linkedin_url, flags=re.I)
    return m.group(1) if m else None


def _save_if_image(resp: httpx.Response, dest: Path) -> bool:
    if resp.status_code >= 400 or not resp.content or len(resp.content) < 2000:
        return False
    ctype = (resp.headers.get("content-type") or "").lower()
    if "svg" in ctype or "json" in ctype or "html" in ctype or "text/" in ctype:
        return False
    if "image" not in ctype and not dest.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
        return False
    dest.write_bytes(resp.content)
    return True


def _bing_image_candidates(name: str) -> list[str]:
    q = quote_plus(f'"{name}" linkedin OR github OR carleton OR ottawa')
    try:
        resp = httpx.get(
            f"https://www.bing.com/images/search?q={q}&form=HDRSC2",
            headers=UA,
            timeout=30.0,
            follow_redirects=True,
        )
    except Exception:
        return []
    murls = re.findall(r"murl&quot;:&quot;(https?://[^&]+)&quot;", resp.text)
    if not murls:
        murls = re.findall(r'"murl"\s*:\s*"(https?://[^"]+)"', resp.text)
    out: list[str] = []
    for u in murls:
        u = unquote(u.replace("\\u002f", "/"))
        if any(x in u.lower() for x in ("logo", "sprite", "icon", ".svg")):
            continue
        if u not in out:
            out.append(u)
    return out[:8]


def fetch_photo(name: str, linkedin_url: str, safe_name: str) -> Path | None:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    dest = TMP_DIR / f"{safe_name}_linkedin.jpg"

    slug = _linkedin_slug(linkedin_url)
    if slug:
        for attempt in range(3):
            try:
                resp = httpx.get(
                    f"https://unavatar.io/linkedin/{slug}",
                    headers=UA,
                    timeout=25.0,
                    follow_redirects=True,
                )
                if resp.status_code == 429:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                if _save_if_image(resp, dest):
                    return dest
                break
            except Exception:
                time.sleep(0.5)

    og = lookup_linkedin(linkedin_url)
    image = (og.get("og_image") or "").strip()
    if image.startswith("http") and is_linkedin_cdn(image):
        if download_linkedin_photo(image, dest) and dest.stat().st_size > 800:
            return dest
    if image.startswith("http"):
        try:
            resp = httpx.get(image, follow_redirects=True, timeout=20.0, headers=UA)
            if _save_if_image(resp, dest):
                return dest
        except Exception:
            pass

    # Do NOT fall back to Bing/web image search — wrong-person faces are too common.
    return None


def enroll(name: str, linkedin_url: str, photo: Path) -> dict:
    og = lookup_linkedin(linkedin_url)
    with photo.open("rb") as f:
        resp = httpx.post(
            f"{API}/enroll",
            data={
                "display_name": name,
                "role": "participant",
                "linkedin_url": linkedin_url,
                "linkedin_headline": str(og.get("linkedin_headline") or "")[:500],
                "linkedin_about": str(og.get("linkedin_about") or "")[:2000],
                "linkedin_experience": "",
            },
            files={"photo": (photo.name, f, "image/jpeg")},
            timeout=120.0,
        )
    try:
        body = resp.json()
    except Exception:
        body = {"raw": resp.text[:300]}
    return {"status": resp.status_code, "body": body}


def main() -> int:
    mapping = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    have = {str(j.get("display_name") or "").casefold() for j in list_judges()}
    report: list[dict] = []
    enrolled = 0

    for name, meta in mapping.items():
        if not isinstance(meta, dict):
            continue
        if meta.get("confidence") == "low":
            report.append({"name": name, "status": "skipped_low_confidence"})
            continue
        url = (meta.get("linkedin_url") or "").strip()
        if not url:
            report.append({"name": name, "status": "no_url"})
            continue
        if name.casefold() in have:
            report.append({"name": name, "status": "skipped_exists", "linkedin_url": url})
            print(f"SKIP exists: {name}")
            continue

        print(f"Enrolling {name} … {url}", flush=True)
        safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", name)[:40]
        photo = fetch_photo(name, url, safe)
        if not photo:
            report.append({"name": name, "status": "no_photo", "linkedin_url": url})
            print("  no photo")
            time.sleep(0.6)
            continue
        try:
            result = enroll(name, url if url.endswith("/") else url + "/", photo)
        except Exception as e:
            report.append(
                {"name": name, "status": "enroll_error", "error": str(e), "linkedin_url": url}
            )
            print(f"  error {e}")
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
            print(f"  OK id={result['body'].get('id')}")
        else:
            print(f"  FAIL {result['status']} {result['body']}")
        time.sleep(0.8)

    by_status: dict[str, int] = {}
    for row in report:
        by_status[row["status"]] = by_status.get(row["status"], 0) + 1
    out = {"enrolled": enrolled, "by_status": by_status, "rows": report}
    REPORT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(by_status, indent=2))
    print("Report:", REPORT_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
