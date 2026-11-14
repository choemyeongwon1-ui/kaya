import React, { useMemo, useState } from 'react';
import MapView, { cssVar } from '../components/MapView.jsx';
import PageHead from '../components/PageHead.jsx';
import NextStep from '../components/NextStep.jsx';
import { Badge, Card, Icon, Segmented, Stat, StageBadge, StatusIcon } from '../components/ui.jsx';
import { CrowdBars, LineChart, useHourlyData } from '../components/charts.jsx';
import { evaluate, nextEscalation, RULES, STAGE_META } from '../lib/risk.js';
import { hubLoad, hubSeries, loadStage } from '../lib/crowd.js';
import { switchProposals, typeAllowed, TYPE_LABEL } from '../lib/recommend.js';
import { haversine } from '../lib/astar.js';
import { headline } from './Citizen.jsx';
import { stayHours, stayLabel, STAY_MAX, LONG_STAY } from '../lib/stay.js';

const METRICS = [
  { key: 'feels', label: '체감온도', unit: '℃', th: [31, 33] },
  { key: 'pm25', label: '초미세먼지', unit: '', th: [36, 76] },
  { key: 'pop', label: '비 올 확률', unit: '%', th: [60] },
];

export default function Admin({ data, weather, snap, ev, theme, now, approved, setApproved, go }) {
  const { hubs } = data;
  const venues = useMemo(() => hubs.filter((h) => h.type !== 'gate'), [hubs]);
  const [hubId, setHubId] = useState('family-lawn');
  const [metric, setMetric] = useState(() => (ev.drivers[0] === 'pm25' || ev.drivers[0] === 'pm10' ? 'pm25' : ev.drivers[0] === 'pop' ? 'pop' : 'feels'));
  const [sent, setSent] = useState({});
  const hub = venues.find((h) => h.id === hubId);
  const head = headline(ev);
  const esc = nextEscalation(weather.hourly, ev.overall);
  // 지금 위험 단계라면 언제 풀리는지 (첫 완화 시각)
  const easeAt = ev.overall > 0 ? weather.hourly.find((h) => h.offset > 0 && evaluate(h).overall < ev.overall) : null;
  const nextText = esc
    ? `${esc.hour}시 ${esc.label} ${STAGE_META[esc.stage].label} 예상`
    : ev.overall > 0
      ? (easeAt ? `${easeAt.hour}시쯤 완화 예상` : '24시간 내내 지속 예상')
      : '24시간 내 악화 없음';

  // --- crowd now + where to send people instead
  const loads = useMemo(() => venues.map((h) => {
    const l = hubLoad(h, now.dow, now.hour, snap);
    return { hub: h, ratio: l?.ratio ?? 0, people: l?.people ?? 0, stage: loadStage(l?.ratio ?? 0) };
  }), [venues, now.dow, now.hour, snap]);
  const crowded = loads.filter((l) => l.ratio >= 0.7).sort((a, b) => b.ratio - a.ratio).map((l) => {
    const alt = loads
      .filter((o) => o.hub.id !== l.hub.id && o.ratio < 0.5 && typeAllowed(o.hub.type, ev))
      .sort((a, b) => haversine([a.hub.lon, a.hub.lat], [l.hub.lon, l.hub.lat]) - haversine([b.hub.lon, b.hub.lat], [l.hub.lon, l.hub.lat]))[0];
    return { ...l, alt };
  });

  // --- programme switches
  const proposals = useMemo(() => switchProposals({ hubs, dow: now.dow, hourly: weather.hourly, evaluateFn: evaluate }), [hubs, now.dow, weather.hourly]);
  const switches = proposals.filter((p) => p.needsSwitch);
  const offered = switches.filter((p) => p.alternative);
  const offerRate = switches.length ? Math.round((offered.length / switches.length) * 100) : 100;

  // --- upcoming stage changes → alerts to send
  const alerts = useMemo(() => {
    const out = [];
    let prev = ev.overall;
    weather.hourly.forEach((h) => {
      const e = evaluate(h);
      if (h.offset > 0 && e.overall > prev) {
        const rule = RULES.find((x) => x.key === e.drivers[0]);
        out.push({ hour: h.hour, stage: e.overall, text: `${rule?.label ?? ''} ${STAGE_META[e.overall].label}` });
      }
      prev = e.overall;
    });
    return out.slice(0, 3);
  }, [weather.hourly, ev.overall]);

  // 자리별 '앞으로 머물 수 있는 시간' — 짧은 곳부터 (관리자가 늘려야 할 곳)
  const stays = useMemo(() => venues.map((h) => ({ hub: h, s: stayHours(h, weather.hourly, now.dow) }))
    .sort((a, b) => a.s.hours - b.s.hours), [venues, weather.hourly, now.dow]);
  const longN = stays.filter((x) => x.s.hours >= LONG_STAY).length;

  const todo = switches.length + crowded.length + alerts.length;
  const m = METRICS.find((x) => x.key === metric);
  const series = useHourlyData(weather.hourly, metric);
  const crowdSeries = useMemo(() => hubSeries(hub, now.dow, now.hour, weather.hourly, now.date.getDate()), [hub, now, weather.hourly]);

  const mapHubs = useMemo(() => loads.map((l) => ({
    id: l.hub.id, lat: l.hub.lat, lon: l.hub.lon,
    color: cssVar(`--${l.stage.tone}`),
    radius: l.hub.id === hubId ? 11 : 7,
    tooltip: `<b>${l.hub.name}</b><br>${TYPE_LABEL[l.hub.type]} · ${l.stage.label} · ${l.people}/${l.hub.capacity}명`,
    onClick: () => setHubId(l.hub.id),
  })), [loads, hubId, theme]);

  const toggleSwitch = (p) => setApproved((a) => {
    const n = { ...a };
    if (n[p.programId] === p.alternative.id) delete n[p.programId]; else n[p.programId] = p.alternative.id;
    return n;
  });

  return (
    <>
      <PageHead who="관리자용 · 관제"
        q="지금 무엇을 조치해야 하나?"
        why="자리마다 앞으로 머물 수 있는 시간을 계산하고, 그 시간이 짧아지는 곳에 프로그램 전환과 혼잡 분산을 제안합니다. 승인하면 이용자 화면에 바로 반영됩니다." />

      <section className={`hero wide s${ev.overall}`} role="status">
        <div>
          <span className="hero-pill"><StatusIcon name={STAGE_META[ev.overall].icon} />{STAGE_META[ev.overall].label} · {now.hour}시</span>
          <div className="hero-title">{head.title}</div>
        </div>
        <div className="hero-facts">
          {ev.items.filter((it) => ['feels', 'pm25', 'pop'].includes(it.key)).map((it) => (
            <div key={it.key} className="hero-fact">
              <span>{it.label === 'PM2.5' ? '초미세먼지' : it.label}</span>
              <b className="num">{it.value ?? '–'}{it.key === 'feels' ? '°' : it.key === 'pop' ? '%' : ''}</b>
            </div>
          ))}
        </div>
        <div className="hero-foot"><Icon name="clock" size={14} /> {nextText}</div>
      </section>

      <div className="grid g-12" style={{ marginTop: 18 }}>
        <Card className="span-7" title="지금 할 일" sub="자동 판정 결과 · 버튼을 누르면 처리됩니다"
          right={todo ? <Badge tone="serious" icon="alert">{todo}건</Badge> : <Badge tone="good" icon="check">없음</Badge>}>
          {todo === 0 ? (
            <div className="empty">
              <span className="empty-ico"><Icon name="leaf" size={22} /></span>
              <div>
                <div className="empty-title">지금 필요한 조치가 없습니다</div>
                <div className="small muted">오늘 예정된 프로그램 {proposals.length}건 모두 예정대로 운영합니다. 위쪽 날씨 상황에서 폭염·미세먼지를 고르면 조치 예시가 나타납니다.</div>
              </div>
            </div>
          ) : (
            <div className="list">
              {switches.map((p) => {
                const done = approved[p.programId] === p.alternative?.id;
                return (
                  <div key={`s-${p.programId}-${p.hour}`} className="todo">
                    <span className="todo-kind k-switch">전환</span>
                    <div className="row-main">
                      <div className="todo-title">{p.hour}시 「{p.program.name}」</div>
                      <div className="todo-sub">
                        {p.alternative ? <>→ <b>{p.alternative.name}</b> ({TYPE_LABEL[p.alternative.type]})로 바꾸기</> : '대체 시설 없음 · 운영 취소 검토'}
                      </div>
                    </div>
                    {p.alternative && (
                      <button type="button" className={`btn ${done ? '' : 'btn-primary'}`} onClick={() => toggleSwitch(p)}>
                        {done ? '승인됨 ✓' : '전환 승인'}
                      </button>
                    )}
                  </div>
                );
              })}
              {crowded.map((c) => (
                <div key={`c-${c.hub.id}`} className="todo">
                  <span className="todo-kind k-crowd">분산</span>
                  <div className="row-main">
                    <div className="todo-title">{c.hub.name} 혼잡 ({c.people}/{c.hub.capacity}명)</div>
                    <div className="todo-sub">{c.alt ? <>→ 가까운 <b>{c.alt.hub.name}</b>({c.alt.stage.label})으로 안내</> : '대체 거점 없음'}</div>
                  </div>
                  {c.alt && (
                    <button type="button" className={`btn ${sent[c.hub.id] ? '' : 'btn-primary'}`} onClick={() => setSent((s) => ({ ...s, [c.hub.id]: !s[c.hub.id] }))}>
                      {sent[c.hub.id] ? '안내됨 ✓' : '분산 안내'}
                    </button>
                  )}
                </div>
              ))}
              {alerts.map((a) => (
                <div key={`a-${a.hour}`} className="todo">
                  <span className="todo-kind k-alert">알림</span>
                  <div className="row-main">
                    <div className="todo-title">{a.hour}시 {a.text} 진입 예상</div>
                    <div className="todo-sub">1시간 전 이용자 알림 자동 예약</div>
                  </div>
                  <StageBadge stage={a.stage} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="span-5" title="거점 혼잡 지도" sub="원을 누르면 아래에 시간대별 예측이 나타납니다">
          <div style={{ height: 380 }}>
            <MapView data={data} theme={theme} hubs={mapHubs}
              legend={(
                <div className="legend" style={{ gap: 8 }}>
                  {['good:여유', 'warning:보통', 'serious:혼잡', 'critical:매우 혼잡'].map((s) => {
                    const [t, l] = s.split(':');
                    return <span key={t}><i style={{ background: `var(--${t})`, borderRadius: '50%' }} />{l}</span>;
                  })}
                </div>
              )} />
          </div>
        </Card>

        <Card className="span-12" title="자리별 머물 수 있는 시간" sub="날씨·혼잡 예보로 계산 · 짧은 자리부터 · 시설 운영시간 미반영"
          right={<Badge tone={longN >= stays.length * 0.7 ? 'good' : 'serious'} icon="clock">2시간 이상 {longN}/{stays.length}곳</Badge>}>
          <div className="stay-grid">
            {stays.map(({ hub: h, s }) => (
              <button key={h.id} type="button" className={`stay-cell ${s.hours >= LONG_STAY ? 'long' : s.hours === 0 ? 'none' : ''}`} onClick={() => setHubId(h.id)}>
                <span className="stay-name">{h.name}<em>{TYPE_LABEL[h.type]}</em></span>
                <span className="stay-bar"><s style={{ width: `${(s.hours / STAY_MAX) * 100}%` }} /></span>
                <span className="stay-lbl">{stayLabel(s)}{s.hours < STAY_MAX && s.stopWhy ? ` · ${s.stopWhy === 'crowd' ? '혼잡' : '날씨'} 때문` : ''}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="span-7" title="앞으로 24시간 날씨 위험" sub={`점선 = ${m.th.length > 1 ? '주의 · 경고' : '주의'} 기준`}
          right={<Segmented options={METRICS} value={metric} onChange={setMetric} label="지표" />}>
          <LineChart data={series} unit={m.unit} label={m.label}
            domain={metric === 'pm25' ? [0, Math.max(90, ...weather.hourly.map((h) => h.pm25 ?? 0)) + 5] : metric === 'pop' ? [0, 100] : undefined}
            thresholds={m.th.map((v, i) => ({ value: v, label: i ? '경고' : '주의', tone: i ? 'critical' : 'serious' }))} />
        </Card>

        <Card className="span-5" title={`${hub.name} 혼잡 예측`} sub={`수용 ${hub.capacity}명 · 시뮬레이션(현장 계수 전)`}>
          <CrowdBars data={crowdSeries} nowHour={now.hour} />
        </Card>

      </div>

      <NextStep tone="g2" kick="다음 · 목표 2 머물 땅을 넓히다" title="피하는 것만으로는 부족합니다"
        desc="늘 덥고 쉼터가 먼 자리는, 그 자리를 고쳐야 합니다. 어디인지부터 찾습니다." onClick={() => go('expert')} />
    </>
  );
}
