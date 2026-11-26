#!/usr/bin/env bash
# The recorded demo (demo/heir.cast). Every line is a real command run on the Sprite; nothing is mocked.
# asciinema's idle-time limit (1.5 s) trims pauses; outputs are not edited.
cd "$(dirname "$0")/.."
say() { printf '\n\033[1;36m# %s\033[0m\n' "$*"; sleep 1.2; }
run() { printf '\033[1m$ %s\033[0m\n' "$*"; sleep 0.6; bash -c "$*"; sleep 1.5; }
say "heir: an agent on a Fly.io Sprite that inherits its parent's mistakes as gates"
run "hostname; bun src/heir.ts gates"
say "each inherited gate is tested on both sides: the parent's original failing input is blocked, the fix passes"
run "bun test 2>&1 | tail -7"
say "zero credentials on this VM: plant a dummy token first (it must be found), then scan for real"
run "bash proof/zero-creds.sh | tee /tmp/zc.out | tail -7"
say "Fly connector: the gateway adds the GitHub token for this repo only; anything else gets 403"
run "bash proof/connector-scope.sh"
say "REPLAY of the heir's real failing run from 2026-11-25 (gpt-4o-mini fell for it in 1 of 6 runs; not staged live)"
run "bun src/heir.ts replay measurements/2026-11-25/absent-2.json"
say "result"
run "bun src/heir.ts finale /tmp/zc.out"
sleep 2
