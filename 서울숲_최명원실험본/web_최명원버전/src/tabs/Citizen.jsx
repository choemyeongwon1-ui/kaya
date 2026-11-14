import React, { useMemo, useState } from 'react';
import MapView, { cssVar } from '../components/MapView.jsx';
import PageHead from '../components/PageHead.jsx';
import NextStep from '../components/NextStep.jsx';
import { Chips, CrowdBadge, Icon, StatusIcon } from '../components/ui.jsx';
import { bestHours, nextEscalation, STAGE_META } from '../lib/risk.js';
import { GROUPS, PROGRAMS, TYPE_LABEL, recommend } from '../lib/recommend.js';
import { hubLoad, loadStage } from '../lib/crowd.js';
import { routeVia } from '../lib/astar.js';
import { stayHours, stayLabel, STAY_MAX, LONG_STAY } from '../lib/stay.js';

const DRIVER_TEXT = {
  feels: ['더위 주의', '폭염 경고'],
  uv: ['자외선 높음', '자외선 매우높음'],
  pm25: ['초미세먼지 나쁨', '초미세먼지 매우나쁨'],
  pm10: ['미세먼지 나쁨', '미세먼지 매우나쁨'],
  pop: ['비 소식', '호우 경고'],
};

/** Plain-language status line shared by the citizen and operator screens. */
export function headline(ev) {
  if (ev.overall === 0) return { title: '지금 서울숲은 쾌적합니다', msg: '야외 프로그램까지 모두 즐기기 좋은 날입니다.' };
  const what = DRIVER_TEXT[ev.drivers[0]][ev.overall - 1];
  const shadeOk = ev.drivers.every((d) => d === 'feels' || d === 'uv');
  const msg = ev.overall === 2
    ? `야외 활동은 피하고 ${shadeOk ? '실내·그늘' : '실내'} 공간으로 안내합니다.`
    : `${shadeOk ? '그늘과 실내' : '실내'} 위주로 추천을 바꿨습니다.`;
  return { title: what, msg };
}

const ICON = { indoor: 'home', shade: 'tree', outdoor: 'sun' };

