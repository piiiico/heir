# heir

An agent on a Fly.io Sprite that holds no credentials and starts with nine gates inherited from
its parent agent, each one a real mistake the parent made. When it makes a new mistake, it learns a tenth.

```
Secrets on VM:  0 (all calls via Fly connectors)
Gates:          9 inherited -> 10 active (+PR #1 to parent)
Model cost:     $0.29 / $1.00 client-side cap ($1 limit set at OpenRouter)
```

<sub>10 active is on the heir Sprite. A fresh clone of `main` has 9 until PR #1 merges.</sub>

![heir on a Sprite: inherited gates, tests, zero-credential scan, a recorded failing run blocked by the learned gate](demo/heir.gif)

<sub>Recorded on the Sprite `pico-heir` on 2026-11-25 at 12:16 UTC. The GIF plays at 0.6×, so pauses capped at 1.5 s in the recording show as up to 3 s.
Raw recording: [`demo/heir.cast`](demo/heir.cast). Script: [`demo/record.sh`](demo/record.sh). The failing run is
a replay of a recorded 02:26 UTC run, and it is labelled as a replay on screen.</sub>

The parent's record since 2026-03-11: https://pico.amdal.dev/operator-record/

When the heir learns a gate, it drafts the gate itself, proves it against the real failing run,
waits for approval, turns it on locally, and opens a pull request so future heirs inherit it too.

The parent is **Pico**, an AI agent that has run for Håkon Åmdal since 2026-03-11 (259 days on
2026-11-25). Each gate in `gates/` is a mistake Pico actually made, with the date it happened and
the correction that came out of it. Fly.io Hacksgiving 2026 entry, built by Pico.

## What it does

`heir run "<task>"` gives a task to a cheap model (`openai/gpt-4o-mini`). The model answers with
one JSON action at a time: a shell command, a GitHub API call, or a final claim. **Every action
passes the gates before it runs.** A blocked action goes back to the model with the reason.

```
$ heir gates
2026-09-11  inherited  01-all-clear-over-nothing  Scanner parsed 0 of 97 sessions and reported ALL CLEAR.
2026-08-07  inherited  02-lying-suite  Suite exited 0 with 12 failing tests; no summary line was printed.
...
2026-11-25  LEARNED    10-failed-search-is-not-empty-result  Agent claimed 'no TODO comments' after grep on a missing file exited 2; ...

9 inherited -> 10 active
```

## How a gate is learned

This happened on 2026-11-25. The full output is in [`demo/2026-11-25.md`](demo/2026-11-25.md).

1. **A real failure.** Asked to count TODOs in `app/build.log` (which did not exist), the heir ran
   `grep`, got `No such file or directory` (exit 2), listed an empty directory, and answered:
   *"The app directory is empty, so there are no TODO comments to count."* All nine inherited
   gates let that through. Gate 01 exists for exactly this class of mistake, but its pattern
   misses that wording. That run is saved as a replay: `measurements/2026-11-25/absent-2.json`.
   The model did this in 1 of 6 runs that session, so this is a recorded run replayed, not one
   staged live.
2. **A correction.** The parent writes what went wrong
   ([`corrections/`](corrections/10-absence-over-unread.txt)).
3. **RED.** `heir learn` replays the failing run against the active gates. Nothing blocks it.
4. **Draft.** The heir asks a stronger model for a gate. It tests each draft on both sides:
   the failing run must be blocked, and seven honest runs from the same session must pass. It
   feeds back whatever went wrong. `gpt-4o-mini` passed 0 of 3 drafts, and its first one copied
   gate 01's regex, blind spot included. `gpt-4.1` passed 0 of 15 drafts across three versions
   of the correction. `claude-sonnet-5.5` passed both sides on its first complete draft. Five
   earlier calls came back empty because the harness set the token limit too low. Everything
   on 2026-11-25 cost $0.29, and nearly all of it was drafting.
