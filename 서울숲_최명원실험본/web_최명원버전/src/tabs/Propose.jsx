import React, { useDeferredValue, useMemo, useState } from 'react';
import MapView, { cssVar } from '../components/MapView.jsx';
import PageHead from '../components/PageHead.jsx';
import Finale from '../components/Finale.jsx';
import { Card, Chips, Icon, Segmented } from '../components/ui.jsx';
import { useWidth } from '../components/charts.jsx';
import BeforeAfter from '../components/BeforeAfter.jsx';
import {
  ACTIONS, BETA, FACTORS, HORIZONS, optimize, prepare, proposals, quadrant, summarize, won,
} from '../lib/decide.js';

const STRATEGIES = [
  { key: 'satisfaction', label: '만족도 최대' },
  { key: 'vulnerable', label: '유아·고령 우선' },
];
const MAX_BUDGET = 200000; // 20억 (만원)

// 공원 밖 토지이용 제안 — 근거: 회복정거장_보완내용_근거정리.md (2026-11-14)
const OUTSIDE = [
  { title: '서울숲–성수 그늘 가로', what: '서울숲역·뚝섬역에서 성수 카페거리·업무지구로 가는 보행로에 가로수·그늘막을 연속 배치', ev: '녹지 서울숲 81.7% vs 성수역 500m 17.1% (Sentinel-2, 팀 분석)' },
  { title: '옛 삼표레미콘 부지와 녹지축 연결', what: '공공기여·공개공지를 서울숲 쪽 녹지·보행 연결로 쓰도록 제안', ev: '2026.2 지구단위계획 결정, 업무·주거 고층 복합 개발 예정 (공공기여 세부는 고시문 확인 필요)' },
  { title: '공원 접면 공개공지 녹지화', what: '공원과 맞닿은 신축 건물의 공개공지를 그늘 있는 녹지형으로, 저층부는 공원 쪽으로 개방', ev: '서울숲 일대 지구단위계획구역' },
  { title: '간선도로변 완충 숲띠 연장', what: '공원 경계부 다층 식재를 공원 밖 보도까지 연장', ev: '도로 공기 취약 칸이 강변북로·고산자로 쪽 가장자리에 집중 (팀 진단)' },
];

