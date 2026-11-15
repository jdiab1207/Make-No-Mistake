"""Best-effort public web identity from a face crop (reverse image + LinkedIn hints)."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote_plus, unquote

import cv2
import httpx
import numpy as np

LINKEDIN_RE = re.compile(
    r"https?://(?:www\.)?linkedin\.com/in/[a-zA-Z0-9\-_%]+/?",
    re.I,
)
NAME_FROM_TITLE_RE = re.compile(
    r"([A-Z][a-z]+(?:\s+[A-Z][a-z'’-]+){1,3})\s*[|\-–—].*LinkedIn",
    re.I,
)


def _face_crop_jpeg(image_bgr: np.ndarray, quality: int = 90) -> bytes:
    """Tight-ish center crop so reverse-image focuses on the face, not the room."""
    h, w = image_bgr.shape[:2]
    side = int(min(h, w) * 0.72)
    cx, cy = w // 2, int(h * 0.42)
    x1 = max(0, cx - side // 2)
    y1 = max(0, cy - side // 2)
    x2 = min(w, x1 + side)
    y2 = min(h, y1 + side)
    crop = image_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        crop = image_bgr
    # Cap size for upload hosts
    ch, cw = crop.shape[:2]
    max_side = 720
    if max(ch, cw) > max_side:
        scale = max_side / max(ch, cw)
        crop = cv2.resize(crop, (int(cw * scale), int(ch * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise ValueError("Could not encode face crop")
    return buf.tobytes()


def _upload_temp(image_jpeg: bytes) -> str | None:
    """Host image briefly so search engines can fetch it by URL."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AuraScanner/0.1"}

    hosts = [
        # litterbox — 1h expiry
        lambda: httpx.post(
            "https://litterbox.catbox.moe/resources/internals/api.php",
            data={"reqtype": "fileupload", "time": "1h"},
            files={"fileToUpload": ("face.jpg", image_jpeg, "image/jpeg")},
            headers=headers,
            timeout=30.0,
        ),
        # catbox permanent-ish
        lambda: httpx.post(
            "https://catbox.moe/user/api.php",
            data={"reqtype": "fileupload"},
            files={"fileToUpload": ("face.jpg", image_jpeg, "image/jpeg")},
            headers=headers,
            timeout=30.0,
        ),
        # 0x0.st
        lambda: httpx.post(
            "https://0x0.st",
            files={"file": ("face.jpg", image_jpeg, "image/jpeg")},
            headers=headers,
            timeout=30.0,
        ),
        # file.io ephemeral
        lambda: httpx.post(
            "https://file.io",
            files={"file": ("face.jpg", image_jpeg, "image/jpeg")},
            headers=headers,
            timeout=30.0,
        ),
    ]
    for send in hosts:
        try:
            resp = send()
            text = (resp.text or "").strip()
            if resp.status_code >= 400:
                continue
            if text.startswith("http"):
                return text.split()[0]
            # file.io JSON
            if "file.io" in str(resp.url) or text.startswith("{"):
                try:
                    data = resp.json()
                    link = data.get("link") or data.get("url")
                    if link:
                        return str(link)
                except Exception:
                    pass
        except Exception:
            continue
    return None


def _extract_candidates(html: str) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for m in LINKEDIN_RE.finditer(html):
        url = m.group(0).split("?")[0].rstrip("/")
        # unwrap redirect encodings
        url = unquote(url)
        if "/in/" not in url.lower():
            continue
        # normalize
        url = re.sub(r"^http://", "https://", url, flags=re.I)
        if url not in found:
            found[url] = {
                "linkedin_url": url,
                "display_name": None,
                "source": "reverse_image",
            }

    for m in NAME_FROM_TITLE_RE.finditer(html):
        name = m.group(1).strip()
        # attach name to first unnamed candidate if possible
        for c in found.values():
            if not c.get("display_name"):
                c["display_name"] = name
                break
        else:
            # name-only hint (still useful for LinkedIn text search)
            key = f"name:{name.lower()}"
            if key not in found:
                found[key] = {
                    "linkedin_url": None,
                    "display_name": name,
                    "source": "reverse_image_title",
                }

    return list(found.values())


