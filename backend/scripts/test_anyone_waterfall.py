"""Verify scan works for enrolled face AND unknown face (camera_only)."""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import httpx
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
JOEL = ROOT / "data" / "judges" / "Joel_Diab_capture.jpg"


def post(jpg: bytes) -> dict:
    r = httpx.post(
        "http://127.0.0.1:8000/scan",
        files={"photo": ("t.jpg", jpg, "image/jpeg")},
        headers={"Origin": "http://localhost:3001"},
        timeout=180.0,
    )
    print("status", r.status_code, "acao", r.headers.get("access-control-allow-origin"))
    return r.json()


def main() -> None:
    # 1) Known enrolled face
    joel = JOEL.read_bytes()
    j = post(joel)
    print(
        "ENROLLED",
        json.dumps(
            {
                "matched": j.get("matched"),
                "matchSource": j.get("matchSource"),
                "person": j.get("person"),
                "grade": {
                    k: (j.get("grade") or {}).get(k)
                    for k in ["score", "label", "roast"]
                },
            },
            indent=2,
        ),
    )

    # 2) Synthetic unknown face-ish blob (noise face box) — should still grade camera_only
    #    Prefer a heavily altered image so gallery won't match.
    img = cv2.imdecode(np.frombuffer(joel, dtype=np.uint8), cv2.IMREAD_COLOR)
    # Destroy identity: scramble + heavy blur + color shift
    unknown = cv2.GaussianBlur(img, (51, 51), 0)
    unknown = cv2.flip(unknown, -1)
    unknown[:, :, 0] = 255 - unknown[:, :, 0]
    # Paste a circle so detectors still see a face-like blob? InsightFace needs real face.
    # Instead: use sample_lena which IS enrolled as Alex — better create random
    # Use OpenCV to generate a simple "face" won't work with InsightFace.
    # Use gigachad / public filter image if available.
    chad = ROOT.parent / "web" / "public" / "filters" / "gigachad.jpeg"
    if chad.exists():
        raw = chad.read_bytes()
        u = post(raw)
        print(
            "UNKNOWN/CHAD",
            json.dumps(
                {
                    "matched": u.get("matched"),
                    "matchSource": u.get("matchSource"),
                    "message": u.get("message"),
                    "faceError": u.get("faceError"),
                    "person": u.get("person"),
                    "grade": {
                        k: (u.get("grade") or {}).get(k)
                        for k in ["score", "label", "roast"]
                    },
                },
                indent=2,
            ),
        )
    else:
        _, buf = cv2.imencode(".jpg", unknown)
        u = post(buf.tobytes())
        print("ALTERED", json.dumps(u, indent=2)[:1500])


if __name__ == "__main__":
    main()
