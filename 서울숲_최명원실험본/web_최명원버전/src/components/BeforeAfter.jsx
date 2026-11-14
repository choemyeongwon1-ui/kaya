import React, { useMemo, useState } from 'react';
import MapView, { cssVar } from './MapView.jsx';
import { Card, Segmented } from './ui.jsx';
import { GRADES } from '../content/team.js';

// 팀원 개선 시나리오: 개선 후보 칸(식재·그늘시설·차폐 수림대) + 쉼터 6곳 → 개선 후 취약도 재계산값(score2)
const MODES = [{ key: 'before', label: '지금' }, { key: 'after', label: '개선 후 (예상)' }];
const CAND = {
  plant: { label: '나무 심기', color: '--g4' },
  shade: { label: '그늘막·파고라', color: '--series-1' },
  buffer: { label: '도로변 숲띠', color: '--v-buffer' },
};

export default function BeforeAfter({ data, theme }) {
  const { team } = data;
  const { meta } = team;
  const S = meta.scenario;
  const [mode, setMode] = useState('after');
  const grade = (s) => (s >= meta.cut90 ? 3 : s >= meta.cut80 ? 2 : s >= meta.cut60 ? 1 : 0);
  const props = useMemo(() => team.grid.features.map((f) => f.properties), [team]);

  const gridLayer = useMemo(() => {
    const ramp = [1, 2, 3, 4].map((k) => cssVar(`--v${k}`));
    return {
      geojson: team.grid,
      fill: (id) => {
        const p = props[id];
        const g = grade(mode === 'after' ? p.score2 : p.score);
        return ramp[g];
      },
      tooltip: (p) => {
        const a = grade(p.score);
        const b = grade(p.score2);
        return `${p.cand ? `<b>${CAND[p.cand].label} 후보</b><br>` : ''}지금 <b>${GRADES[a]}</b>${a !== b ? ` → 개선 후 <b>${GRADES[b]}</b>` : ''}`;
      },
    };
  }, [team, props, mode, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // 후보 칸 중심점 + 추가 쉼터
  const markers = useMemo(() => {
    const list = team.grid.features.filter((f) => f.properties.cand).map((f) => {
      const c = f.geometry.coordinates[0];
      const lat = (c[0][1] + c[2][1]) / 2;
      const lon = (c[0][0] + c[2][0]) / 2;
      const k = f.properties.cand;
      return { id: `c${f.properties.id}`, lat, lon, radius: 4, color: cssVar(CAND[k].color), tooltip: CAND[k].label };
    });
    team.addedRest.forEach(([lat, lon], i) => list.push({ id: `r${i}`, lat, lon, radius: 7, color: cssVar('--serious'), tooltip: '<b>새 쉼터</b>' }));
    return list;
  }, [team, theme]);

  const rows = [
    { label: '머물기 어려운 땅 (취약 이상)', a: S.vuln_before / 10000, b: S.vuln_after / 10000, unit: 'ha', d: 1 },
    { label: '매우 취약한 땅', a: S.severe_before / 10000, b: S.severe_after / 10000, unit: 'ha', d: 1 },
    { label: '쉼터까지 평균 거리', a: S.rest_before, b: S.rest_after, unit: 'm', d: 0 },
    { label: '쉼터까지 먼 곳(상위 10%)', a: S.rest_before_p90, b: S.rest_after_p90, unit: 'm', d: 0 },
  ];
  const improved = S.vuln_before - S.vuln_after;

  return (
    <Card className="span-12" title="무엇을 어디에 놓나 · 놓으면 어떻게 바뀌나" sub="점 = 새로 놓을 시설 · 칸 색 = 불편도 (팀 분석 시나리오)"
      right={<Segmented options={MODES} value={mode} onChange={setMode} label="지금/개선 후" />}>
      <div className="ba">
        <div className="ba-map">
          <MapView data={data} theme={theme} grid={gridLayer} hubs={markers}
            legend={(
              <div>
                <div className="legend" style={{ gap: 10 }}>
                  {Object.values(CAND).map((c) => <span key={c.label}><i style={{ background: `var(${c.color})`, borderRadius: '50%' }} />{c.label}</span>)}
                  <span><i style={{ background: 'var(--serious)', borderRadius: '50%' }} />새 쉼터</span>
                </div>
                <div className="legend-ramp" style={{ marginTop: 6 }}>{[1, 2, 3, 4].map((k) => <span key={k} style={{ background: `var(--v${k})` }} />)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }} className="xs muted">{GRADES.map((g) => <span key={g}>{g}</span>)}</div>
              </div>
            )} />
        </div>
        <div className="ba-side">
          <div className="ba-kpi">
            <span>좋아지는 땅</span>
            <b className="num">{improved.toLocaleString()}<small>㎡</small></b>
            <em>머물기 어려운 땅의 {Math.round((improved / S.vuln_before) * 100)}%가 불편 등급에서 벗어납니다</em>
          </div>
          <div className="ba-rows">
            {rows.map((r) => (
              <div key={r.label} className="ba-row">
                <span className="ba-l">{r.label}</span>
                <span className="ba-v num"><s>{r.a.toFixed(r.d)}</s> → <b>{r.b.toFixed(r.d)}</b>{r.unit}</span>
                <span className="ba-bar"><i className="before" /><i className="after" style={{ width: `${(r.b / r.a) * 100}%` }} /></span>
              </div>
            ))}
          </div>
          <div className="ba-qty">
            <div><b className="num">{S.trees}</b>주<span>그늘 나무 ({(S.plant / 10000).toFixed(1)}ha)</span></div>
            <div><b className="num">{(S.shade / 10000).toFixed(1)}</b>ha<span>그늘막·파고라 구간</span></div>
            <div><b className="num">{S.buf_trees}</b>주<span>도로변 숲띠 ({(S.buffer / 10000).toFixed(2)}ha)</span></div>
            <div><b className="num">{S.rest_add}</b>곳<span>새 쉼터</span></div>
          </div>
          <div className="assume">효과는 시나리오 추정입니다. 나무는 3~5년 자라야 그늘이 충분해집니다.</div>
        </div>
      </div>
    </Card>
  );
}
