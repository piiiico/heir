// 2026-08-26 · Parent incident: `assertPanelFloor(panel, file)` passed a FILENAME into the
// numeric minRuns slot. `3 < "money/x.json"` is NaN-false, so the floor never fired, and every
// grep still showed the gate "armed".
// Correction: any numeric limit the heir is handed (budget, floor, retry count) must be a
// finite number at the call site, checked at runtime, not trusted from the type it should be.
import type { Gate } from "../src/types.ts";

export const gate: Gate = {
  id: "06-nan-threshold",
  date: "2026-08-26",
  incident: "A filename in a numeric threshold slot made the floor check silently false.",
  inherited: true,
  check(a) {
    if (a.kind !== "http" || a.body == null || typeof a.body !== "object") return null;
    for (const [k, v] of Object.entries(a.body as Record<string, unknown>)) {
      if (/^(limit|max|min|floor|threshold|budget|per_page)(_|$)/i.test(k) && !(typeof v === "number" && Number.isFinite(v)))
        return `field "${k}" is a threshold but holds ${JSON.stringify(v)}: comparisons against it are silently false`;
    }
    return null;
  },
};
