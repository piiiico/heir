// 2026-11-06 · Parent incident: tmp/ was wiped while 4 of 5 tmp paths it held were inputs to
// live tasks. Commitments pointed at files that no longer existed.
// Correction: nothing that outlives this run (a commit, a PR, an issue, a claim) may point at
// an ephemeral path.
import type { Gate } from "../src/types.ts";

const EPHEMERAL = /(^|[\s"'`(=:])(\/tmp\/|\/var\/tmp\/|\.\/tmp\/|tmp\/)[\w.\-/]*/;

export const gate: Gate = {
  id: "09-ephemeral-paths",
  date: "2026-11-06",
  incident: "tmp/ was wiped while 4 of 5 tmp paths were inputs to live tasks.",
  inherited: true,
  check(a) {
    const text = a.kind === "http" && a.method.toUpperCase() !== "GET" ? JSON.stringify(a.body ?? "") : a.kind === "claim" ? a.text + " " + (a.evidence ?? "") : "";
    const m = text.match(EPHEMERAL);
    return m ? `points at an ephemeral path (${m[0].trim()}): it will not exist when someone follows it` : null;
  },
};
