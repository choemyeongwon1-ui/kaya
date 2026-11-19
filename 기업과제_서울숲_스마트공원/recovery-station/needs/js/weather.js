// 날씨·대기 예보와 위험 단계 판정. 기준과 시연 시나리오는 기존 대시보드(머무는 숲)와 같습니다.
import { CENTER, STAGE, HEAVY_RAIN, KMA_URL, AIR_URL } from './config.js';
import { sunTimes } from './geo.js';

const FORECAST = `https://api.open-meteo.com/v1/forecast?latitude=${CENTER.lat}&longitude=${CENTER.lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,uv_index,relative_humidity_2m,wind_speed_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul&forecast_days=2`;   // 바람은 m/s(기본값 km/h라 단위를 맞춤)
const AIR = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${CENTER.lat}&longitude=${CENTER.lon}&hourly=pm2_5,pm10&timezone=Asia%2FSeoul&forecast_days=2`;
const r1 = v => v == null ? null : Math.round(v * 10) / 10;

/** 서울 기준 현재 시각 */
export function seoulNow(base = new Date()) {
  const d = new Date(base.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return { date: d, dow: d.getDay(), hour: d.getHours(), minute: d.getMinutes(), month: d.getMonth() + 1 };
}

/**
 * 체감온도(기상청 생활기상지수 식). 5~9월은 습도를 반영한 여름 식, 10~4월은 바람을 반영한 겨울 식(기온 10℃ 이하·풍속 1.3m/s 이상일 때).
 * 여름: 습구온도 Tw(Stull 2011)로 −0.2442 + 0.55399Tw + 0.45535Ta − 0.0022Tw² + 0.00278TwTa + 3.0
 * 겨울: 13.12 + 0.6215Ta − 11.37V^0.16 + 0.3965Ta·V^0.16 (V: km/h)
 */
export function feelsLike(ta, rh, wind, month) {
  if (ta == null) return null;
  if (month >= 5 && month <= 9) {
    if (rh == null) return ta;
    const tw = ta * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(ta + rh) - Math.atan(rh - 1.67633) + 0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) - 4.686035;
    return r1(-0.2442 + 0.55399 * tw + 0.45535 * ta - 0.0022 * tw * tw + 0.00278 * tw * ta + 3.0);
  }
  if (ta <= 10 && wind != null && wind >= 1.3) { const v = (wind * 3.6) ** 0.16; return r1(13.12 + 0.6215 * ta - 11.37 * v + 0.3965 * ta * v); }
  return ta;
}

/** 기상청 단기예보(중계 서버). 반환: {base, hourly:[{time, temp, rh, pop, precip, snow, wind, sky, pty, coarse}], daily} 또는 null */
export async function fetchKma(timeoutMs = 7000) {
  if (!KMA_URL) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(KMA_URL, { signal: ctl.signal, cache: 'no-cache' });
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d?.hourly) && d.hourly.length ? d : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** 에어코리아(중계 서버): 성동구 측정소 실측 + 서울 미세먼지 예보. 반환: {station, now, hours, forecast, overall} 또는 null */
export async function fetchAir(timeoutMs = 7000) {
  if (!AIR_URL) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(AIR_URL, { signal: ctl.signal, cache: 'no-cache' });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.now?.time ? d : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/**
 * 실시간 예보 (둘 다 실패하면 예외)
 * 기온·습도·강수확률·강수량·바람은 기상청 단기예보(지금~3일 뒤), 자외선·미세먼지는 Open-Meteo.
 * 기상청을 못 받으면 Open-Meteo만으로 24시간.
 */
export async function fetchWeather(now = new Date(), fetchFn = fetch) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 7000);
  const get = u => fetchFn(u, { signal: ctl.signal }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
  let f = null, a = null, k = null, ak = null;
  try {
    [f, a, k, ak] = (await Promise.allSettled([get(FORECAST), get(AIR), fetchKma(), fetchAir()])).map(x => x.status === 'fulfilled' ? x.value : null);
  } finally { clearTimeout(timer); }
  if (!f && !k) throw new Error('날씨를 받지 못했어요');
  const s = seoulNow(now), d0 = s.date, p2 = n => String(n).padStart(2, '0');
  const key = `${d0.getFullYear()}-${p2(d0.getMonth() + 1)}-${p2(d0.getDate())}T${p2(d0.getHours())}:00`;
  const om = {};      // Open-Meteo 시각별
  if (f) f.hourly.time.forEach((t, i) => { om[t] = { temp: r1(f.hourly.temperature_2m[i]), feels: r1(f.hourly.apparent_temperature[i]), pop: f.hourly.precipitation_probability[i], precip: r1(f.hourly.precipitation[i]), uv: r1(f.hourly.uv_index[i]), rh: f.hourly.relative_humidity_2m[i], wind: r1(f.hourly.wind_speed_10m[i]) }; });
  const air = {};
  if (a) a.hourly.time.forEach((t, i) => { air[t] = { pm25: r1(a.hourly.pm2_5[i]), pm10: r1(a.hourly.pm10[i]) }; });
  const km = {};
  if (k) for (const x of k.hourly) km[x.time] = x;
  // 시간 축: 지금부터 24시간(추천·혼잡 판단용). 기상청 값이 있으면 그 시각은 기상청으로 덮어씀
  const times = [];
  for (let i = 0; i < 24; i++) { const t = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), d0.getHours() + i); times.push(`${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}T${p2(t.getHours())}:00`); }
  const hourly = times.map((t, i) => {
    const o = om[t] ?? {}, kk = km[t], q = air[t] ?? {};
    const base = { time: t, hour: Number(t.slice(11, 13)), offset: i, uv: o.uv ?? null, pm25: q.pm25 ?? null, pm10: q.pm10 ?? null };
    if (kk) return { ...base, temp: kk.temp, rh: kk.rh, pop: kk.pop, precip: kk.precip, wind: kk.wind, sky: kk.sky, pty: kk.pty, snow: kk.snow, feels: feelsLike(kk.temp, kk.rh, kk.wind, s.month), src: 'kma' };
    return { ...base, temp: o.temp ?? null, feels: o.feels ?? null, pop: o.pop ?? null, precip: o.precip ?? null, rh: o.rh ?? null, wind: o.wind ?? null, src: 'om' };
  }).filter(h => h.temp != null);
  if (!hourly.length) throw new Error('날씨를 받지 못했어요');
  // 지금 시각 미세먼지는 에어코리아 성동구 측정소 실측값으로(측정 2시간 반 안일 때 · 매시 측정이 늦게 올라오는 것 감안). 모델값이 없는 시각도 실측값으로 채움
  const measured = ak && (now - new Date(ak.now.time.replace(' ', 'T') + ':00+09:00')) < 2.5 * 3600e3 ? ak.now : null;
  if (measured) hourly.forEach((h, i) => {
    if (i === 0) { if (measured.pm25 != null) h.pm25 = measured.pm25; if (measured.pm10 != null) h.pm10 = measured.pm10; h.airSrc = 'airkorea'; }
    else { h.pm25 ??= measured.pm25; h.pm10 ??= measured.pm10; }
  });
  const source = (k ? `기상청 단기예보(${k.base} 발표)${f ? ' · 자외선 Open-Meteo' : ''}` : 'Open-Meteo (실시간 예보)')
    + (measured ? ` · 미세먼지 에어코리아 ${ak.station} 측정소` : a ? ' · 미세먼지 Open-Meteo 모델' : '');
  return { source, live: true, hourly, kma: k ? { base: k.base, hourly: k.hourly, daily: k.daily } : null, air: ak, i0key: key };
}

/** 기상청 3일 예보를 날짜별로 묶음: 오늘(남은 시간)·내일·모레·글피 */
export function kmaDays(kma, now = seoulNow()) {
  if (!kma?.hourly?.length) return [];
  const p2 = n => String(n).padStart(2, '0'), d0 = now.date;
  const keyOf = n => { const t = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + n); return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`; };
  const nowKey = `${keyOf(0)}T${p2(d0.getHours())}:00`;
  return [0, 1, 2, 3].map(n => {
    const date = keyOf(n), hs = kma.hourly.filter(h => h.time.startsWith(date) && (n > 0 || h.time >= nowKey));
    if (!hs.length) return null;
    const dl = kma.daily?.find(x => x.date === date) ?? {};
    const temps = hs.map(h => h.temp).filter(v => v != null), max = a => a.length ? Math.max(...a) : null;
    const day = hs.filter(h => +h.time.slice(11, 13) >= 9 && +h.time.slice(11, 13) <= 18);
    const pick = day.length ? day : hs;
    const pty = max(pick.map(h => h.pty ?? 0)), sky = Math.round(pick.reduce((a, h) => a + (h.sky ?? 1), 0) / pick.length);
    return {
      n, date, label: ['오늘', '내일', '모레', '글피'][n],
      tmax: dl.tmax ?? max(temps), tmin: dl.tmin ?? (temps.length ? Math.min(...temps) : null),
      pop: max(hs.map(h => h.pop ?? 0)), rain: Math.round(hs.reduce((a, h) => a + (h.precip ?? 0), 0) * 10) / 10,
      wind: max(hs.map(h => h.wind ?? 0)), rh: Math.round(hs.reduce((a, h) => a + (h.rh ?? 0), 0) / hs.length),
      kind: pty === 3 ? 'snow' : pty > 0 ? 'rain' : sky >= 4 ? 'cloud' : sky === 3 ? 'cloudsun' : 'sun',
      coarse: hs.some(h => h.coarse),
    };
  }).filter(Boolean);
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
