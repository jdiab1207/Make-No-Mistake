"""Best-effort public LinkedIn signal fetch (OG tags). Falls back gracefully."""

from __future__ import annotations

import re
from typing import Any

import httpx


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
        image = _meta(html, "og:image")
        out["og_title"] = title
        out["og_image"] = image
        out["linkedin_headline"] = title
        out["linkedin_about"] = desc
        out["fetched"] = bool(title or desc)
        if resp.status_code >= 400 and not out["fetched"]:
            out["error"] = f"http_{resp.status_code}"
    except Exception as e:
        out["error"] = str(e)
    return out
