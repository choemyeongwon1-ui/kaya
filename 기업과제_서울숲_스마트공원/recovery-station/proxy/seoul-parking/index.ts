// 서울숲 오는 길·나가는 길 실시간 중계 서버 (Supabase Edge Function · Deno)
// 자료 1) 서울시 실시간 도시데이터(citydata, 장소 '서울숲공원') — 주차장 현황 · 도로 소통 · 지하철 도착 · 따릉이 · 전기차 충전기 · 재난문자 · 사고 통제
//      2) 한국교통안전공단 주차정보 제공 API(공공데이터포털 15099883) — 성동구 주차장 가운데 실시간 잔여면수를 보내는 곳
//         (키: 함수 비밀값 DATA_GO_KR_KEY. 없거나 승인 전이면 이 부분만 빠짐)
// - 서울시 키는 seoul-crowd와 같은 SEOUL_API_KEY 또는 Vault 'seoul_api_key'. 화면에는 다듬은 값만 내보냄
// - 서울시 갱신이 5분 간격이라 5분 캐시. 교통안전공단 시설정보(주소·위치)는 잘 안 바뀌어 하루 캐시
// 배포: supabase functions deploy seoul-parking --no-verify-jwt
const AREA = Deno.env.get('SEOUL_AREA') ?? '서울숲공원';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const TTL = 5 * 60 * 1000, DAY = 24 * 60 * 60 * 1000;
const CENTER = { lat: 37.5444, lon: 127.0403 }, NEAR_KM = 1.6;   // 서울숲 거점 평균 위치, 이 반경 안 실시간 주차장만
let cache: { at: number; body: string } | null = null;

const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const km = (lat: number, lon: number) => Math.hypot((lat - CENTER.lat) * 110.9, (lon - CENTER.lon) * 88.2);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (cache && Date.now() - cache.at < TTL) return json(cache.body);
  try {
    const key = await apiKey();
    if (!key) return json(JSON.stringify({ error: 'SEOUL_API_KEY not set' }), 500);
    const [cityRes, kotsaRes] = await Promise.allSettled([
      fetch(`http://openapi.seoul.go.kr:8088/${key}/json/citydata/1/5/${encodeURIComponent(AREA)}`).then(r => r.json()),
      kotsaNear(),
    ]);
    const c = cityRes.status === 'fulfilled' ? cityRes.value?.CITYDATA : null;
    if (!c) return json(JSON.stringify({ error: 'no data' }), 502);

    const lots = (c.PRK_STTS ?? []).map((p: Record<string, string>) => {
      const cap = num(p.CPCTY), live = p.CUR_PRK_YN === 'Y', cur = live ? num(p.CUR_PRK_CNT) : null;
      return { name: p.PRK_NM, address: p.ROAD_ADDR || p.ADDRESS, lat: num(p.LAT), lon: num(p.LNG), capacity: cap,
        free: cap != null && cur != null ? Math.max(0, cap - cur) : null, live, time: p.CUR_PRK_TIME || null,
        paid: p.PAY_YN === 'Y', rate: num(p.RATES), rateMin: num(p.TIME_RATES), src: 'seoul' };
    });
    const road = c.ROAD_TRAFFIC_STTS?.AVG_ROAD_DATA ?? null;
    const subway = (c.SUB_STTS ?? []).map((s: Record<string, unknown>) => ({
      name: s.SUB_STN_NM, line: s.SUB_STN_LINE, lat: num(s.SUB_STN_Y), lon: num(s.SUB_STN_X),
      trains: ((s.SUB_DETAIL ?? []) as Record<string, string>[]).map(t => ({ line: t.SUB_LINE, dir: t.SUB_DIR, to: t.SUB_TERMINAL, route: t.SUB_ROUTE_NM, sec: num(t.SUB_ARVTIME), msg: t.SUB_ARVINFO || t.SUB_ARMG1 })),
    }));
    const bike = (c.SBIKE_STTS ?? []).map((b: Record<string, string>) => ({ name: String(b.SBIKE_SPOT_NM ?? '').replace(/^\d+\.\s*/, ''), bikes: num(b.SBIKE_PARKING_CNT), racks: num(b.SBIKE_RACK_CNT), shared: num(b.SBIKE_SHARED), lat: num(b.SBIKE_Y), lon: num(b.SBIKE_X) }));
    const charger = (c.CHARGER_STTS ?? []).map((s: Record<string, unknown>) => {
      const ds = (s.CHARGER_DETAILS ?? []) as Record<string, string>[];
      return { name: s.STAT_NM, address: s.STAT_ADDR, lat: num(s.STAT_Y), lon: num(s.STAT_X), hours: s.STAT_USETIME, total: ds.length,
        free: ds.filter(d => d.CHARGER_STAT === '사용가능').length, fast: ds.filter(d => /DC|급속/.test(d.CHARGER_TYPE ?? '')).length, time: ds[0]?.STATUPDDT ?? null };
    });
    const alerts = (c.LIVE_DST_MESSAGE ?? []).map((m: Record<string, string>) => ({ text: m.DST_SE_NM ? `${m.DST_SE_NM} · ${m.MSG_CN ?? ''}` : (m.MSG_CN ?? JSON.stringify(m)), time: m.CRT_DT ?? null }));
    const accidents = (c.ACDNT_CNTRL_STTS ?? []).map((a: Record<string, string>) => ({ type: a.ACDNT_TYPE, detail: a.ACDNT_DTYPE, info: a.ACDNT_INFO, until: a.EXP_CLR_DT ?? null }));
    const kotsa = kotsaRes.status === 'fulfilled' ? kotsaRes.value : { lots: [], error: String(kotsaRes.reason) };

    const body = JSON.stringify({
      area: c.AREA_NM, fetched: new Date().toISOString(),
      parking: { near: lots, live: kotsa.lots, liveError: kotsa.error ?? null, liveStats: kotsa.stats ?? null },
      road: road ? { idx: road.ROAD_TRAFFIC_IDX, speed: num(road.ROAD_TRAFFIC_SPD), msg: road.ROAD_MSG, time: road.ROAD_TRAFFIC_TIME } : null,
      subway, bike, charger, alerts, accidents,
      source: '서울시 실시간 도시데이터(citydata, 서울숲공원) · 한국교통안전공단 주차정보 제공 API',
    });
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e) {
    return json(JSON.stringify({ error: String(e) }), 502);
  }
});

