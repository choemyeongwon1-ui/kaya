// Module 2 — 거점별 혼잡도 (시나리오 모델)
// 요일×시간대 패턴은 주제서 p.8 예시 히트맵 형태를 따른 가정값이다.
// 현장 계수(10~11주차) 후 거점별 보정계수로 교체하고, XGBoost/LSTM 예측으로 대체할 예정.

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06~22시

// 공원 전체 점유율(최대 수용 대비) — 06시부터 22시까지
const WEEKDAY = [0.05, 0.08, 0.12, 0.16, 0.2, 0.26, 0.34, 0.32, 0.3, 0.32, 0.38, 0.46, 0.58, 0.52, 0.42, 0.3, 0.15];
const FRIDAY = [0.05, 0.08, 0.12, 0.17, 0.22, 0.3, 0.42, 0.4, 0.38, 0.42, 0.5, 0.6, 0.72, 0.66, 0.55, 0.42, 0.22];
const WEEKEND = [0.06, 0.1, 0.18, 0.3, 0.45, 0.62, 0.86, 0.94, 0.95, 0.92, 0.8, 0.68, 0.64, 0.55, 0.42, 0.3, 0.16];

export const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function baseOccupancy(dow, hour) {
  if (hour < 6 || hour > 22) return 0.02;
  const p = dow === 0 || dow === 6 ? WEEKEND : dow === 5 ? FRIDAY : WEEKDAY;
  return p[hour - 6];
}

/** Weather shifts demand: outdoor ↓, indoor ↑ under heat / dust / rain. */
export function weatherFactor(type, snap = {}) {
  let f = 1;
  const heat = (snap.feels ?? 20) >= 33 ? 2 : (snap.feels ?? 20) >= 31 ? 1 : 0;
  const dust = (snap.pm25 ?? 0) >= 76 ? 2 : (snap.pm25 ?? 0) >= 36 ? 1 : 0;
  const rain = snap.heavyRain || (snap.precip ?? 0) >= 15 ? 2 : (snap.pop ?? 0) >= 60 ? 1 : 0;
  if (type === 'outdoor') f *= [1, 0.75, 0.5][heat] * [1, 0.8, 0.5][dust] * [1, 0.6, 0.25][rain];
  if (type === 'shade') f *= [1, 1.1, 0.85][heat] * [1, 0.85, 0.55][dust] * [1, 0.6, 0.3][rain];
  if (type === 'indoor') f *= [1, 1.35, 1.7][heat] * [1, 1.3, 1.6][dust] * [1, 1.4, 1.8][rain];
  // Overall park visits also drop in bad weather
  const total = [1, 0.9, 0.7][Math.max(heat, dust, rain)];
  return f * total;
}

// deterministic pseudo-noise so "실측(시뮬레이션)" is stable per hub/hour/day
function noise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

export function hubLoad(hub, dow, hour, snap) {
  if (hub.type === 'gate' || !hub.capacity) return null;
  const occ = baseOccupancy(dow, hour);
  const pull = 0.55 + 0.6 * hub.pull; // popular hubs fill faster
  const ratio = Math.min(1.35, occ * pull * weatherFactor(hub.type, snap) * 1.15);
  return { ratio, people: Math.round(ratio * hub.capacity) };
}

export function loadStage(ratio) {
  if (ratio >= 0.9) return { key: 'very', label: '매우 혼잡', tone: 'critical' };
  if (ratio >= 0.7) return { key: 'busy', label: '혼잡', tone: 'serious' };
  if (ratio >= 0.4) return { key: 'normal', label: '보통', tone: 'warning' };
  return { key: 'free', label: '여유', tone: 'good' };
}

/** Today's series for one hub: simulated actual (past) + forecast (all hours). */
export function hubSeries(hub, dow, nowHour, hourlyWeather, dayKey = 0) {
  const byHour = Object.fromEntries(hourlyWeather.map((h) => [h.hour, h]));
  return HOURS.map((hour) => {
    const snap = byHour[hour] ?? hourlyWeather[0];
    const f = hubLoad(hub, dow, hour, snap);
    const forecast = f ? f.people : 0;
    const actual = hour <= nowHour ? Math.max(0, Math.round(forecast * (1 + 0.18 * noise(hub.id.length * 31 + hour * 7 + dayKey)))) : null;
    return { hour, forecast, actual, capacity: hub.capacity };
  });
}

/** 7 × 17 park-wide occupancy matrix for the week heatmap (fair weather baseline). */
export function weekMatrix() {
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, label: DOW_LABELS[dow], values: HOURS.map((h) => baseOccupancy(dow, h)) }));
}

export { HOURS };
