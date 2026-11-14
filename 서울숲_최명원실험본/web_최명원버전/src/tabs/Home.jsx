import React, { useEffect, useMemo, useRef, useState } from 'react';
import MapView, { cssVar } from '../components/MapView.jsx';
import { Icon } from '../components/ui.jsx';
import { hubLoad, loadStage } from '../lib/crowd.js';
import { GREEN, VISITORS, PEOPLE, SCENES } from '../content/about.js';
import { useReveal, CountUp } from '../components/motion.jsx';

// 소개 = 발견(네 장면: 머물 곳이 없다) → 질문(어떻게 머물게 할까) → 해법(피해서 머물고, 고쳐서 머문다) → 초대. 읽는 사람이 다음이 궁금하도록 단계별로 공개.
const PARTS = [['scenes', '발견'], ['question', '질문'], ['solution', '해법']];
const REVEAL = ['.part-kick', '.part-title', '.scene-text', '.q-words', '.q-note', '.ans-lead', '.ans-card', '.invite'].join(',');

function Src({ children, url }) {
  return <div className="src">{url ? <a href={url} target="_blank" rel="noreferrer">{children}</a> : children}</div>;
}

/** 글자 단위가 아니라 어절 단위로 하나씩 떠오르는 문장 */
function Words({ text, className = '' }) {
  return (
    <span className={`q-words ${className}`}>
      {text.split(' ').map((w, i) => <span key={i} style={{ '--w': i }}>{w}&nbsp;</span>)}
    </span>
  );
}

/** 스크롤 진행 막대 */
function Progress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => { const h = document.documentElement; setP(h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)); };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return <div className="read-progress" style={{ transform: `scaleX(${p})` }} aria-hidden="true" />;
}

/** 상단 고정 목차 */
function Rail() {
  const [active, setActive] = useState(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
    PARTS.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    const onScroll = () => setShow(window.scrollY > 520);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, []);
  return (
    <nav className={`rail ${show ? 'show' : ''}`} aria-label="소개 목차">
      {PARTS.map(([id, label], i) => (
        <button key={id} type="button" className={active === id ? 'on' : ''} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}>
          <span>PART {i + 1}</span>{label}
        </button>
      ))}
    </nav>
  );
}

/* ---------- 장면별 그림 ---------- */
function HouseGrid() {
  // 10가구 중 약 5가구가 1인 가구 (47.4%)
  return (
    <div className="houses" aria-label="10가구 중 5가구가 1인 가구">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < 5 ? 'solo' : ''} style={{ '--h': i }}>
          <Icon name="home" size={26} />
        </span>
      ))}
    </div>
  );
}

function Bars({ rows, full }) {
  const max = full ? 100 : Math.max(...rows.map((a) => a.value));
  return (
    <div className="vbars">
      {rows.map((a, i) => (
        <div key={a.label} className={`vbar ${a.hi ? 'hi' : ''}`} style={{ '--b': i }}>
          <span className="vbar-l">{a.label}</span>
          <span className="vbar-t"><i style={{ width: `${(a.value / max) * 100}%` }} /></span>
          <b className="num">{a.value}%</b>
        </div>
      ))}
    </div>
  );
}

