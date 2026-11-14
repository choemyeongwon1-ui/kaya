// 만족도 처방 엔진 — 진단(IPA) → 예산 제약 하 최적 배치(탐욕 알고리즘) → 만족도 효과 예측 → 제안 문장
//
// 핵심 아이디어
//   1) 요인별 "이용자가 실제로 겪는 불편" = 이용 가중 노출도 E_k = Σ u_i·v_ik / Σ u_i
//      (u_i: 격자 이용 강도 = 혼잡 대리지표, v_ik: 요인 k 취약 지표 0–1)
//   2) 시설을 놓으면 해당 격자(와 주변)의 v_ik 가 줄고 → E_k 감소
//   3) 만족도 연결 가정: perf_k' = perf_k + β·(5 − perf_k)·(1 − E_k'/E_k)   (β = 노출 감소의 만족 전환율)
//   4) 전체 만족도 S = Σ imp_k·perf_k / Σ imp_k  → S 증가량/비용이 가장 큰 시설부터 예산 소진까지 배치
// 단가·효과계수·β·IPA 기본값은 모두 "가정값"이며 화면과 문서에 그렇게 표시한다.

export const BETA = 0.6;

/** 만족 요인 (IPA). spatial=false 요인은 공간 시설이 아니라 대시보드 서비스(모듈 1~3)로 대응. */
export const FACTORS = [
  { key: 'heat', label: '그늘·더위', spatial: true, imp: 4.5, perf: 2.8 },
  { key: 'access', label: '쉼터·화장실', spatial: true, imp: 4.2, perf: 3.0 },
  { key: 'crowd', label: '혼잡·쾌적', spatial: true, imp: 3.9, perf: 2.9 },
  { key: 'air', label: '공기·소음', spatial: true, imp: 3.5, perf: 3.3 },
  { key: 'info', label: '정보·안내', spatial: false, imp: 3.8, perf: 3.1, service: '실시간 경보·혼잡 안내(모듈 1·2)' },
  { key: 'program', label: '프로그램', spatial: false, imp: 3.4, perf: 3.6, service: '날씨 반응형 프로그램 전환(모듈 1)' },
];

/** 개선 시설 카탈로그 — 단가(만원)는 개략 가정값. 조달청·실적 단가로 교체 예정. */
export const ACTIONS = {
  tree: { label: '그늘 나무', unit: '주', perCell: 6, cost: 720, factor: 'heat', self: 0.3, near: 0.1, color: '#2f7d4f', note: '낙엽교목 6주/격자 · 효과는 수관 성장 후 3~5년' },
  // 파고라는 그늘이면서 앉아 쉬는 곳 → 열 감소 + 휴게 거점 추가
  shade: { label: '그늘막·파고라', unit: '기', perCell: 1, cost: 2500, factor: 'heat', self: 0.45, near: 0.05, point: 'rest', color: '#2a78d6', note: '즉시 효과 · 그늘+휴게 겸용' },
  // 그늘 쉼터(벤치+차양)는 휴게 거점 + 자기 격자에 약한 그늘
  rest: { label: '그늘 쉼터', unit: '개소', perCell: 1, cost: 800, factor: 'access', point: 'rest', heatSelf: 0.12, color: '#8a5cd0', note: '벤치+차양 · 휴게 간격 150m 목표' },
  toilet: { label: '소형 화장실', unit: '동', perCell: 1, cost: 15000, factor: 'access', point: 'toilet', color: '#c2417a', note: '화장실 간격 250m 목표' },
  buffer: { label: '도로변 숲띠', unit: 'm', perCell: 30, cost: 1800, factor: 'air', self: 0.4, near: 0.15, color: '#6b8e23', note: '도로변 다층 식재 30m 구간' },
  // 우회로는 흐름의 일부만 분산(혼잡 지표는 이용 강도와 겹치므로 효과를 보수적으로 둠)
  path: { label: '우회 산책로', unit: 'm', perCell: 30, cost: 1500, factor: 'crowd', self: 0.12, near: 0.04, color: '#e08a1e', note: '병목 우회로 30m 구간 · 흐름 일부 분산' },
};

const R_EARTH_X = 111320;
const R_EARTH_Y = 110540;

