// Module 1 — 기상·환경 위험 단계 판정
// 기준값: 주제서 p.7 예시 (기상청·환경부 예보 등급 참고). 확정 시 근거를 docs/ 에 기록할 것.

export const STAGE = { normal: 0, caution: 1, warning: 2 };
export const STAGE_META = [
  { key: 'normal', label: '정상', tone: 'good', icon: 'check', action: '평소처럼 이용' },
  { key: 'caution', label: '주의', tone: 'serious', icon: 'alert', action: '알림 발송 · 그늘/실내 우선 안내' },
  { key: 'warning', label: '경고', tone: 'critical', icon: 'stop', action: '야외 프로그램 전환' },
];

export const RULES = [
  { key: 'feels', label: '체감온도', unit: '℃', caution: 31, warning: 33, note: '33℃ 이상: 폭염특보 기준 준용' },
  { key: 'uv', label: '자외선지수', unit: '', caution: 6, warning: 8, note: '6~7 높음 · 8 이상 매우높음' },
  { key: 'pm25', label: 'PM2.5', unit: '㎍/㎥', caution: 36, warning: 76, note: '36~75 나쁨 · 76 이상 매우나쁨' },
  { key: 'pm10', label: 'PM10', unit: '㎍/㎥', caution: 81, warning: 151, note: '81~150 나쁨 · 151 이상 매우나쁨' },
  { key: 'pop', label: '강수확률', unit: '%', caution: 60, warning: Infinity, note: '60% 이상 주의 · 호우특보 시 경고' },
];

export function stageOf(rule, value, ctx = {}) {
  if (value == null || Number.isNaN(value)) return STAGE.normal;
  if (rule.key === 'pop' && (ctx.heavyRain || (ctx.precip ?? 0) >= 15)) return STAGE.warning;
  if (value >= rule.warning) return STAGE.warning;
  if (value >= rule.caution) return STAGE.caution;
  return STAGE.normal;
}

/** Evaluate one weather snapshot → per-indicator stages + overall stage. */
export function evaluate(snap) {
  const ctx = { heavyRain: snap.heavyRain, precip: snap.precip };
  const items = RULES.map((r) => {
    const value = snap[r.key];
    return { ...r, value, stage: stageOf(r, value, ctx) };
  });
  const overall = Math.max(...items.map((i) => i.stage));
  const drivers = items.filter((i) => i.stage === overall && overall > 0).map((i) => i.key);
  return { items, overall, drivers };
}

/** 0–100 integrated risk index (for the gauge & trend), weather only. */
export function riskIndex(snap) {
  const part = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const s = [
    part(snap.feels ?? 0, 24, 36) * 1.0,
    part(snap.uv ?? 0, 3, 10) * 0.5,
    part(snap.pm25 ?? 0, 15, 90) * 0.9,
    part(snap.pm10 ?? 0, 30, 170) * 0.5,
    part(snap.pop ?? 0, 30, 100) * (snap.heavyRain ? 1 : 0.6),
  ];
  return Math.round(Math.min(1, Math.max(...s) * 0.75 + (s.reduce((a, b) => a + b, 0) / 5) * 0.5) * 100);
}

/** First upcoming hour whose stage is worse than now → "15시 폭염 경고 예상". */
export function nextEscalation(hourly, nowStage) {
  for (const h of hourly.slice(1)) {
    const ev = evaluate(h);
    if (ev.overall > nowStage) {
      const rule = RULES.find((r) => r.key === ev.drivers[0]);
      return { hour: h.hour, stage: ev.overall, label: rule?.label ?? '' };
    }
  }
  return null;
}

export function bestHours(hourly, n = 3) {
  return hourly
    .filter((h) => h.hour >= 6 && h.hour <= 21)
    .map((h) => ({ ...h, idx: riskIndex(h) }))
    .sort((a, b) => a.idx - b.idx)
    .slice(0, n)
    .sort((a, b) => a.offset - b.offset);
}
