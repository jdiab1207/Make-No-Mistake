import json
import time

import cv2
import httpx


def main() -> None:
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)
    for _ in range(8):
        cap.read()
        time.sleep(0.05)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise SystemExit("no frame")
    _, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    r = httpx.post(
        "http://127.0.0.1:8000/scan",
        files={"photo": ("live.jpg", buf.tobytes(), "image/jpeg")},
        headers={"Origin": "http://localhost:3001"},
        timeout=180.0,
    )
    j = r.json()
    print("status", r.status_code)
    print(
        json.dumps(
            {
                "matched": j.get("matched"),
                "identityProvenance": j.get("identityProvenance"),
                "scanner": j.get("scanner"),
                "person": j.get("person"),
                "grade": {
                    k: (j.get("grade") or {}).get(k)
                    for k in ["score", "label", "verdict", "roast"]
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
