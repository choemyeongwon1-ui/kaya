// 서울숲 대기질 중계 서버 (Supabase Edge Function · Deno)
// - 한국환경공단 에어코리아 「대기오염정보」(ArpltnInforInqireSvc, OpenAPI 기술문서 2026.6.30 묶음)
//   · getMsrstnAcctoRltmMesureDnsty: 성동구 측정소(도시대기) 실시간 측정값, 최근 24시간, ver=1.3(1시간 등급 포함)
//   · getMinuDustFrcstDspth: 미세먼지·초미세먼지 예보(오늘~모레, '서울' 권역 등급)
// - 인증키는 함수 비밀값 AIRKOREA_API_KEY 또는 DB 비밀 보관함(Vault)의 'airkorea_api_key'에만 둡니다(코드·저장소에 없음)
// - 측정값은 매시 갱신되므로 20분 캐시
const STATION = Deno.env.get('AIR_STATION') ?? '성동구';
const BASE = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const TTL = 20 * 60 * 1000;
let cache: { at: number; body: string } | null = null;

const num = (v: unknown) => (v == null || v === '' || v === '-' ? null : Number(v));
const GRADE = ['', '좋음', '보통', '나쁨', '매우나쁨'];

async function apiKey(): Promise<string | null> {
  const env = Deno.env.get('AIRKOREA_API_KEY');
  if (env) return env;
  const url = Deno.env.get('SUPABASE_URL'), sr = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !sr) return null;
  const r = await fetch(`${url}/rest/v1/rpc/get_airkorea_api_key`, { method: 'POST', headers: { apikey: sr, Authorization: `Bearer ${sr}`, 'Content-Type': 'application/json' }, body: '{}' });
  return r.ok ? await r.json() : null;
}
const get = async (op: string, q: Record<string, string>) => {
  const r = await fetch(`${BASE}/${op}?${new URLSearchParams({ returnType: 'json', pageNo: '1', ...q })}`);
  const d = await r.json();
  return (d?.response?.body?.items ?? []) as Record<string, string>[];
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (cache && Date.now() - cache.at < TTL) return json(cache.body);
  try {
    const key = await apiKey();
    if (!key) return json(JSON.stringify({ error: 'AIRKOREA_API_KEY not set' }), 500);
    const k = new Date(Date.now() + 9 * 3600e3), p2 = (n: number) => String(n).padStart(2, '0');
    const today = `${k.getUTCFullYear()}-${p2(k.getUTCMonth() + 1)}-${p2(k.getUTCDate())}`;
    const [rt, f10, f25] = await Promise.all([
      get('getMsrstnAcctoRltmMesureDnsty', { serviceKey: key, numOfRows: '24', stationName: STATION, dataTerm: 'DAILY', ver: '1.3' }),
      get('getMinuDustFrcstDspth', { serviceKey: key, numOfRows: '30', searchDate: today, InformCode: 'PM10' }).catch(() => []),
      get('getMinuDustFrcstDspth', { serviceKey: key, numOfRows: '30', searchDate: today, InformCode: 'PM25' }).catch(() => []),
    ]);
    if (!rt.length) return json(JSON.stringify({ error: 'no data' }), 502);
    const hours = rt.map(x => ({
      time: x.dataTime, pm10: num(x.pm10Value), pm25: num(x.pm25Value),
      pm10Grade: num(x.pm10Grade1h), pm25Grade: num(x.pm25Grade1h), khai: num(x.khaiValue), khaiGrade: num(x.khaiGrade), o3: num(x.o3Value),
    }));
    const now = hours.find(x => x.pm10 != null || x.pm25 != null) ?? hours[0];
    // 예보: 날짜마다 가장 최근 발표의 '서울' 등급
    const fc: Record<string, { pm10?: string; pm25?: string; issued?: string }> = {};
    const take = (items: Record<string, string>[], kind: 'pm10' | 'pm25') => {
      for (const it of items) {           // 최신 발표가 앞에 옴
        const g = /서울\s*:\s*([^,]+)/.exec(it.informGrade ?? '')?.[1]?.trim();
        if (!g || !it.informData) continue;
        const day = (fc[it.informData] ??= {});
        if (!day[kind]) { day[kind] = g; day.issued ??= it.dataTime; }
      }
    };
    take(f10, 'pm10'); take(f25, 'pm25');
    const forecast = Object.keys(fc).filter(d => d >= today).sort().slice(0, 3).map(d => ({ date: d, ...fc[d] }));
    const overall = (f25[0]?.informOverall ?? f10[0]?.informOverall ?? '').replace(/^○\s*/, '').trim() || null;
    const body = JSON.stringify({ source: '한국환경공단 에어코리아(대기오염정보)', station: STATION, now: { ...now, pm10Label: GRADE[now.pm10Grade ?? 0] || null, pm25Label: GRADE[now.pm25Grade ?? 0] || null }, hours, forecast, overall });
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e) {
    return json(JSON.stringify({ error: String(e) }), 502);
  }
});

function json(body: string, status = 200) {
  return new Response(body, { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}