export default function Citizen({ data, weather, snap, ev, theme, now, approved, go }) {
  const { hubs, graph } = data;
  const [group, setGroup] = useState('family');
  const [pick, setPick] = useState(null);
  const [startId, setStartId] = useState('gate-station');
  const [barrierFree, setBarrierFree] = useState(false);
  const hubById = useMemo(() => Object.fromEntries(hubs.map((h) => [h.id, h])), [hubs]);
  const head = headline(ev);
  const esc = nextEscalation(weather.hourly, ev.overall);
  const best = bestHours(weather.hourly);
  const bf = barrierFree || group === 'senior';

  // 자리마다 '앞으로 몇 시간 머물 수 있나'를 계산해, 오래 머물 수 있는 자리부터 보여 줌
  const stayByHub = useMemo(() => Object.fromEntries(hubs.filter((h) => h.type !== 'gate').map((h) => [h.id, stayHours(h, weather.hourly, now.dow)])), [hubs, weather.hourly, now.dow]);
  const longCount = Object.values(stayByHub).filter((s) => s.hours >= LONG_STAY).length;
  const totalSpots = Object.keys(stayByHub).length;
  const recs = useMemo(() => {
    const pool = recommend({ ev, snap, hubs, group, dow: now.dow, hour: now.hour, limit: 10, approvedSwitches: Object.fromEntries(Object.values(approved).map((id) => [id, true])) });
    const seen = new Set();
    return pool
      .map((p) => ({ ...p, stay: stayByHub[p.hub] }))
      .sort((a, b) => b.stay.hours - a.stay.hours || b.score - a.score)
      .filter((p) => (seen.has(p.hub) ? false : seen.add(p.hub)))
      .slice(0, 3);
  }, [ev, snap, hubs, group, now.dow, now.hour, approved, stayByHub]);
  const target = recs.find((r) => r.id === pick) ?? recs[0];

  // A* route to the chosen place: shade-weighted, or clean-air when dust/rain is the problem
  const route = useMemo(() => {
    if (!target) return null;
    const clean = ev.overall > 0 && ev.drivers.some((d) => ['pm25', 'pm10', 'pop'].includes(d));
    const ll = (h) => [h.lon, h.lat];
    const pts = [ll(hubById[startId]), ll(hubById[target.hub])];
    const opts = { mode: clean ? 'clean' : 'shade', barrierFree: bf, crowdScale: 1 };
    const main = routeVia(graph, pts, opts);
    const alt = routeVia(graph, pts, { ...opts, mode: 'shortest' });
    return { main, alt, clean };
  }, [target, startId, bf, ev, hubById, graph]);

  const r = route?.main;
  const minutes = r ? Math.round((r.meters / 1000 / (bf ? 3.2 : 4.2)) * 60) : null;
  const heatGain = r && route.alt?.heat > 0 ? Math.round((1 - r.heat / route.alt.heat) * 100) : 0;

  const mapHubs = useMemo(() => hubs.filter((h) => h.type !== 'gate').map((h) => {
    const l = hubLoad(h, now.dow, now.hour, snap);
    const st = loadStage(l?.ratio ?? 0);
    const isTarget = h.id === target?.hub;
    return {
      ...h, color: cssVar(`--${st.tone}`), radius: isTarget ? 11 : 6,
      tooltip: isTarget ? `<b>${h.name}</b>` : `<b>${h.name}</b><br>${TYPE_LABEL[h.type]} · ${st.label}`,
      permanent: isTarget,
    };
  }), [hubs, now.dow, now.hour, snap, target, theme]);

  const switched = Object.entries(approved).map(([from, to]) => ({ from: PROGRAMS.find((p) => p.id === from), to: PROGRAMS.find((p) => p.id === to) }));

  return (
    <>
      <PageHead who="이용자용 · 모바일 웹"
        q="지금 서울숲, 어디서 오래 머물 수 있을까?"
        why="성수에는 사지 않고 오래 앉아 있을 곳이 드뭅니다. 날씨·혼잡 예보로 자리마다 앞으로 몇 시간 편히 머물 수 있는지 계산해, 오래 머물 자리와 덜 덥고 덜 붐비는 길을 알려 드립니다." />

      <div className="citizen">
        <div className="grid">
          {/* 1. 지금 상태 — 한 문장 답 */}
          <section className={`hero s${ev.overall}`} role="status" aria-live="polite">
            <span className="hero-pill"><StatusIcon name={STAGE_META[ev.overall].icon} />{STAGE_META[ev.overall].label} · 서울숲 {now.hour}시</span>
            <h2 className="hero-title">{head.title}</h2>
            <p className="hero-msg">{head.msg}</p>
            <div className="hero-facts">
              <div className="hero-fact"><span>체감온도</span><b className="num">{snap.feels}°</b></div>
              <div className="hero-fact"><span>초미세먼지</span><b className="num">{snap.pm25 ?? '–'}</b></div>
              <div className="hero-fact"><span>비 올 확률</span><b className="num">{snap.pop}%</b></div>
            </div>
            <div className="hero-stay">
              <b className="num">{longCount}<small>/{totalSpots}곳</small></b>
              <span>지금부터 <strong>2시간 이상</strong> 머물 수 있는 자리<em>주 120분 자연에 머물 때 웰빙 향상 — White et al. 2019</em></span>
            </div>
            <div className="hero-foot">
              <Icon name="clock" size={14} />
              {esc ? `${esc.hour}시부터 ${esc.label} ${STAGE_META[esc.stage].label} 예상` : `쾌적한 시간 ${best.map((h) => `${h.hour}시`).join(' · ')}`}
            </div>
          </section>

          {/* 2. 갈 곳 — 3개만 */}
          <section className="card card-pad">
            <div className="sec-head">
              <h3 className="card-title">오래 머물 수 있는 자리</h3>
              <Chips options={GROUPS} value={group} onChange={(g) => { setGroup(g); setPick(null); }} label="누구와 오셨나요" />
            </div>
            {switched.length > 0 && (
              <div className="notice">
                <Icon name="spark" size={13} /> 운영자 안내 · {switched.map(({ from, to }) => `「${from.name}」 → 「${to.name}」`).join(', ')}
              </div>
            )}
            <div className="picks" role="radiogroup" aria-label="추천 장소">
              {recs.map((p, i) => (
                <button key={p.id} type="button" role="radio" aria-checked={p.id === target?.id}
                  className="pick" onClick={() => setPick(p.id)}>
                  <span className="pick-rank num">{i + 1}</span>
                  <span className={`pick-ico t-${p.type}`}><Icon name={ICON[p.type]} size={19} /></span>
                  <span className="pick-main">
                    <span className="pick-title">{p.hubName}</span>
                    <span className="pick-sub">{TYPE_LABEL[p.type]} · {p.name}</span>
                    <span className={`pick-stay ${p.stay.hours >= LONG_STAY ? 'long' : ''}`}>
                      <i><s style={{ width: `${(p.stay.hours / STAY_MAX) * 100}%` }} /></i>
                      {stayLabel(p.stay)}
                    </span>
                  </span>
                  <CrowdBadge crowd={p.crowd} />
                </button>
              ))}
            </div>
          </section>

          {/* 3. 가는 길 */}
          {target && (
            <section className="card card-pad">
              <h3 className="card-title">{target.hubName}까지 가는 길</h3>
              <div className="route-controls">
                <select className="input" value={startId} onChange={(e) => setStartId(e.target.value)} aria-label="출발 위치">
                  {hubs.filter((h) => h.id !== target.hub).map((h) => <option key={h.id} value={h.id}>출발: {h.name}</option>)}
                </select>
                <label className="toggle">
                  <input type="checkbox" checked={bf} disabled={group === 'senior'} onChange={(e) => setBarrierFree(e.target.checked)} />
                  계단 없는 길{group === 'senior' ? ' (자동)' : ''}
                </label>
              </div>
              {r ? (
                <>
                  <div className="route-big">
                    <b className="num">{minutes}분</b>
                    <span className="num">{(r.meters / 1000).toFixed(1)}km · {Math.round(r.meters / 0.7).toLocaleString()}걸음</span>
                  </div>
                  <div className="route-why">
                    {route.clean
                      ? '큰길에서 떨어진 맑은 공기 길로 안내합니다.'
                      : heatGain > 0
                        ? <>가장 짧은 길보다 <b>햇볕 노출 {heatGain}% 적은</b> 그늘 길입니다.</>
                        : '이 구간은 가장 짧은 길이 가장 시원한 길입니다.'}
                  </div>
                </>
              ) : <div className="small muted">길을 찾지 못했습니다. 출발 위치를 바꾸면 다시 찾습니다.</div>}
            </section>
          )}
        </div>

        <div className="citizen-map card">
          <MapView
            data={data} theme={theme} hubs={mapHubs}
            route={r?.coords} routeAlt={route?.alt && route.alt.meters !== r?.meters ? route.alt.coords : null}
            legend={(
              <div className="legend" style={{ gap: 10 }}>
                <span><i style={{ background: 'var(--brand)', height: 4, width: 16 }} />추천 길</span>
                {route?.alt && route.alt.meters !== r?.meters && <span><i style={{ borderTop: '3px dotted var(--ink-2)', background: 'none', height: 0, width: 16 }} />가장 짧은 길</span>}
                {['good:여유', 'warning:보통', 'serious:혼잡', 'critical:매우 혼잡'].map((s) => {
                  const [t, l] = s.split(':');
                  return <span key={t}><i style={{ background: `var(--${t})`, borderRadius: '50%' }} />{l}</span>;
                })}
              </div>
            )}
          />
        </div>
      </div>

      <NextStep kick="다음 · 관리자 관제" title="같은 순간, 관리자는 무엇을 바꿀까"
        desc="이용자 안내 뒤에서, 야외 프로그램 전환과 혼잡 분산을 승인합니다." onClick={() => go('admin')} />
    </>
  );
}
