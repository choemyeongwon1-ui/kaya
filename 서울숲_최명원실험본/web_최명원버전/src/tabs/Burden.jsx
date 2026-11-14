import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cssVar } from '../components/MapView.jsx';
import StoryMap from '../components/StoryMap.jsx';
import '../b3.css';
import { useReveal, CountUp } from '../components/motion.jsx';
import { nearestNode } from '../lib/astar.js';
import { RULES, stageOf, STAGE_META } from '../lib/risk.js';
import { PROGRAMS } from '../lib/recommend.js';
import {
  BURDENS, SCENES, PERSONAS, ACT_COLOR, sceneScore, percentile, mix, bestHubs, burdenRoute, nearestHub,
} from '../lib/burden.js';

// [최명원 버전] 목표 3 — 부담지도 전략 이야기 (10장면, 스크롤 한 번 = 한 장면)
// ① 문제 → ② 정의 → ③ 측정 → ④ 진단 → ⑤ 처방 → ⑥ 검증, 지도 하나로
// 주제서(AI-CCS 학부생 주제 01) 항목은 장면마다 "주제서 p.○" 꼬리표 + 끝의 대응표

const nf = (n) => Math.round(n).toLocaleString('ko-KR');
const STAGES = [
  ['①', '문제', '성수엔 돈 없이 머물 곳이 없다'],
  ['②', '정의', '만족도 = 부담 없이 머무를 수 있는가'],
  ['③', '측정', '수요 · 공급 · 이유'],
  ['④', '진단', '부담이 겹친 땅'],
  ['⑤', '처방', '고치고, 피하게 하고'],
  ['⑥', '검증', '머물 수 있는 땅·시간이 늘었나'],
];
const PROBLEMS = ['좁은 집', '유료화된 거리', '고립', '기후 · 서울숲 악화'];
const FIX = [
  { key: 'cost', acts: ['water'], kano: '매력', space: '음수대 · 피크닉 테이블', service: '돗자리 · 의자 · 책 무료 대여' },
  { key: 'time', acts: ['light'], kano: '성능', space: '보행등 · 야간 머무름 동선', service: '실내시설 저녁 · 겨울 운영 연장 제안' },
  { key: 'mind', acts: ['seat'], kano: '성능', space: '가장자리 1인 자리 · 이동식 의자', service: '혼자 오는 예약 없는 무료 프로그램' },
  { key: 'body', acts: ['rest', 'toilet'], kano: '기본', space: '벤치 간격 · 무장애 동선 · 화장실 접근', service: '화장실 가까운 산책 코스 안내' },
  { key: 'env', acts: ['shade', 'buffer'], kano: '기본', space: '녹음수 · 그늘막 · 도로변 수림대', service: '폭염 · 미세먼지 때 대체 장소 추천' },
];
const MEASURE = [
  { key: 'demand', label: '수요', color: '--b-time', q: '누가, 언제 오나', d: '생활인구로 시간대·연령별 수요 → 대표 거점만 현장 계수로 보정', map: '진할수록 붐비는 칸' },
  { key: 'supply', label: '공급', color: '--good-b', q: '머물 자리는 어디에', d: '다섯 부담 평균 = 머물 자리 지도 (OSM 시설 + 위성)', map: '초록 = 머물기 쉬움 · 빨강 = 어려움' },
  { key: 'reason', label: '이유', color: '--b-mind', q: '왜 불만족하나', d: '리뷰 불만을 다섯 부담으로 분류 → 날씨별 비율 → IPA 설문', map: '보라 = 부담 2개 이상, 불만이 나올 만한 곳(가설)' },
];
// 1장면에서 지도에 차례로 뜨는 대표 상점 (지표는 build.py가 OSM에서 계산)
const SHOP_VIEW = {
  스타벅스: { title: '스타벅스 성수역 앞', side: 'lu' },
  '카페 어니언': { title: '카페 어니언', side: 'ru' },
  대림창고: { title: '대림창고', side: 'rd' },
  Nudake: { title: '누데이크', side: 'ld' },
  '메가엠지씨커피 서울숲역점': { title: '메가커피 서울숲역점', side: 'ru' },
  'Center Coffee': { title: '센터커피', side: 'lu' },
};
const shopNote = (l) => (l.dPark < 30 ? `서울숲 경계에서 ${l.dPark}m · 숲 입구에도 카페` : l.dPark < 300 ? `서울숲까지 ${l.dPark}m인데도 반경 300m 유료 ${l.n300}곳` : `반경 300m 안 유료 ${l.n300}곳`);
// 모듈 1: 날씨 단계에 따라 야외 프로그램을 실내·그늘 대체 프로그램으로 전환 (기준: 주제서 p.7 예시)
const WX = [
  { key: 'ok', label: '보통 날', color: '--good-b', stage: 0, rule: '체감온도 31℃ 미만 · PM2.5 36 미만', allow: () => true },
  { key: 'heat', label: '폭염 경고', color: '--warn-b', stage: 2, rule: '체감온도 33℃ 이상', allow: (t) => t !== 'outdoor' },
  { key: 'dust', label: '미세먼지 매우나쁨', color: '--b-env', stage: 2, rule: 'PM2.5 76㎍/㎥ 이상', allow: (t) => t === 'indoor' },
];
const WK = WX.map((w) => w.key);
const SWAP_IDS = ['picnic', 'splash', 'run-crew', 'shade-walk'];
const HUB_SIDE = { 'family-lawn': 'lu', 'mirror-pond': 'ru', courts: 'ru', deer: 'lu', insect: 'ld', butterfly: 'rd', 'culture-ctr': 'ru', visitor: 'ld', lake: 'rd' };
function programSwaps(wKey) {
  const w = WX.find((x) => x.key === wKey) ?? WX[0];
  return SWAP_IDS.map((id) => PROGRAMS.find((p) => p.id === id)).filter(Boolean).map((p) => {
    const off = !w.allow(p.type);
    const alt = off ? p.alt.map((a) => PROGRAMS.find((q) => q.id === a)).find((q) => q && w.allow(q.type)) : null;
    return { p, off, alt };
  });
}
const CURATE = [
  { key: 'heat', label: '폭염 경보 (모듈 1)' },
  ...PERSONAS.map((p) => ({ key: p.key, label: `${p.label} (모듈 2)` })),
];

