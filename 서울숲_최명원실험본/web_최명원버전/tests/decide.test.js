import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare, optimize, summarize, proposals, FACTORS, ACTIONS } from '../src/lib/decide.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf-8'));
const grid = load('grid.geojson');
const hubs = load('hubs.json');
const meta = load('meta.json');
const base = prepare(grid, hubs);

test('optimizer stays within budget and raises satisfaction', () => {
  const t0 = Date.now();
  const r = optimize(base, FACTORS, 50000); // 5억
  const now = optimize(base, FACTORS, 50000, { horizon: 'now' });
  console.log('올여름:', JSON.stringify(summarize(now.picks).map((s) => [s.label, s.qty])));
  assert.equal(r.trace.length, r.picks.length + 1);
  assert.ok(Math.abs(r.trace.at(-1)[1] - r.after.S) < 1e-9, 'trace end equals final satisfaction');
  const ms = Date.now() - t0;
  assert.ok(r.spent <= 50000);
  assert.ok(r.picks.length > 0);
  assert.ok(r.after.S > r.before.S);
  console.log('5억:', r.before.S.toFixed(3), '→', r.after.S.toFixed(3), `${r.picks.length}건 ${ms}ms`, JSON.stringify(summarize(r.picks).map((s) => [s.label, s.qty, s.cost])));
});

test('more budget never lowers the result (diminishing returns)', () => {
  const a = optimize(base, FACTORS, 20000).after.S;
  const b = optimize(base, FACTORS, 100000).after.S;
  const c = optimize(base, FACTORS, 200000).after.S;
  assert.ok(b >= a && c >= b);
  assert.ok((c - b) <= (b - a) * 2.5, 'returns should diminish');
  console.log('2억/10억/20억:', a.toFixed(3), b.toFixed(3), c.toFixed(3));
});

test('proposal sentences name evidence, place and items', () => {
  const r = optimize(base, FACTORS, 50000, { strategy: 'vulnerable', horizon: 'now' });
  const ps = proposals(r, base, FACTORS, meta);
  assert.ok(ps.length > 0);
  for (const p of ps) assert.match(p.text, /근거로, .+ 일대에 .+설치해야 한다\./);
  ps.forEach((p) => console.log(' -', p.text));
});

test('disabled action types are never picked', () => {
  const r = optimize(base, FACTORS, 50000, { enabled: ['tree', 'rest'] });
  assert.ok(r.picks.every((p) => ['tree', 'rest'].includes(p.key)));
  assert.ok(Object.keys(ACTIONS).length === 6);
});