def _dedupe(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for c in candidates:
        key = (c.get("linkedin_url") or c.get("display_name") or "").lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def _search_by_image_upload(image_jpeg: bytes) -> list[dict[str, Any]]:
    """Direct multipart reverse-image (no public host required)."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/121.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    candidates: list[dict[str, Any]] = []
    with httpx.Client(follow_redirects=True, timeout=35.0, headers=headers) as client:
        # Yandex Images — accepts upfile
        try:
            resp = client.post(
                "https://yandex.com/images/search",
                params={"rpt": "imageview", "format": "json"},
                files={"upfile": ("face.jpg", image_jpeg, "image/jpeg")},
            )
            if resp.status_code < 400:
                candidates.extend(_extract_candidates(resp.text))
        except Exception:
            pass
        # Bing SBI upload endpoint (best-effort; may no-op)
        try:
            resp = client.post(
                "https://www.bing.com/images/search",
                params={"view": "detailv2", "iss": "sbiupload", "FORM": "SBIVRP"},
                files={"imageBin": ("face.jpg", image_jpeg, "image/jpeg")},
            )
            if resp.status_code < 400:
                candidates.extend(_extract_candidates(resp.text))
        except Exception:
            pass
    return _dedupe(candidates)


def _search_by_image_url(image_url: str) -> list[dict[str, Any]]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/121.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    candidates: list[dict[str, Any]] = []
    urls = [
        f"https://yandex.com/images/search?rpt=imageview&url={quote_plus(image_url)}",
        f"https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVRP&imgurl={quote_plus(image_url)}",
        f"https://lens.google.com/uploadbyurl?url={quote_plus(image_url)}",
    ]
    with httpx.Client(follow_redirects=True, timeout=25.0, headers=headers) as client:
        for u in urls:
            try:
                resp = client.get(u)
                if resp.status_code >= 400:
                    continue
                candidates.extend(_extract_candidates(resp.text))
            except Exception:
                continue
    return _dedupe(candidates)


def _linkedin_search_by_name(name: str) -> dict[str, Any] | None:
    """Text search for a LinkedIn profile when reverse-image only yielded a name."""
    q = f'site:linkedin.com/in "{name}"'
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        )
    }
    try:
        resp = httpx.get(
            f"https://duckduckgo.com/html/?q={quote_plus(q)}",
            headers=headers,
            timeout=20.0,
            follow_redirects=True,
        )
        hits = _extract_candidates(resp.text)
        for h in hits:
            if h.get("linkedin_url"):
                h["display_name"] = h.get("display_name") or name
                h["source"] = "name_web_search"
                return h
    except Exception:
        return None
    return {
        "linkedin_url": None,
        "display_name": name,
        "source": "name_only",
    }


def identify_from_face(image_bgr: np.ndarray) -> dict[str, Any]:
    """
    Try to identify a person from a webcam frame via public reverse-image search.
    Returns {ok, candidates, best, image_url, error}.
    """
    out: dict[str, Any] = {
        "ok": False,
        "candidates": [],
        "best": None,
        "image_url": None,
        "error": None,
    }
    try:
        jpeg = _face_crop_jpeg(image_bgr)
        candidates = _search_by_image_upload(jpeg)

        hosted = _upload_temp(jpeg)
        out["image_url"] = hosted
        if hosted:
            candidates.extend(_search_by_image_url(hosted))
            candidates = _dedupe(candidates)

        if not candidates and not hosted:
            out["error"] = "reverse_image_failed"
            return out

        # If we only have names, try to resolve LinkedIn URLs
        resolved: list[dict[str, Any]] = []
        for c in candidates:
            if c.get("linkedin_url"):
                resolved.append(c)
            elif c.get("display_name"):
                hit = _linkedin_search_by_name(c["display_name"])
                if hit:
                    resolved.append(hit)
        out["candidates"] = resolved or candidates

        ranked = sorted(
            out["candidates"],
            key=lambda c: (0 if c.get("linkedin_url") else 1, c.get("display_name") or ""),
        )
        if ranked:
            out["best"] = ranked[0]
            out["ok"] = True
        else:
            out["error"] = "no_web_identity"
    except Exception as e:
        out["error"] = str(e)
    return out
