// 서울숲 프로그램 중계 서버 (Supabase Edge Function · Deno)
// - 서울 열린데이터광장 「서울시 공공서비스예약 정보」 통합(tvYeyakCOllect)에서 장소·서비스명에 '서울숲'이 든 것만 추림
// - 인증키는 함수 비밀값 SEOUL_API_KEY 또는 DB 비밀 보관함(Vault)의 'seoul_api_key'(실시간 도시데이터와 같은 일반 인증키)
// - 예약 정보는 자주 바뀌지 않으므로 3시간 캐시. 개인정보 없음(공개 예약 목록)
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const TTL = 3 * 3600 * 1000, PAGE = 1000, MAX_PAGES = 8;
let cache: { at: number; body: string } | null = null;

async function apiKey(): Promise<string | null> {
  const env = Deno.env.get('SEOUL_API_KEY');
  if (env) return env;
  const url = Deno.env.get('SUPABASE_URL'), sr = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !sr) return null;
  const r = await fetch(`${url}/rest/v1/rpc/get_seoul_api_key`, { method: 'POST', headers: { apikey: sr, Authorization: `Bearer ${sr}`, 'Content-Type': 'application/json' }, body: '{}' });
  return r.ok ? await r.json() : null;
}
const day = (v?: string) => (v ? String(v).slice(0, 10).replaceAll('.', '-') : null);
const strip = (s?: string) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (cache && Date.now() - cache.at < TTL) return json(cache.body);
  try {
    const key = await apiKey();
    if (!key) return json(JSON.stringify({ error: 'SEOUL_API_KEY not set' }), 500);
    const rows: Record<string, string>[] = [];
    let total = Infinity, result: unknown = null;
    for (let p = 0; p < MAX_PAGES && p * PAGE < total; p++) {
      const u = `http://openapi.seoul.go.kr:8088/${key}/json/tvYeyakCOllect/${p * PAGE + 1}/${(p + 1) * PAGE}/`;
      const d = await (await fetch(u)).json();
      const t = d?.tvYeyakCOllect;
      if (!t) { result = d?.RESULT ?? null; break; }
      total = Number(t.list_total_count) || 0;
      rows.push(...(t.row ?? []));
    }
    if (!rows.length) return json(JSON.stringify({ error: 'no data', result }), 502);
    const items = rows.filter(r => /서울숲/.test(`${r.PLACENM} ${r.SVCNM}`)).map(r => ({
      id: r.SVCID, title: strip(r.SVCNM), place: strip(r.PLACENM), status: r.SVCSTATNM, kind: [r.MAXCLASSNM, r.MINCLASSNM].filter(Boolean).join(' > '),
      target: strip(r.USETGTINFO), fee: r.PAYATNM, url: r.SVCURL, img: r.IMGURL || null,
      useFrom: day(r.SVCOPNBGNDT), useTo: day(r.SVCOPNENDDT), rcptFrom: r.RCPTBGNDT || null, rcptTo: r.RCPTENDDT || null,
      time: r.V_MIN && r.V_MAX ? `${r.V_MIN}~${r.V_MAX}` : null, lat: r.Y ? Number(r.Y) : null, lon: r.X ? Number(r.X) : null,
    }));
    const k = new Date(Date.now() + 9 * 3600e3);
    const body = JSON.stringify({ source: '서울시 공공서비스예약 정보(서울 열린데이터광장 tvYeyakCOllect)', checked: k.toISOString().slice(0, 16).replace('T', ' '), scanned: rows.length, total: items.length, items });
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e) {
    return json(JSON.stringify({ error: String(e) }), 502);
  }
});

function json(body: string, status = 200) {
  return new Response(body, { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' } });
}