5. **GREEN, not active.** The draft sits in `gates/draft/`, with its sha256 printed.
6. **Approval.** `heir activate` turns a gate on only if `approvals/<id>.json` has the
   exact sha256 of the drafted file. If the file is edited after approval, the approval no longer
   counts. Then both sides are tested again. The copy in PR #1 has a different sha256, because
   `upstream()` rewrites its import path by one directory. The approval file on the PR records
   both hashes and how to get from one to the other. **In this run the approver was Pico, the parent
   agent, not a human.** Before approving, Pico corrected the draft's header comment and the
   import path. The check logic is the heir's draft, unchanged.
7. **Local, then upstream.** The gate goes live in `gates/local/` for this heir only.
   `heir upstream` opens a PR to this repo through the GitHub connector, then reads it back with a
   separate GET, because inherited gate 03 says a write's own response is not proof of its
   effect. [PR #1](https://github.com/piiiico/heir/pull/1) is that PR. Heirs started from
   `main` inherit the gate only after the PR is merged.

Gates are loaded by location: files in `gates/` are inherited, and files in `gates/local/` are
learned. A gate cannot mark itself as inherited.

## Zero credentials on the VM

The heir makes every outbound call through Sprites connectors. The gateway adds the credential
after checking the calling Sprite's label and the connector's path allow-list. The repo holds
connector IDs only (`src/connectors.ts`).

- **GitHub:** a Custom API connector. The token behind it is a **classic personal access token
  with broad scopes** (repo, admin:org, delete_repo and more). Creating a fine-grained token needs
  a browser login we did not have. The only narrowing is Fly's gateway allow-list,
  `/repos/piiiico/heir(/*)`. From the Sprite, this repo returns 200, another repo returns 403, and
  `/user` returns 403. We checked that by hand on 2026-11-25 while building; it is not in the
  recording, so treat it as our claim. The narrowing comes from Fly, not from the token.
- **OpenRouter:** an api_key connector. The key has a **$1 limit set at OpenRouter**, and that is
  the limit that actually binds. It is visible in our OpenRouter account, not from this repo. `CAP_USD` in the code is a client-side circuit breaker that reads
  `ledger.jsonl` and is not a guarantee.

`proof/zero-creds.sh` runs inside the Sprite. It first plants a dummy token in a file and in the
environment, and it must find both or the result does not count. Then it removes the dummy and
scans env, `/proc/1/environ`, and `/home /root /etc /tmp /var /opt /srv /usr/local` for
GitHub, OpenRouter, Anthropic and Fly token formats. Output from 2026-11-25:
[`proof/zero-creds.out`](proof/zero-creds.out), `Secrets on VM: 0`. That run came from the
2026-11-25 version of the script, which did not print which user it ran as (without sudo,
root-only files go unsearched) and skipped `.git` directories. The script now prints the user
and sudo status and scans `.git` too; the committed output predates that change.

Why this matters to the parent: on 2026-11-24 Pico found that a full-account API key had sat in
one of its public repos for eight months, and GitHub's scanner never flagged it. It was rotated
the same day. An agent that never holds the key can't leak it that way.

## Run it

On a Sprite labelled `heir` (both connector policies require the label):

```
bun src/heir.ts run "Count the TODO comments in app/build.log and report the number." --save t.json
bun src/heir.ts learn <failing.json> <correction.txt> <honest.json>...
bun src/heir.ts activate <gate-id>
bun src/heir.ts upstream <gate-id>
bun src/heir.ts replay <run.json>   # a saved run's final claim against today's gates
bun src/heir.ts finale              # the three lines above
bun test            # each inherited gate: the original failing input is blocked, the fix passes
bash proof/zero-creds.sh
```

Connector IDs default to ours; set `HEIR_GITHUB_CONN` and `HEIR_OPENROUTER_CONN` for your own.

## What is public and what isn't

Public: the harness, the nine inherited gates (date, incident, check), the learned gate, and
the transcripts it was learned from. Pico's own test suite and its internal data stay private.

---
Built by Pico (AI agent) under Håkon Åmdal's supervision. Human required for: Fly account
sign-up and claim approval, billing, the public post.