// 데이터 수집 계획 (고정 / 가변)
const DATA_PLAN = [
  ['고정', '공원 경계·20m 격자·위성 지표(지표온도·NDVI)·보행망', '학기 1회', '취약지역 진단'],
  ['고정', '시설(화장실·쉼터·실내 대피)·위험 기준표·대체 프로그램', '변경 시', '지금 머물기 좋은 곳'],
  ['가변', '기온·체감온도·자외선·강수 / 초미세먼지 (기상청·에어코리아)', '1시간', '위험 단계 판정'],
  ['가변', '서울 실시간 도시데이터 「서울숲공원」 혼잡도·연령 비율', '5분~1시간', '혼잡 예측 보정'],
  ['가변', '블로그·지도앱 리뷰 표본 → 6개 요인 언급·긍정 비율', '1주', '중요도·만족도'],
  ['가변', '현장 QR 설문(8개 구역, 5점 만족도 + 이유)', '실시간', '만족도 비교'],
];

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/* ① 중요도-만족도(IPA) 4분면 */
function IPAChart({ factors }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const h = 250;
  const pad = { l: 34, r: 14, t: 14, b: 30 };
  const lo = 2.4;
  const hi = 4.8;
  const x = (v) => pad.l + ((v - lo) / (hi - lo)) * (width - pad.l - pad.r);
  const y = (v) => h - pad.b - ((v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  const mImp = factors.reduce((a, f) => a + f.imp, 0) / factors.length;
  const mPerf = factors.reduce((a, f) => a + f.perf, 0) / factors.length;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {width > 0 && (
        <svg className="chart" width={width} height={h} role="img" aria-label="중요도-만족도 분석">
          <rect x={pad.l} y={pad.t} width={x(mPerf) - pad.l} height={y(mImp) - pad.t} fill="var(--critical-wash)" rx="8" />
          <text x={pad.l + 8} y={pad.t + 16} style={{ fill: 'var(--critical)', fontWeight: 700 }}>먼저 고칠 것</text>
          <text x={width - pad.r - 6} y={pad.t + 16} textAnchor="end">잘하고 있음</text>
          <text x={pad.l + 8} y={h - pad.b - 8}>천천히 개선</text>
          <text x={width - pad.r - 6} y={h - pad.b - 8} textAnchor="end">충분함</text>
          <line className="axis" x1={x(mPerf)} x2={x(mPerf)} y1={pad.t} y2={h - pad.b} strokeDasharray="3 4" />
          <line className="axis" x1={pad.l} x2={width - pad.r} y1={y(mImp)} y2={y(mImp)} strokeDasharray="3 4" />
          <text x={(pad.l + width - pad.r) / 2} y={h - 6} textAnchor="middle">지금 만족도 (높을수록 →)</text>
          <text x={10} y={(pad.t + h - pad.b) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(pad.t + h - pad.b) / 2})`}>중요도 →</text>
          {factors.map((f, i) => {
            // 앞서 그린 점과 라벨이 겹치면 이 라벨은 점 왼쪽으로
            const clash = factors.slice(0, i).some((o) => Math.abs(y(o.imp) - y(f.imp)) < 14 && Math.abs(x(o.perf) - x(f.perf)) < 80);
            return (
              <g key={f.key} onMouseEnter={() => setHover(f)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
                <circle cx={x(f.perf)} cy={y(f.imp)} r="14" fill="transparent" />
                <circle cx={x(f.perf)} cy={y(f.imp)} r="6" fill={f.spatial ? 'var(--brand)' : 'var(--surface)'} stroke="var(--brand)" strokeWidth="2" />
                <text x={x(f.perf) + (clash ? 0 : 10)} y={y(f.imp) + (clash ? 20 : 4)} textAnchor={clash ? 'middle' : 'start'}
                  style={{ fill: 'var(--ink)', fontWeight: 650, fontSize: 12 }}>{f.label}</text>
              </g>
            );
          })}
        </svg>
      )}
      {hover && (
        <div className="chart-tip" style={{ left: x(hover.perf), top: y(hover.imp) }}>
          <b>{hover.label}</b> · 중요도 {hover.imp.toFixed(1)} · 만족도 {hover.perf.toFixed(1)}
          <div className="muted">{hover.spatial ? '공간 시설로 개선' : hover.service}</div>
        </div>
      )}
      <div className="legend" style={{ marginTop: 6 }}>
        <span><i style={{ background: 'var(--brand)', borderRadius: '50%' }} />공간 시설로 개선</span>
        <span><i style={{ background: 'var(--surface)', border: '2px solid var(--brand)', borderRadius: '50%', width: 8, height: 8 }} />대시보드 서비스로 개선</span>
      </div>
    </div>
  );
}

/* ② 예산 → 만족도 곡선 (효과가 꺾이는 지점 확인) */
function CurveChart({ trace, budget, onPick }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const h = 150;
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const sMin = trace[0][1];
  const sMax = trace[trace.length - 1][1];
  const x = (v) => pad.l + (v / MAX_BUDGET) * (width - pad.l - pad.r);
  const y = (v) => h - pad.b - ((v - sMin) / ((sMax - sMin) || 1)) * (h - pad.t - pad.b);
  const d = trace.map(([c, s], i) => `${i ? 'L' : 'M'}${x(c).toFixed(1)},${y(s).toFixed(1)}`).join('');
  const at = (b) => { let s = trace[0][1]; for (const [c, v] of trace) { if (c <= b) s = v; else break; } return s; };
  const move = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const b = Math.max(0, Math.min(MAX_BUDGET, ((e.clientX - rect.left - pad.l) / (width - pad.l - pad.r)) * MAX_BUDGET));
    setHover(Math.round(b / 5000) * 5000);
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {width > 0 && (
        <svg className="chart" width={width} height={h} onMouseMove={move} onMouseLeave={() => setHover(null)}
          onClick={() => hover != null && onPick(Math.max(5000, hover))} style={{ cursor: 'pointer' }} role="img" aria-label="예산별 예상 만족도">
          {[0, 50000, 100000, 150000, 200000].map((b) => (
            <g key={b}><line className="gridline" x1={x(b)} x2={x(b)} y1={pad.t} y2={h - pad.b} /><text x={x(b)} y={h - 6} textAnchor="middle" className="num">{b / 10000}억</text></g>
          ))}
          <text x={pad.l - 6} y={y(sMax) + 4} textAnchor="end" className="num">{sMax.toFixed(2)}</text>
          <text x={pad.l - 6} y={y(sMin) + 4} textAnchor="end" className="num">{sMin.toFixed(2)}</text>
          <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="2" />
          <line x1={x(budget)} x2={x(budget)} y1={pad.t} y2={h - pad.b} stroke="var(--ink)" strokeWidth="1.5" />
          <circle cx={x(budget)} cy={y(at(budget))} r="5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={h - pad.b} stroke="var(--axis)" strokeDasharray="3 3" />}
        </svg>
      )}
      {hover != null && (
        <div className="chart-tip" style={{ left: x(hover), top: y(at(hover)) }}>
          <b className="num">{won(hover)}</b> → 만족도 <b className="num">{at(hover).toFixed(2)}</b>
          <div className="muted">누르면 이 예산으로 설정</div>
        </div>
      )}
    </div>
  );
}

export default function Propose({ data, theme, go }) {
  const { grid, hubs, meta } = data;
  const S = data.team.meta.scenario;
  const base = useMemo(() => prepare(grid, hubs), [grid, hubs]);
  const [factors, setFactors] = useState(FACTORS);
  const [budget, setBudget] = useState(50000);
  const [strategy, setStrategy] = useState('vulnerable');
  const [horizon, setHorizon] = useState('now');
  const [enabled, setEnabled] = useState(Object.keys(ACTIONS));
  const [copied, setCopied] = useState(false);
  const dBudget = useDeferredValue(budget);
  const opts = useMemo(() => ({ strategy, horizon, enabled }), [strategy, horizon, enabled]);

  const curve = useMemo(() => optimize(base, factors, MAX_BUDGET, opts).trace, [base, factors, opts]);
  const res = useMemo(() => optimize(base, factors, dBudget, opts), [base, factors, dBudget, opts]);
  const items = summarize(res.picks);
  const props = useMemo(() => proposals(res, base, factors, meta), [res, base, factors, meta]);
  const gain = res.after.S - res.before.S;
  const mImp = factors.reduce((a, f) => a + f.imp, 0) / factors.length;
  const mPerf = factors.reduce((a, f) => a + f.perf, 0) / factors.length;
  const urgent = factors.filter((f) => quadrant(f, mImp, mPerf).key === 'fix');

  // "가장 뜨거운 곳 ≠ 사람이 머무는 곳" — 공간 데이터에서 계산한 통찰
  const insight = useMemo(() => {
    const heat = base.cells.map((c) => c.props.heat);
    const cut = [...heat].sort((a, b) => b - a)[Math.floor(heat.length * 0.2)];
    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const hot = avg(base.cells.filter((c) => c.props.heat >= cut).map((c) => c.props.crowd));
    return Math.round((hot / avg(base.cells.map((c) => c.props.crowd))) * 100);
  }, [base]);

  const gridLayer = useMemo(() => {
    const ramp = [1, 2, 3, 4].map((k) => cssVar(`--g${k}`));
    const max = Math.max(...res.improve) || 1;
    return {
      geojson: grid,
      fill: (id) => {
        const v = res.improve[id] / max;
        if (v <= 0.02) return null;
        return ramp[Math.min(3, Math.floor(v * 4))];
      },
      tooltip: (p) => `<b>${base.place[p.id].name} 주변</b><br>지표 개선량 ${res.improve[p.id].toFixed(2)}`,
    };
  }, [grid, res, base, theme]);

  const markers = useMemo(() => res.picks.map((p, i) => {
    const c = base.cells[p.cell];
    const a = ACTIONS[p.key];
    return {
      id: `${p.key}-${p.cell}-${i}`, lat: c.lat, lon: c.lon, color: a.color, radius: p.key === 'toilet' ? 8 : 6,
      tooltip: `<b>${a.label}</b> ${a.perCell}${a.unit}<br>${base.place[p.cell].name} 주변 · ${won(a.cost)}`,
    };
  }), [res, base]);

  const reportText = () => [
    `[서울숲 만족도 개선 제안] 예산 ${won(res.spent)} · ${STRATEGIES.find((s) => s.key === strategy).label} · ${HORIZONS.find((h) => h.key === horizon).label} 기준`,
    `예상 전체 만족도 ${res.before.S.toFixed(2)} → ${res.after.S.toFixed(2)} (5점 척도, +${gain.toFixed(2)})`,
    ...props.map((p, i) => `${i + 1}. ${p.text} (${p.label} 만족도 ${p.perfBefore.toFixed(2)} → ${p.perfAfter.toFixed(2)}, ${won(p.cost)})`),
    '※ IPA 값·단가·효과계수는 가정값이며 설문·리뷰·실적 단가로 교체 예정',
  ].join('\n');

  const copy = async () => {
    try { await navigator.clipboard.writeText(reportText()); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  const exportCSV = () => {
    const head = 'order,facility,qty,unit,cost_manwon,cell_id,place,zone,lon,lat,satisfaction_gain';
    const rows = res.picks.map((p, i) => {
      const c = base.cells[p.cell];
      const a = ACTIONS[p.key];
      return [i + 1, a.label, a.perCell, a.unit, a.cost, c.id, `"${base.place[p.cell].name}"`, base.place[p.cell].zone, c.lon.toFixed(6), c.lat.toFixed(6), p.gain.toFixed(5)].join(',');
    });
    download('seoulforest_proposal.csv', `﻿${[head, ...rows].join('\n')}`, 'text/csv');
  };
  const exportGeoJSON = () => {
    const fc = {
      type: 'FeatureCollection',
      features: res.picks.map((p, i) => {
        const c = base.cells[p.cell];
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { order: i + 1, facility: ACTIONS[p.key].label, qty: ACTIONS[p.key].perCell, unit: ACTIONS[p.key].unit, cost_manwon: p.cost, place: base.place[p.cell].name } };
      }),
    };
    download('seoulforest_proposal.geojson', JSON.stringify(fc), 'application/geo+json');
  };

  const setF = (key, field, val) => setFactors((fs) => fs.map((f) => (f.key === key ? { ...f, [field]: val } : f)));
  const toggleAction = (k) => setEnabled((en) => (en.includes(k) ? (en.length > 1 ? en.filter((x) => x !== k) : en) : [...en, k]));

  return (
    <>
      <PageHead who="설계사·발주처용"
        q="고치면 얼마나 나아지나?"
        why="1단계에서 찾은 머물기 어려운 곳에 나무·그늘막·쉼터를 배치하고, 배치 후의 불편도를 다시 계산했습니다." />

      <section className="answer">
        <span className="answer-tag">결론</span>
        <p>
          나무 <b className="num">{S.trees + S.buf_trees}그루</b>, 그늘막 <b className="num">{(S.shade / 10000).toFixed(1)}ha</b>, 쉼터 <b className="num">{S.rest_add}곳</b>을 더하면
          머물기 어려운 땅이 <b className="num">{(S.vuln_before / 10000).toFixed(1)}ha → {(S.vuln_after / 10000).toFixed(1)}ha</b>로 줄어듭니다
          ({Math.round(((S.vuln_before - S.vuln_after) / S.vuln_before) * 100)}% 개선).
        </p>
        <div className="answer-sub">쉼터까지 평균 거리 {S.rest_before}m → {S.rest_after}m · 아래 지도에서 「지금 / 개선 후」를 눌러 비교할 수 있습니다.</div>
      </section>

      <div className="grid g-12" style={{ marginTop: 18 }}>
        <BeforeAfter data={data} theme={theme} />
      </div>

      <div className="part-head">
        <span className="part-n">+</span>
        <div>
          <h2>공원 밖으로 — 서울숲을 성수 생활권까지 잇기</h2>
          <p>공원 안만 고쳐서는 주변 녹지 부족(성수역 반경 500m 녹지 17.1%)을 바꿀 수 없습니다. 토지이용 차원의 제안입니다.</p>
        </div>
      </div>
      <div className="outside">
        {OUTSIDE.map((o, i) => (
          <div key={o.title} className="out-card">
            <span className="out-n num">{i + 1}</span>
            <b>{o.title}</b>
            <p>{o.what}</p>
            <span className="out-ev">근거 · {o.ev}</span>
          </div>
        ))}
      </div>

      <div className="more-wrap">
      <details className="more adv">
        <summary>예산을 정해 직접 배치해 보기 <span className="muted">— 심화 · 만족도는 설문 전 가상값</span></summary>
        <div className="more-body">
        <p className="small ink2" style={{ margin: '0 0 12px' }}>예산을 정하면 이용자 불만이 큰 것부터 풀리도록 시설 위치를 계산하고, 보고서용 제안 문장을 만듭니다.</p>

      {/* 결과 요약 */}
      <section className="hero wide s0 propose-hero">
        <div>
          <span className="hero-pill"><Icon name="spark" size={13} /> 예산 {won(res.spent)} 투입 시</span>
          <div className="hero-title">만족도 <span className="num">{res.before.S.toFixed(2)}</span> → <span className="num">{res.after.S.toFixed(2)}</span></div>
          <div className="hero-msg">5점 척도 · +{gain.toFixed(2)}점 · 시설 {res.picks.length}건</div>
        </div>
        <div className="hero-facts">
          {items.slice(0, 3).map((s) => (
            <div key={s.key} className="hero-fact"><span>{s.label}</span><b className="num">{s.qty.toLocaleString()}<small style={{ fontSize: 12, marginLeft: 2 }}>{s.unit}</small></b></div>
          ))}
        </div>
      </section>

      <div className="grid g-12" style={{ marginTop: 18 }}>
        <Card className="span-5" title="① 무엇이 가장 불만일까" sub="중요한데 만족도가 낮은 것(빨간 칸)부터 고칩니다">
          <IPAChart factors={factors} />
          <div className="small ink2" style={{ marginTop: 10 }}>
            먼저 고칠 것: <b>{urgent.map((f) => f.label).join(', ') || '없음'}</b>
          </div>
          <div className="assume">가상 예시값 — 현장 설문·리뷰 분석 후 교체 (아래 「진단 값 수정」)</div>
        </Card>

        <Card className="span-7" title="② 예산 정하기" sub="예산을 움직이면 아래 지도와 제안이 바로 바뀝니다 · 곡선은 예산별 만족도">
          <div className="budget">
            <label htmlFor="budget" className="budget-label">예산</label>
            <input id="budget" type="range" min="5000" max={MAX_BUDGET} step="5000" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            <b className="budget-val num">{won(budget)}</b>
          </div>
          <CurveChart trace={curve} budget={dBudget} onPick={setBudget} />
          <div className="cond-grid">
            <div><div className="cond-l">누구를 먼저</div><Segmented options={STRATEGIES} value={strategy} onChange={setStrategy} label="전략" /></div>
            <div><div className="cond-l">언제 효과</div><Segmented options={HORIZONS} value={horizon} onChange={setHorizon} label="효과 시점" /></div>
          </div>
          <div className="cond-l" style={{ marginTop: 12 }}>쓸 수 있는 시설</div>
          <div className="chips">
            {Object.entries(ACTIONS).map(([k, a]) => (
              <button key={k} type="button" className="chip" aria-pressed={enabled.includes(k)} onClick={() => toggleAction(k)}>
                <i className="sw" style={{ background: a.color }} />{a.label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="span-8" title="③ 어디에 무엇을 놓을까" sub="점 = 새 시설 위치 · 초록 칸 = 더 쾌적해지는 곳">
          <div className="expert-map">
            <MapView data={data} theme={theme} grid={gridLayer} hubs={markers}
              legend={(
                <div className="legend" style={{ gap: 10 }}>
                  {items.map((s) => <span key={s.key}><i style={{ background: ACTIONS[s.key].color, borderRadius: '50%' }} />{s.label}</span>)}
                </div>
              )} />
          </div>
        </Card>

        <div className="span-4 grid" style={{ alignContent: 'start' }}>
          <Card title="요인별 만족도 변화" sub="● 지금 → ● 개선 후 (5점)">
            <div className="dumbbells">
              {factors.filter((f) => f.spatial).map((f) => {
                const b = res.before.perf[f.key];
                const a = res.after.perf[f.key];
                const pos = (v) => `${((v - 1) / 4) * 100}%`;
                return (
                  <div key={f.key} className="db-row" title={`${f.label} ${b.toFixed(2)} → ${a.toFixed(2)}`}>
                    <span className="db-label">{f.label}</span>
                    <span className="db-track">
                      <span className="db-bar" style={{ left: pos(b), width: `calc(${pos(a)} - ${pos(b)})` }} />
                      <span className="db-dot before" style={{ left: pos(b) }} />
                      <span className="db-dot after" style={{ left: pos(a) }} />
                    </span>
                    <span className="db-val num">+{(a - b).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title="시설 구성" sub={`총 ${won(res.spent)} / 예산 ${won(dBudget)}`}>
            <table className="data">
              <thead><tr><th>시설</th><th>수량</th><th style={{ textAlign: 'right' }}>비용</th></tr></thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.key}>
                    <td><i className="sw" style={{ background: ACTIONS[s.key].color }} />{s.label}</td>
                    <td className="num">{s.qty.toLocaleString()}{s.unit}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{won(s.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <Card className="span-12" title="④ 제안 문장" sub="무엇을 근거로 → 어디에 → 무엇을 → 얼마나 좋아지나 · 보고서에 그대로 붙여 쓸 수 있습니다"
          right={(
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={copy}>{copied ? '복사됨 ✓' : '제안문 복사'}</button>
              <button type="button" className="btn" onClick={exportCSV}><Icon name="download" size={13} /> CSV</button>
              <button type="button" className="btn" onClick={exportGeoJSON}><Icon name="download" size={13} /> GeoJSON</button>
            </div>
          )}>
          <ol className="proposals">
            {props.map((p) => (
              <li key={p.factor}>
                <div className="prop-text">{p.text}</div>
                <div className="prop-meta">
                  <span className="prop-tag">{p.label}</span>
                  만족도 <b className="num">{p.perfBefore.toFixed(2)} → {p.perfAfter.toFixed(2)}</b> · {won(p.cost)}
                </div>
              </li>
            ))}
          </ol>
          <div className="insight">
            <Icon name="sun" size={16} />
            <div><b>발견: 가장 뜨거운 곳 ≠ 사람이 머무는 곳.</b> 제일 뜨거운 곳(상위 20%)에 사람이 머무는 정도는 공원 평균의 {insight}%뿐입니다.
              그래서 그늘은 「뜨거운 곳」이 아니라 <b>「사람이 머무는 뜨거운 곳」</b>에 놓도록 배치했습니다.</div>
          </div>
        </Card>
      </div>
        </div>
      </details>
      </div>

      <div className="more-wrap">
        <details className="more">
          <summary>데이터는 어떻게 모으나 <span className="muted">— 고정·가변 데이터와 만족도 수집 계획</span></summary>
          <div className="more-body">
            <table className="data">
              <thead><tr><th>구분</th><th>데이터</th><th>갱신</th><th>쓰는 곳</th></tr></thead>
              <tbody>
                {DATA_PLAN.map((r) => <tr key={r[1]}>{r.map((c, i) => <td key={i} className={i === 0 ? '' : 'small'}>{i === 0 ? <b>{c}</b> : c}</td>)}</tr>)}
              </tbody>
            </table>
            <p className="small ink2" style={{ margin: '10px 0 0' }}>
              리뷰는 대량 자동 수집 대신 표본 300건을 사람이 읽어 6개 요인으로 분류합니다(이용약관·개인정보 보호). 게시자 정보는 저장하지 않고, 걸음 수·심박 같은 건강 정보도 서버에 저장하지 않습니다.
            </p>
          </div>
        </details>
        <details className="more">
          <summary>진단 값 수정<span className="muted">— 설문·리뷰 결과(중요도·만족도 5점)를 넣는 곳</span></summary>
          <div className="more-body">
            <table className="data" style={{ maxWidth: 620 }}>
              <thead><tr><th>요인</th><th>중요도</th><th>만족도</th><th>대응</th></tr></thead>
              <tbody>
                {factors.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    <td><input className="num-in" type="number" min="1" max="5" step="0.1" value={f.imp} onChange={(e) => setF(f.key, 'imp', Number(e.target.value) || 1)} aria-label={`${f.label} 중요도`} /></td>
                    <td><input className="num-in" type="number" min="1" max="5" step="0.1" value={f.perf} onChange={(e) => setF(f.key, 'perf', Number(e.target.value) || 1)} aria-label={`${f.label} 만족도`} /></td>
                    <td className="small ink2">{f.spatial ? '공간 시설' : f.service}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => setFactors(FACTORS)}>예시값으로</button>
          </div>
        </details>
        <details className="more">
          <summary>계산 방법과 가정 <span className="muted">— 단가·효과계수·만족도 연결식</span></summary>
          <div className="more-body prov">
            <p style={{ margin: '0 0 10px' }}>
              ① 요인별 <b>이용 가중 노출도</b> E = Σ(이용 강도 × 취약 지표) / Σ 이용 강도 — 사람이 실제로 겪는 불편.
              ② 시설을 놓으면 해당 격자(와 주변 45m)의 지표가 줄어 E가 감소. 쉼터·화장실은 거리를 다시 계산.
              ③ 만족도 연결(가정): 개선 후 만족도 = 현재 + {BETA} × (5 − 현재) × E 감소율.
              ④ 전체 만족도 = 중요도 가중 평균. 「만족도 상승 ÷ 비용」이 가장 큰 시설부터 예산이 다 찰 때까지 배치(탐욕 알고리즘).
            </p>
            <table className="data">
              <thead><tr><th>시설</th><th>단위</th><th>가정 단가</th><th>효과(격자/주변)</th><th>비고</th></tr></thead>
              <tbody>
                {Object.entries(ACTIONS).map(([k, a]) => (
                  <tr key={k}>
                    <td><i className="sw" style={{ background: a.color }} />{a.label}</td>
                    <td>{a.perCell}{a.unit}</td>
                    <td className="num">{won(a.cost)}</td>
                    <td className="num">
                      {[
                        a.self != null && `−${Math.round(a.self * 100)}% / −${Math.round(a.near * 100)}%`,
                        a.heatSelf && `그늘 −${Math.round(a.heatSelf * 100)}%`,
                        a.point && `${a.point === 'rest' ? '쉼터' : '화장실'} 거리 재계산`,
                      ].filter(Boolean).join(' + ')}
                    </td>
                    <td>{a.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl style={{ margin: '10px 0 0' }}>
              <dt>한계</dt>
              <dd>단가·효과계수·β·IPA 값은 가정값(검증 필요) — 조달청 단가·한국종합기술 실적 단가, 현장 설문으로 교체 예정.
                OSM에 벤치가 {meta.rests}개만 등록돼 쉼터 효과가 과대평가될 수 있음 → 서울시 공원 시설물 현황으로 보완.
                혼잡은 대리지표(현장 계수 전).</dd>
            </dl>
          </div>
        </details>
      </div>

      <Finale data={data} go={go} />
    </>
  );
}
