// 디지털트윈 개선 시뮬레이션 (관리자용) — [만족도] 화면(ops/index.html)의 「디지털트윈에서 개선안 만들기」로 들어온다.
// 개선안 = 대시보드 만족도 식(index.html sat: 붐빔 .35 · 날씨 .30 · 환경 .35)의 세 갈래를 각각 고치는 '공간 패키지'
//   붐빔 → 붐비는 날(쾌적한 토요일) 혼잡률이 70%를 넘으면: 옆 칸으로 체류 쉼터 넓히기(수용 인원↑) + 여유 있는 거점으로 분산 안내(사람↓)
//   더위 → 더운 날(2026-08-07 실측 체감 36.3℃) 머무는 곳 그늘이 50%가 될 때까지 가장 효과 큰 자리에 그늘막·그늘나무(햇빛 광선으로 계산)
//   환경 → 팀 20m 칸 점수(analysis/02_vulnerability.py 식)로 식재·잔디·쉴 곳 효과 → envScore(80m)
// 장면: Sky·하늘빛 환경광, 자료로 그린 바닥(숲·잔디·포장·길·나무 그늘), 창이 있는 건물, 나무 3종(가까우면 자세히), 사람(혼잡을 눈으로). three.js r170(vendor, MIT)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

const D = '../data/';
const CSV = '../../output/seoulforest_vulnerability_grid.csv';   // 02_vulnerability.py 원본 산출(team.json과 같은 칸 순서)
const LA = -2.755, LB = 2.434, RA = 32.1, RB = 444.5, EA = 39.3, EB = 508.1;   // 02_vulnerability.py 표준화 범위(5~95 백분위)
const WT = { heat: .35, crowd: .15, access: .25, air: .25 };
const K_TREE = -0.839, K_PAVE = 1.345;   // 팀 Landsat 회귀: LST편차 ~ 수관비율 + 포장비율 (R² 0.21)
const CELL_M2 = 400, CANOPY_M2 = 64, TOILET_M = 250;
const SW = { dens: .35, wx: .30, env: .35 };   // index.html sat()과 같은 가중치 — 시작할 때 index.html 결과와 맞는지 콘솔로 확인
// 두 상황: 붐빔은 날씨가 좋을 때, 더위는 여름 한낮에 문제가 됨(대시보드 식에서 폭염일엔 야외 거점 사람이 줄어듦)
const SCN = {
  crowd: { key: 'crowd', label: '붐비는 날', day: '쾌적한 봄·가을 토요일', date: '5월 토요일', doy: 130, dow: 6, w: { feels: 21, pm25: 15, pop: 0 }, wTxt: '체감 21℃·초미세먼지 15 — 날씨 감점이 없는 날(가정)' },
  heat: { key: 'heat', label: '더운 날', day: '폭염일 토요일', date: '8월 7일 날씨', doy: 219, dow: 6, w: { feels: 36.3, pm25: 13, pop: 0 }, wTxt: '체감 36.3℃·초미세먼지 13 — 2026-08-07 15시 실측(팀 climate.json)을 토요일에 적용' }
};
const OPT_HRS = [10, 12, 14, 16];
const STAY_R = 40, ENV_R = 80, NB_R = 450;
const CROWD_CUT = .7, NB_FREE = .55, SHIFT = .15, YARD_USE = .85, MAX_YARD = 6, SHADE_TARGET = .5, MAX_SHADE = 8;   // 가정값(패널·보고서에 표시)

const FAC = {
  yard: { label: '체류 쉼터 넓히기' }, sign: { label: '혼잡 분산 안내' },
  sail: { label: '대형 그늘막', roof: { hx: 4, hy: 4, h: 4 } }, tree: { label: '그늘나무' }, bench: { label: '쉼터 벤치' },
  garden: { label: '계절 정원' }, photo: { label: '포토존' }, toilet: { label: '화장실' }
};
const BAD = { weather: '덥거나 추웠어요', crowded: '붐볐어요', far: '멀었어요', boring: '볼 게 별로였어요', facility: '쉴 곳·화장실 부족' };
const REC = { weather: '그늘막·그늘나무', crowded: '쉼터 넓히기·분산 안내', far: '쉴 곳·화장실', boring: '계절 정원·포토존', facility: '쉴 곳·화장실' };
// ---------- A·B·C안: 같은 진단(붐빔·더위·환경)에 시설 조합만 달리한 세 안 — 우리는 고르지 않고 세 안을 모두 구청에 보내고, 구청이 비교해 고른다 ----------
// 특징·장단점의 근거(문헌은 docs/개선안_근거논문.md):
//  · Middel 외(2016) Int J Biometeorol 60(12):1849–1861 — 그늘이 있으면 열 느낌이 약 1단계(9점 척도) 낮아짐, 나무 그늘과 인공 그늘의 체감 차이는 통계적으로 없음
//  · Nam 외(2025) ICUC12-123 — 나무 아래가 그늘 구조물 아래보다 WBGT 0.8℃·기온 1.4℃ 낮음(증발산, 구조물 표면의 장파 복사)
//  · Armson 외(2012) Urban For Urban Green 11(3):245–255 — 잔디는 지표면 최고온도를 최대 24℃, 나무 그늘은 19℃ 낮춤. 잔디는 흑구온도(몸이 느끼는 더위)엔 효과가 작고, 그늘은 5~7℃ 낮춤
//  · Westendorff(2021, ASLA) — 심은 나무의 냉각 효과가 체감되기까지 10년 가까이 걸릴 수 있음
//  · Arnberger 외(2010) — 붐빈다고 느끼면 다른 장소·시간으로 옮김 / Stokols(1972) — 밀도는 혼잡감의 필요조건(충분조건은 아님)
//  · 이지연(2012) — 서울숲 이용자는 편의시설을 중요하게 보나 만족은 낮음(IPA) / Whyte(1980) The Social Life of Small Urban Spaces — 앉을 곳(Sitting Space)이 머무는 사람을 만듦
//  · 서울시 그늘막 설치 가이드라인(2018) — 태풍 때 쉽게 접는 접이식 구조 / 산림청 — 경기 지역 봄 식재 적기 3월 하순~4월 하순
// 장단점은 안마다 늘 2개 이상: 거점에 따라 시설이 빠져도 대신할 문장을 둔다. 각 항목 = [문장, 근거]
const VARS = {
  A: { key: 'A', tag: 'A안', title: '바로 하는 안', hint: '공사 없이 바로 놓는 안', name: 'A안 · 바로 하는 안', yard: false, kinds: ['sail'], extra: [], when: '설치하면 바로',
    lead: '공사 없이 놓을 수 있는 그늘막·벤치·분산 안내로 먼저 고치는 안',
    why: '그늘은 종류보다 「있느냐」가 체감에 더 중요하다는 연구를 바탕으로, 공사 없이 그늘과 앉을 곳부터 채워요.',
    pros: pl => [
      pl.shade.length ? ['그늘막 아래의 체감 쾌적도는 나무 그늘과 통계적으로 차이가 없었어요.', 'Middel 외 2016'] : ['이곳은 이미 그늘이 충분해 그늘막 없이 쉴 곳만 보강해요.', '팀 그늘 계산'],
      ['앉을 곳을 늘리면 머무는 사람이 늘어요. 서울숲 이용자는 편의시설 만족이 낮았어요.', 'Whyte 1980 · 이지연 2012'],
      ['공사가 없어 설치하면 바로 효과가 나고, 옮기거나 걷을 수 있어요.', '시설 특성']],
    cons: pl => [
      pl.shade.length ? ['인공 그늘막 아래는 나무 아래보다 WBGT 0.8℃, 기온 1.4℃ 높았어요. 증발산이 없고 막이 데워지기 때문이에요.', 'Nam 외 2025'] : ['나무를 심지 않아 공기를 식히는 증발산 효과가 없어요.', 'Nam 외 2025'],
      pl.shift ? ['쉼터를 넓히지 않아 붐빔은 안내로 사람을 옮기는 만큼만 줄어요. 옮겨 가는 사람이 얼마나 될지는 행동에 달려 있어요.', 'Arnberger 외 2010'] : ['쉼터를 넓히지 않고, 옮겨 갈 여유 거점도 없어 붐빔은 거의 그대로예요.', '팀 혼잡 계산'],
      pl.shade.length ? ['천 구조물이라 태풍·강풍 때 접어야 하고 점검이 필요해요.', '서울시 그늘막 가이드라인 2018'] : ['포장과 녹지를 바꾸지 않아 땅 온도는 거의 그대로예요.', 'Armson 외 2012']] },
  B: { key: 'B', tag: 'B안', title: '균형안', hint: '쉼터 넓히기 + 그늘막·나무', name: 'B안 · 균형안', yard: true, kinds: ['sail', 'tree'], extra: ['garden', 'photo', 'toilet'], when: '그늘막·쉼터는 공사 뒤 바로, 나무 그늘은 자란 뒤',
    lead: '쉼터를 넓히고, 그늘막과 그늘나무를 함께 쓰는 안',
    why: '그늘막은 바로, 나무는 자라면서 그늘을 만들어요. 둘을 함께 써서 나무가 자라는 동안 생기는 그늘 공백을 막아요.',
    pros: pl => [
      pl.yards.length ? ['쉼터를 넓혀 같은 인원이 더 넓게 머물러 밀도가 낮아져요. 밀도는 혼잡감이 생기는 바탕이에요.', 'Stokols 1972'] : pl.shift ? ['붐비는 시간에 여유 있는 거점으로 사람을 나눠요.', 'Arnberger 외 2010'] : ['그늘막과 나무를 함께 써서 두 그늘의 장점을 합쳐요.', 'Middel 외 2016 · Nam 외 2025'],
      ['그늘막은 설치 즉시 그늘을 만들고, 나무는 체감 효과까지 10년 가까이 걸리는 동안 그 공백을 메워요.', 'Westendorff 2021'],
      ['나무 그늘은 지표면 온도를 최대 19℃ 낮추고, 그늘 아래 몸이 느끼는 더위도 5~7℃ 줄여요.', 'Armson 외 2012']],
    cons: pl => [
      pl.yards.length ? ['포장 광장을 데크·잔디 쉼터로 바꾸는 공사가 필요해 A안보다 기간과 사업비가 커요.', '시설 특성'] : ['그늘막과 나무를 함께 설치해 A안보다 사업비가 커요.', '시설 특성'],
      ['그늘막(강풍 때 접기·점검)과 나무(심은 뒤 활착 관리)를 함께 관리해야 해요.', '서울시 그늘막 가이드라인 2018'],
      pl.extra.some(t => t.k === 'toilet') ? ['화장실은 건축 공사라 사업비와 기간이 크게 늘어요.', '시설 특성'] : ['그늘막 부분은 나무 그늘보다 덜 시원해요(WBGT 0.8℃ 차이).', 'Nam 외 2025']] },
  C: { key: 'C', tag: 'C안', title: '녹지 중심안', hint: '잔디 쉼터 + 그늘나무', name: 'C안 · 녹지 중심안', yard: true, lawn: true, kinds: ['tree'], extra: ['garden', 'toilet'], when: '나무가 자란 뒤(수관 지름 9m 기준)',
    lead: '그늘막 없이 잔디 쉼터와 그늘나무로 바꾸는 안',
    why: '나무는 증발산으로 공기를, 잔디는 땅을 식혀요. 설치물 없이 시간이 갈수록 좋아지는 환경을 만들어요.',
    pros: pl => [
      ['나무 아래는 그늘 구조물 아래보다 WBGT 0.8℃, 기온 1.4℃ 낮았어요.', 'Nam 외 2025'],
      pl.yards.length ? ['포장을 잔디로 바꾸면 지표면 최고온도가 최대 24℃ 낮아져요.', 'Armson 외 2012'] : ['나무 그늘은 지표면 온도를 최대 19℃ 낮춰요.', 'Armson 외 2012'],
      ['설치물이 아니라 살아 있는 나무라 해마다 그늘이 넓어지고, 철거·교체할 시설이 적어요.', '시설 특성']],
    cons: pl => [
      ['나무의 냉각 효과가 체감되기까지 10년 가까이 걸릴 수 있어요. 그 사이엔 그늘이 부족해요.', 'Westendorff 2021'],
      pl.yards.length ? ['잔디는 땅은 식히지만 몸이 느끼는 더위(흑구온도)에는 효과가 작아요. 결국 그늘이 핵심이에요.', 'Armson 외 2012'] : ['쉼터를 넓히지 않아 붐빔은 거의 그대로예요.', '팀 혼잡 계산'],
      ['나무 심는 때가 정해져 있어요(경기 지역 봄 적기 3월 하순~4월 하순). 잔디는 밟힘이 잦으면 쉬게 하는 관리가 필요해요.', '산림청']] }
};
const REFS = [
  'Middel, A., Selover, N., Hagen, B., Chhetri, N. (2016). Impact of shade on outdoor thermal comfort — a seasonal field study in Tempe, Arizona. International Journal of Biometeorology 60(12), 1849–1861.',
  'Nam, H., Lee, D., Park, B., Kim, S., Nam, Y. (2025). Comparative analysis of urban heat stress mitigation effects of trees and shade structures. ICUC12, ICUC12-123.',
  'Armson, D., Stringer, P., Ennos, A. R. (2012). The effect of tree shade and grass on surface and globe temperatures in an urban area. Urban Forestry & Urban Greening 11(3), 245–255.',
  'Westendorff, V. (2021). Urban trees: strategies for reducing urban heat island in cities. ASLA The Field.',
  'Arnberger, A. 외 (2010). 도시 녹지 이용자의 혼잡 지각과 회피 행동(대시보드 이론적 근거와 같은 문헌).',
  'Stokols, D. (1972). On the distinction between density and crowding. Psychological Review 79(3), 275–277.',
  '이지연 (2012). 서울숲 이용자의 중요도-만족도(IPA) 분석(대시보드 이론적 근거와 같은 문헌).',
  'Whyte, W. H. (1980). The Social Life of Small Urban Spaces. Conservation Foundation.',
  '서울특별시 (2018). 그늘막 설치 가이드라인 · 산림청 봄철 나무심기 지역별 적기 안내.'
];
const listOf = (f, pl) => f(pl).filter(Boolean).map(x => Array.isArray(x) ? x[0] + (x[1] ? ' (' + x[1] + ')' : '') : x);   // 글자로(보고서·관리자 카드)
const listHTML = (f, pl) => f(pl).filter(Boolean).map(x => '<li>' + esc(Array.isArray(x) ? x[0] : x) + (Array.isArray(x) && x[1] ? '<cite>' + esc(x[1]) + '</cite>' : '') + '</li>').join('');   // 화면(근거를 작게)
const VK = ['A', 'B', 'C'];
// 개략 사업비 단가(만 원) — 가정값. 개당 공개 단가를 찾지 못해 넣은 값이며, 화면에서 바꿀 수 있음(이 기기에만 저장). 제출 전 나라장터 계약 단가로 바꿔 넣기.
// 참고: 느티나무 H4.5×R20 목대가격 최근 3년 평균 30만 원(한국농촌경제연구원 조경수 표본임가, 2014) — 식재비는 따로
const COST0 = {
  sign: { label: '혼잡 분산 안내(안내판·앱 알림)', unit: '식', p: 500 }, sail: { label: '대형 그늘막 8×8m', unit: '개', p: 1500 },
  tree: { label: '그늘나무(느티나무 R20급) 식재', unit: '그루', p: 80 }, bench: { label: '벤치', unit: '개', p: 100 },
  deck: { label: '그늘 데크 쉼터(앉음벽·벤치 포함)', unit: '㎡', p: 30 }, lawn: { label: '잔디 쉼터(앉음벽·벤치 포함)', unit: '㎡', p: 5 },
  garden: { label: '계절 정원', unit: '곳', p: 1000 }, photo: { label: '포토존', unit: '곳', p: 500 }, toilet: { label: '화장실', unit: '동', p: 20000 }
};
const COST = JSON.parse(JSON.stringify(COST0));
try { const s = JSON.parse(localStorage.getItem('twCost') || 'null'); if (s) Object.keys(s).forEach(k => { if (COST[k] && isFinite(s[k])) COST[k].p = +s[k]; }); } catch (e) { /* 저장소를 못 쓰면 가정값 그대로 */ }
const saveCost = () => { try { const o = {}; Object.keys(COST).forEach(k => { o[k] = COST[k].p; }); localStorage.setItem('twCost', JSON.stringify(o)); } catch (e) { /* 무시 */ } };
const won = m => m >= 10000 ? (Math.round(m / 100) / 100).toLocaleString() + '억 원' : Math.round(m).toLocaleString() + '만 원';
const LAWS = ['도시공원 및 녹지 등에 관한 법률 제10조의2(공원녹지정보체계 구축·운영: 이용자 편의증진)', '같은 법 시행규칙 제9조 제3항(노약자·어린이가 쉽게 접근하도록 설치)', '스마트도시 조성 및 산업진흥 등에 관한 법률 제2조 제3호 다목(스마트도시의 관리·운영에 관한 시설)'];

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const J = u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
const TX = u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); });
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const hm = v => { const a = Math.floor(v), m = Math.round((v - a) * 60); return String(a).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
const f1 = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
const pc = v => Math.round(v * 100) + '%';
const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const POP = new Uint8Array(65536); for (let i = 1; i < 65536; i++) POP[i] = POP[i >> 1] + (i & 1);
const NUM = '①②③④⑤⑥⑦⑧⑨⑩';

// 해 위치: 적위·균시차(NOAA 일반식) → 고도·방위각(도, 북에서 시계 방향)
export function sunPos(hour, doy) {
  const s = { lat: 37.544, lon: 127.043, tz: 9 }, g = 2 * Math.PI / 365 * (doy - 1 + (hour - 12) / 24);
  const eq = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2 * g) - .040849 * Math.sin(2 * g));
  const de = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2 * g) + .000907 * Math.sin(2 * g) - .002697 * Math.cos(3 * g) + .00148 * Math.sin(3 * g);
  const tst = hour * 60 + eq + 4 * s.lon - 60 * s.tz, ha = (tst / 4 - 180) * Math.PI / 180, la = s.lat * Math.PI / 180;
  const cz = Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(ha), zen = Math.acos(Math.max(-1, Math.min(1, cz)));
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(de) * Math.cos(la)) * 180 / Math.PI + 180) % 360;
  return { alt: 90 - zen * 180 / Math.PI, az };
}
function sunDir(hour, doy) { const p = sunPos(hour, doy), a = p.alt * Math.PI / 180, z = p.az * Math.PI / 180; return { x: Math.sin(z) * Math.cos(a), y: Math.cos(z) * Math.cos(a), z: Math.sin(a), alt: p.alt, az: p.az }; }

