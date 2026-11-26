// 서울숲 지금 상태 중계 서버 (Supabase Edge Function · Deno)
// 자료: 서울시 실시간 도시데이터(서울 열린데이터광장 OA-21285, citydata, 장소 '서울숲공원')
//   - 날씨(WEATHER_STTS): 기온·체감온도·자외선·초미세먼지·미세먼지
//   - 실시간 인구(LIVE_PPLTN_STTS): 혼잡 단계·인구 범위 + 12시간 혼잡 예측(FCST_PPLTN)
//   - 주변 문화행사(EVENT_STTS)
// - citydata는 http 전용·CORS 없음이라 브라우저에서 바로 못 부름. 키는 함수 비밀값 SEOUL_API_KEY 또는 Vault 'seoul_api_key'(seoul-crowd와 같음)
// - 서울시 갱신이 5분 간격이라 5분 캐시
// 배포: supabase functions deploy seoul-now --no-verify-jwt
const AREA = Deno.env.get('SEOUL_AREA') ?? '서울숲공원';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const TTL = 5 * 60 * 1000;
const LEVEL: Record<string, number> = { '여유': 0, '보통': 1, '약간 붐빔': 2, '붐빔': 3 };
let cache: { at: number; body: string } | null = null;
const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (cache && Date.now() - cache.at < TTL) return json(cache.body);
  try {
    const key = await apiKey();
    if (!key) return json(JSON.stringify({ error: 'SEOUL_API_KEY not set' }), 500);
    const d = await (await fetch(`http://openapi.seoul.go.kr:8088/${key}/json/citydata/1/5/${encodeURIComponent(AREA)}`)).json();
    const c = d?.CITYDATA;
    if (!c) return json(JSON.stringify({ error: 'no data', result: d?.RESULT ?? null }), 502);
    const w = c.WEATHER_STTS?.[0] ?? null, p = c.LIVE_PPLTN_STTS?.[0] ?? null;
    const body = JSON.stringify({
      area: c.AREA_NM, fetched: new Date().toISOString(),
      weather: w ? { time: w.WEATHER_TIME ?? null, temp: num(w.TEMP), feels: num(w.SENSIBLE_TEMP), uv: num(w.UV_INDEX_LVL), uvText: w.UV_INDEX ?? null,
        pm25: num(w.PM25), pm25Text: w.PM25_INDEX ?? null, pm10: num(w.PM10), pm10Text: w.PM10_INDEX ?? null, rainPct: num(w.RAIN_CHANCE), msg: w.PCP_MSG ?? null } : null,
      crowd: p ? { time: p.PPLTN_TIME ?? null, level: p.AREA_CONGEST_LVL, rank: LEVEL[p.AREA_CONGEST_LVL] ?? null, msg: p.AREA_CONGEST_MSG ?? null, min: num(p.AREA_PPLTN_MIN), max: num(p.AREA_PPLTN_MAX),
        forecast: (p.FCST_PPLTN ?? []).map((f: Record<string, string>) => ({ time: f.FCST_TIME, level: f.FCST_CONGEST_LVL, rank: LEVEL[f.FCST_CONGEST_LVL] ?? null, min: num(f.FCST_PPLTN_MIN), max: num(f.FCST_PPLTN_MAX) })) } : null,
      events: (c.EVENT_STTS ?? []).map((e: Record<string, string>) => ({ name: e.EVENT_NM, period: e.EVENT_PERIOD, place: e.EVENT_PLACE, lat: num(e.EVENT_Y), lon: num(e.EVENT_X), url: e.URL ?? null })),
      source: '서울시 실시간 도시데이터(서울 열린데이터광장 OA-21285, 서울숲공원) · 인구는 통신사 기지국 신호로 어림한 값',
    });
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e) {
    return json(JSON.stringify({ error: String(e) }), 502);
  }
});

let keyCache: string | null = null;
async function apiKey(): Promise<string | null> {
  const env = Deno.env.get('SEOUL_API_KEY');
  if (env) return env;
  if (keyCache) return keyCache;
  const url = Deno.env.get('SUPABASE_URL'), sr = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !sr) return null;
  const r = await fetch(`${url}/rest/v1/rpc/get_seoul_api_key`, { method: 'POST', headers: { apikey: sr, Authorization: `Bearer ${sr}`, 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) return null;
  keyCache = await r.json();
  return keyCache;
}

function json(body: string, status = 200) {
  return new Response(body, { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120' } });
}
