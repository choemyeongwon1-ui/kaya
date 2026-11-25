// 「이 나무 뭐지?」 사진 수종 판별 중계 서버 (Supabase Edge Function · Deno)
// - 이용자 화면(needs/js/trees.js)이 찍은 사진 1장 + 찍은 부위(organ)를 보내면 Pl@ntNet Identify API v2에 대신 물어봄
//   https://my-api.plantnet.org/v2/identify/all  (무료 계정: 하루 500회)
// - API 키는 함수 비밀값 PLANTNET_API_KEY에만 둡니다(코드·저장소에 없음)
// - 사진은 저장하지 않고 Pl@ntNet에 넘긴 뒤 버립니다. 위치·기기 정보는 받지도 보내지도 않습니다
// - 같은 접속지에서 10분에 20건까지(메모리에만) — 하루 한도를 한 사람이 다 쓰지 않게
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
const ORGANS = new Set(['auto', 'leaf', 'flower', 'fruit', 'bark']);
const MAX_BYTES = 4 * 1024 * 1024;

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), arr = (hits.get(ip) ?? []).filter(t => now - t < 600e3);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 20;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const key = Deno.env.get('PLANTNET_API_KEY');
  if (!key) return json({ error: 'PLANTNET_API_KEY not set' }, 500);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'na';
  if (limited(ip)) return json({ error: 'too many' }, 429);
  try {
    const form = await req.formData();
    const img = form.get('image');
    const organ = String(form.get('organ') ?? 'auto');
    if (!(img instanceof File) || !img.type.startsWith('image/') || img.size > MAX_BYTES) return json({ error: 'bad image' }, 400);
    if (!ORGANS.has(organ)) return json({ error: 'bad organ' }, 400);
    const out = new FormData();
    out.append('images', img, 'photo.jpg');
    out.append('organs', organ);
    const q = new URLSearchParams({ 'api-key': key, 'nb-results': '3', lang: 'ko', 'include-related-images': 'false' });
    const r = await fetch(`https://my-api.plantnet.org/v2/identify/all?${q}`, { method: 'POST', body: out });
    const d = await r.json().catch(() => null);
    if (r.status === 404) return json({ results: [], note: 'not found' });          // Pl@ntNet: 식물을 못 찾음
    if (!r.ok || !d) return json({ error: d?.message ?? `plantnet ${r.status}` }, r.status === 429 ? 429 : 502);
    // 필요한 것만 추려서 돌려줌
    const results = (d.results ?? []).slice(0, 3).map((x: any) => ({
      score: Math.round((x.score ?? 0) * 1000) / 1000,
      sci: x.species?.scientificNameWithoutAuthor ?? null,
      genus: x.species?.genus?.scientificNameWithoutAuthor ?? null,
      family: x.species?.family?.scientificNameWithoutAuthor ?? null,
      common: (x.species?.commonNames ?? []).slice(0, 3),
    }));
    return json({ results, remaining: d.remainingIdentificationRequests ?? null });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
}