/* ---------------- 장면(지도 상태) ---------------- */
function useScenes(data, theme, snap, bPick, mPick, fPick, cPick, wPick) {
  const I = data.burden.inner;
  const cells = I.cells;
  return useMemo(() => {
    const base = cssVar('--surface');
    const C = (v) => cssVar(v);
    const ramp = (v, t) => mix(base, C(v), Math.max(0, Math.min(1, t)));
    const hubs = data.hubs;
    const faint = [base, 0.05];
    const scoreColor = (S) => (i) => (S[i] <= 0.1 ? [ramp('--good-b', 0.9), 0.85] : S[i] >= 0.8 ? [ramp('--warn-b', 0.5 + (S[i] - 0.8) * 2.5), 0.75] : [base, 0.06]);
    const mk = (list) => list.map(({ h }) => ({ lat: h.lat, lon: h.lon, label: h.name }));

    const crowdS = percentile(cells.map((c) => c.crowd));
    const stayS = percentile(cells.map((c) => (c.cost + c.time + c.mind + c.body + c.env) / 5));
    const isHeat = cPick === 'heat';
    const per = PERSONAS.find((p) => p.key === cPick) ?? PERSONAS[0];
    const curW = isHeat ? SCENES.find((x) => x.key === 'heat').w : per.w;
    const curS = percentile(cells.map((c) => sceneScore(c, curW)));
    const curBest = bestHubs(cells, curS, hubs);
    const perS = isHeat ? percentile(cells.map((c) => sceneScore(c, per.w))) : curS;
    const perBest = isHeat ? bestHubs(cells, perS, hubs) : curBest;

    // 모듈 3: 입구 × 추천 거점 중 부담 최소 경로가 가장 큰 차이를 내는 쌍
    let routeInfo = null;
    let bestGain = -1;
    hubs.filter((h) => h.type === 'gate').forEach((gt) => perBest.forEach(({ h }) => {
      const a = nearestNode(data.graph, [gt.lon, gt.lat]);
      const b = nearestNode(data.graph, [h.lon, h.lat]);
      const short = burdenRoute(data.network, a, b, perS, { eps: 0, barrierFree: per.barrierFree });
      const best = burdenRoute(data.network, a, b, perS, { eps: 4, barrierFree: per.barrierFree });
      if (!short || !best) return;
      const gain = short.burden ? 1 - best.burden / short.burden : 0;
      if (gain > bestGain + 0.005) { bestGain = gain; routeInfo = { short, best, gain, to: h.name, from: gt.name, toHub: h, fromHub: gt }; }
    }));
    const routes = routeInfo ? [{ coords: routeInfo.short.coords, kind: 'short' }, { coords: routeInfo.best.coords, kind: 'best' }] : [];

    const fix = FIX.find((f) => f.key === fPick) ?? FIX[0];
    const fixCol = BURDENS.find((b) => b.key === fix.key).color;
    const fixM2 = fix.acts.reduce((s, a) => s + (I.plan[a]?.m2 ?? 0), 0);
    const area = (f) => cells.filter(f).reduce((s, c) => s + c.area, 0);
    const kpi = {
      eve: [area((c) => c.time < I.high), area((c) => c.time < I.high || c.acts.includes('light'))],
      hot: [area((c) => c.env < I.high), area((c) => c.env < I.high || c.acts.includes('shade') || c.acts.includes('buffer'))],
      free: [area((c) => c.n < 3), area(() => true)],
    };
    const items = RULES.slice(0, 3).map((r) => ({ ...r, v: snap?.[r.key], stage: stageOf(r, snap?.[r.key]) }));
    const measureColor = {
      demand: (i) => [ramp('--b-time', 0.15 + crowdS[i] * 0.85), 0.15 + crowdS[i] * 0.75],
      supply: (i) => [mix(C('--good-b'), C('--warn-b'), stayS[i]), 0.25 + Math.abs(stayS[i] - 0.5) * 1.2],
      reason: (i) => (cells[i].n >= 2 ? [ramp('--b-mind', 0.3 + cells[i].n * 0.15), 0.65] : faint),
    };
    // ---- 말풍선: 칸 묶음을 가까운 거점별로 모아 가장 큰 묶음부터 ----
    const pool = hubs.filter((h) => h.type !== 'gate');
    const SIDES = ['ru', 'lu', 'rd', 'ld'];
    const zones = (idxs, n = 3) => {
      const by = {};
      idxs.forEach((i) => {
        const c = cells[i];
        const la = (c.b[0] + c.b[2]) / 2;
        const lo = (c.b[1] + c.b[3]) / 2;
        const h = nearestHub(pool, la, lo);
        if (!h) return;
        const z = (by[h.id] ??= { h, idx: [], la: 0, lo: 0 });
        z.idx.push(i); z.la += la; z.lo += lo;
      });
      return Object.values(by).sort((a, b) => b.idx.length - a.idx.length).slice(0, n)
        .map((z) => ({ ...z, lat: z.la / z.idx.length, lon: z.lo / z.idx.length, m2: z.idx.reduce((t, i) => t + cells[i].area, 0) }));
    };
    const call = (zs, sub, tone) => zs.map((z, i) => ({ lat: z.lat, lon: z.lon, title: z.h.name, sub: sub(z), side: SIDES[i % 4], tone }));
    const topBurdens = (z) => BURDENS.map((b) => [b.label, z.idx.filter((i) => cells[i][b.key] >= I.high).length]).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]).join('·');
    const idxWhere = (f) => cells.map((c, i) => (f(c, i) ? i : -1)).filter((i) => i >= 0);
    const O = data.burden.outer;
    const polyArea = (c) => { let t = 0; for (let k = 0; k < c.length - 1; k++) t += c[k][1] * c[k + 1][0] - c[k + 1][1] * c[k][0]; return Math.abs(t / 2) * 110540 * 88000; };
    const freeCalls = [
      ...O.freeAreas.filter((a) => a.n).map((a) => ({ a, m2: polyArea(a.c) })).sort((x, y) => y.m2 - x.m2).slice(0, 3)
        .map(({ a, m2 }) => ({ lat: a.c.reduce((t, p) => t + p[0], 0) / a.c.length, lon: a.c.reduce((t, p) => t + p[1], 0) / a.c.length, title: a.n, sub: `무료 · ${a.k === 'garden' ? '정원' : '공원'} ${nf(m2)}㎡` })),
      ...O.freePts.filter((p) => p[2] === 'library' && p[3]).slice(0, 1).map((p) => ({ lat: p[0], lon: p[1], title: p[3], sub: '무료 · 도서관' })),
    ].map((c, i) => ({ ...c, side: SIDES[i % 4], tone: 'good' }));
    const HOTK = { library: '도서관', social_facility: '경로당 · 복지시설', shelter: '지붕 쉼터', community_centre: '주민센터' };
    const hotCalls = O.freePts.filter((p) => ['library', 'community_centre', 'social_facility', 'shelter'].includes(p[2]))
      .map((p, i) => ({ lat: p[0], lon: p[1], title: p[3] || HOTK[p[2]], sub: `${HOTK[p[2]]} · 폭염 날 무료 피난처`, side: SIDES[i % 4], tone: 'good' }));
    const curBurden = BURDENS.find((b) => b.key === bPick);
    const measureCalls = {
      demand: call(zones(idxWhere((c, i) => crowdS[i] >= 0.9), 2), (z) => `가장 붐빔 · 혼잡 상위 칸 ${z.idx.length}개`, 'time'),
      supply: [
        ...call(zones(idxWhere((c, i) => stayS[i] <= 0.1), 1), (z) => `머물기 쉬움 · ${z.idx.length}칸`, 'good'),
        ...call(zones(idxWhere((c, i) => stayS[i] >= 0.9), 1), (z) => `머물기 어려움 · ${z.idx.length}칸`, 'warn').map((c) => ({ ...c, side: 'ld' })),
      ],
      reason: call(zones(idxWhere((c) => c.n >= 2), 2), (z) => `불만 예상 · 부담 2개+ ${z.idx.length}칸`, 'mind'),
    };
    const sea = { view: 'seongsu' };
    const park = { view: 'park' };

    return {
      paid: {
        ...sea, show: ['stn', 'paid'],
        callouts: (data.burden.outer.landmarks ?? []).map((l) => ({ lat: l.lat, lon: l.lon, title: SHOP_VIEW[l.name]?.title ?? l.name, side: SHOP_VIEW[l.name]?.side, sub: shopNote(l) })),
      },
      free: { ...sea, show: ['paid', 'outer', 'free', 'freeA'], outer: { hot: false, forest: false }, callouts: freeCalls, callDelay: 0.6, callGap: 0.6 },
      forest: { ...sea, show: ['outer', 'freeHot', 'glow'], outer: { hot: true, forest: true }, callouts: hotCalls, callDelay: 0.6, callGap: 0.6 },
      five: {
        ...park, show: ['cells'], cls: ['wave'],
        callouts: call(zones(idxWhere((c) => c[bPick] >= I.high), 2), (z) => `${curBurden.label} 부담이 큰 칸 ${z.idx.length}개`, 'goal'), callDelay: 0.5, callGap: 0.4,
        cellColor: (i) => {
          const v = cells[i][bPick];
          const col = BURDENS.find((b) => b.key === bPick).color;
          return v >= I.high ? [ramp(col, 0.45 + (v - I.high) * 1.8), 0.85] : [ramp(col, 0.12), 0.3];
        },
      },
      measure: { ...park, show: ['cells'], cellColor: measureColor[mPick] ?? measureColor.demand, callouts: measureCalls[mPick] ?? [], callDelay: 0.5, callGap: 0.5 },
      overlap: {
        ...park, show: ['cells'],
        callouts: call(zones(idxWhere((c) => c.n >= 3), 3), (z) => `겹친 칸 ${z.idx.length}개 · 주로 ${topBurdens(z)}`, 'warn'), callDelay: 0.7, callGap: 0.6,
        cellColor: (i) => {
          const n = cells[i].n;
          if (n >= 3) return [ramp('--warn-b', [0, 0, 0, 0.6, 0.85, 1][n]), 0.88];
          if (crowdS[i] >= 0.85) return [ramp('--b-time', 0.6), 0.6];
          return n === 2 ? [ramp('--warn-b', 0.2), 0.4] : faint;
        },
      },
      fix: { ...park, show: ['cells'], callouts: call(zones(idxWhere((c) => c.acts.some((a) => fix.acts.includes(a))), 2), (z) => `${fix.space.split(' · ')[0]} · ${nf(z.m2)}㎡`, 'goal'), callDelay: 0.5, callGap: 0.45, cellColor: (i) => (cells[i].acts.some((a) => fix.acts.includes(a)) ? [ramp(fixCol, 1), 0.92] : cells[i].acts.length ? [ramp(ACT_COLOR[cells[i].acts[0]], 0.3), 0.35] : faint) },
      program: (() => {
        const hubById = Object.fromEntries(hubs.map((h) => [h.id, h]));
        const sw = programSwaps(wPick);
        const seen = new Set();
        const calls = [];
        const add = (h, title, sub, tone) => { if (!h || seen.has(h.id)) return; seen.add(h.id); calls.push({ lat: h.lat, lon: h.lon, title, sub, tone, side: HUB_SIDE[h.id] ?? 'ru' }); };
        sw.forEach(({ p, off }) => add(hubById[p.hub], p.name, off ? '⛔ 운영 중단' : '✓ 정상 운영', off ? 'warn' : 'good'));
        sw.forEach(({ off, alt }) => { if (off && alt) add(hubById[alt.hub], alt.name, '↪ 여기로 전환', 'good'); });
        const swRoutes = sw.filter((x) => x.off && x.alt && hubById[x.p.hub] && hubById[x.alt.hub]).map((x) => ({ kind: 'swap', coords: [[hubById[x.p.hub].lat, hubById[x.p.hub].lon], [hubById[x.alt.hub].lat, hubById[x.alt.hub].lon]] }));
        const bad = wPick !== 'ok';
        return { ...park, show: ['cells'], callouts: calls, callDelay: 0.4, callGap: 0.35, routes: swRoutes, cellColor: (i) => (bad && cells[i].env >= I.high ? [ramp('--warn-b', 0.35), 0.45] : faint) };
      })(),
      curate: { ...park, show: ['cells'], cellColor: scoreColor(curS), markers: mk(curBest) },
      route: { ...park, show: ['cells'], callouts: routeInfo ? [{ lat: routeInfo.fromHub.lat, lon: routeInfo.fromHub.lon, title: `출발 · ${routeInfo.from}`, sub: `${per.label} 기준`, side: 'rd', tone: 'goal' }] : [], callDelay: 0.3, cellColor: (i) => (perS[i] >= 0.8 ? [ramp('--warn-b', 0.45), 0.5] : faint), routes, markers: routeInfo ? mk([{ h: routeInfo.toHub }]) : [] },
      kpi: { ...park, show: ['cells'], cls: ['fix-go'], callouts: call(zones(idxWhere((c) => c.n >= 3), 3), (z) => `처방 후 머물 땅 +${nf(z.m2)}㎡`, 'good'), callDelay: 1.6, callGap: 0.5, cellColor: (i) => (cells[i].n >= 3 ? [C('--warn-b'), 0.88] : [ramp('--good-b', 0.35), 0.35]) },
      _meta: { isHeat, per, curBest, routeInfo, items, kpi, fix, fixM2 },
    };
  }, [data, theme, snap, bPick, mPick, fPick, cPick, wPick, cells, I]);
}