// ── 한국교통안전공단: 성동구 실시간 주차장 + 시설정보(이름·주소·위치·면수) ──
const KOTSA = 'https://apis.data.go.kr/B553881/Parking_v1';
let facCache: { at: number; map: Map<string, Record<string, string>>; total: number } | null = null;
async function kotsaGet(op: string, page = 1, rows = 1000) {
  const k = Deno.env.get('DATA_GO_KR_KEY');
  if (!k) throw new Error('DATA_GO_KR_KEY not set');
  const r = await fetch(`${KOTSA}/${op}?${new URLSearchParams({ serviceKey: k, pageNo: String(page), numOfRows: String(rows), format: '2', sidoCd: '11', sigunguCd: '11200' })}`);
  const t = await r.text();
  if (!r.ok || t.startsWith('<')) throw new Error(`${op} ${r.status} ${t.match(/<errMsg>(.*?)<\/errMsg>/)?.[1] ?? ''}`);
  const d = JSON.parse(t);
  return (Object.values(d).find(v => Array.isArray(v)) ?? []) as Record<string, string>[];
}
async function kotsaNear() {
  const live = await kotsaGet('PrkRealtimeInfo_v1');
  if (!facCache || Date.now() - facCache.at > DAY) {
    const map = new Map<string, Record<string, string>>();
    for (let p = 1; p <= 8; p++) {
      const rows = await kotsaGet('PrkSttusInfo_v1', p);
      rows.forEach(x => map.set(x.prk_center_id, x));
      if (rows.length < 1000) break;
    }
    facCache = { at: Date.now(), map, total: map.size };
  }
  const lots = live.map(x => {
    const f = facCache!.map.get(x.prk_center_id), lat = num(f?.prk_plce_entrc_la), lon = num(f?.prk_plce_entrc_lo);
    return { name: f?.prk_plce_nm || '이름 없는 주차장', address: f?.prk_plce_adres ?? null, lat, lon, agent: f?.prk_manage_agent_nm ?? null,
      capacity: num(x.pkfc_ParkingLots_total), free: num(x.pkfc_Available_ParkingLots_total), live: true, src: 'kotsa',
      km: lat != null && lon != null ? Math.round(km(lat, lon) * 100) / 100 : null };
  }).filter(l => l.km != null && l.km <= NEAR_KM).sort((a, b) => a.km! - b.km!);
  return { lots, stats: { district: '성동구', registered: facCache.total, live: live.length } };
}

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
