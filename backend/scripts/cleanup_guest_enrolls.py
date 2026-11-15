import sqlite3
from pathlib import Path

db = Path(__file__).resolve().parents[1] / "data" / "aura.db"
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
n = con.execute(
    """
    DELETE FROM judges
    WHERE role = 'camera_only'
       OR display_name LIKE 'Guest%'
       OR (role = 'web_enroll' AND linkedin_url IS NULL AND display_name = 'Unknown')
    """
).rowcount
# also drop the accidental chad enroll (id 3) if still present without linkedin
n2 = con.execute(
    "DELETE FROM judges WHERE id = 3 AND (linkedin_url IS NULL OR linkedin_url = '')"
).rowcount
con.commit()
rows = [dict(r) for r in con.execute("SELECT id, display_name, role FROM judges")]
print("deleted", n, n2, "remaining", rows)
