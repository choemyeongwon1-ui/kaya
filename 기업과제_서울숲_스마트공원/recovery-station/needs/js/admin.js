// 관리자 화면: 쉬기 어려운 곳과 이유(지도), 벤치·그늘·화장실이 필요한 자리, 현장 조사 입력, AI 도우미
import { REST_STD, REST_REASONS, HARD_FROM, SITE_DEFAULT, AI, LEGAL_COLOR } from './config.js';
import { diagnose, siteFacilities, ruleSummary, briefData, nearLabel, siteZone, needsPermit, permitSites } from './rest.js';
import { FAC_LABEL } from './model.js';
import { toXY } from './geo.js';
import { askAI, keyStore, firstMessage, REPORT_TASK, AIError } from './ai.js';
import { createMap, mk } from './mapview.js';
import { NEWS_KINDS, NEWS_FOR, todayIso } from './news.js';
import { fetchComfort } from './review.js';
import { h, icon, pct, esc, cssVar, download, md, segGroup, chipGroup, card } from './ui.js';

const KINDS = [
  { key: 'bench', label: '벤치', icon: 'bench', unit: '곳', hint: '앉을 곳이 먼 칸을 가장 많이 줄이는 길가' },
  { key: 'shade', label: '그늘', icon: 'shade', unit: '곳', hint: '그늘이 모자라고 사람이 많이 지나는 길가(그늘막·큰 나무)' },
  { key: 'toilet', label: '화장실', icon: 'toilet', unit: '곳', hint: '화장실이 먼 칸을 가장 많이 줄이는 길가' },
];
const SURVEY_KINDS = [{ key: 'bench', label: '벤치' }, { key: 'shelter', label: '정자·쉼터' }, { key: 'toilet', label: '화장실' }, { key: 'water', label: '음수대' }];
const RAMP = ['--v1', '--v2', '--v3', '--v4'];

