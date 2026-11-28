// 서울숲 일대 공중화장실 중계 서버 (Supabase Edge Function · Deno)
// 자료: 서울 열린데이터광장 「서울시 공중화장실 위치정보」 OpenAPI(서비스명 mgisToiletPoi, 스마트서울맵) — 좌표(COORD_X/Y)·개방시간·장애인화장실 등
//   (행정안전부 공중화장실정보 API는 2025-02부터 좌표를 빼고 줘서 지도 위치로 못 씀)
// - 서울시 키는 다른 중계 서버와 같은 SEOUL_API_KEY 또는 Vault 'seoul_api_key'. 화면에는 서울숲 둘레 화장실만 다듬어 내보냄
// - 화장실 정보는 잘 안 바뀌어 하루 캐시
// 배포: supabase functions deploy seoul-toilet --no-verify-jwt
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const DAY = 24 * 60 * 60 * 1000;
const BOX = { s: 37.536, n: 37.5505, w: 127.031, e: 127.0465 };   // 서울숲 경계 + 여유(경계 안 판단은 화면에서 공원 경계로)
let cache: { at: number; body: string } | null = null;

const clean = (v: unknown) => String(v ?? '').split('|').map(s => s.trim()).filter(Boolean);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (cache && Date.now() - cache.at < DAY) return json(cache.body);
  try {
    const key = await apiKey();
    if (!key) return json(JSON.stringify({ error: 'SEOUL_API_KEY not set' }), 500);
    const page = (a: number, b: number) => fetch(`http://openapi.seoul.go.kr:8088/${key}/json/mgisToiletPoi/${a}/${b}/`).then(r => r.json());
    const first = await page(1, 1000), total = first?.mgisToiletPoi?.list_total_count ?? 0;
    if (!total) return json(JSON.stringify({ error: first?.RESULT?.MESSAGE ?? first?.mgisToiletPoi?.RESULT?.MESSAGE ?? 'no data' }), 502);
    const rest = [];
    for (let a = 1001; a <= total; a += 1000) rest.push(page(a, Math.min(a + 999, total)));
    const rows = [first, ...(await Promise.all(rest))].flatMap(d => d?.mgisToiletPoi?.row ?? []);
    const items = rows.filter(r => r.COORD_Y >= BOX.s && r.COORD_Y <= BOX.n && r.COORD_X >= BOX.w && r.COORD_X <= BOX.e).map(r => ({
      id: `seoul-${r.OBJECTID}`, name: String(r.CONTS_NAME ?? '').trim(), lat: +r.COORD_Y, lon: +r.COORD_X,
      addr: r.ADDR_NEW || r.ADDR_OLD || null, tel: r.TEL_NO || null,
      open: clean(r.VALUE_01).join(' '), hours: clean(r.VALUE_02).join(' '),
      toilets: clean(r.VALUE_04), accessible: clean(r.VALUE_05), extra: [...clean(r.VALUE_03), ...clean(r.VALUE_06)], safety: clean(r.VALUE_07),
      place: clean(r.VALUE_08).join(' '), org: String(r.VALUE_09 ?? '').trim() || null,
    }));
    const body = JSON.stringify({ source: '서울 열린데이터광장 「서울시 공중화장실 위치정보」(mgisToiletPoi)', fetched: new Date().toISOString(), total, items });
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
  return new Response(body, { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