/** 성수 상업시설 점 지도 (SVG) — 카페·음식점이 얼마나 빽빽한지 */
function ShopMap({ shops, park, basemap }) {
  const [s, w, n, e] = shops.bbox;
  const lat0 = ((s + n) / 2) * (Math.PI / 180);
  const W = 560;
  const H = Math.round(W * ((n - s) / ((e - w) * Math.cos(lat0))));
  const x = (lon) => ((lon - w) / (e - w)) * W;
  const y = (lat) => ((n - lat) / (n - s)) * H;
  const pxPerM = H / ((n - s) * 111320);
  const ring = (coords) => coords.map(([lo, la]) => `${x(lo).toFixed(1)},${y(la).toFixed(1)}`).join(' ');
  const polys = [];
  (park.features ?? [park]).forEach((f) => {
    const g = f.geometry ?? f;
    if (g.type === 'Polygon') polys.push(g.coordinates[0]);
    if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => polys.push(p[0]));
  });
  const st = shops.station;
  const sx = x(st.lon);
  const sy = y(st.lat);
  const R = st.radius * pxPerM;
  const path = (c, close) => `M${c.map(([lo, la]) => `${x(lo).toFixed(1)} ${y(la).toFixed(1)}`).join('L')}${close ? 'Z' : ''}`;
  const roads = (arr) => arr.map((c) => path(c)).join('');
  // 성수역에서 가까운 점부터 퍼져 나가듯 나타나게
  const pts = shops.points.map(([la, lo, k]) => {
    const px = x(lo); const py = y(la);
    return { px, py, k, d: Math.hypot(px - sx, py - sy) };
  });
  const food = pts.filter((p) => p.k === 'cafe' || p.k === 'food');
  const shop = pts.filter((p) => p.k === 'shop');
  const delay = (p) => ({ '--d': `${Math.round(Math.min(1500, p.d * 4.2))}ms` });
  return (
    <svg className="shopmap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="성수 일대 카페·음식점 분포 지도">
      <defs>
        <clipPath id="sm-clip"><rect width={W} height={H} rx="18" /></clipPath>
        <filter id="sm-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" /></filter>
        <radialGradient id="sm-halo"><stop offset="0" stopColor="#ff8a4c" stopOpacity=".28" /><stop offset="1" stopColor="#ff8a4c" stopOpacity="0" /></radialGradient>
      </defs>
      <g clipPath="url(#sm-clip)">
        <rect width={W} height={H} className="sm-land" />
        {basemap ? basemap.water.map((c, i) => <path key={i} d={path(c, true)} className="sm-water" />) : null}
        {polys.map((p, i) => <polygon key={i} points={ring(p)} className="sm-park" />)}
        {basemap ? (
          <>
            <path d={roads(basemap.minor)} className="sm-road" />
            <path d={roads(basemap.rail)} className="sm-rail" />
            <path d={roads(basemap.major)} className="sm-road major" />
          </>
        ) : null}
        <g className="sm-heat" filter="url(#sm-glow)">
          {food.map((p, i) => <circle key={i} cx={p.px} cy={p.py} r="6" />)}
        </g>
        <circle cx={sx} cy={sy} r={R * 1.25} fill="url(#sm-halo)" />
        <circle cx={sx} cy={sy} r={R} className="sm-ring" />
        {shop.map((p, i) => <circle key={`s${i}`} cx={p.px} cy={p.py} r="2.7" className="sm-dot shop" style={delay(p)} />)}
        {food.map((p, i) => <circle key={`f${i}`} cx={p.px} cy={p.py} r="2.3" className="sm-dot cafe" style={delay(p)} />)}
        <text x={x(127.0392)} y={y(37.5452)} className="sm-label park">서울숲</text>
        <text x={x(127.0352)} y={y(37.5372)} className="sm-label water">한강</text>
        <text x={sx} y={sy - R - 7} textAnchor="middle" className="sm-label ring">반경 500m</text>
        <circle cx={sx} cy={sy} r="5.5" className="sm-stn" />
        <text x={sx + 10} y={sy + 4} className="sm-label stn">성수역</text>
      </g>
    </svg>
  );
}

