// 서울숲 실시간 인구 중계 서버 (Supabase Edge Function · Deno)
// - 서울시 실시간 도시데이터(citydata_ppltn)는 http 전용이고 CORS가 없어 브라우저에서 바로 못 부릅니다.
// - 인증키는 함수 비밀값 SEOUL_API_KEY 또는 DB 비밀 보관함(Vault)에만 두고, 화면에는 서울숲 값만 다듬어 https로 내보냅니다.
// - 서울시 자료가 5분마다 바뀌므로 응답을 5분 동안 캐시합니다.
// 배포: supabase secrets set SEOUL_API_KEY=... && supabase functions deploy seoul-crowd --no-verify-jwt
const AREA = Deno.env.get('SEOUL_AREA') ?? '서울숲공원';   // 장소명(서울시 121장소 목록 기준). 코드(POI…)도 됨
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

let cache: { at: number; body: string } | null = null;
const TTL = 5 * 60 * 1000;

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (cache && Date.now() - cache.at < TTL) return json(cache.body);
  try {
    const key = await apiKey();
    if (!key) return json(JSON.stringify({ error: 'SEOUL_API_KEY not set' }), 500);
    const url = `http://openapi.seoul.go.kr:8088/${key}/json/citydata_ppltn/1/5/${encodeURIComponent(AREA)}`;
    const r = await fetch(url);
    const d = await r.json();
    const p = d?.['SeoulRtd.citydata_ppltn']?.[0];
    if (!p) return json(JSON.stringify({ error: 'no data', result: d?.RESULT ?? null }), 502);
    const body = JSON.stringify({
      area: p.AREA_NM,
      level: p.AREA_CONGEST_LVL,          // 여유 · 보통 · 약간 붐빔 · 붐빔
      msg: p.AREA_CONGEST_MSG,
      min: num(p.AREA_PPLTN_MIN),
      max: num(p.AREA_PPLTN_MAX),
      time: p.PPLTN_TIME,                 // 'YYYY-MM-DD HH:MM'
      forecast: (p.FCST_PPLTN ?? []).map((f: Record<string, string>) => ({ time: f.FCST_TIME, level: f.FCST_CONGEST_LVL, min: num(f.FCST_PPLTN_MIN), max: num(f.FCST_PPLTN_MAX) })),
      source: '서울시 실시간 도시데이터(통신사 기지국 신호로 어림한 값)',
    });
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e) {
    return json(JSON.stringify({ error: String(e) }), 502);
  }
});

// 인증키: 함수 비밀값 SEOUL_API_KEY가 있으면 그것을, 없으면 DB 비밀 보관함(Vault)의 'seoul_api_key'를
// 서버 전용 함수 public.get_seoul_api_key()로 꺼냄(anon·authenticated는 실행 권한 없음, service_role만)
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
