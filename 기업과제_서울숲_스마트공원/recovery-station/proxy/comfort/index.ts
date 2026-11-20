// 서울숲 도착 평가(표정 3개) 저장·집계 서버 (Supabase Edge Function · Deno)
// - POST: 표정 한 건 저장. 값을 검사하고, 날짜·시각은 서버(서울 시각)가 정함. 개인 식별 정보(이름·기기·좌표·IP)는 저장하지 않음
// - GET : 최근 N일(기본 90일) 합계만 돌려줌(개별 응답은 내보내지 않음) → 관리자 화면의 거점×시간대·상황별 쾌적도
// - POST {kind:'course'}: 마침 화면의 코스 전체 평가 한 건(들른 곳 순서·까닭) → 관리자 화면 '코스 흐름'
// - 표 public.comfort_votes · public.course_votes 는 RLS로 외부 접근이 막혀 있고, 이 서버만 service_role로 씀
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
const PLACES = new Set(['family-lawn', 'mirror-pond', 'horse-plaza', 'stage', 'courts', 'visitor', 'forest-play', 'insect', 'butterfly', 'deer', 'lake', 'wetland', 'culture-ctr', 'water-museum']);
const REASONS = new Set(['crowded', 'far', 'boring', 'weather', 'facility', 'quiet', 'view', 'rest', 'fun']);
const COMPANY = new Set(['alone', 'couple', 'friends', 'kids', 'elders', 'pet']);
// 코스 전체(kind:'course', 표 public.course_votes): 좋은 점(smooth 동선 자연스러움 · varied 볼거리 다양 · rested 쉬며 걷기 좋음)
// / 아쉬운 점(backtrack 되돌아감 · norest 쉴 곳 없음 · long 김 · short 짧음 · samey 비슷한 곳만)
const COURSE_REASONS = new Set(['smooth', 'varied', 'rested', 'backtrack', 'norest', 'long', 'short', 'samey']);
const NEEDS = new Set(['rest', 'walk', 'play', 'active', 'learn', 'meet']);
const URL_ = Deno.env.get('SUPABASE_URL')!, SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const H = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };

// 같은 접속지에서 10분에 30건까지(메모리에만, 저장 안 함) — 반복 누르기 완화용
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), arr = (hits.get(ip) ?? []).filter(t => now - t < 600e3);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 30;
}
const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 10) / 10)) : null; };