function SceneVisual({ k, data }) {
  const { team } = data;
  if (k === 'home') {
    return (
      <div className="sv">
        <div className="sv-big num"><CountUp text={PEOPLE.solo.value} /><small>%</small></div>
        <div className="sv-cap">성수 4개 동, 가구 둘 중 하나는 혼자 삽니다</div>
        <HouseGrid />
        <Src url={PEOPLE.solo.url}>1인 가구 비율 · {PEOPLE.solo.src}</Src>
      </div>
    );
  }
  if (k === 'street') {
    const st = data.shops.stats.station500;
    return (
      <div className="sv sv-shop">
        <div className="shop-wrap">
          <ShopMap shops={data.shops} park={data.park} basemap={data.basemap} />
          <div className="shop-legend">
            <span><i className="cafe" />카페·음식점</span>
            <span><i className="shop" />상점</span>
          </div>
        </div>
        <div className="shop-stats">
          <div className="ss-main"><span>성수역 반경 500m · 카페·음식점</span><b className="num"><CountUp text={String(st.cafe + st.food)} /><small>곳</small></b><em>상업시설의 {st.cafeFoodShare}%</em></div>
          <div className="ss-green">
            <span>같은 반경 · 녹지</span><b className="num">{GREEN.bars[2].value}<small>%</small></b>
            <div className="ss-gbar"><i style={{ width: `${GREEN.bars[2].value}%` }} /></div>
            <em>서울숲 안은 {GREEN.bars[0].value}%</em>
          </div>
        </div>
        <Src>OpenStreetMap 등록 기준 ({data.shops.fetched} 수집 · 실제보다 적을 수 있음) · 녹지: {GREEN.src}</Src>
      </div>
    );
  }
  if (k === 'people') {
    return (
      <div className="sv">
        <div className="sv-cap strong">동네 연령 구성 — 청년과 어르신이 60%</div>
        <Bars rows={PEOPLE.ageBars} />
        <Src url={PEOPLE.ageUrl}>{PEOPLE.ageSrc}</Src>
      </div>
    );
  }
  const S = team.meta.scenario;
  return (
    <div className="sv sv-park">
      {[
        ['인파', VISITORS.value, VISITORS.unit, '2026 정원박람회 180일 방문객', VISITORS.src],
        ['열기', String(team.meta.lst.mean), '℃', '한여름 공원 바닥 온도 평균', `위성 Landsat ${team.meta.lst.scenes.length}장면 · 팀 분석`],
        ['쉼터 불균형', (S.vuln_before / 10000).toFixed(1), 'ha', '덥고 쉼터가 먼, 머물기 어려운 땅', '20m 칸 분석 · 팀 분석'],
      ].map(([tag, v, u, l, s]) => (
        <div key={tag} className="park-stat">
          <span className="park-tag">{tag}</span>
          <b className="num"><CountUp text={v} /><small>{u}</small></b>
          <span>{l}</span>
          <em>{s}</em>
        </div>
      ))}
    </div>
  );
}

function SceneText({ s, i }) {
  return (
    <div className="scene-text">
      <div className="scene-tag"><span className="num">0{i + 1}</span>{s.tag}</div>
      <h3>{s.title}</h3>
      <p>{s.body}</p>
      {s.fact ? (
        <div className="scene-fact">
          <b className="num">{s.fact.num}</b>
          <span>{s.fact.label}</span>
          <a href={s.fact.url} target="_blank" rel="noreferrer">{s.fact.src}</a>
        </div>
      ) : null}
    </div>
  );
}