/** 격자 중심(m 좌표)·이웃·경로항 등 한 번만 계산하는 기초 자료 */
export function prepare(grid, hubs) {
  const feats = grid.features;
  const lat0 = 37.544;
  const lon0 = 127.04;
  const kx = Math.cos((lat0 * Math.PI) / 180) * R_EARTH_X;
  const cells = feats.map((f) => {
    const ring = f.geometry.coordinates[0];
    const pts = ring.slice(0, -1);
    const lon = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const lat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const p = f.properties;
    const tTerm = 0.45 * Math.min(p.dToilet / 250, 1);
    const rTerm = 0.35 * Math.min(p.dRest / 150, 1);
    return {
      id: p.id, lon, lat, x: (lon - lon0) * kx, y: (lat - lat0) * R_EARTH_Y, props: p,
      pathTerm: Math.max(0, (p.access - tTerm - rTerm) / 0.2),
    };
  });
  // 이웃: 중심 거리 45m 이내 (8방향)
  const nb = cells.map((c) => cells.reduce((acc, o, j) => {
    if (o !== c && Math.hypot(o.x - c.x, o.y - c.y) <= 45) acc.push(j);
    return acc;
  }, []));
  // 가장 가까운 거점 이름 (제안 문장용)
  const venues = hubs.filter((h) => h.type !== 'gate').map((h) => ({ ...h, x: (h.lon - lon0) * kx, y: (h.lat - lat0) * R_EARTH_Y }));
  const place = cells.map((c) => {
    let best = venues[0];
    let bd = Infinity;
    for (const h of venues) {
      const d = Math.hypot(h.x - c.x, h.y - c.y);
      if (d < bd) { bd = d; best = h; }
    }
    return { name: best.name, zone: best.zone };
  });
  // 취약계층(유아·고령) 이용 거점 커널 — "취약계층 우선" 전략에서 이용 가중치에 더함
  const vulnHubs = venues.filter((h) => (h.groups ?? []).some((g) => g === 'family' || g === 'senior'));
  const vulnBonus = cells.map((c) => vulnHubs.reduce((a, h) => a + Math.exp(-((h.x - c.x) ** 2 + (h.y - c.y) ** 2) / (2 * 60 ** 2)), 0));
  const vbMax = Math.max(...vulnBonus) || 1;
  return { cells, nb, place, vulnBonus: vulnBonus.map((v) => v / vbMax) };
}

function accessOf(dT, dR, pathTerm) {
  return 0.45 * Math.min(dT / 250, 1) + 0.35 * Math.min(dR / 150, 1) + 0.2 * pathTerm;
}

/** 요인별 만족도와 전체 만족도 */
export function satisfaction(factors, E0, E) {
  const sumImp = factors.reduce((a, f) => a + f.imp, 0);
  const perf = {};
  let S = 0;
  for (const f of factors) {
    let p = f.perf;
    if (f.spatial && E0[f.key] > 0) p = f.perf + BETA * (5 - f.perf) * (1 - E[f.key] / E0[f.key]);
    perf[f.key] = p;
    S += (f.imp * p) / sumImp;
  }
  return { S, perf };
}

/** 효과 시점: 어린 나무는 수관이 작아 첫해 그늘 효과가 30% 수준이라고 가정 */
export const HORIZONS = [
  { key: 'now', label: '올여름 효과', treeFactor: 0.3 },
  { key: 'later', label: '5년 후 효과', treeFactor: 1 },
];

/**
 * 예산(만원) 안에서 전체 만족도 상승/비용이 큰 순서로 시설을 배치한다.
 * opts.strategy 'satisfaction' | 'vulnerable'  (취약계층 우선이면 유아·고령 이용 거점 주변 가중)
 * opts.enabled  사용할 시설 종류, opts.horizon 'now' | 'later'
 * 반환 trace: 배치 순서대로 [누적 비용, 누적 만족도] — 예산-만족도 곡선용
 */
