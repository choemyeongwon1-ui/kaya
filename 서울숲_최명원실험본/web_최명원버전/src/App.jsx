import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchLive, sampleWeather, applyScenario, currentSnap, SCENARIOS } from './lib/weather.js';
import { evaluate } from './lib/risk.js';
import { buildGraph } from './lib/astar.js';
import { Icon, Segmented } from './components/ui.jsx';
import Home from './tabs/Home.jsx';
import Citizen from './tabs/Citizen.jsx';
import Admin from './tabs/Admin.jsx';
import Expert from './tabs/Expert.jsx';
import Propose from './tabs/Propose.jsx';
import { BurdenStory } from './tabs/Burden.jsx'; // [최명원 버전]

const TABS = [
  { key: 'home', label: '소개', Comp: Home },
  { key: 'citizen', goal: 1, label: '이용자 화면', sub: '지금 어디로 갈까?', icon: 'walk', Comp: Citizen },
  { key: 'admin', goal: 1, label: '관리자 관제', sub: '지금 무엇을 바꿀까?', icon: 'clock', Comp: Admin },
  { key: 'expert', goal: 2, label: '1단계 · 취약지역 진단', sub: '어디가 불편한가?', icon: 'pin', Comp: Expert },
  { key: 'propose', goal: 2, label: '2단계 · 개선방안', sub: '고치면 얼마나 나아지나?', icon: 'tree', Comp: Propose },
  { key: 'burden', goal: 3, label: '부담지도 전략', sub: '문제 → 정의 → 측정 → 진단 → 처방 → 검증', icon: 'book', Comp: BurdenStory },
];

// 주제서 p.4 프로젝트 목표 — 목표마다 별도 대시보드처럼 구분
const GOALS = {
  1: {
    title: '지금 머물기 좋은 곳',
    desc: '잠깐의 불편(인파·폭염·미세먼지)은 피해 가게 합니다. 이용자에게는 지금 편히 머물 곳과 길을, 관리자에게는 바꿔야 할 프로그램을 알립니다.',
  },
  2: {
    title: '머물 땅을 넓히다',
    desc: '늘 있는 불편(그늘·쉼터 부족)은 고쳐서 더 오래 머물게 합니다. 머물기 어려운 자리를 20m 단위로 찾고(1단계), 나무·그늘·쉼터를 놓아 머물 수 있는 땅을 넓힙니다(2단계).',
  },
  3: {
    title: '부담 없이 머무는 숲',
    desc: '성수에서 유일한 무료 쉼터인 서울숲을 폭염·미세먼지에도 취약계층까지 부담 없이 머무는 공원으로. AI가 날씨와 이용자에 맞춰 프로그램과 동선을 바꾸고, 부담이 몰린 땅의 개선 우선순위를 냅니다. (최명원 개인 디벨롭)',
  },
};
const GOAL_NAME = { 1: '지금 머물기 좋은 곳', 2: '머물 땅을 넓히다', 3: '부담지도' };
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

function seoulNow() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return { dow: d.getDay(), hour: d.getHours(), date: d };
}

