// 시민 화면: 하고 싶은 일·머물 시간·같이 온 사람 → 갈 곳 3곳과 이유, 가는 길·산책 코스, 근처 무료 장소
import { NEEDS, STAYS, COMPANY, COURSE_MIN, WEIGHTS, CROWD_STOP, COLD, NIGHT, SNAP_PARK } from './config.js';
import { recommend, nearbyPlaces, MODE_TEXT, fmtDur } from './recommend.js';
import { planRoute, planCourse } from './route.js';
import { crowdScale, hubLoad, crowdLabel } from './crowd.js';
import { STAGE_LABEL, DRIVER_TEXT } from './weather.js';
import { FAC_LABEL } from './model.js';
import { createMap, mk } from './mapview.js';
import { h, icon, fmtM, pct, esc, chipGroup, segGroup, card } from './ui.js';

const TYPE = { indoor: { icon: 'home', label: '실내' }, shade: { icon: 'tree', label: '그늘 자리' }, outdoor: { icon: 'sun', label: '야외' } };
const REASONS = [['shade', 'shade', '그늘'], ['toilet', 'toilet', '화장실'], ['crowd', 'crowd', '붐빔'], ['stay', 'clock', '머물 수 있는 시간']];
const PREFS = [['shade', 'shade', '그늘'], ['rest', 'bench', '쉼터'], ['nostairs', 'stairs', '계단 없음'], ['quiet', 'quiet', '한산함']];
const KIND_ICON = { library: 'book', community: 'home', park: 'tree' };

/** 길 요약에 출발지(a)·도착지(b)에서 길까지 걷는 거리를 더합니다. 추천 카드의 '걸어서 N분'과 같은 기준이 됩니다. */
function withEnds(sum, a, b, speed) {
  if (!sum) return sum;
  const meters = sum.meters + a + b, stops = sum.stops.map(x => ({ ...x, at: x.at + a }));
  const marks = [0, ...stops.map(x => x.at), meters];
  let maxGap = 0;
  for (let i = 1; i < marks.length; i++) maxGap = Math.max(maxGap, marks[i] - marks[i - 1]);
  return { ...sum, meters, minutes: Math.max(1, Math.round(meters / speed)), stops, maxGap: Math.round(maxGap) };
}

