// 서울숲 기상청 단기예보 중계 서버 (Supabase Edge Function · Deno)
// - 기상청 「단기예보 조회서비스」 getVilageFcst (VilageFcstInfoService_2.0). 활용가이드 2026.10.19판 기준
//   공공데이터포털 키(apis.data.go.kr, serviceKey)를 먼저 쓰고, 안 되면 기상청 API허브(apihub.kma.go.kr, authKey)로 시도
// - 서울숲 격자: nx=61, ny=126 (활용가이드 별첨 격자표 '서울특별시 성동구 성수1가1동·2동')
// - 발표: 02·05·08·11·14·17·20·23시, 각 10분 뒤부터 제공. 응답은 30분 캐시
// - 인증키는 함수 비밀값 KMA_API_KEY 또는 DB 비밀 보관함(Vault)의 'kma_api_key'에만 둡니다(코드·저장소에 없음)
// - 지금부터 3일 뒤(글피) 자정까지만 내보냅니다. 글피 이후는 3시간 간격이고 강수량·풍속이 범주 코드(1~3)로만 옵니다.
const NX = 61, NY = 126;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const TTL = 30 * 60 * 1000;
let cache: { at: number; body: string } | null = null;

const p2 = (n: number) => String(n).padStart(2, '0');
/** 지금 쓸 수 있는 가장 최근 발표(서울 시각) */
function latestBase(nowMs = Date.now()) {
  const k = new Date(nowMs + 9 * 3600e3 - 10 * 60e3);          // 서울 시각에서 10분 뺌(발표 10분 뒤부터 제공)
  let y = k.getUTCFullYear(), m = k.getUTCMonth(), d = k.getUTCDate(), h = k.getUTCHours();
  const hours = [2, 5, 8, 11, 14, 17, 20, 23];
  let bh = [...hours].reverse().find(x => x <= h);
  if (bh == null) { const prev = new Date(Date.UTC(y, m, d) - 86400e3); y = prev.getUTCFullYear(); m = prev.getUTCMonth(); d = prev.getUTCDate(); bh = 23; }
  return { date: `${y}${p2(m + 1)}${p2(d)}`, time: `${p2(bh)}00` };
}

