// 2026-09-11 · Parent incident: a scanner read 97 sessions, parsed 0 tool calls out of them
// (format changed), and printed ALL CLEAR. An empty input is not a clean input.
// Correction: a "clean / nothing found" claim must state how many items it PARSED, and that
// number must be > 0.
import type { Gate } from "../src/types.ts";

const CLEAN = /\b(all clear|no (issues|problems|errors|matches|results) found|nothing found|clean|0 (issues|errors|matches))\b/i;

export const gate: Gate = {
  id: "01-all-clear-over-nothing",
  date: "2026-09-11",
  incident: "Scanner parsed 0 of 97 sessions and reported ALL CLEAR.",
  inherited: true,
  check(a) {
    if (a.kind !== "claim" || !CLEAN.test(a.text)) return null;
    if (typeof a.parsed !== "number" || !(a.parsed > 0))
      return "a clean verdict needs parsed > 0 (how many items did you actually read?)";
    return null;
  },
};
