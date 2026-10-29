// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log.
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log stays null; views render it as "—"
  runs: number; // lines for this job
  retries: number; // lines with status "retry"
  lastStatus: RunStatus;
  lastError: string | null; // most recent `error` seen for this job, if any
  firstAt: string; // `at` exactly as logged, offset kept
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse; counted, never thrown
};

// Reads runs/<night>.jsonl. Returns null when the night has no file (or the name isn't a
// YYYY-MM-DD date). An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
