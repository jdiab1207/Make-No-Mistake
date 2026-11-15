"""Best-effort public LinkedIn signal fetch (OG tags). Falls back gracefully."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

_LI_HOSTS = ("media.licdn.com", "static.licdn.com", "media-exp1.licdn.com")


def is_linkedin_cdn(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return any(host == h or host.endswith("." + h) for h in _LI_HOSTS) or (
        "licdn.com" in host and host.endswith("licdn.com")
    )


def download_linkedin_photo(url: str, dest: Path) -> bool:
    """Download a LinkedIn CDN profile image to dest. Returns True on success."""
    if not url or not is_linkedin_cdn(url):
        return False
    try:
        resp = httpx.get(
            url,
            follow_redirects=True,
            timeout=15.0,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/121.0.0.0 Safari/537.36"
                ),
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                "Referer": "https://www.linkedin.com/",
            },
        )
        if resp.status_code >= 400 or not resp.content:
            return False
        ctype = (resp.headers.get("content-type") or "").lower()
        if "image" not in ctype and not url.lower().endswith(
            (".jpg", ".jpeg", ".png", ".webp")
        ):
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(resp.content)
        return True
    except Exception:
        return False


def _meta(html: str, prop: str) -> str | None:
    patterns = [
        rf'<meta[^>]+property=["\']{re.escape(prop)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{re.escape(prop)}["\']',
        rf'<meta[^>]+name=["\']{re.escape(prop)}["\'][^>]+content=["\']([^"\']+)["\']',
    ]
    for pat in patterns:
        m = re.search(pat, html, flags=re.I)
        if m:
            return m.group(1).strip()
    return None


def lookup_linkedin(url: str) -> dict[str, Any]:
    """
    Try to read public OG tags from a LinkedIn profile URL.
    LinkedIn often walls this — empty fields are OK; caller can use pasted text.
    """
    out: dict[str, Any] = {
        "linkedin_url": url.strip(),
        "linkedin_headline": None,
        "linkedin_about": None,
        "og_title": None,
        "og_image": None,
        "fetched": False,
        "error": None,
    }
    if not url or "linkedin.com" not in url.lower():
        out["error"] = "not_a_linkedin_url"
        return out

    try:
        resp = httpx.get(
            url,
            follow_redirects=True,
            timeout=12.0,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/121.0.0.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        html = resp.text
        title = _meta(html, "og:title") or _meta(html, "twitter:title")
        desc = _meta(html, "og:description") or _meta(html, "description")
        image = (
            _meta(html, "og:image")
            or _meta(html, "og:image:secure_url")
            or _meta(html, "twitter:image")
            or _meta(html, "twitter:image:src")
        )
        if not image:
            # Last resort: first media.licdn.com profile/company image in the HTML
            m = re.search(
                r"https://media\.licdn\.com/(?:dms/image|media)/[^\"'\s<>]+",
                html,
                flags=re.I,
            )
            if m:
                image = m.group(0).rstrip("\\")
        out["og_title"] = title
        out["og_image"] = image
        out["linkedin_headline"] = title
        out["linkedin_about"] = desc
        out["fetched"] = bool(title or desc or image)
        if resp.status_code >= 400 and not out["fetched"]:
            out["error"] = f"http_{resp.status_code}"
    except Exception as e:
        out["error"] = str(e)
    return out
