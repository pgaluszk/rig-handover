import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Routes under test: GET /digest/:night (HTML, plan § 2a) and GET /api/digest/:night (JSON, § 2b).
// Written against the contract in issue #5; the routes land in other workers' branches.

const GOOD_NIGHT = '2026-10-27';
const BAD_LINE_NIGHT = '2026-10-28';
const EMPTY_NIGHT = '2026-10-30';
const MISSING_NIGHT = '2026-10-31';

// Deliberately not in sorted order in the file, so sorting is actually exercised.
const GOOD_LINES = [
  '{"at":"2026-10-27T23:00:06+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
  '{"at":"2026-10-27T23:00:02+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-27T22:00:00+01:00","job":"digest/render","status":"ok","owner":null}',
  '{"at":"2026-10-27T21:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-27T21:31:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
];

const JOBS_SORTED = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup'];
// The bad-line night holds GOOD_LINES[0..2] only: no fixtures/refresh.
const BAD_LINE_JOBS = ['digest/render', 'lane/sync', 'notes/backup'];

const ROW_KEYS = ['firstAt', 'job', 'lastAt', 'lastError', 'lastStatus', 'owner', 'retries', 'runs'];

let runsDir: string;
let config: { adapter: string; installed: string; beatEverySeconds: number; runsDir: string };

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(runsDir, `${GOOD_NIGHT}.jsonl`), GOOD_LINES.join('\n') + '\n');
  writeFileSync(
    join(runsDir, `${BAD_LINE_NIGHT}.jsonl`),
    [GOOD_LINES[0], 'this is not json', GOOD_LINES[1], GOOD_LINES[2]].join('\n') + '\n',
  );
  writeFileSync(join(runsDir, `${EMPTY_NIGHT}.jsonl`), '');
  config = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

// Position of each job name in the HTML, in document order. -1 if missing.
function positions(html: string, jobs: readonly string[]): number[] {
  return jobs.map((j) => html.indexOf(j));
}

describe('GET /digest/:night (page)', () => {
  it('200 with a table that contains each job name', async () => {
    const res = await createApp(config).request(`/digest/${GOOD_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table');
    for (const job of JOBS_SORTED) expect(html).toContain(job);
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('empty night: 200 and the text "nothing ran"', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('a bad line among good ones: 200, the good jobs still render', async () => {
    const res = await createApp(config).request(`/digest/${BAD_LINE_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of BAD_LINE_JOBS) expect(html).toContain(job);
    expect(html).not.toContain('fixtures/refresh');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200 with { night, rows, badLines }, rows sorted by job, every row has the full shape', async () => {
    const res = await createApp(config).request(`/api/digest/${GOOD_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: Record<string, unknown>[]; badLines: number };
    expect(Object.keys(body).sort()).toEqual(['badLines', 'night', 'rows']);
    expect(body.night).toBe(GOOD_NIGHT);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(JOBS_SORTED);
    for (const row of body.rows) expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
    expect(body.rows.find((r) => r.job === 'fixtures/refresh')).toMatchObject({
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-27T21:30:00+01:00',
      lastAt: '2026-10-27T21:31:00+01:00',
    });
  });

  it('owner null in the log stays null in JSON', async () => {
    const res = await createApp(config).request(`/api/digest/${GOOD_NIGHT}`);
    const body = (await res.json()) as { rows: { job: string; owner: string | null }[] };
    expect(body.rows.find((r) => r.job === 'digest/render')!.owner).toBeNull();
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('empty night: rows [] and badLines 0', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY_NIGHT, rows: [], badLines: 0 });
  });

  it('a bad line: badLines 1, good jobs present', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD_LINE_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { badLines: number; rows: { job: string }[] };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync', 'notes/backup']);
  });
});

describe('page and JSON agree', () => {
  it.each([GOOD_NIGHT, BAD_LINE_NIGHT])('%s: job names appear in the HTML in the same order as JSON rows', async (night) => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${night}`)).text();
    const body = (await (await app.request(`/api/digest/${night}`)).json()) as { rows: { job: string }[] };
    const jobs = body.rows.map((r) => r.job);
    const pos = positions(html, jobs);
    for (const p of pos) expect(p).toBeGreaterThanOrEqual(0);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });
});
