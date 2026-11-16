// 관리자 화면: 쉬기 어려운 곳과 이유(지도), 벤치·그늘·화장실이 필요한 자리, 현장 조사 입력, AI 도우미
import { REST_STD, REST_REASONS, HARD_FROM, SITE_DEFAULT, AI, LEGAL_COLOR } from './config.js';
import { diagnose, siteFacilities, ruleSummary, briefData, nearLabel, siteZone, needsPermit, permitSites } from './rest.js';
import { FAC_LABEL } from './model.js';
import { toXY } from './geo.js';
import { askAI, keyStore, firstMessage, REPORT_TASK, AIError } from './ai.js';
import { createMap, mk } from './mapview.js';
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

  const el = { head: h('div'), ctrl: h('div'), side: h('div', { class: 'nd-side' }), sites: h('div'), survey: h('div'), ai: h('div'), legend: h('div', { class: 'map-legend' }), map: h('div', { class: 'map' }) };
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
    renderHead(); renderCtrl(); renderSide(); renderSites(); renderSurvey();
    if (!ai.busy) renderAI();
    if (view) drawMap();
  }

  return {
    update,
    show() {
      if (!view) { view = createMap(el.map, app.model); view.onClick((lat, lon) => { if (st.addMode) addPoint(lat, lon); }); }
      view.invalidate(); update();
    },
    theme() { view?.restyle(); if (view) update(); },
    state: st,
    get view() { return view; },
  };
}
