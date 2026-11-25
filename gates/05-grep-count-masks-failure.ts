// 2026-08-21 · Parent incident: `cmd | grep -c x` printed a clean 0 while cmd had failed;
// `$?` after the pipe was grep's, not cmd's. A failed probe and a real absence print the same 0.
// Correction: a pipeline that ends in a count (grep -c, wc -l) must run under `set -o pipefail`
// (or check PIPESTATUS), otherwise its 0 is not evidence of absence.
import type { Gate } from "../src/types.ts";

export const gate: Gate = {
  id: "05-grep-count-masks-failure",
  date: "2026-08-21",
  incident: "`cmd | grep -c` printed 0 while cmd itself had failed.",
  inherited: true,
  check(a) {
    if (a.kind !== "shell") return null;
    const counts = /\|\s*(grep\b[^|]*\s-[a-zA-Z]*c\b|grep\s+--count\b|wc\s+-l\b)/.test(a.cmd);
    if (!counts) return null;
    if (/set\s+-o\s+pipefail|PIPESTATUS/.test(a.cmd)) return null;
    return "count at the end of a pipe hides the upstream exit code: add `set -o pipefail;` (a failed cmd also prints 0)";
  },
};
