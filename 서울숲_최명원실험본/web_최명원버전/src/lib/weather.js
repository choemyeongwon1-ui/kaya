// 실시간 기상·대기 수집 (키 없이 동작하는 Open-Meteo, 브라우저 CORS 허용)
// 다음 단계: Vercel 서버리스 함수로 기상청 초단기실황·에어코리아 측정소(성동구) 연동 → 같은 형태로 반환.

export const SITE = { lat: 37.5443, lon: 127.0374, name: '서울숲' };

const FORECAST =
  `https://api.open-meteo.com/v1/forecast?latitude=${SITE.lat}&longitude=${SITE.lon}` +
  '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,uv_index,relative_humidity_2m,wind_speed_10m' +
  '&timezone=Asia%2FSeoul&forecast_days=2';
const AIR =
  `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${SITE.lat}&longitude=${SITE.lon}` +
  '&hourly=pm2_5,pm10&timezone=Asia%2FSeoul&forecast_days=2';

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

// 응답이 없으면 무한 대기하지 않도록 7초 제한 (넘기면 호출 측에서 예시 날씨로 대체)
const TIMEOUT_MS = 7000;

export async function fetchLive(now = new Date()) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let f;
  let a;
  try {
    [f, a] = await Promise.all([FORECAST, AIR].map((u) => fetch(u, { signal: ctrl.signal }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })));
  } finally {
    clearTimeout(timer);
  }
  const seoulHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const key = `${seoulHour.getFullYear()}-${String(seoulHour.getMonth() + 1).padStart(2, '0')}-${String(seoulHour.getDate()).padStart(2, '0')}T${String(seoulHour.getHours()).padStart(2, '0')}:00`;
  const start = Math.max(0, f.hourly.time.indexOf(key));
  const airIdx = Object.fromEntries(a.hourly.time.map((t, i) => [t, i]));
  const hourly = [];
  for (let i = start; i < Math.min(start + 24, f.hourly.time.length); i++) {
    const t = f.hourly.time[i];
    const j = airIdx[t];
    hourly.push({
      time: t,
      hour: Number(t.slice(11, 13)),
      offset: i - start,
      temp: r1(f.hourly.temperature_2m[i]),
      feels: r1(f.hourly.apparent_temperature[i]),
      pop: f.hourly.precipitation_probability[i],
      precip: r1(f.hourly.precipitation[i]),
      uv: r1(f.hourly.uv_index[i]),
      rh: f.hourly.relative_humidity_2m[i],
      wind: r1(f.hourly.wind_speed_10m[i]),
      pm25: j == null ? null : r1(a.hourly.pm2_5[j]),
      pm10: j == null ? null : r1(a.hourly.pm10[j]),
    });
  }
  return { source: 'Open-Meteo (실시간 예보·대기질 모델)', live: true, fetchedAt: new Date().toISOString(), hourly };
}

/** Offline fallback so the dashboard never renders empty. */
export function sampleWeather(now = new Date()) {
  const h0 = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getHours();
  const hourly = Array.from({ length: 24 }, (_, k) => {
    const hour = (h0 + k) % 24;
    const day = Math.sin(((hour - 6) / 24) * Math.PI * 2);
    return {
      time: `sample-${k}`, hour, offset: k,
      temp: r1(12 + 5 * day), feels: r1(10.5 + 5 * day), pop: 10, precip: 0,
      uv: r1(Math.max(0, 3 * day)), rh: 55, wind: 2.1, pm25: 22, pm10: 38,
    };
  });
  return { source: '오프라인 샘플 (네트워크 연결 실패)', live: false, fetchedAt: new Date().toISOString(), hourly };
}

// ---------- 시나리오 (발표·시연용: 11월에도 폭염·미세먼지·호우 상황을 재현) ----------
const curve = (hour, base, amp, peak = 15) => base + amp * Math.cos(((hour - peak) / 24) * Math.PI * 2);

export const SCENARIOS = [
  { key: 'live', label: '실시간', desc: '현재 서울숲 실제 예보' },
  { key: 'heat', label: '폭염', desc: '8월 폭염특보 날 — 체감 35℃, UV 9' },
  { key: 'dust', label: '미세먼지', desc: '봄철 고농도 — PM2.5 매우나쁨' },
  { key: 'rain', label: '호우', desc: '장마철 호우특보 발효' },
];

export function applyScenario(weather, key) {
  if (key === 'live') return weather;
  const hourly = weather.hourly.map((h) => {
    const x = { ...h };
    if (key === 'heat') {
      x.temp = r1(curve(h.hour, 29.5, 4.5));
      x.feels = r1(curve(h.hour, 30.5, 5.2));
      x.uv = r1(Math.max(0, curve(h.hour, 3.5, 6, 13)));
      x.pop = 10; x.precip = 0; x.pm25 = 24; x.pm10 = 41; x.rh = 68;
    } else if (key === 'dust') {
      x.temp = r1(curve(h.hour, 16, 5)); x.feels = r1(curve(h.hour, 15, 5));
      x.uv = r1(Math.max(0, curve(h.hour, 2, 4, 13)));
      x.pm25 = r1(curve(h.hour, 70, 18, 11)); x.pm10 = r1(curve(h.hour, 135, 35, 11));
      x.pop = 0; x.precip = 0;
    } else if (key === 'rain') {
      x.temp = r1(curve(h.hour, 24, 2)); x.feels = r1(curve(h.hour, 26, 2));
      x.uv = 1; x.pm25 = 9; x.pm10 = 15;
      x.pop = 90; x.precip = r1(h.offset < 10 ? 22 - h.offset : 6);
    }
    return x;
  });
  const sc = SCENARIOS.find((s) => s.key === key);
  return { ...weather, hourly, scenario: key, heavyRain: key === 'rain', source: `시나리오 · ${sc.desc}` };
}

export function currentSnap(weather) {
  const h = weather.hourly[0] ?? {};
  return { ...h, heavyRain: weather.heavyRain || false };
}
