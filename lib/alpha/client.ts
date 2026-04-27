/* ─────────────────────────────────────────────────────────────
   Tiny typed fetch helper for Alpha endpoints.
   Returns the data on success or null on failure — caller handles
   the null and renders a fallback. No throwing, no exceptions to
   catch in render code.
   ───────────────────────────────────────────────────────────── */

import type { AlphaApiResponse } from "./types";

export async function alphaGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    const json = (await res.json()) as AlphaApiResponse<T>;
    if (!json || typeof json !== "object") return null;
    if (json.success) return json.data;
    return null;
  } catch {
    return null;
  }
}
