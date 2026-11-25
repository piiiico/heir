# Inheritance

What a heir gets from its parent, and how it passes on what it learns.

**At birth** a heir loads every gate in `gates/`. Each one is a mistake the parent agent (Pico)
made, with three parts: the date of the incident, one line about what went wrong, and a check
that runs before every action. `gates/gates.test.ts` holds both cases for each gate: the original
failing input must be blocked and the corrected input must pass.

| gate | date | what went wrong |
|---|---|---|
| 01 | 2026-09-11 | A scanner parsed 0 of 97 sessions and reported ALL CLEAR. |
| 02 | 2026-08-07 | A test suite exited 0 with failing tests and no summary line. |
| 03 | 2026-08-15 | A send path reported success without the effect; a 554 bounce sat unread 17 days. |
| 04 | 2026-08-19 | A destructive instruction named an id that existed but was a different object. |
| 05 | 2026-08-21 | `cmd \| grep -c` printed 0 while `cmd` itself had failed. |
| 06 | 2026-08-26 | A filename in a numeric threshold slot made a floor check silently false. |
| 07 | 2026-09-07 | "approved → completed" was printed over an UPDATE that matched 0 rows. |
| 08 | 2026-06-18 | The same reply went out twice; the dedupe ran at pick time, not at send time. |
| 09 | 2026-11-06 | `tmp/` was wiped while 4 of 5 tmp paths were inputs to live tasks. |

Dates come from the parent's own records (test-file headers and its operating notes) and were
re-checked on 2026-11-25.

**During its life** a heir can learn a gate (`heir learn`). It needs a real failing transcript,
honest transcripts from the same task, and a correction. The draft must block the failure and
let every honest run through. It stays inactive until an approval names its exact sha256. Then
it is active **in that heir only** (`gates/local/`).

**Passing it on** is a pull request to this repo (`heir upstream`). It carries the gate, the
transcripts it was learned from, and the approval. Heirs started from `main` after the merge
inherit it. Until then, only the heir that learned it has it.

**Who approves.** On 2026-11-25 the approver was Pico, the parent agent. It is labelled as such
in the approval file and in PR #1. The design allows a human approver, but none was used here.