const RAMP = [[15, [47, 158, 107]], [30, [150, 205, 92]], [39.7, [242, 211, 91]], [49.1, [245, 150, 74]], [55.8, [229, 72, 77]], [66, [170, 30, 58]]];
function ramp(v) {
  if (v <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) { const t = (v - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]), a = RAMP[i - 1][1], b = RAMP[i][1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  return RAMP[RAMP.length - 1][1];
}
const pctColor = p => p >= 85 ? 0x2fbf7f : p >= 75 ? 0xe8b93a : 0xf07a3a;
const pctCss = p => p >= 85 ? '#6af5b0' : p >= 75 ? '#f5d58a' : '#ff9d5c';

async function loadRatings() {
  let live = null;
  try { const m = await import('../needs/js/review.js'); live = await m.fetchComfort(90); } catch (e) { live = null; }
  if (live && live.places && Object.keys(live.places).length) return { places: live.places, demo: false, check: live.check || null, n: live.total ? live.total.n : null, since: live.since };
  const seed = await J('../needs/data/ratings_seed.json').catch(() => null), places = {};
  (seed && seed.journeys || []).forEach(j => (j.stops || []).forEach(s => {
    const p = places[s.id] || (places[s.id] = { n: 0, good: 0, mid: 0, bad: 0, reasons: {} });
    p.n++; if (s.rating >= 4) p.good++; else if (s.rating >= 3) p.mid++; else p.bad++;
    (s.tags || []).forEach(t => { p.reasons[t] = (p.reasons[t] || 0) + 1; });
  }));
  return { places, demo: true };
}
const satPct = p => p && p.n ? (p.good * 100 + p.mid * 50) / p.n : null;

// ---------- 근거 확인: 방문객 아쉬움이 실제 상황(평가 당시 실시간 도시데이터)과 맞는지 ----------
const NOW_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-now';   // proxy/seoul-now · OA-21285 서울숲공원
function fisherGreater(a, b, c, d) {
  const n = a + b + c + d, r1 = a + b, c1 = a + c, LF = [0]; for (let i = 1; i <= n; i++) LF[i] = LF[i - 1] + Math.log(i);
  const pr = x => Math.exp(LF[r1] + LF[n - r1] + LF[c1] + LF[n - c1] - LF[n] - LF[x] - LF[r1 - x] - LF[c1 - x] - LF[n - r1 - c1 + x]);
  let p = 0; for (let x = a; x <= Math.min(r1, c1); x++) p += pr(x); return Math.min(1, p);
}
const COND = {
  crowded: { tag: 'crowded', src: 'crowd', inside: k => k >= 1, inLabel: '혼잡 보통 이상', outLabel: '여유' },
  weather: { tag: 'weather', src: 'feels', inside: k => k >= 30 || k <= -10, inLabel: '체감 30℃↑·−5℃↓', outLabel: '그 밖' }
};
function crossTab(chk, key) {
  const c = COND[key], bins = chk && chk[c.src] || {}; let a = 0, b = 0, cc = 0, d = 0;
  Object.keys(bins).forEach(k => { const v = bins[k], t = v[c.tag] || 0; if (c.inside(+k)) { a += t; b += v.n - t; } else { cc += t; d += v.n - t; } });
  return { a, b, c: cc, d, nIn: a + b, nOut: cc + d, tags: a + cc };
}
function verdict(t) {
  const rIn = t.nIn ? t.a / t.nIn : 0, rOut = t.nOut ? t.c / t.nOut : 0, p = t.nIn && t.nOut ? fisherGreater(t.a, t.b, t.c, t.d) : 1;
  let v = 'none';
  if (!t.tags) v = 'zero'; else if (t.nIn < 5) v = 'few'; else if (rIn >= 2 * rOut && p < .1) v = 'yes'; else if (rIn > rOut) v = 'lean'; else v = 'no';
  return Object.assign({}, t, { rIn, rOut, p, v });
}
const VTXT = { yes: '실제 상황과 맞음', lean: '경향은 있으나 아직 약함', no: '실제 상황과 안 맞음', few: '그런 상황의 평가가 아직 적음', zero: '이런 아쉬움이 아직 없음', none: '검증 자료 없음' };
function topBad(p) { if (!p) return null; let b = null; Object.keys(BAD).forEach(k => { const v = (p.reasons || {})[k] || 0; if (v && (!b || v > b[1])) b = [k, v]; }); return b; }
function parseCSV(txt) {
  const L = txt.replace(/^﻿/, '').trim().split(/\r?\n/), H = L[0].split(','), col = ['lst_anom', 'tree', 'built', 'd_rest', 'd_ent'].map(k => H.indexOf(k));
  if (col.some(c => c < 0)) throw new Error('CSV 열 없음');
  return L.slice(1).map(r => { const v = r.split(','); return col.map(c => +v[c]); });
}
function inPoly(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

// ---------- 모양(나무·사람·그늘막) ----------
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
// 수관: 덩어리 여러 개(정이십면체를 같은 자리면 같은 만큼 울퉁불퉁하게) + 아래는 어둡고 위는 밝은 정점 색 / 줄기는 곱해도 갈색이 되게
function treeGeo(kind, hi) {
  const pos = [], nor = [], col = [], g0 = new THREE.Color().setHSL(.27, .42, .33), br = new THREE.Color(0x5b4634), tc = [br.r / g0.r, br.g / g0.g, br.b / g0.b];
  const put = (g, f, trunk) => { const p = g.attributes.position.array, n = g.attributes.normal.array; for (let i = 0; i < p.length; i += 3) { const q = f(p[i], p[i + 1], p[i + 2]); pos.push(q[0], q[1], q[2]); nor.push(n[i], n[i + 1], n[i + 2]); if (trunk) col.push(tc[0], tc[1], tc[2]); else { const c = q[3]; col.push(c, c, c); } } g.dispose(); };
  const lobes = (L, det, sx, sy, cy) => L.forEach(([x, y, z, r], li) => {
    const g = new THREE.IcosahedronGeometry(r, det).toNonIndexed(), tint = (hash3(li, 3, 7) - .5) * .12;
    put(g, (vx, vy, vz) => { const k = 1 + (hash3(Math.round(vx * 40), Math.round(vy * 40), Math.round(vz * 40) + li) - .5) * .3; return [(vx * k + x) * sx, (vy * k + y) * sy + cy, (vz * k + z) * sx, .58 + .55 * clamp01((vy + r) / (2 * r)) + tint]; });
  });
  const trunk = (h, r0, r1) => { const g = new THREE.CylinderGeometry(r1, r0, 1, hi ? 7 : 5).toNonIndexed(); put(g, (x, y, z) => [x, (y + .5) * h, z], true); };
  if (kind === 0) { trunk(3.4, .3, .18); lobes(hi ? [[0, 0, 0, 1.05], [.62, -.15, .2, .74], [-.58, -.1, -.28, .76], [.12, .45, -.4, .68], [-.18, .3, .55, .68]] : [[0, 0, 0, 1.1], [.6, -.1, .2, .78], [-.5, .1, -.3, .8]], hi ? 1 : 0, 3, 2.7, 5.2); }
  if (kind === 1) { trunk(4.2, .26, .15); lobes(hi ? [[0, -.55, 0, .82], [0, .2, 0, .86], [0, .85, 0, .68]] : [[0, -.4, 0, .85], [0, .5, 0, .8]], hi ? 1 : 0, 2.2, 3.2, 6.4); }
  if (kind === 2) {
    trunk(2.2, .25, .14);
    (hi ? [[2.6, 4.2, 3.6], [2.0, 3.6, 5.6], [1.3, 3.0, 7.4]] : [[2.4, 8, 5]]).forEach(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, hi ? 9 : 7).toNonIndexed(); put(g, (vx, vy, vz) => [vx, vy + y, vz, .55 + .45 * clamp01((vy + h / 2) / h)]); });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g;
}
// 대형 그늘막 막(8×8m): 모서리 높이를 엇갈리게(4.6·3.4m) + 가운데 처짐
function sailGeo() {
  const g = new THREE.PlaneGeometry(8, 8, 12, 12); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + 4) / 8, v = (p.getZ(i) + 4) / 8, h = (1 - u) * (1 - v) * 4.6 + u * (1 - v) * 3.4 + (1 - u) * v * 3.4 + u * v * 4.6 - .38 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v); p.setY(i, h); }
  g.computeVertexNormals(); return g;
}
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export async function openTwin(o) {
  const xy = o.xy, low = !!o.low, M = o.model;
  if (!document.getElementById('twCss')) { const l = document.createElement('link'); l.id = 'twCss'; l.rel = 'stylesheet'; l.href = './sim3d.css?v=21'; document.head.appendChild(l); }
  const root = document.createElement('div'); root.className = 'tw'; root.innerHTML = '<div class="tw-load"><i></i><span>디지털트윈을 불러오는 중…</span></div>'; document.body.appendChild(root);
  if (!M || !M.sat) { root.remove(); throw new Error('대시보드 만족도 식(model)을 받지 못했어요'); }

  // ---------- 자료 ----------
  const [team, csvTxt, eng, feats0, net, NOW, rat, city] = await Promise.all([
    J(D + 'team.json'), TX(CSV), J(D + 'grid.geojson'), J(D + 'features.geojson').catch(() => null), J(D + 'network.json').catch(() => null),
    Promise.race([J(NOW_URL), new Promise(r => setTimeout(() => r(null), 8000))]).catch(() => null), loadRatings(), o.city ? Promise.resolve(o.city) : J(D + 'city3d.json').catch(() => null)]).catch(e => { root.remove(); throw e; });
  const nowOk = NOW && !NOW.error ? NOW : null;
  const EV = {}; Object.keys(COND).forEach(k => { EV[k] = rat.check ? verdict(crossTab(rat.check.total, k)) : { v: 'none' }; });
  const P = rat.places;
  function hubEv(id) {
    const p = P[id] || {}, rs = p.reasons || {};
    return Object.keys(COND).filter(k => rs[k]).map(k => { const t = rat.check && rat.check.places[id] ? crossTab(rat.check.places[id], k) : null; return { key: k, n: rs[k], inCond: t ? t.a : null, park: EV[k] }; });
  }
  const pTxt = p => p < .001 ? 'p<0.001' : 'p=' + p.toFixed(3);
  function evLine(k) {
    const e = EV[k], c = COND[k];
    if (e.v === 'none') return '검증 자료 없음(시연용 가상 평가)';
    if (e.v === 'zero') return '「' + BAD[k] + '」 0건 · ' + c.inLabel + ' 때 평가 ' + e.nIn + '건 → ' + (k === 'weather' ? '더위는 여름 자료가 쌓여야 판단' : '판단할 것 없음');
    return c.inLabel + ' 때 ' + e.a + '/' + e.nIn + '(' + pc(e.rIn) + ') vs ' + c.outLabel + ' ' + e.c + '/' + e.nOut + '(' + pc(e.rOut) + ') · ' + pTxt(e.p);
  }
  function opsRecs() {
    const out = []; if (!nowOk) return out;
    const crowdHubs = hubs.filter(h => ((P[h.id] || {}).reasons || {}).crowded).sort((a, b) => P[b.id].reasons.crowded - P[a.id].reasons.crowded).slice(0, 3).map(h => h.name);
    const fc = (nowOk.crowd && nowOk.crowd.forecast || []).filter(f => f.rank != null), peak = fc.reduce((m, f) => !m || f.rank > m.rank || (f.rank === m.rank && (f.max || 0) > (m.max || 0)) ? f : m, null);
    if (peak && peak.rank >= 1) out.push(peak.time.slice(11, 13) + '시 「' + peak.level + '」 예상(' + (peak.min || 0).toLocaleString() + '~' + (peak.max || 0).toLocaleString() + '명) → ' + (EV.crowded.v === 'yes' && crowdHubs.length ? '붐빔 불만이 실제 혼잡과 맞으니 ' + crowdHubs.join('·') + '에 그 전부터 우회 안내·분산 배치' : '거점별 분산 안내 준비'));
    else if (peak) out.push('12시간 안 「여유」만 예상(최대 ' + (peak.max || 0).toLocaleString() + '명) → 오늘은 혼잡 대응보다 시설 점검·프로그램 운영에 집중');
    const w = nowOk.weather || {}, f = w.feels != null ? w.feels : w.temp;
    if (f != null && f >= 31) out.push('체감 ' + f + '℃ → 그늘 거점 안내·그늘막 먼저 펼치기(체감 31℃ 기준: 주제서 예시)');
    if (f != null && f <= -5) out.push('체감 ' + f + '℃ → 실내 대체시설(곤충식물원·나비정원)과 실내 쉼터 안내');
    if (w.uv != null && w.uv >= 6) out.push('자외선 ' + (w.uvText || w.uv) + ' → 그늘 동선 안내');
    if (w.pm25 != null && w.pm25 >= 36) out.push('초미세먼지 ' + w.pm25 + '㎍/㎥(' + (w.pm25Text || '') + ') → 실내 대체시설 안내·야외 프로그램 줄이기(36 기준: 주제서 예시)');
    (nowOk.events || []).slice(0, 2).forEach(e => out.push('행사 「' + e.name + '」 ' + (e.period || '') + ' → 행사 시간 앞뒤로 입구·화장실 혼잡 대비'));
    return out;
  }
  function liveHTML() {
    if (!nowOk) return '<div class="tw-live"><h3>지금 서울숲</h3><p class="tw-note">실시간 도시데이터를 받지 못했어요.</p></div>';
    const w = nowOk.weather || {}, c = nowOk.crowd || {}, f = w.feels != null ? w.feels : null;
    return '<div class="tw-live"><h3>지금 서울숲 <small>서울시 실시간 도시데이터(OA-21285) · ' + esc((w.time || c.time || '').slice(5)) + '</small></h3>' +
      '<div class="tw-lg"><span>기온<b>' + (w.temp != null ? w.temp + '℃' : '—') + '</b>' + (f != null ? '<i>체감 ' + f + '℃</i>' : '') + '</span><span>초미세먼지<b>' + (w.pm25 != null ? w.pm25 : '—') + '</b><i>' + esc(w.pm25Text || '') + '</i></span>' +
      '<span>혼잡<b>' + esc(c.level || '—') + '</b><i>' + (c.min != null ? c.min.toLocaleString() + '~' + c.max.toLocaleString() + '명' : '') + '</i></span><span>행사<b>' + (nowOk.events || []).length + '건</b><i>주변</i></span></div>' +
      '<h4>방문객 아쉬움, 데이터와 맞나요?</h4><ul class="tw-ev">' + Object.keys(COND).map(k => '<li class="v-' + EV[k].v + '"><b>「' + BAD[k] + '」 · ' + VTXT[EV[k].v] + '</b><small>' + esc(evLine(k)) + '</small></li>').join('') + '</ul>' +
      (opsRecs().length ? '<h4>오늘 운영 추천</h4><ul class="tw-ops">' + opsRecs().map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>';
  }

  // ---------- 칸 자료 · 팀 식 재현 ----------
  const feats = team.grid.features, rows = parseCSV(csvTxt), N = feats.length;
  if (rows.length !== N) { root.remove(); throw new Error('칸 수가 다름(team ' + N + ' / csv ' + rows.length + ')'); }
  const Q = [], CX = new Float64Array(N), CY = new Float64Array(N), A = new Float64Array(N), TR = new Float64Array(N), B = new Float64Array(N), R = new Float64Array(N), EN = new Float64Array(N),
    CR = new Float64Array(N), AIR = new Float64Array(N), S0 = new Float64Array(N), F0 = new Float64Array(N), DT = new Float64Array(N);
  feats.forEach((f, i) => {
    const c = f.geometry.coordinates[0].slice(0, 4).map(q => xy(q[0], q[1])); Q.push(c);
    CX[i] = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4; CY[i] = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
    const p = f.properties, r = rows[i];
    A[i] = r[0]; TR[i] = clamp01(r[1]); B[i] = clamp01(r[2]); R[i] = r[3]; EN[i] = clamp01((r[4] - EA) / (EB - EA)) * 100; CR[i] = p.crowd; AIR[i] = p.air; S0[i] = p.score;
  });
  function formula(i, a, sh, dr, cr) {
    const heat = .6 * clamp01((a - LA) / (LB - LA)) * 100 + .4 * (1 - clamp01(sh)) * 100, acc = .65 * clamp01((dr - RA) / (RB - RA)) * 100 + .35 * EN[i];
    return WT.heat * heat + WT.crowd * cr + WT.access * acc + WT.air * AIR[i];
  }
  let errMax = 0, errN = 0;
  for (let i = 0; i < N; i++) { F0[i] = formula(i, A[i], TR[i], R[i], CR[i]); const e = Math.abs(F0[i] - S0[i]); if (e > errMax) errMax = e; if (e > .02) errN++; }
  console.info('[디지털트윈] 칸 점수 재현(02_vulnerability.py 식 vs team.json score): 최대 오차 ' + errMax.toFixed(4) + ' · 0.02 넘는 칸 ' + errN + ' / ' + N + (errN ? ' ← 확인 필요' : ' · 통과'));
  const E = eng.features.map(f => { const z = f.geometry.coordinates[0].slice(0, -1); let lo = 0, la = 0; z.forEach(q => { lo += q[0]; la += q[1]; }); const p = xy(lo / z.length, la / z.length); return [p[0], p[1], f.properties.dToilet]; });
  for (let i = 0; i < N; i++) { let bd = 1e18, v = 0; for (const e of E) { const d = (e[0] - CX[i]) ** 2 + (e[1] - CY[i]) ** 2; if (d < bd) { bd = d; v = e[2]; } } DT[i] = v; }
  const hubs = o.hubs.map(h => ({ id: h.id, name: h.name, zone: h.zone, x: h.x, y: h.y, cap: h.capacity || 0, pull: h.pull == null ? .5 : h.pull, type: h.type || 'outdoor', env0: h.env0 != null ? h.env0 : (h.env != null ? h.env : 70) }));

  // ---------- 대시보드 만족도 식(index.html에서 받은 함수) + 그늘 비율 보간 ----------
  const wxS = (type, w, s) => type !== 'outdoor' || !s ? M.wxScore(type, w).v : (1 - s) * M.wxScore('outdoor', w).v + s * M.wxScore('shade', w).v;
  const wxfS = (type, w, s) => type !== 'outdoor' || !s ? M.wxf(type, w) : (1 - s) * M.wxf('outdoor', w) + s * M.wxf('shade', w);
  const demand = (h, sc, hr, s) => Math.min(1.35, M.tp(sc.dow, Math.floor(hr)) * (.55 + .6 * h.pull) * wxfS(h.type, sc.w, s) * 1.15);   // index.html crowd()와 같은 식
  function satOf(ratio, x, e) { const d = M.densScore(ratio); return { raw: .75 * (d * SW.dens + x * SW.wx + e * SW.env) + .25 * Math.min(d, x, e), d, x, e }; }
  { let mx = 0; hubs.forEach(h => [.3, .8, 1.2].forEach(r => [SCN.crowd.w, SCN.heat.w].forEach(w => { mx = Math.max(mx, Math.abs(satOf(r, wxS(h.type, w, 0), h.env0).raw - M.sat({ type: h.type, env: h.env0 }, r, w).raw)); })));
    console.info('[디지털트윈] 만족도 식 재현(index.html sat vs 트윈): 최대 오차 ' + mx.toFixed(4) + (mx > .01 ? ' ← 확인 필요' : ' · 통과')); }

  // 바닥 자료
  const pairs = (a, s) => { const out = []; for (let i = s; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]); return out; };
  const FE = (feats0 && feats0.features || []).map(f => ({ k: f.properties.kind, ring: f.geometry.coordinates[0].map(q => xy(q[0], q[1])) }));
  const CWATER = (city && city.water || []).map(w => Array.isArray(w[0]) ? w : pairs(w, 0)).filter(p => p.length > 2);
  const NX = net ? net.nodes.map(q => xy(q[0], q[1])) : [], NE = net ? net.edges.filter(e => NX[e[0]] && NX[e[1]]) : [];
  const BLOCK = FE.filter(f => f.k === 'building' || f.k === 'water').map(f => f.ring).concat(CWATER);
  const blocked = new Uint8Array(N); for (let i = 0; i < N; i++) blocked[i] = BLOCK.some(r => inPoly(CX[i], CY[i], r)) ? 1 : 0;
  const okPt = (x, y) => !BLOCK.some(r => inPoly(x, y, r));
  let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9; (o.rings || []).forEach(r => r.forEach(q => { bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]); by1 = Math.max(by1, q[1]); }));
  if (bx0 > bx1) for (let i = 0; i < N; i++) { bx0 = Math.min(bx0, CX[i]); bx1 = Math.max(bx1, CX[i]); by0 = Math.min(by0, CY[i]); by1 = Math.max(by1, CY[i]); }

  // 나무 목록(바닥 그늘 그림에도 씀): 칸 수관비율 × 400㎡ ÷ 64㎡ 그루, 종류 3가지(둥근 활엽 72% · 길쭉한 활엽 18% · 침엽 10%)
  const TL = [];
  { let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) { let n = Math.round(TR[i] * CELL_M2 / CANOPY_M2); if (low) n = Math.round(n / 2); for (let k = 0; k < n; k++) { const u = r(), v = r(), q = Q[i], kd = r(); TL.push([(q[0][0] * (1 - u) + q[1][0] * u) * (1 - v) + (q[3][0] * (1 - u) + q[2][0] * u) * v, (q[0][1] * (1 - u) + q[1][1] * u) * (1 - v) + (q[3][1] * (1 - u) + q[2][1] * u) * v, 2.4 + r() * 1.5, r(), r() * 6.28, kd < .72 ? 0 : kd < .9 ? 1 : 2]); } } }

  // ---------- 렌더러 · 하늘 · 빛 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 1.25));
  renderer.setScissorTest(true);   // 한 프레임에 왼쪽(지금)·오른쪽(개선 후)을 시저로 나눠 그림
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .5;
  const FOG = 0xc7d3dc; renderer.setClearColor(FOG);
  const cvs = renderer.domElement; cvs.className = 'tw-cv'; root.prepend(cvs);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(FOG, 1500, 6800); scene.environmentIntensity = .25;
  // 레이어: 0 공통 · 1 개선안(오른쪽만) · 2 지금 해 · 3 개선 후 해 · 4 지금 사람 · 5 개선 후 사람
  const camera = new THREE.PerspectiveCamera(38, 1, 1.5, 9500); [1, 3, 5].forEach(l => camera.layers.enable(l));
  const camL = new THREE.PerspectiveCamera(38, 1, 1.5, 9500); camL.layers.set(0); camL.layers.enable(2); camL.layers.enable(4);
  const disp = [], add = d => { disp.push(d); return d; };
  const std = (c, ex) => add(new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .85, metalness: 0 }, ex || {})));
  const sky = new Sky(); sky.scale.setScalar(7000); const SU = sky.material.uniforms; SU.turbidity.value = 4.5; SU.rayleigh.value = 1.1; SU.mieCoefficient.value = .004; SU.mieDirectionalG.value = .8; sky.renderOrder = -10; scene.add(sky); add(sky.geometry); add(sky.material);
  const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(), envSky = new Sky(); envSky.scale.setScalar(900); envScene.add(envSky); let envRT = null;
  function updateEnv() { const eu = envSky.material.uniforms; ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'].forEach(k => { eu[k].value = SU[k].value; }); eu.sunPosition.value.copy(SU.sunPosition.value); if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, 0, 1, 2000); scene.environment = envRT.texture; }
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x55633f, .25));
  const SM = (low || o.mobile) ? 1024 : 2048, SPAN = 280;
  function mkSun(layer) {
    const l = new THREE.DirectionalLight(0xfff1dc, 3); l.castShadow = true; l.shadow.mapSize.set(SM, SM);
    const c = l.shadow.camera; c.left = c.bottom = -SPAN; c.right = c.top = SPAN; c.near = 10; c.far = 2400; c.updateProjectionMatrix();
    l.shadow.bias = -.0003; l.shadow.normalBias = .35; l.shadow.radius = 3; l.layers.set(layer); scene.add(l); scene.add(l.target); return l;
  }
  // 해를 둘로: 지금 해는 새 시설을 못 봄(그림자 없음), 개선 후 해만 새 시설 그림자(새 그늘)를 드리움. 그림자 지도는 바뀔 때만 다시 그림
  const sunL = mkSun(2), sun = mkSun(3); sun.shadow.camera.layers.enable(1);

  // ---------- 바닥: 자료로 그린 평면(숲·잔디·포장·길·물) + 나무 아래 그늘 + 잔결(디테일 텍스처) ----------
  const MG = 160, gx0 = bx0 - MG, gx1 = bx1 + MG, gy0 = by0 - MG, gy1 = by1 + MG, GW = gx1 - gx0, GH = gy1 - gy0;
  const TS = low ? 2048 : 3072, cw = GW >= GH ? TS : Math.round(TS * GW / GH), ch = GW >= GH ? Math.round(TS * GH / GW) : TS, K = cw / GW;
  function planTex() {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
    const px = p => [(p[0] - gx0) * K, (gy1 - p[1]) * K], path = ring => { ring.forEach((q, k) => { const p = px(q); k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); };
    const fillRing = (ring, col) => { x.beginPath(); path(ring); x.fillStyle = col; x.fill(); };
    let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    x.fillStyle = '#8d8b86'; x.fillRect(0, 0, cw, ch);
    for (let k = 0; k < cw * ch / 1400; k++) { x.fillStyle = rnd() > .5 ? 'rgba(60,60,58,.06)' : 'rgba(200,198,190,.05)'; const r = (2 + rnd() * 6) * K; x.fillRect(rnd() * cw, rnd() * ch, r, r); }
    x.save(); x.beginPath(); (o.rings || []).forEach(path); x.clip();
    x.fillStyle = '#6c8a45'; x.fillRect(0, 0, cw, ch);
    for (let k = 0; k < cw * ch / 500; k++) { const v = rnd(); x.fillStyle = v < .4 ? 'rgba(48,78,30,.10)' : v < .75 ? 'rgba(150,168,82,.09)' : 'rgba(120,110,62,.07)'; const r = (1.5 + rnd() * 8) * K; x.beginPath(); x.arc(rnd() * cw, rnd() * ch, r, 0, 7); x.fill(); }
    FE.filter(f => f.k === 'forest').forEach(f => fillRing(f.ring, 'rgba(70,96,46,.85)'));
    FE.filter(f => f.k === 'lawn').forEach(f => {
      fillRing(f.ring, '#7da44c');
      x.save(); x.beginPath(); path(f.ring); x.clip(); x.globalAlpha = .07; x.fillStyle = '#e8f0c0'; x.translate(cw / 2, ch / 2); x.rotate(.5); for (let k = -cw; k < cw; k += 8 * K) x.fillRect(k, -ch * 1.5, 4 * K, ch * 3); x.restore();
    });
    {   // 포장: 칸 포장비율을 작은 캔버스(1px=2m)에 그린 뒤 한 번만 부드럽게
      const sc = 2, pcv = document.createElement('canvas'); pcv.width = Math.ceil(GW / sc); pcv.height = Math.ceil(GH / sc); const y = pcv.getContext('2d');
      for (let i = 0; i < N; i++) if (B[i] > .2) { y.globalAlpha = Math.min(1, B[i] * 1.1); y.fillStyle = '#cbc4b4'; y.beginPath(); Q[i].forEach((p, k) => { const a = (CX[i] + (p[0] - CX[i]) * 1.15 - gx0) / sc, b = (gy1 - (CY[i] + (p[1] - CY[i]) * 1.15)) / sc; k ? y.lineTo(a, b) : y.moveTo(a, b); }); y.closePath(); y.fill(); }
      x.save(); x.filter = 'blur(' + Math.round(4 * K) + 'px)'; x.imageSmoothingEnabled = true; x.drawImage(pcv, 0, 0, cw, ch); x.restore();
    }
    // 나무 아래 그늘(빛이 덜 닿는 땅)
    const ao = document.createElement('canvas'); ao.width = ao.height = 64; { const a = ao.getContext('2d'), g = a.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(24,34,14,.5)'); g.addColorStop(.6, 'rgba(24,34,14,.22)'); g.addColorStop(1, 'rgba(24,34,14,0)'); a.fillStyle = g; a.fillRect(0, 0, 64, 64); }
    TL.forEach(t => { const p = px(t), r = t[2] * 1.35 * K; x.drawImage(ao, p[0] - r, p[1] - r, 2 * r, 2 * r); });
    x.lineCap = x.lineJoin = 'round';
    [[4.8, '#8f8470'], [3.6, '#d3c8ae']].forEach(([w, col]) => { x.strokeStyle = col; x.lineWidth = w * K; x.beginPath(); NE.forEach(e => { const a = px(NX[e[0]]), b = px(NX[e[1]]); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }); x.stroke(); });
    FE.filter(f => f.k === 'building').forEach(f => fillRing(f.ring, '#a9a398'));
    x.restore();
    x.strokeStyle = '#4f6a39'; x.lineWidth = 1.6 * K; x.beginPath(); (o.rings || []).forEach(path); x.stroke();
    FE.filter(f => f.k === 'water').concat(CWATER.map(r => ({ ring: r }))).forEach(f => fillRing(f.ring, '#34596a'));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return add(t);
  }
  // 잔결: r = 고운 결(5m 반복), g = 큰 얼룩
  const detail = add(canvasTex(256, 256, (x, w, h) => {
    const img = x.createImageData(w, h); let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, G = []; for (let k = 0; k < 81; k++) G.push(rnd());
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const u = i / w * 8, v = j / h * 8, a = Math.floor(u), b = Math.floor(v), fu = u - a, fv = v - b, g = (q, r) => G[(r % 8) * 9 + (q % 8)];
      const c2 = g(a, b) * (1 - fu) * (1 - fv) + g(a + 1, b) * fu * (1 - fv) + g(a, b + 1) * (1 - fu) * fv + g(a + 1, b + 1) * fu * fv, k = (j * w + i) * 4;
      img.data[k] = 120 + rnd() * 110; img.data[k + 1] = 110 + c2 * 120; img.data[k + 2] = 160; img.data[k + 3] = 255; }
    x.putImageData(img, 0, 0);
  }, false));
  const layer = (mesh, ord) => { mesh.renderOrder = ord; mesh.material.depthWrite = false; mesh.receiveShadow = true; scene.add(mesh); return mesh; };
  const outer = layer(new THREE.Mesh(add(new THREE.PlaneGeometry(20000, 20000)), std(0x8d8b86, { roughness: 1 })), -3); outer.rotation.x = -Math.PI / 2; outer.position.set((gx0 + gx1) / 2, 0, -(gy0 + gy1) / 2);
  const gmat = std(0xffffff, { map: planTex(), roughness: 1 });
  gmat.onBeforeCompile = sh => {
    sh.uniforms.uDetail = { value: detail }; sh.uniforms.uRep = { value: new THREE.Vector2(GW / 5, GH / 5) };
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform sampler2D uDetail; uniform vec2 uRep;\nvoid main() {')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= mix(1.0, texture2D(uDetail, vMapUv * uRep).r * 1.55, .32) * mix(1.0, texture2D(uDetail, vMapUv * uRep / 11.0).g * 1.55, .28);');
  };
  const ground = layer(new THREE.Mesh(add(new THREE.PlaneGeometry(GW, GH)), gmat), -2); ground.rotation.x = -Math.PI / 2; ground.position.set(gx0 + GW / 2, 0, -(gy0 + GH / 2));
  const waterMat = std(0x2b5362, { roughness: .07, metalness: 0, envMapIntensity: 1.3 });
  FE.filter(f => f.k === 'water').map(f => f.ring).concat(CWATER).forEach(r => { const m = layer(new THREE.Mesh(add(new THREE.ShapeGeometry(new THREE.Shape(r.map(p => new THREE.Vector2(p[0], p[1]))))), waterMat), -1); m.rotation.x = -Math.PI / 2; m.position.y = .02; });

  // ---------- 건물: 창이 있는 벽 + 지붕(한 덩어리로 합침) ----------
  if (city && city.buildings) {
    const facade = add(canvasTex(128, 128, (x, w, h) => {
      x.fillStyle = '#d6d2ca'; x.fillRect(0, 0, w, h); const g = x.createLinearGradient(0, 22, 0, 104); g.addColorStop(0, '#6f8494'); g.addColorStop(1, '#3c4a55');
      x.fillStyle = g; x.fillRect(14, 22, 100, 82); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(14, 22, 100, 10); x.fillStyle = '#9a968e'; x.fillRect(62, 22, 4, 82); x.fillRect(0, 118, w, 10);
    }));
    facade.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const RP = [], RC = [], WP = [], WU = [], WC = []; let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    city.buildings.forEach(b => {
      const h = b[0]; let p = pairs(b, 1); if (p.length < 3) return;
      if (p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
      const v2 = p.map(q => new THREE.Vector2(q[0], q[1])); if (THREE.ShapeUtils.isClockWise(v2)) { v2.reverse(); p = p.slice().reverse(); }
      const t = .8 + rnd() * .22, tw = [t, t * (.97 + rnd() * .05), t * (.94 + rnd() * .06)];
      THREE.ShapeUtils.triangulateShape(v2, []).forEach(tr => [tr[0], tr[2], tr[1]].forEach(k => { RP.push(p[k][0], h, -p[k][1]); RC.push(tw[0], tw[1], tw[2]); }));
      let u0 = 0;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], c = p[(i + 1) % p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]), u1 = u0 + L / 3, vh = h / 3.4;
        WP.push(a[0], 0, -a[1], c[0], 0, -c[1], c[0], h, -c[1], a[0], 0, -a[1], c[0], h, -c[1], a[0], h, -a[1]);
        WU.push(u0, 0, u1, 0, u1, vh, u0, 0, u1, vh, u0, vh); for (let k = 0; k < 6; k++) WC.push(tw[0], tw[1], tw[2]); u0 = u1;
      }
    });
    const g = add(new THREE.BufferGeometry()), nR = RP.length / 3, nW = WP.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(RP.concat(WP), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(nR * 2).fill(0).concat(WU), 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(RC.concat(WC), 3));
    g.computeVertexNormals(); g.addGroup(0, nR, 0); g.addGroup(nR, nW, 1);
    const m = new THREE.Mesh(g, [std(0x9c9ea0, { roughness: .9, vertexColors: true, side: THREE.DoubleSide }), std(0xffffff, { map: facade, roughness: .7, metalness: .05, vertexColors: true, side: THREE.DoubleSide })]);
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }

  // ---------- 나무: 종류 3 × (가까움·멂) InstancedMesh, 보는 지점 130m 안은 자세한 모양·그림자, 600m 넘으면 절반만 ----------
  let TREES = [];
  const TM = new Float32Array(Math.max(1, TL.length) * 16), TC = new Float32Array(Math.max(1, TL.length) * 3);
  { const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    TL.forEach((t, k) => { qt.setFromAxisAngle(up, t[4]); sc.setScalar(t[2] / 3); ps.set(t[0], 0, -t[1]); m4.compose(ps, qt, sc); m4.toArray(TM, k * 16);
      if (t[5] === 2) c.setHSL(.33 + t[3] * .03, .32, .2 + t[3] * .05); else if (t[5] === 1) c.setHSL(.22 + t[3] * .05, .44, .31 + t[3] * .06); else c.setHSL(.24 + t[3] * .07, .38 + t[3] * .14, .29 + t[3] * .09); c.toArray(TC, k * 3); }); }
  const TMESH = [0, 1, 2].map(kd => [0, 1].map(hi => {
    const cnt = Math.max(1, TL.filter(t => t[5] === kd).length), m = new THREE.InstancedMesh(add(treeGeo(kd, !!hi)), std(0xffffff, { roughness: .92, vertexColors: true }), cnt);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cnt * 3), 3); m.castShadow = !!hi; m.receiveShadow = !!hi; m.frustumCulled = false; m.count = 0; scene.add(m); TREES.push(m); return m;
  }));
  let lodAt = null, lodSig = ''; const lodF = new THREE.Vector3();
  function treeLOD() {
    const p = camera.position, f = controls.target; if (lodAt && lodAt.distanceTo(p) < 40 && lodF.distanceTo(f) < 30) return; lodAt = (lodAt || new THREE.Vector3()).copy(p); lodF.copy(f);
    const cnt = [[0, 0], [0, 0], [0, 0]];
    for (let k = 0; k < TL.length; k++) {
      const dx = TM[k * 16 + 12] - p.x, dz = TM[k * 16 + 14] - p.z, d2 = dx * dx + dz * dz + p.y * p.y; if (d2 > 360000 && (k & 1)) continue;
      const kd = TL[k][5], fx = TM[k * 16 + 12] - f.x, fz = TM[k * 16 + 14] - f.z, hi = fx * fx + fz * fz < 16900 ? 1 : 0, m = TMESH[kd][hi], c = cnt[kd][hi]++;
      m.instanceMatrix.array.set(TM.subarray(k * 16, k * 16 + 16), c * 16); m.instanceColor.array.set(TC.subarray(k * 3, k * 3 + 3), c * 3);
    }
    const sig = cnt.flat().join(','); if (sig === lodSig) return; lodSig = sig;
    TMESH.forEach((pr, kd) => pr.forEach((m, hi) => { m.count = cnt[kd][hi]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }));
    shadowDirty();
  }

  // 「칸 불편도」 원형 빛(기본 꺼짐)
  const glow = new THREE.InstancedMesh(add(new THREE.PlaneGeometry(34, 34)), add(new THREE.MeshBasicMaterial({ map: add(glowTex()), transparent: true, depthWrite: false, opacity: .85, toneMapped: false })), N);
  { const m4 = new THREE.Matrix4(), rx = new THREE.Matrix4().makeRotationX(-Math.PI / 2); for (let i = 0; i < N; i++) { m4.makeTranslation(CX[i], .4, -CY[i]).multiply(rx); glow.setMatrixAt(i, m4); } }
  glow.visible = false; glow.renderOrder = 2; scene.add(glow);
  function paintGlow(sc) { const c = new THREE.Color(); for (let i = 0; i < N; i++) { const v = ramp(sc[i]); c.setRGB(v[0] / 255, v[1] / 255, v[2] / 255, THREE.SRGBColorSpace); glow.setColorAt(i, c); } glow.instanceColor.needsUpdate = true; }

  // 방문객 평가 기둥(기본 숨김 — 이름표에 평가가 나옴, 눌러서 고르기는 숨겨도 됨)
  const pillarG = new THREE.Group(); scene.add(pillarG); pillarG.visible = false;
  const PCYL = add(new THREE.CylinderGeometry(3, 3, 1, 24, 1)), PRING = add(new THREE.RingGeometry(5.5, 7, 40));
  hubs.forEach(h => {
    const p = P[h.id], pct = satPct(p), col = pct == null ? 0x8a948f : pctColor(pct), Hh = p && p.n ? Math.max(4, p.n * 2.2) : 0;
    const ring = new THREE.Mesh(PRING, add(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))); ring.rotation.x = -Math.PI / 2; ring.position.set(h.x, .5, -h.y); ring.renderOrder = 1; ring.userData.hub = h.id; pillarG.add(ring);
    const m = new THREE.Mesh(PCYL, add(new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: .25, transparent: true, opacity: .55, depthWrite: false, roughness: .4 }))); m.scale.y = Math.max(4, Hh); m.position.set(h.x, Math.max(4, Hh) / 2, -h.y); m.userData.hub = h.id; pillarG.add(m);
    h.top = Hh + 4; h.pct = pct; h.n = p ? p.n : 0;
  });

  // ---------- 사람(혼잡을 눈으로): 왼쪽 = 지금 인원, 오른쪽 = 개선 후 인원 ----------
  const PMAX = 1500, BODY = add(new THREE.CylinderGeometry(.2, .15, 1.3, 7).translate(0, .65, 0)), HEAD = add(new THREE.SphereGeometry(.12, 8, 6).translate(0, 1.47, 0));
  const SKIN = std(0xd7ad8a, { roughness: .7 }), CLOTH = std(0xffffff, { roughness: .8 });
  const mkPeople = lay => { const b = new THREE.InstancedMesh(BODY, CLOTH, PMAX), h = new THREE.InstancedMesh(HEAD, SKIN, PMAX); [b, h].forEach(m => { m.layers.set(lay); m.frustumCulled = false; m.count = 0; scene.add(m); }); b.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PMAX * 3), 3); return { b, h }; };
  const PPL = { L: mkPeople(4), R: mkPeople(5) };
  const CLOTHES = ['#ece8df', '#2c3646', '#c4503f', '#3d6ea6', '#dcb04c', '#64775a', '#f4f4f2', '#262626', '#8b5c9d', '#d58b5d', '#4e8f8a', '#b9b2a5'].map(c => new THREE.Color(c));
  function scatter(side, cellsW, seed) {   // cellsW: [[cell, 무게]] — 열린 땅 넓이만큼 사람을 뿌림(물·건물 안은 뺌)
    const P2 = PPL[side], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0); let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, tot = cellsW.reduce((a, c) => a + c[1], 0) || 1; let n = 0;
    for (let tries = 0; n < PMAX && tries < PMAX * 4; tries++) {
      let r = rnd() * tot, ci = cellsW[0][0]; for (const c of cellsW) { r -= c[1]; if (r <= 0) { ci = c[0]; break; } }
      const u = rnd(), v = rnd(), Qc = Q[ci], x = (Qc[0][0] * (1 - u) + Qc[1][0] * u) * (1 - v) + (Qc[3][0] * (1 - u) + Qc[2][0] * u) * v, y = (Qc[0][1] * (1 - u) + Qc[1][1] * u) * (1 - v) + (Qc[3][1] * (1 - u) + Qc[2][1] * u) * v;
      if (!okPt(x, y)) continue;
      q.setFromAxisAngle(up, rnd() * 6.28); sc.setScalar(.9 + rnd() * .2); ps.set(x, .02, -y); m4.compose(ps, q, sc); P2.b.setMatrixAt(n, m4); P2.h.setMatrixAt(n, m4); P2.b.setColorAt(n, CLOTHES[Math.floor(rnd() * CLOTHES.length)]); n++;
    }
    P2.b.instanceMatrix.needsUpdate = P2.h.instanceMatrix.needsUpdate = P2.b.instanceColor.needsUpdate = true; P2.max = n;
  }
  function setCount(side, n) { const P2 = PPL[side]; P2.b.count = P2.h.count = Math.min(P2.max || 0, Math.round(n)); }

  // ---------- 시설 모형 ----------
  const plank = add(canvasTex(128, 128, (x, w, h) => { for (let i = 0; i < 8; i++) { const l = 52 + (i * 37 % 11); x.fillStyle = 'hsl(28,' + (38 + i % 3 * 4) + '%,' + l + '%)'; x.fillRect(0, i * 16, w, 15); x.fillStyle = 'rgba(40,24,10,.5)'; x.fillRect(0, i * 16 + 15, w, 1); x.fillRect((i * 53) % w, i * 16, 1, 15); } }));
  plank.repeat.set(1 / 2.4, 1 / 2.4);
  const MT = { wood: std(0x9b6b43, { roughness: .7 }), metal: std(0x4f5457, { metalness: .6, roughness: .4 }), steel: std(0xc9cdd0, { metalness: .7, roughness: .35 }), fabric: std(0xf3f0e8, { side: THREE.DoubleSide, roughness: .9 }),
    concrete: std(0xbab4a8, { roughness: .95 }), deck: std(0xffffff, { map: plank, roughness: .8 }), lawn: std(0x6e9f45, { roughness: 1 }), white: std(0xeceae4), dark: std(0x3b3f42), soil: std(0x5b4636, { roughness: 1 }),
    red: std(0xd34d4d), yellow: std(0xf0c24b), purple: std(0x9c6ad0), pink: std(0xf08ab4), screen: std(0x111518, { emissive: 0x2fd39a, emissiveIntensity: .9 }) };
  const TREE_HI = add(treeGeo(0, true)), TREE_MAT = std(new THREE.Color().setHSL(.27, .42, .33), { roughness: .92, vertexColors: true });
  const BOX = add(new THREE.BoxGeometry(1, 1, 1)), CYL = add(new THREE.CylinderGeometry(1, 1, 1, 12)), SPH = add(new THREE.SphereGeometry(1, 10, 8)), TOR = add(new THREE.TorusGeometry(1, .07, 8, 32)), SAIL = add(sailGeo());
  function pt(g, m, sx, sy, sz, x, y, zz, ry) { const k = new THREE.Mesh(g, m); k.scale.set(sx, sy, sz); k.position.set(x, y, zz); if (ry) k.rotation.y = ry; k.castShadow = k.receiveShadow = true; return k; }
  function bench(g, x, z, ry) { const b = new THREE.Group(); for (let i = 0; i < 4; i++) b.add(pt(BOX, MT.wood, 1.8, .04, .09, 0, .44, -.17 + i * .11)); for (let i = 0; i < 3; i++) b.add(pt(BOX, MT.wood, 1.8, .08, .03, 0, .58 + i * .11, -.24)); [-.75, .75].forEach(e => b.add(pt(BOX, MT.metal, .06, .44, .46, e, .22, 0), pt(BOX, MT.metal, .06, .36, .04, e, .62, -.25))); b.position.set(x, 0, z); b.rotation.y = ry || 0; g.add(b); }
  function model(k, t) {
    const g = new THREE.Group(), a = (...p) => p.forEach(x => g.add(x));
    if (k === 'bench') { bench(g, -1.2, 0, 0); bench(g, 1.2, 0, 0); }
    if (k === 'sail') { [[-4.15, -4.15, 5], [4.15, -4.15, 3.8], [-4.15, 4.15, 3.8], [4.15, 4.15, 5]].forEach(([x, z, h]) => a(pt(CYL, MT.steel, .09, h, .09, x, h / 2, z))); const m = new THREE.Mesh(SAIL, MT.fabric); m.castShadow = m.receiveShadow = true; a(m); bench(g, -1.6, 1.2, 0); bench(g, 1.6, -1.2, Math.PI); }
    if (k === 'tree') { const m = new THREE.Mesh(TREE_HI, TREE_MAT); m.scale.setScalar(1.08); m.castShadow = m.receiveShadow = true; a(m, pt(BOX, MT.metal, 1.6, .05, 1.6, 0, .03, 0)); }
    if (k === 'sign') { a(pt(BOX, MT.dark, .14, 2.3, .14, 0, 1.15, 0), pt(BOX, MT.dark, 1.5, 1, .14, 0, 2.05, 0)); const sc = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0x0c1012, emissive: 0xffffff, emissiveMap: signTex(t), emissiveIntensity: 1.1 })); sc.scale.set(1.36, .86, .02); sc.position.set(0, 2.05, .08); a(sc); }
    if (k === 'toilet') a(pt(BOX, MT.white, 4, 2.8, 2.6, 0, 1.4, 0), pt(BOX, MT.dark, 4.6, .18, 3.2, 0, 2.9, 0), pt(BOX, MT.wood, .9, 2, .05, -.8, 1, 1.31), pt(BOX, MT.wood, .9, 2, .05, .8, 1, 1.31));
    if (k === 'garden') { a(pt(BOX, MT.concrete, 7, .45, 3.4, 0, .22, 0), pt(BOX, MT.soil, 6.6, .1, 3, 0, .46, 0)); let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 46; i++) a(pt(SPH, [MT.red, MT.yellow, MT.purple, MT.pink, MT.white][i % 5], .2, .2, .2, (r() - .5) * 6.2, .6 + r() * .15, (r() - .5) * 2.7)); }
    if (k === 'photo') { const t2 = new THREE.Mesh(TOR, MT.yellow); t2.scale.setScalar(1.3); t2.position.y = 1.5; t2.castShadow = true; a(t2, pt(BOX, MT.concrete, 2.4, .12, 1.4, 0, .06, 0)); }
    return g;
  }
  function signTex(t) { return add(canvasTex(256, 160, (x, w, h) => { x.fillStyle = '#0c1714'; x.fillRect(0, 0, w, h); x.fillStyle = '#6af5b0'; x.font = '700 26px Pretendard Variable, sans-serif'; x.fillText('실시간 혼잡 안내', 16, 42); x.fillStyle = '#f1f7f3'; x.font = '600 22px Pretendard Variable, sans-serif'; x.fillText('여기 붐빔 → ', 16, 86); x.fillStyle = '#6af5b0'; x.fillText((t && t.to ? t.to.name : '').slice(0, 9), 16, 122); x.fillStyle = '#f1f7f3'; x.font = '500 18px Pretendard Variable, sans-serif'; x.fillText(t && t.to ? '여유 · 걸어서 ' + Math.max(1, Math.round(t.len / 70)) + '분' : '', 16, 150); })); }
  function yardMesh(y) {
    const i = y.cell, q = Q[i].map(p => [CX[i] + (p[0] - CX[i]) * .97, CY[i] + (p[1] - CY[i]) * .97]), g = new THREE.Group();
    const s = new THREE.Mesh(add(new THREE.ShapeGeometry(new THREE.Shape(q.map(p => new THREE.Vector2(p[0], p[1]))))), y.surf === 'deck' ? MT.deck : MT.lawn); s.rotation.x = -Math.PI / 2; s.position.y = y.surf === 'deck' ? .14 : .05; s.receiveShadow = true; g.add(s);
    // 가장자리 앉음벽 두 변 + 가운데 벤치
    [[0, 1], [1, 2]].forEach(([a2, b2]) => { const A2 = q[a2], B2 = q[b2], L = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]), ang = Math.atan2(B2[1] - A2[1], B2[0] - A2[0]); const w = pt(BOX, MT.concrete, L * .82, .45, .5, (A2[0] + B2[0]) / 2, .22, -(A2[1] + B2[1]) / 2, -ang); w.position.x += Math.sin(ang) * .0; g.add(w); });
    bench(g, CX[i] - 3, -CY[i] + 2, 0); bench(g, CX[i] + 3, -CY[i] - 2, Math.PI);
    return g;
  }
  const HALO_G = add(new THREE.PlaneGeometry(1, 1));
  function haloMesh(x, y, w, h, rot) {
    const K2 = 10, c = document.createElement('canvas'); c.width = Math.round(w * K2); c.height = Math.round(h * K2);
    const g = c.getContext('2d'), m = 1.4 * K2; g.fillStyle = 'rgba(106,245,176,.08)'; g.strokeStyle = 'rgba(106,245,176,.95)'; g.lineWidth = .45 * K2; g.shadowColor = 'rgba(106,245,176,.95)'; g.shadowBlur = 1.2 * K2;
    g.beginPath(); g.roundRect(m, m, c.width - 2 * m, c.height - 2 * m, 2 * K2); g.fill(); g.stroke(); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const me = new THREE.Mesh(HALO_G, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: .85, toneMapped: false }));
    me.scale.set(w, h, 1); me.rotation.order = 'YXZ'; me.rotation.set(-Math.PI / 2, rot || 0, 0); me.position.set(x, .2, -y); me.renderOrder = 5; me.userData.own = true; return me;
  }
  const itemsG = new THREE.Group(); scene.add(itemsG);

  // ---------- 그늘(햇빛 광선 4×4) ----------
  const SMP = []; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) SMP.push([(a + .5) / 4, (b + .5) / 4]);
  const SPX = new Float64Array(N * 16), SPY = new Float64Array(N * 16);
  for (let i = 0; i < N; i++) { const q = Q[i]; SMP.forEach(([u, v], s) => { SPX[i * 16 + s] = (q[0][0] * (1 - u) + q[1][0] * u) * (1 - v) + (q[3][0] * (1 - u) + q[2][0] * u) * v; SPY[i * 16 + s] = (q[0][1] * (1 - u) + q[1][1] * u) * (1 - v) + (q[3][1] * (1 - u) + q[2][1] * u) * v; }); }
  const cs = t => { if (t.c == null) { t.c = Math.cos(t.rot); t.s = Math.sin(t.rot); } };
  function hitObj(t, px, py, sd) {
    if (t.k === 'tree') { const ox = px - t.x, oy = py - t.y, oz = -5.6, bb = ox * sd.x + oy * sd.y + oz * sd.z, cc = ox * ox + oy * oy + oz * oz - 20.25, ds = bb * bb - cc; return ds >= 0 && -bb - Math.sqrt(ds) > 0; }
    const rf = FAC[t.k].roof, k = rf.h / sd.z, dx = px + sd.x * k - t.x, dy = py + sd.y * k - t.y; cs(t); const lx = dx * t.c + dy * t.s, ly = -dx * t.s + dy * t.c; return Math.abs(lx) <= rf.hx && Math.abs(ly) <= rf.hy;
  }
  function maskOf(t, i, sd) { if (sd.z <= .035) return 0; const L = Math.min(160, (t.k === 'tree' ? 10 : FAC[t.k].roof.h) * Math.hypot(sd.x, sd.y) / sd.z); if (Math.hypot(CX[i] - t.x, CY[i] - t.y) > L + 22) return 0; let m = 0; for (let s = 0; s < 16; s++) if (hitObj(t, SPX[i * 16 + s], SPY[i * 16 + s], sd)) m |= 1 << s; return m; }
  function shareAt(stay, cast, sd) { if (!stay.length) return 0; let s = 0; for (const i of stay) { let m = 0; for (const t of cast) m |= maskOf(t, i, sd); s += Math.min(1, TR[i] + POP[m] / 16 * (1 - TR[i])); } return s / stay.length; }
  // 팀 칸 점수로 주변 환경(80m) — 빈 개선안이면 index.html envScore와 같음
  function envEval(cells, md, sds) {
    let sum = 0, sh = 0, re = 0, dl = 0, far = 0; const sc = new Float64Array(cells.length);
    cells.forEach((i, j) => {
      const trees = md.tc.get(i) || 0, Tn = Math.min(1, TR[i] + trees * CANOPY_M2 / CELL_M2), Bn = md.lawn.has(i) ? 0 : B[i], a = A[i] + K_TREE * (Tn - TR[i]) + K_PAVE * (Bn - B[i]);
      let dr = R[i]; for (const p of md.rests) { const d = Math.hypot(CX[i] - p[0], CY[i] - p[1]); if (d < dr) dr = d; }
      let s = 0, ss = 0; for (const sd of sds) { let m = 0; for (const t of md.cast) m |= maskOf(t, i, sd); const v = Math.min(1, Tn + POP[m] / 16 * (1 - Tn)); ss += v; s += S0[i] + formula(i, a, v, dr, CR[i]) - F0[i]; }
      s /= sds.length; sc[j] = s; sum += s; sh += ss / sds.length; re += dr; dl += a - A[i]; if (dr > 150) far++;
    });
    const n = cells.length; return { env: clamp(100 - (sum / n - 10) * 1.25, 20, 98), sc, shade: sh / n, rest: re / n, dLst: dl / n, far, n };
  }
  const EMPTY = { tc: new Map(), lawn: new Set(), rests: [], cast: [] };

  // ---------- 길(분산 동선) ----------
  const ADJ = NX.map(() => []); NE.forEach(e => { const d = Math.hypot(NX[e[0]][0] - NX[e[1]][0], NX[e[0]][1] - NX[e[1]][1]); ADJ[e[0]].push([e[1], d]); ADJ[e[1]].push([e[0], d]); });
  const nearNode = (x, y) => { let b = -1, bd = 1e18; NX.forEach((p, k) => { if (!ADJ[k].length) return; const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; b = k; } }); return b; };
  function route(a, b) {
    const straight = { pts: [[a.x, a.y], [b.x, b.y]], len: Math.hypot(a.x - b.x, a.y - b.y) }, s = nearNode(a.x, a.y), t = nearNode(b.x, b.y); if (s < 0 || t < 0) return straight;
    const dist = new Float64Array(NX.length).fill(Infinity), prev = new Int32Array(NX.length).fill(-1), done = new Uint8Array(NX.length), hp = [[0, s]]; dist[s] = 0;
    const push = v => { hp.push(v); let i = hp.length - 1; while (i) { const p = (i - 1) >> 1; if (hp[p][0] <= hp[i][0]) break; [hp[p], hp[i]] = [hp[i], hp[p]]; i = p; } };
    const pop = () => { const top = hp[0], e = hp.pop(); if (hp.length) { hp[0] = e; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hp.length && hp[l][0] < hp[m][0]) m = l; if (r < hp.length && hp[r][0] < hp[m][0]) m = r; if (m === i) break; [hp[m], hp[i]] = [hp[i], hp[m]]; i = m; } } return top; };
    while (hp.length) { const [d, u] = pop(); if (done[u]) continue; done[u] = 1; if (u === t) break; for (const [v, w] of ADJ[u]) { const nd = d + w; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]); } } }
    if (!isFinite(dist[t])) return straight;
    const pts = []; for (let u = t; u >= 0; u = prev[u]) pts.push(NX[u]); pts.reverse();
    return { pts: [[a.x, a.y]].concat(pts, [[b.x, b.y]]), len: dist[t] + Math.hypot(a.x - NX[s][0], a.y - NX[s][1]) + Math.hypot(b.x - NX[t][0], b.y - NX[t][1]) };
  }
  function nearEdge(x, y) {
    let bd = 1e9, ang = 0, nx = 0, ny = 0;
    for (const e of NE) { const a = NX[e[0]], b = NX[e[1]], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2)), px = a[0] + vx * t, py = a[1] + vy * t, d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; ang = Math.atan2(vy, vx); nx = x - px; ny = y - py; } }
    return { d: bd, ang, nx, ny };
  }
  const offPath = (x, y, want) => { const ed = NE.length ? nearEdge(x, y) : { d: 99, ang: 0, nx: 0, ny: 0 }; if (ed.d < want) { const l = Math.hypot(ed.nx, ed.ny), ux = l > .01 ? ed.nx / l : -Math.sin(ed.ang), uy = l > .01 ? ed.ny / l : Math.cos(ed.ang); x += ux * (want - ed.d); y += uy * (want - ed.d); } return { x, y, rot: ed.ang }; };
  const near = (h, R0) => { const out = []; for (let i = 0; i < N; i++) if (Math.hypot(CX[i] - h.x, CY[i] - h.y) < R0) out.push(i); return out; };
  const cellAt = (x, y) => { let b = -1, bd = 1e18; for (let i = 0; i < N; i++) { const d = (CX[i] - x) ** 2 + (CY[i] - y) ** 2; if (d < bd) { bd = d; b = i; } } return bd < 225 ? b : -1; };
  const dirOf = (h, x, y) => { const d = Math.hypot(x - h.x, y - h.y); return d < 8 ? '거점 바로 옆' : '거점 ' + DIR8[Math.round(((Math.atan2(x - h.x, y - h.y) * 180 / Math.PI) + 360) % 360 / 45) % 8] + '쪽 ' + Math.round(d) + 'm'; };

  // ---------- 개선안(공간 패키지) ----------
  const SDH = OPT_HRS.map(hr => sunDir(hr, SCN.heat.doy));
  const plans = {};
  let curV = 'B';
  const pk = (h, v) => h.id + '|' + (v || curV);
  function buildPlan(h, v) {
    const V = VARS[v] || VARS.B;
    let cells = near(h, ENV_R); if (!cells.length) cells = near(h, 150); if (!cells.length) return null;
    let stay0 = near(h, STAY_R).filter(i => !blocked[i]); if (!stay0.length) { const c = cells.filter(i => !blocked[i]).sort((a, b) => Math.hypot(CX[a] - h.x, CY[a] - h.y) - Math.hypot(CX[b] - h.x, CY[b] - h.y))[0]; if (c == null) return null; stay0 = [c]; }
    const openOf = i => Math.max(40, (1 - TR[i]) * CELL_M2), open0 = stay0.reduce((s, i) => s + openOf(i), 0);
    const ppl14 = demand(h, SCN.crowd, 14, 0) * h.cap, r14 = h.cap ? ppl14 / h.cap : 0;
    const evC = hubEv(h.id).find(e => e.key === 'crowded'), proven = !!(evC && evC.park.v === 'yes');
    const crowdOn = h.cap > 0 && (r14 > CROWD_CUT || (proven && evC.n >= 2 && r14 > NB_FREE));
    let shift = null, added = 0; const yards = [];
    if (crowdOn) {
      // ① 분산: 450m 안, 같은 시각 혼잡률 55% 이하인 거점으로 실시간 안내
      const nb = hubs.filter(g => g !== h && g.cap > 0).map(g => ({ g, r: demand(g, SCN.crowd, 14, 0), d: Math.hypot(g.x - h.x, g.y - h.y) })).filter(q => q.d < NB_R && q.r <= NB_FREE).sort((a, b) => a.r - b.r || a.d - b.d)[0];
      if (nb) { const n = Math.min(SHIFT * ppl14, (CROWD_CUT - nb.r) * nb.g.cap); if (n >= 5) { const rt = route(h, nb.g); shift = { to: nb.g, n, share: n / ppl14, rTo: nb.r, rTo1: nb.r + n / nb.g.cap, len: rt.len, pts: rt.pts }; } }
      // ② 쉼터 넓히기: 지금 이곳 수용 밀도 그대로, 붙어 있는 칸(숲 제외)을 데크·잔디 쉼터로
      const need = (ppl14 - (shift ? shift.n : 0)) / CROWD_CUT - h.cap;
      if (need > 0 && h.type !== 'indoor' && V.yard) {
        const dens = h.cap / open0, used = new Set(stay0), pool = near(h, 110).filter(i => !blocked[i] && !used.has(i) && TR[i] < .55);
        while (added < need && yards.length < MAX_YARD) {
          let best = null;
          for (const i of pool) { if (used.has(i)) continue; let adj = false; for (const u of used) if (Math.hypot(CX[i] - CX[u], CY[i] - CY[u]) < 21) { adj = true; break; } if (!adj) continue;
            const sc = B[i] + .6 * (1 - TR[i]) - Math.hypot(CX[i] - h.x, CY[i] - h.y) / 200; if (!best || sc > best.sc) best = { i, sc }; }
          if (!best) break; const cap = dens * CELL_M2 * YARD_USE;
          yards.push({ k: 'yard', cell: best.i, x: CX[best.i], y: CY[best.i], surf: !V.lawn && B[best.i] >= .35 ? 'deck' : 'lawn', cap, B: B[best.i], T: TR[best.i] }); added += cap; used.add(best.i);
        }
      }
    }
    const stay = stay0.concat(yards.map(y => y.cell));
    // ③ 그늘: 야외 거점만 — 더운 날 14시 머무는 곳 그늘 50%까지, 10~16시 평균으로 가장 효과 큰 자리부터
    const shade = [], sd14 = sunDir(14, SCN.heat.doy), target = Math.max(SHADE_TARGET, shareAt(stay0, [], sd14));
    if (h.type === 'outdoor') {
      const useSail = V.kinds.includes('sail'), useTree = V.kinds.includes('tree'), TOFF = useSail ? [[-6, -6], [6, 6], [-6, 6]] : [[-6, -6], [6, 6], [-6, 6], [6, -6]];
      const C = []; stay.forEach(i => { if (TR[i] >= .7) return; const p = offPath(CX[i], CY[i], 6); if (useSail) C.push({ k: 'sail', x: p.x, y: p.y, rot: p.rot, cell: i }); if (useTree) TOFF.forEach(([ox, oy]) => { const q = offPath(CX[i] + ox, CY[i] + oy, 4); C.push({ k: 'tree', x: q.x, y: q.y, rot: 0, cell: i }); }); });
      const CC = C.filter(t => okPt(t.x, t.y)), NS = stay.length, NH = SDH.length;
      CC.forEach(t => { t.mk = new Uint16Array(NS * NH); stay.forEach((i, j) => SDH.forEach((sd, k) => { t.mk[j * NH + k] = maskOf(t, i, sd); })); });
      const cur = new Uint16Array(NS * NH), mean = mk => { let s = 0; for (let j = 0; j < NS; j++) { const i = stay[j]; for (let k = 0; k < NH; k++) s += Math.min(1, TR[i] + POP[mk[j * NH + k]] / 16 * (1 - TR[i])); } return s / (NS * NH); };
      let base = mean(cur);
      while (shade.length < (useSail ? MAX_SHADE : MAX_SHADE * 2) + 2 * yards.length && shareAt(stay, shade, sd14) < target) {
        let best = null;
        for (const t of CC) { if (t.used || shade.some(u => Math.hypot(u.x - t.x, u.y - t.y) < (t.k === 'sail' || u.k === 'sail' ? 9 : 7))) continue;
          const tmp = new Uint16Array(cur.length); for (let q = 0; q < cur.length; q++) tmp[q] = cur[q] | t.mk[q]; const v = mean(tmp) - base; if (!best || v > best.v) best = { t, v, tmp }; }
        if (!best || best.v < .004) break; best.t.used = true; best.t.gain = best.v; shade.push(best.t); cur.set(best.tmp); base += best.v;
      }
    }
    // ④ 쉴 곳: 넓힌 쉼터가 없고 쉴 곳이 먼 경우만 벤치
    const benches = [], rest0 = stay0.reduce((s, i) => s + R[i], 0) / stay0.length;
    if (!yards.length && rest0 > 60) stay0.slice().sort((a, b) => R[b] - R[a]).slice(0, 2).forEach(i => { const p = offPath(CX[i], CY[i], 3.5); if (okPt(p.x, p.y)) benches.push({ k: 'bench', x: p.x, y: p.y, rot: p.rot, cell: i }); });
    // ⑤ 점수 밖: 방문객 아쉬운 이유에 맞춰
    const rs = (P[h.id] || {}).reasons || {}, extra = [], taken = new Set(yards.map(y => y.cell).concat(shade.map(t => t.cell)));
    const freeCell = pref => { const c = stay.filter(i => !taken.has(i)).sort((a, b) => pref(b) - pref(a))[0]; if (c != null) taken.add(c); return c; };
    const put = (k, cell, why) => { if (cell == null || !V.extra.includes(k)) return; const p = offPath(CX[cell], CY[cell], 5); if (okPt(p.x, p.y)) extra.push({ k, x: p.x, y: p.y, rot: p.rot, cell, why }); };
    if (rs.boring) { put('garden', freeCell(i => B[i]), '「' + BAD.boring + '」 ' + rs.boring + '건'); put('photo', freeCell(i => B[i]), '「' + BAD.boring + '」 ' + rs.boring + '건'); }
    if ((rs.far || rs.facility) && stay.some(i => DT[i] > TOILET_M)) put('toilet', freeCell(i => DT[i]), '화장실 250m 밖 · 「' + (rs.facility ? BAD.facility : BAD.far) + '」 ' + (rs.facility || rs.far) + '건');
    // 환경(80m): 그늘나무 = 칸 수관 +16%p, 잔디 쉼터 = 포장 0, 쉼터·그늘막·벤치 = 쉴 곳
    const tc = new Map(); shade.filter(t => t.k === 'tree').forEach(t => { const c = cellAt(t.x, t.y); if (c >= 0) tc.set(c, (tc.get(c) || 0) + 1); });
    const md = { tc, lawn: new Set(yards.filter(y => y.surf === 'lawn').map(y => y.cell)), rests: yards.map(y => [y.x, y.y]).concat(shade.filter(t => t.k === 'sail').map(t => [t.x, t.y]), benches.map(t => [t.x, t.y])), cast: shade };
    const eb = envEval(cells, EMPTY, SDH), ea = envEval(cells, md, SDH), env1 = clamp(h.env0 + ea.env - eb.env, 20, 98);
    // 번호 묶음(3D 번호와 같음)
    const G = [], cen = L => [L.reduce((s, t) => s + t.x, 0) / L.length, L.reduce((s, t) => s + t.y, 0) / L.length];
    if (yards.length) G.push({ k: 'yard', items: yards, at: cen(yards), z: 1.5 });
    if (shift) { const d0 = shift.pts[1] || [shift.to.x, shift.to.y], l = Math.hypot(d0[0] - h.x, d0[1] - h.y) || 1, p = offPath(h.x + (d0[0] - h.x) / l * 9, h.y + (d0[1] - h.y) / l * 9, 3); shift.sign = { k: 'sign', x: p.x, y: p.y, rot: Math.atan2(d0[1] - h.y, d0[0] - h.x) - Math.PI / 2, to: shift.to, len: shift.len }; G.push({ k: 'sign', items: [shift.sign], at: [p.x, p.y], z: 3.4 }); }
    const sails = shade.filter(t => t.k === 'sail'), trees = shade.filter(t => t.k === 'tree');
    if (sails.length) G.push({ k: 'sail', items: sails, at: cen(sails), z: 5.5 });
    if (trees.length) G.push({ k: 'tree', items: trees, at: cen(trees), z: 10 });
    if (benches.length) G.push({ k: 'bench', items: benches, at: cen(benches), z: 1.6 });
    extra.forEach(t => G.push({ k: t.k, items: [t], at: [t.x, t.y], z: 3 }));
    const pl = { v: V.key, h, cells, stay0, stay, open0, added, yards, shift, shade, benches, extra, G, crowdOn, proven, r14, md, env0: h.env0, env1, cmp: { b: eb, a: ea } };
    pl.d14 = { crowd: evalHub(pl, SCN.crowd, 14), heat: evalHub(pl, SCN.heat, 14) };
    return pl;
  }
  // 한 상황·시각에서 지금 vs 개선 후
  function evalHub(pl, sc, hr) {
    const h = pl.h, sd = sunDir(hr, sc.doy), s0 = shareAt(pl.stay0, [], sd), s1 = shareAt(pl.stay, pl.shade, sd);
    const p0 = demand(h, sc, hr, s0) * h.cap, p1 = demand(h, sc, hr, s1) * h.cap * (1 - (pl.shift ? pl.shift.share : 0)), cap1 = h.cap + pl.added;
    const r0 = h.cap ? p0 / h.cap : 0, r1 = cap1 ? p1 / cap1 : 0, b = satOf(r0, wxS(h.type, sc.w, s0), pl.env0), a = satOf(r1, wxS(h.type, sc.w, s1), pl.env1);
    return { b: Object.assign(b, { ratio: r0, ppl: p0, s: s0, cap: h.cap }), a: Object.assign(a, { ratio: r1, ppl: p1, s: s1, cap: cap1 }) };
  }
  const planFor = (h, v) => { const k = pk(h, v); return (k in plans) ? plans[k] : (plans[k] = buildPlan(h, v || curV)); };
  // 사업비: 수량(개선안에서 셈) × 단가(가정값, 화면에서 바꿈)
  function costOf(pl) {
    const rows = [], put = (k, q) => { if (q > 0) rows.push({ k, label: COST[k].label, unit: COST[k].unit, q, p: COST[k].p, sum: q * COST[k].p }); };
    if (pl.shift) put('sign', 1);
    put('sail', pl.shade.filter(t => t.k === 'sail').length); put('tree', pl.shade.filter(t => t.k === 'tree').length);
    put('bench', pl.benches.length * 2);
    put('deck', pl.yards.filter(y => y.surf === 'deck').length * CELL_M2); put('lawn', pl.yards.filter(y => y.surf === 'lawn').length * CELL_M2);
    pl.extra.forEach(t => put(t.k, 1));
    return { rows, total: rows.reduce((s, r) => s + r.sum, 0) };
  }
  // 세 안 비교 한 줄씩(지금 시각 기준). 순위·추천은 붙이지 않음 — 고르는 것은 구청
  function abcRows(h) {
    return VK.map(v => {
      const pl = plans[pk(h, v)]; if (pl === undefined) return { v, wait: true }; if (!pl) return { v, none: true };
      const E = evalNow(pl), c = costOf(pl), dC = E.crowd.a.raw - E.crowd.b.raw, dH = E.heat.a.raw - E.heat.b.raw;
      return { v, pl, c, E, dC, dH, dE: pl.env1 - pl.env0, tags: [] };
    });
  }
  let allBusy = false;
  function ensureAll(h) {
    if (allBusy) return; const v = VK.find(k => !(pk(h, k) in plans)); if (!v) return;
    allBusy = true; setTimeout(() => { planFor(h, v); allBusy = false; if (sel === h) { panelHTML(); ensureAll(h); } }, 40);
  }
  const baseSat = (h, sc, hr) => satOf(h.cap ? demand(h, sc, hr, 0) : 0, wxS(h.type, sc.w, 0), h.env0).raw;

  // ---------- 상태 ----------
  let hour = o.hour >= 7 && o.hour <= 19 ? o.hour : 14, scn = SCN.crowd, items = [], last = null;
  const hubOf = id => hubs.find(h => h.id === id);
  let sel = hubOf(o.hub.id) || hubs[0];
  if (o.auto) { const lo = hubs.filter(h => h.n >= 5).sort((a, b) => a.pct - b.pct)[0]; if (lo) sel = lo; }
  // 구청 검토 모드(?review=거점id 링크로 열림): 세 안을 나란히 보여 주고 구청이 하나씩 눌러 보며 고름. 관리자용 목록·가정 설정은 숨김
  const REVIEW = !!o.review; if (REVIEW) curV = 'A';
  let picked = null;
  if (REVIEW && o.onHub) o.onHub(sel.id);   // 주소(?review=)를 실제로 보여 주는 거점으로 맞춤   // 구청 검토: 누른 안(없으면 세 안 목록 + 「지금」 한 화면)

  // ---------- 해 ----------
  const ctr = new THREE.Vector3();
  function placeSun(env) {
    const sd = sunDir(hour, scn.doy), v = new THREE.Vector3(sd.x, Math.max(.02, sd.z), -sd.y).normalize(), k = clamp01(sd.alt / 25);
    SU.sunPosition.value.copy(v);
    [sunL, sun].forEach(l => { l.target.position.copy(ctr); l.position.copy(ctr).addScaledVector(v, 1200); l.target.updateMatrixWorld(); l.intensity = sd.alt <= 0 ? 0 : .9 + 1.7 * k; l.color.setHSL(.09, .6 - .45 * k, .62 + .3 * k); });
    if (env) updateEnv();
    shadowDirty();
  }

  // ---------- 카메라 ----------
  const controls = new OrbitControls(camera, cvs);
  controls.maxPolarAngle = 1.4; controls.minDistance = 18; controls.maxDistance = 2600; controls.screenSpacePanning = false; controls.enableDamping = true; controls.dampingFactor = .12;
  let dirty = true, fly = null, labDirty = true, shL = true, shR = true;
  function shadowDirty() { shL = shR = true; dirty = true; }
  controls.addEventListener('end', () => treeLOD());
  controls.addEventListener('change', () => { dirty = labDirty = true; if (controls.target.distanceTo(ctr) > 140) { ctr.copy(controls.target); placeSun(false); } });
  const above = h => ({ t: new THREE.Vector3(h.x, 0, -h.y), p: new THREE.Vector3(h.x, 1300, -h.y + 1) });
  function planView(h) {
    const pl = plans[pk(h)], pts = [[h.x, h.y]]; if (pl) pl.G.forEach(g => g.items.forEach(t => pts.push([t.x, t.y])));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const Rr = Math.max(30, ...pts.map(q => Math.hypot(q[0] - cx, q[1] - cy))) + 10, v = views[views.length - 1], dir = new THREE.Vector3(-110, 105, 170).normalize();
    let d = 200;
    if (v) { const fh = v.cam.view ? v.cam.view.fullHeight : v.h, f = fh / 2 / Math.tan(v.cam.fov * Math.PI / 360), wv = v.vis.x1 - v.vis.x0, hv = v.vis.y1 - v.vis.y0; d = Math.min(650, Math.max(d, Rr * f / (.5 * Math.min(wv, hv * 1.25)))); }
    return { t: new THREE.Vector3(cx, 0, -cy), p: new THREE.Vector3(cx, 0, -cy).addScaledVector(dir, d) };
  }
  function flyTo(to, dur, done) { fly = { a: { t: controls.target.clone(), p: camera.position.clone() }, b: to, t0: performance.now(), dur, done }; controls.enabled = false; }
  { const s = above(sel); camera.position.copy(s.p); controls.target.copy(s.t); camera.lookAt(s.t); ctr.copy(s.t); }

  // ---------- 덧씌운 화면 ----------
  const ui = document.createElement('div'); ui.className = 'tw-ui'; root.appendChild(ui);
  if (REVIEW) root.classList.add('tw-review');
  ui.innerHTML = REVIEW ?
    '<header class="tw-top tw-g"><button type="button" class="tw-home" data-t="exit">← 만족도 화면</button><b>디지털트윈 개선안</b><span class="tw-tag gov">구청 검토용</span><span class="tw-hubchip"></span>' + (rat.demo ? '<span class="tw-demo">시연용 가상 평가</span>' : '') +
    '<span class="tw-sp"></span><span class="tw-vsw" role="group" aria-label="개선안 고르기"></span><span class="tw-seg tw-scn" role="group" aria-label="상황"><button type="button" data-t="crowd" aria-pressed="true">붐비는 날</button><button type="button" data-t="heat" aria-pressed="false">더운 날</button></span>' +
    '<button type="button" data-t="hq" aria-pressed="false" title="카메라가 멈추면 틈 그늘(GTAO)을 더해 한 번 더 그려요">고화질</button><span class="tw-q" hidden></span>' +
    '<button type="button" class="tw-exit" data-t="report">검토 자료 인쇄</button></header>' +
    '<aside class="tw-pop tw-g" role="dialog" aria-label="개선안 자세히" hidden></aside>' +
    '<div class="tw-time tw-g"><div class="t"><span class="tw-day"></span><b class="tw-hr">—</b><small class="tw-sun"></small></div><input class="tw-range" type="range" min="7" max="19" step="0.25" aria-label="시각"><div class="tw-ticks">' + [7, 10, 13, 16, 19].map(h => '<span>' + h + '시</span>').join('') + '</div></div>' +
    '<div class="tw-split"><i class="tw-div"></i><b class="tw-vl" data-s="L">지금</b><b class="tw-vl" data-s="R">개선 후</b><div class="tw-vs" data-s="L"></div><div class="tw-vs" data-s="R"></div></div>' +
    '<div class="tw-labs"></div><div class="tw-nums"></div><div class="tw-fps" hidden></div><div class="tw-report" hidden></div>'
    :
    '<header class="tw-top tw-g"><b>디지털트윈 개선 시뮬레이션</b><span class="tw-tag">관리자</span>' + (rat.demo ? '<span class="tw-demo">시연용 가상 평가</span>' : '') +
    '<span class="tw-sp"></span><span class="tw-seg tw-scn" role="group" aria-label="상황"><button type="button" data-t="crowd" aria-pressed="true">붐비는 날</button><button type="button" data-t="heat" aria-pressed="false">더운 날</button></span>' +
    '<span class="tw-seg" role="group" aria-label="보기 방식"><button type="button" data-t="one" aria-pressed="false">한 화면</button><button type="button" data-t="split" aria-pressed="true">나눠 보기</button></span>' +
    '<button type="button" data-t="glow" aria-pressed="false">칸 불편도</button><button type="button" data-t="hq" aria-pressed="false" title="카메라가 멈추면 틈 그늘(GTAO)을 더해 한 번 더 그려요">고화질</button><span class="tw-q" hidden></span>' +
    '<button type="button" class="tw-exit" data-t="exit">지도로 나가기</button></header>' +
    '<aside class="tw-left tw-g"><div class="tw-livebox"></div><h3>방문객 평가가 낮은 곳 <small>누르면 그곳의 개선안을 보여 줘요</small></h3><div class="tw-lowl"></div></aside>' +
    '<aside class="tw-right tw-g"><div class="tw-pred"></div><div class="tw-rate"></div></aside>' +
    '<div class="tw-time tw-g"><div class="t"><span class="tw-day"></span><b class="tw-hr">—</b><small class="tw-sun"></small></div><input class="tw-range" type="range" min="7" max="19" step="0.25" aria-label="시각"><div class="tw-ticks">' + [7, 10, 13, 16, 19].map(h => '<span>' + h + '시</span>').join('') + '</div></div>' +
    '<div class="tw-split"><i class="tw-div"></i><b class="tw-vl" data-s="L">지금</b><b class="tw-vl" data-s="R">개선 후</b><div class="tw-vs" data-s="L"></div><div class="tw-vs" data-s="R"></div></div>' +
    '<div class="tw-labs"></div><div class="tw-nums"></div><div class="tw-fps" hidden></div><div class="tw-report" hidden></div>';
  const $ = s => ui.querySelector(s), range = $('.tw-range'), labs = $('.tw-labs'), nums = $('.tw-nums');
  range.value = hour;
  function lowList() { return hubs.filter(h => h.n >= 5).sort((a, b) => a.pct - b.pct).slice(0, 5); }
  function lowHTML() {
    if (!$('.tw-lowl')) return;
    const L = lowList(); if (!L.includes(sel)) L.push(sel);
    $('.tw-lowl').innerHTML = L.map(h => { const tb = topBad(P[h.id]), pl = plans[pk(h)];
      const g = pl ? [['붐비는 날', pl.d14.crowd], ['더운 날', pl.d14.heat]].map(([n, e]) => n + ' ' + f1(e.a.raw - e.b.raw)).join(' · ') : '';
      return '<button type="button" class="tw-lo' + (h.id === sel.id ? ' on' : '') + '" data-h="' + h.id + '"><span class="nm"><b>' + esc(h.name) + '</b>' + (h.pct == null ? '<em class="na">평가 없음</em>' : '<em style="color:' + pctCss(h.pct) + '">😊 ' + Math.round(h.pct) + '%</em>') + '</span>' +
        '<small>' + (h.n ? h.n + '건' + (tb ? ' · ' + BAD[tb[0]] + ' ' + tb[1] : '') : '') + '</small>' +
        '<span class="pl">' + (pl === undefined ? '개선안 계산 중…' : !pl ? '격자 밖' : '개선 시 ' + g + '점') + '</span></button>'; }).join('');
  }
  function evHub(id) {
    const L = hubEv(id); if (!L.length) return '';
    return '<h4 class="tw-evh">아쉬움 근거 확인 <small>평가 당시 서울시 실시간 도시데이터와 대조</small></h4><ul class="tw-ev">' + L.map(e => {
      const c = COND[e.key], ok = e.park.v === 'yes';
      return '<li class="v-' + e.park.v + '"><b>「' + BAD[e.key] + '」 ' + e.n + '건 · ' + (e.inCond != null ? c.inLabel + ' 때 ' + e.inCond + '건' : '') + '</b><small>공원 전체: ' + VTXT[e.park.v] + ' (' + esc(evLine(e.key)) + ')' +
        (e.key === 'crowded' ? (ok ? ' → 혼잡률이 55%만 넘어도 붐빔 처방을 넣어요' : ' → 혼잡률 70% 기준으로만 판단해요') : (ok ? ' → 그늘 처방을 넣어요' : ' → 더위는 여름 평가가 쌓이면 다시 확인')) +
        (e.key === 'crowded' && e.inCond != null && e.n >= 2 && e.inCond / e.n < .5 ? '. 다만 이 거점은 ' + (e.n - e.inCond) + '/' + e.n + '건이 「여유」 때 나와, 이 자리가 좁거나 길이 막히는 문제일 수 있어요 → 현장에서 병목 지점 확인' : '') + '</small></li>';
    }).join('') + '</ul>';
  }
  // 갈래별 설명: 문제 → 처방 → 효과
  function groupText(g, pl) {
    const h = pl.h, n = g.items.length;
    if (g.k === 'yard') { const nd = g.items.filter(y => y.surf === 'deck').length, nl = n - nd; return { t: '체류 쉼터 넓히기 ' + n + '칸(' + (n * CELL_M2).toLocaleString() + '㎡)', d: '거점에 붙은 ' + [nd ? '포장 광장 ' + nd + '칸 → 그늘 데크' : '', nl ? '빈 땅 ' + nl + '칸 → 잔디 쉼터' : ''].filter(Boolean).join(', ') + ' · 앉음벽·벤치 · 수용 +' + Math.round(pl.added) + '명' }; }
    if (g.k === 'sign') { const s = pl.shift; return { t: '혼잡 분산 안내', d: '붐빌 때 안내판·앱 알림으로 ' + s.to.name + '(같은 시각 ' + pc(s.rTo) + ', 길 따라 ' + Math.round(s.len) + 'm)에 ' + pc(s.share) + ' 안내 → ' + Math.round(s.n) + '명 이동 · 그곳은 ' + pc(s.rTo) + ' → ' + pc(s.rTo1) }; }
    if (g.k === 'sail') return { t: '대형 그늘막 ' + n + '개', d: '8×8m · ' + g.items.map(t => dirOf(h, t.x, t.y)).slice(0, 3).join(', ') + ' · 아래 벤치' };
    if (g.k === 'tree') return { t: '그늘나무 ' + n + '그루', d: '수관 지름 9m로 자랐을 때 · ' + g.items.map(t => dirOf(h, t.x, t.y)).slice(0, 3).join(', ') };
    if (g.k === 'bench') return { t: '쉼터 벤치 ' + n * 2 + '개', d: '쉴 곳이 먼 칸(평균 ' + Math.round(pl.stay0.reduce((s, i) => s + R[i], 0) / pl.stay0.length) + 'm)에' };
    const t = g.items[0]; return { t: FAC[g.k].label, d: t.why + ' · 점수 밖' };
  }
  function evalNow(pl) { return { crowd: evalHub(pl, SCN.crowd, hour), heat: evalHub(pl, SCN.heat, hour) }; }
  function rateHTML(p, pct) {
    return '<div class="tw-face"><span>😊 ' + p.good + '</span><span>😐 ' + p.mid + '</span><span>😞 ' + p.bad + '</span><b style="color:' + pctCss(pct) + '">만족 ' + Math.round(pct) + '%</b></div>' +
      '<div class="tw-sbar"><i class="g" style="width:' + p.good / p.n * 100 + '%"></i><i class="m" style="width:' + p.mid / p.n * 100 + '%"></i><i class="b" style="width:' + p.bad / p.n * 100 + '%"></i></div>' +
      '<small>방문객 평가 ' + p.n + '건' + (rat.demo ? ' · 시연용 가상 평가' : ' · 최근 90일') + ' · 만족 비율 = (😊×100 + 😐×50) ÷ 건수</small>';
  }
  const reviewUrl = () => location.href.split(/[?#]/)[0] + '?review=' + encodeURIComponent(sel.id);
  // ---------- 구청 검토 화면 ----------
  // 처음: 3D 「지금」 한 화면 + 오른쪽 위 A·B·C 고르기(안마다 짧은 한 줄 설명)만.
  // 안을 누르면: 새 창(팝업)이 떠서 그 안의 자세한 내용을 보여 주고, 3D는 지금 / 개선 후 화면 분할. ←·✕·Esc로 닫으면 처음으로.
  function reviewHTML() {
    const rows = abcRows(sel); if (rows.some(r => r.wait)) ensureAll(sel);
    const pop = $('.tw-pop'), p = P[sel.id], pct = satPct(p);
    const chip = $('.tw-hubchip'); if (chip) chip.textContent = sel.name;
    // 오른쪽 위 A·B·C 고르기(항상 보임) — 누르면 그 안의 창이 열림
    $('.tw-vsw').innerHTML = '<span class="lb">' + (picked ? '개선안' : '개선안을<br>골라 보세요') + '</span>' + VK.map(v => { const rr = rows.find(x => x.v === v); return '<button type="button" data-v="' + v + '" aria-pressed="' + (v === picked) + '" title="' + VARS[v].name + '"' + (rr && rr.pl ? '' : ' disabled') + '><b>' + VARS[v].tag + '</b><small>' + VARS[v].hint + '</small></button>'; }).join('');
    if (!picked) { pop.hidden = true; pop.classList.remove('tw-left'); pop.innerHTML = ''; return; }
    const r = rows.find(x => x.v === picked), V = VARS[picked], first = pop.hidden;
    pop.hidden = false; pop.classList.add('tw-left'); if (first) { pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in'); }
    const bar = '<div class="tw-popbar"><span class="k">' + V.tag + '</span><b>' + V.title + '</b><button type="button" class="tw-x" data-t="back" aria-label="닫고 세 안 보기" title="닫기">✕</button></div>';
    if (!r || !r.pl) { pop.innerHTML = bar + '<div class="tw-popb"><p class="tw-note">계산하고 있어요…</p></div>'; return; }
    const pl = r.pl, C = r.E.crowd, Hh = r.E.heat, ul = a => '<ul>' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    const chg = (lbl, b, a, good) => '<div class="tw-cg"><span>' + lbl + '</span><span>' + b + ' → <b class="' + (good ? 'up' : '') + '">' + a + '</b></span></div>';
    const sat = (lbl, e) => '<div class="tw-kp"><small>' + lbl + '</small><span>' + e.b.raw.toFixed(0) + '<i>→</i><b class="' + (e.a.raw - e.b.raw > .5 ? 'up' : '') + '">' + e.a.raw.toFixed(0) + '</b><em>점</em></span></div>';
    pop.innerHTML = bar + '<div class="tw-popb">' +
      '<p class="tw-lead">' + esc(V.lead) + '</p><p class="tw-why2"><b>왜 이 조합인가</b>' + esc(V.why) + '</p>' +
      '<div class="tw-kps"><div class="tw-kp big"><small>사업비 (개략)</small><b>' + won(r.c.total) + '</b></div><div class="tw-kp big"><small>효과 시점</small><b class="sm">' + esc(V.when) + '</b></div>' +
      sat('붐비는 날 만족도 · ' + hm(hour), C) + sat('더운 날 만족도 · ' + hm(hour), Hh) + '</div>' +
      '<h4>무엇을 바꾸나<small>번호는 오른쪽 「개선 후」 화면의 번호와 같아요</small></h4>' +
      (pl.G.length ? '<ol class="tw-plan">' + pl.G.map((g, i) => { const t = groupText(g, pl); return '<li><span class="no">' + NUM[i] + '</span><span><b>' + esc(t.t) + '</b><small>' + esc(t.d) + '</small></span></li>'; }).join('') + '</ol>' : '<p class="tw-note">기준을 넘는 문제가 없어 바꿀 것이 없어요.</p>') +
      '<div class="tw-pc2"><section class="pro"><h5>장점</h5><ul>' + listHTML(V.pros, pl) + '</ul></section><section class="con"><h5>단점</h5><ul>' + listHTML(V.cons, pl) + '</ul></section></div>' +
      '<details class="tw-more"><summary>예상 변화 · ' + hm(hour) + '</summary><div class="tw-chg">' +
      chg('혼잡률 (붐비는 날)', pc(C.b.ratio), pc(C.a.ratio), C.a.ratio < C.b.ratio - .005) + chg('머무는 곳 그늘 (더운 날)', pc(Hh.b.s), pc(Hh.a.s), Hh.a.s > Hh.b.s + .005) +
      chg('주변 환경 점수', pl.env0.toFixed(1), pl.env1.toFixed(1), pl.env1 > pl.env0 + .05) + chg('쉴 곳까지 평균', Math.round(pl.cmp.b.rest) + 'm', Math.round(pl.cmp.a.rest) + 'm', pl.cmp.a.rest < pl.cmp.b.rest - 1) + '</div></details>' +
      '<details class="tw-more"><summary>사업비 산출</summary><table class="tw-ct">' +
      (r.c.rows.length ? r.c.rows.map(c => '<tr><td>' + esc(c.label) + '</td><td>' + c.q.toLocaleString() + c.unit + '</td><td>' + won(c.sum) + '</td></tr>').join('') : '<tr><td colspan="3">없음</td></tr>') +
      '<tr class="sum"><td colspan="2">합계 (단가 가정값)</td><td>' + won(r.c.total) + '</td></tr></table></details>' +
      '<details class="tw-more"><summary>왜 이곳인가</summary>' + (p && p.n ? '<div class="tw-rt">' + rateHTML(p, pct) + '</div>' : '<p class="tw-note">방문객 평가가 아직 없어요.</p>') + evHub(sel.id) + '</details>' +
      '<p class="tw-rvn">사업비 단가는 가정값이고, 나무 위치·그늘은 알고리즘 추정이라 실측이 필요해요.</p></div>';
  }
  function pickPlan(v) {
    picked = v; if (v) curV = v; split = !!v; root.classList.toggle('tw-picked', !!v);
    if (v && !(pk(sel) in plans)) planFor(sel);
    showPlan(); layoutBlocks(); if (!fly) flyTo(planView(sel), .9);
  }
  function panelHTML() {
    if (REVIEW) { reviewHTML(); return; }
    const p = P[sel.id], pct = satPct(p);
    let h = '<h2>' + esc(sel.name) + '<small>' + esc(sel.zone || '') + ' · 수용 ' + sel.cap.toLocaleString() + '명(대시보드 가정값) · ' + ({ outdoor: '야외', shade: '그늘', indoor: '실내' }[sel.type] || '') + ' 거점</small></h2>';
    if (p && p.n) {
      const reasons = Object.keys(BAD).filter(k => (p.reasons || {})[k]).sort((a, b) => p.reasons[b] - p.reasons[a]);
      h += '<div class="tw-rt"><div class="tw-face"><span>😊 ' + p.good + '</span><span>😐 ' + p.mid + '</span><span>😞 ' + p.bad + '</span><b style="color:' + pctCss(pct) + '">만족 ' + Math.round(pct) + '%</b></div>' +
        '<div class="tw-sbar"><i class="g" style="width:' + p.good / p.n * 100 + '%"></i><i class="m" style="width:' + p.mid / p.n * 100 + '%"></i><i class="b" style="width:' + p.bad / p.n * 100 + '%"></i></div>' +
        '<small>방문객 평가 ' + p.n + '건' + (rat.demo ? ' · 시연용 가상 평가' : ' · 최근 90일') + ' · 만족 비율 = (😊×100 + 😐×50) ÷ 건수</small>' +
        (reasons.length ? '<ul class="tw-why">' + reasons.map(k => '<li><span>' + BAD[k] + ' <b>' + p.reasons[k] + '</b></span><span>→ ' + REC[k] + '</span></li>').join('') + '</ul>' : '<p class="tw-note">아쉬운 이유가 아직 없어요.</p>') + evHub(sel.id) + '</div>';
    } else h += '<p class="tw-note">이 거점에는 방문객 평가가 아직 없어요.</p>';
    $('.tw-rate').innerHTML = h;
    const pl = plans[pk(sel)];
    if (!pl) { $('.tw-pred').innerHTML = '<p class="tw-note">' + (pl === null ? '이 거점은 팀 20m 격자 밖이라 계산할 수 없어요.' : '개선안을 계산하고 있어요…') + '</p>'; return; }
    const E = evalNow(pl), C = E.crowd, Hh = E.heat, e = E[scn.key], rsn = (P[sel.id] || {}).reasons || {};
    const bar = (lbl, b, a) => '<div class="tw-br"><span>' + lbl + '</span><i><b style="width:' + clamp(b, 0, 100) + '%"></b><em style="width:' + clamp(a, 0, 100) + '%"></em></i><span>' + Math.round(b) + ' → <b class="' + (a > b + .5 ? 'up' : '') + '">' + Math.round(a) + '</b></span></div>';
    const head = ['crowd', 'heat'].map(k => { const x = E[k]; return '<button type="button" class="tw-hd' + (scn.key === k ? ' on' : '') + '" data-t="' + k + '"><small>' + SCN[k].label + ' ' + hm(hour) + '</small><span>' + x.b.raw.toFixed(0) + '<i>→</i><b>' + x.a.raw.toFixed(0) + '</b></span><em class="' + (x.a.raw - x.b.raw > .5 ? 'up' : '') + '">' + f1(x.a.raw - x.b.raw) + '점</em></button>'; }).join('');
    const num = k => { const i = pl.G.findIndex(g => g.k === k); return i < 0 ? '' : '<span class="no">' + NUM[i] + '</span>'; };
    const gl = ks => pl.G.map((g, i) => [g, i]).filter(([g]) => ks.includes(g.k)).map(([g, i]) => { const t = groupText(g, pl); return '<li><span class="no">' + NUM[i] + '</span><span><b>' + esc(t.t) + '</b><small>' + esc(t.d) + '</small></span></li>'; }).join('');
    const crowdCard = '<section class="tw-lv"><h5><span>붐빔</span>' + SCN.crowd.label + ' ' + hm(hour) + '</h5>' +
      '<p class="pb">예상 <b>' + Math.round(C.b.ppl).toLocaleString() + '명</b> / 수용 ' + sel.cap.toLocaleString() + '명 → 혼잡률 <b class="' + (C.b.ratio > CROWD_CUT ? 'bad' : '') + '">' + pc(C.b.ratio) + '</b>' + (rsn.crowded ? ' · 「붐볐어요」 ' + rsn.crowded + '건' + (EV.crowded.v === 'yes' ? '(공원 전체에서 실제 혼잡 때 몰림, ' + pTxt(EV.crowded.p) + ')' : '') : '') + '</p>' +
      (pl.yards.length || pl.shift ? '<ol class="tw-plan">' + gl(['yard', 'sign']) + '</ol><p class="ef">혼잡률 ' + pc(C.b.ratio) + ' → <b>' + pc(C.a.ratio) + '</b> · 붐빔 점수 ' + Math.round(C.b.d) + ' → <b class="up">' + Math.round(C.a.d) + '</b></p>'
        : '<p class="ef mute">' + (sel.cap ? '토요일 14시 혼잡률 ' + pc(pl.r14) + ' — 혼잡 기준(' + pc(CROWD_CUT) + ') 아래라 공간을 늘리지 않아요.' : '수용 인원 자료가 없어 계산하지 않아요.') + '</p>') + '</section>';
    const heatCard = '<section class="tw-lv"><h5><span>더위</span>' + SCN.heat.label + '(체감 ' + SCN.heat.w.feels + '℃) ' + hm(hour) + '</h5>' +
      (sel.type === 'outdoor' ? '<p class="pb">머무는 곳 그늘 <b class="' + (Hh.b.s < SHADE_TARGET ? 'bad' : '') + '">' + pc(Hh.b.s) + '</b> · 날씨 점수 ' + Math.round(Hh.b.x) + '</p>' +
        (pl.shade.length ? '<ol class="tw-plan">' + gl(['sail', 'tree']) + '</ol><p class="ef">그늘 ' + pc(Hh.b.s) + ' → <b>' + pc(Hh.a.s) + '</b> · 날씨 점수 ' + Math.round(Hh.b.x) + ' → <b class="up">' + Math.round(Hh.a.x) + '</b>' + (Hh.a.ppl > Hh.b.ppl * 1.05 ? ' · 그늘이 생겨 더운 날 찾는 사람도 ' + Math.round(Hh.b.ppl) + ' → ' + Math.round(Hh.a.ppl) + '명' : '') + '</p>'
          : '<p class="ef mute">14시 그늘이 이미 ' + pc(shareAt(pl.stay0, [], sunDir(14, SCN.heat.doy))) + '라 더 넣지 않아요.</p>')
        : '<p class="ef mute">' + (sel.type === 'indoor' ? '실내 시설이라 그늘 처방은 해당 없어요.' : '숲 속 그늘 거점이라 그늘막 효과가 작아 넣지 않아요.') + '</p>') + '</section>';
    const envCard = '<section class="tw-lv"><h5><span>환경</span>둘레 80m · 팀 20m 칸 점수</h5><p class="ef">환경 점수 ' + pl.env0.toFixed(1) + ' → <b class="' + (pl.env1 > pl.env0 + .05 ? 'up' : '') + '">' + pl.env1.toFixed(1) + '</b> · 쉴 곳까지 평균 ' + Math.round(pl.cmp.b.rest) + ' → ' + Math.round(pl.cmp.a.rest) + 'm' + (pl.cmp.a.dLst < -.005 ? ' · 땅 온도 ' + pl.cmp.a.dLst.toFixed(2) + '℃' : '') + '</p>' + (pl.benches.length ? '<ol class="tw-plan">' + gl(['bench']) + '</ol>' : '') + '</section>';
    const exCard = pl.extra.length ? '<section class="tw-lv"><h5><span>볼거리·편의</span>점수 밖 · 방문객 아쉬움에 맞춤</h5><ol class="tw-plan ex">' + gl(['garden', 'photo', 'toilet']) + '</ol></section>' : '';
    const asm = ['수용 인원·끌림은 대시보드 가정값(현장 계수로 보정 예정)', '새 쉼터 수용 = 지금 이곳 수용 밀도(' + (pl.open0 / Math.max(1, sel.cap)).toFixed(1) + '㎡/명, 나무 그늘 아닌 열린 땅 기준) × 칸의 ' + pc(YARD_USE), '분산 안내로 옮겨 가는 비율 ' + pc(SHIFT) + ' · 옮겨 갈 곳은 ' + NB_R + 'm 안 혼잡률 ' + pc(NB_FREE) + ' 이하', '그늘 목표 = 머무는 곳(거점 ' + STAY_R + 'm 안) 14시 그늘 ' + pc(SHADE_TARGET), '그늘 비율만큼 야외 거점의 날씨 영향을 대시보드의 「그늘 거점」 계수 쪽으로 섞음', '혼잡 70% = 대시보드 「혼잡」 기준 · 붐비는 날 날씨는 가정, 더운 날은 실측(' + SCN.heat.wTxt.split('— ')[1] + ')'];
    const costOpen = !!($('.tw-cost') && $('.tw-cost').open);
    $('.tw-pred').innerHTML = '<h3>' + esc(sel.name) + ' 개선안 <small>대시보드 만족도 식(붐빔·날씨·환경)의 낮은 갈래를 공간으로 고쳐요 · 3D 왼쪽 지금 / 오른쪽 개선 후</small></h3>' +
      abcHTML() +
      '<h4 class="tw-vh">' + VARS[curV].name + ' 자세히</h4>' +
      '<div class="tw-heads">' + head + '</div>' +
      '<div class="tw-bars"><small>' + scn.label + ' ' + hm(hour) + ' 만족도를 이루는 세 점수(지금 → 개선 후)</small>' + bar('붐빔 .35', e.b.d, e.a.d) + bar('날씨 .30', e.b.x, e.a.x) + bar('환경 .35', e.b.e, e.a.e) + '</div>' +
      crowdCard + heatCard + envCard + exCard +
      '<div class="tw-act"><button type="button" class="tw-main" data-t="review">구청 검토 화면 열기</button><button type="button" class="tw-sub" data-t="report">세 안 검토 자료</button></div>' +
      '<details class="tw-asm"><summary>계산에 쓴 가정 ' + asm.length + '가지</summary><ul>' + asm.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>';
    if (costOpen && $('.tw-cost')) $('.tw-cost').open = true;
  }
  // 구청 검토용 A·B·C 비교: 누르면 3D·아래 자세히가 그 안으로 바뀜
  function abcHTML() {
    const rows = abcRows(sel); if (rows.some(r => r.wait)) ensureAll(sel);
    return '<section class="tw-abc"><h4>구청에 보낼 세 안 <small>같은 진단에 시설 조합만 달리한 세 안 · 우리는 고르지 않고 세 안을 모두 보내요 · ' + hm(hour) + ' 기준 · 누르면 3D가 그 안으로 바뀌어요</small></h4><div class="tw-abc-t">' +
      rows.map(r => {
        const V = VARS[r.v];
        if (r.wait || r.none) return '<button type="button" class="tw-abc-r" data-v="' + r.v + '" disabled><span class="hd"><b>' + V.name + '</b></span><small>' + (r.wait ? '계산 중…' : '격자 밖이라 계산할 수 없어요') + '</small></button>';
        return '<button type="button" class="tw-abc-r' + (curV === r.v ? ' on' : '') + '" data-v="' + r.v + '" aria-pressed="' + (curV === r.v) + '">' +
          '<span class="hd"><b>' + V.name + '</b>' + r.tags.map(t => '<em>' + t + '</em>').join('') + '</span>' +
          '<span class="what">' + esc(r.pl.G.map(g => groupText(g, r.pl).t).join(' · ') || '바꿀 것 없음(기준을 넘지 않음)') + '</span>' +
          '<span class="nums"><i>사업비<b>' + won(r.c.total) + '</b></i><i>붐비는 날<b class="' + (r.dC > .5 ? 'up' : '') + '">' + f1(r.dC) + '점</b></i><i>더운 날<b class="' + (r.dH > .5 ? 'up' : '') + '">' + f1(r.dH) + '점</b></i><i>환경<b class="' + (r.dE > .5 ? 'up' : '') + '">' + f1(r.dE) + '</b></i></span>' +
          '<small>효과 시점 · ' + V.when + '</small>' + listOf(V.pros, r.pl).slice(0, 2).map(x => '<small class="pc">＋ ' + esc(x) + '</small>').join('') + listOf(V.cons, r.pl).slice(0, 2).map(x => '<small class="pc mi">－ ' + esc(x) + '</small>').join('') + '</button>';
      }).join('') + '</div>' +
      '<details class="tw-cost"><summary>사업비 단가 (가정값 · 바꾸면 다시 계산)</summary><p>개당 공개 단가를 찾지 못해 넣은 가정값이에요. 제출 전에 나라장터 계약 단가로 바꿔 넣으세요. 바꾼 값은 이 기기에만 저장돼요.</p><div class="tw-cost-g">' +
      Object.keys(COST).map(k => '<label><span>' + COST[k].label + '</span><input type="number" min="0" step="1" data-cost="' + k + '" value="' + COST[k].p + '"><em>만 원/' + COST[k].unit + '</em></label>').join('') +
      '</div><button type="button" class="tw-cost-x" data-t="cost-reset">처음 값으로</button></details></section>';
  }
  function setVar(v) {
    if (REVIEW) { if (VARS[v]) pickPlan(v === picked ? null : v); return; }   // 고른 안을 한 번 더 누르면 닫힘
    if (!VARS[v] || v === curV) return; curV = v; const h = sel;
    if (!(pk(h) in plans)) { panelHTML(); setTimeout(() => { planFor(h); if (sel === h && curV === v) { showPlan(); lowHTML(); flyTo(planView(h), .8); } }, 30); }
    else { showPlan(); lowHTML(); flyTo(planView(h), .8); }
  }
  function labelsHTML() { labs.innerHTML = hubs.map(h => '<button type="button" class="tw-lab' + (h.id === sel.id ? ' on' : '') + '" data-h="' + h.id + '">' + esc(h.name) + ' <em style="color:' + (h.pct == null ? '#aab' : pctCss(h.pct)) + '">' + (h.pct == null ? '평가 없음' : '😊' + Math.round(h.pct) + '%') + '</em> <b></b></button>').join(''); }
  function labelScores() { [...labs.children].forEach((el, k) => { const h = hubs[k], pl = plans[pk(h)]; let t = ''; if (h.id === sel.id && pl && !(REVIEW && !picked)) { const e = evalHub(pl, scn, hour); t = e.b.raw.toFixed(0) + '→' + e.a.raw.toFixed(0) + '점'; } else t = baseSat(h, scn, hour).toFixed(0) + '점'; el.querySelector('b').textContent = t; el._w = 0; }); }
  function numsHTML() { const pl = REVIEW && !picked ? null : plans[pk(sel)]; nums.innerHTML = pl ? pl.G.map((g, k) => '<span class="tw-num' + (['garden', 'photo', 'toilet'].includes(g.k) ? ' ex' : '') + '">' + NUM[k] + '</span>').join('') : ''; }
  let blocks = [];
  function layoutBlocks() { blocks = ['.tw-left', '.tw-right', '.tw-top', '.tw-time'].map(s => ui.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect()); layoutViews(); }
  const v3 = new THREE.Vector3();
  function project(x, y, z, el) {
    const v = views[views.length - 1]; v3.set(x, z, -y).project(v.cam); const px = v.x + (v3.x + 1) / 2 * v.w, py = v.y + (1 - v3.y) / 2 * v.h;
    const hide = v3.z > 1 || px < v.x || px > v.x + v.w || py < v.y || py > v.y + v.h || blocks.some(b => { const hw = (el._w || (el._w = el.offsetWidth || 40)) / 2 + 6; return px + hw > b.left && px - hw < b.right && py > b.top - 8 && py - 30 < b.bottom; });
    el.style.display = hide ? 'none' : ''; if (!hide) el.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px) translate(-50%,-100%)';
  }
  function placeLabels() {
    const only = split && W <= 800, pl = plans[pk(sel)];
    [...labs.children].forEach((el, k) => { const h = hubs[k]; if (only && h.id !== sel.id) { el.style.display = 'none'; return; } project(h.x, h.y, pillarG.visible ? h.top : 9, el); });
    [...nums.children].forEach((el, k) => { const g = pl && pl.G[k]; if (g) project(g.at[0], g.at[1], g.z, el); });
  }
  // 개선안을 장면에 놓기(오른쪽만: 레이어 1)
  function clearItems() { itemsG.traverse(m => { if (m.userData.own) { m.material.map && m.material.map.dispose(); m.material.dispose(); } }); itemsG.clear(); }
  function showPlan() {
    clearItems(); const pl = plans[pk(sel)];
    if (pl) {
      pl.yards.forEach(y => { itemsG.add(yardMesh(y)); itemsG.add(haloMesh(y.x, y.y, 21, 21, 0)); });
      pl.shade.concat(pl.benches, pl.extra).forEach(t => { const m = model(t.k, t); m.position.set(t.x, 0, -t.y); m.rotation.y = t.rot; itemsG.add(m); if (t.k === 'tree') return; const s = t.k === 'sail' ? 11 : t.k === 'garden' ? 10 : 7; itemsG.add(haloMesh(t.x, t.y, s, s, t.rot)); });
      if (pl.shift) {
        const s = pl.shift, m = model('sign', s.sign); m.position.set(s.sign.x, 0, -s.sign.y); m.rotation.y = -s.sign.rot; itemsG.add(m); itemsG.add(haloMesh(s.sign.x, s.sign.y, 6, 6, 0));
        const curve = new THREE.CatmullRomCurve3(s.pts.map(q => new THREE.Vector3(q[0], .5, -q[1])), false, 'catmullrom', .2);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, s.pts.length * 6), .55, 6, false), new THREE.MeshBasicMaterial({ color: 0x3fe6a6, transparent: true, opacity: .85, toneMapped: false })); tube.userData.own = true; tube.renderOrder = 4; itemsG.add(tube);
        const end = s.pts[s.pts.length - 1], cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4, 12), tube.material); cone.position.set(end[0], 3, -end[1]); cone.rotation.x = Math.PI; itemsG.add(cone);
      }
      itemsG.traverse(m => { m.layers.set(1); if (m.isMesh && m.userData.own == null && m.material !== MT.lawn) m.castShadow = true; });
      scatter('L', pl.stay0.map(i => [i, Math.max(40, (1 - TR[i]) * CELL_M2)]), 101 + hubs.indexOf(sel));
      scatter('R', pl.stay.map(i => [i, pl.yards.some(y => y.cell === i) ? CELL_M2 * YARD_USE : Math.max(40, (1 - TR[i]) * CELL_M2)]), 202 + hubs.indexOf(sel));
    } else { setCount('L', 0); setCount('R', 0); }
    shadowDirty(); numsHTML(); refresh(); labDirty = true;
  }
  // 시각·상황이 바뀌면: 사람 수 · 패널 · 숫자 · 칸 불편도
  function refresh() {
    const pl = plans[pk(sel)];
    if (pl) { const e = evalHub(pl, scn, hour); setCount('L', e.b.ppl); setCount('R', e.a.ppl); }
    panelHTML(); updStats(); labelScores(); if (glow.visible) paintGlow(cellScores()); dirty = labDirty = true;
  }
  function cellScores() {
    const out = Float64Array.from(S0), pl = plans[pk(sel)]; if (!pl) return out;
    const sd = sunDir(hour, SCN.heat.doy), r = envEval(pl.cells, pl.md, [sd]), b = envEval(pl.cells, EMPTY, [sd]);
    pl.cells.forEach((i, j) => { out[i] = S0[i] + r.sc[j] - b.sc[j]; }); return out;
  }
  function selectHub(id, flyDur) {
    const h = hubOf(id); if (!h) return; sel = h; labelsHTML(); lowHTML(); labDirty = true;
    if (!(pk(h) in plans)) { panelHTML(); setTimeout(() => { planFor(h); if (sel === h) { showPlan(); lowHTML(); if (flyDur) flyTo(planView(h), flyDur); } }, 30); }
    else { showPlan(); if (flyDur) flyTo(planView(h), flyDur); }
  }
  function timeText() { const sd = sunDir(hour, scn.doy); $('.tw-day').textContent = scn.label + ' · ' + scn.date; $('.tw-hr').textContent = hm(hour); $('.tw-sun').textContent = '해 높이 ' + Math.round(sd.alt) + '° · ' + DIR8[Math.round(sd.az / 45) % 8] + '쪽'; }
  function setScn(k) {
    scn = SCN[k]; ui.querySelectorAll('.tw-scn button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === k));
    timeText(); placeSun(true); refresh();
  }

  let down = null;
  cvs.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  cvs.addEventListener('pointerup', e => {
    if (!down || fly) { down = null; return; } const mv = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (mv > 6 || dt > 650) return;
    const r = cvs.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, v = views.find(w => mx >= w.x && mx < w.x + w.w && my >= w.y && my < w.y + w.h) || views[views.length - 1];
    ndc.set((mx - v.x) / v.w * 2 - 1, -(my - v.y) / v.h * 2 + 1); ray.setFromCamera(ndc, v.cam);
    const ph = ray.intersectObjects(pillarG.children)[0]; if (ph) selectHub(ph.object.userData.hub, 1.4);
  });
  function onKey(e) { if (e.key !== 'Escape') return; if (!$('.tw-report').hidden) $('.tw-report').hidden = true; else if (REVIEW && picked) pickPlan(null); }
  addEventListener('keydown', onKey);
  ui.addEventListener('click', e => {
    const hb = e.target.closest('[data-h]'); if (hb) { selectHub(hb.dataset.h, 1.4); return; }
    const vb = e.target.closest('[data-v]'); if (vb) { setVar(vb.dataset.v); return; }
    const t = e.target.closest('[data-t]'); if (!t) return; const a = t.dataset.t;
    if (a === 'crowd' || a === 'heat') setScn(a);
    if (a === 'glow') { glow.visible = !glow.visible; t.setAttribute('aria-pressed', glow.visible); if (glow.visible) paintGlow(cellScores()); dirty = true; }
    if (a === 'one' || a === 'split') { split = a === 'split'; ui.querySelector('[data-t="one"]').setAttribute('aria-pressed', !split); ui.querySelector('[data-t="split"]').setAttribute('aria-pressed', split); layoutViews(); if (!fly) flyTo(planView(sel), .8); }
    if (a === 'hq') { hqWant = t.getAttribute('aria-pressed') !== 'true'; t.setAttribute('aria-pressed', hqWant); if (hqWant) ensureHQ(); dirty = true; }
    if (a === 'exit') exit();
    if (a === 'report') report();
    if (a === 'back') pickPlan(null);
    if (a === 'review') window.open(reviewUrl(), '_blank', 'noopener');
    if (a === 'print') printReport();
    if (a === 'png') savePNG();
    if (a === 'close-report') $('.tw-report').hidden = true;
    if (a === 'cost-reset') { Object.keys(COST).forEach(k => { COST[k].p = COST0[k].p; }); saveCost(); panelHTML(); }
  });
  ui.addEventListener('change', e => {
    const inp = e.target.closest('[data-cost]'); if (!inp) return; const v = +inp.value;
    if (isFinite(v) && v >= 0) { COST[inp.dataset.cost].p = v; saveCost(); } panelHTML();
  });
  range.addEventListener('input', () => { hour = +range.value; timeText(); placeSun(false); });
  range.addEventListener('change', () => { hour = +range.value; placeSun(true); refresh(); });

  // ---------- 구청에 보내는 세 안 검토 자료(공문 겉장 + ①~⑥ + 회신 + 붙임) ----------
  // 우리는 고르지 않음: 세 안을 같은 형식으로 나란히 싣고, 구청이 회신란에서 고른다.
  // 양식: 국민제안서·지자체 사업계획서에 공통으로 들어가는 항목(현황 및 문제점 · 개선방안 · 필요성 · 소요예산 · 추진 일정 · 기대효과)
  function reportData() {
    VK.forEach(v => planFor(sel, v));
    const p = P[sel.id], pct = satPct(p), d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const reasons = p ? Object.keys(BAD).filter(k => (p.reasons || {})[k]).sort((a, b) => p.reasons[b] - p.reasons[a]).map(k => BAD[k] + ' ' + p.reasons[k] + '건') : [];
    const rows = abcRows(sel).filter(r => r.pl), any = rows[0], C0 = any && any.E.crowd, H0 = any && any.E.heat;
    const low = any ? (() => { const e = any.E[scn.key].b, L = [['붐빔', e.d], ['날씨', e.x], ['환경', e.e]].sort((a, b) => a[1] - b[1]); return L[0][0] + ' ' + Math.round(L[0][1]) + '점'; })() : '';
    const plansOut = rows.map(r => {
      const V = VARS[r.v], pl = r.pl, C = r.E.crowd, Hh = r.E.heat;
      return { v: r.v, tag: V.tag, title: V.title, name: V.name, lead: V.lead, why: V.why, when: V.when, pros: listOf(V.pros, pl), cons: listOf(V.cons, pl), cost: r.c,
        fac: pl.G.map((g, i) => { const t = groupText(g, pl); return NUM[i] + ' ' + t.t + ' — ' + t.d; }),
        eff: { cB: C.b.raw, cA: C.a.raw, hB: Hh.b.raw, hA: Hh.a.raw, rB: C.b.ratio, rA: C.a.ratio, sB: Hh.b.s, sA: Hh.a.s, eB: pl.env0, eA: pl.env1, restB: pl.cmp.b.rest, restA: pl.cmp.a.rest, cap0: sel.cap, cap1: C.a.cap } };
    });
    return {
      hub: sel.name, date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), url: reviewUrl(),
      gm: [['수신', '성동구청장 (참조: 공원 담당 부서)'], ['제목', '서울숲 「' + sel.name + '」 이용 만족도 개선안(A·B·C) 검토 요청'],
        ['1. 관련', LAWS.join(' · ')],
        ['2. 내용', '방문객 평가와 서울시 실시간 도시데이터로 확인한 「' + sel.name + '」의 문제를 고치기 위해, 시설 조합이 다른 세 안(A·B·C)을 디지털트윈으로 만들었습니다. 각 안의 특징·장단점·사업비와 설치 전후 모습을 비교 검토하시어, 추진할 안을 정해 회신하여 주시기 바랍니다.'],
        ['3. 검토 화면', (() => { try { return decodeURI(reviewUrl()); } catch (e) { return reviewUrl(); } })() + ' (세 안을 눌러 전·후 모습을 화면 분할로 볼 수 있음)'],
        ['붙임', '세 안 검토 자료 1부. 끝.'], ['발신', '카야팀 (상명대학교 그린스마트시티학과)']],
      why: (p && p.n ? '방문객 평가 ' + p.n + '건 · 만족 ' + Math.round(pct) + '%' + (rat.demo ? ' (시연용 가상 평가)' : ' (최근 90일)') + (reasons.length ? ' · 아쉬운 이유: ' + reasons.join(', ') : '') : '방문객 평가 없음') +
        (C0 ? ' · 붐비는 날 ' + hm(hour) + ' 혼잡률 ' + pc(C0.b.ratio) + ' · 더운 날 머무는 곳 그늘 ' + pc(H0.b.s) : ''),
      plans: plansOut,
      need: [low ? '대시보드 만족도 식(붐빔 .35 · 날씨 .30 · 환경 .35)에서 이 거점은 「' + low + '」이 가장 낮아요.' : '', reasons.length ? '방문객이 남긴 아쉬움: ' + reasons.join(', ') + '.' : '']
        .concat(hubEv(sel.id).map(e => '「' + BAD[e.key] + '」 ' + e.n + '건 — 평가 당시 실시간 도시데이터와 대조: ' + VTXT[e.park.v] + ' (' + evLine(e.key) + ')'), LAWS.map(x => '근거 · ' + x)).filter(Boolean),
      steps: ['1단계 · 안 결정: 구청이 세 안 중 하나를 고르거나 보완을 요청', '2단계 · 현장 확인: 쉼터로 바꿀 칸의 지하 매설물·기존 나무 뿌리·배수·행사 동선을 보고, 수목 현황은 실측으로 확인', '3단계 · 설치: 고른 안의 시설 설치 (효과 시점 — ' + plansOut.map(x => x.tag + ': ' + x.when).join(' / ') + ')', '4단계 · 설치 뒤 평가: 같은 곳의 방문객 평가(😊😐😞·아쉬운 이유)를 설치 전과 비교해 효과를 확인'],
      how: '세 안 모두 같은 진단을 써요. 붐비는 날(쾌적한 토요일) 14시 혼잡률이 70%를 넘으면(「붐볐어요」가 실제 혼잡과 맞으면 55%) 여유 있는 거점으로 분산 안내하고, 더운 날(체감 36.3℃) 야외 거점은 머무는 곳 14시 그늘이 50%가 될 때까지 10~16시 평균 그늘을 가장 많이 늘리는 자리에 그늘을 놓아요(햇빛 광선 계산). A안은 쉼터 공사 없이 그늘막·벤치·안내만, B안은 쉼터 넓히기와 그늘막·그늘나무, C안은 잔디 쉼터와 그늘나무만 써요. 환경은 팀 20m 칸 점수 식으로 다시 셈.',
      check: ['사업비 단가는 가정값이에요. 확정 전에 나라장터 계약 단가로 다시 계산해야 해요.', '수용 인원·끌림·분산 비율 15%·그늘 목표 50%·쉼터 사용률 85%는 가정값 — 현장 계수(혼잡 시간대 인원)와 설문으로 보정한다.', '나무 위치·그늘은 위성·격자 자료로 알고리즘이 추정한 값이라 실측이 필요해요. 그늘나무 효과는 수관 지름 9m로 자랐을 때 기준이에요.', '휴게시설 설치의 공원조성계획 변경 절차(경미한 변경 해당 여부)는 도시공원법령으로 확인한다(검증 필요).', '서울숲은 서울시 직영 공원이라 실제 제출처(서울시 공원 담당 부서·성동구)를 확인해야 해요.']
    };
  }
  // 세 안 각각의 개선 후 3D 장면을 찍음(오른쪽 카메라 한 화면) — 끝나면 보던 안으로 되돌림
  function shotsAll() {
    const keep = curV, out = {}, sv = [{ cam: camera, side: 'R', x: 0, y: 0, w: W, h: H, vis: VIS }];
    VK.forEach(v => { if (!plans[pk(sel, v)]) return; curV = v; showPlan(); setOffset(camera, sv[0]); draw(sv, false); try { out[v] = cvs.toDataURL('image/jpeg', .82); } catch (e) { out[v] = ''; } });
    curV = keep; showPlan(); layoutViews(); dirty = true; return out;
  }
  let shots = {};
  function report() {
    const r = reportData(); shots = shotsAll();
    const el = $('.tw-report'), ul = a => '<ul>' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>', E = r.plans.map(x => x.eff);
    const gm = '<table class="tw-gm">' + r.gm.map(([k, v]) => '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>').join('') + '</table>';
    const cards = r.plans.map(x => '<section class="tw-ab"><h5><span>' + x.tag + '</span>' + esc(x.title) + '</h5><p class="ld">' + esc(x.lead) + '</p><p class="ld"><b>왜 이 조합인가</b> ' + esc(x.why) + '</p>' + (shots[x.v] ? '<img src="' + shots[x.v] + '" alt="' + esc(x.name) + ' 개선 후 3D 장면">' : '') +
      '<p class="sub">무엇을 바꾸나</p>' + (x.fac.length ? ul(x.fac) : '<p>바꿀 것 없음</p>') + '<div class="tw-pcs"><div><p class="sub">장점</p>' + ul(x.pros) + '</div><div><p class="sub">단점</p>' + ul(x.cons) + '</div></div>' +
      '<p class="meta">사업비(개략) <b>' + won(x.cost.total) + '</b> · 효과 시점 ' + esc(x.when) + '</p></section>').join('');
    const cost = r.plans.map(x => '<p class="sub">' + x.tag + ' · ' + esc(x.title) + '</p><table class="tw-tb"><tr><th>항목</th><th>수량</th><th>단가(가정)</th><th>금액</th></tr>' +
      (x.cost.rows.length ? x.cost.rows.map(c => '<tr><td>' + esc(c.label) + '</td><td>' + c.q.toLocaleString() + ' ' + c.unit + '</td><td>' + c.p.toLocaleString() + '만 원</td><td>' + won(c.sum) + '</td></tr>').join('') : '<tr><td colspan="4">없음</td></tr>') +
      '<tr class="sum"><td colspan="3">합계 (개략)</td><td>' + won(x.cost.total) + '</td></tr></table>').join('');
    const th = '<tr><th></th>' + r.plans.map(x => '<th>' + x.tag + ' · ' + esc(x.title) + '</th>').join('') + '</tr>';
    const tr = (lbl, f) => '<tr><td>' + lbl + '</td>' + E.map(f).map(t => '<td>' + t + '</td>').join('') + '</tr>';
    const eff = '<table class="tw-tb">' + th + tr('예측 만족도 · 붐비는 날 ' + hm(hour), e => e.cB.toFixed(1) + ' → ' + e.cA.toFixed(1) + ' (' + f1(e.cA - e.cB) + ')') + tr('예측 만족도 · 더운 날 ' + hm(hour), e => e.hB.toFixed(1) + ' → ' + e.hA.toFixed(1) + ' (' + f1(e.hA - e.hB) + ')') +
      tr('혼잡률 (붐비는 날)', e => pc(e.rB) + ' → ' + pc(e.rA)) + tr('수용 인원', e => e.cap0 + ' → ' + Math.round(e.cap1) + '명') + tr('머무는 곳 그늘 (더운 날)', e => pc(e.sB) + ' → ' + pc(e.sA)) + tr('주변 환경 점수', e => e.eB.toFixed(1) + ' → ' + e.eA.toFixed(1)) + tr('쉴 곳까지 평균', e => Math.round(e.restB) + ' → ' + Math.round(e.restA) + 'm') +
      tr('사업비 (개략)', (e, i) => won(r.plans[i].cost.total)) + '</table>';
    el.innerHTML = '<div class="tw-sheet"><header><span>서울숲 디지털트윈 · 개선안 검토 자료</span><span>' + r.date + '</span></header>' +
      '<h4>공문</h4>' + gm + '<h1>' + esc(r.hub) + ' <small>개선안 A · B · C</small></h1>' +
      '<h4>① 현황 및 문제점</h4><p>' + esc(r.why) + '</p>' +
      '<h4>② 개선방안 — 세 안</h4><div class="tw-abs">' + cards + '</div>' +
      '<h4>③ 필요성 (왜 해야 하나)</h4>' + ul(r.need) +
      '<h4>④ 소요예산 (얼마 드나)</h4>' + cost +
      '<h4>⑤ 추진 일정</h4>' + ul(r.steps) +
      '<h4>⑥ 기대효과 (세 안 비교)</h4>' + eff +
      '<h4>회신</h4><table class="tw-gm tw-reply"><tr><th>검토 결과</th><td>□ A안 · ' + esc(VARS.A.title) + '　□ B안 · ' + esc(VARS.B.title) + '　□ C안 · ' + esc(VARS.C.title) + '　□ 보완 요청</td></tr><tr><th>의견</th><td></td></tr><tr><th>검토자</th><td></td></tr></table>' +
      '<h4>붙임 · 고른 방법</h4><p>' + esc(r.how) + '</p><h4>붙임 · 근거 문헌</h4>' + ul(REFS) + '<h4>붙임 · 확인할 것</h4>' + ul(r.check) +
      '<footer>디지털트윈 가상 시험 결과이며 실제 효과는 다를 수 있어요.</footer><div class="tw-ra"><button type="button" data-t="print">인쇄</button><button type="button" data-t="png">PNG 저장</button><button type="button" data-t="close-report">닫기</button></div></div>';
    el.hidden = false; el.scrollTop = 0;
  }
  // 인쇄: 3D 화면·덧씌운 패널이 인쇄물에 섞이지 않도록, 검토 자료만 담은 숨은 틀(iframe)을 따로 만들어 인쇄
  const PRINT_CSS = '@page{size:A4;margin:14mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}' +
    'body{margin:0;font-family:"Pretendard Variable",Pretendard,"Malgun Gothic",sans-serif;color:#14201a;background:#fff}' +
    'header{display:flex;justify-content:space-between;font-size:11px;color:#5b6b63;border-bottom:2px solid #0b7a45;padding-bottom:6px}' +
    'h1{margin:16px 0 10px;font-size:24px;letter-spacing:-.02em}h1 small{font-size:14px;color:#0b7a45;margin-left:6px}' +
    'h4{margin:16px 0 6px;font-size:13.5px;color:#0b7a45;break-after:avoid}p,li{font-size:12px;line-height:1.6;margin:0}ul{margin:0;padding-left:18px}' +
    'img{width:100%;border-radius:6px;display:block;margin:4px 0 6px}' +
    'table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px;break-inside:avoid}th,td{border:1px solid #cfd8d3;padding:5px 7px;text-align:left;vertical-align:top;line-height:1.5}' +
    '.tw-gm th{width:76px;background:#f1f6f3;color:#0b7a45;white-space:nowrap}.tw-tb th{background:#f1f6f3;color:#0b7a45;white-space:nowrap}.tw-tb tr.sum td{font-weight:800;background:#f7faf8}.tw-tb small{color:#0b7a45;font-weight:700}' +
    '.sub{margin:8px 0 2px;font-size:11.5px;color:#5b6b63}.meta{margin-top:6px}' +
    '.tw-abs{display:grid;gap:10px}.tw-ab{border:1px solid #cfd8d3;border-radius:8px;padding:10px 12px;break-inside:avoid}' +
    '.tw-ab h5{margin:0 0 4px;font-size:14px;display:flex;gap:8px;align-items:center}.tw-ab h5 span{background:#0b7a45;color:#fff;border-radius:6px;padding:1px 8px;font-size:11px}.tw-ab .ld{color:#4a5a52;margin-bottom:6px}' +
    '.tw-pcs{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tw-reply td{height:26px}' +
    'footer{margin-top:16px;font-size:10.5px;color:#6b7a73;border-top:1px solid #e3e8e5;padding-top:6px}.tw-ra{display:none}';
  function printReport() {
    const sheet = $('.tw-sheet'); if (!sheet) return;
    const old = document.getElementById('twPrint'); if (old) old.remove();
    const f = document.createElement('iframe'); f.id = 'twPrint'; f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    f.srcdoc = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>서울숲 개선안 검토 자료 · ' + esc(sel.name) + '</title><style>' + PRINT_CSS + '</style></head><body>' + sheet.innerHTML + '</body></html>';
    f.onload = () => {
      const w = f.contentWindow, imgs = [...w.document.images];
      Promise.all(imgs.map(im => im.decode ? im.decode().catch(() => null) : null)).then(() => { w.focus(); w.print(); setTimeout(() => f.remove(), 60000); });
    };
    document.body.appendChild(f);
  }
  function savePNG() {
    const r = reportData(), Wc = 1240, c = document.createElement('canvas'), x = c.getContext('2d'), F = 'Pretendard Variable, Pretendard, sans-serif', lines = [];
    const push = (t, s, w, col, gap, img) => lines.push({ t, s, w, col, gap, img });
    push('서울숲 디지털트윈 · 개선안 검토 자료 · ' + r.date, 22, 600, '#5b6b63', 10);
    const sec = (h, arr) => { push(h, 26, 800, '#0b7a45', 8); arr.forEach(t => push('· ' + t, 21, 500, '#1d2a24', 4)); push('', 10, 400, '#000', 8); };
    sec('공문', r.gm.map(([k, v]) => k + ' : ' + v));
    push(r.hub + ' — 개선안 A · B · C', 40, 800, '#0d1a14', 18);
    sec('① 현황 및 문제점', [r.why]);
    push('② 개선방안 — 세 안', 26, 800, '#0b7a45', 8);
    r.plans.forEach(p2 => { push(p2.tag + ' · ' + p2.title + ' — ' + p2.lead, 23, 800, '#0d1a14', 6, shots[p2.v] || ''); push('왜 이 조합인가: ' + p2.why, 20, 600, '#0b7a45', 4); p2.fac.forEach(t => push('· ' + t, 20, 500, '#1d2a24', 3)); p2.pros.forEach(t => push('＋ ' + t, 20, 500, '#0b7a45', 3)); p2.cons.forEach(t => push('－ ' + t, 20, 500, '#a4572a', 3)); push('사업비(개략) ' + won(p2.cost.total) + ' · 효과 시점 ' + p2.when, 20, 700, '#1d2a24', 14); });
    sec('③ 필요성', r.need);
    sec('④ 소요예산 (단가는 가정값)', [].concat(...r.plans.map(p2 => p2.cost.rows.map(c2 => p2.tag + ' · ' + c2.label + ' ' + c2.q.toLocaleString() + c2.unit + ' × ' + c2.p.toLocaleString() + '만 원 = ' + won(c2.sum)).concat([p2.tag + ' 합계(개략) ' + won(p2.cost.total)]))));
    sec('⑤ 추진 일정', r.steps);
    sec('⑥ 기대효과', r.plans.map(p2 => { const e = p2.eff; return p2.tag + ' · 붐비는 날 ' + e.cB.toFixed(1) + '→' + e.cA.toFixed(1) + ' · 더운 날 ' + e.hB.toFixed(1) + '→' + e.hA.toFixed(1) + ' · 혼잡률 ' + pc(e.rB) + '→' + pc(e.rA) + ' · 그늘 ' + pc(e.sB) + '→' + pc(e.sA) + ' · 환경 ' + e.eB.toFixed(1) + '→' + e.eA.toFixed(1); }));
    sec('회신', ['검토 결과: □ A안  □ B안  □ C안  □ 보완 요청', '의견:', '검토자:']);
    sec('붙임 · 고른 방법', [r.how]); sec('붙임 · 근거 문헌', REFS); sec('붙임 · 확인할 것', r.check);
    push('디지털트윈 가상 시험 결과이며 실제 효과는 다를 수 있어요.', 18, 500, '#6b7a73', 0);
    const wrap = (t, s, w) => { x.font = w + ' ' + s + 'px ' + F; const out = []; let cur = ''; for (const chh of t) { if (x.measureText(cur + chh).width > Wc - 160 && cur) { out.push(cur); cur = chh; } else cur += chh; } out.push(cur); return out; };
    const need = lines.filter(l => l.img), imgs = need.map(l => { const im = new Image(); im.src = l.img; return im; });
    Promise.all(imgs.map(im => im.decode().catch(() => null))).then(() => {
      const IW = Wc - 160, IH = Math.round(IW * 9 / 16); let H2 = 140;
      const wl = lines.map(l => { const w = l.t ? wrap(l.t, l.s, l.w) : ['']; H2 += w.length * l.s * 1.45 + l.gap + (l.img ? IH + 24 : 0); return w; });
      c.width = Wc; c.height = Math.ceil(H2 + 60); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); let y = 80, k2 = 0;
      lines.forEach((l, k) => { x.font = l.w + ' ' + l.s + 'px ' + F; x.fillStyle = l.col; wl[k].forEach(t => { x.fillText(t, 80, y); y += l.s * 1.45; }); if (l.img) { const im = imgs[k2++]; if (im && im.width) x.drawImage(im, 80, y, IW, IH); y += IH + 24; } y += l.gap; });
      const a = document.createElement('a'); a.download = '서울숲_개선안검토_' + r.hub.replace(/[^\w가-힣]+/g, '_') + '_' + r.date + '.png'; a.href = c.toDataURL('image/png'); a.click();
    });
  }

  let W = 1, H = 1, split = !REVIEW, views = [], VIS = null, hqWant = false, HQ = null, hqPend = false, hqAt = 0, hqLoading = false;
  function size() { W = root.clientWidth || innerWidth; H = root.clientHeight || innerHeight; renderer.setSize(W, H, false); layoutBlocks(); }
  function visRect() {
    const g = q => { const e = ui.querySelector(q); return e ? e.getBoundingClientRect() : null; }, L = g('.tw-left'), Rr = g('.tw-right'), T = g('.tw-top'), Tm = g('.tw-time');
    const v = W >= 900 ? { x0: L ? L.right : 0, x1: Rr ? Rr.left : W, y0: T ? T.bottom : 0, y1: Tm ? Tm.top : H }
      : { x0: 0, x1: W, y0: T ? T.bottom : 0, y1: Math.min(L ? L.top : H, Tm ? Tm.top : H, Rr ? Rr.top : H) };
    return v.x1 - v.x0 < 160 || v.y1 - v.y0 < 120 ? { x0: 0, x1: W, y0: 0, y1: H } : v;
  }
  function setOffset(cam, v) {
    const cx = (v.vis.x0 + v.vis.x1) / 2 - v.x, cy = (v.vis.y0 + v.vis.y1) / 2 - v.y, fw = 2 * Math.max(cx, v.w - cx), fh = 2 * Math.max(cy, v.h - cy);
    cam.setViewOffset(fw, fh, fw / 2 - cx, fh / 2 - cy, v.w, v.h);
  }
  function layoutViews() {
    const v = VIS = visRect(), vert = W <= 800;
    if (!split) views = REVIEW && !picked ? [{ cam: camL, side: 'L', x: 0, y: 0, w: W, h: H, vis: v }] : [{ cam: camera, side: 'R', x: 0, y: 0, w: W, h: H, vis: v }];
    else if (!vert) { const m = Math.round((v.x0 + v.x1) / 2); views = [{ cam: camL, side: 'L', x: 0, y: 0, w: m, h: H, vis: { x0: v.x0, x1: m, y0: v.y0, y1: v.y1 } }, { cam: camera, side: 'R', x: m, y: 0, w: W - m, h: H, vis: { x0: m, x1: v.x1, y0: v.y0, y1: v.y1 } }]; }
    else { const m = Math.round((v.y0 + v.y1) / 2); views = [{ cam: camL, side: 'L', x: 0, y: 0, w: W, h: m, vis: { x0: 0, x1: W, y0: v.y0, y1: m } }, { cam: camera, side: 'R', x: 0, y: m, w: W, h: H - m, vis: { x0: 0, x1: W, y0: m, y1: v.y1 } }]; }
    views.forEach(w => setOffset(w.cam, w));
    if (HQ) views.forEach(w => { const c = HQ[w.side]; c.setPixelRatio(renderer.getPixelRatio()); c.setSize(w.w, w.h); });
    const sp = $('.tw-split'); sp.hidden = !split;
    if (split) {
      const b = views[1]; $('.tw-div').style.cssText = vert ? 'left:0;top:' + (b.y - 1) + 'px;width:' + W + 'px;height:2px' : 'left:' + (b.x - 1) + 'px;top:' + v.y0 + 'px;width:2px;height:' + (v.y1 - v.y0) + 'px';
      views.forEach(w => { const l = sp.querySelector('.tw-vl[data-s="' + w.side + '"]'), st = sp.querySelector('.tw-vs[data-s="' + w.side + '"]');
        l.style.transform = 'translate(' + (w.vis.x0 + 14) + 'px,' + (w.vis.y0 + 12) + 'px)';
        st.style.transform = 'translate(' + ((w.vis.x0 + w.vis.x1) / 2) + 'px,' + (w.vis.y1 - 10) + 'px) translate(-50%,-100%)'; st.style.maxWidth = (w.vis.x1 - w.vis.x0 - 16) + 'px'; });
    }
    const fp = $('.tw-fps'); fp.hidden = !SHOW_FPS; fp.style.transform = 'translate(' + (v.x1 - 10) + 'px,' + (v.y0 + 12) + 'px) translate(-100%,0)';
    dirty = labDirty = true;
  }
  // 각 화면 아래 핵심 숫자 3개(지금 상황·시각)
  function updStats() {
    const pl = plans[pk(sel)], L = $('.tw-vs[data-s="L"]'), Rr = $('.tw-vs[data-s="R"]');
    if (!pl) { L.innerHTML = Rr.innerHTML = ''; return; }
    const e = evalHub(pl, scn, hour), cell = (k, v, df) => '<span><small>' + k + '</small><b>' + v + '</b>' + (df || '') + '</span>';
    const d = (v, u, good, dg) => '<em class="' + (good ? 'up' : '') + '">' + (Math.abs(v) < Math.pow(10, -dg) / 2 ? '±0' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(dg)) + u + '</em>';
    const ds = e.a.raw - e.b.raw, dr = Math.round(e.a.ratio * 100) - Math.round(e.b.ratio * 100), dsh = Math.round(e.a.s * 100) - Math.round(e.b.s * 100);
    L.innerHTML = cell('예측 만족도', e.b.raw.toFixed(1) + '점') + cell('혼잡률', pc(e.b.ratio)) + cell('머무는 곳 그늘', pc(e.b.s)) + cell('사람', Math.round(e.b.ppl) + '명');
    Rr.innerHTML = cell('예측 만족도', e.a.raw.toFixed(1) + '점', d(ds, '', ds > .05, 1)) + cell('혼잡률', pc(e.a.ratio), d(dr, '%p', dr < 0, 0)) + cell('머무는 곳 그늘', pc(e.a.s), d(dsh, '%p', dsh > 0, 0)) + cell('사람', Math.round(e.a.ppl) + '명');
  }
  function draw(vs, useHQ) {
    camL.position.copy(camera.position); camL.quaternion.copy(camera.quaternion); sky.position.copy(camera.position);
    for (const v of vs) {
      const gy = H - v.y - v.h; renderer.setViewport(v.x, gy, v.w, v.h); renderer.setScissor(v.x, gy, v.w, v.h);
      renderer.shadowMap.needsUpdate = v.side === 'L' ? shL : shR;
      if (useHQ && HQ) HQ[v.side].render(); else renderer.render(scene, v.cam);
      if (v.side === 'L') shL = false; else shR = false;
    }
  }
  async function ensureHQ() {
    if (HQ || hqLoading) return; hqLoading = true;
    try {
      const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all(['EffectComposer', 'RenderPass', 'GTAOPass', 'OutputPass'].map(n => import('three/addons/postprocessing/' + n + '.js')));
      if (!alive) return;
      const mk = cam => { const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }), c = new EffectComposer(renderer, rt); c.addPass(new RenderPass(scene, cam)); const g = new GTAOPass(scene, cam, 4, 4); g.updateGtaoMaterial({ radius: 2.5, distanceExponent: 1, thickness: 2, scale: 1 }); g.blendIntensity = .9; c.addPass(g); c.addPass(new OutputPass()); return c; };
      HQ = { L: mk(camL), R: mk(camera) }; layoutViews();
    } catch (e) { console.warn('[디지털트윈] 고화질을 켜지 못했어요', e); hqWant = false; }
    hqLoading = false;
  }
  const SHOW_FPS = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&](fps|debug3d)\b/.test(location.search);   // 개발 중에만
  let fN = 0, fMs = 0, fT = 0, raf = 0, alive = true, lastR = 0, ft = [], qLevel = 0;
  function degrade(l) {
    if (l === 1) { renderer.setPixelRatio(1); size(); hqWant = false; $('[data-t="hq"]').setAttribute('aria-pressed', 'false'); }
    if (l === 2) { TREES.forEach(m => { m.castShadow = false; }); shadowDirty(); }
    if (l === 3) { renderer.shadowMap.enabled = false; scene.traverse(m => { if (m.material) [].concat(m.material).forEach(x => { x.needsUpdate = true; }); }); }
    const q = $('.tw-q'); if (q) { q.hidden = false; q.textContent = '느린 기기라 화질을 낮췄어요 (' + l + '/3)'; }
  }
  function frame(now) {
    if (!alive) return; raf = requestAnimationFrame(frame);
    if (fly) {
      const t = Math.min(1, (now - fly.t0) / (fly.dur * 1000)), e = ease(t);
      controls.target.lerpVectors(fly.a.t, fly.b.t, e); camera.position.lerpVectors(fly.a.p, fly.b.p, e); camera.lookAt(controls.target); dirty = labDirty = true;
      if (controls.target.distanceTo(ctr) > 140) { ctr.copy(controls.target); placeSun(false); }
      if (t >= 1) { const d = fly.done; fly = null; controls.enabled = true; ctr.copy(controls.target); placeSun(false); treeLOD(); if (d) d(); }
    } else if (controls.update()) dirty = true;
    if (dirty) {
      dirty = false; const t0 = performance.now(); draw(views, false); if (labDirty) { labDirty = false; placeLabels(); } fN++; fMs += performance.now() - t0;
      if (now - lastR < 120) { ft.push(now - lastR); if (ft.length >= 30) { const avg = ft.reduce((a, b) => a + b, 0) / ft.length; ft = []; if (avg > 32 && qLevel < 3) degrade(++qLevel); } }
      lastR = now; hqPend = hqWant; hqAt = now + 280;
    } else if (hqPend && now >= hqAt && !fly) { hqPend = false; if (HQ) draw(views, true); }
    if (SHOW_FPS && now - fT > 500) { $('.tw-fps').textContent = fN ? 'FPS ' + Math.round(fN * 1000 / (now - fT)) + ' · CPU ' + (fMs / fN).toFixed(1) + 'ms' : '멈춤 · 다시 그리지 않음' + (HQ && hqWant ? ' · 고화질' : ''); fN = 0; fMs = 0; fT = now; }
  }
  const ro = new ResizeObserver(size); ro.observe(root);

  // ---------- 시작 ----------
  labelsHTML(); timeText(); size(); treeLOD(); if ($('.tw-livebox')) $('.tw-livebox').innerHTML = liveHTML();
  placeSun(true);
  plans[pk(sel)] = buildPlan(sel, curV); showPlan(); lowHTML();
  if (hqWant) ensureHQ();
  if (/[?&]debug3d\b/.test(location.search)) window.__tw = { THREE, renderer, scene, camera, camL, get views() { return views; }, get trees() { return TMESH.map(p => p.map(m => m.count).join('/')).join(' '); }, get plan() { return plans[pk(sel)]; }, evalNow: () => plans[pk(sel)] && evalNow(plans[pk(sel)]), plans, setScn };
  root.querySelector('.tw-load').remove(); root.classList.add('in'); raf = requestAnimationFrame(frame);
  flyTo(planView(sel), 1.6, () => { root.classList.add('ready'); o.onReady && o.onReady(); layoutBlocks(); dirty = true; idle(); });
  function idle() { const h = lowList().find(x => !(pk(x) in plans)); if (!h || !alive) return; setTimeout(() => { if (!alive) return; planFor(h); lowHTML(); idle(); }, 60); }

  let leaving = false;
  function exit() {
    if (leaving) return; leaving = true; root.classList.remove('ready'); o.onLeave && o.onLeave();
    flyTo(above(sel), 1.4, () => { root.classList.add('out'); setTimeout(dispose, 400); });
  }
  function dispose() {
    alive = false; cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey); ro.disconnect(); controls.dispose(); clearItems();
    if (HQ) Object.values(HQ).forEach(c => { c.passes.forEach(p => p.dispose && p.dispose()); c.dispose(); });
    if (envRT) envRT.dispose(); pmrem.dispose(); envSky.geometry.dispose(); envSky.material.dispose();
    scene.traverse(m => { if (m.geometry && !disp.includes(m.geometry)) m.geometry.dispose(); });
    disp.forEach(d => d.dispose && d.dispose()); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); root.remove();
    o.onExit && o.onExit();
  }
  return { exit };
}