export function optimize(base, factors, budget, opts = {}) {
  // [개인 디벨롭] fixed: 먼저 고정 배치할 [{key, cell}], exclude: 고르지 않을 'key:cell' 목록 — 최적성 검증(지역탐색)용
  const { strategy = 'satisfaction', enabled = Object.keys(ACTIONS), horizon = 'later', fixed = [], exclude = [] } = opts;
  const treeK = HORIZONS.find((h) => h.key === horizon)?.treeFactor ?? 1;
  // 어린 나무(올여름)는 자기 격자에만 약한 그늘 — 이웃 격자까지 드리우는 효과는 수관이 자란 뒤에
  const eff = (key, which) => {
    if (key !== 'tree' || treeK === 1) return ACTIONS[key][which];
    return which === 'near' ? 0 : ACTIONS[key][which] * treeK;
  };
  const { cells, nb, vulnBonus } = base;
  const n = cells.length;
  const u = cells.map((c, i) => 0.15 + c.props.crowd + (strategy === 'vulnerable' ? 0.8 * vulnBonus[i] : 0));
  const U = u.reduce((a, b) => a + b, 0);
  const v = {
    heat: cells.map((c) => c.props.heat),
    crowd: cells.map((c) => c.props.crowd),
    air: cells.map((c) => c.props.air),
    access: cells.map((c) => c.props.access),
  };
  const dT = cells.map((c) => c.props.dToilet);
  const dR = cells.map((c) => c.props.dRest);
  const expo = (k) => v[k].reduce((a, x, i) => a + u[i] * x, 0) / U;
  const E0 = { heat: expo('heat'), crowd: expo('crowd'), air: expo('air'), access: expo('access') };
  const E = { ...E0 };
  const sumImp = factors.reduce((a, f) => a + f.imp, 0);
  const fac = Object.fromEntries(factors.map((f) => [f.key, f]));
  // dS/dE (선형) — 노출 1 감소당 전체 만족도 증가
  const slope = (k) => (fac[k].imp / sumImp) * BETA * (5 - fac[k].perf) / (E0[k] || 1);

  // 후보 격자: 해당 요인이 상위 40%인 곳 (점형 시설은 거리 먼 곳)
  const top = (arr, share) => {
    const cut = [...arr].sort((a, b) => b - a)[Math.floor(arr.length * share)];
    return arr.map((x, i) => (x >= cut ? i : -1)).filter((i) => i >= 0);
  };
  const cand = {};
  for (const [key, a] of Object.entries(ACTIONS)) {
    if (!enabled.includes(key)) { cand[key] = []; continue; }
    if (key === 'shade') cand[key] = [...new Set([...top(v.heat, 0.4), ...top(dR.map((d, i) => d * u[i]), 0.12)])];
    else if (a.point === 'rest') cand[key] = top(dR.map((d, i) => d * u[i]), 0.12);
    else if (a.point === 'toilet') cand[key] = top(dT.map((d, i) => d * u[i]), 0.08);
    else cand[key] = top(v[a.factor], 0.4);
  }
  const used = new Set();
  const picks = [];
  let remaining = budget;

  // 한 시설이 여러 효과를 낼 수 있음: 면형(격자·주변 지표 감소) + 점형(쉼터·화장실 거리 재계산) + 약한 그늘
  const localFactor = (a) => (a.self != null ? a.factor : null);

  const gainOf = (key, i) => {
    const a = ACTIONS[key];
    let g = 0;
    const lf = localFactor(a);
    if (lf) {
      let dE = u[i] * v[lf][i] * eff(key, 'self');
      for (const j of nb[i]) dE += u[j] * v[lf][j] * eff(key, 'near');
      g += (dE / U) * slope(lf);
    }
    if (a.heatSelf) g += ((u[i] * v.heat[i] * a.heatSelf) / U) * slope('heat');
    if (a.point) {
      let dE = 0;
      const ci = cells[i];
      for (let j = 0; j < n; j++) {
        const d = Math.hypot(cells[j].x - ci.x, cells[j].y - ci.y);
        const nt = a.point === 'toilet' ? Math.min(dT[j], d) : dT[j];
        const nr = a.point === 'rest' ? Math.min(dR[j], d) : dR[j];
        if (nt === dT[j] && nr === dR[j]) continue;
        dE += u[j] * (v.access[j] - accessOf(nt, nr, cells[j].pathTerm));
      }
      g += (dE / U) * slope('access');
    }
    return g;
  };

  const apply = (key, i) => {
    const a = ACTIONS[key];
    const lf = localFactor(a);
    if (lf) {
      v[lf][i] *= 1 - eff(key, 'self');
      for (const j of nb[i]) v[lf][j] *= 1 - eff(key, 'near');
      E[lf] = expo(lf);
    }
    if (a.heatSelf) { v.heat[i] *= 1 - a.heatSelf; E.heat = expo('heat'); }
    if (a.point) {
      const ci = cells[i];
      for (let j = 0; j < n; j++) {
        const d = Math.hypot(cells[j].x - ci.x, cells[j].y - ci.y);
        if (a.point === 'toilet') dT[j] = Math.min(dT[j], d); else dR[j] = Math.min(dR[j], d);
        v.access[j] = accessOf(dT[j], dR[j], cells[j].pathTerm);
      }
      E.access = expo('access');
    }
  };

  const S0 = satisfaction(factors, E0, E0).S;
  const trace = [[0, S0]];
  for (const k of exclude) used.add(k);
  for (const f of fixed) {
    const g = gainOf(f.key, f.cell);
    apply(f.key, f.cell);
    used.add(`${f.key}:${f.cell}`);
    remaining -= ACTIONS[f.key].cost;
    picks.push({ key: f.key, cell: f.cell, gain: g, cost: ACTIONS[f.key].cost });
    trace.push([budget - remaining, trace[trace.length - 1][1] + g]);
  }
  for (let guard = 0; guard < 600; guard++) {
    let best = null;
    for (const key of Object.keys(cand)) {
      const a = ACTIONS[key];
      if (a.cost > remaining) continue;
      for (const i of cand[key]) {
        if (used.has(`${key}:${i}`)) continue;
        const g = gainOf(key, i);
        if (g <= 0) continue;
        const ratio = g / a.cost;
        if (!best || ratio > best.ratio) best = { key, i, gain: g, ratio };
      }
    }
    if (!best || best.gain < 1e-5) break;
    apply(best.key, best.i);
    used.add(`${best.key}:${best.i}`);
    remaining -= ACTIONS[best.key].cost;
    picks.push({ key: best.key, cell: best.i, gain: best.gain, cost: ACTIONS[best.key].cost });
    trace.push([budget - remaining, trace[trace.length - 1][1] + best.gain]); // 선형 모형이라 gain = ΔS
  }

  const before = satisfaction(factors, E0, E0);
  const after = satisfaction(factors, E0, E);
  // 격자별 개선량 (종합: 4개 지표 평균 감소)
  const improve = cells.map((c, i) => (
    (c.props.heat - v.heat[i]) + (c.props.crowd - v.crowd[i]) + (c.props.air - v.air[i]) + (c.props.access - v.access[i])
  ));
  return { picks, spent: budget - remaining, before, after, E0, E, improve, trace, cand };
}

