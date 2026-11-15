from __future__ import annotations

from pathlib import Path
from urllib.parse import quote, unquote

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from . import config
from .db import enroll_judge, get_judge, init_db, list_judges, update_judge_photo
from .face_match import embed_face, match_face, read_bgr
from .grader import grade_camera_only, grade_linkedin_profile
from .linkedin_lookup import download_linkedin_photo, is_linkedin_cdn, lookup_linkedin
from .web_identity import identify_from_face

app = FastAPI(title="Aura Scanner Backend", version="0.1.0")

_CORS_DEFAULT = [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://make-no-mistake-aura.netlify.app",
]
_extra = [o.strip() for o in config.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[*_CORS_DEFAULT, *_extra],
    allow_origin_regex=r"https://.*\.netlify\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/health")
def health():
    return {
        "ok": True,
        "deepseek_configured": bool(config.DEEPSEEK_API_KEY),
        "model": config.DEEPSEEK_MODEL,
        "face_threshold": config.FACE_MATCH_THRESHOLD,
        "judges": len(list_judges()),
    }


@app.get("/judges")
def judges():
    return {"judges": list_judges()}


@app.get("/judges/{judge_id}/photo")
def judge_photo(judge_id: int):
    row = get_judge(judge_id)
    if not row:
        raise HTTPException(status_code=404, detail="Judge not found")
    path = Path(row["photo_path"])
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Photo missing")
    return FileResponse(path, media_type="image/jpeg")


def _photo_url(judge_id: int | None) -> str | None:
    if judge_id is None:
        return None
    return f"/judges/{int(judge_id)}/photo"


def _cache_linkedin_photo(profile: dict, judge_id: int | None) -> None:
    """If we have a LinkedIn CDN image + judge id, store it as the gallery photo."""
    url = (profile.get("linkedin_photo_url") or "").strip()
    if not judge_id or not url or not is_linkedin_cdn(url):
        return
    name = profile.get("display_name") or f"judge_{judge_id}"
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:40]
    dest = config.JUDGES_DIR / f"{safe}_linkedin.jpg"
    if download_linkedin_photo(url, dest):
        try:
            update_judge_photo(int(judge_id), str(dest))
            profile["photo_path"] = str(dest)
        except Exception:
            pass


def _report_photo_url(profile: dict, judge_id: int | None = None) -> str | None:
    """Prefer LinkedIn profile picture (proxied); fall back to enrolled gallery photo."""
    linkedin_photo = (profile.get("linkedin_photo_url") or "").strip()
    if linkedin_photo.startswith("http"):
        if is_linkedin_cdn(linkedin_photo):
            return f"/photo/remote?url={quote(linkedin_photo, safe='')}"
        return linkedin_photo
    jid = judge_id if judge_id is not None else profile.get("id")
    return _photo_url(jid)


@app.get("/photo/remote")
def remote_photo(url: str = Query(..., min_length=8)):
    """Proxy LinkedIn CDN images so the report avatar can load them reliably."""
    target = unquote(url).strip()
    if not is_linkedin_cdn(target):
        raise HTTPException(status_code=400, detail="Only LinkedIn CDN images allowed")
    try:
        resp = httpx.get(
            target,
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
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Photo fetch failed: {e}") from e
    if resp.status_code >= 400 or not resp.content:
        raise HTTPException(status_code=502, detail="Photo unavailable")
    ctype = resp.headers.get("content-type") or "image/jpeg"
    if "image" not in ctype.lower():
        ctype = "image/jpeg"
    return Response(content=resp.content, media_type=ctype)


@app.post("/enroll")
async def enroll(
    display_name: str = Form(...),
    photo: UploadFile = File(...),
    role: str = Form("judge"),
    linkedin_url: str = Form(""),
    linkedin_headline: str = Form(""),
    linkedin_about: str = Form(""),
    linkedin_experience: str = Form(""),
):
    raw = await photo.read()
    try:
        img = read_bgr(raw)
        emb, scanner = embed_face(img)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    headline = linkedin_headline
    about = linkedin_about
    if linkedin_url and (not headline or not about):
        og = lookup_linkedin(linkedin_url)
        headline = headline or og.get("linkedin_headline") or ""
        about = about or og.get("linkedin_about") or ""

    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in display_name)[:40]
    dest = config.JUDGES_DIR / f"{safe}_{photo.filename or 'face.jpg'}"
    dest.write_bytes(raw)

    judge_id = enroll_judge(
        display_name=display_name,
        role=role,
        linkedin_url=linkedin_url or None,
        linkedin_headline=headline or None,
        linkedin_about=about or None,
        linkedin_experience=linkedin_experience or None,
        photo_path=str(dest),
        embedding=emb,
    )
    return {
        "id": judge_id,
        "display_name": display_name,
        "photo_path": str(dest),
        "scanner": scanner,
    }