function useTheme() {
  const [pref, setPref] = useState(() => store.get('sf-theme', 'auto'));
  const [osDark, setOsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => setOsDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const resolved = pref === 'auto' ? (osDark ? 'dark' : 'light') : pref;
  useEffect(() => {
    if (pref === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', pref);
    store.set('sf-theme', pref);
  }, [pref]);
  const toggle = () => setPref(resolved === 'dark' ? 'light' : 'dark');
  return [resolved, toggle];
}

async function loadData() {
  const get = (f) => fetch(`${import.meta.env.BASE_URL}data/${f}`, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`${f} (HTTP ${r.status})`);
    return r.json();
  });
  const [park, grid, network, features, context, meta, hubs, team, shops, basemap, burden] = await Promise.all(
    ['park.geojson', 'grid.geojson', 'network.json', 'features.geojson', 'context.geojson', 'meta.json', 'hubs.json', 'team.json', 'shops.json', 'basemap.json', 'burden.json'].map(get),
  );
  return { park, grid, network, features, context, meta, hubs, team, shops, basemap, burden, graph: buildGraph(network, grid) };
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [tab, setTab] = useState(() => (TABS.some((t) => `#${t.key}` === location.hash) ? location.hash.slice(1) : 'home'));
  const [data, setData] = useState(null);
  const [rawWeather, setRawWeather] = useState(null);
  // ?s=heat|dust|rain 으로 시연 상황을 바로 열 수 있음 (발표용 링크)
  const [scenario, setScenario] = useState(() => {
    const s = new URLSearchParams(location.search).get('s');
    return SCENARIOS.some((x) => x.key === s) ? s : 'live';
  });
  const [clock, setClock] = useState(seoulNow());
  const [approved, setApproved] = useState({}); // programId -> alternative program id (행정 → 시민 반영)

  const [loadError, setLoadError] = useState(null);
  const load = useCallback(() => {
    setLoadError(null);
    loadData().then(setData).catch((e) => setLoadError(e.message || String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(() => {
    fetchLive().then(setRawWeather).catch(() => setRawWeather(sampleWeather()));
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10 * 60 * 1000); // 10분마다 갱신
    const tick = setInterval(() => setClock(seoulNow()), 30 * 1000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, [refresh]);

  useEffect(() => {
    const onHash = () => { const k = location.hash.slice(1); if (TABS.some((t) => t.key === k)) setTab(k); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (k) => { setTab(k); history.replaceState(null, '', `#${k}`); window.scrollTo({ top: 0 }); };

  const weather = useMemo(() => (rawWeather ? applyScenario(rawWeather, scenario) : null), [rawWeather, scenario]);
  const snap = useMemo(() => (weather ? currentSnap(weather) : null), [weather]);
  const ev = useMemo(() => (snap ? evaluate(snap) : null), [snap]);

  const ready = data && weather;
  const cur = TABS.find((t) => t.key === tab);
  const Active = cur.Comp;
  const goal = cur.goal ?? 0;
  const timeStr = clock.date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  // 목표 버튼: 그 목표에서 마지막으로 본 화면으로
  const [lastIn, setLastIn] = useState({ 1: 'citizen', 2: 'expert', 3: 'burden' });
  useEffect(() => { if (goal) setLastIn((l) => ({ ...l, [goal]: tab })); }, [tab, goal]);
  useEffect(() => { document.documentElement.dataset.goal = String(goal); }, [goal]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => go('home')} onKeyDown={(e) => { if (e.key === 'Enter') go('home'); }}>
            <div className="brand-mark"><svg viewBox="0 0 24 24"><path d="M12 2.5 19 13h-3.6l4.6 7.5H4L8.6 13H5z" /></svg></div>
            <div>
              <div className="brand-title">서울숲, 머무는 숲</div>
              <div className="brand-sub">성수에서 사지 않아도 머물 수 있는 단 하나의 숲 · 최명원 버전</div>
            </div>
          </div>
          <nav className="tabs goals-nav" role="tablist" aria-label="목표 선택">
            <button role="tab" className="tab" aria-selected={goal === 0} onClick={() => go('home')}>소개</button>
            {[1, 2, 3].map((g) => (
              <button key={g} role="tab" className={`tab goal-tab g${g}`} aria-selected={goal === g} onClick={() => go(lastIn[g])}>
                <span className="tab-n">{g}</span>{GOAL_NAME[g]}
              </button>
            ))}
          </nav>
          <div className="spacer" />
          <div className="meta-bar">
            <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? '라이트 모드' : '다크 모드'}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
          </div>
        </div>
      </header>

      <main className="shell">
        {goal ? (
          <section className={`goalbar g${goal}`}>
            <div className="goalbar-top">
              <div className="goalbar-id">
                <span className="goalbar-n">목표 {goal}</span>
                <h1>{GOALS[goal].title}</h1>
                <p>{GOALS[goal].desc}</p>
              </div>
            </div>
            <div className="goalbar-bottom">
              <nav className="subtabs" role="tablist" aria-label="세부 화면">
                {TABS.filter((t) => t.goal === goal).map((t) => (
                  <button key={t.key} role="tab" className="subtab" aria-selected={tab === t.key} onClick={() => go(t.key)}>
                    <Icon name={t.icon} size={16} /><b>{t.label}</b><span>{t.sub}</span>
                  </button>
                ))}
              </nav>
              {goal === 1 || goal === 3 ? (
                <div className="goalbar-weather">
                  <span className="chip-live">
                    <span className={`dot ${weather?.live && scenario === 'live' ? '' : 'off'}`} />
                    {scenario === 'live' ? timeStr : '시연 중'}
                  </span>
                  <Segmented options={SCENARIOS} value={scenario} onChange={setScenario} label="날씨 상황 (시연)" />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {ready ? (
          <Active
            data={data} weather={weather} snap={snap} ev={ev} theme={theme}
            now={clock} scenario={scenario} approved={approved} setApproved={setApproved} go={go}
          />
        ) : loadError ? (
          <div className="skeleton">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, color: 'var(--ink)' }}>데이터를 불러오지 못했습니다</div>
              <div className="small" style={{ margin: '6px 0 12px' }}>{loadError}</div>
              <button type="button" className="btn btn-primary" onClick={load}>다시 시도</button>
            </div>
          </div>
        ) : (
          <div className="skeleton">서울숲 {data ? '날씨' : '데이터'}를 불러오는 중…</div>
        )}

        <footer className="footer">
          <span>서울숲, 머무는 숲 · 2026-2 AI-CCS 주제 01 · 상명대 그린스마트시티학과 · 자문 ㈜한국종합기술</span>
          <span>
            데이터: {weather ? weather.source : 'Open-Meteo'} · OpenStreetMap · Landsat 8 · Sentinel-2
            {data ? ` · 레이어 생성 ${data.meta.built}` : ''}
          </span>
        </footer>
      </main>
    </>
  );
}
