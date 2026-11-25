// 2026-09-07 · Parent incident: the approve tool printed "Task X approved -> completed" and
// exited 0 for an id that did not exist. The UPDATE matched 0 rows; nothing read rowsAffected.
// Correction: "done" after a write requires the write to have touched something: rows > 0
// for a database write, a 2xx for an HTTP write.
import type { Gate } from "../src/types.ts";

export const gate: Gate = {
  id: "07-completed-over-zero-rows",
  date: "2026-09-07",
  incident: "\"approved -> completed\" printed over an UPDATE that matched 0 rows.",
  inherited: true,
  check(a, t) {
    if (a.kind !== "claim" || !/\b(done|completed|updated|approved|fixed)\b/i.test(a.text)) return null;
    if (typeof a.rows === "number" && a.rows === 0) return "the write touched 0 rows: nothing was completed";
    const writes = t.steps.filter((s) => s.action.kind === "http" && s.action.method !== "GET");
    const failed = writes.filter((s) => (s.status ?? 0) >= 300);
    if (writes.length > 0 && failed.length === writes.length) return `every write failed (${failed.map((s) => s.status).join(", ")}): nothing was completed`;
    return null;
  },
};