export function createAdmin(root, app) {
  const st = { std: 'all', layer: 'count', reason: 'seat', when: 'before', counts: { ...SITE_DEFAULT }, sel: null, addMode: false, addKind: 'bench',
    showSites: true, showFac: true, showTeam: false, focus: null };
  const ai = { key: keyStore.get(), remember: keyStore.remembered(), draft: null, busy: false, messages: [], log: [], live: '', err: null, ctl: null, stamp: '' };
  let view = null, diag = null, plan = null;

  const el = { head: h('div'), ctrl: h('div'), side: h('div', { class: 'nd-side' }), sites: h('div'), news: h('div'), comfort: h('div'), survey: h('div'), ai: h('div'), legend: h('div', { class: 'map-legend' }), map: h('div', { class: 'map' }) };
  const draft = { kind: 'garden', title: '', place: '', from: todayIso(app.now.date), to: '', for: 'all', text: '' };
  root.append(
    h('header', { class: 'page-head' },
      h('div', { class: 'eyebrow' }, '관리자용 · 데스크톱'),
      h('h1', { class: 'page-q' }, '어디가 쉬기 어렵고, 무엇을 놓아야 할까?'),
      h('p', { class: 'page-why' }, '공원을 20m 칸으로 나눠 앉을 곳·그늘·화장실·붐빔 네 가지를 견줍니다. 두 가지 이상 모자란 칸을 ‘쉬기 어려운 곳’으로 보고, 벤치·그늘·화장실을 어디에 놓으면 가장 많이 줄어드는지 계산합니다.')),
    el.head,
    h('div', { class: 'nd-admin' },
      // 지도는 오른쪽 요약을 읽는 동안 화면에 붙어 있습니다(이 줄 안에서만)
      h('div', { class: 'nd-top' },
        h('section', { class: 'card nd-mapcard' }, el.ctrl, h('div', { class: 'map-wrap expert-map' }, el.map, el.legend, h('div', { class: 'nd-attr' }, '© OpenStreetMap 기여자'))),
        el.side),
      el.sites,
      el.news,
      el.comfort,
      h('div', { class: 'nd-bottom' }, el.survey, el.ai)));

  const set = patch => { Object.assign(st, patch); update(); };
  const current = () => (st.when === 'after' && plan ? plan.after : diag);

  // ── 기준과 자료 주의 ──
  function renderHead() {
    const s = diag.std, seats = app.model.seats.length, added = app.model.fac.filter(f => f.surveyed).length;
    el.head.replaceChildren(
      h('div', { class: 'who-row nd-who' },
        h('div', { class: 'small ink2' }, h('b', null, '판정 기준 '), `앉을 곳 ${s.seat}m 안 · 나무 그늘 ${pct(s.shade)} 이상 · 화장실 ${s.toilet}m 안 · 붐빔 지수 ${s.crowd} 미만 — ${HARD_FROM}가지 이상 어긋나면 쉬기 어려운 곳`),
        segGroup(Object.entries(REST_STD).map(([key, v]) => ({ key, label: `${v.label} 기준` })), st.std, v => set({ std: v, sel: null, focus: null }), '판정 기준')),
      h('div', { class: 'notice nd-warn' }, icon('alert', 16),
        h('span', null, `앉을 곳은 지도(OpenStreetMap)에 등록된 ${seats - added}곳${added ? `과 현장 조사로 더한 ${added}곳` : ''}만 반영했습니다. 실제 벤치는 더 많으므로 ‘앉을 곳이 멂’은 실제보다 넓게 나옵니다. 아래 `, h('b', null, '현장 조사로 시설 추가'), '에서 벤치를 넣으면 결과가 바로 바뀝니다.')));
  }

  // ── 지도 위 조작 ──
  function renderCtrl() {
    el.ctrl.replaceChildren(h('div', { class: 'nd-ctrl' },
      h('div', { class: 'nd-row' },
        segGroup([{ key: 'count', label: '모자란 가짓수' }, { key: 'reason', label: '이유별로 보기' }, ...(app.model.legal ? [{ key: 'legal', label: '법적 구역' }] : [])], st.layer, v => set({ layer: v }), '지도에 보일 것'),
        st.layer === 'reason' ? chipGroup(REST_REASONS.map(r => ({ key: r.key, label: r.label })), st.reason, v => set({ reason: v }), '이유') : null),
      h('div', { class: 'nd-row' },
        segGroup([{ key: 'before', label: '지금' }, { key: 'after', label: '제안대로 놓은 뒤' }], st.when, v => set({ when: v }), '시점'),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: st.showSites, onchange: ev => set({ showSites: ev.target.checked }) }), '제안 자리'),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: st.showFac, onchange: ev => set({ showFac: ev.target.checked }) }), '지금 있는 시설'),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: st.showTeam, onchange: ev => set({ showTeam: ev.target.checked }) }), '팀이 앞서 제안한 쉼터'))));
  }

  // ── 오른쪽: 요약 · 고른 칸 · 구역 ──
  function renderSide() {
    const d = current(), s = d.summary, b = diag.summary, e = plan.effect;
    const kpi = h('div', { class: 'ba-kpi' },
      h('span', null, st.when === 'after' ? '제안대로 놓은 뒤 쉬기 어려운 곳' : '지금 쉬기 어려운 곳'),
      h('b', { class: 'num' }, s.hardHa, h('small', null, 'ha')),
      h('em', null, `판정한 ${s.ha}ha의 ${pct(s.hardShare)} · ${s.hard}칸` + (st.when === 'after' ? ` (지금 ${b.hard}칸에서 ${pct(e.hard.cut)} 줄어듦)` : '')));
    const rows = h('div', { class: 'ba-rows' }, REST_REASONS.map(r => {
      const before = b.byReason[r.key].n, after = plan.after.summary.byReason[r.key].n;
      return h('div', { class: 'ba-row' },
        h('span', { class: 'ba-l' }, h('i', { class: 'sw', style: { background: cssVar(r.color) } }), r.label),
        h('span', { class: 'ba-v num' }, before === after ? h('b', null, `${before}칸`) : [h('s', null, `${before}칸`), ' → ', h('b', null, `${after}칸`)]),
        h('div', { class: 'ba-bar' }, h('i', { class: 'after', style: { width: `${Math.round((st.when === 'after' ? after : before) / b.cells * 100)}%`, background: cssVar(r.color) } })));
    }));
    const blocks = [card('한눈에 보기', `보류 ${diag.held}칸은 판정에서 뺌`, h('div', null, kpi, h('div', { class: 'diag-title' }, '이유별 칸 수 ', h('span', { class: 'muted' }, '지금 → 제안대로 놓은 뒤')), rows))];

    const row = st.sel != null ? d.byId.get(st.sel) : null;
    if (row) {
      const v = row.v, std = d.std, chk = (key, label, val, limit) => { const no = row.fails.includes(key);
        return h('div', { class: `chk ${no ? 'no' : 'ok'}` }, h('span', { class: 'chk-mark' }, no ? '!' : '✓'), h('span', { class: 'chk-l' }, label), h('b', { class: 'num' }, val), h('span', { class: 'small ink2' }, limit)); };
      blocks.push(card('고른 칸', nearLabel(app.model, row.c.x, row.c.y), h('div', null,
        h('div', { class: `verdict-big ${row.hard ? 'bad' : row.n ? 'mid' : 'ok'}` }, h('b', null, row.hard ? '쉬기 어려운 곳' : row.n ? '한 가지가 모자람' : '쉬기 좋은 곳'), h('span', null, h('b', { class: 'num' }, row.n), '가지 모자람')),
        h('div', { class: 'checks checks-3' },
          chk('seat', '앉을 곳까지', `${v.dSeat}m`, `${std.seat}m 안`), chk('shade', '나무 그늘', pct(v.tree), `${pct(std.shade)} 이상`),
          chk('toilet', '화장실까지', `${v.dToilet}m`, `${std.toilet}m 안`), chk('crowd', '붐빔 지수', Math.round(v.crowd), `${std.crowd} 미만`)),
        zoneBox(row.c.legal),
        h('button', { type: 'button', class: 'btn nd-mt', onclick: () => set({ sel: null }) }, '고른 칸 지우기'))));
    }
    if (st.layer === 'legal' && app.model.legal) blocks.push(legalCard(d));
    const top = d.clusters.slice(0, 6);
    blocks.push(card('먼저 볼 구역', '붙어 있는 칸을 묶어 넓이와 이용 정도 순으로 세움', top.length ? h('div', { class: 'zlist' }, top.map(c =>
      h('button', { type: 'button', class: `zbtn${st.focus === c.rank ? ' on' : ''}`, onclick: () => { set({ focus: c.rank, sel: null }); view?.fit(c.cells.map(r => [r.c.lat, r.c.lon]), 70); } },
        h('span', { class: 'zrank', style: { background: cssVar(RAMP[Math.min(3, Math.max(0, Math.round(c.mean.nfail) - 1))]) } }, c.rank),
        h('span', { class: 'zmain' }, h('b', null, `${c.label} 일대`), h('span', null, c.reasons.map(r => r.label).join(' · '))),
        h('span', { class: 'znum num' }, c.ha, h('small', null, 'ha'))))) : h('div', { class: 'assume' }, '쉬기 어려운 곳이 없습니다.')));
    el.side.replaceChildren(...blocks);
  }

  // ── 법적 구역 (브이월드 지적도 + 토지이음) ──
  /** 고른 칸의 법적 구역: 적용 법 · 관리 주체 · 시설을 놓을 때 절차 */
  function zoneBox(key) {
    const z = app.model.zoneOf(key);
    if (!app.model.legal) return null;
    if (!z) return h('div', { class: 'nd-zone small muted' }, '법적 구역: 지적 자료와 겹치지 않는 칸');
    return h('div', { class: 'nd-zone' },
      h('div', null, h('i', { class: 'sw', style: { background: LEGAL_COLOR[key] } }), h('b', null, z.label), h('span', { class: 'small muted' }, ` · ${z.law}`)),
      h('div', { class: 'small ink2' }, `관리: ${z.agency}`),
      h('div', { class: `small ${key === 'park' ? 'ink2' : 'nd-zone-rule'}` }, `시설을 놓을 때: ${z.rule}`),
      z.flood ? h('div', { class: 'small nd-zone-rule' }, '큰비 때 물이 차거나 빗물을 담는 곳 — 시민 화면에서 큰비 경고 때 추천·길 안내에서 피함') : null);
  }
  /** 법적 구역별 칸 수 · 쉬기 어려운 칸 · 제안 자리 */
  function legalCard(d) {
    const L = app.model.legal, rows = new Map();
    for (const r of d.rows) { const k = r.c.legal ?? 'none'; const o = rows.get(k) ?? rows.set(k, { n: 0, hard: 0, sites: 0 }).get(k); o.n++; if (r.hard) o.hard++; }
    for (const list of Object.values(plan.sites)) for (const s of list) { const k = siteZone(app.model, s)?.key ?? 'none'; (rows.get(k) ?? rows.set(k, { n: 0, hard: 0, sites: 0 }).get(k)).sites++; }
    const order = Object.keys(L.zones).filter(k => rows.has(k));
    return card('법적 구역', `판정한 칸 · 토지이음 조회 ${L.checked}`, h('div', null,
      h('table', { class: 'nd-ztable small' },
        h('thead', null, h('tr', null, h('th', null, '구역'), h('th', null, '칸'), h('th', null, '쉬기 어려움'), h('th', null, '제안 자리'))),
        h('tbody', null, order.map(k => { const o = rows.get(k); return h('tr', null,
          h('td', null, h('i', { class: 'sw', style: { background: LEGAL_COLOR[k] } }), L.zones[k].label), h('td', { class: 'num' }, o.n), h('td', { class: 'num' }, o.hard), h('td', { class: 'num' }, o.sites || '—')); }))),
      h('div', { class: 'assume' }, '습지생태원(유수지)은 팀 격자 밖이라 지도에만 표시합니다. 칸은 가장 넓게 겹치는 필지의 지정을 따릅니다. 토지이음 열람 정보는 법적 효력이 없어, 실제 설치 전에는 토지이용계획확인서로 확인해야 합니다.')));
  }

  // ── 어디에 무엇이 필요한가 ──
  function renderSites() {
    const step = (key, d) => set({ counts: { ...st.counts, [key]: Math.max(0, Math.min(20, st.counts[key] + d)) }, when: st.when });
    const cols = KINDS.map(k => {
      const list = plan.sites[k.key];
      return h('div', { class: 'nd-sitecol' },
        h('div', { class: 'nd-sitehead' }, h('span', { class: `nd-mk nd-mk-site nd-s-${k.key}` }, icon(k.icon, 15)), h('b', null, k.label),
          h('span', { class: 'nd-step' }, h('button', { type: 'button', 'aria-label': `${k.label} 줄이기`, onclick: () => step(k.key, -1) }, '−'), h('span', { class: 'num' }, `${st.counts[k.key]}${k.unit}`), h('button', { type: 'button', 'aria-label': `${k.label} 늘리기`, onclick: () => step(k.key, 1) }, '+'))),
        h('div', { class: 'small muted' }, k.hint),
        list.length ? h('ol', { class: 'nd-sitelist' }, list.map((s, i) => h('li', null, h('button', { type: 'button', onclick: () => { view?.panTo(s.lat, s.lon, 17.5); document.querySelector('.nd-mapcard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
          h('span', { class: 'num nd-n' }, i + 1), h('span', null, h('b', null, s.label),
            h('small', null, k.key === 'shade' ? `지금 나무 그늘 ${pct(s.tree)} · 둘레 ${s.cells}칸${s.team ? ' · 팀 식재 후보와 겹침' : ''}${s.nearSeat ? ' · 앉을 곳 옆' : ''}` : `${s.cells}칸(${s.ha}ha)이 기준 안으로 들어옴`),
            permitTag(siteZone(app.model, s)))))))
          : h('div', { class: 'assume' }, st.counts[k.key] ? '더 놓아도 줄어드는 칸이 없습니다.' : '0곳으로 두었습니다.'),
        k.key !== 'shade' && plan.left[k.key] ? h('div', { class: 'small muted' }, `놓은 뒤에도 기준 밖으로 남는 칸 ${plan.left[k.key]}개`) : null);
    });
    const e = plan.effect, pz = permitSites(app.model, plan);
    el.sites.replaceChildren(
      h('div', { class: 'part-head' }, h('span', { class: 'part-n' }, '2'), h('div', null, h('h2', null, '어디에 무엇이 필요한가'), h('p', null, '개수를 바꾸면 자리와 효과를 다시 계산합니다. 자리를 누르면 지도가 그곳으로 갑니다.'))),
      h('section', { class: 'card card-pad' },
        h('div', { class: 'nd-sitegrid' }, cols),
        h('div', { class: 'rx-effect' }, icon('check', 18), h('span', null, `제안대로 놓으면 쉬기 어려운 곳이 ${e.hard.before}칸에서 ${e.hard.after}칸으로 줄어듭니다(−${e.hard.ha}ha, ${pct(e.hard.cut)}). 이용이 많은 정도로 따진 비율은 ${pct(e.useShare.before)}에서 ${pct(e.useShare.after)}가 됩니다.`)),
        pz.length ? h('div', { class: 'notice nd-warn nd-mt' }, icon('alert', 16), h('span', null, h('b', null, '허가·협의가 필요한 자리 '),
          pz.map(z => `${z.label} ${z.n}곳(${z.rule})`).join(' · '), ' — 법적 구역은 브이월드 지적도와 토지이음 조회 기준')) : null,
        h('div', { class: 'nd-row nd-mt' },
          h('button', { type: 'button', class: 'btn', onclick: () => download('서울숲_시설제안.csv', '﻿' + sitesCsv(), 'text/csv') }, icon('download', 15), '제안 자리 내려받기 (CSV)'),
          h('button', { type: 'button', class: 'btn', onclick: () => download('서울숲_시설제안.geojson', JSON.stringify(sitesGeo(), null, 1), 'application/geo+json') }, icon('download', 15), 'GeoJSON'),
          h('button', { type: 'button', class: 'btn', onclick: () => set({ when: st.when === 'after' ? 'before' : 'after' }) }, st.when === 'after' ? '지도에 지금 모습 보기' : '지도에 놓은 뒤 모습 보기')),
        h('div', { class: 'assume' }, '자리는 공원 안 길 위에서만 고르고 보류 칸과 물 위는 뺍니다. 그늘 한 곳은 둘레 한 칸까지 덮는다고 가정했습니다. 붐빔은 시설로 줄지 않아 그대로 둡니다. 실제 설치 가능 여부(지하 매설물, 수목 보호, 예산)는 현장에서 확인해야 합니다.')));
  }
  /** 제안 자리 아래 붙는 법적 구역 꼬리표. 공원 단독 구역이면 구역 이름만, 아니면 절차까지 */
  function permitTag(z) {
    if (!z) return null;
    return h('small', { class: needsPermit(z) ? 'nd-zone-rule' : 'muted' }, needsPermit(z) ? `${z.label} — ${z.rule}` : z.label);
  }
  const siteRows = () => KINDS.flatMap(k => plan.sites[k.key].map((s, i) => { const z = siteZone(app.model, s); return { kind: k.label, rank: i + 1, lat: +s.lat.toFixed(6), lon: +s.lon.toFixed(6), where: s.label, cells: s.cells, ha: s.ha,
    memo: k.key === 'shade' ? `지금 나무 그늘 ${pct(s.tree)}${s.team ? ', 팀 식재 후보와 겹침' : ''}` : '기준 안으로 들어오는 넓이',
    zone: z?.label ?? '', agency: z?.agency ?? '', rule: z?.rule ?? '' }; }));
  const sitesCsv = () => ['종류,순위,위도,경도,위치,칸수,넓이_ha,비고,법적구역,관리,설치절차', ...siteRows().map(r => [r.kind, r.rank, r.lat, r.lon, `"${r.where}"`, r.cells, r.ha, `"${r.memo}"`, `"${r.zone}"`, `"${r.agency}"`, `"${r.rule}"`].join(','))].join('\r\n');
  const sitesGeo = () => ({ type: 'FeatureCollection', name: '서울숲 시설 제안', features: siteRows().map(r => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties: { 종류: r.kind, 순위: r.rank, 위치: r.where, 칸수: r.cells, 넓이_ha: r.ha, 비고: r.memo, 법적구역: r.zone, 관리: r.agency, 설치절차: r.rule, 기준: diag.std.label } })) });

  // ── 서울숲 소식 올리기 (정원 개화·프로그램·공지 → 시민 화면 '오늘 서울숲 소식'에 바로 보임) ──
  function renderNews() {
    const list = app.news ?? [], today = todayIso(app.now.date);
    const field = (label, input) => h('label', { class: 'nd-field' }, h('span', { class: 'cond-l' }, label), input);
    const text = (key, attrs = {}) => h('input', { class: 'nd-input', value: draft[key], oninput: ev => { draft[key] = ev.target.value; }, ...attrs });
    const select = (key, opts) => h('select', { class: 'nd-select', onchange: ev => { draft[key] = ev.target.value; } }, opts.map(([v, l]) => h('option', { value: v, selected: draft[key] === v }, l)));
    const add = () => {
      if (!draft.title.trim()) return alert('제목을 넣어 주세요.');
      if (draft.to && draft.from && draft.to < draft.from) return alert('끝나는 날이 시작하는 날보다 앞입니다.');
      app.setNews([{ id: `n${Date.now()}`, kind: draft.kind, title: draft.title.trim(), place: draft.place || null, from: draft.from || null, to: draft.to || null, for: draft.for, text: draft.text.trim() }, ...list]);
      Object.assign(draft, { title: '', text: '', place: '', to: '' });
    };
    const kindLabel = k => NEWS_KINDS.find(x => x.key === k)?.label ?? k;
    const state = n => n.to && n.to < today ? '끝남' : n.from && n.from > today ? '예정' : '보이는 중';
    el.news.replaceChildren(
      h('div', { class: 'part-head' }, h('span', { class: 'part-n' }, '3'), h('div', null, h('h2', null, '서울숲 소식 올리기'), h('p', null, '정원 개화, 프로그램, 공지를 올리면 시민 화면의 ‘오늘 서울숲 소식’에 바로 보입니다. 같이 온 사람에 맞는 소식은 위로 올라갑니다.'))),
      h('section', { class: 'card card-pad' },
        h('div', { class: 'nd-newsform' },
          field('종류', select('kind', NEWS_KINDS.map(k => [k.key, k.label]))),
          field('제목', text('title', { placeholder: '예: 튤립 정원 개화 시작', maxlength: 60 })),
          field('장소', select('place', [['', '공원 전체'], ...app.model.places.map(p => [p.id, p.name])])),
          field('누구에게 먼저', select('for', NEWS_FOR.map(f => [f.key, f.label]))),
          field('시작', text('from', { type: 'date' })),
          field('끝', text('to', { type: 'date' })),
          field('한 줄 설명', text('text', { placeholder: '예: 이번 주말까지가 절정입니다', maxlength: 80 }))),
        h('div', { class: 'nd-row nd-mt' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: add }, icon('plus', 15), '올리기')),
        list.length ? h('div', { class: 'list nd-mt' }, list.map(n => h('div', { class: 'row' },
          h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, `[${kindLabel(n.kind)}] ${n.title}`),
            h('div', { class: 'row-sub' }, [app.model.hubById[n.place]?.name ?? '공원 전체', `${n.from ?? ''} ~ ${n.to ?? ''}`, NEWS_FOR.find(f => f.key === n.for)?.label, state(n)].filter(Boolean).join(' · '))),
          h('button', { type: 'button', class: 'btn', 'aria-label': '지우기', onclick: () => app.setNews(list.filter(x => x.id !== n.id)) }, icon('trash', 15)))))
          : h('div', { class: 'assume' }, '아직 올린 소식이 없습니다.'),
        h('div', { class: 'assume' }, `시연 단계라 올린 소식은 이 브라우저에만 저장됩니다(같은 브라우저의 다른 창에도 바로 반영). 실제 운영에서는 서버 한 곳에 저장해 모든 시민 화면에 같이 보이게 합니다. 서울시 공공서비스예약의 서울숲 프로그램은 ${app.data.programs?.items?.length ? `${app.data.programs.items.length}건을 함께 보여 줍니다(${app.data.programs.checked} 기준)` : '중계 서버(proxy/seoul-programs)로 받아 data/programs.json에 저장합니다'}.`)));
  }

  // ── 방문자 쾌적함(도착 표정 3개, 익명 서버 합계) → 어디가·언제·어떤 상황에서 아쉬운가 ──
  const COMFORT_MIN = 5;   // 응답이 이보다 적으면 '표본 적음'으로 흐리게
  const REASON_LABEL = { crowded: '붐빔', far: '멂', boring: '볼 게 별로', weather: '덥거나 추움', facility: '쉴 곳·화장실 부족', quiet: '한산함', view: '경치', rest: '쉬기 좋음', fun: '할 거리' };
  const BAD_REASONS = ['crowded', 'far', 'boring', 'weather', 'facility'];
  const BANDS = [['오전', 6, 11], ['점심', 11, 14], ['오후', 14, 17], ['저녁', 17, 21], ['밤', 21, 30]];
  const comfort = { days: 90, data: null, busy: false, failed: false };
  async function loadComfort() {
    comfort.busy = true; renderComfort();
    const d = await fetchComfort(comfort.days);
    Object.assign(comfort, { data: d, busy: false, failed: !d }); renderComfort();
  }
  function renderComfort() {
    const d = comfort.data, rate = c => (c?.n ? c.good / c.n : null);
    const pctTxt = c => (c?.n ? `${Math.round(c.good / c.n * 100)}%` : '–');
    const bar = c => h('div', { class: `cf-bar${c.n < COMFORT_MIN ? ' few' : ''}`, title: `좋아요 ${c.good} · 보통 ${c.mid} · 별로 ${c.bad}` },
      h('i', { class: 'g', style: `flex:${c.good}` }), h('i', { class: 'm', style: `flex:${c.mid}` }), h('i', { class: 'b', style: `flex:${c.bad}` }));
    const head = h('div', { class: 'part-head' }, h('span', { class: 'part-n' }, '4'), h('div', null, h('h2', null, '방문자 쾌적함'),
      h('p', null, '코스 찾기에서 도착한 곳마다 누른 표정(좋아요·보통·별로)과, 산책을 마친 뒤 코스 전체 흐름을 물은 답을 모았습니다. 거점·시간대·날씨·구간별로 어디가 아쉬운지 보고, 그늘·쉴 곳·동선 보완 근거로 씁니다.')));
    const ctrl = h('div', { class: 'nd-row' },
      segGroup([{ key: 7, label: '최근 7일' }, { key: 30, label: '30일' }, { key: 90, label: '90일' }, { key: 365, label: '1년' }], comfort.days, v => { comfort.days = v; loadComfort(); }, '기간'),
      h('button', { type: 'button', class: 'btn', disabled: comfort.busy, onclick: loadComfort }, comfort.busy ? '불러오는 중…' : '새로고침'));
    let body;
    if (!d) body = h('div', { class: 'assume' }, comfort.busy ? '불러오는 중…' : comfort.failed ? '서버(proxy/comfort)에 닿지 못했습니다. 잠시 뒤 새로고침해 보세요.' : '');
    else if (!d.total.n) body = h('div', { class: 'assume' }, `${d.since} 이후 모인 응답이 아직 없습니다. 방문자가 코스 찾기에서 표정을 누르면 여기에 쌓입니다.`);
    else {
      const name = id => app.model.hubById[id]?.name ?? id;
      const rows = Object.entries(d.places).sort((a, b) => (rate(a[1]) ?? 1) - (rate(b[1]) ?? 1) || b[1].n - a[1].n);
      const topBad = r => Object.entries(r.reasons).filter(([k]) => BAD_REASONS.includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${REASON_LABEL[k]} ${n}`).join(' · ');
      const placeTable = h('table', { class: 'cf-table' },
        h('thead', null, h('tr', null, h('th', null, '거점'), h('th', null, '응답'), h('th', null, '좋아요'), h('th', { class: 'w' }, '좋아요 · 보통 · 별로'), h('th', null, '많이 꼽힌 아쉬움'))),
        h('tbody', null, rows.map(([id, c]) => h('tr', { class: c.n < COMFORT_MIN ? 'few' : '' },
          h('td', null, name(id)), h('td', null, String(c.n)), h('td', null, h('b', null, pctTxt(c))), h('td', { class: 'w' }, bar(c)), h('td', { class: 'muted' }, topBad(c) || '–')))));
      const band = (byH, lo, hi) => { const c = { n: 0, good: 0, mid: 0, bad: 0 }; for (const [hr, x] of Object.entries(byH ?? {})) { const k = +hr < 6 ? +hr + 24 : +hr; if (k >= lo && k < hi) for (const f of ['n', 'good', 'mid', 'bad']) c[f] += x[f]; } return c; };
      const heat = c => { const r = rate(c); return r == null ? '' : r >= .7 ? 'hi' : r >= .45 ? 'md' : 'lo'; };
      const hourTable = h('table', { class: 'cf-table cf-heat' },
        h('thead', null, h('tr', null, h('th', null, '거점'), BANDS.map(([l]) => h('th', null, l)))),
        h('tbody', null, rows.map(([id]) => h('tr', null, h('td', null, name(id)), BANDS.map(([, lo, hi]) => { const c = band(d.byHour[id], lo, hi);
          return h('td', { class: `${heat(c)}${c.n && c.n < COMFORT_MIN ? ' few' : ''}`, title: c.n ? `${c.n}건` : '' }, c.n ? pctTxt(c) : '·'); })))));
      const pair = (label, a, aL, b, bL) => { const ra = rate(a), rb = rate(b), gap = ra != null && rb != null ? Math.round((ra - rb) * 100) : null;
        return h('div', { class: 'cf-pair' }, h('b', null, label),
          h('span', null, `${aL} ${pctTxt(a)}`, h('small', null, ` (${a.n}건)`)), h('span', null, `${bL} ${pctTxt(b)}`, h('small', null, ` (${b.n}건)`)),
          h('em', { class: gap != null && gap <= -10 ? 'down' : '' }, a.n >= COMFORT_MIN && b.n >= COMFORT_MIN && gap != null ? `${gap > 0 ? '+' : ''}${gap}%p` : '표본 적음')); };
      const cond = h('div', { class: 'cf-pairs' },
        pair('더위', d.cond.hot, '체감 31℃ 이상', d.cond.notHot, '그 밖'),
        pair('미세먼지', d.cond.dust, '초미세 36 이상', d.cond.clean, '그 밖'),
        pair('붐빔', d.cond.crowded, '붐빔·매우 붐빔', d.cond.calm, '여유·보통'));
      body = h('div', null,
        h('div', { class: 'cf-kpi' }, h('div', null, h('small', null, '응답'), h('b', null, `${d.total.n}건`)), h('div', null, h('small', null, '좋아요'), h('b', null, pctTxt(d.total))),
          h('div', { class: 'cf-kpi-bar' }, bar(d.total), h('small', null, `${d.since} ~ ${d.checked} 기준`))),
        h('div', { class: 'diag-title nd-mt' }, '거점별 ', h('span', { class: 'muted' }, '좋아요 비율이 낮은 곳부터')), placeTable,
        h('div', { class: 'diag-title nd-mt' }, '시간대별 좋아요 비율 ', h('span', { class: 'muted' }, '낮을수록 진한 주황 — 그 시간 그 자리에 그늘·쉴 곳·분산 안내가 필요한지 볼 곳')), hourTable,
        h('div', { class: 'diag-title nd-mt' }, '상황별 비교 ', h('span', { class: 'muted' }, '도착 당시 날씨·붐빔에 따라 좋아요 비율이 얼마나 떨어지나')), cond);
    }
    el.comfort.replaceChildren(head, h('section', { class: 'card card-pad' }, ctrl, body, d ? courseFlow(d.courses, pctTxt, bar, rate) : null,
      h('div', { class: 'assume' }, `응답 ${COMFORT_MIN}건 미만인 칸은 흐리게 보여 줍니다(우연일 수 있음). 이름·기기·위치·IP는 저장하지 않고 장소·표정·까닭·당시 체감온도·초미세먼지·붐빔·동행 유형만 모읍니다. 같은 기기에서 같은 곳은 30분에 한 번만 셉니다. 시연 날씨로 본 산책은 보내지 않습니다.`)));
  }

  // 코스 흐름: 마침 화면 '오늘 코스, 이어지는 흐름은 어땠어요?' 합계 → 어느 구간에서 흐름이 끊기는지(동선 보완 근거)
  const FLOW_LABEL = { smooth: '동선 자연스러움', varied: '볼거리 다양', rested: '쉬며 걷기 좋음', backtrack: '되돌아가는 길', norest: '중간에 쉴 곳 없음', samey: '비슷한 곳만', long: '너무 김', short: '너무 짧음' };
  const FLOW_BAD = ['backtrack', 'norest', 'samey', 'long', 'short'];
  const COURSE_NAME = { eco: '호숫가 지나 사슴 보러', bug: '나비·곤충 체험', lawn: '잔디마당 피크닉', calm: '북쪽 습지 조용한 산책' };
  const STAY_NAME = { 30: '30분', 60: '1시간', 120: '2시간', 180: '3시간 이상' };
  function courseFlow(c, pctTxt, bar, rate) {
    const title = h('div', { class: 'diag-title nd-mt' }, '코스 흐름 ', h('span', { class: 'muted' }, '산책을 마친 뒤 코스 전체를 한 번 물은 결과 — 장소 하나가 아니라 이어지는 동선을 봄'));
    if (!c?.total?.n) return h('div', null, title, h('div', { class: 'assume' }, '아직 코스 전체 응답이 없습니다. 방문자가 산책을 마치고 「오늘 코스, 이어지는 흐름은 어땠어요?」에 답하면 쌓입니다.'));
    const name = id => app.model.hubById[id]?.name ?? id;
    const reasons = Object.entries(c.reasons).sort((a, b) => b[1] - a[1]);
    const maxR = Math.max(1, ...reasons.map(r => r[1]));
    const legs = Object.entries(c.legs).sort((a, b) => (rate(a[1]) ?? 1) - (rate(b[1]) ?? 1) || b[1].n - a[1].n).slice(0, 10);
    const legBad = r => Object.entries(r.reasons).filter(([k]) => FLOW_BAD.includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${FLOW_LABEL[k]} ${n}`).join(' · ');
    const mini = (obj, label) => Object.entries(obj).map(([k, v]) => h('div', { class: `cf-pair${v.n < COMFORT_MIN ? ' few' : ''}` }, h('b', null, label(k)), h('span', null, `좋아요 ${pctTxt(v)}`, h('small', null, ` (${v.n}건)`)), bar(v)));
    return h('div', null, title,
      h('div', { class: 'cf-kpi' }, h('div', null, h('small', null, '코스 응답'), h('b', null, `${c.total.n}건`)), h('div', null, h('small', null, '좋아요'), h('b', null, pctTxt(c.total))), h('div', { class: 'cf-kpi-bar' }, bar(c.total))),
      reasons.length ? h('div', { class: 'cf-reasons nd-mt' }, reasons.map(([k, n]) => h('div', { class: `cf-reason${FLOW_BAD.includes(k) ? ' bad' : ''}` },
        h('span', null, FLOW_LABEL[k] ?? k), h('i', { style: `width:${Math.round(n / maxR * 100)}%` }), h('b', null, String(n))))) : null,
      h('div', { class: 'diag-title nd-mt' }, '구간별 ', h('span', { class: 'muted' }, '이어서 걸은 두 곳 — 좋아요 비율이 낮은 구간부터. 아쉬움이 몰린 구간이 동선·쉼터 보완 후보')),
      h('table', { class: 'cf-table' },
        h('thead', null, h('tr', null, h('th', null, '구간'), h('th', null, '응답'), h('th', null, '좋아요'), h('th', { class: 'w' }, '좋아요 · 보통 · 별로'), h('th', null, '많이 꼽힌 아쉬움'))),
        h('tbody', null, legs.map(([k, v]) => { const [a, b] = k.split('>'); return h('tr', { class: v.n < COMFORT_MIN ? 'few' : '' },
          h('td', null, `${name(a)} → ${name(b)}`), h('td', null, String(v.n)), h('td', null, h('b', null, pctTxt(v))), h('td', { class: 'w' }, bar(v)), h('td', { class: 'muted' }, legBad(v) || '–')); }))),
      h('div', { class: 'diag-title nd-mt' }, '머문 시간별 · 추천 코스별'),
      h('div', { class: 'cf-pairs' }, ...mini(c.byStay, k => STAY_NAME[k] ?? `${k}분`), ...mini(c.byCourse, k => COURSE_NAME[k] ?? k)));
  }

  // ── 현장 조사로 시설 추가 ──
  function renderSurvey() {
    const pts = app.extra;
    el.survey.replaceChildren(card('현장 조사로 시설 추가', '지도에 없는 벤치·쉼터·화장실을 넣어 진단을 바로잡기', h('div', null,
      h('div', { class: 'nd-row' }, segGroup(SURVEY_KINDS, st.addKind, v => set({ addKind: v }), '넣을 시설'),
        h('button', { type: 'button', class: `btn${st.addMode ? ' btn-primary' : ''}`, 'aria-pressed': st.addMode, onclick: () => set({ addMode: !st.addMode }) }, icon('plus', 15), st.addMode ? '지도를 눌러 넣는 중 — 끝내기' : '지도를 눌러 넣기')),
      pts.length ? h('div', { class: 'list nd-mt' }, pts.map((p, i) => { const [x, y] = toXY(p.lon, p.lat); return h('div', { class: 'row' },
        h('span', { class: `nd-mk nd-mk-fac nd-f-${p.kind === 'toilet' ? 'toilet' : p.kind === 'water' ? 'water' : 'seat'}` }, icon(p.kind === 'toilet' ? 'toilet' : p.kind === 'water' ? 'water' : 'bench', 13)),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, FAC_LABEL[p.kind] ?? '알 수 없는 시설(계산에서 뺌)'), h('div', { class: 'row-sub' }, nearLabel(app.model, x, y))),
        h('button', { type: 'button', class: 'btn', 'aria-label': '지우기', onclick: () => app.setExtra(pts.filter((_, j) => j !== i)) }, icon('trash', 15))); }))
        : h('div', { class: 'assume' }, '아직 넣은 시설이 없습니다. 현장에서 본 벤치를 넣어 보세요.'),
      h('div', { class: 'nd-row nd-mt' },
        h('button', { type: 'button', class: 'btn', disabled: !pts.length, onclick: () => download('survey.json', JSON.stringify({ note: '현장 조사로 확인한 시설', saved: new Date().toISOString().slice(0, 10), points: pts }, null, 1)) }, icon('download', 15), '조사 자료 내려받기'),
        h('button', { type: 'button', class: 'btn', disabled: !pts.length, onclick: () => { if (confirm('넣은 시설을 모두 지울까요?')) app.setExtra([]); } }, '모두 지우기')),
      h('div', { class: 'assume' }, '넣은 시설은 이 브라우저에만 저장됩니다. 모든 방문자 화면에 반영하려면 내려받은 survey.json을 needs/data/survey.json으로 바꿔 올리세요.'))));
  }

  // ── AI ──
  const dataNow = () => briefData(app.model, diag, plan);
  function resetAI() { ai.ctl?.abort(); Object.assign(ai, { busy: false, messages: [], log: [], live: '', err: null, ctl: null }); }
  async function ask(task, shown) {
    if (ai.busy) return;
    if (!ai.key) { ai.err = 'API 키를 먼저 넣어 주세요.'; return renderAI(); }
    ai.messages.push({ role: 'user', content: ai.messages.length ? task : firstMessage(dataNow(), task) });
    ai.log.push({ who: 'me', text: shown });
    Object.assign(ai, { busy: true, live: '', err: null, ctl: new AbortController() });
    renderAI();
    try {
      const res = await askAI({ apiKey: ai.key, messages: ai.messages, signal: ai.ctl.signal, onText: t => { ai.live = t; paintLive(); } });
      ai.messages.push({ role: 'assistant', content: res.text });
      ai.log.push({ who: 'ai', text: res.text, note: (res.fallback ? `다른 모델(${res.model})이 이어서 답했습니다. ` : '') + (res.stopReason === 'max_tokens' ? '답이 길어 중간에 끊겼습니다.' : '') });
    } catch (err) {
      ai.messages.pop(); ai.log.pop();
      ai.err = err instanceof AIError ? err.message : `알 수 없는 오류: ${err.message}`;
    }
    Object.assign(ai, { busy: false, live: '', ctl: null });
    renderAI();
  }
  let liveEl = null;
  const paintLive = () => { if (liveEl) liveEl.replaceChildren(ai.live ? md(ai.live) : h('p', { class: 'muted' }, '생각하는 중…')); };
  function renderAI() {
    const rule = ruleSummary(app.model, diag, plan);
    // 키는 입력하는 대로 받아 두고(다시 그려도 남음), 보고를 만들거나 '기억'을 바꿀 때 저장합니다
    const commitKey = () => { ai.key = (ai.draft ?? ai.key).trim(); ai.draft = null; if (ai.key) keyStore.set(ai.key, ai.remember); else keyStore.clear(); };
    const keyIn = h('input', { type: 'password', class: 'nd-input', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false', value: ai.draft ?? ai.key, 'aria-label': 'Anthropic API 키',
      oninput: ev => { ai.draft = ev.target.value; }, onchange: commitKey });
    const remember = h('input', { type: 'checkbox', checked: ai.remember, onchange: ev => { ai.remember = ev.target.checked; commitKey(); } });
    const q = h('input', { type: 'text', class: 'nd-input', placeholder: '예: 예산이 벤치 5개뿐이면 어디부터 놓아야 하나요?', 'aria-label': 'AI에게 물을 것', onkeydown: ev => { if (ev.key === 'Enter' && q.value.trim()) ask(q.value.trim(), q.value.trim()); } });
    liveEl = h('div', { class: 'nd-ai-msg ai' });
    el.ai.replaceChildren(card('AI에게 맡기기', '진단 결과를 읽고 보고와 답을 써 줍니다', h('div', null,
      h('div', { class: 'insight nd-rule' }, icon('info', 18), h('div', null, h('b', null, '계산으로 뽑은 요약 (AI 없이도 보임)'), rule.map(t => h('p', null, t)))),
      h('div', { class: 'nd-ai-key' },
        h('label', { class: 'nd-field' }, h('span', { class: 'cond-l' }, icon('key', 13), ' Anthropic API 키'), keyIn),
        h('label', { class: 'toggle' }, remember, '이 브라우저에 기억'),
        ai.key ? h('button', { type: 'button', class: 'btn', onclick: () => { keyStore.clear(); Object.assign(ai, { key: '', draft: null, remember: false, err: null }); renderAI(); } }, icon('trash', 15), '키 지우기') : null),
      h('div', { class: 'nd-row nd-mt' },
        h('button', { type: 'button', class: 'btn btn-primary', disabled: ai.busy, onclick: () => { commitKey(); resetAI(); ask(REPORT_TASK, '이 진단으로 관리자용 보고를 써 주세요.'); } }, icon('spark', 15), 'AI 보고 만들기'),
        ai.busy ? h('button', { type: 'button', class: 'btn', onclick: () => ai.ctl?.abort() }, '멈추기') : null,
        ai.log.length && !ai.busy ? h('button', { type: 'button', class: 'btn', onclick: () => { resetAI(); renderAI(); } }, '대화 지우기') : null),
      ai.err ? h('div', { class: 'notice nd-warn nd-mt' }, icon('alert', 16), ai.err) : null,
      ai.log.length || ai.busy ? h('div', { class: 'nd-ai-log' },
        ai.log.map(m => h('div', { class: `nd-ai-msg ${m.who}` }, m.who === 'ai' ? md(m.text) : m.text, m.note ? h('p', { class: 'xs muted' }, m.note) : null)),
        ai.busy ? liveEl : null) : null,
      ai.log.length && !ai.busy ? h('div', { class: 'nd-row nd-mt' }, q, h('button', { type: 'button', class: 'btn', onclick: () => { if (q.value.trim()) ask(q.value.trim(), q.value.trim()); } }, icon('send', 15), '묻기')) : null,
      h('details', { class: 'nd-ai-data' }, h('summary', null, 'AI에 보내는 자료 보기'), h('pre', null, JSON.stringify(dataNow(), null, 1))),
      h('div', { class: 'assume' }, `모델 ${AI.model} · 키는 이 브라우저에만 저장되고 Anthropic API로만 보냅니다(기억을 끄면 탭을 닫을 때 지워짐). 보내는 것은 위 집계 자료와 질문뿐이며, 요금은 키 주인의 계정에 붙습니다. 공용 컴퓨터에서는 기억을 끄세요. 모델이 답을 거절하면 Anthropic이 정한 다른 모델이 이어서 답하도록 해 두었습니다. AI의 답은 참고용이며 수치는 위 계산 결과가 기준입니다.`))));
    if (ai.busy) paintLive();
  }

  // ── 지도 ──
  function drawMap() {
    const d = current(), m = app.model, reason = REST_REASONS.find(r => r.key === st.reason);
    const ramp = RAMP.map(cssVar), rc = cssVar(reason.color);
    view.cells(id => {
      const r = d.byId.get(id);
      if (!r) return null;
      if (st.layer === 'legal') return r.c.legal ? { fill: LEGAL_COLOR[r.c.legal], opacity: r.hard ? .75 : .4 } : null;
      if (st.layer === 'reason') return r.fails.includes(st.reason) ? { fill: rc, opacity: .62 } : null;
      return r.n ? { fill: ramp[r.n - 1], opacity: r.hard ? .78 : .4 } : null;
    }, (id, latlng) => { if (st.addMode) addPoint(latlng.lat, latlng.lng); else set({ sel: st.sel === id ? null : id }); });
    view.selectCell(st.sel);
    // 법적 구역 보기: 격자 밖(습지생태원·정수장)까지 구역 경계를 흐리게 깔아 둡니다
    view.zones(st.layer === 'legal' ? k => LEGAL_COLOR[k] ?? null : null);
    view.markers('fac', st.showFac ? m.fac.map(f => { const k = f.kind === 'toilet' ? 'toilet' : f.kind === 'water' ? 'water' : 'seat';
      return { lat: f.lat, lon: f.lon, size: 20, cls: `nd-mk-fac nd-f-${k}${f.surveyed ? ' surveyed' : ''}`, html: mk(k === 'toilet' ? 'toilet' : k === 'water' ? 'water' : 'bench', 12), tip: `${esc(f.name || FAC_LABEL[f.kind])}${f.surveyed ? ' · 현장 조사로 더함' : ''}` }; }) : []);
    view.markers('sites', st.showSites ? KINDS.flatMap(k => plan.sites[k.key].map((s, i) => ({ lat: s.lat, lon: s.lon, size: 26, cls: `nd-mk-site nd-s-${k.key}`, html: String(i + 1), z: 400,
      tip: `<b>${k.label} 제안 ${i + 1}</b><br>${esc(s.label)}` }))) : []);
    view.markers('team', st.showTeam ? (m.data.team.addedRest ?? []).map(([lat, lon]) => ({ lat, lon, size: 18, cls: 'nd-mk-team', html: '', tip: '팀이 앞서 제안한 쉼터 자리' })) : []);
    view.cursor(st.addMode ? 'crosshair' : null);
    const Lz = m.legal;
    el.legend.replaceChildren(
      st.layer === 'legal' && Lz
        ? h('div', null, h('div', { class: 'legend' }, Object.keys(Lz.zones).filter(k => Lz.areaM2?.[k]).map(k => h('span', null, h('i', { style: { background: LEGAL_COLOR[k] } }), Lz.zones[k].label))),
            h('div', { class: 'legend' }, h('span', { class: 'muted' }, '진한 칸 = 쉬기 어려운 곳 · 칸을 누르면 적용 법과 관리 주체')))
        : st.layer === 'count'
        ? h('div', null, h('div', { class: 'legend-ramp' }, ramp.map(c => h('span', { style: { background: c } }))), h('div', { class: 'legend' }, h('span', null, '모자란 가짓수 1 → 4'), h('span', { class: 'muted' }, '진한 칸 = 쉬기 어려운 곳(2가지 이상)')))
        : h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: rc } }), `${reason.label} (${d.summary.byReason[st.reason].n}칸)`)),
      h('div', { class: 'legend nd-legend2' }, h('span', null, h('i', { class: 'nd-s-bench' }), '벤치 제안'), h('span', null, h('i', { class: 'nd-s-shade' }), '그늘 제안'), h('span', null, h('i', { class: 'nd-s-toilet' }), '화장실 제안'),
        h('span', null, h('i', { class: 'nd-f-toilet' }), '화장실'), h('span', null, h('i', { class: 'nd-f-seat' }), '앉을 곳')));
  }
  function addPoint(lat, lon) {
    if (!app.model.inPark(lon, lat)) return alert('공원 안을 눌러 주세요.');
    app.setExtra([...app.extra, { id: `s${Date.now()}`, kind: st.addKind, lat: +lat.toFixed(6), lon: +lon.toFixed(6) }]);
  }

  let memo = { key: null, model: null };
  function update() {
    if (!app.model) return;
    // 진단과 자리 계산은 기준·개수·시설이 바뀔 때만 다시 합니다(칸을 고르거나 지도 보기를 바꿀 때는 그대로)
    const key = `${st.std}|${JSON.stringify(st.counts)}`;
    if (memo.key !== key || memo.model !== app.model) {
      diag = diagnose(app.model, st.std);
      plan = siteFacilities(app.model, diag, st.counts);
      memo = { key, model: app.model };
    }
    const stamp = `${st.std}|${JSON.stringify(st.counts)}|${app.extra.length}|${app.model.fac.length}`;
    if (stamp !== ai.stamp) { if (ai.stamp && ai.log.length) { resetAI(); ai.err = '진단이 바뀌어 AI 대화를 새로 시작합니다.'; } ai.stamp = stamp; }
    renderHead(); renderCtrl(); renderSide(); renderSites(); renderNews(); renderSurvey();
    if (!ai.busy) renderAI();
    if (view) drawMap();
  }

  return {
    update,
    show() {
      if (!view) { view = createMap(el.map, app.model); view.onClick((lat, lon) => { if (st.addMode) addPoint(lat, lon); }); loadComfort(); }
      view.invalidate(); update();
    },
    theme() { view?.restyle(); if (view) update(); },
    state: st,
    get view() { return view; },
  };
}
