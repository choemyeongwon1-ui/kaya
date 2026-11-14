import React from 'react';
import { STAGE_META } from '../lib/risk.js';

const PATHS = {
  check: <path d="M6 1a5 5 0 1 0 0 10A5 5 0 0 0 6 1zm-.7 7.2L3 5.9l.9-.9 1.4 1.4 2.8-2.8.9.9z" />,
  alert: <path d="M6 .8 11.4 10.6H.6zM5.4 4.2v3.2h1.2V4.2zm0 4.1v1.2h1.2V8.3z" />,
  stop: <path d="M3.9.8h4.2l3 3v4.4l-3 3H3.9l-3-3V3.8zM5.4 3v4h1.2V3zm0 5v1.2h1.2V8z" />,
};

export function StatusIcon({ name }) {
  return <svg viewBox="0 0 12 12" aria-hidden="true">{PATHS[name]}</svg>;
}

export function Badge({ tone, icon, children }) {
  return (
    <span className={`badge tone-${tone}`}>
      <StatusIcon name={icon} />
      {children}
    </span>
  );
}

export function StageBadge({ stage, suffix }) {
  const m = STAGE_META[stage];
  return <Badge tone={m.tone} icon={m.icon}>{m.label}{suffix ? ` · ${suffix}` : ''}</Badge>;
}

const CROWD_ICON = { good: 'check', warning: 'check', serious: 'alert', critical: 'stop' };
export function CrowdBadge({ crowd }) {
  return <Badge tone={crowd.tone} icon={CROWD_ICON[crowd.tone]}>{crowd.label}</Badge>;
}

const LINE = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  tree: <><path d="M12 3 6 12h3l-4 6h14l-4-6h3z" /><path d="M12 18v3" /></>,
  leaf: <><path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15" /><path d="M5 19 14 10" /></>,
  walk: <><circle cx="13" cy="4" r="2" /><path d="M10 21l2-6 3 3v3M9 9l3-2 3 3 3 1M12 7l-2 6" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5a3 3 0 0 1 0 6M21 20c0-2.6-1.6-4.8-4-5.6" /></>,
  drop: <path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" />,
  pin: <><path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  download: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};
export function Icon({ name, size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {LINE[name]}
    </svg>
  );
}

export function Stat({ label, value, unit, badge, foot }) {
  return (
    <div className="stat">
      <div className="stat-label"><span>{label}</span>{badge}</div>
      <div className="stat-value">{value ?? '–'}{unit ? <span className="stat-unit">{unit}</span> : null}</div>
      {foot ? <div className="stat-foot">{foot}</div> : null}
    </div>
  );
}

export function Gauge({ value, stage }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const tone = ['var(--good)', 'var(--serious)', 'var(--critical)'][stage];
  return (
    <div className="gauge" role="img" aria-label={`통합 위험도 ${value}점`}>
      <svg viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        <circle cx="66" cy="66" r={r} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      <div className="gauge-center">
        <div>
          <div className="gauge-num">{value}</div>
          <div className="gauge-cap">통합 위험도</div>
        </div>
      </div>
    </div>
  );
}

export function Card({ title, sub, right, children, className = '', bodyClass = 'card-body' }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="card-head">
          <div>
            <h3 className="card-title">{title}</h3>
            {sub ? <div className="card-sub">{sub}</div> : null}
          </div>
          {right}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} title={o.desc}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, value, onChange, label, allowNone = false }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" className="chip" aria-pressed={value === o.key}
          onClick={() => onChange(allowNone && value === o.key ? null : o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
