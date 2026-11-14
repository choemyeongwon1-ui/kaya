import React, { useMemo, useState } from 'react';
import MapView, { cssVar } from '../components/MapView.jsx';
import PageHead from '../components/PageHead.jsx';
import NextStep from '../components/NextStep.jsx';
import { Card, Icon, Segmented } from '../components/ui.jsx';
import { GRADES, LAYERS, IND, ZONES, SURVEY_HYPO, QUAD, WHO, STD } from '../content/team.js';

// 취약지역 진단 — 결론 → ① 어디가 불편한가 → ② 어디부터 고칠까 → ③ 이용자 만족도와 비교 → (접힘) 분석 도구
const KEYS = ['heat', 'access', 'air', 'crowd'];
const ZONE_COLOR = { 1: '--critical', 2: '--serious', 3: '--warning', 4: '--muted' };
const CURE = {
  heat: '그늘 나무 심기 · 그늘막/파고라',
  access: '쉼터·화장실 추가',
  air: '도로 쪽에 나무를 여러 겹 (도로변 숲띠)',
  crowd: '우회 산책로 · 붐빌 때 다른 곳 안내',
};
// 결론 문장용 쉬운 표현
const CAUSE = { shade: '그늘 부족', heat: '뜨거운 바닥', rest: '먼 쉼터', road: '큰길 매연·소음', crowd: '붐빔' };
const CAND = { plant: '나무 심기', shade: '그늘막·파고라', buffer: '도로변 숲띠' };

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
const pctl = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

/** 칸 하나를 5개 기준으로 통과/미달 판정 */
function runChecks(p, std, avg) {
  return [
    { key: 'shade', label: '나무 그늘', ok: p.tree >= std.shade, val: `${Math.round(p.tree * 100)}%`, std: `${Math.round(std.shade * 100)}% 이상`, avg: `${Math.round(avg.tree * 100)}%`, cure: 'heat' },
    { key: 'heat', label: '바닥 온도', ok: p.lst < avg.lst + std.heatOver, val: `${p.lst.toFixed(1)}℃`, std: `평균${std.heatOver ? `+${std.heatOver}` : ''}℃ 미만`, avg: `${avg.lst.toFixed(1)}℃`, cure: 'heat' },
    { key: 'rest', label: '쉼터까지', ok: p.dRest <= std.rest, val: `${p.dRest}m`, std: `${std.rest}m 이내`, avg: `${Math.round(avg.dRest)}m`, cure: 'access' },
    { key: 'road', label: '큰길과 거리', ok: p.dRoad >= std.road, val: `${p.dRoad}m`, std: `${std.road}m 이상`, avg: `${Math.round(avg.dRoad)}m`, cure: 'air' },
    { key: 'crowd', label: '붐빔(추정)', ok: p.crowd < std.crowd, val: `${Math.round(p.crowd)}점`, std: `${std.crowd}점 미만`, avg: `${Math.round(avg.crowd)}점`, cure: 'crowd' },
  ];
}

function Part({ n, title, desc }) {
  return (
    <div className="part-head">
      <span className="part-n">{n}</span>
      <div><h2>{title}</h2>{desc ? <p>{desc}</p> : null}</div>
    </div>
  );
}

