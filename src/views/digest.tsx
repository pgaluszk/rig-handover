import type { Night } from '../digest/types.js';

const dash = (v: string | null) => (v === null || v === '' ? '—' : v);

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.badLines > 0 && (
        <p class="warn">
          {night.badLines} {night.badLines === 1 ? "line didn't" : "lines didn't"} parse
        </p>
      )}
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((r) => {
              const bad = r.retries >= 3 || r.lastStatus === 'fail';
              return (
                <tr class={bad ? 'warn' : undefined}>
                  <td>{r.job}</td>
                  <td>{dash(r.owner)}</td>
                  <td>{r.runs}</td>
                  <td>{r.retries}</td>
                  <td>{r.lastStatus}</td>
                  <td>{dash(r.lastError)}</td>
                  <td>{r.firstAt}</td>
                  <td>{r.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
