// 서울숲 프로그램: 서울시 공공서비스예약(중계 서버 proxy/seoul-programs, 3시간 캐시)에서 받아
// 이용자에게 맞는 '이번 주 프로그램'으로 바꿉니다. 대관(연습실·회의실)과 체육시설 예약은 뺍니다.
// 서버를 못 받으면 data/programs.json(같은 모양의 저장본)을 씁니다.
import { PROGRAMS_URL } from './config.js';

export async function fetchPrograms(timeoutMs = 9000) {
  if (!PROGRAMS_URL) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(PROGRAMS_URL, { signal: ctl.signal });
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d?.items) ? d : null;
  } catch { return null; } finally { clearTimeout(t); }
}

const DOW = '일월화수목금토';
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 제목에서 요일 읽기: '-일', '(토)', '(수, 10시/ 금, 10시)', '일요가족…' */
export function programDays(title = '') {
  const s = new Set();
  for (const m of title.matchAll(/[(\-\s/,]([월화수목금토일])(?=[,)\s]|$)/g)) s.add(DOW.indexOf(m[1]));
  if (/일요/.test(title)) s.add(0);
  return [...s].sort();
}
/** 화면용 짧은 이름: [서울숲]·(11월)·-일 같은 꼬리표를 뗌 */
export function shortTitle(title = '') {
  return title.replace(/\[서울숲[^\]]*\]|\(서울숲\)|서울숲,\s*/g, '').replace(/\((토|일|월|화|수|목|금)\)/g, '').replace(/\(\d+월\)|\/\s*\d+월/g, '')
    .replace(/\s*-\s*[월화수목금토일]\s*$/, '').replace(/\([^)]*\d+시[^)]*\)/g, '').replace(/\(\d{4}서울숲[^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}
const PLACE_HUB = [[/곤충식물원/, 'insect'], [/나비정원/, 'butterfly'], [/방문자센터/, 'visitor'], [/복합문화센터/, 'culture-ctr']];
/** 누구를 위한 프로그램인지: group(단체만) / kids(어린이·가족) / adult(성인) / all */
export function whoFor(p) {
  const t = `${p.target ?? ''} ${p.title ?? ''}`;
  return /단체/.test(t) ? 'group' : /어린이|가족|유아|초등|아동/.test(t) ? 'kids' : /성인/.test(t) ? 'adult' : 'all';
}
const minutesOf = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? ''); return m ? +m[1] * 60 + +m[2] : null; };

/**
 * 앞으로 14일 안에 열리는 회차. 반환: [{p, title, days, next(Date|null), nextLabel, hub, who, open(예약 가능)}]
 * 요일을 제목에서 못 읽으면 기간 안이면 '기간 중'으로 둠
 */
export function upcomingPrograms(programs, now = new Date(), days = 14) {
  const items = (programs?.items ?? []).filter(p => /^(교육강좌|문화체험)/.test(p.kind ?? '교육강좌') && p.useTo);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out = [];
  const today = isoOf(now), last = isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  const md = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  for (const p of items) {
    if (p.status === '접수종료') continue;
    const ds = programDays(p.title), start = minutesOf(p.time);
    let next = null, label = null;
    if (ds.length) {
      for (let d = 0; d < days; d++) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d), key = isoOf(day);
        if ((p.useFrom && key < p.useFrom) || key > p.useTo || !ds.includes(day.getDay())) continue;
        if (d === 0 && start != null && start <= nowMin) continue;
        next = day; break;
      }
      if (!next) continue;
      const dd = Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
      label = `${dd === 0 ? '오늘' : dd === 1 ? '내일' : dd < 7 ? `${DOW[next.getDay()]}요일` : `${next.getMonth() + 1}/${next.getDate()}(${DOW[next.getDay()]})`} ${p.time?.split('~')[0] ?? ''}`.trim();
    } else if ((!p.useFrom || p.useFrom <= today) && today <= p.useTo) {
      next = new Date(now.getFullYear(), now.getMonth(), now.getDate()); label = `${md(p.useTo)}까지 운영`;        // 요일을 모르는 것: 기간만
    } else if (p.useFrom && p.useFrom > today && p.useFrom <= last) {
      next = new Date(p.useFrom + 'T00:00'); label = `${md(p.useFrom)}부터`;
    } else continue;
    out.push({
      p, title: shortTitle(p.title), days: ds, next, nextLabel: label,
      hub: PLACE_HUB.find(([re]) => re.test(p.place ?? ''))?.[1] ?? null, who: whoFor(p),
      open: p.status === '접수중', soon: p.status === '안내중', full: /마감|종료/.test(p.status ?? ''),
    });
  }
  return out.sort((a, b) => a.next - b.next);
}

/** 같이 온 사람·하고 싶은 것에 맞춰 고르기. company 없으면 날짜 순 */
export function pickPrograms(list, company = null, need = null, n = 3) {
  const fit = x => {
    if (x.who === 'group') return -9;          // 단체 신청만 받는 것은 개인 추천에서 뺌
    let s = 0;
    if (company === 'kids') s += x.who === 'kids' ? 3 : x.who === 'all' ? 1 : -3;
    else if (company) s += x.who === 'adult' ? 2 : x.who === 'all' ? 1 : -2;
    if (need === 'learn') s += 1;
    if (x.open) s += 1;                        // 지금 예약할 수 있는 것을 먼저
    if (x.full) s -= 2;
    return s;
  };
  return list.map(x => ({ x, s: fit(x) })).filter(({ s }) => !company || s >= 0).sort((a, b) => b.s - a.s || a.x.next - b.x.next).slice(0, n).map(({ x }) => x);
}