/** 시설별 집계 */
export function summarize(picks) {
  const by = {};
  for (const p of picks) {
    const a = ACTIONS[p.key];
    by[p.key] ??= { key: p.key, label: a.label, cells: 0, qty: 0, unit: a.unit, cost: 0, gain: 0, factor: a.factor };
    by[p.key].cells += 1;
    by[p.key].qty += a.perCell;
    by[p.key].cost += a.cost;
    by[p.key].gain += p.gain;
  }
  return Object.values(by).sort((a, b) => b.gain - a.gain);
}

const won = (man) => (man >= 10000 ? `${(man / 10000).toFixed(man % 10000 ? 1 : 0)}억 원` : `${man.toLocaleString()}만 원`);
export { won };

/** 받침에 맞는 목적격 조사 (을/를). 단위 m은 '미터'로 읽어 '를'. */
function eulReul(word) {
  const last = word.trim().slice(-1);
  if (last === 'm') return '를';
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return '을(를)';
  return code % 28 ? '을' : '를';
}

/** "○○를 근거로, △△에 □□를 설치해야 한다" — 요인별 제안 문장 */
export function proposals(result, base, factors, meta) {
  const { picks, before, after } = result;
  const fac = Object.fromEntries(factors.map((f) => [f.key, f]));
  const byFactor = {};
  for (const p of picks) {
    const k = ACTIONS[p.key].factor;
    (byFactor[k] ??= []).push(p);
  }
  return Object.entries(byFactor).map(([k, ps]) => {
    const cellsSel = ps.map((p) => base.cells[p.cell]);
    const placeCount = {};
    ps.forEach((p) => { const nm = base.place[p.cell].name; placeCount[nm] = (placeCount[nm] ?? 0) + 1; });
    const places = Object.entries(placeCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([nm]) => nm);
    const items = summarize(ps).map((s) => `${s.label} ${s.qty.toLocaleString()}${s.unit}`);
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    let evidence;
    if (k === 'heat') {
      const lst = avg(cellsSel.map((c) => c.props.lst ?? meta.lstMean));
      evidence = `여름 지표온도가 평균 ${lst.toFixed(1)}℃(공원 평균 ${meta.lstMean}℃)로 높고 이용이 몰리는 격자 ${ps.length}곳`;
    } else if (k === 'access') {
      const dT = avg(cellsSel.map((c) => c.props.dToilet));
      const dR = avg(cellsSel.map((c) => c.props.dRest));
      evidence = `화장실까지 평균 ${Math.round(dT)}m·쉼터까지 ${Math.round(dR)}m로 먼 이용 구역`;
    } else if (k === 'air') {
      evidence = `간선도로 인접으로 대기 노출 지표가 높은 가장자리 격자 ${ps.length}곳`;
    } else {
      evidence = `주요 거점이 겹쳐 혼잡 대리지표가 상위인 병목 격자 ${ps.length}곳`;
    }
    const cost = ps.reduce((a, p) => a + p.cost, 0);
    return {
      factor: k,
      label: fac[k].label,
      evidence,
      places,
      items,
      cost,
      perfBefore: before.perf[k],
      perfAfter: after.perf[k],
      text: `${evidence}${eulReul(evidence)} 근거로, ${places.join(', ')} 일대에 ${items.join(', ')}${eulReul(items[items.length - 1])} 설치해야 한다.`,
    };
  }).sort((a, b) => (b.perfAfter - b.perfBefore) - (a.perfAfter - a.perfBefore));
}

/** IPA 4분면 */
export function quadrant(f, mImp, mPerf) {
  if (f.imp >= mImp && f.perf < mPerf) return { key: 'fix', label: '먼저 고칠 것' };
  if (f.imp >= mImp) return { key: 'keep', label: '잘하고 있음' };
  if (f.perf < mPerf) return { key: 'low', label: '천천히 개선' };
  return { key: 'over', label: '충분함' };
}