/* ---------------- 스크롤 엔진: 휠·키 한 번에 한 장면 ---------------- */
function usePagedStory(heroRef, stepsRef, refRef, stickyRef, barRef, setActive) {
  useEffect(() => {
    const narrow = () => window.innerWidth <= 980;
    const mid = () => window.innerHeight * 0.52;
    const absTop = (e) => e.getBoundingClientRect().top + window.scrollY;
    // 멈출 위치: 표지 → 장면 1..N (가운데) → 부록
    const stops = () => {
      const s = [0];
      heroRef.current?.querySelectorAll('.b3-hv-page.b2').forEach((e) => { const y = absTop(e) - 140; if (y - s[s.length - 1] > 40) s.push(y); });
      base = s.length;
      // 슬라이드 윗변을 고정 지도의 윗변에 맞춤
      const top = stickyRef.current ? parseFloat(getComputedStyle(stickyRef.current).top) || 0 : 0;
      stepsRef.current.filter(Boolean).forEach((e) => s.push(absTop(e) - top));
      if (refRef.current) s.push(absTop(refRef.current) - 140);
      return s;
    };
    const nearest = (S, y) => S.reduce((bi, v, i) => (Math.abs(v - y) < Math.abs(S[bi] - y) ? i : bi), 0);
    let lastMove = 0;
    let lastWheel = 0;
    let base = 1;
    let target = null;
    const go = (dir) => {
      const S = stops();
      const cur = target != null ? target : nearest(S, window.scrollY);
      const nx = Math.max(0, Math.min(S.length - 1, cur + dir));
      if (nx === cur) return;
      target = nx;
      lastMove = performance.now();
      window.scrollTo({ top: S[nx], behavior: 'smooth' });
      setTimeout(() => { if (performance.now() - lastMove >= 850) target = null; }, 900);
    };
    const inRef = (dir) => {
      const S = stops();
      const refY = S[S.length - 1];
      // 부록 안에서는 일반 스크롤, 부록 맨 위에서 위로 올리면 마지막 장면으로
      return window.scrollY > refY + 4 || (window.scrollY >= refY - 4 && dir > 0);
    };
    const onWheel = (e) => {
      if (narrow() || e.ctrlKey || Math.abs(e.deltaY) < 3) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      if (inRef(dir)) return;
      e.preventDefault();
      const now = performance.now();
      const burst = now - lastWheel < 200;
      lastWheel = now;
      if (now - lastMove < 900 || (burst && now - lastMove < 1600)) return; // 트랙패드 관성 한 번으로 여러 장 넘지 않게
      go(dir);
    };
    const onKey = (e) => {
      if (narrow() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')) return;
      const dir = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 }[e.key];
      if (!dir || (e.key === ' ' && e.shiftKey) || inRef(dir)) return;
      e.preventDefault();
      if (performance.now() - lastMove < 500) return;
      go(dir);
    };

    let raf = 0;
    const calc = () => {
      raf = 0;
      const els = stepsRef.current.filter(Boolean);
      if (!els.length) return;
      const m = mid();
      let k = els[0].dataset.k;
      let idx = 0;
      els.forEach((e, i) => { if (e.getBoundingClientRect().top <= m) { k = e.dataset.k; idx = i; } });
      setActive(k);
      stickyRef.current?.style.setProperty('--sp', ((idx + 1) / els.length).toFixed(4));
      const doc = document.documentElement;
      barRef.current?.style.setProperty('--pp', (window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight)).toFixed(4));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(calc); };
    calc();
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // 장면 i(0부터)로 이동, i = 장면 수 이면 부록
    window.__b3step = (i) => { const S = stops(); target = null; lastMove = performance.now(); window.scrollTo({ top: S[Math.max(0, Math.min(S.length - 1, base + i))], behavior: 'smooth' }); };
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
      delete window.__b3step;
    };
  }, [heroRef, stepsRef, refRef, stickyRef, barRef, setActive]);
}

