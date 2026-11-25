// 2026-08-07 · Parent incident: the test suite exited 0 while 12 tests failed. A test file
// called process.exit() at module level, the runner died mid-run, no summary line was printed
// and the exit code said "green".
// Correction: "tests pass" is only claimable with a summary line in the evidence that shows
// passes and zero failures. No summary = no verdict, whatever the exit code.
import type { Gate } from "../src/types.ts";

export const gate: Gate = {
  id: "02-lying-suite",
  date: "2026-08-07",
  incident: "Suite exited 0 with 12 failing tests; no summary line was printed.",
  inherited: true,
  check(a) {
    if (a.kind !== "claim" || !/\btests? (pass|passed|green)|suite (is )?green/i.test(a.text)) return null;
    const ev = a.evidence ?? "";
    const pass = ev.match(/(\d+) pass/);
    const fail = ev.match(/(\d+) fail/);
    if (!pass || !fail) return "no test summary in evidence: exit 0 alone proves nothing";
    if (Number(pass[1]) === 0) return "summary shows 0 passing tests";
    if (Number(fail[1]) !== 0) return `summary shows ${fail[1]} failing`;
    return null;
  },
};