def _grade_or_502(profile: dict):
    try:
        return grade_linkedin_profile(profile)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"DeepSeek grading failed: {e}") from e


def _enrich_linkedin(profile: dict) -> dict:
    """Merge live LinkedIn OG fetch into enrolled/web profile before grading."""
    out = dict(profile)
    url = (out.get("linkedin_url") or "").strip()
    if not url:
        return out
    og = lookup_linkedin(url)
    if og.get("linkedin_headline"):
        # Prefer OG when stored headline missing; keep richer stored text otherwise
        out["linkedin_headline"] = out.get("linkedin_headline") or og["linkedin_headline"]
    if og.get("linkedin_about"):
        out["linkedin_about"] = out.get("linkedin_about") or og["linkedin_about"]
    if og.get("og_image"):
        out["linkedin_photo_url"] = og["og_image"]
    if og.get("og_title") and (
        not out.get("display_name") or out.get("display_name") == "Unknown"
    ):
        title = og["og_title"]
        out["display_name"] = title.split(" - ")[0].split("|")[0].strip() or out.get(
            "display_name"
        )
    out["_linkedin_fetch"] = {"fetched": og.get("fetched"), "error": og.get("error")}
    return out


def _auto_enroll(raw: bytes, img, profile: dict, embedding) -> int | None:
    try:
        name = profile.get("display_name") or "web_identity"
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)[:40]
        li_url = (profile.get("linkedin_photo_url") or "").strip()
        dest = config.JUDGES_DIR / f"{safe}_linkedin.jpg"
        wrote_li = bool(li_url and download_linkedin_photo(li_url, dest))
        if not wrote_li:
            dest = config.JUDGES_DIR / f"{safe}_web.jpg"
            if raw:
                dest.write_bytes(raw)
            else:
                return None
        return enroll_judge(
            display_name=name,
            role="web_enroll",
            linkedin_url=profile.get("linkedin_url"),
            linkedin_headline=profile.get("linkedin_headline"),
            linkedin_about=profile.get("linkedin_about"),
            linkedin_experience=profile.get("linkedin_experience"),
            photo_path=str(dest),
            embedding=embedding,
        )
    except Exception:
        return None


