import React, { useMemo, useRef, useState } from 'react';

export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  React.useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / 2) * p * 2 >= v ? Math.ceil(v / p / 2) * p * 2 : Math.ceil(v / p) * p;
};

/** Single-series line with threshold rules, crosshair tooltip and a table twin. */
export function LineChart({ data, thresholds = [], unit = '', height = 190, domain, label }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const pad = { l: 34, r: 12, t: 10, b: 24 };
  const vals = data.map((d) => d.value).filter((v) => v != null);
  const lo = domain?.[0] ?? Math.floor(Math.min(...vals, ...thresholds.map((t) => t.value)) - 1);
  const hi = domain?.[1] ?? Math.ceil(Math.max(...vals, ...thresholds.map((t) => t.value)) + 1);
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i) => pad.l + (i / Math.max(1, data.length - 1)) * iw;
  const y = (v) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const ticks = Array.from({ length: 4 }, (_, k) => lo + ((hi - lo) * k) / 3);
  const path = data.map((d, i) => (d.value == null ? '' : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`)).join('');

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {table ? (
        <div className="scroll-y" style={{ maxHeight: height }}>
          <table className="data"><thead><tr><th>시각</th><th>{label}</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.key}><td>{d.label}</td><td>{d.value ?? '–'}{unit}</td></tr>)}</tbody></table>
        </div>
      ) : (
        <svg className="chart" width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${label} 24시간 추이`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="num">{Math.round(t)}</text>
            </g>
          ))}
          {thresholds.map((t, i) => (t.value >= lo && t.value <= hi ? (
            <g key={t.label}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t.value)} y2={y(t.value)} stroke={`var(--${t.tone})`} strokeWidth="1.5" strokeDasharray="4 4" />
              <text x={width - pad.r}
                // if a neighbouring threshold line is within 14px, put the lower one's label beneath its line
                y={thresholds.some((o, j) => j !== i && o.value > t.value && Math.abs(y(o.value) - y(t.value)) < 14) ? y(t.value) + 13 : y(t.value) - 5} textAnchor="end" style={{ fill: 'var(--ink-2)', fontWeight: 600 }}>{t.label} {t.value}{unit}</text>
            </g>
          ) : null))}
          <line className="axis" x1={pad.l} x2={width - pad.r} y1={pad.t + ih} y2={pad.t + ih} />
          {data.map((d, i) => (i % 3 === 0 ? <text key={d.key} x={x(i)} y={height - 6} textAnchor="middle" className="num">{d.short}</text> : null))}
          <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover != null && data[hover].value != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--axis)" />
              <circle cx={x(hover)} cy={y(data[hover].value)} r="4.5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
            </g>
          )}
          {data[0]?.value != null && <circle cx={x(0)} cy={y(data[0].value)} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />}
        </svg>
      )}
      {!table && hover != null && (
        <div className="chart-tip" style={{ left: x(hover), top: y(data[hover].value ?? lo) }}>
          <span className="muted">{data[hover].label}</span> <b className="num">{data[hover].value}{unit}</b>
        </div>
      )}
      <div style={{ textAlign: 'right', marginTop: 2 }}>
        <button type="button" className="table-toggle" onClick={() => setTable((t) => !t)}>{table ? '차트로 보기' : '표로 보기'}</button>
      </div>
    </div>
  );
}

