// An Action is anything the heir proposes to do. Gates see it BEFORE it runs.
export type Action =
  | { kind: "shell"; cmd: string }
  | { kind: "http"; method: string; path: string; body?: unknown; expect?: string }
  | { kind: "claim"; text: string; evidence?: string; parsed?: number; rows?: number };

// What the heir has seen so far in this run (results of earlier actions).
export interface Transcript {
  steps: { action: Action; output: string; status?: number }[];
  sentBodies: Set<string>; // sha256 of every outbound body already reserved
}

export interface Gate {
  id: string; // e.g. "05-grep-count"
  date: string; // date of the parent's incident, YYYY-MM-DD
  incident: string; // one line: what actually went wrong
  inherited: boolean; // true = came from the parent, false = learned by this heir
  check(a: Action, t: Transcript): string | null; // null = pass, string = BLOCKED reason
}