export default function Home({ data, snap, now, theme, go }) {
  const { hubs, team } = data;
  const S = team.meta.scenario;
  const rootRef = useReveal(REVEAL);
  const [scene, setScene] = useState(0);
  const wrapRef = useRef(null);
  const pinRef = useRef(null);

  // 슬라이드처럼: 구간 안에서는 화면이 고정되고, 스크롤 진행도에 따라 장면만 바뀜
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const w = wrapRef.current;
      const p = pinRef.current;
      if (!w || !p) return;
      const r = w.getBoundingClientRect();
      const span = Math.max(1, r.height - p.offsetHeight);
      const prog = Math.min(1, Math.max(0, -r.top / span));
      setScene(Math.min(SCENES.length - 1, Math.floor(prog * SCENES.length)));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);
  const jumpTo = (i) => {
    const w = wrapRef.current;
    const p = pinRef.current;
    if (!w || !p) return;
    const top = w.getBoundingClientRect().top + window.scrollY;
    const span = w.offsetHeight - p.offsetHeight;
    window.scrollTo({ top: top + span * ((i + 0.5) / SCENES.length), behavior: 'smooth' });
  };
  const sceneRef = useRef(0);
  sceneRef.current = scene;
  const jumpRef = useRef(jumpTo);
  jumpRef.current = jumpTo;

  // 휠 한 번 = 장면 한 장. 첫 장에서 위로, 마지막 장에서 아래로 굴리면 평소처럼 빠져나감
  useEffect(() => {
    let lockUntil = 0;
    const onWheel = (e) => {
      const w = wrapRef.current;
      const p = pinRef.current;
      if (!w || !p || !p.offsetHeight || Math.abs(e.deltaY) < 4) return;
      const r = w.getBoundingClientRect();
      const pinned = r.top <= 66 && r.bottom >= p.offsetHeight + 62;
      if (!pinned) return;
      const next = sceneRef.current + (e.deltaY > 0 ? 1 : -1);
      if (next < 0 || next >= SCENES.length) return;
      e.preventDefault();
      if (performance.now() < lockUntil) return; // 관성 스크롤로 여러 장 넘어가지 않게
      lockUntil = performance.now() + 800;
      jumpRef.current(next);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  const mapHubs = useMemo(() => hubs.filter((h) => h.type !== 'gate').map((h) => {
    const st = loadStage(hubLoad(h, now.dow, now.hour, snap)?.ratio ?? 0);
    return { ...h, color: cssVar(`--${st.tone}`), radius: 6, tooltip: `<b>${h.name}</b> · ${st.label}` };
  }), [hubs, now.dow, now.hour, snap, theme]);

  return (
    <div className="home" ref={rootRef}>
      <Progress />
      <Rail />

      {/* 표지 — 질문으로 시작 */}
      <section className="intro">
        <div className="intro-text">
          <div className="intro-kicker">2026-2 AI-CCS 주제 01 · 서울숲 스마트 공원 대시보드</div>
          <h1 className="intro-title">성수에서,<br />잠시 <em>머물 곳</em>은<br />어디일까요?</h1>
          <p className="intro-sub">이 프로젝트는 이 질문에서 시작했습니다.<br />성수의 네 장면에서 문제를 발견하고, 데이터로 답을 찾았습니다.</p>
          <div className="intro-cta">
            <button type="button" className="btn btn-hero" onClick={() => document.getElementById('scenes')?.scrollIntoView({ behavior: 'smooth' })}>질문 따라가기 <span aria-hidden="true">↓</span></button>
            <button type="button" className="btn btn-ghost" onClick={() => go('citizen')}>대시보드 바로가기</button>
          </div>
        </div>
        <div className="intro-map">
          <MapView data={data} theme={theme} hubs={mapHubs} still />
          <div className="intro-map-tag"><i className="d ok" />여유 <i className="d warn" />보통 <i className="d bad" />혼잡 · 지금</div>
        </div>
      </section>

      {/* PART 1 발견 — 스크롤에 따라 장면 전환 */}
      <section className="part" id="scenes">
        <div className="part-kick">PART 1 · 발견</div>
        <h2 className="part-title">우리가 주목한 성수의 네 장면 — <em className="pt-em">머물 곳이 없는 동네</em></h2>
        {/* 데스크톱: 고정 화면에서 장면 전환 */}
        <div className="deck" ref={wrapRef} style={{ height: `${SCENES.length * 45 + 55}vh` }}>
          <div className="deck-pin" ref={pinRef}>
            <div className="deck-stage" aria-hidden="true">
              {SCENES.map((s, i) => (
                <div key={s.key} className={`stage-pane ${i === scene ? 'on' : i < scene ? 'past' : 'next'}`}>
                  <SceneVisual k={s.key} data={data} />
                </div>
              ))}
            </div>
            <div className="deck-texts">
              {SCENES.map((s, i) => (
                <div key={s.key} className={`deck-text ${i === scene ? 'on' : i < scene ? 'past' : 'next'}`} aria-hidden={i !== scene}>
                  <SceneText s={s} i={i} />
                </div>
              ))}
              <div className="deck-nav">
                <span className="deck-count num"><b>0{scene + 1}</b> / 0{SCENES.length}</span>
                <div className="deck-dots">
                  {SCENES.map((s, i) => (
                    <button key={s.key} type="button" className={i === scene ? 'on' : ''} onClick={() => jumpTo(i)} aria-label={`장면 ${i + 1} ${s.tag}`}>
                      <i /><span>{s.tag}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 모바일: 차례대로 쌓기 */}
        <div className="deck-mobile">
          {SCENES.map((s, i) => (
            <article key={s.key} className="scene-m">
              <SceneText s={s} i={i} />
              <div className="scene-inline"><SceneVisual k={s.key} data={data} /></div>
            </article>
          ))}
        </div>
      </section>

      {/* PART 2 질문 */}
      <section className="qband" id="question">
        <div className="part-kick light">PART 2 · 질문</div>
        <h2 className="q-title">
          <Words text="누구나 오래 머물 수 있는 서울숲," />
          <br />
          <Words text="어떻게 만들 수 있을까?" className="accent" />
        </h2>
        <p className="q-note">좋은 공원은 <b>얼마나 오래 머물고 싶은지</b>로 결정됩니다.
          <small>사람은 바깥 환경이 좋을 때에만 머문다 — J. Gehl 『삶이 있는 도시디자인』 · 주 120분 이상 자연에 머물 때 웰빙 향상 — White et al. 2019</small>
        </p>
      </section>

      {/* PART 3 해법 */}
      <section className="part" id="solution">
        <div className="part-kick">PART 3 · 해법</div>
        <h2 className="part-title ans-title">잠깐의 불편은 피해 가게 하고,<br />늘 있는 불편은 고쳐서, <em>더 오래 머물게 합니다.</em></h2>
        <p className="ans-lead">서울숲의 불편은 두 종류입니다. 붐비고 더운 <b>순간</b>, 그리고 그늘도 쉼터도 없는 <b>자리</b>.</p>

        <div className="ans">
          <article className="ans-card g1">
            <div className="ans-tag"><span>목표 1</span>잠깐의 불편 · 인파 · 폭염 · 미세먼지</div>
            <h3><span className="ans-name">지금 머물기 좋은 곳</span>지금 불편한 곳을 피해,<br />지금 머물기 좋은 자리로 안내합니다</h3>
            <div className="ans-demo" aria-label="화면 예시">
              <div className="demo-row warn"><i />오후 2시 · 체감온도 33℃ · 잔디광장 혼잡</div>
              <div className="demo-arrow">↓</div>
              <div className="demo-row"><b>이용자</b>그늘 많은 숲길 벤치로 · 걸어서 6분</div>
              <div className="demo-row"><b>관리자</b>야외 체험 → 실내(곤충식물원)로 전환</div>
              <span className="demo-note">화면 예시</span>
            </div>
            <button type="button" className="ans-go" onClick={() => go('citizen')}>실시간 화면 보기 →</button>
          </article>

          <article className="ans-card g2">
            <div className="ans-tag"><span>목표 2</span>늘 있는 불편 · 그늘 · 쉼터 · 동선</div>
            <h3><span className="ans-name">머물 땅을 넓히다</span>덥고 쉼터가 먼 자리에 나무와 쉼터를 더해,<br />머물 수 있는 땅을 넓힙니다</h3>
            <div className="ans-nums">
              <div><span>머물기 어려운 땅</span><b className="num"><s>{(S.vuln_before / 10000).toFixed(1)}</s>→<CountUp text={(S.vuln_after / 10000).toFixed(1)} /><small>ha</small></b></div>
              <div><span>쉼터까지 평균 거리</span><b className="num"><s>{S.rest_before}</s>→<CountUp text={String(S.rest_after)} /><small>m</small></b></div>
              <p>나무 {S.trees + S.buf_trees}그루 · 쉼터 {S.rest_add}곳을 더했을 때 · 팀 분석 시나리오</p>
            </div>
            <div className="ans-gos">
              <button type="button" className="ans-go" onClick={() => go('expert')}>어디가 불편한지 →</button>
              <button type="button" className="ans-go" onClick={() => go('propose')}>고치면 어떻게 →</button>
            </div>
          </article>
        </div>
      </section>

      {/* 초대 */}
      <section className="invite">
        <h2>이제, 서울숲에서 <em>어디에 머물지</em><br />직접 찾아보세요</h2>
        <div className="invite-btns">
          <button type="button" className="btn btn-hero" onClick={() => go('citizen')}>목표 1 · 지금 머물기 좋은 곳 →</button>
          <button type="button" className="btn invite-g2" onClick={() => go('expert')}>목표 2 · 머물 땅을 넓히다 →</button>
        </div>
      </section>
    </div>
  );
}
