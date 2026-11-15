// 날씨·대기 예보와 위험 단계 판정. 기준과 시연 시나리오는 기존 대시보드(머무는 숲)와 같습니다.
import { CENTER, STAGE, HEAVY_RAIN } from './config.js';
import { sunTimes } from './geo.js';

const FORECAST = `https://api.open-meteo.com/v1/forecast?latitude=${CENTER.lat}&longitude=${CENTER.lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,uv_index,relative_humidity_2m,wind_speed_10m&timezone=Asia%2FSeoul&forecast_days=2`;
const AIR = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${CENTER.lat}&longitude=${CENTER.lon}&hourly=pm2_5,pm10&timezone=Asia%2FSeoul&forecast_days=2`;
const r1 = v => v == null ? null : Math.round(v * 10) / 10;

/** 서울 기준 현재 시각 */
export function seoulNow(base = new Date()) {
  const d = new Date(base.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return { date: d, dow: d.getDay(), hour: d.getHours(), minute: d.getMinutes(), month: d.getMonth() + 1 };
}

/** 실시간 예보 24시간 (실패하면 예외) */
export async function fetchWeather(now = new Date(), fetchFn = fetch) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 7000);
  let f, a;
  try {
    [f, a] = await Promise.all([FORECAST, AIR].map(u => fetchFn(u, { signal: ctl.signal }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })));
  } finally { clearTimeout(timer); }
  const s = seoulNow(now).date, p2 = n => String(n).padStart(2, '0');
  const key = `${s.getFullYear()}-${p2(s.getMonth() + 1)}-${p2(s.getDate())}T${p2(s.getHours())}:00`;
  const i0 = Math.max(0, f.hourly.time.indexOf(key));
  const airIdx = Object.fromEntries(a.hourly.time.map((t, i) => [t, i]));
  const hourly = [];
  for (let i = i0; i < Math.min(i0 + 24, f.hourly.time.length); i++) {
    const t = f.hourly.time[i], j = airIdx[t];
    hourly.push({ time: t, hour: Number(t.slice(11, 13)), offset: i - i0,
      temp: r1(f.hourly.temperature_2m[i]), feels: r1(f.hourly.apparent_temperature[i]), pop: f.hourly.precipitation_probability[i], precip: r1(f.hourly.precipitation[i]),
      uv: r1(f.hourly.uv_index[i]), rh: f.hourly.relative_humidity_2m[i], wind: r1(f.hourly.wind_speed_10m[i]),
      pm25: j == null ? null : r1(a.hourly.pm2_5[j]), pm10: j == null ? null : r1(a.hourly.pm10[j]) });
  }
  return { source: 'Open-Meteo (실시간 예보·대기질 모델)', live: true, hourly };
}

/** 네트워크가 안 될 때, 또는 시연 시각을 고를 때 쓰는 표본. startHour 를 주면 그 시각부터 24시간 */
export function sampleWeather(now = new Date(), startHour = null) {
  const h0 = startHour ?? seoulNow(now).hour;
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const hour = (h0 + i) % 24, s = Math.sin((hour - 6) / 24 * Math.PI * 2);
    return { time: `sample-${i}`, hour, offset: i, temp: r1(12 + 5 * s), feels: r1(10.5 + 5 * s), pop: 10, precip: 0, uv: r1(Math.max(0, 3 * s)), rh: 55, wind: 2.1, pm25: 22, pm10: 38 };
  });
  return { source: '오프라인 표본 (네트워크 연결 실패)', live: false, hourly };
}

// 시연용 날씨. 폭염·미세먼지·호우는 기존 대시보드와 같은 식이고, 한파는 이 화면에서 더한 것입니다.
const wave = (hour, mid, amp, peak = 15) => mid + amp * Math.cos((hour - peak) / 24 * Math.PI * 2);
export const SCENARIOS = [
  { key: 'live', label: '실시간', desc: '현재 서울숲 실제 예보' },
  { key: 'heat', label: '폭염',   desc: '8월 폭염특보 날 — 체감 35℃, 자외선 9', day: [8, 5] },
  { key: 'dust', label: '미세먼지', desc: '봄철 고농도 — 초미세먼지 매우나쁨', day: [4, 10] },
  { key: 'rain', label: '호우',   desc: '장마철 호우특보', day: [7, 10] },
  { key: 'cold', label: '한파',   desc: '1월 한파 — 체감 영하 10℃ 안팎', day: [1, 15] },
];
export function applyScenario(w, key) {
  if (key === 'live') return w;
  const hourly = w.hourly.map(h => {
    const x = { ...h };
    if (key === 'heat') Object.assign(x, { temp: r1(wave(h.hour, 29.5, 4.5)), feels: r1(wave(h.hour, 30.5, 5.2)), uv: r1(Math.max(0, wave(h.hour, 3.5, 6, 13))), pop: 10, precip: 0, pm25: 24, pm10: 41, rh: 68 });
    else if (key === 'dust') Object.assign(x, { temp: r1(wave(h.hour, 16, 5)), feels: r1(wave(h.hour, 15, 5)), uv: r1(Math.max(0, wave(h.hour, 2, 4, 13))), pm25: r1(wave(h.hour, 70, 18, 11)), pm10: r1(wave(h.hour, 135, 35, 11)), pop: 0, precip: 0 });
    else if (key === 'rain') Object.assign(x, { temp: r1(wave(h.hour, 24, 2)), feels: r1(wave(h.hour, 26, 2)), uv: 1, pm25: 9, pm10: 15, pop: 90, precip: r1(h.offset < 10 ? 22 - h.offset : 6) });
    else if (key === 'cold') Object.assign(x, { temp: r1(wave(h.hour, -5, 4)), feels: r1(wave(h.hour, -10, 4.5)), uv: r1(Math.max(0, wave(h.hour, .5, 1.5, 13))), pm25: 18, pm10: 30, pop: 0, precip: 0, rh: 40, wind: 4.5 });
    return x;
  });
  const sc = SCENARIOS.find(s => s.key === key);
  return { ...w, hourly, scenario: key, heavyRain: key === 'rain', source: `시연 · ${sc.desc}` };
}

/** 시간별 자료에 낮/밤과 위험 단계를 붙인다. date: 서울 기준 오늘(시연이면 그 계절의 날짜) */
export function annotate(w, now) {
  const sc = SCENARIOS.find(s => s.key === (w.scenario ?? 'live'));
  const base = sc?.day ? new Date(now.date.getFullYear(), sc.day[0] - 1, sc.day[1]) : now.date;
  const sun = sunTimes(base, CENTER.lat, CENTER.lon);
  const hourly = w.hourly.map(h => {
    const x = { ...h, heavyRain: !!w.heavyRain };
    x.day = h.hour + .5 >= sun.rise && h.hour + .5 <= sun.set;
    x.ev = evaluate(x);
    return x;
  });
  return { ...w, hourly, sun, month: sc?.day ? sc.day[0] : now.month };
}

/** 한 시각의 위험 단계: 0 정상 · 1 주의 · 2 경고 (기존 대시보드와 같은 규칙) */
export function evaluate(h) {
  const items = STAGE.map(s => {
    const v = h[s.key];
    let stage = 0;
    if (v != null && !Number.isNaN(v)) {
      if ((s.key === 'pop' && (h.heavyRain || (h.precip ?? 0) >= HEAVY_RAIN)) || v >= s.warning) stage = 2;
      else if (v >= s.caution) stage = 1;
    }
    return { ...s, value: v, stage };
  });
  const overall = Math.max(...items.map(i => i.stage));
  return { items, overall, drivers: items.filter(i => i.stage === overall && overall > 0).map(i => i.key) };
}

export const STAGE_LABEL = ['정상', '주의', '경고'];
export const DRIVER_TEXT = {
  feels: ['더위 주의', '폭염 경고'], uv: ['자외선 높음', '자외선 매우높음'], pm25: ['초미세먼지 나쁨', '초미세먼지 매우나쁨'],
  pm10: ['미세먼지 나쁨', '미세먼지 매우나쁨'], pop: ['비 소식', '호우 경고'],
};
