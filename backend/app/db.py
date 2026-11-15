import json
import sqlite3
from pathlib import Path
from typing import Any

import numpy as np

from .config import DB_PATH, JUDGES_DIR


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    JUDGES_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS judges (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              display_name TEXT NOT NULL,
              role TEXT DEFAULT 'judge',
              linkedin_url TEXT,
              linkedin_headline TEXT,
              linkedin_about TEXT,
              linkedin_experience TEXT,
              photo_path TEXT NOT NULL,
              embedding BLOB NOT NULL,
              active INTEGER DEFAULT 1,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()


def _pack_embedding(vec: np.ndarray) -> bytes:
    return np.asarray(vec, dtype=np.float32).tobytes()


def _unpack_embedding(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32).copy()


def enroll_judge(
    *,
    display_name: str,
    photo_path: str,
    embedding: np.ndarray,
    role: str = "judge",
    linkedin_url: str | None = None,
    linkedin_headline: str | None = None,
    linkedin_about: str | None = None,
    linkedin_experience: str | None = None,
) -> int:
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO judges (
              display_name, role, linkedin_url, linkedin_headline,
              linkedin_about, linkedin_experience, photo_path, embedding
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                display_name,
                role,
                linkedin_url,
                linkedin_headline,
                linkedin_about,
                linkedin_experience,
                photo_path,
                _pack_embedding(embedding),
            ),
        )
        conn.commit()
        return int(cur.lastrowid)


def list_judges() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, display_name, role, linkedin_url, linkedin_headline, active FROM judges"
        ).fetchall()
        return [dict(r) for r in rows]


def get_judge(judge_id: int) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT id, display_name, role, linkedin_url, linkedin_headline,
                   linkedin_about, linkedin_experience, photo_path, active
            FROM judges WHERE id = ?
            """,
            (judge_id,),
        ).fetchone()
        return dict(row) if row else None


def all_embeddings() -> list[tuple[dict[str, Any], np.ndarray]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, display_name, role, linkedin_url, linkedin_headline,
                   linkedin_about, linkedin_experience, photo_path, embedding
            FROM judges WHERE active = 1
            """
        ).fetchall()
        out: list[tuple[dict[str, Any], np.ndarray]] = []
        for r in rows:
            data = dict(r)
            emb = _unpack_embedding(data.pop("embedding"))
            out.append((data, emb))
        return out


def update_judge_profile(
    judge_id: int,
    *,
    display_name: str | None = None,
    role: str | None = None,
    linkedin_url: str | None = None,
    linkedin_headline: str | None = None,
    linkedin_about: str | None = None,
    linkedin_experience: str | None = None,
) -> None:
    fields: list[str] = []
    values: list[Any] = []
    mapping = {
        "display_name": display_name,
        "role": role,
        "linkedin_url": linkedin_url,
        "linkedin_headline": linkedin_headline,
        "linkedin_about": linkedin_about,
        "linkedin_experience": linkedin_experience,
    }
    for col, val in mapping.items():
        if val is not None:
            fields.append(f"{col} = ?")
            values.append(val)
    if not fields:
        return
    values.append(judge_id)
    with connect() as conn:
        conn.execute(
            f"UPDATE judges SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        conn.commit()


def clear_judges() -> None:
    with connect() as conn:
        conn.execute("DELETE FROM judges")
        conn.commit()
