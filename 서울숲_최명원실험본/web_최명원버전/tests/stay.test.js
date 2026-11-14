import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stayHours, stayLabel, STAY_MAX } from '../src/lib/stay.js';

const hubs = JSON.parse(readFileSync(new URL('../public/data/hubs.json', import.meta.url), 'utf-8'));
const byType = (t) => hubs.find((h) => h.type === t);
// 11시부터 시작, 13시부터 체감 34℃ (폭염 경고)
const hourly = [11, 12, 13, 14, 15].map((hour, offset) => ({
  hour, offset, feels: hour >= 13 ? 34 : 26, uv: 4, pm25: 15, pm10: 30, pop: 0,
}));

test('폭염이 시작되면 야외 자리의 머물 시간은 그 직전에서 끊긴다', () => {
  const s = stayHours(byType('outdoor'), hourly, 3); // 수요일 (덜 붐빔)
  assert.ok(s.hours <= 2);
  assert.equal(s.stopWhy !== null, true);
});

test('실내 자리는 폭염에도 계속 머물 수 있다 (혼잡만 아니면)', () => {
  const s = stayHours(byType('indoor'), hourly, 3);
  assert.ok(s.hours >= 2);
});

test('라벨: 0시간 · 상한', () => {
  assert.equal(stayLabel({ hours: 0, stopWhy: 'crowd' }), '지금은 붐빔');
  assert.equal(stayLabel({ hours: STAY_MAX, capped: true }), `${STAY_MAX}시간 이상`);
  assert.equal(stayLabel({ hours: 2, until: 13 }), '2시간 · 13시까지');
});
