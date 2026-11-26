// 운영 관제 「도시 흐름」 중계 서버 (Supabase Edge Function · Deno)
// 서울숲을 가운데 두고, 주변 도시에서 서울숲으로 들어오는 흐름을 한 번에 내려 줍니다.
//  - 서울숲공원 실시간 도시데이터(citydata): 주변 도로 구간별 소통(속도·막힘 정도·선형), 서울숲역 승하차(최근 5·10·30분), 역 위치
//  - 서울숲공원 + 주변 장소 혼잡도(citydata_ppltn): 지금 혼잡도·인구 범위 + 서울시가 내는 12시간 혼잡 예측(FCST_PPLTN)
// 인증키는 함수 비밀값 SEOUL_API_KEY 또는 DB 비밀 보관함(Vault) 'seoul_api_key'(seoul-crowd와 같음). 화면에는 다듬은 값만 내보냅니다.
// 서울시 갱신이 5분 간격이라 5분 캐시.
// 배포: supabase functions deploy seoul-flow --no-verify-jwt
const PARK = '서울숲공원';
const NEAR = ['성수카페거리', '뚝섬한강공원', '뚝섬역'];   // 서울시 장소 목록에 없으면 조용히 빠짐
const SUB_AREAS = ['뚝섬역', '성수카페거리'];          // 지하철 승하차를 더 받아 올 주변 장소
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const TTL = 5 * 60 * 1000;
let cache: { at: number; body: string } | null = null;

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
// '127.04_37.54' 또는 '127.04 37.54' → [lat, lon]
const xy = (s: unknown): [number, number] | null => {
  const m = String(s ?? '').trim().split(/[_\s,]+/).map(Number);
  if (m.length < 2 || !isFinite(m[0]) || !isFinite(m[1])) return null;
  return m[0] > 100 ? [m[1], m[0]] : [m[0], m[1]];
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const debug = new URL(req.url).searchParams.has('debug');
  if (!debug && cache && Date.now() - cache.at < TTL) return json(cache.body);
  try {
    const key = await apiKey();
    if (!key) return json(JSON.stringify({ error: 'SEOUL_API_KEY not set' }), 500);
    const seoul = (path: string) => fetch(`http://openapi.seoul.go.kr:8088/${key}/json/${path}`).then(r => r.json());
    const [cityRes, ...rest] = await Promise.allSettled([
      seoul(`citydata/1/5/${encodeURIComponent(PARK)}`),
      ...SUB_AREAS.map(a => seoul(`citydata/1/5/${encodeURIComponent(a)}`)),
      ...[PARK, ...NEAR].map(a => seoul(`citydata_ppltn/1/5/${encodeURIComponent(a)}`)),
    ]);
    const subRes = rest.slice(0, SUB_AREAS.length), pp = rest.slice(SUB_AREAS.length);
    const c = cityRes.status === 'fulfilled' ? cityRes.value?.CITYDATA : null;
    if (!c) return json(JSON.stringify({ error: 'no data' }), 502);
    // 장소별 지하철: 서울시는 장소마다 그 장소의 역들을 묶어 승하차를 냄 (서울숲공원=서울숲역, 뚝섬역=뚝섬역, 성수카페거리=성수역 등)
    const subOf = (cd: Record<string, any> | null, area: string) => {
      if (!cd) return null;
      const sp = cd.LIVE_SUB_PPLTN, r = (a: string, b: string) => sp && sp[a] != null ? [num(sp[a]), num(sp[b])] : null;
      const st = (cd.SUB_STTS ?? []).map((s: Record<string, string>) => ({ name: s.SUB_STN_NM, line: s.SUB_STN_LINE, lat: num(s.SUB_STN_Y), lon: num(s.SUB_STN_X) }));
      if (!sp || !st.length) return null;
      return { area, stations: st, off10: r('SUB_10WTHN_GTOFF_PPLTN_MIN', 'SUB_10WTHN_GTOFF_PPLTN_MAX'), off30: r('SUB_30WTHN_GTOFF_PPLTN_MIN', 'SUB_30WTHN_GTOFF_PPLTN_MAX'), on10: r('SUB_10WTHN_GTON_PPLTN_MIN', 'SUB_10WTHN_GTON_PPLTN_MAX'), time: sp.SUB_STN_TIME ?? null };
    };
    const subways = [subOf(c, PARK), ...subRes.map((r, i) => subOf(r.status === 'fulfilled' ? r.value?.CITYDATA : null, SUB_AREAS[i]))].filter(Boolean);

    const rt = c.ROAD_TRAFFIC_STTS ?? {};
    const links = (rt.ROAD_TRAFFIC_STTS ?? []) as Record<string, string>[];
    if (debug) return json(JSON.stringify({ roadKeys: Object.keys(rt), linkSample: links.slice(0, 1), subways }));
    const roads = links.map(l => {
      let path = String(l.XYLIST ?? '').split('|').map(xy).filter(Boolean) as [number, number][];
      if (path.length < 2) path = [xy(l.START_ND_XY), xy(l.END_ND_XY)].filter(Boolean) as [number, number][];
      return { name: l.ROAD_NM, from: l.START_ND_NM, to: l.END_ND_NM, idx: l.IDX, speed: num(l.SPD), dist: num(l.DIST), path };
    }).filter(r => r.path.length >= 2);
    const avg = rt.AVG_ROAD_DATA ?? null;

    const sp = c.LIVE_SUB_PPLTN ?? null, rng = (a: string, b: string) => sp && sp[a] != null ? [num(sp[a]), num(sp[b])] : null;
    const subFlow = sp ? {
      off5: rng('SUB_5WTHN_GTOFF_PPLTN_MIN', 'SUB_5WTHN_GTOFF_PPLTN_MAX'), off10: rng('SUB_10WTHN_GTOFF_PPLTN_MIN', 'SUB_10WTHN_GTOFF_PPLTN_MAX'),
      off30: rng('SUB_30WTHN_GTOFF_PPLTN_MIN', 'SUB_30WTHN_GTOFF_PPLTN_MAX'), on10: rng('SUB_10WTHN_GTON_PPLTN_MIN', 'SUB_10WTHN_GTON_PPLTN_MAX'),
    } : null;
    const stations = (c.SUB_STTS ?? []).map((s: Record<string, string>) => ({ name: s.SUB_STN_NM, line: s.SUB_STN_LINE, lat: num(s.SUB_STN_Y), lon: num(s.SUB_STN_X) }));

    const areas = pp.map(r => {
      const p = r.status === 'fulfilled' ? r.value?.['SeoulRtd.citydata_ppltn']?.[0] : null;
      if (!p) return null;
      return {
        name: p.AREA_NM, level: p.AREA_CONGEST_LVL, min: num(p.AREA_PPLTN_MIN), max: num(p.AREA_PPLTN_MAX), time: p.PPLTN_TIME,
        forecast: (p.FCST_PPLTN ?? []).map((f: Record<string, string>) => ({ time: f.FCST_TIME, level: f.FCST_CONGEST_LVL, min: num(f.FCST_PPLTN_MIN), max: num(f.FCST_PPLTN_MAX) })),
      };
    }).filter(Boolean);

    const body = JSON.stringify({
      fetched: new Date().toISOString(),
      park: areas.find(a => a!.name === PARK) ?? null,
      near: areas.filter(a => a!.name !== PARK),
      roads, roadAvg: avg ? { idx: avg.ROAD_TRAFFIC_IDX, speed: num(avg.ROAD_TRAFFIC_SPD), time: avg.ROAD_TRAFFIC_TIME } : null,
      subFlow, stations, subways,
      source: '서울시 실시간 도시데이터(citydata · citydata_ppltn)',
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