let cache: { at: number; key: string; body: string } | null = null;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    if (req.method === 'POST') {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'na';
      if (limited(ip)) return json({ error: 'too many' }, 429);
      const b = await req.json().catch(() => null);
      const k = new Date(Date.now() + 9 * 3600e3);
      // 코스 전체 한 건(마침 화면)
      if (b?.kind === 'course') {
        const stops = Array.isArray(b.stops) ? b.stops.filter((s: unknown) => typeof s === 'string' && PLACES.has(s)).slice(0, 8) : [];
        if (!stops.length || ![1, 3, 5].includes(b.face)) return json({ error: 'bad input' }, 400);
        const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? v : null;
        const row = {
          face: b.face, stops, day: k.toISOString().slice(0, 10), hour: k.getUTCHours(),
          reasons: Array.isArray(b.reasons) ? [...new Set(b.reasons.filter((r: unknown) => typeof r === 'string' && COURSE_REASONS.has(r)))].slice(0, 6) : [],
          course: typeof b.course === 'string' && /^[a-z-]{1,20}$/.test(b.course) ? b.course : null,
          need: NEEDS.has(b.need) ? b.need : null, company: COMPANY.has(b.company) ? b.company : null,
          stay: int(b.stay, 10, 600), minutes: int(b.minutes, 0, 600), meters: int(b.meters, 0, 30000),
          feels: num(b.feels, -30, 50), pm25: num(b.pm25, 0, 500), crowd: int(b.crowd, 0, 3),
        };
        const r = await fetch(`${URL_}/rest/v1/course_votes`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
        if (!r.ok) return json({ error: 'save failed' }, 502);
        cache = null;
        return json({ ok: true });
      }
      if (!b || !PLACES.has(b.place) || ![1, 3, 5].includes(b.face)) return json({ error: 'bad input' }, 400);
      const row = {
        place: b.place, face: b.face,
        day: k.toISOString().slice(0, 10), hour: k.getUTCHours(),
        reasons: Array.isArray(b.reasons) ? [...new Set(b.reasons.filter((r: unknown) => typeof r === 'string' && REASONS.has(r)))].slice(0, 5) : [],
        feels: num(b.feels, -30, 50), pm25: num(b.pm25, 0, 500),
        crowd: Number.isInteger(b.crowd) && b.crowd >= 0 && b.crowd <= 3 ? b.crowd : null,
        company: COMPANY.has(b.company) ? b.company : null,
      };
      const r = await fetch(`${URL_}/rest/v1/comfort_votes`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
      if (!r.ok) return json({ error: 'save failed' }, 502);
      cache = null;
      return json({ ok: true });
    }
    // GET: 합계
    const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 90));
    const key = String(days);
    if (cache && cache.key === key && Date.now() - cache.at < 60e3) return new Response(cache.body, { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
    const since = new Date(Date.now() + 9 * 3600e3 - days * 864e5).toISOString().slice(0, 10);
    const r = await fetch(`${URL_}/rest/v1/comfort_votes?select=place,day,hour,face,reasons,feels,pm25,crowd,company&day=gte.${since}&limit=50000`, { headers: H });
    if (!r.ok) return json({ error: 'read failed' }, 502);
    const rows = await r.json() as { place: string; day: string; hour: number; face: number; reasons: string[]; feels: number | null; pm25: number | null; crowd: number | null; company: string | null }[];
    const cell = () => ({ n: 0, good: 0, mid: 0, bad: 0 });
    const add = (c: ReturnType<typeof cell>, f: number) => { c.n++; f >= 4 ? c.good++ : f === 3 ? c.mid++ : c.bad++; };
    const places: Record<string, ReturnType<typeof cell> & { reasons: Record<string, number> }> = {};
    const byHour: Record<string, Record<number, ReturnType<typeof cell>>> = {};
    const cond: Record<string, ReturnType<typeof cell>> = { hot: cell(), notHot: cell(), dust: cell(), clean: cell(), crowded: cell(), calm: cell() };
    const company: Record<string, ReturnType<typeof cell>> = {};
    const all = cell();
    for (const v of rows) {
      add(all, v.face);
      const p = (places[v.place] ??= { ...cell(), reasons: {} });
      add(p, v.face);
      for (const x of v.reasons ?? []) p.reasons[x] = (p.reasons[x] ?? 0) + 1;
      add(((byHour[v.place] ??= {})[v.hour] ??= cell()), v.face);
      if (v.feels != null) add(v.feels >= 31 ? cond.hot : cond.notHot, v.face);
      if (v.pm25 != null) add(v.pm25 >= 36 ? cond.dust : cond.clean, v.face);
      if (v.crowd != null) add(v.crowd >= 2 ? cond.crowded : cond.calm, v.face);
      if (v.company) add((company[v.company] ??= cell()), v.face);
    }
    // 코스 전체 합계: 까닭별, 머문 시간·장소 수·추천 코스별, 이어진 두 곳(구간)별
    const rc = await fetch(`${URL_}/rest/v1/course_votes?select=face,reasons,stops,course,stay&day=gte.${since}&limit=50000`, { headers: H });
    const crows = rc.ok ? await rc.json() as { face: number; reasons: string[]; stops: string[]; course: string | null; stay: number | null }[] : [];
    const courses = { total: cell(), reasons: {} as Record<string, number>, byStay: {} as Record<string, ReturnType<typeof cell>>, byStops: {} as Record<string, ReturnType<typeof cell>>,
      byCourse: {} as Record<string, ReturnType<typeof cell>>, legs: {} as Record<string, ReturnType<typeof cell> & { reasons: Record<string, number> }> };
    for (const v of crows) {
      add(courses.total, v.face);
      for (const x of v.reasons ?? []) courses.reasons[x] = (courses.reasons[x] ?? 0) + 1;
      if (v.stay) add((courses.byStay[v.stay] ??= cell()), v.face);
      add((courses.byStops[v.stops.length] ??= cell()), v.face);
      if (v.course) add((courses.byCourse[v.course] ??= cell()), v.face);
      for (let i = 1; i < v.stops.length; i++) {
        const leg = (courses.legs[`${v.stops[i - 1]}>${v.stops[i]}`] ??= { ...cell(), reasons: {} });
        add(leg, v.face);
        for (const x of v.reasons ?? []) leg.reasons[x] = (leg.reasons[x] ?? 0) + 1;
      }
    }
    const body = JSON.stringify({ since, days, total: all, places, byHour, cond, company, courses, checked: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') });
    cache = { at: Date.now(), key, body };
    return new Response(body, { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}
