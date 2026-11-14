// 취약지역 분석 — 격자 지표 표준화·가중 중첩 → 취약 등급화 → 유형별 공간 처방 (주제서 p.10)

export const INDICATORS = [
  { key: 'heat', label: '열', short: '열 취약', color: 'heat' },
  { key: 'crowd', label: '혼잡', short: '혼잡 취약', color: 'crowd' },
  { key: 'access', label: '접근성', short: '접근성 취약', color: 'access' },
  { key: 'air', label: '대기', short: '대기 취약', color: 'air' },
];

export const DEFAULT_WEIGHTS = { heat: 0.35, crowd: 0.25, access: 0.2, air: 0.2 };

export const PRESCRIPTIONS = {
  heat: { title: '녹음 식재·그늘 확충', items: ['낙엽 교목 추가 식재(녹음)', '그늘막·파고라 설치', '쿨링포그'], unit: '교목 1주/50㎡ 기준' },
  crowd: { title: '사람 흩어지게 하기', items: ['우회 산책로를 내서 붐빔 나누기', '다른 쉼터·놀 곳 추가', '붐비는 시간 프로그램 옮기기'] },
  access: { title: '무장애·휴게 보완', items: ['무장애 동선 보완(단차 해소)', '휴게시설 간격 150m 이내 확충', '화장실·음수대 접근 개선'] },
  air: { title: '도로변 숲띠 심기', items: ['도로 쪽에 나무를 여러 겹 심어 매연·소음 막기', '도로 옆 프로그램을 안쪽으로 옮기기'] },
};

export function composite(props, weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  let v = 0;
  for (const { key } of INDICATORS) v += (weights[key] / sum) * (props[key] ?? 0);
  return v;
}

/** Percentile rank (0–1) of every cell within each indicator — used to name the dominant vulnerability type. */
function percentileRanks(features) {
  const out = features.map(() => ({}));
  for (const { key } of INDICATORS) {
    const order = features.map((f, i) => [f.properties[key] ?? 0, i]).sort((a, b) => a[0] - b[0]);
    order.forEach(([, i], rank) => { out[i][key] = rank / (order.length - 1 || 1); });
  }
  return out;
}

/**
 * @param topShare share of cells flagged vulnerable (e.g. 0.2 = top 20 %)
 * @returns per-cell {score, cls 0-4, vulnerable, dominant} + summary
 */
export function analyze(grid, weights, topShare = 0.2, layer = 'composite') {
  const ranks = percentileRanks(grid.features);
  const active = INDICATORS.filter((i) => weights[i.key] > 0).map((i) => i.key);
  const rows = grid.features.map((f, idx) => {
    const p = f.properties;
    const score = layer === 'composite' ? composite(p, weights) : p[layer] ?? 0;
    // dominant = the indicator in which this cell is most extreme relative to the rest of the park
    const dominant = layer === 'composite'
      ? active.reduce((best, k) => (ranks[idx][k] > ranks[idx][best] ? k : best), active[0] ?? 'heat')
      : layer;
    return { id: p.id, score, dominant, rank: ranks[idx], props: p };
  });
  const sorted = rows.map((r) => r.score).sort((a, b) => a - b);
  const q = (t) => sorted[Math.min(sorted.length - 1, Math.floor(t * sorted.length))];
  const breaks = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const cut = q(1 - topShare);
  for (const r of rows) {
    r.cls = breaks.filter((b) => r.score >= b).length; // 0..4
    r.vulnerable = r.score >= cut;
  }
  const vuln = rows.filter((r) => r.vulnerable);
  const byType = Object.fromEntries(INDICATORS.map((i) => [i.key, 0]));
  vuln.forEach((r) => { byType[r.dominant]++; });
  return {
    rows,
    breaks,
    cut,
    vulnerable: vuln.sort((a, b) => b.score - a.score),
    byType,
    areaM2: vuln.length * 900,
  };
}

export function toCSV(vulnRows) {
  const head = 'cell_id,score,dominant,heat,crowd,access,air,lst_c,ndvi,d_toilet_m,prescription';
  const lines = vulnRows.map((r) => [
    r.id, r.score.toFixed(3), r.dominant, r.props.heat, r.props.crowd, r.props.access, r.props.air,
    r.props.lst ?? '', r.props.ndvi ?? '', r.props.dToilet, `"${PRESCRIPTIONS[r.dominant].title}"`,
  ].join(','));
  return [head, ...lines].join('\n');
}
