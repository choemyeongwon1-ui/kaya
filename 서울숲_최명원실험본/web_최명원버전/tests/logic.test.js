import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, STAGE, nextEscalation } from '../src/lib/risk.js';
import { applyScenario, sampleWeather, currentSnap } from '../src/lib/weather.js';
import { recommend, switchProposals, typeAllowed } from '../src/lib/recommend.js';
import { buildGraph, nearestNode, astar, routeVia, loopRoute } from '../src/lib/astar.js';
import { analyze, DEFAULT_WEIGHTS } from '../src/lib/vuln.js';
import { hubLoad, weatherFactor } from '../src/lib/crowd.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf-8'));
const grid = load('grid.geojson');
const network = load('network.json');
const hubs = load('hubs.json');

test('risk thresholds follow the brief (p.7)', () => {
  assert.equal(evaluate({ feels: 30.9 }).overall, STAGE.normal);
  assert.equal(evaluate({ feels: 31 }).overall, STAGE.caution);
  assert.equal(evaluate({ feels: 33 }).overall, STAGE.warning);
  assert.equal(evaluate({ pm25: 75 }).overall, STAGE.caution);
  assert.equal(evaluate({ pm25: 76 }).overall, STAGE.warning);
  assert.equal(evaluate({ pm10: 151 }).overall, STAGE.warning);
  assert.equal(evaluate({ uv: 8 }).overall, STAGE.warning);
  assert.equal(evaluate({ pop: 60 }).overall, STAGE.caution);
  assert.equal(evaluate({ pop: 90, heavyRain: true }).overall, STAGE.warning);
  assert.deepEqual(evaluate({ feels: 34, pm25: 20 }).drivers, ['feels']);
});

test('heat scenario escalates during the afternoon', () => {
  const w = applyScenario(sampleWeather(new Date('2026-08-10T00:00:00+09:00')), 'heat');
  const peak = w.hourly.find((h) => h.hour === 15);
  assert.ok(peak.feels >= 33, `15h feels ${peak.feels}`);
  const now = evaluate(currentSnap(w)).overall;
  const esc = nextEscalation(w.hourly, now);
  assert.ok(esc && esc.stage > now, 'first escalation found');
  assert.ok(w.hourly.some((h) => evaluate(h).overall === STAGE.warning), 'reaches warning');
});

test('warning blocks outdoor; dust also blocks shade', () => {
  const heat = evaluate({ feels: 35 });
  const dust = evaluate({ pm25: 90 });
  assert.equal(typeAllowed('outdoor', heat), false);
  assert.equal(typeAllowed('shade', heat), true);
  assert.equal(typeAllowed('shade', dust), false);
  assert.equal(typeAllowed('indoor', dust), true);
  const recs = recommend({ ev: dust, snap: { pm25: 90 }, hubs, group: 'family', dow: 6, hour: 14 });
  assert.ok(recs.length > 0 && recs.every((r) => r.type === 'indoor'));
});

test('switch proposals give an allowed alternative under heat', () => {
  const w = applyScenario(sampleWeather(new Date('2026-08-10T06:00:00+09:00')), 'heat');
  const props = switchProposals({ hubs, dow: 6, hourly: w.hourly, evaluateFn: evaluate });
  const picnic = props.find((p) => p.programId === 'picnic');
  assert.ok(picnic.mustSwitch);
  assert.ok(picnic.alternative && picnic.alternative.type === 'indoor');
});

test('indoor demand rises and outdoor falls in heat', () => {
  assert.ok(weatherFactor('indoor', { feels: 35 }) > 1);
  assert.ok(weatherFactor('outdoor', { feels: 35 }) < 0.5);
  const lawn = hubs.find((h) => h.id === 'family-lawn');
  assert.ok(hubLoad(lawn, 6, 14, {}).ratio > hubLoad(lawn, 2, 14, {}).ratio, 'weekend busier');
});

test('A* finds connected routes; shade mode lowers heat exposure', () => {
  const g = buildGraph(network, grid);
  const station = hubs.find((h) => h.id === 'gate-station');
  const deer = hubs.find((h) => h.id === 'deer');
  const a = nearestNode(g, [station.lon, station.lat]);
  const b = nearestNode(g, [deer.lon, deer.lat]);
  const short = astar(g, a, b, { mode: 'shortest' });
  const shade = astar(g, a, b, { mode: 'shade' });
  assert.ok(short && shade);
  const r1 = routeVia(g, [[station.lon, station.lat], [deer.lon, deer.lat]], { mode: 'shortest' });
  const r2 = routeVia(g, [[station.lon, station.lat], [deer.lon, deer.lat]], { mode: 'shade' });
  assert.ok(r1.meters > 300 && r1.meters < 2500, `length ${r1.meters}`);
  assert.ok(r2.heat <= r1.heat + 1e-9, `shade ${r2.heat} vs shortest ${r1.heat}`);
  assert.ok(r2.meters >= r1.meters - 1);
  console.log(`  station→deer shortest ${r1.meters}m heat ${r1.heat.toFixed(3)} | shade ${r2.meters}m heat ${r2.heat.toFixed(3)}`);
});

test('loop route hits the step target within 25 %', () => {
  const g = buildGraph(network, grid);
  const station = hubs.find((h) => h.id === 'gate-station');
  const cands = hubs.filter((h) => h.type !== 'gate').map((h) => ({ name: h.name, lonlat: [h.lon, h.lat] }));
  const target = 5000 * 0.7;
  const r = loopRoute(g, [station.lon, station.lat], cands, target, { mode: 'shade' });
  assert.ok(r, 'loop found');
  assert.ok(Math.abs(r.meters - target) / target < 0.25, `loop ${r.meters}m`);
  console.log(`  loop ${r.meters}m via ${r.via.join(' → ')}`);
});

test('vulnerability overlay flags the requested share', () => {
  const res = analyze(grid, DEFAULT_WEIGHTS, 0.2);
  const share = res.vulnerable.length / res.rows.length;
  assert.ok(Math.abs(share - 0.2) < 0.03, `share ${share}`);
  assert.equal(Object.values(res.byType).reduce((a, b) => a + b, 0), res.vulnerable.length);
  console.log('  byType', JSON.stringify(res.byType), 'area', res.areaM2);
});