export function createCitizen(root, app) {
  const st = { need: 'rest', stay: 60, company: 'alone', slow: false, start: { kind: 'hub', id: 'gate-station' }, pick: 0, mode: 'route', minutes: 40, end: 'loop',
    prefs: { shade: false, rest: false, nostairs: false, quiet: false }, picking: false, moreNear: false, nearSel: null, gpsNote: null };
  let view = null, rec = null, plan = null;

  // ── 틀 ──
  const el = { form: h('div'), status: h('div'), picks: h('div'), route: h('div'), near: h('div'), how: h('div'), legend: h('div', { class: 'map-legend' }), map: h('div', { class: 'map' }) };
  root.append(
    h('header', { class: 'page-head' },
      h('div', { class: 'eyebrow' }, '이용자용 · 모바일 웹'),
      h('h1', { class: 'page-q' }, '오늘 서울숲에서 무엇을 하고 싶으세요?'),
      h('p', { class: 'page-why' }, '하고 싶은 일, 머물 시간, 같이 온 사람을 고르면 지금 가기 좋은 곳 3곳과 그 이유, 가는 길과 산책 코스를 골라 드립니다. 서울숲이 맞지 않는 날에는 근처의 무료 장소도 알려 드립니다.')),
    h('div', { class: 'citizen nd-citizen' },
      h('div', { class: 'grid' }, el.form, el.status, el.picks, el.route, el.near, el.how),
      h('section', { class: 'card citizen-map' }, h('div', { class: 'map-wrap' }, el.map, el.legend, h('div', { class: 'nd-attr' }, '© OpenStreetMap 기여자')))));

  const set = patch => { Object.assign(st, patch); update(); };
  const startPoint = () => {
    const m = app.model;
    if (st.start.kind === 'hub') { const hub = m.hubById[st.start.id] ?? m.gates[0]; return { node: hub.node, off: hub.off, lat: hub.lat, lon: hub.lon, label: hub.name }; }
    const s = m.snap(st.start.lon, st.start.lat);
    if (!s) { st.start = { kind: 'hub', id: m.gates[0].id }; return startPoint(); }      // 길을 찾을 수 없는 자리면 입구로 되돌립니다
    return { node: s.node, off: s.off, lat: st.start.lat, lon: st.start.lon, label: st.start.label };
  };

  function useGps() {
    if (!navigator.geolocation) return set({ gpsNote: '이 기기에서는 위치를 쓸 수 없습니다.' });
    set({ gpsNote: '위치를 확인하는 중…' });
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords, s = app.model.snap(lon, lat);
      if (s && (app.model.inPark(lon, lat) || s.off <= SNAP_PARK)) set({ start: { kind: 'pt', lat, lon, label: '내 위치' }, gpsNote: null, pick: 0 });
      else set({ start: { kind: 'hub', id: app.model.gates[0].id }, gpsNote: '지금 서울숲 밖에 계셔서 입구를 출발지로 두었습니다.', pick: 0 });
    }, () => set({ gpsNote: '위치를 가져오지 못했습니다. 입구나 지도에서 출발지를 골라 주세요.' }), { enableHighAccuracy: true, timeout: 8000 });
  }

  // ── 고르는 칸 ──
  function renderForm() {
    const m = app.model, custom = st.start.kind === 'pt';
    const sel = h('select', { class: 'nd-select', 'aria-label': '출발하는 곳', onchange: ev => {
      const v = ev.target.value;
      if (v === 'gps') useGps();
      else if (v === 'map') { set({ picking: true, gpsNote: '지도에서 출발할 곳을 눌러 주세요.' }); }
      else if (v !== 'custom') set({ start: { kind: 'hub', id: v }, picking: false, gpsNote: null, pick: 0 });
    } },
      m.gates.map(g => h('option', { value: g.id, selected: !custom && st.start.id === g.id }, g.name)),
      custom ? h('option', { value: 'custom', selected: true }, st.start.label) : null,
      h('option', { value: 'gps' }, '내 위치 쓰기'), h('option', { value: 'map' }, '지도에서 고르기'));
    el.form.replaceChildren(card('무엇을 하고 싶으세요?', '세 가지만 고르면 됩니다',
      h('div', { class: 'nd-form' },
        h('div', null, h('div', { class: 'cond-l' }, '하고 싶은 일'), chipGroup(NEEDS, st.need, v => set({ need: v, pick: 0 }), '하고 싶은 일')),
        h('div', null, h('div', { class: 'cond-l' }, '머물 시간'), segGroup(STAYS, st.stay, v => set({ stay: v, pick: 0 }), '머물 시간')),
        h('div', null, h('div', { class: 'cond-l' }, '같이 온 사람'), chipGroup(COMPANY, st.company, v => set({ company: v, pick: 0 }), '같이 온 사람')),
        h('div', { class: 'nd-form-row' },
          h('label', { class: 'nd-field' }, h('span', { class: 'cond-l' }, '출발하는 곳'), sel),
          h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: st.slow, onchange: ev => set({ slow: ev.target.checked }) }), '휠체어·유모차로 이동')),
        st.gpsNote ? h('div', { class: 'notice' }, icon('pin', 15), st.gpsNote) : null)));
  }

  // ── 상태 한 줄 ──
  function renderStatus() {
    const needLabel = NEEDS.find(n => n.key === st.need).label, h0 = app.wx.hourly[0], ev = h0.ev;
    const usableNow = rec.picks.some(p => p.usable), why = rec.whyText ?? '지금은';
    const title = rec.fit === 'good' ? `‘${needLabel}’에 맞는 곳 3곳을 골랐습니다` : rec.fit === 'partial' ? `지금 꼭 맞는 곳은 ${rec.suitable}곳입니다` : usableNow ? '지금은 꼭 맞는 곳이 없습니다' : '지금 바로 갈 만한 곳이 없습니다';
    const msg = rec.fit === 'good' ? `지금 서울숲은 ${MODE_TEXT[rec.mode.key]}. 머물 시간과 같이 온 사람에 맞춰 순서를 매겼습니다.`
      : !rec.picks.length ? `${why} 지금은 추천할 자리가 없습니다. 아래의 근처 무료 장소를 살펴보세요.`
      : usableNow ? `${why} 조건에 꼭 맞는 자리가 모자랍니다. 아래 추천에는 사정을 함께 적었고, 근처 무료 장소도 보여 드립니다.`
      : `${why} 지금은 머물 자리가 없습니다. 아래는 가장 먼저 갈 수 있게 되는 곳입니다.`;
    const calm = { cold: '추위 주의', cool: '쌀쌀함', hot: '더움', mild: '날씨 좋음', rain: '비', dust: '미세먼지' }[rec.mode.key];
    const stage = ev.overall ? DRIVER_TEXT[ev.drivers[0]][ev.overall - 1] : `${h0.day ? '' : '밤 · '}${calm}`;
    el.status.replaceChildren(h('section', { class: `hero wide s${rec.fit === 'good' ? 0 : rec.fit === 'partial' ? 1 : 2}`, role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'nd-hero-text' },
        h('span', { class: 'hero-pill' }, `${ev.overall ? `${STAGE_LABEL[ev.overall]} · ` : ''}${stage}${app.wx.scenario ? ' (시연)' : ''}`),
        h('div', { class: 'hero-title' }, title), h('p', { class: 'hero-msg' }, msg)),
      h('div', { class: 'hero-facts' },
        h('div', { class: 'hero-fact' }, h('span', null, '체감 온도'), h('b', { class: 'num' }, h0.feels == null ? '–' : `${Math.round(h0.feels)}℃`)),
        h('div', { class: 'hero-fact' }, h('span', null, '초미세먼지'), h('b', { class: 'num' }, h0.pm25 == null ? '–' : `${Math.round(h0.pm25)}`)),
        h('div', { class: 'hero-fact' }, h('span', null, '비 올 확률'), h('b', { class: 'num' }, h0.pop == null ? '–' : `${Math.round(h0.pop)}%`)))));
  }

  // ── 갈 곳 3곳 ──
  function renderPicks() {
    if (!rec.picks.length) {
      el.picks.replaceChildren(card('갈 곳', null, h('div', { class: 'empty' }, h('div', { class: 'empty-ico' }, icon('info', 24)),
        h('div', null, h('div', { class: 'empty-title' }, '지금은 추천할 곳이 없습니다'), h('div', { class: 'small ink2' }, '조건을 바꾸거나 아래의 근처 무료 장소를 살펴보세요.')))));
      return;
    }
    const list = rec.picks.map((p, i) => {
      const t = TYPE[p.place.type], on = i === st.pick, choose = () => set({ pick: i });
      return h('div', { class: `nd-pick${on ? ' on' : ''}`, role: 'radio', tabindex: 0, 'aria-checked': on, onclick: choose, onkeydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(); } } },
        h('div', { class: 'nd-pick-top' },
          h('span', { class: 'pick-rank' }, i + 1),
          h('span', { class: `pick-ico t-${p.place.type}` }, icon(t.icon, 20)),
          h('span', { class: 'pick-main' }, h('span', { class: 'pick-title' }, p.place.name),
            h('span', { class: 'pick-sub' }, `${t.label} · ${p.place.note || p.place.zone} · 걸어서 ${p.walkMin}분(${fmtM(p.walkM)})`))),
        h('div', { class: 'nd-tags' },
          p.match.map(s => h('span', { class: 'badge tone-good' }, s)),
          p.flags.map(s => h('span', { class: 'badge tone-warning' }, s)),
          p.win.hoursInfo?.fee && p.win.hoursInfo.fee !== '무료' ? h('span', { class: 'badge tone-warning' }, p.win.hoursInfo.fee) : null),
        h('div', { class: 'nd-reasons' }, REASONS.map(([key, ic, label]) => {
          const r = p.reasons[key];
          return h('div', { class: `nd-reason nd-${r.tone}` }, h('span', { class: 'nd-r-k' }, icon(ic, 14), label), h('b', null, r.value), h('small', null, r.note));
        })));
    });
    el.picks.replaceChildren(card(`갈 곳 ${rec.picks.length}곳`, '눌러서 가는 길을 확인하세요 · 붐빔은 요일과 시각으로 어림한 값입니다', h('div', { class: 'nd-picks', role: 'radiogroup', 'aria-label': '추천 장소' }, list)));
  }

  // ── 가는 길 · 산책 코스 ──
  function computePlan() {
    const s = startPoint(), p = rec.picks[st.pick], m = app.model;
    const sunMode = !rec.mode.day ? 'none' : rec.mode.key === 'cool' || rec.mode.key === 'cold' ? 'sun' : 'shade';
    const env = { scale: crowdScale(app.now.dow, app.now.hour), sunMode }, prefs = { ...st.prefs, nostairs: st.prefs.nostairs || st.slow };
    const a = Math.round(s.off);
    if (st.mode === 'course') {
      const loop = st.end === 'loop' || !p, to = loop ? s.node : p.place.node, b = loop ? a : Math.round(p.place.off);
      const end = loop ? s : p.place;
      // 출발지·도착지에서 길까지 걷는 만큼은 빼고 코스 길이를 맞춥니다
      const sum = planCourse(m, s.node, to, Math.max(5, st.minutes - (a + b) / rec.speed), prefs, env, rec.speed);
      return { kind: 'course', s, p, env, sunMode, sum: withEnds(sum, a, b, rec.speed), loop, end };
    }
    if (!p) return { kind: 'route', s, p: null, env, sunMode, sum: null };
    const r = planRoute(m, s.node, p.place.node, prefs, env, rec.speed), b = Math.round(p.place.off);
    return { kind: 'route', s, p, env, sunMode, sum: withEnds(r?.main ?? null, a, b, rec.speed), base: withEnds(r?.base ?? null, a, b, rec.speed), same: !r, end: p.place };
  }
  function renderRoute() {
    const p = plan.p, sum = plan.sum, sunWord = plan.sunMode === 'sun' ? '볕 드는 길' : '그늘';
    const prefChips = h('div', { class: 'chips', role: 'group', 'aria-label': '길 조건' }, PREFS.map(([key, ic, label]) => {
      const forced = key === 'nostairs' && st.slow, dead = key === 'shade' && plan.sunMode === 'none';
      return h('button', { type: 'button', class: 'chip', disabled: dead, 'aria-pressed': forced || (st.prefs[key] && !dead), title: dead ? '해가 진 뒤에는 그늘 차이가 없습니다' : null,
        onclick: () => { if (!forced) set({ prefs: { ...st.prefs, [key]: !st.prefs[key] } }); } }, icon(ic, 15), key === 'shade' ? sunWord : label);
    }));
    const head = h('div', { class: 'route-controls' },
      segGroup([{ key: 'route', label: '가는 길' }, { key: 'course', label: '산책 코스' }], st.mode, v => set({ mode: v }), '길 종류'),
      st.mode === 'course' ? h('div', { class: 'nd-row' },
        segGroup(COURSE_MIN.map(k => ({ key: k, label: `${k}분` })), st.minutes, v => set({ minutes: v }), '산책 시간'),
        p ? segGroup([{ key: 'loop', label: '출발지로 돌아오기' }, { key: 'pick', label: `${p.place.name}에서 끝내기` }], st.end, v => set({ end: v }), '끝나는 곳') : null) : null,
      h('div', null, h('div', { class: 'cond-l' }, '이런 길이 좋아요 (여러 개 고를 수 있음)'), prefChips));
    let body;
    if (!sum) body = h('div', { class: 'assume' }, plan.same ? '출발지 바로 옆이라 길 안내가 필요 없습니다.' : st.mode === 'course' ? '이 출발지에서는 그 길이의 코스를 만들지 못했습니다.' : '갈 곳을 먼저 골라 주세요.');
    else {
      const crowdV = sum.crowd * plan.env.scale, crowdWord = crowdV < .25 ? '한산함' : crowdV < .5 ? '보통' : '붐빔';
      const facts = [
        sum.shade == null ? null : ['shade', plan.sunMode === 'sun' ? `볕 드는 구간 ${pct(1 - sum.shade)}` : `그늘 구간 ${pct(sum.shade)}`],
        ['bench', sum.stops.length ? `쉼터 ${sum.stops.length}곳 지남 · 쉼터 사이 최대 ${fmtM(sum.maxGap)}` : '지나는 쉼터 없음'],
        ['stairs', sum.stairs ? `계단 ${sum.stairs}곳` : '계단 없음'],
        ['quiet', `길 붐빔 ${crowdWord}`],
      ].filter(Boolean);
      const notes = [];
      if (plan.kind === 'route' && plan.base && plan.base.meters !== sum.meters) {
        const d = sum.meters - plan.base.meters, parts = [];
        if (sum.shade != null && plan.base.shade != null) { const ds = Math.round(((plan.sunMode === 'sun' ? plan.base.shade - sum.shade : sum.shade - plan.base.shade)) * 100); if (ds > 0) parts.push(`${sunWord} 구간이 ${ds}%p 더 많습니다.`); }
        if (plan.base.crowd - sum.crowd > .03) parts.push('덜 붐비는 길입니다.');
        if (sum.stops.length > plan.base.stops.length || sum.maxGap < plan.base.maxGap - 20) parts.push('쉼터를 더 가까이 지납니다.');
        notes.push(`가장 짧은 길(${fmtM(plan.base.meters)}, ${plan.base.minutes}분)보다 ${fmtM(Math.abs(d))} ${d > 0 ? '더 걷습니다' : '덜 걷습니다'}. ${parts.length ? `대신 ${parts.join(' ')}` : '고른 조건에 더 맞는 길입니다.'}`);
      }
      if (plan.kind === 'course') {
        if (sum.tooShort) notes.push(`${p.place.name}까지 곧장 가도 ${sum.minutes}분이 걸려, 가장 짧은 길로 안내합니다.`);
        else if (Math.abs(sum.minutes - st.minutes) >= 4) notes.push(`길이 맞는 코스가 없어 ${sum.minutes}분 코스로 잡았습니다.`);
        if (sum.repeat > 60) notes.push(`${fmtM(sum.repeat)}는 같은 길을 되짚습니다.`);
        if (sum.outLen > 60) notes.push(`${fmtM(sum.outLen)}는 공원 밖 길입니다.`);
      }
      if (st.slow) notes.push('계단을 피하고 천천히 걷는 속도(시속 3.2km)로 계산했습니다.');
      body = h('div', null,
        h('div', { class: 'route-big' }, h('b', { class: 'num' }, `${sum.minutes}분`), h('span', null, `${fmtM(sum.meters)} · ${plan.kind === 'course' ? (plan.loop ? `${plan.s.label}에서 한 바퀴` : `${plan.s.label} → ${p.place.name}`) : `${plan.s.label} → ${p.place.name}`}`)),
        h('div', { class: 'nd-facts' }, facts.map(([ic, text]) => h('span', { class: 'nd-fact' }, icon(ic, 15), text))),
        sum.stops.length ? h('div', { class: 'small ink2 nd-stops' }, '지나는 쉼터: ', sum.stops.map((s, i) => `${i ? ' → ' : ''}${s.spot.name || FAC_LABEL[s.spot.kind]}(${fmtM(s.at)} 지점)`).join('')) : null,
        notes.map(n => h('p', { class: 'route-why' }, n)));
    }
    el.route.replaceChildren(card(st.mode === 'course' ? '산책 코스' : '가는 길', st.mode === 'course' ? '20·40·60분 가운데 골라 걷기' : p ? `${p.place.name}까지` : '갈 곳을 고르면 길을 보여 드립니다', h('div', null, head, body)));
  }

  // ── 근처 무료 장소 ──
  function renderNear() {
    const all = nearbyPlaces(app.model, app.now, rec.mode, rec.speed), shown = st.moreNear ? all : all.slice(0, 4);
    const rows = h('div', { class: 'list' }, shown.map(p => h('div', { class: `row nd-near${p.ok ? '' : ' off'}${st.nearSel === p.id ? ' on' : ''}`, role: 'button', tabindex: 0,
      onclick: () => set({ nearSel: st.nearSel === p.id ? null : p.id }), onkeydown: ev => { if (ev.key === 'Enter') set({ nearSel: p.id }); } },
      h('span', { class: `pick-ico nd-k-${p.kind}` }, icon(KIND_ICON[p.kind], 18)),
      h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, p.name),
        h('div', { class: 'row-sub' }, `${p.kindLabel} · 서울숲에서 걸어서 ${p.walkMin}분(${fmtM(p.walk)})${p.dir ? ` · ${p.dir}쪽` : ''}`), h('div', { class: 'row-sub' }, p.note)))),
      all.length > 4 ? h('button', { type: 'button', class: 'btn nd-more', onclick: () => set({ moreNear: !st.moreNear }) }, st.moreNear ? '접기' : `${all.length - 4}곳 더 보기`) : null);
    const none = all.length && !all.some(p => p.ok) ? h('div', { class: 'notice' }, icon('info', 15), '지금 문을 연 무료 장소가 없습니다. 아래는 낮에 갈 수 있는 곳입니다.') : null;
    const foot = h('div', { class: 'assume' }, '걷는 거리는 서울숲 경계에서 잰 값입니다. 운영 시간과 휴관일은 가기 전에 확인해 주세요. 장소 목록은 OpenStreetMap 기준이라 빠진 곳이 있을 수 있습니다.');
    if (rec.fit === 'good') {
      el.near.replaceChildren(h('div', { class: 'more-wrap nd-more-wrap' }, h('details', { class: 'more card', open: st.nearSel != null, ontoggle: ev => { if (!ev.target.open && st.nearSel) set({ nearSel: null }); } },
        h('summary', null, '서울숲이 맞지 않을 때 — 근처 무료 장소', h('span', { class: 'muted' }, `도서관·주민센터·공원 ${all.length}곳`)), h('div', { class: 'more-body' }, none, rows, foot))));
    } else {
      el.near.replaceChildren(card('근처 무료 장소', '서울숲이 맞지 않는 지금, 돈 들이지 않고 갈 수 있는 곳', h('div', null, none, rows, foot)));
    }
    return all;
  }

  function renderHow() {
    const w = rec.weights, sum = Object.values(w).reduce((a, b) => a + b, 0), share = k => `${Math.round(w[k] / sum * 100)}%`;
    el.how.replaceChildren(h('div', { class: 'more-wrap nd-more-wrap' }, h('details', { class: 'more card' },
      h('summary', null, '이 추천은 어떻게 계산하나요?', h('span', { class: 'muted' }, '기준과 한계')),
      h('div', { class: 'more-body nd-how' },
        h('p', null, `점수 비중: 하고 싶은 일 ${share('need')} · 머물 수 있는 시간 ${share('stay')} · 같이 온 사람 ${share('company')} · 붐빔 ${share('crowd')} · 날씨에 맞는 자리 ${share('thermal')} · 걷는 거리 ${share('walk')} · 화장실 ${share('toilet')}. 혼자면 붐빔을, 아이·어르신과 함께면 화장실과 걷는 거리를 더 봅니다.`),
        h('p', null, `머물 수 있는 시간은 운영 시간, 밤(${NIGHT.from}시 이후 야외는 안내하지 않음), 날씨(야외는 주의 단계부터, 비가 오면 그늘 자리도 어려움), 추위(체감 ${COLD.still}℃ 미만)로 정합니다. 수용 인원의 ${Math.round(CROWD_STOP * 100)}%를 넘게 붐비는 곳은 '지금 매우 붐빔'으로 표시하고 뒤로 미룹니다.`),
        h('p', null, '붐빔은 실제로 센 값이 아니라 요일·시각·날씨로 어림한 값입니다. 나무 그늘은 여름 위성 영상 기준이라 겨울에는 다릅니다. 방문자센터·수변휴게실처럼 운영 시간을 확인하지 못한 곳은 10~17시로 가정했고 화면에 ‘확인 필요’로 적었습니다. 장소별 적합도는 팀이 정한 가정값입니다.'),
        h('p', null, '앉을 곳(쉼터)은 OpenStreetMap에 등록된 것과 관리자 화면에서 현장 조사로 더한 것만 압니다. 실제 길가에는 벤치가 더 있으므로 ‘지나는 쉼터’는 적게 나옵니다. 걷는 시간은 시속 4.2km(아이·어르신·휠체어는 3.2km)로 계산합니다.')))));
  }

  // ── 지도 ──
  function drawMap(near) {
    const m = app.model, s = plan.s, picks = rec.picks;
    const pickIdx = new Map(picks.map((p, i) => [p.place.id, i]));
    view.markers('fac', m.fac.filter(f => f.kind !== 'water').map(f => ({ lat: f.lat, lon: f.lon, size: 18, cls: `nd-mk-fac nd-f-${f.kind === 'toilet' ? 'toilet' : 'seat'}`, html: mk(f.kind === 'toilet' ? 'toilet' : 'bench', 11),
      tip: esc(f.name || FAC_LABEL[f.kind]) })));
    view.markers('hubs', m.places.map(hub => {
      const i = pickIdx.get(hub.id), c = crowdLabel(hubLoad(hub, app.now.dow, app.now.hour, app.wx.hourly[0])?.ratio ?? 0);
      return i == null ? { lat: hub.lat, lon: hub.lon, size: 14, cls: `nd-mk-hub nd-c-${c.key}`, tip: `<b>${esc(hub.name)}</b><br>${TYPE[hub.type].label} · ${c.label}(추정)` }
        : { lat: hub.lat, lon: hub.lon, size: i === st.pick ? 30 : 26, cls: `nd-mk-pick nd-c-${c.key}${i === st.pick ? ' on' : ''}`, html: String(i + 1), z: 500, tip: esc(hub.name), permanent: i === st.pick, onClick: () => set({ pick: i }) };
    }));
    const sum = plan.sum, linesList = [];
    if (plan.kind === 'route' && plan.base && sum && plan.base.meters !== sum.meters) linesList.push({ coords: plan.base.coords, color: view.color('muted'), weight: 3, dash: '2 7' });
    if (sum) {
      linesList.push({ coords: sum.coords, color: view.color('goal3'), weight: 5 });
      // 출발지·도착지 표지와 길 사이는 점선으로 잇습니다
      const tail = sum.coords[sum.coords.length - 1], endPt = plan.end ? [plan.end.lat, plan.end.lon] : null;
      linesList.push({ coords: [[s.lat, s.lon], sum.coords[0]], color: view.color('goal3'), weight: 3, dash: '1 7' });
      if (endPt) linesList.push({ coords: [tail, endPt], color: view.color('goal3'), weight: 3, dash: '1 7' });
    }
    view.lines('route', linesList);
    view.markers('stops', (sum?.stops ?? []).map(x => ({ lat: x.spot.lat, lon: x.spot.lon, size: 22, cls: 'nd-mk-stop', html: mk('bench', 12), z: 300, tip: `${esc(x.spot.name || FAC_LABEL[x.spot.kind])} · ${fmtM(x.at)} 지점` })));
    view.markers('start', [{ lat: s.lat, lon: s.lon, size: 28, cls: 'nd-mk-start', html: mk('pin', 15), z: 600, tip: `출발: ${esc(s.label)}` }]);
    const showNear = rec.fit !== 'good' || st.nearSel != null;
    view.markers('near', showNear ? near.filter(p => st.moreNear || near.indexOf(p) < 4 || p.id === st.nearSel).map(p => ({ lat: p.lat, lon: p.lon, size: p.id === st.nearSel ? 28 : 22,
      cls: `nd-mk-near nd-k-${p.kind}${p.ok ? '' : ' off'}${p.id === st.nearSel ? ' on' : ''}`, html: mk(KIND_ICON[p.kind], 12), z: p.id === st.nearSel ? 550 : 100,
      tip: `<b>${esc(p.name)}</b><br>${p.kindLabel} · 걸어서 ${p.walkMin}분`, permanent: p.id === st.nearSel, onClick: () => set({ nearSel: p.id }) })) : []);
    el.legend.replaceChildren(
      h('div', { class: 'legend' }, ['free', 'normal', 'busy', 'very'].map((k, i) => h('span', null, h('i', { class: `nd-c-${k}` }), ['여유', '보통', '혼잡', '매우 혼잡'][i])), h('span', { class: 'muted' }, '붐빔(추정)')),
      h('div', { class: 'legend nd-legend2' }, h('span', null, h('i', { class: 'nd-lg-line' }), plan.kind === 'course' ? '산책 코스' : '추천 길'),
        plan.kind === 'route' && plan.base && sum && plan.base.meters !== sum.meters ? h('span', null, h('i', { class: 'nd-lg-dash' }), '가장 짧은 길') : null, h('span', null, h('i', { class: 'nd-f-toilet' }), '화장실'), h('span', null, h('i', { class: 'nd-f-seat' }), '앉을 곳')));
    // 보이는 범위
    const sel = st.nearSel ? near.find(p => p.id === st.nearSel) : null;
    const key = `${st.pick}|${st.mode}|${st.minutes}|${st.end}|${st.nearSel}|${s.node}|${rec.picks.map(p => p.place.id).join()}`;
    if (key !== drawMap.key) {
      drawMap.key = key;
      if (sel) view.fit([[sel.lat, sel.lon], [s.lat, s.lon], ...(sum?.coords ?? [])], 50);
      else if (sum) view.fit([...sum.coords, [s.lat, s.lon]], 60);
      else view.fitPark();
    }
  }

  function update() {
    if (!app.model || !app.wx) return;
    const s = startPoint();
    rec = recommend(app.model, app.wx, app.now, { need: st.need, stay: st.stay, company: st.company, slow: st.slow, startNode: s.node, startOff: s.off });
    if (st.pick >= rec.picks.length) st.pick = 0;
    plan = computePlan();
    renderForm(); renderStatus(); renderPicks(); renderRoute();
    const near = renderNear();
    renderHow();
    if (view) { view.cursor(st.picking ? 'crosshair' : null); drawMap(near); }
  }

  return {
    update,
    /** 화면이 보일 때 부릅니다(지도는 보이는 상태에서 만들어야 크기가 맞습니다) */
    show() {
      if (!view) {
        view = createMap(el.map, app.model);
        view.onClick((lat, lon) => {
          if (!st.picking) return;
          const s = app.model.snap(lon, lat);
          if (!s || s.off > SNAP_PARK) set({ gpsNote: '길에서 너무 먼 곳입니다. 공원 안이나 길 가까이를 눌러 주세요.' });
          else set({ start: { kind: 'pt', lat, lon, label: '지도에서 고른 곳' }, picking: false, gpsNote: null, pick: 0 });
        });
      }
      view.invalidate(); drawMap.key = null; update();
    },
    theme() { view?.restyle(); if (view) update(); },
    state: st,
    get view() { return view; },
  };
}