// 고르기 전까지 자동으로 넘어가는 칩
function useAutoCycle(on, keys, setPick, ms = 2600) {
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!on || !auto) return undefined;
    const t = setInterval(() => setPick((k) => keys[(keys.indexOf(k) + 1) % keys.length]), ms);
    return () => clearInterval(t);
  }, [on, auto, keys, setPick, ms]);
  return [auto, setAuto];
}

function Chips({ list, pick, onPick, auto, ms = 2600 }) {
  return (
    <div className="b3-chips">
      {list.map((b) => (
        <button key={b.key} type="button" className={pick === b.key ? 'on' : ''} style={{ '--c': `var(${b.color ?? '--goal3-2'})`, '--ms': `${ms}ms` }} onClick={() => onPick(b.key)}>
          {b.label}{pick === b.key && auto ? <i key={b.key} className="b3-tick" /> : null}
        </button>
      ))}
    </div>
  );
}

/* ================================================================ 페이지 */
export function BurdenStory({ data, theme, snap, go }) {
  const B = data.burden;
  const OS = B.outer.stats;
  const IS = B.inner.stats;
  const root = useReveal('.b3-rv, .b3-pop');
  const [active, setActive] = useState('paid');
  const [bPick, setBPick] = useState('cost');
  const [mPick, setMPick] = useState('demand');
  const [fPick, setFPick] = useState('cost');
  const [cPick, setCPick] = useState('heat');
  const [wPick, setWPick] = useState('ok');
  const S = useScenes(data, theme, snap, bPick, mPick, fPick, cPick, wPick);
  const M = S._meta;
  const BK = useMemo(() => BURDENS.map((b) => b.key), []);
  const MK = useMemo(() => MEASURE.map((b) => b.key), []);
  const [bAuto, setBAuto] = useAutoCycle(active === 'five', BK, setBPick);
  const [mAuto, setMAuto] = useAutoCycle(active === 'measure', MK, setMPick, 3400);
  const [fAuto, setFAuto] = useAutoCycle(active === 'fix', BK, setFPick, 3000);
  const [wAuto, setWAuto] = useAutoCycle(active === 'program', WK, setWPick, 3600);
  const heroRef = useRef(null);
  const stepsRef = useRef([]);
  const refRef = useRef(null);
  const stickyRef = useRef(null);
  const barRef = useRef(null);
  usePagedStory(heroRef, stepsRef, refRef, stickyRef, barRef, setActive);

  const ri = M.routeInfo;
  const curB = BURDENS.find((x) => x.key === bPick);
  const curM = MEASURE.find((x) => x.key === mPick);
  const pct = (a, b) => Math.round(((b - a) / a) * 100);

  // 장면마다: 주장(제목) 하나 → 핵심 한두 문장 → 다음 장면으로 잇는 질문(next)
  const steps = [
    // ① 문제
    {
      k: 'paid', st: 0, prob: 2, tag: '추진 배경 p.3', title: '좁은 집을 나와도, 성수엔 돈 내는 곳뿐',
      stat: [nf(OS.paid), '곳', '카페 · 음식점'],
      body: (
        <>
          <p className="b3-lead">성수역에서 퍼져 나가는 점 하나하나가 카페·음식점입니다. 쉬려고 나와도 <b>머물려면 돈을 내야</b> 합니다.</p>
          <ol className="b3-shops">
            {(B.outer.landmarks ?? []).map((l, i) => (
              <li key={l.name} style={{ '--i': i }}><b>{SHOP_VIEW[l.name]?.title ?? l.name}</b><span>{shopNote(l)}</span></li>
            ))}
          </ol>
          <p className="b3-mini">성수역 앞에서 시작해 서울숲 입구까지, 걷는 내내 카페가 이어집니다.</p>
        </>
      ),
      next: '그럼 돈 없이 머물 곳은 얼마나 될까?',
    },
    {
      k: 'free', st: 0, prob: 3, tag: '추진 배경 p.3', title: '돈 없이 머물 곳은 41곳',
      stat: [String(OS.freeAreas + OS.freePts), '곳', `유료 ${OS.paidPerFree}곳당 1곳`],
      body: <p className="b3-lead">공원·정원·도서관·쉼터를 다 세도 서울숲 밖엔 41곳. <b>빨간 칸</b>(생활권의 {OS.farWoPct}%)은 걸어서 300m 안에 무료로 머물 곳이 없습니다. 혼자 나온 사람이 편히 있을 자리는 더 드뭅니다.</p>,
      next: '날씨까지 나쁘면?',
    },
    {
      k: 'forest', st: 0, prob: 4, tag: '기후변화 · 필요성 p.3', title: '폭염 날엔 4곳뿐. 남는 건 서울숲',
      stat: [String(OS.hotFree), '곳', '폭염 날 돈 없이 들어갈 곳'],
      body: <p className="b3-lead">폭염·미세먼지 날엔 생활권의 {OS.hfarWoPct}%가 빨간 칸이 됩니다. 큰 그늘과 실내가 있는 무료 공간은 <b>서울숲 하나</b>. 그래서 서울숲 안에서만큼은 부담 없이 머물 수 있어야 합니다.</p>,
      next: '그럼 서울숲에서 "만족"이란 무엇일까?',
    },
    // ② 정의
    {
      k: 'five', st: 1, tag: '목표 p.4 · 취약 지표 p.10', title: '만족도 = 부담 없이 머무를 수 있는가',
      stat: [curB.label, '', '부담 상위 30% 칸'],
      body: (
        <>
          <p className="b3-lead">오래, 편하게 머물 수 있으면 만족한 것입니다. 머무름을 막는 <b>부담</b>을 다섯 가지로 잽니다.</p>
          <Chips list={BURDENS} pick={bPick} auto={bAuto} onPick={(k) => { setBAuto(false); setBPick(k); }} />
          <p className="b3-bq"><b>{curB.q}</b><br /><span>{curB.who}</span></p>
        </>
      ),
      next: '이 부담을 무엇으로 재나?',
    },
    // ③ 측정
    {
      k: 'measure', st: 2, tag: '시스템 구조 p.5–6 · IPA p.17', title: '수요 · 공급 · 이유, 세 겹으로 잽니다',
      stat: [curM.label, '', curM.map],
      body: (
        <>
          <Chips list={MEASURE} pick={mPick} auto={mAuto} ms={3400} onPick={(k) => { setMAuto(false); setMPick(k); }} />
          <div className="b3-layers">
            {MEASURE.map((m) => (
              <div key={m.key} className={mPick === m.key ? 'on' : ''} style={{ '--c': `var(${m.color})` }}>
                <b>{m.label} · {m.q}</b><span>{m.d}</span>
              </div>
            ))}
          </div>
        </>
      ),
      next: '재 보니, 어디가 문제인가?',
    },
    // ④ 진단
    {
      k: 'overlap', st: 3, tag: '취약지역 분석 p.10', title: '부담이 3개 이상 겹친 땅이 취약지역',
      stat: [String(IS.multi3), '칸', `공원의 ${Math.round((IS.prioM2 / IS.parkM2) * 100)}% · ${(IS.prioM2 / 10000).toFixed(1)}ha`],
      body: (
        <>
          <div className="b3-hist">{IS.overlap.map((v, i) => <div key={i} className={i >= 3 ? 'hot' : ''} style={{ '--h': `${(v / Math.max(...IS.overlap)) * 100}%` }}><span>{v}</span><em>{i}개</em></div>)}</div>
          <p className="b3-lead"><b>빨강</b>(겹친 땅)과 <b>보라</b>(붐비는 곳)는 거의 안 겹칩니다. 사람이 안 가는 곳이 곧 부담이 겹친 곳입니다.</p>
        </>
      ),
      next: '그 땅을 어떻게 고치나?',
    },
    // ⑤ 처방
    {
      k: 'fix', st: 4, tag: '개선방안 · 산출물 03 p.10, 20', title: '고치기: 공간과 서비스로',
      stat: [nf(M.fixM2), '㎡', `${BURDENS.find((b) => b.key === M.fix.key).label} 부담 처방 면적`],
      body: (
        <>
          <div className="b3-fix">
            {FIX.map((f) => {
              const b = BURDENS.find((x) => x.key === f.key);
              return (
                <button key={f.key} type="button" className={fPick === f.key ? 'on' : ''} style={{ '--c': `var(${b.color})` }} onClick={() => { setFAuto(false); setFPick(f.key); }}>
                  <b>{b.label}{fPick === f.key && fAuto ? <i key={f.key} className="b3-tick" style={{ '--ms': '3000ms' }} /> : null}</b>
                  <span>공간 · {f.space}</span>
                  <span>서비스 · {f.service}</span>
                  <em>{f.kano}</em>
                </button>
              );
            })}
          </div>
          <p className="b3-mini">꼬리표 = Kano 단계(기본 → 성능 → 매력). 불만을 없애는 것과 만족을 만드는 것을 함께 넣습니다.</p>
        </>
      ),
      next: '고치기 전에도, 지금 당장 피하게 하자',
    },
    {
      k: 'program', st: 4, tag: '모듈 1 기상 반응 p.7', title: '날씨가 나쁘면, 프로그램을 바꿉니다',
      stat: (() => { const w = WX.find((x) => x.key === wPick); return [STAGE_META[w.stage].label, '', w.rule]; })(),
      body: (
        <>
          <Chips list={WX} pick={wPick} auto={wAuto} ms={3600} onPick={(k) => { setWAuto(false); setWPick(k); }} />
          <div className="b3-swap">
            {programSwaps(wPick).map(({ p, off, alt }) => (
              <div key={p.id} className={off ? 'off' : ''}>
                <b>{p.name}</b>
                <i>{off ? '→' : '✓'}</i>
                <span>{off ? (alt ? alt.name : '대체 없음') : '그대로 운영'}</span>
              </div>
            ))}
          </div>
          <p className="b3-mini">기준값은 주제서 예시(기상청 폭염특보 · 환경부 PM2.5 등급 참고). 폭염엔 그늘 프로그램은 유지, 미세먼지엔 실내만 남깁니다.</p>
        </>
      ),
      next: '사람마다 맞는 자리는?',
    },
    {
      k: 'curate', st: 4, tag: '모듈 1 · 모듈 2 p.7–8', title: '피하기: 지금, 이 사람에게 맞는 자리',
      body: (
        <>
          <Chips list={CURATE} pick={cPick} onPick={setCPick} />
          {M.isHeat ? (
            <div className="b3-rules">{M.items.map((r) => <div key={r.key} className={`b3-rule s${r.stage}`}><span>{r.label}</span><b className="num">{r.v != null ? Math.round(r.v) : '–'}{r.unit}</b><em>{STAGE_META[r.stage].label}</em></div>)}</div>
          ) : (
            <div className="b3-w">{BURDENS.map((b) => <div key={b.key}><span>{b.label}</span><i style={{ '--v': `${(M.per.w[b.key] / 2.5) * 100}%`, background: `var(${b.color})` }} /><b className="num">×{M.per.w[b.key]}</b></div>)}</div>
          )}
          <ol className="b3-best">{M.curBest.map(({ h }) => <li key={h.id}><b>{h.name}</b><span>{h.zone}</span></li>)}</ol>
        </>
      ),
      next: '가는 길도 부담이 적게',
    },
    {
      k: 'route', st: 4, tag: '모듈 3 · A* p.9', title: '짧은 길 말고, 부담이 적은 길',
      stat: ri ? [`${Math.round(ri.gain * 100)}%`, '', '지나는 부담 감소'] : null,
      body: (
        <>
          <p className="b3-formula">g = α·거리 + β·열 + γ·혼잡 + δ·경사 <b>+ ε·부담</b></p>
          {ri ? (
            <div className="b3-route">
              <div><i className="short" /><span>최단 경로</span><b className="num">{nf(ri.short.len)}m</b></div>
              <div><i className="best" /><span>부담 최소 경로</span><b className="num">{nf(ri.best.len)}m</b><em>{nf(Math.max(0, ri.best.len - ri.short.len))}m 더 걷고 부담 {Math.round(ri.gain * 100)}% 덜</em></div>
            </div>
          ) : null}
          <p className="b3-mini">{M.per.label} · {ri ? `${ri.from} → ${ri.to}` : ''}</p>
        </>
      ),
      next: '그래서, 나아졌나?',
    },
    // ⑥ 검증
    {
      k: 'kpi', st: 5, tag: '성과지표 p.4 · 피드백 루프 p.5', title: '머물 수 있는 땅과 시간이 늘었나',
      stat: [`+${pct(M.kpi.eve[0], M.kpi.eve[1])}%`, '', '저녁에 머물 수 있는 면적'],
      body: (
        <>
          <div className="b3-kpi">
            {[
              ['저녁에 머물 수 있는 땅', M.kpi.eve],
              ['폭염 날 머물 수 있는 땅', M.kpi.hot],
              ['부담 3개 미만인 땅', M.kpi.free],
            ].map(([t, [a, b]]) => (
              <div key={t}><span>{t}</span><b className="num">{(a / 10000).toFixed(1)}<i>→</i>{(b / 10000).toFixed(1)}ha</b><em>+{pct(a, b)}%</em><div className="b3-kbar"><i style={{ '--a': `${(a / IS.parkM2) * 100}%`, '--b': `${(b / IS.parkM2) * 100}%` }} /></div></div>
            ))}
          </div>
          <div className="b3-loop">{['측정', '부담지도 갱신', '개선', '재측정'].map((t, i) => <span key={t} style={{ '--i': i }}>{t}</span>)}</div>
          <p className="b3-mini">모델 추정값. 고친 뒤 체류 시간·리뷰로 다시 재서 확인합니다.</p>
        </>
      ),
      next: '부록: 주제서 대응표',
    },
  ];
  stepsRef.current.length = steps.length;
  const cur = steps.find((s) => s.k === active) ?? steps[0];
  const curStage = cur.st;
  const jumpStage = (i) => window.__b3step?.(steps.findIndex((s) => s.st === i));
  const jumpKey = (k) => window.__b3step?.(steps.findIndex((s) => s.k === k));

  return (
    <div className="b3" ref={root}>
      <nav className="b3-rail" aria-label="전략 단계" ref={barRef}>
        {STAGES.map(([n, l], i) => (
          <button key={l} type="button" className={`${i === curStage ? 'on' : ''} ${i < curStage ? 'done' : ''}`} onClick={() => jumpStage(i)}>
            <b>{n}</b>{l}
          </button>
        ))}
        <button type="button" className="ref" onClick={() => window.__b3step?.(steps.length)}>주제서 대응표</button>
        <i className="b3-rail-bar" />
      </nav>

      {/* 표지: 프로젝트 고도화안 — 두 화면, 항목이 차례로 뿅뿅 */}
      <section className="b3-hv" ref={heroRef}>
        <div className="b3-hv-page">
          <div className="b3-hv-k b3-pop" style={{ '--d': '0ms' }}>🌳 서울숲 스마트공원 프로젝트 고도화안 · 최명원</div>
          <h1 className="b3-pop" style={{ '--d': '120ms' }}>「부담 없는 숲」<small>Burden-Free Forest</small></h1>
          <p className="b3-hv-story b3-pop" style={{ '--d': '280ms' }}>돈 없이 머물 곳이 없는 성수동에서, 유일한 무료 쉼터인 <b>서울숲</b>을 폭염·미세먼지에도 <b>취약계층까지 부담 없이 머무는 공원</b>으로 만듭니다. AI가 날씨와 이용자에 맞춰 프로그램과 동선을 바꿔 줍니다.</p>
          <div className="b3-hv-def b3-pop" style={{ '--d': '460ms' }}><span>만족도</span>= 얼마나 오래, <b>부담 없이</b> 머무를 수 있는가</div>
          <div className="b3-hv-grid">
            <div>
              <h4 className="b3-pop" style={{ '--d': '650ms' }}>문제의식</h4>
              <div className="b3-hv-probs">
                {[
                  ['무료 휴식처 부족', `카페·음식점 ${nf(OS.paid)}곳 vs 무료 ${OS.freeAreas + OS.freePts}곳`],
                  ['기후 취약계층', `고령층·유아·1인 가구 · 폭염 날 무료 피난처 ${OS.hotFree}곳`],
                  ['서울숲의 휴식 불균형', '그늘 부족 · 인파 밀집 · 머물기 어려운 구역'],
                ].map(([t, x], i) => <div key={t} className="b3-pop" style={{ '--d': `${800 + i * 220}ms` }}><i>{i + 1}</i><b>{t}</b><span>{x}</span></div>)}
              </div>
            </div>
            <div>
              <h4 className="b3-pop" style={{ '--d': '1700ms' }}>다섯 가지 부담</h4>
              <div className="b3-hv-burdens">
                {BURDENS.map((x, i) => <span key={x.key} className="b3-pop" style={{ '--c': `var(${x.color})`, '--d': `${1850 + i * 170}ms` }}><b>{x.label}</b>{x.q}</span>)}
              </div>
            </div>
          </div>
        </div>
        <div className="b3-hv-page b2">
          <h4 className="b3-pop" style={{ '--d': '0ms' }}>핵심 목표</h4>
          <div className="b3-hv-goals">
            <article className="b3-pop" style={{ '--d': '150ms' }}>
              <em>목표 ① · 모듈 1·2·3</em><h3><u>기후 반응형</u> 맞춤 프로그램</h3><b>날씨가 나쁘면 프로그램을 바꾸고, 사람마다 맞춰 추천</b>
              <p>체감온도(31/33℃) · PM2.5(36/76) 기준을 넘으면 실외 프로그램을 곤충식물원 · 나비정원 같은 실내 대체시설로 전환하고, AI가 생애주기별 프로그램 추천 · 혼잡 분산 · 그늘길(A*)을 제공합니다.</p>
              <div><span>모듈 1 기상 반응 전환</span><span>모듈 2 생애주기 · 혼잡 분산</span><span>모듈 3 협업필터링 + A*</span></div>
            </article>
            <article className="b3-pop" style={{ '--d': '400ms' }}>
              <em>목표 ② · 격자 중첩</em><h3><u>취약지역</u> 진단과 개선 우선순위</h3><b>부담이 몰린 땅을 찾아 고칠 순서를 냄</b>
              <p>지표면 온도 · 그늘 · 시설 · 리뷰를 30m 격자에 겹쳐 부담이 몰린 구역({IS.multi3}칸, 공원의 {Math.round((IS.prioM2 / IS.parkM2) * 100)}%)을 찾고, 녹음수 · 그늘막 · 벤치 보강 우선순위를 도출합니다.</p>
              <div><span>녹음수 · 식재지</span><span>그늘막 · 그늘시설</span><span>벤치 · 동선 보완</span></div>
            </article>
          </div>
          <h4 className="b3-pop" style={{ '--d': '750ms' }}>최종 결과물 · 「부담지도 (Burden Map)」</h4>
          <div className="b3-hv-cycle" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {[
              ['시민 이용', '입력', '지금 날씨와 나에게 맞는 프로그램 · 자리 · 그늘길 추천, 위험 시 실내 대체시설 안내'],
              ['데이터 누적', '분석', '기상 · 혼잡 · 체류 · 리뷰 데이터가 부담별로 쌓임'],
              ['관리자 처방', '출력', '취약 구역과 식재 · 그늘시설 · 동선 보완 우선순위 도출'],
            ].map(([t, k, x], i) => <div key={t} className="b3-pop" style={{ '--d': `${900 + i * 260}ms` }}><em>{k}</em><b>{t}</b><span>{x}</span></div>)}
          </div>
          <div className="b3-cue b3-pop" style={{ '--d': '2000ms' }}><i />스크롤하면 지도와 함께 6단계 전략으로</div>
        </div>
      </section>

      <div className="b3-story">
        <div className="b3-steps">
          {steps.map((s, i) => (
            // 장면 하나 = 지도와 같은 높이의 슬라이드 한 장 (상자 없이 빈 공간을 그대로 씀)
            <div key={s.k} className={`b3-step ${active === s.k ? 'on' : ''}`} data-k={s.k} ref={(r) => { stepsRef.current[i] = r; }}>
              <article className="b3-slide">
                <header className="b3-kick">
                  <span className="b3-kick-st"><b>{STAGES[s.st][0]}</b>{STAGES[s.st][1]}</span>
                  <span className="b3-kick-n">{String(i + 1).padStart(2, '0')}<i>/ {steps.length}</i></span>
                  <span className="b3-kick-tag">주제서 {s.tag}</span>
                </header>
                <div className="b3-mid">
                  {s.stat ? (
                    <div className="b3-big" key={active === s.k ? `${s.stat[0]}-on` : 'off'}>
                      <b className="num">{active === s.k ? <CountUp text={s.stat[0]} ms={1000} /> : s.stat[0]}<small>{s.stat[1]}</small></b>
                      <span>{s.stat[2]}</span>
                    </div>
                  ) : null}
                  <h3>{s.title}</h3>
                  <div className="b3-body">{s.body}</div>
                </div>
                {s.next ? <button type="button" className="b3-next" onClick={() => window.__b3step?.(i + 1)}><span>다음</span>{s.next}<i>↓</i></button> : null}
              </article>
            </div>
          ))}
        </div>
        <div className="b3-sticky" ref={stickyRef}>
          <StoryMap data={data} theme={theme} scene={S[active]} />
          <div className={`b3-probs ${curStage === 0 ? 'show' : ''}`}>
            <span className="t">문제의식</span>
            {PROBLEMS.map((p, i) => <span key={p} className={(cur.prob ?? 0) > i ? 'on' : ''}><i>{i + 1}</i>{p}</span>)}
          </div>
          <div className="b3-cap">
            <div className="b3-cap-t" key={cur.k}><b>{STAGES[curStage][0]} {STAGES[curStage][1]}</b><span>{cur.title}</span></div>
            <div className="b3-cap-bar"><i /></div>
          </div>
        </div>
      </div>

      {/* 주제서 대응표 + 수행 안내 */}
      <section className="b3-ref" id="b3-ref" ref={refRef}>
        <div className="b3-ref-h b3-rv"><span>부록</span><h2>주제서 대응표 — 빠진 항목 없이</h2><p>AI-CCS 학부생 주제 01 「스마트 공원 이용 프로그램 대시보드」 Ⅰ~Ⅵ장이 위 이야기의 어디에 있는지</p></div>
        <div className="b3-table b3-rv">
          {[
            ['Ⅰ 개요', 'p.3–4', '추진 배경 4가지 · 필요성 · 목표 1·2 · 성과지표 4종', [['① 문제', 'paid'], ['⑤ 처방', 'fix'], ['⑥ 검증', 'kpi']]],
            ['Ⅱ 구조', 'p.5–6', '데이터 인입 → 분석·추천 엔진 → 대시보드 UI · 피드백 루프', [['③ 측정', 'measure'], ['⑤ 피하기', 'curate'], ['⑥ 순환', 'kpi']]],
            ['Ⅲ 핵심 모듈', 'p.7–11', '모듈 1 기상 반응 · 모듈 2 생애주기 · 모듈 3 A* 코스 · 취약지역 5단계', [['② 격자·지표', 'five'], ['④ 중첩', 'overlap'], ['⑤ 모듈 1', 'program'], ['⑤ 모듈 2', 'curate'], ['⑤ 모듈 3', 'route']]],
            ['Ⅳ 대상지', 'p.12–13', '서울숲 선정 3기준 · 유의점(거점 축소 계수)', [['① 서울숲', 'forest'], ['③ 수요', 'measure']]],
            ['Ⅴ 연구사례', 'p.14–17', 'AURI 진단(편의 편중) · 방향(기후·취약계층) · IPA', [['① 유료 거리', 'paid'], ['③ 이유', 'measure'], ['⑤ Kano', 'fix']]],
            ['Ⅵ 수행 안내', 'p.18–20', '유의사항 · 산출물 4종 · 평가 기준', [['아래 표', null]]],
          ].map(([t, p, d, links]) => (
            <div key={t} className="b3-tr">
              <b>{t}<small>{p}</small></b>
              <span>{d}</span>
              <div>{links.map(([l, k]) => (k ? <button key={l} type="button" onClick={() => jumpKey(k)}>{l}</button> : <em key={l}>{l}</em>))}</div>
            </div>
          ))}
        </div>

        <div className="b3-grid3">
          <article className="b3-box b3-rv">
            <h3>대상지 3기준 (p.12)</h3>
            <ul>
              <li><b>실내·실외 복합</b> 곤충식물원·나비정원 → 폭염 날 "돈 없이 피할 실내"인지 이용료 확인 필요</li>
              <li><b>대형·다양한 테마</b> 구역마다 부담이 다름 → 겹친 칸 {IS.multi3}개가 특정 구역에 몰림</li>
              <li><b>데이터 수집 용이</b> OSM·위성으로 시작, 부족분은 현장 조사</li>
            </ul>
          </article>
          <article className="b3-box b3-rv">
            <h3>유의사항 대응 (p.18–19)</h3>
            <ul>
              <li><b>Cold Start</b> 상황·생애주기 가중치를 주 엔진으로, 협업필터링은 가상 페르소나로 시연</li>
              <li><b>공원 내부 유동인구</b> 부담 최저·최고 칸의 대표 거점만 계수해 보정</li>
              <li><b>개인정보</b> 공간 데이터만 사용, 리뷰는 게시자 정보 없이 텍스트·집계만</li>
              <li><b>범위 관리</b> 필수(모듈 1 + 취약지역)를 부담지도 하나로 먼저 완성</li>
            </ul>
          </article>
          <article className="b3-box b3-rv">
            <h3>산출물 (p.20)</h3>
            <ul className="b3-outs">
              <li><b>01</b>웹 대시보드 — 이 화면 + 목표 1 화면 <button type="button" onClick={() => go('citizen')}>보기</button></li>
              <li><b>02</b>취약지역 분석도 — ④ 부담 겹침 지도</li>
              <li><b>03</b>개선방안 계획도 — ⑤ 처방 · {nf(IS.prioM2)}㎡</li>
              <li><b>04</b>최종 보고서·발표자료 — 작성 예정</li>
            </ul>
          </article>
        </div>
        <div className="b3-grid2">
          <article className="b3-box b3-rv">
            <h3>평가 기준 (p.20)과 이 전략</h3>
            {[
              ['기술 완성도', 30, '스크롤 지도 · 상황별 가중치 · 부담 항을 넣은 A*'],
              ['데이터 근거', 25, '약점: OSM 시설 과소 등록 · 가중치 가정값 → 현장 조사 · 상가정보 · IPA 설문으로 교체'],
              ['공간계획 연계', 25, '부담 → 식재 · 그늘 · 벤치 · 조명 · 동선, ㎡ 산출'],
              ['실현 가능성', 20, '필수 과업 먼저 · 서비스 처방은 큰 공사 없이 시작 가능'],
            ].map(([t, w, d]) => (
              <div key={t} className="b3-eval"><div><b>{t}</b><span className="num">{w}%</span></div><i style={{ '--v': `${(w / 30) * 100}%` }} /><small>{d}</small></div>
            ))}
          </article>
          <article className="b3-box b3-rv">
            <h3>한계와 다음 할 일</h3>
            <ul>
              <li>OSM 시설이 적음 (벤치 {IS.osm.bench} · 음수대 {IS.osm.water} · 조명 길 {IS.osm.litWays} · 계단 {IS.osm.steps}) → 현장 조사</li>
              <li>카페 {OS.cafe}곳은 과소 집계 → 소상공인시장진흥공단 상가(상권)정보로 교체, "1시간 머무는 비용" 산출</li>
              <li>통계청 SGIS 1인 가구 분포를 바깥 지도에 겹쳐 "1인 가구 많은 곳일수록 무료 공간이 없다" 확인</li>
              <li>리뷰 불만 분류 · IPA · Kano 설문으로 가중치를 실제 응답으로 교체</li>
              <li>거리 기준 · 산식 · 가중치는 모두 가정값 · 실내 대체시설 이용료 확인</li>
            </ul>
          </article>
        </div>
        <p className="b3-foot">자료: OpenStreetMap (ODbL) · Landsat 8 · Sentinel-2 · 서울숲 30m 격자의 열·혼잡·대기 지표와 산책로 네트워크는 팀 분석 결과를 입력으로 사용 · 부담 산정 · 처방 · 전략 구성은 최명원 개인 작업 · 생성 {B.built}</p>
      </section>
    </div>
  );
}

export default BurdenStory;