// 강수량(PCP)·신적설(SNO) 문자열 → mm·cm 수치(가이드 '범주 및 표시방법')
function amount(v: string | undefined, coarse: boolean, kind: 'pcp' | 'sno') {
  if (v == null || v === '' || v === '-' || v === '0' || /없음/.test(v)) return 0;
  if (coarse && /^[123]$/.test(v)) return kind === 'pcp' ? ({ 1: 1.5, 2: 8, 3: 20 } as Record<string, number>)[v] : ({ 1: 0.5, 2: 1.5 } as Record<string, number>)[v] ?? 1;
  if (/미만/.test(v)) return kind === 'pcp' ? 0.5 : 0.3;
  const n = parseFloat(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
// 풍속: 글피 이후 범주 코드(1 약한 <4 · 2 약간 강한 4~9 · 3 강한 ≥9 m/s) → 대표값
const windOf = (v: string | undefined, coarse: boolean) => v == null ? null : coarse && /^[123]$/.test(v) ? ({ 1: 3, 2: 6.5, 3: 10 } as Record<string, number>)[v] : Number(v);

async function apiKey(): Promise<string | null> {
  const env = Deno.env.get('KMA_API_KEY');
  if (env) return env;
  const url = Deno.env.get('SUPABASE_URL'), sr = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !sr) return null;
  const r = await fetch(`${url}/rest/v1/rpc/get_kma_api_key`, { method: 'POST', headers: { apikey: sr, Authorization: `Bearer ${sr}`, 'Content-Type': 'application/json' }, body: '{}' });
  return r.ok ? await r.json() : null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (cache && Date.now() - cache.at < TTL) return json(cache.body);
  try {
    const key = await apiKey();
    if (!key) return json(JSON.stringify({ error: 'KMA_API_KEY not set' }), 500);
    const b = latestBase();
    const params = { numOfRows: '2000', pageNo: '1', dataType: 'JSON', base_date: b.date, base_time: b.time, nx: String(NX), ny: String(NY) };
    const tries = [
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${new URLSearchParams({ serviceKey: key, ...params })}`,
      `https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst?${new URLSearchParams({ authKey: key, ...params })}`,
    ];
    let items: Record<string, string>[] = [], last: unknown = null;
    for (const u of tries) {
      try {
        const d = await (await fetch(u)).json();
        items = d?.response?.body?.items?.item ?? [];
        last = d?.response?.header ?? d?.result ?? null;
        if (items.length) break;
      } catch (e) { last = String(e).replace(key, '***'); }
    }
    if (!items.length) return json(JSON.stringify({ error: 'no data', result: last }), 502);

    // 글피 자정까지(서울 날짜 기준 오늘+3일)
    const today = new Date(Date.now() + 9 * 3600e3), dayKey = (n: number) => { const x = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + n * 86400e3); return `${x.getUTCFullYear()}${p2(x.getUTCMonth() + 1)}${p2(x.getUTCDate())}`; };
    const lastDay = dayKey(3), coarseFrom = (() => { const x = new Date(Date.UTC(+b.date.slice(0, 4), +b.date.slice(4, 6) - 1, +b.date.slice(6, 8)) + (+b.time.slice(0, 2) >= 17 ? 4 : 3) * 86400e3); return `${x.getUTCFullYear()}${p2(x.getUTCMonth() + 1)}${p2(x.getUTCDate())}`; })();
    const by: Record<string, Record<string, string>> = {}, tmn: Record<string, number> = {}, tmx: Record<string, number> = {};
    for (const it of items) {
      if (it.fcstDate > lastDay) continue;
      if (it.category === 'TMN') { tmn[it.fcstDate] = Number(it.fcstValue); continue; }
      if (it.category === 'TMX') { tmx[it.fcstDate] = Number(it.fcstValue); continue; }
      (by[`${it.fcstDate}${it.fcstTime}`] ??= {})[it.category] = it.fcstValue;
    }
    const hourly = Object.keys(by).sort().map(k => {
      const v = by[k], date = k.slice(0, 8), coarse = date >= coarseFrom;
      return {
        time: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}T${k.slice(8, 10)}:00`,
        temp: v.TMP != null ? Number(v.TMP) : null, rh: v.REH != null ? Number(v.REH) : null, pop: v.POP != null ? Number(v.POP) : null,
        precip: amount(v.PCP, coarse, 'pcp'), snow: amount(v.SNO, coarse, 'sno'), wind: windOf(v.WSD, coarse), vec: v.VEC != null ? Number(v.VEC) : null,
        sky: v.SKY != null ? Number(v.SKY) : null, pty: v.PTY != null ? Number(v.PTY) : null, coarse,
      };
    });
    const daily = [...new Set(hourly.map(h => h.time.slice(0, 10).replaceAll('-', '')))].map(dk => ({ date: `${dk.slice(0, 4)}-${dk.slice(4, 6)}-${dk.slice(6, 8)}`, tmin: tmn[dk] ?? null, tmax: tmx[dk] ?? null }));
    const body = JSON.stringify({ source: '기상청 단기예보(API허브 VilageFcstInfoService_2.0)', base: `${b.date.slice(0, 4)}-${b.date.slice(4, 6)}-${b.date.slice(6, 8)} ${b.time.slice(0, 2)}:00`, grid: { nx: NX, ny: NY }, hourly, daily });
    cache = { at: Date.now(), body };
    return json(body);
  } catch (e) {
    return json(JSON.stringify({ error: String(e) }), 502);
  }
});

function json(body: string, status = 200) {
  return new Response(body, { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}