/** Hourly bars: simulated actual (past) vs forecast, with the 70 % congestion rule. */
export function CrowdBars({ data, nowHour, height = 200 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const pad = { l: 38, r: 10, t: 12, b: 24 };
  const cap = data[0]?.capacity || 1;
  const max = niceMax(Math.max(cap, ...data.map((d) => Math.max(d.actual ?? 0, d.forecast))));
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const bw = iw / data.length;
  const y = (v) => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const busy = cap * 0.7;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {table ? (
        <div className="scroll-y" style={{ maxHeight: height }}>
          <table className="data"><thead><tr><th>시각</th><th>실측(시뮬레이션)</th><th>예측</th><th>수용 대비</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.hour}><td>{d.hour}시</td><td>{d.actual ?? '–'}</td><td>{d.forecast}</td><td>{Math.round(((d.actual ?? d.forecast) / cap) * 100)}%</td></tr>)}</tbody></table>
        </div>
      ) : (
        <svg className="chart" width={width} height={height} role="img" aria-label="거점 시간대별 이용자 수 실측과 예측" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="num">{Math.round(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const isPast = d.actual != null;
            const v = isPast ? d.actual : d.forecast;
            const h = Math.max(0, pad.t + ih - y(v));
            const bx = pad.l + i * bw + 1;
            const w = Math.max(2, bw - 2);
            const r = Math.min(4, w / 2, h);
            const top = pad.t + ih - h;
            return (
              <g key={d.hour} onMouseEnter={() => setHover(i)}>
                <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" />
                <path d={`M${bx},${pad.t + ih}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + w - r}Q${bx + w},${top} ${bx + w},${top + r}V${pad.t + ih}Z`}
                  fill={isPast ? 'var(--series-1)' : 'var(--series-1-soft)'} opacity={hover == null || hover === i ? 1 : 0.55} />
                {d.hour % 3 === 0 && <text x={pad.l + i * bw + bw / 2} y={height - 6} textAnchor="middle" className="num">{d.hour}시</text>}
              </g>
            );
          })}
          <line x1={pad.l} x2={width - pad.r} y1={y(busy)} y2={y(busy)} stroke="var(--serious)" strokeWidth="1.5" strokeDasharray="4 4" />
          <text x={width - pad.r} y={y(busy) - 5} textAnchor="end" style={{ fill: 'var(--ink-2)', fontWeight: 600 }}>혼잡 기준(수용 70%)</text>
          <line className="axis" x1={pad.l} x2={width - pad.r} y1={pad.t + ih} y2={pad.t + ih} />
          {nowHour >= 6 && nowHour <= 22 && (
            <line x1={pad.l + (nowHour - 6 + 1) * bw} x2={pad.l + (nowHour - 6 + 1) * bw} y1={pad.t} y2={pad.t + ih} stroke="var(--ink-2)" strokeWidth="1" />
          )}
        </svg>
      )}
      {!table && hover != null && (
        <div className="chart-tip" style={{ left: pad.l + hover * bw + bw / 2, top: y(data[hover].actual ?? data[hover].forecast) }}>
          <b>{data[hover].hour}시</b>{' '}
          {data[hover].actual != null && <span>실측 <b className="num">{data[hover].actual}</b>명 · </span>}
          <span>예측 <b className="num">{data[hover].forecast}</b>명</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
        <div className="legend">
          <span><i style={{ background: 'var(--series-1)' }} />실측(시뮬레이션)</span>
          <span><i style={{ background: 'var(--series-1-soft)' }} />예측</span>
        </div>
        <button type="button" className="table-toggle" onClick={() => setTable((t) => !t)}>{table ? '차트로 보기' : '표로 보기'}</button>
      </div>
    </div>
  );
}

const WEEK_BINS = [
  { max: 0.25, label: '여유', color: '#86b6ef' },
  { max: 0.5, label: '보통', color: '#3987e5' },
  { max: 0.75, label: '혼잡', color: '#1c5cab' },
  { max: Infinity, label: '매우 혼잡', color: '#0d366b' },
];
const binOf = (v) => WEEK_BINS.findIndex((b) => v < b.max);

/** Day-of-week × hour occupancy heatmap (ordinal 4 classes, one hue). */
export function WeekHeatmap({ matrix, hours, highlight }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const padL = 22;
  const padT = 4;
  const cw = (width - padL) / hours.length;
  const ch = 20;
  const h = padT + matrix.length * (ch + 2) + 20;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg className="chart" width={width} height={h} role="img" aria-label="요일별 시간대별 공원 혼잡도 예측">
        {matrix.map((row, r) => (
          <g key={row.label}>
            <text x={0} y={padT + r * (ch + 2) + 14}>{row.label}</text>
            {row.values.map((v, c) => {
              const b = binOf(v);
              const isHi = highlight && highlight.dow === row.dow && highlight.hour === hours[c];
              return (
                <rect key={c} x={padL + c * cw + 1} y={padT + r * (ch + 2)} width={Math.max(1, cw - 2)} height={ch} rx="3"
                  fill={WEEK_BINS[b].color} stroke={isHi ? 'var(--ink)' : 'none'} strokeWidth={isHi ? 2 : 0}
                  onMouseEnter={() => setHover({ r, c, v })} onMouseLeave={() => setHover(null)} />
              );
            })}
          </g>
        ))}
        {hours.map((hh, c) => (hh % 3 === 0 ? <text key={hh} x={padL + c * cw + cw / 2} y={h - 4} textAnchor="middle" className="num">{hh}시</text> : null))}
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: padL + hover.c * cw + cw / 2, top: padT + hover.r * (ch + 2) }}>
          <b>{matrix[hover.r].label}요일 {hours[hover.c]}시</b> · {WEEK_BINS[binOf(hover.v)].label} <span className="num muted">({Math.round(hover.v * 100)}%)</span>
        </div>
      )}
      <div className="legend" style={{ marginTop: 6 }}>
        {WEEK_BINS.map((b) => <span key={b.label}><i style={{ background: b.color }} />{b.label}</span>)}
      </div>
    </div>
  );
}

/** Horizontal bars, one series (nominal categories → one color). */
export function HBars({ items, unit = '', color = 'var(--series-1)' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="list" role="list">
      {items.map((it) => (
        <div key={it.key} role="listitem" style={{ display: 'grid', gridTemplateColumns: '84px 1fr 56px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
          <span className="small ink2">{it.label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(it.value / max) * 100}%`, background: it.color || color }} /></div>
          <span className="small num" style={{ textAlign: 'right', fontWeight: 650 }}>{it.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export function useHourlyData(hourly, key) {
  return useMemo(() => hourly.map((h) => ({ key: h.time, label: `${h.offset === 0 ? '지금 ' : ''}${h.hour}시`, short: `${h.hour}시`, value: h[key] })), [hourly, key]);
}
