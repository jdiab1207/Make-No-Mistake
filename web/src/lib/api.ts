export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

export type ScanMetrics = {
  authenticity: number;
  linkedin_density: number;
  main_character: number;
  corporate: number;
};

export type ScanGrade = {
  score: number;
  label: string;
  verdict: string;
  confidence: number;
  roast: string;
  summary?: string;
  archetype?: string;
  one_liner?: string;
  strengths?: string[];
  red_flags?: string[];
  vibe_tags?: string[];
  career_read?: string;
  metrics?: ScanMetrics;
  signals: string[];
};

export type ScanResponse = {
  matched: boolean;
  matchSource: string;
  identityProvenance?: string;
  message?: string;
  faceError?: string | null;
  scanner?: string | null;
  matchTier?: string | null;
  enrolled?: boolean;
  person?: {
    id: number | null;
    display_name: string;
    linkedin_url?: string;
    linkedin_headline?: string;
    photoUrl?: string | null;
    confidence: number;
    distance?: number;
  };
  grade?: ScanGrade | null;
};

export async function scanAuraPhoto(photo: Blob): Promise<ScanResponse> {
  const form = new FormData();
  form.append("photo", photo, "capture.jpg");

  const res = await fetch(`${API_BASE}/scan`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    let detail = `Scan failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail)
        detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<ScanResponse>;
}
