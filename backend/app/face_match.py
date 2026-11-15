"""Multi-scanner face detect + InsightFace ArcFace embeddings for 1:N matching."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from .config import FACE_MATCH_THRESHOLD
from .db import all_embeddings


@lru_cache(maxsize=4)
def get_face_app(det_size: int = 640):
    from insightface.app import FaceAnalysis

    app = FaceAnalysis(
        name="buffalo_l",
        providers=["CPUExecutionProvider"],
    )
    app.prepare(ctx_id=-1, det_size=(det_size, det_size))
    return app


def read_bgr(path_or_bytes: str | Path | bytes) -> np.ndarray:
    if isinstance(path_or_bytes, (str, Path)):
        img = cv2.imread(str(path_or_bytes))
        if img is None:
            raise ValueError(f"Could not read image: {path_or_bytes}")
        return img
    arr = np.frombuffer(path_or_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes")
    return img


def _clahe(image_bgr: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l2 = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge([l2, a, b]), cv2.COLOR_LAB2BGR)


def _upscale_min(image_bgr: np.ndarray, min_side: int = 640) -> np.ndarray:
    h, w = image_bgr.shape[:2]
    if max(h, w) >= min_side:
        return image_bgr
    scale = min_side / max(h, w)
    return cv2.resize(
        image_bgr,
        (int(w * scale), int(h * scale)),
        interpolation=cv2.INTER_CUBIC,
    )


def _pad_crop(image_bgr: np.ndarray, x: int, y: int, w: int, h: int, pad: float = 0.35):
    ih, iw = image_bgr.shape[:2]
    px, py = int(w * pad), int(h * pad)
    x1 = max(0, x - px)
    y1 = max(0, y - py)
    x2 = min(iw, x + w + px)
    y2 = min(ih, y + h + py)
    crop = image_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    return _upscale_min(crop, 320)


def _haar_crops(image_bgr: np.ndarray) -> list[np.ndarray]:
    """OpenCV Haar fallback — skipped on stripped/broken cv2 builds."""
    cascade_cls = getattr(cv2, "CascadeClassifier", None)
    data = getattr(cv2, "data", None)
    if cascade_cls is None or data is None:
        return []
    try:
        path = data.haarcascades + "haarcascade_frontalface_default.xml"
        cascade = cascade_cls(path)
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        if hasattr(cv2, "equalizeHist"):
            gray = cv2.equalizeHist(gray)
        faces = cascade.detectMultiScale(
            gray, scaleFactor=1.08, minNeighbors=4, minSize=(48, 48)
        )
    except Exception:
        return []

    crops = []
    for x, y, w, h in sorted(faces, key=lambda b: b[2] * b[3], reverse=True)[:3]:
        crop = _pad_crop(image_bgr, int(x), int(y), int(w), int(h))
        if crop is not None:
            crops.append(crop)
    return crops


def _skin_blob_crops(image_bgr: np.ndarray) -> list[np.ndarray]:
    """Cheap skin-color blob detector as another face-region prior."""
    try:
        ycrcb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2YCrCb)
        mask = cv2.inRange(ycrcb, (0, 133, 77), (255, 173, 127))
        if hasattr(cv2, "morphologyEx"):
            kernel = np.ones((5, 5), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    except Exception:
        return []

    h, w = image_bgr.shape[:2]
    min_area = (h * w) * 0.02
    boxes = []
    for c in contours:
        x, y, bw, bh = cv2.boundingRect(c)
        area = bw * bh
        if area < min_area:
            continue
        aspect = bw / max(bh, 1)
        if aspect < 0.45 or aspect > 1.8:
            continue
        boxes.append((area, x, y, bw, bh))
    boxes.sort(reverse=True)
    crops = []
    for _, x, y, bw, bh in boxes[:2]:
        crop = _pad_crop(image_bgr, x, y, bw, bh, pad=0.25)
        if crop is not None:
            crops.append(crop)
    return crops


def _center_face_guess(image_bgr: np.ndarray) -> np.ndarray:
    """Webcam selfie prior: face usually centered in upper-middle third."""
    h, w = image_bgr.shape[:2]
    side = int(min(h, w) * 0.55)
    cx, cy = w // 2, int(h * 0.42)
    x1 = max(0, cx - side // 2)
    y1 = max(0, cy - side // 2)
    x2 = min(w, x1 + side)
    y2 = min(h, y1 + side)
    return _upscale_min(image_bgr[y1:y2, x1:x2], 480)


def _largest_embedding(app, image_bgr: np.ndarray) -> np.ndarray | None:
    faces = app.get(image_bgr)
    if not faces:
        return None
    face = max(
        faces,
        key=lambda f: float((f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])),
    )
    return np.asarray(face.normed_embedding, dtype=np.float32)


def _scan_candidates(image_bgr: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """Ordered (scanner_name, image) candidates for detection."""
    base = _upscale_min(image_bgr, 640)
    boosted = _clahe(base)
    mirrored = cv2.flip(base, 1)
    mirrored_boost = cv2.flip(boosted, 1)

    out: list[tuple[str, np.ndarray]] = [
        ("insightface_full", base),
        ("insightface_clahe", boosted),
        ("insightface_mirror", mirrored),
        ("insightface_mirror_clahe", mirrored_boost),
    ]

    for i, crop in enumerate(_haar_crops(base)):
        out.append((f"haar_crop_{i}", crop))
        out.append((f"haar_crop_{i}_clahe", _clahe(crop)))

    for i, crop in enumerate(_haar_crops(mirrored)):
        out.append((f"haar_mirror_crop_{i}", crop))

    for i, crop in enumerate(_skin_blob_crops(base)):
        out.append((f"skin_blob_{i}", crop))
        out.append((f"skin_blob_{i}_clahe", _clahe(crop)))

    out.append(("center_prior", _center_face_guess(base)))
    out.append(("center_prior_clahe", _clahe(_center_face_guess(boosted))))
    return out


def embed_face(image_bgr: np.ndarray) -> tuple[np.ndarray, str]:
    """
    Try multiple face scanners until one yields an ArcFace embedding.
    Returns (embedding, scanner_name).
    """
    attempts: list[str] = []
    # Prefer fast path first; only escalate det sizes if needed
    for det_size in (640, 320, 960):
        app = get_face_app(det_size)
        for name, candidate in _scan_candidates(image_bgr):
            label = f"{name}@det{det_size}"
            try:
                emb = _largest_embedding(app, candidate)
            except Exception:
                attempts.append(label)
                continue
            if emb is not None:
                return emb, label
            attempts.append(label)

    raise ValueError(
        "No face detected across scanners "
        f"({len(attempts)} attempts: insightface+haar+skin+center)"
    )


def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    a = a.astype(np.float32)
    b = b.astype(np.float32)
    denom = float(np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return max(0.0, float(1.0 - np.dot(a, b) / denom))


def match_face(
    image_bgr: np.ndarray,
    threshold: float | None = None,
    top_k: int = 3,
) -> dict:
    """Return best matches from the judges gallery using multi-scanner embed."""
    thr = FACE_MATCH_THRESHOLD if threshold is None else threshold
    soft_thr = max(thr, thr + 0.08)

    query, scanner = embed_face(image_bgr)
    gallery = all_embeddings()
    if not gallery:
        return {
            "matched": False,
            "reason": "empty_gallery",
            "matches": [],
            "threshold": thr,
            "embedding": query,
            "scanner": scanner,
        }

    scored = []
    for meta, emb in gallery:
        dist = cosine_distance(query, emb)
        scored.append({**meta, "distance": dist, "confidence": max(0.0, 1.0 - dist)})
    scored.sort(key=lambda x: x["distance"])
    top = scored[:top_k]
    best = top[0]

    if best["distance"] <= thr:
        matched = True
        match_tier = "strict"
    elif best["distance"] <= soft_thr:
        matched = True
        match_tier = "soft"
        best = {**best, "soft_match": True}
    else:
        matched = False
        match_tier = "none"

    return {
        "matched": matched,
        "matchTier": match_tier,
        "threshold": thr,
        "softThreshold": soft_thr,
        "best": best if matched else None,
        "matches": top,
        "embedding": query,
        "scanner": scanner,
    }