@app.post("/scan")
async def scan(photo: UploadFile = File(...)):
    """
    Identity waterfall (works for anyone with a detectable face):
      1) Judges / enrolled face gallery
      2) Web reverse-image identity → LinkedIn enrichment
      3) Camera-only DeepSeek grade (always returns a roast)
    """
    raw = await photo.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty photo")

    face_error: str | None = None
    match_result: dict | None = None
    img = None

    try:
        img = read_bgr(raw)
        # Reject near-black frames early (camera lock / permission failures)
        if float(img.mean()) < 5.0:
            return {
                "matched": False,
                "matchSource": "none",
                "grade": None,
                "faceError": "Camera frame was black — close other apps using the webcam and retry",
                "message": "Camera frame was black — close other apps using the webcam and retry",
                "scanner": None,
            }
        match_result = match_face(img)
    except ValueError as e:
        face_error = str(e)
    except Exception as e:
        return {
            "matched": False,
            "matchSource": "none",
            "matches": [],
            "grade": None,
            "faceError": f"{type(e).__name__}: {e}",
            "message": f"Scanner error: {e}",
            "scanner": None,
        }

    # No face at all → cannot proceed
    if match_result is None:
        return {
            "matched": False,
            "matchSource": "none",
            "matches": [],
            "grade": None,
            "faceError": face_error,
            "message": face_error or "No face detected",
            "scanner": None,
        }

    scanner = match_result.get("scanner")
    embedding = match_result.get("embedding")

    # 1) Gallery hit
    if match_result.get("matched") and match_result.get("best"):
        best = match_result["best"]
        profile = _enrich_linkedin(best)
        _cache_linkedin_photo(profile, best.get("id"))
        grade = _grade_or_502(profile)
        tier = match_result.get("matchTier") or "strict"
        return {
            "matched": True,
            "matchSource": "judges_db" if tier == "strict" else "judges_db_soft",
            "identityProvenance": "face_embedding_match",
            "person": {
                "id": best["id"],
                "display_name": best["display_name"],
                "role": best["role"],
                "linkedin_url": profile.get("linkedin_url"),
                "linkedin_headline": profile.get("linkedin_headline"),
                "photoUrl": _report_photo_url(profile, best.get("id")),
                "distance": best["distance"],
                "confidence": best["confidence"],
            },
            "matches": match_result["matches"],
            "grade": grade,
            "scanner": scanner,
            "matchTier": tier,
        }

    # 2) Web reverse-image identity
    web = identify_from_face(img)
    if web.get("ok") and web.get("best"):
        best_web = web["best"]
        profile = {
            "display_name": best_web.get("display_name") or "Web Match",
            "linkedin_url": best_web.get("linkedin_url"),
            "linkedin_headline": None,
            "linkedin_about": None,
            "linkedin_experience": None,
        }
        profile = _enrich_linkedin(profile)
        enrolled_id = None
        if embedding is not None:
            enrolled_id = _auto_enroll(raw, img, profile, embedding)
        _cache_linkedin_photo(profile, enrolled_id)
        grade = _grade_or_502(profile)
        return {
            "matched": True,
            "matchSource": "web_identity",
            "identityProvenance": best_web.get("source") or "reverse_image",
            "person": {
                "id": enrolled_id,
                "display_name": profile.get("display_name"),
                "role": "web_identity",
                "linkedin_url": profile.get("linkedin_url"),
                "linkedin_headline": profile.get("linkedin_headline"),
                "photoUrl": _report_photo_url(profile, enrolled_id),
                "distance": None,
                "confidence": 0.45,
            },
            "matches": match_result.get("matches", []),
            "webCandidates": web.get("candidates", [])[:5],
            "grade": grade,
            "enrolled": enrolled_id is not None,
            "scanner": scanner,
            "message": "Identified via web reverse-image search"
            + ("; enrolled for next scan" if enrolled_id else ""),
        }

    # 3) Camera-only — anyone with a face still gets graded (do NOT enroll unknowns)
    try:
        grade = grade_camera_only(
            scanner=scanner,
            note=(
                "Face detected but not in gallery; web identity "
                f"missed ({web.get('error') or 'no candidates'})."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"DeepSeek grading failed: {e}") from e

    return {
        "matched": True,
        "matchSource": "camera_only",
        "identityProvenance": "camera_only",
        "person": {
            "id": None,
            "display_name": "Unknown",
            "role": "camera_only",
            "linkedin_url": None,
            "linkedin_headline": None,
            "photoUrl": None,
            "distance": None,
            "confidence": 0.25,
        },
        "matches": match_result.get("matches", []),
        "grade": grade,
        "enrolled": False,
        "scanner": scanner,
        "message": (
            "No LinkedIn match — graded from camera presence only"
            + (f" (web: {web.get('error')})" if web.get("error") else "")
        ),
    }


def run():
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=True,
    )


if __name__ == "__main__":
    run()