export default function Expert({ data, theme, go }) {
  const { team } = data;
  const { meta, zones, survey } = team;
  const grid = team.grid;
  const props = useMemo(() => grid.features.map((f) => f.properties), [grid]);
  const [layer, setLayer] = useState('fails');
  const [who, setWho] = useState('all');
  const [weights, setWeights] = useState(meta.weights);
  const [selId, setSelId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [zoneSel, setZoneSel] = useState(1);
  const [focus, setFocus] = useState(null);
  const [zfocus, setZfocus] = useState(null);

  // 공원 평균 (비교 기준) + 칸마다 기준 미달 개수
  const raw = useMemo(() => ({
    tree: mean(props.map((p) => p.tree)), lst: mean(props.map((p) => p.lst)),
    dRest: mean(props.map((p) => p.dRest)), dRoad: mean(props.map((p) => p.dRoad)), crowd: mean(props.map((p) => p.crowd)),
  }), [props]);
  const checksAll = useMemo(() => props.map((p) => runChecks(p, STD[who], raw)), [props, who, raw]);
  const fails = useMemo(() => checksAll.map((cs) => cs.filter((c) => !c.ok).length), [checksAll]);

  // 가중치로 종합 점수 다시 계산 → 상위 40/20/10% 로 4단계 (기본 가중치면 팀 분석과 같음)
  const scored = useMemo(() => {
    const wsum = KEYS.reduce((a, k) => a + weights[k], 0) || 1;
    const score = props.map((p) => KEYS.reduce((a, k) => a + p[k] * weights[k], 0) / wsum);
    const sorted = [...score].sort((a, b) => a - b);
    const cut = [pctl(sorted, 0.6), pctl(sorted, 0.8), pctl(sorted, 0.9)];
    const grade = score.map((s) => (s >= cut[2] ? 3 : s >= cut[1] ? 2 : s >= cut[0] ? 1 : 0));
    const order = score.map((s, i) => i).sort((a, b) => score[b] - score[a]);
    const rank = new Array(score.length);
    order.forEach((id, r) => { rank[id] = r + 1; });
    return { score, grade, order, rank, wsum, vulnArea: grade.filter((g) => g >= 2).length * 400 };
  }, [props, weights]);
  const isDefaultW = KEYS.every((k) => weights[k] === meta.weights[k]);

  // 결론: 불편한 칸에서 가장 많이 걸린 기준 2개
  const causes = useMemo(() => {
    const cnt = {};
    props.forEach((p, i) => {
      if (scored.grade[i] < 2) return;
      checksAll[i].forEach((c) => { if (!c.ok) cnt[c.key] = (cnt[c.key] ?? 0) + 1; });
    });
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => CAUSE[k]);
  }, [props, scored, checksAll]);
  const mainZones = zones.filter((z) => !ZONES[z.rank].hold).map((z) => ZONES[z.rank].name);
  const severeHa = (fails.filter((n) => n >= 3).length * 400) / 10000;

  const ramp = useMemo(() => [1, 2, 3, 4].map((k) => cssVar(`--v${k}`)), [theme]);
  const failColors = useMemo(() => [cssVar('--g1'), cssVar('--v1'), cssVar('--v2'), cssVar('--v3'), cssVar('--v4')], [theme]);
  const gradeOf = (id, lyr) => {
    if (lyr === 'score' || lyr === 'fails') return scored.grade[id];
    const v = props[id][lyr];
    return v >= 75 ? 3 : v >= 50 ? 2 : v >= 25 ? 1 : 0;
  };

  const pinId = selId ?? scored.order[0]; // 클릭으로 고정한 칸
  const sid = hoverId ?? pinId; // 마우스를 올린 칸이 있으면 그 칸을 보여 줌
  const sel = props[sid];

  // ① 칸 지도
  const cellLayer = useMemo(() => ({
    geojson: grid,
    fill: (id) => (layer === 'fails' ? failColors[Math.min(4, fails[id])] : ramp[gradeOf(id, layer)]),
    outline: (id) => pinId === id,
    tooltip: (p) => {
      const n = fails[p.id];
      const row = checksAll[p.id].map((c) => `<span style="color:${c.ok ? 'var(--success-text)' : 'var(--critical)'};font-weight:800">${c.ok ? '✓' : '✕'}</span> ${c.label} <b>${c.val}</b>`).join('<br>');
      return `<b>5가지 중 ${n}가지 부족</b> · ${GRADES[scored.grade[p.id]]}<hr style="border:0;border-top:1px solid var(--hair);margin:4px 0">${row}`;
    },
    onClick: (p) => setSelId(p.id),
    onHover: (p) => setHoverId(p ? p.id : null),
  }), [grid, layer, pinId, ramp, scored, fails, failColors, checksAll, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // ② 구역 지도
  const zoneLayer = useMemo(() => ({
    geojson: grid,
    fill: (id) => (props[id].zone ? cssVar(ZONE_COLOR[props[id].zone]) : null),
    tooltip: (p) => (p.zone ? `<b>${p.zone}순위</b> · ${ZONES[p.zone].name}` : ''),
    onClick: (p) => { if (p.zone) setZoneSel(p.zone); },
  }), [grid, props, theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoneMarkers = useMemo(() => zones.map((z) => ({
    id: z.rank, lat: z.lat, lon: z.lon, color: cssVar(ZONE_COLOR[z.rank]), radius: 9,
    tooltip: `${z.rank}`, permanent: z.rank === zoneSel, onClick: () => setZoneSel(z.rank),
  })), [zones, zoneSel, theme]);

  // ③ 설문 구역별 평균 불편도 × 만족도(가설)
  const gap = useMemo(() => {
    const rows = survey.map((zz, i) => {
      const ids = props.filter((p) => p.sz === i + 1).map((p) => p.id);
      const v = ids.reduce((a, id) => a + scored.score[id], 0) / Math.max(1, ids.length);
      return { ...zz, vuln: v, sat: SURVEY_HYPO[zz.id]?.all ?? 3, why: SURVEY_HYPO[zz.id]?.why ?? '' };
    });
    const mV = rows.reduce((a, r) => a + r.vuln, 0) / rows.length;
    return rows.map((r) => ({ ...r, q: QUAD.find((x) => x.test(r.vuln >= mV, r.sat >= 3.5)) }))
      .sort((a, b) => QUAD.indexOf(a.q) - QUAD.indexOf(b.q) || b.vuln - a.vuln);
  }, [survey, props, scored]);

  const legend = layer === 'fails' ? (
    <div>
      <div className="xs" style={{ fontWeight: 800, marginBottom: 4 }}>5가지 중 부족한 개수</div>
      <div className="legend-ramp">{failColors.map((c, k) => <span key={k} style={{ background: c }} />)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }} className="xs muted">{['0', '1', '2', '3', '4+'].map((g) => <span key={g}>{g}</span>)}</div>
    </div>
  ) : (
    <div>
      <div className="xs" style={{ fontWeight: 800, marginBottom: 4 }}>{LAYERS.find((l) => l.key === layer).label}</div>
      <div className="legend-ramp">{ramp.map((c, k) => <span key={k} style={{ background: c }} />)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }} className="xs muted">{GRADES.map((g) => <span key={g}>{g}</span>)}</div>
    </div>
  );

  // 선택 칸 판정
  const contrib = KEYS.map((k) => ({ k, c: (sel[k] * weights[k]) / scored.wsum }));
  const main = [...contrib].sort((a, b) => b.c - a.c)[0];
  const checks = checksAll[sid];
  const failed = checks.filter((c) => !c.ok);
  const cureKey = failed.some((c) => c.cure === main.k) ? main.k : failed[0]?.cure;
  const phrase = {
    shade: sel.tree < 0.05 ? '나무 그늘이 없음' : `나무 그늘 ${Math.round(sel.tree * 100)}%뿐`,
    heat: `바닥이 평균보다 ${(sel.lst - raw.lst).toFixed(1)}℃ 뜨거움`,
    rest: `쉼터까지 ${sel.dRest}m`,
    road: `큰길에서 ${sel.dRoad}m — 매연·소음`,
    crowd: '붐빌 가능성 높음',
  };
  const level = failed.length >= 3 ? 'bad' : failed.length ? 'mid' : 'ok';
  const levelText = { bad: '우선 개선 필요', mid: '부분 개선 필요', ok: '양호' }[level];
  const after = sel.score2 >= meta.cut90 ? 3 : sel.score2 >= meta.cut80 ? 2 : sel.score2 >= meta.cut60 ? 1 : 0;
  const pick = (id) => { setSelId(id); const c = grid.features[id].geometry.coordinates[0]; setFocus([(c[0][1] + c[2][1]) / 2, (c[0][0] + c[2][0]) / 2]); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const z = zones.find((x) => x.rank === zoneSel);
  const zt = ZONES[zoneSel];

  const exportCSV = () => {
    const head = ['id', 'lat', 'lon', 'rank', 'score', 'grade', 'heat', 'crowd', 'access', 'air', 'lst', 'tree', 'd_rest', 'zone_rank', 'candidate'];
    const lines = scored.order.filter((id) => scored.grade[id] >= 2).map((id) => {
      const p = props[id];
      const c = grid.features[id].geometry.coordinates[0][0];
      return [id, c[1], c[0], scored.rank[id], scored.score[id].toFixed(1), GRADES[scored.grade[id]], p.heat, p.crowd, p.access, p.air, p.lst, p.tree, p.dRest, p.zone || '', p.cand || ''].join(',');
    });
    download('seoulforest_vulnerable_20m.csv', `﻿${head.join(',')}\n${lines.join('\n')}`, 'text/csv');
  };

  return (
    <>
      <PageHead who="설계·계획 실무자용"
        q="서울숲에서 머물기 어려운 곳은 어디인가?"
        why="공원을 20m 칸 1,097개로 나누고, 칸마다 다섯 가지(나무 그늘·바닥 온도·쉼터 거리·큰길 거리·붐빔)를 기준과 비교했습니다." />

      <section className="answer">
        <span className="answer-tag">결론</span>
        <p>
          서울숲에서 머물기 어려운 땅은 <b className="num">{(scored.vulnArea / 10000).toFixed(1)}ha</b>입니다.
          주된 이유는 <b>{causes.join('·')}</b>이며, 특히 <b>{mainZones.join(', ')}</b> {mainZones.length}곳에 모여 있습니다.
        </p>
        <div className="answer-sub">이 중 다섯 가지 기준 중 3가지 이상이 부족한 곳 {severeHa.toFixed(1)}ha · 한여름 바닥 온도 평균 {meta.lst.mean}℃ (위성 {meta.lst.scenes.length}장면)</div>
      </section>

      <Part n="1" title="어디가 불편한가" desc="색이 진할수록 다섯 가지 중 부족한 것이 많은 칸입니다. 칸 위에 마우스를 올리면 오른쪽에 이유가 나타나고, 클릭하면 고정됩니다." />
      <div className="grid g-12">
        <Card className="span-8" title="칸별 불편도" sub={layer === 'fails' ? '20m 칸 · 5가지 중 부족한 개수' : `20m 칸 · ${LAYERS.find((l) => l.key === layer).label} 기준`}>
          <div className="expert-map">
            <MapView data={data} theme={theme} grid={cellLayer} focus={focus} legend={legend} />
          </div>
        </Card>

        <Card className={`span-4 ${hoverId != null ? 'diag-live' : ''}`}
          title={hoverId != null ? '마우스를 올린 칸' : selId == null ? '가장 불편한 칸' : '선택한 칸'}
          sub={hoverId != null ? '클릭하면 이 칸을 고정합니다' : '칸 위에 마우스를 올리면 이유가 나타납니다'}>
          <div className={`verdict-big ${level}`}>
            <b>{levelText}</b>
            <span>5가지 중 <b className="num">{failed.length}</b>가지 부족</span>
          </div>
          <p className="verdict">{failed.length ? failed.map((c) => phrase[c.key]).join(' · ') : '다섯 가지 기준을 모두 충족합니다.'}</p>

          <div className="who-row">
            <span className="diag-title" style={{ margin: 0 }}>누구 기준으로 볼까</span>
            <Segmented options={WHO} value={who} onChange={setWho} label="판정 기준" />
          </div>
          <div className="checks checks-3">
            <div className="chk chk-head"><span /><span>항목</span><span className="r">이 칸</span><span className="r">기준</span></div>
            {checks.map((c) => (
              <div key={c.key} className={`chk ${c.ok ? 'ok' : 'no'}`} title={`공원 평균 ${c.avg}`}>
                <span className="chk-mark" aria-label={c.ok ? '충족' : '부족'}>{c.ok ? '✓' : '✕'}</span>
                <span className="chk-l">{c.label}</span>
                <b className="r num">{c.val}</b>
                <span className="r">{c.std}</span>
              </div>
            ))}
          </div>

          {cureKey ? (
            <div className="diag-cause">
              <b>이렇게 고치면 됩니다</b>
              <span>{CURE[cureKey]}</span>
            </div>
          ) : null}
          <div className="small muted" style={{ marginTop: 10 }}>
            불편 순위 {scored.rank[sid]}위 / {props.length}칸
            {sel.zone ? ` · ${sel.zone}순위 구역(${ZONES[sel.zone].name})` : ''}
            {sel.cand ? ` · 개선안 ${CAND[sel.cand]} → 개선 후 ${GRADES[after]}` : ''}
          </div>
        </Card>
      </div>

      <Part n="2" title="어디부터 고칠까" desc="불편한 칸이 3,200㎡ 이상 붙어 있는 곳을 구역으로 묶고, 이용자가 많은 곳일수록 순위를 높였습니다." />
      <div className="grid g-12">
        <Card className="span-8" title="우선 개선 구역" sub="번호를 누르면 오른쪽에 처방이 나타납니다">
          <div className="expert-map">
            <MapView data={data} theme={theme} grid={zoneLayer} hubs={zoneMarkers} focus={zfocus}
              legend={<div className="legend">{[1, 2, 3, 4].map((r) => <span key={r}><i style={{ background: `var(${ZONE_COLOR[r]})` }} />{r}순위{r === 4 ? '(보류)' : ''}</span>)}</div>} />
          </div>
        </Card>
        <div className="span-4 grid" style={{ alignContent: 'start' }}>
          <div className="zlist">
            {zones.map((x) => (
              <button key={x.rank} type="button" className={`zbtn ${x.rank === zoneSel ? 'on' : ''} ${x.hold ? 'hold' : ''}`}
                onClick={() => { setZoneSel(x.rank); setZfocus([x.lat, x.lon]); }}>
                <span className="zrank" style={{ background: `var(${ZONE_COLOR[x.rank]})` }}>{x.rank}</span>
                <span className="zmain"><b>{ZONES[x.rank].name}</b><span>{ZONES[x.rank].problem}</span></span>
                <span className="znum num">{(x.area / 10000).toFixed(1)}<small>ha</small></span>
              </button>
            ))}
          </div>
          {z && (
            <Card title={`${z.rank}순위 · ${zt.name}`} sub={`${zt.near} · ${zt.hold ? '판단 보류' : '처방'}`} className={zt.hold ? 'hold-card' : ''}>
              <div className="cell-facts">
                <div><span>바닥 온도</span><b className="num">{z.lst}℃</b></div>
                <div><span>나무 그늘</span><b className="num">{z.tree}%</b></div>
                <div><span>포장면</span><b className="num">{z.built}%</b></div>
                <div><span>쉼터까지</span><b className="num">{z.drest}m</b></div>
              </div>
              <ul className="rx">{zt.fix.map((t) => <li key={t}>{t}</li>)}</ul>
              <div className="rx-effect"><Icon name="spark" size={14} />{zt.effect}</div>
            </Card>
          )}
        </div>
      </div>

      <Part n="3" title="이용자도 불편하다고 느끼는가" desc="지표상 불편한 곳과 이용자가 불만인 곳은 다를 수 있습니다. 둘 다 해당하는 곳을 가장 먼저 고칩니다." />
      <Card title="구역별 판정" sub="만족도는 설문 전 가설값(5점) · 13~14주차 현장 설문 120명으로 교체 예정">
        <div className="gap-list gap-cols">
          {gap.map((g) => (
            <div key={g.id} className="gap-row">
              <span className={`gq ${g.q.key}`}>{g.q.label}</span>
              <div className="gap-main">
                <b>{g.id} · {g.name}</b>
                <span>만족 {g.sat.toFixed(1)}점 — {g.why}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="more-wrap">
        <details className="more">
          <summary>분석 도구 <span className="muted">— 지표별 지도 · 가중치 조정 · 불편한 칸 TOP 10 · 데이터 근거 · CSV</span></summary>
          <div className="more-body">
            <div className="tool-row">
              <span className="cond-l">1번 지도 색 기준</span>
              <Segmented options={LAYERS} value={layer} onChange={setLayer} label="지표" />
            </div>
            <div className="grid g-12" style={{ marginTop: 14 }}>
              <div className="span-8">
                <div className="diag-title">가장 불편한 칸 TOP 10 <span className="muted">— 누르면 1번 지도가 그 칸으로 이동</span></div>
                <div className="tablewrap">
                  <table className="data top10">
                    <thead><tr><th>순위</th><th>등급</th><th className="r">부족</th>{KEYS.map((k) => <th key={k} className="r">{IND[k]}</th>)}<th className="r">바닥 온도</th><th>구역</th></tr></thead>
                    <tbody>
                      {scored.order.slice(0, 10).map((id) => {
                        const p = props[id];
                        return (
                          <tr key={id} className={id === pinId ? 'on' : ''} onClick={() => pick(id)}>
                            <td className="num"><b>{scored.rank[id]}</b></td>
                            <td><span className={`gchip g${scored.grade[id]}`}>{GRADES[scored.grade[id]]}</span></td>
                            <td className="num r"><b>{fails[id]}</b>/5</td>
                            {KEYS.map((k) => <td key={k} className="num r">{Math.round(p[k])}</td>)}
                            <td className="num r">{p.lst.toFixed(1)}℃</td>
                            <td>{p.zone ? `${p.zone}순위` : '–'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="span-4">
                <div className="diag-title">가중치 <span className="muted">— 무엇을 더 중요하게 볼지</span>
                  {isDefaultW ? null : <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={() => setWeights(meta.weights)}>기본값</button>}
                </div>
                <div className="wsliders">
                  {KEYS.map((k) => (
                    <label key={k} className="wslider">
                      <span>{IND[k]}</span>
                      <input type="range" min="0" max="0.6" step="0.05" value={weights[k]}
                        onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))} />
                      <b className="num">{Math.round((weights[k] / scored.wsum) * 100)}%</b>
                    </label>
                  ))}
                </div>
                <div className="assume">기본값(더위 35 · 쉴 곳 25 · 공기 25 · 붐빔 15)은 붐빔이 아직 추정값이라 낮게 둔 값입니다. 2,000번 흔들어도 {meta.robustShare}%의 칸은 등급이 그대로였습니다.</div>
              </div>
            </div>
            <dl className="dl-plain" style={{ marginTop: 16 }}>
              <dt>더위</dt><dd>Landsat 8/9 여름 지표온도 {meta.lst.scenes.length}장면 평균 ({meta.lst.scenes.map((s) => s.date).join(', ')}) · 수관 피복 ESA WorldCover</dd>
              <dt>쉴 곳·공기</dt><dd>OpenStreetMap 쉼터·화장실·도로, 공원 보행망 기준 실제 걷는 거리</dd>
              <dt>붐빔</dt><dd>현장 계수 전 대리지표 — 13~14주차 출입구·거점 계수로 보정</dd>
              <dt>머물기 어려운 땅</dt><dd>종합 점수 상위 20%(취약·매우 취약). 상위 10% 매우 취약 · 10~20% 취약 · 20~40% 관심 · 나머지 양호</dd>
              <dt>만족도</dt><dd>팀이 세운 가설값 (검증 필요) — 현장 설문 8개 구역 120명으로 교체 예정</dd>
              <dt>분석</dt><dd>{team.source} · 가져온 시각 {team.imported}</dd>
            </dl>
            <button type="button" className="btn" onClick={exportCSV}><Icon name="download" size={13} /> 불편한 칸 CSV</button>
          </div>
        </details>
      </div>

      <NextStep tone="g2" kick="다음 · 2단계 개선방안" title="이 자리를 고치면, 얼마나 나아질까"
        desc="찾아낸 자리에 나무·그늘·쉼터를 놓고, 머물기 어려운 땅을 다시 계산했습니다." onClick={() => go('propose')} />
    </>
  );
}
