// Module 1 + 3 — 룰베이스 프로그램 추천 & 실내·그늘 대체
// 대체 매핑은 주제서 p.7 "AI 대체 추천 예시"를 서울숲 실제 시설에 대응시킨 것.
import { hubLoad, loadStage } from './crowd.js';

export const GROUPS = [
  { key: 'family', label: '유아 동반 가족' },
  { key: 'youth', label: '청년' },
  { key: 'senior', label: '고령층' },
];

export const PURPOSES = [
  { key: 'rest', label: '회복·휴식' },
  { key: 'active', label: '활동·건강' },
  { key: 'discover', label: '자연·배움' },
  { key: 'social', label: '만남·경험' },
];

export const PROGRAMS = [
  { id: 'picnic', name: '가족마당 피크닉', hub: 'family-lawn', type: 'outdoor', groups: ['family', 'youth'], purpose: 'social', alt: ['insect', 'lakeside-rest'] },
  { id: 'splash', name: '거울연못 바닥분수 놀이', hub: 'mirror-pond', type: 'outdoor', groups: ['family'], purpose: 'social', alt: ['butterfly', 'eco-class'] },
  { id: 'photo-popup', name: '군마상 광장 포토 팝업', hub: 'horse-plaza', type: 'outdoor', groups: ['youth'], purpose: 'social', alt: ['culture-gym', 'lakeside-rest'] },
  { id: 'busking', name: '야외무대 버스킹·공연', hub: 'stage', type: 'outdoor', groups: ['youth', 'family'], purpose: 'social', alt: ['culture-gym'] },
  { id: 'run-crew', name: '코트 러닝·운동 크루', hub: 'courts', type: 'outdoor', groups: ['youth'], purpose: 'active', alt: ['shade-walk', 'culture-gym'] },
  { id: 'shade-walk', name: '생태숲 그늘 산책·사슴 관찰', hub: 'deer', type: 'shade', groups: ['family', 'senior'], purpose: 'rest', alt: ['eco-class', 'insect'] },
  { id: 'forest-play', name: '숲속놀이터 그늘 놀이', hub: 'forest-play', type: 'shade', groups: ['family'], purpose: 'social', alt: ['eco-class', 'butterfly'] },
  { id: 'wetland-calm', name: '습지생태원 조용한 명상 산책', hub: 'wetland', type: 'shade', groups: ['senior', 'youth'], purpose: 'rest', alt: ['lakeside-rest'] },
  { id: 'insect', name: '곤충식물원 관람', hub: 'insect', type: 'indoor', groups: ['family', 'senior'], purpose: 'discover', alt: [] },
  { id: 'butterfly', name: '나비정원 체험', hub: 'butterfly', type: 'indoor', groups: ['family'], purpose: 'discover', alt: [] },
  { id: 'eco-class', name: '방문자센터 생태교육 프로그램', hub: 'visitor', type: 'indoor', groups: ['family', 'senior'], purpose: 'discover', alt: [] },
  { id: 'lakeside-rest', name: '수변휴게실 실내 쉼터', hub: 'lake', type: 'indoor', groups: ['senior', 'youth'], purpose: 'rest', alt: [] },
  { id: 'culture-gym', name: '복합문화센터 실내 운동', hub: 'culture-ctr', type: 'indoor', groups: ['youth', 'senior'], purpose: 'active', alt: [] },
  { id: 'water-history', name: '수도박물관 「뚝도수원지 100년」 해설', hub: 'water-museum', type: 'indoor', groups: ['family', 'senior'], purpose: 'discover', alt: [] },
];

// 운영 일정(예시) — 관리자 탭의 "프로그램 전환 제안" 대상
export const SCHEDULE = [
  { programId: 'run-crew', hour: 7 },
  { programId: 'splash', hour: 11 },
  { programId: 'picnic', hour: 12 },
  { programId: 'forest-play', hour: 14 },
  { programId: 'photo-popup', hour: 15 },
  { programId: 'busking', hour: 18 },
  { programId: 'run-crew', hour: 19 },
];

export const TYPE_LABEL = { outdoor: '야외', shade: '그늘', indoor: '실내', gate: '입구' };

/** Is a facility type usable given the weather evaluation? */
export function typeAllowed(type, ev) {
  if (ev.overall < 2) return true;
  const d = new Set(ev.drivers);
  if (type === 'indoor') return true;
  if (type === 'shade') return !(d.has('pm25') || d.has('pm10') || d.has('pop')); // 그늘은 폭염·UV에만 유효
  return false; // outdoor blocked at warning
}

export function recommend({ ev, snap, hubs, group, purpose, dow, hour, limit = 4, approvedSwitches = {} }) {
  const hubById = Object.fromEntries(hubs.map((h) => [h.id, h]));
  const scored = PROGRAMS.map((p) => {
    const hub = hubById[p.hub];
    const load = hubLoad(hub, dow, hour, snap);
    const ratio = load?.ratio ?? 0;
    const allowed = typeAllowed(p.type, ev);
    let score = 0;
    const why = [];
    if (group && p.groups.includes(group)) { score += 2; why.push(GROUPS.find((g) => g.key === group).label + ' 맞춤'); }
    if (purpose && p.purpose === purpose) { score += 1.5; why.push(PURPOSES.find((x) => x.key === purpose).label); }
    if (ev.overall === 1) {
      if (p.type === 'indoor') { score += 1; why.push('주의 단계 · 실내 우선'); }
      if (p.type === 'shade' && ev.drivers.some((d) => d === 'feels' || d === 'uv')) { score += 1.2; why.push('그늘로 열 노출 감소'); }
      if (p.type === 'outdoor') score -= 1;
    }
    if (ev.overall === 2 && allowed && p.type !== 'outdoor') { score += 1.5; why.push(p.type === 'indoor' ? '경고 단계 · 실내 대체' : '경고 단계 · 그늘 대체'); }
    score += (1 - Math.min(1, ratio)) * 1.2;
    if (ratio < 0.4) why.push('지금 한산함');
    if (approvedSwitches[p.id]) { score += 1; why.push('관리자 전환 프로그램'); }
    return { ...p, hubName: hub.name, zone: hub.zone, load, crowd: loadStage(ratio), allowed, score, why };
  });
  return scored.filter((p) => p.allowed).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Admin: scheduled outdoor programs that must switch, with the best alternative. */
export function switchProposals({ hubs, dow, hourly, evaluateFn }) {
  const hubById = Object.fromEntries(hubs.map((h) => [h.id, h]));
  const byHour = Object.fromEntries(hourly.map((h) => [h.hour, h]));
  return SCHEDULE.map((s) => {
    const p = PROGRAMS.find((x) => x.id === s.programId);
    const snap = byHour[s.hour];
    if (!snap) return null; // already past (outside 24h window)
    const ev = evaluateFn(snap);
    const ok = typeAllowed(p.type, ev);
    const alts = p.alt
      .map((id) => PROGRAMS.find((x) => x.id === id))
      .filter((a) => typeAllowed(a.type, ev))
      .map((a) => ({ ...a, hubName: hubById[a.hub].name, load: hubLoad(hubById[a.hub], dow, s.hour, snap) }))
      .sort((a, b) => (a.load?.ratio ?? 0) - (b.load?.ratio ?? 0));
    return { ...s, program: p, hubName: hubById[p.hub].name, stage: ev.overall, drivers: ev.drivers, needsSwitch: !ok || ev.overall === 1, mustSwitch: !ok, alternative: alts[0] ?? null };
  }).filter(Boolean);
}
