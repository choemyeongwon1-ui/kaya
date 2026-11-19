// 시민 화면: 하고 싶은 일·머물 시간·같이 온 사람 → 갈 곳 3곳과 이유
import { AFFINITY, AFFINITY_DEFAULT, AFF_FIT, AFF_MIN, HOURS, HOURS_DEFAULT_INDOOR, COMPANY, COMPANY_W, PET, NEEDS, ACTIVE_NEEDS, COLD, COOL, WARM, NIGHT, CROWD_STOP, LOOKAHEAD, LATER_MAX, WEIGHTS, SPEED, HEAVY_RAIN, FLOOD_AFTER, QUIET_LEVEL, CROWD_SENS, WATERSIDE, WATER_BONUS, WATER_ON } from './config.js';
import { hubLoad, crowdLabel, dayCurve } from './crowd.js';
import { dijkstra } from './graph.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** 받침에 따라 조사를 고릅니다: josa('체험', '과', '와') → '과' */
export const josa = (word, withFinal, without) => { const c = word.charCodeAt(word.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? withFinal : without; };
export const fmtDur = min => { const m = Math.max(0, Math.round(min / 10) * 10); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`; };
export const speedFor = (company, slow = false) => (slow || company === 'kids' || company === 'elders') ? SPEED.slow : SPEED.normal;

/** 그 시각에 문을 여는지. 야외·그늘 자리는 운영시간이 없습니다 */
export function openState(place, month, dow, hour) {
  const info = HOURS[place.id] ?? (place.type === 'indoor' ? HOURS_DEFAULT_INDOOR : null);
  if (!info) return { open: true };
  const season = info.seasons.find(s => s.months === 'all' || s.months.includes(month));
  if (!season) return { open: false, sub: 'season', info };
  if (info.closedDow?.includes(dow)) return { open: false, sub: 'dayoff', info };
  if (hour < season.open) return { open: false, sub: 'before', openAt: season.open, info };
  if (hour >= season.close) return { open: false, sub: 'after', closeAt: season.close, info };
  return { open: true, closeAt: season.close, info };
}

/** 큰비(호우 경고 단계: 기존 대시보드와 같은 기준) */
export const isHeavyRain = h => !!h.heavyRain || (h.precip ?? 0) >= HEAVY_RAIN;

/**
 * 한 시각에 그 자리에 머물 수 있는지와 안 되는 이유(운영시간 → 밤 → 물이 차는 구역 → 날씨 → 추위).
 * 붐빔은 머물 수 있는 시간과 따로 봅니다(crowded).
 * flooded: 큰비가 오거나 그친 지 FLOOD_AFTER시간이 안 됐고, 그 자리가 유수지·하천구역인지 (stayWindow에서 계산)
 */
export function hourStatus(place, h, dow, month, need, flooded = false) {
  const load = hubLoad(place, dow, h.hour, h);
  const base = { load, crowded: (load?.ratio ?? 0) >= CROWD_STOP };
  const o = openState(place, month, dow, h.hour);
  if (!o.open) return { ok: false, why: 'hours', o, ...base };
  if (place.type !== 'indoor') {
    if (h.hour >= NIGHT.from || h.hour < NIGHT.to) return { ok: false, why: 'night', ...base };
    // 유수지·하천구역(법적 구역, data/legal.json)은 큰비 때 빗물을 담거나 물이 차는 곳이라 야외 자리를 권하지 않습니다.
    if (flooded) return { ok: false, why: 'flood', ...base };
    // 날씨: 야외는 주의 단계부터 어렵고, 그늘 자리는 경고 단계의 미세먼지일 때 어렵습니다(기존 대시보드와 같음).
    // 비가 올 때는 그늘 자리도 어렵다고 봅니다(이 화면에서 더한 규칙).
    const wet = h.heavyRain || (h.pop ?? 0) >= 60 || (h.precip ?? 0) >= 1;
    const drv = new Set(h.ev.drivers);
    if (place.type === 'outdoor' ? h.ev.overall >= 1 : wet || (h.ev.overall >= 2 && (drv.has('pm25') || drv.has('pm10'))))
      return { ok: false, why: 'weather', driver: wet ? 'pop' : h.ev.drivers.find(d => place.type === 'outdoor' || d === 'pm25' || d === 'pm10') ?? h.ev.drivers[0], ...base };
    if (h.feels != null && h.feels < (ACTIVE_NEEDS.has(need) ? COLD.active : COLD.still)) return { ok: false, why: 'cold', ...base };
  }
  return { ok: true, o, ...base };
}

const DRIVER_WORD = { feels: '더위', uv: '강한 자외선', pm25: '미세먼지', pm10: '미세먼지', pop: '비' };
function stopText(s) {
  if (!s) return null;
  if (s.why === 'hours') return { season: '지금 계절에는 운영하지 않음', dayoff: '오늘은 휴관일', before: `${s.o.openAt}시에 문을 엶`, after: `${s.o.closeAt}시 운영 종료` }[s.o.sub];
  if (s.why === 'night') return `밤 ${NIGHT.from}시 이후`;
  if (s.why === 'flood') return '큰비로 물이 차는 구역';
  if (s.why === 'weather') return DRIVER_WORD[s.driver] ?? '날씨';
  if (s.why === 'cold') return '추위';
  return null;
}

/** 지금부터 몇 시까지 머물 수 있는지 (운영시간·밤·날씨·추위 기준) */
export function stayWindow(place, wx, now, need) {
  let lastHeavy = -Infinity;
  const tl = wx.hourly.slice(0, LOOKAHEAD + 1).map(h => {
    const dow = (now.dow + Math.floor((now.hour + h.offset) / 24)) % 7;
    if (isHeavyRain(h)) lastHeavy = h.offset;
    const flooded = !!place.flood && h.offset - lastHeavy <= FLOOD_AFTER;
    return { hour: h.hour, offset: h.offset, ...hourStatus(place, h, dow, wx.month ?? now.month, need, flooded) };
  });
  let hours = 0;
  while (hours < tl.length && tl[hours].ok) hours++;
  const stop = hours < tl.length ? tl[hours] : null;
  const remainMin = hours ? Math.max(0, hours * 60 - now.minute) : 0;
  const next = hours === 0 ? tl.find(t => t.ok) ?? null : null;
  const info = HOURS[place.id] ?? (place.type === 'indoor' ? HOURS_DEFAULT_INDOOR : null);
  return { hours, remainMin, until: hours ? (now.hour + hours) % 24 : null, open: !stop, stop, stopText: stopText(stop), nextOk: next ? next.hour : null, nextOffset: next ? next.offset : null,
    timeline: tl, unsure: !!(info && !info.sure), hoursInfo: info };
}

/** 머무는 동안의 날씨 성격: 비·미세먼지·더움·쌀쌀·추움·보통 */
export function thermalMode(wx, stayMin) {
  const hrs = wx.hourly.slice(0, Math.max(1, Math.ceil(stayMin / 60)));
  const fmax = Math.max(...hrs.map(h => h.feels ?? 15)), fmin = Math.min(...hrs.map(h => h.feels ?? 15));
  const day = hrs.filter(h => h.day).length >= hrs.length / 2;
  const key = hrs.some(h => h.heavyRain || (h.pop ?? 0) >= 60 || (h.precip ?? 0) >= 1) ? 'rain'
    : hrs.some(h => (h.pm25 ?? 0) >= 36 || (h.pm10 ?? 0) >= 81) ? 'dust'
    : fmax >= WARM ? 'hot' : fmin < COLD.still ? 'cold' : fmax < COOL ? 'cool' : 'mild';
  return { key, day, uvHigh: hrs.some(h => (h.uv ?? 0) >= 6), fmax, fmin };
}
export const MODE_TEXT = { rain: '비가 옵니다', dust: '미세먼지가 나쁩니다', hot: '덥습니다', cold: '춥습니다', cool: '쌀쌀합니다', mild: '걷기 좋은 날씨입니다' };
export const MODE_NOUN = { rain: '비', dust: '미세먼지', hot: '더위', cold: '추위', cool: '쌀쌀함', mild: '맑음' };

function thermalScore(place, mode, waterOn = false) {
  const tree = place.tree ?? .5, indoor = place.type === 'indoor';
  switch (mode.key) {
    case 'rain': return indoor ? 1 : place.type === 'shade' ? .3 : 0;
    case 'dust': return indoor ? 1 : .3;
    case 'cold': return indoor ? 1 : .2;
    case 'hot':  return indoor ? .9 : Math.min(1, tree + (waterOn && WATERSIDE.has(place.id) ? WATER_BONUS : 0));
    case 'cool': return indoor ? .8 : mode.day ? .4 + .6 * (1 - tree) : .5;
    default:     return indoor ? .6 : mode.uvHigh ? .5 + .5 * tree : .75;
  }
}

function shadeReason(place, mode) {
  if (place.type === 'indoor') return { value: '실내', note: '볕·비·추위를 피할 수 있음', tone: mode.key === 'mild' ? 'plain' : 'good' };
  // 팀 격자 밖(습지생태원 구역)은 나무 비율을 모른다. 기존 대시보드가 '그늘 자리'로 분류한 곳은 그 분류만 알려 준다.
  const known = place.tree != null;
  if (!known && place.type !== 'shade') return { value: '자료 없음', note: '나무 그늘 자료가 없는 자리', tone: 'plain' };
  const pct = known ? Math.round(place.tree * 100) : null, value = known ? `나무 그늘 ${pct}%` : '그늘 자리';
  if (mode.key === 'rain') return { value, note: '나무 아래도 비를 다 막지는 못함', tone: 'bad' };
  if (!mode.day) return { value, note: '해가 져서 그늘 차이는 없음', tone: 'plain' };
  if (!known) return { value, note: '분석 범위 밖이라 그늘 비율은 모름', tone: 'plain' };
  if (mode.key === 'hot' || (mode.key === 'mild' && mode.uvHigh))
    return pct >= 60 ? { value, note: '그늘이 넉넉함', tone: 'good' } : pct >= 30 ? { value, note: '그늘이 드문드문 있음', tone: 'mid' } : { value, note: '그늘이 거의 없음', tone: 'bad' };
  if (mode.key === 'cool' || mode.key === 'cold')
    return pct >= 60 ? { value, note: '그늘이 많아 쌀쌀할 수 있음', tone: 'mid' } : pct < 30 ? { value, note: '볕이 잘 드는 자리', tone: 'good' } : { value, note: '볕과 그늘이 섞여 있음', tone: 'plain' };
  return pct >= 60 ? { value, note: '그늘이 넉넉함', tone: 'plain' } : pct < 30 ? { value, note: '볕이 잘 드는 자리', tone: 'plain' } : { value, note: '볕과 그늘이 섞여 있음', tone: 'plain' };
}

const WHY_TEXT = {
  crowd: '붐비는 시간대라', hours: '문을 연 곳이 적어', night: '밤이라', flood: '큰비로 물이 차는 구역이라', weather: '날씨 때문에', cold: '추워서', short: '머물 수 있는 시간이 짧아', need: '이 일에 맞는 자리가 적어',
};

/**
 * 추천 계산
 * input: {need, stay(분), company, slow(휠체어·유모차), startNode, startOff}
 * 반환: {picks(최대 3), all, fit('good'|'partial'|'none'), suitable(개수), mode, speed, mainWhy, whyText}
 *  - 각 추천의 tier: 0 = 지금 조건에 맞음 / 1 = 갈 수는 있으나 붐비거나 시간이 짧음 / 2 = 곧(LATER_MAX 시간 안에) 가능 / 3 = 그보다 뒤에 가능(밤이면 내일 아침). 3은 갈 곳이 3곳이 안 될 때만 채웁니다
 */
export function recommend(model, wx, now, input) {
  const { need, stay, company } = input;
  const speed = speedFor(company, input.slow);
  const group = COMPANY.find(c => c.key === company)?.group ?? null;
  const mode = thermalMode(wx, stay);
  // 물가가 더 시원한 때: 기온 33℃ 이상인 10~16시(조현민·권태경 2022)
  const h0 = wx.hourly?.[0] ?? {}, t0 = h0.temp ?? h0.feels;
  const waterOn = t0 != null && t0 >= WATER_ON.temp && h0.hour >= WATER_ON.from && h0.hour <= WATER_ON.to;
  const fromStart = dijkstra(model.g, [{ node: input.startNode, d0: input.startOff ?? 0 }], e => e.len, { barrierFree: !!input.slow });
  const w = { ...WEIGHTS, ...(COMPANY_W[company] ?? {}) };
  if (stay <= 30) w.walk = Math.max(w.walk, 15);
  const pet = company === 'pet';
  const wsum = Object.values(w).reduce((a, b) => a + b, 0);
  const needLabel = NEEDS.find(n => n.key === need)?.label ?? '';
  const want = Math.min(stay, 180), walkCap = clamp(stay * .25, 10, 25);

  const all = model.places.map(place => {
    const win = stayWindow(place, wx, now, need);
    const walkM = Math.round(fromStart.plen[place.node] + place.off), reachable = Number.isFinite(walkM);
    const walkMin = reachable ? Math.max(1, Math.round(walkM / speed)) : null;
    const aff = AFFINITY[place.id]?.[need] ?? AFFINITY_DEFAULT;
    // 머무는 동안의 혼잡: 지금, 평균, 가장 붐비는 때
    const span = win.timeline.slice(0, Math.max(1, Math.min(win.hours || 1, Math.ceil(stay / 60))));
    const ratios = span.map(t => t.load?.ratio ?? 0);
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length, ratioNow = ratios[0];
    const peakI = ratios.indexOf(Math.max(...ratios));
    const crowded = avg >= CROWD_STOP;
    const calm = crowded ? win.timeline.slice(0, win.hours || 0).find(t => (t.load?.ratio ?? 0) < .7) ?? null : null;
    const parts = {
      need: aff,
      // 반려견: 산책하기 좋은 야외 자리일수록 높게(걷기 적합도를 씀)
      company: pet ? clamp(.4 + .6 * (AFFINITY[place.id]?.walk ?? AFFINITY_DEFAULT)) : group ? (place.groups?.includes(group) ? 1 : .35) : .6,
      stay: clamp(win.remainMin / want),
      crowd: 1 - clamp(avg * (CROWD_SENS[place.id] ?? 1)),
      thermal: thermalScore(place, mode, waterOn),
      toilet: clamp(1 - place.dToilet / 300),
      walk: reachable ? clamp(1 - walkMin / walkCap) : 0,
    };
    const score = Object.keys(w).reduce((a, k) => a + w[k] * parts[k], 0) / wsum * 100;
    const nowC = crowdLabel(ratioNow), peakC = crowdLabel(ratios[peakI]);
    const enough = win.remainMin >= want * .75;
    // 지금은 못 가지만 나중에 갈 수 있는 곳은 '그때'의 붐빔을 보여 줍니다
    const later = win.hours === 0 && win.nextOk != null ? win.timeline.find(t => t.offset === win.nextOffset) : null;
    const laterC = later ? crowdLabel(later.load?.ratio ?? 0) : null;
    const nextText = later ? `${now.hour + win.nextOffset >= 24 ? '내일 ' : ''}${win.nextOk}시부터 가능` : null;
    const reasons = {
      shade: shadeReason(place, mode),
      toilet: place.toiletInside ? { value: '건물 안', note: '시설 안 화장실 이용', tone: 'good' }
        : { value: `${place.dToilet}m`, note: `걸어서 ${Math.max(1, Math.round(place.dToilet / speed))}분`, tone: place.dToilet <= 150 ? 'good' : place.dToilet <= 250 ? 'plain' : 'bad' },
      crowd: later
        ? { value: `${win.nextOk}시쯤 ${laterC.label}`, tone: laterC.tone === 'good' ? 'good' : laterC.tone === 'warning' ? 'plain' : 'bad', crowd: laterC, ratio: later.load?.ratio ?? 0, note: `그때 수용의 ${Math.round((later.load?.ratio ?? 0) * 100)}%` }
        : { value: nowC.label, tone: nowC.tone === 'good' ? 'good' : nowC.tone === 'warning' ? 'plain' : 'bad', crowd: nowC, ratio: ratioNow,
            note: `수용의 ${Math.round(ratioNow * 100)}%` + (calm ? ` · ${calm.hour}시쯤 한산해짐` : peakI > 0 && peakC.key !== nowC.key ? ` · ${span[peakI].hour}시쯤 ${peakC.label}` : crowded ? ' · 머무는 동안 계속 붐빔' : '') },
      stay: win.hours
        ? { value: win.open ? `${win.until}시 넘어서까지` : `${win.until}시까지`, tone: enough ? 'good' : 'mid',
            note: `앞으로 ${fmtDur(win.remainMin)}${win.open ? ' 이상' : ''}` + (win.stopText ? ` · 그 뒤 ${win.stopText}` : '') + (win.unsure ? ' · 운영시간 확인 필요' : '') }
        : { value: '지금은 어려움', note: [win.stopText, nextText].filter(Boolean).join(' · '), tone: 'bad' },
    };
    const match = [];
    if (aff >= .7) match.push(`‘${needLabel}’에 잘 맞는 곳`); else if (aff >= AFF_FIT) match.push(`‘${needLabel}’도 할 수 있는 곳`);
    if (pet ? parts.company >= .8 : group && place.groups?.includes(group)) match.push(`${COMPANY.find(c => c.key === company).label} 가기 좋음`);
    // 반려견과 함께면 건물 안·어린이 놀이터는 빼고(가정), 동물을 기르는 곳은 확인 필요로 알립니다
    const petBlocked = pet && (PET.no.has(place.id) || (PET.noIndoor && place.type === 'indoor'));
    const usable = win.hours > 0 && reachable, suitable = usable && enough && !crowded && aff >= AFF_FIT;
    const tier = petBlocked ? 9 : suitable ? 0 : usable && aff >= AFF_MIN ? 1 : !usable && reachable && later && aff >= AFF_MIN ? (win.nextOffset <= LATER_MAX ? 2 : 3) : 9;
    const flags = [];
    if (pet && PET.check.has(place.id)) flags.push('반려견 출입 확인 필요');
    if (tier === 1) { if (crowded) flags.push('지금 매우 붐빔'); if (!enough) flags.push(`${fmtDur(win.remainMin)}만 머물 수 있음`); if (!crowded && enough) flags.push(`‘${needLabel}’${josa(needLabel, '과', '와')}는 조금 다른 자리`); }
    if (tier === 2 || tier === 3) flags.push(nextText);
    if (tier < 9 && win.timeline.some(t => t.why === 'flood')) flags.unshift(`${model.zoneOf?.(place.legal)?.label ?? '물이 차는 구역'} · 큰비 뒤 ${FLOOD_AFTER}시간은 피함`);
    // 서울숲이 맞지 않는 까닭을 셀 때 쓰는 값
    const miss = suitable ? null : aff < AFF_FIT ? 'need' : !usable ? win.timeline[0].why : crowded ? 'crowd' : 'short';
    return { place, score, parts, win, crowd: laterC ?? nowC, crowded, avg, walkM, walkMin, aff, reasons, match, flags, suitable, usable, tier, miss };
  });

  const picks = all.filter(r => r.tier < 9).sort((a, b) => a.tier - b.tier || (a.tier >= 2 ? a.win.nextOffset - b.win.nextOffset : 0) || b.score - a.score).slice(0, 3);
  const good = all.filter(r => r.suitable).length;
  const fit = good >= 3 ? 'good' : good ? 'partial' : 'none';
  // 이 일에 맞는 자리(적합도 AFF_FIT 이상)가 지금 왜 안 되는지 — 가장 흔한 이유
  const why = {};
  for (const r of all) if (r.aff >= AFF_FIT && r.miss) why[r.miss] = (why[r.miss] ?? 0) + 1;
  const mainWhy = Object.entries(why).sort((a, b) => b[1] - a[1])[0]?.[0] ?? (good < 3 ? 'need' : null);
  return { picks, all, fit, suitable: good, mode, speed, mainWhy, whyText: mainWhy ? WHY_TEXT[mainWhy] : null, weights: w };
}

/**
 * '언제 가면 한산한가': 앞으로 24시간 중 공원이 열린 낮 시간(6~22시)마다 방문 수준과 날씨를 함께 봅니다.
 * 방문 수준은 요일·시각 곡선(crowd.js dayCurve, 서울숲 보행 계수기 연구의 패턴)이고, 날씨는 위 판정(주의 이상이면 야외에 머물기 어려움)과 추위 기준입니다.
 * 반환: {hours:[{hour, offset, tomorrow, level, quiet, wxOk, why, good}], best:[연속된 좋은 시간대 {from, to, tomorrow}], now}
 */
export function quietHours(wx, now) {
  const hours = wx.hourly.filter(h => h.hour >= NIGHT.to && h.hour < NIGHT.from).map(h => {
    const day = Math.floor((now.hour + h.offset) / 24), dow = (now.dow + day) % 7;
    const level = dayCurve(dow, h.hour), quiet = level < QUIET_LEVEL;
    const cold = h.feels != null && h.feels < COLD.still;
    const wxOk = h.ev.overall === 0 && !cold;
    const why = wxOk ? null : cold ? '추위' : DRIVER_WORD[h.ev.drivers[0]] ?? '날씨';
    return { hour: h.hour, offset: h.offset, tomorrow: day > 0, level, quiet, wxOk, why, good: quiet && wxOk };
  });
  const best = [];
  for (const x of hours) {
    const last = best[best.length - 1];
    if (!x.good) continue;
    if (last && last.toOffset === x.offset - 1) { last.to = (x.hour + 1) % 24; last.toOffset = x.offset; }
    else best.push({ from: x.hour, to: (x.hour + 1) % 24, toOffset: x.offset, tomorrow: x.tomorrow });
  }
  return { hours, best, now: hours.find(x => x.offset === 0) ?? null };
}

/** 공원 밖 무료 장소. 날씨가 나쁘면 실내를, 붐빌 때는 공원을 먼저 보여 줍니다 */
export function nearbyPlaces(model, now, mode, speed, maxWalk = 1600) {
  const bad = ['rain', 'dust', 'cold', 'hot'].includes(mode.key) || !mode.day;
  const office = now.dow >= 1 && now.dow <= 5 && now.hour >= 9 && now.hour < 18;
  const libOpen = now.hour >= 9 && now.hour < 18;                     // 공공도서관 자료실의 흔한 운영 시간(가정)
  const KIND = { library: '도서관', community: '주민센터', park: '공원' };
  return model.data.nearby.places.filter(p => (p.walk ?? p.d * 1.6) <= maxWalk).map(p => {
    const walk = p.walk ?? Math.round(p.d * 1.6);
    let note, ok = true;
    if (p.kind === 'library') { ok = libOpen; note = libOpen ? '책 읽으며 쉬기 · 보통 9~18시(더 늦게까지 여는 곳도 있음) · 휴관일은 방문 전 확인' : '보통 9~18시에 문을 엶 — 지금은 닫혀 있을 가능성이 큼'; }
    else if (p.kind === 'community') { ok = office; note = office ? '평일 낮에 문을 엶 · 무더위·한파 쉼터로 지정된 곳이 많음(지정 여부 확인)' : '평일 9~18시에 문을 엶 — 지금은 닫혀 있을 가능성이 큼'; }
    else { ok = !bad; note = !mode.day ? '밤에는 권하지 않음' : bad ? `야외라 지금 같은 날씨(${MODE_NOUN[mode.key]})에는 맞지 않음` : '서울숲이 붐빌 때 갈 수 있는 한적한 야외'; }
    const pri = (ok ? 0 : 10) + (bad ? (p.kind === 'park' ? 5 : 0) : (p.kind === 'park' ? 0 : 1));
    return { ...p, kindLabel: KIND[p.kind], walk, walkMin: Math.max(1, Math.round(walk / speed)), note, ok, pri, estimated: p.walk == null };
  }).sort((a, b) => a.pri - b.pri || a.walk - b.walk);
}
