/* 운영 관제 「도시 흐름」 — 서울숲을 가운데 두고, 도시에서 서울숲으로 들어오는 흐름을 보여 주는 덧붙임 카드.
 *  ① 흐름 지도: 서울숲(주인공) + 주변 도로 소통(색) + 서울숲역 하차 인원(화살표 굵기) + 주변 장소 혼잡도
 *  ② 곧 붐벼요: 서울시 혼잡 예측(FCST_PPLTN) + 역 하차 급증 규칙으로 30분~1시간 뒤를 미리 알림
 *  ③ 자동 판단 기록: 실시간 자료가 기준을 넘을 때 시스템이 내린 판단을 시간순으로 남김
 * 자료: 서울시 실시간 도시데이터(중계 서버 seoul-flow), Open-Meteo 날씨·대기질.
 * ops/index.html 본체는 건드리지 않고, 오른쪽 패널(#side)에 섹션 하나만 끼워 넣는다. */
(function () {
  'use strict';
  var FLOW_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-flow';
  var WX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=37.5444&longitude=127.0374&current=apparent_temperature,precipitation&timezone=Asia%2FSeoul';
  var AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=37.5444&longitude=127.0374&current=pm2_5&timezone=Asia%2FSeoul';
  var REFRESH = 5 * 60 * 1000;
  var LOG_KEY = 'ops.cityflow.log.v1';
  // 주변 장소 표시 위치(대략, 라벨용) — 서울시 장소 경계의 정확한 중심은 아님 (검증 필요)
  var NEAR_POS = { '성수카페거리': [37.5446, 127.0559], '뚝섬역': [37.5474, 127.0473], '뚝섬한강공원': [37.5296, 127.0673] };
  var LV = ['여유', '보통', '약간 붐빔', '붐빔'];
  var LV_C = { '여유': '#6af5b0', '보통': '#f5d58a', '약간 붐빔': '#ffc978', '붐빔': '#ff9b8a' };
  var RD_C = { '원활': 'rgba(106,245,176,.55)', '서행': '#ffc978', '정체': '#ff7a66' };
  // 기준값: 체감온도 31/33℃, PM2.5 36/76㎍/㎥는 주제서 예시값 — 최종 확정 시 근거 필요 (검증 필요)
  var HEAT = [31, 33], PM = [36, 76];
  // 하차 급증: 최근 10분 하차 ≥ 80명이면서 그 앞 20분의 10분 평균의 1.5배 이상 — 이용자 화면(tour.js)과 같은 잠정 규칙 (검증 필요)
  var SURGE_MIN = 80, SURGE_X = 1.5;

  var PARK = null, side = null, box = null;

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mid(r) { return r ? (r[0] + r[1]) / 2 : null; }
  function rng(r) { return r ? (r[0] === r[1] ? r[0] : r[0] + '~' + r[1]) : '—'; }
  function hm(s) { var m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; }
  function J(u) { var c = new AbortController(); var t = setTimeout(function () { c.abort(); }, 12000); return fetch(u, { signal: c.signal, cache: 'no-cache' }).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); }); }

  /* ---------- 스타일 ---------- */
  var css = '' +
    '.cf{margin:18px 0 6px;padding:14px;border-radius:var(--r-md,18px);background:var(--glass-2,rgba(255,255,255,.03));border:1px solid var(--line,rgba(255,255,255,.08))}' +
    '.cf h3{margin:0 0 2px;font-size:13px;font-weight:700;display:flex;align-items:baseline;gap:8px}' +
    '.cf h3 small{margin-left:auto;font-size:10.5px;font-weight:500;color:var(--mute)}' +
    '.cf .sub{font-size:11px;color:var(--mute);margin:0 0 10px}' +
    '.cf svg.cfm{display:block;width:100%;height:auto;border-radius:12px;background:#07100c;border:1px solid var(--line)}' +
    '.cf svg.cfm text{font-family:var(--font);paint-order:stroke;stroke:#07100c;stroke-width:3px;stroke-linejoin:round}' +
    '.cf .lg{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:10.5px;color:var(--mute);margin:7px 0 0}' +
    '.cf .lg i{display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:4px;vertical-align:middle}' +
    '.cf .fc{margin-top:12px;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.02)}' +
    '.cf .fc.up{border-color:rgba(255,201,120,.45);background:rgba(255,201,120,.07)}' +
    '.cf .fc b{display:block;font-size:14px;margin-bottom:4px}' +
    '.cf .fc ul{margin:0;padding-left:16px;font-size:11.5px;color:var(--ink-2,rgba(241,247,243,.75));line-height:1.55}' +
    '.cf .fcbar{display:flex;gap:2px;margin:8px 0 2px;height:22px;align-items:flex-end}' +
    '.cf .fcbar span{flex:1;border-radius:3px 3px 0 0;position:relative}' +
    '.cf .fcx{display:flex;justify-content:space-between;font-size:9.5px;color:var(--mute)}' +
    '.cf .log{margin:12px 0 0;padding:0;list-style:none;max-height:210px;overflow:auto;scrollbar-width:thin}' +
    '.cf .log li{display:grid;grid-template-columns:40px 1fr;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:11.5px;line-height:1.45}' +
    '.cf .log li time{color:var(--mute);font-size:11px;padding-top:1px}' +
    '.cf .log li b{font-weight:650}' +
    '.cf .log li span{display:block;color:var(--mute);font-size:11px}' +
    '.cf .log li.w b{color:var(--warn,#ffc978)}.cf .log li.bad b{color:var(--bad,#ff9b8a)}.cf .log li.ok b{color:var(--mint,#6af5b0)}' +
    '.cf .src{font-size:10px;color:var(--mute);margin:10px 0 0;line-height:1.5}';

  /* ---------- 흐름 지도 (SVG) ---------- */
  function drawMap(d) {
    var pts = [];
    d.roads.forEach(function (r) { r.path.forEach(function (p) { pts.push(p); }); });
    var parkRings = [];
    if (PARK) PARK.features.forEach(function (f) { var g = f.geometry; (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(function (pg) { var ring = pg[0].map(function (q) { return [q[1], q[0]]; }); parkRings.push(ring); ring.forEach(function (p) { pts.push(p); }); }); });
    ['성수카페거리', '뚝섬역'].forEach(function (k) { pts.push(NEAR_POS[k]); });
    if (!pts.length) return '';
    var la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
    pts.forEach(function (p) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); });
    var k = Math.cos(37.545 * Math.PI / 180), W = 360, pad = 16;
    var sx = (W - pad * 2) / ((lo1 - lo0) * k), H = Math.round((la1 - la0) * sx + pad * 2);
    function P(p) { return [pad + (p[1] - lo0) * k * sx, pad + (la1 - p[0]) * sx]; }
    function clampP(p) { var q = P(p); return [Math.max(10, Math.min(W - 10, q[0])), Math.max(10, Math.min(H - 10, q[1]))]; }
    function path(arr) { return arr.map(function (p, i) { var q = P(p); return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(''); }
    var s = '<svg class="cfm" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="서울숲 주변 도로 소통과 역 하차 흐름 지도">';
    s += '<defs><marker id="cfA" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0L10 5L0 10z" fill="#6af5b0"/></marker></defs>';
    // 공원 중심
    var pc = [0, 0], n = 0; parkRings.forEach(function (r) { r.forEach(function (p) { pc[0] += p[0]; pc[1] += p[1]; n++; }); });
    pc = n ? [pc[0] / n, pc[1] / n] : [37.5444, 127.0374];
    var C = P(pc), lvl = d.park && d.park.level, lc = LV_C[lvl] || '#6af5b0';
    // 주변 장소 ↔ 서울숲 연결선 (도시 맥락, 흐리게)
    var near = (d.near || []).map(function (a) { var pos = NEAR_POS[a.name]; return pos ? { a: a, q: clampP(pos), off: !inBox(pos) } : null; }).filter(Boolean);
    function inBox(p) { return p[0] >= la0 && p[0] <= la1 && p[1] >= lo0 && p[1] <= lo1; }
    near.forEach(function (o) { s += '<line x1="' + C[0].toFixed(1) + '" y1="' + C[1].toFixed(1) + '" x2="' + o.q[0].toFixed(1) + '" y2="' + o.q[1].toFixed(1) + '" stroke="rgba(255,255,255,.14)" stroke-dasharray="2 4"/>'; });
    // 도로 (도시는 배경 — 얇게)
    d.roads.forEach(function (r) { s += '<path d="' + path(r.path) + '" fill="none" stroke="' + (RD_C[r.idx] || 'rgba(255,255,255,.3)') + '" stroke-width="' + (r.idx === '정체' ? 2.4 : 1.6) + '" stroke-linecap="round"><title>' + esc(r.name + ' ' + r.from + '→' + r.to + ' · ' + r.idx + ' ' + (r.speed != null ? r.speed + 'km/h' : '')) + '</title></path>'; });
    // 서울숲 (주인공)
    parkRings.forEach(function (r) { s += '<path d="' + path(r) + 'Z" fill="' + lc + '" fill-opacity=".2" stroke="' + lc + '" stroke-width="1.8"/>'; });
    // 서울숲역 하차 → 공원 화살표 (굵기 = 최근 10분 하차)
    var off = mid(d.subFlow && d.subFlow.off10);
    (d.stations || []).forEach(function (st) {
      if (st.lat == null) return;
      var a = P([st.lat, st.lon]), dx = C[0] - a[0], dy = C[1] - a[1], L = Math.hypot(dx, dy) || 1, len = Math.min(L * .55, 46);
      var b = [a[0] + dx / L * len, a[1] + dy / L * len], w = off == null ? 2 : Math.max(2, Math.min(11, off / 30));
      s += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" stroke="#6af5b0" stroke-width="' + w.toFixed(1) + '" stroke-linecap="round" marker-end="url(#cfA)" opacity=".9"/>';
      s += '<circle cx="' + a[0].toFixed(1) + '" cy="' + a[1].toFixed(1) + '" r="4" fill="#07100c" stroke="#fff" stroke-width="1.5"/>';
      s += '<text x="' + (a[0] + 7).toFixed(1) + '" y="' + (a[1] + 15).toFixed(1) + '" font-size="10" fill="#f1f7f3">' + esc(st.name) + '역 하차 ' + esc(rng(d.subFlow && d.subFlow.off10)) + '명/10분</text>';
    });
    // 주변 장소 점
    near.forEach(function (o) {
      var c = LV_C[o.a.level] || '#aaa', right = o.q[0] > W - 90;
      s += '<circle cx="' + o.q[0].toFixed(1) + '" cy="' + o.q[1].toFixed(1) + '" r="4.5" fill="' + c + '"/>';
      s += '<text x="' + (o.q[0] + (right ? -7 : 7)).toFixed(1) + '" y="' + (o.q[1] - 6).toFixed(1) + '" font-size="9.5" fill="rgba(241,247,243,.75)" text-anchor="' + (right ? 'end' : 'start') + '">' + esc(o.a.name) + (o.off ? ' ↘' : '') + ' · ' + esc(o.a.level) + '</text>';
    });
    // 서울숲 라벨
    s += '<text x="' + C[0].toFixed(1) + '" y="' + (C[1] - 4).toFixed(1) + '" font-size="15" font-weight="800" fill="#fff" text-anchor="middle">서울숲</text>';
    if (d.park) s += '<text x="' + C[0].toFixed(1) + '" y="' + (C[1] + 12).toFixed(1) + '" font-size="10.5" font-weight="700" fill="' + lc + '" text-anchor="middle">' + esc(lvl) + ' · ' + esc(rng([d.park.min, d.park.max])) + '명</text>';
    return s + '</svg>';
  }

  /* ---------- 곧 붐벼요 ---------- */
  function surge(sf) {
    if (!sf || !sf.off10 || !sf.off30) return null;
    var now = mid(sf.off10), before = (mid(sf.off30) - now) / 2;   // 그 앞 20분의 10분당 평균
    return { now: now, before: before, hit: now >= SURGE_MIN && before > 0 && now >= before * SURGE_X };
  }
  function forecast(d) {
    var p = d.park; if (!p) return '';
    var cur = LV.indexOf(p.level), f = (p.forecast || []).slice(0, 6), up = null;
    f.forEach(function (x, i) { if (up == null && LV.indexOf(x.level) > cur) up = { x: x, h: i + 1 }; });
    var sg = surge(d.subFlow), why = [], head;
    if (up) why.push('서울시 예측: ' + hm(up.x.time) + '쯤 「' + up.x.level + '」로 올라감 (' + rng([up.x.min, up.x.max]) + '명)');
    if (sg && sg.hit) why.push('서울숲역 하차가 평소보다 많음: 최근 10분 약 ' + Math.round(sg.now) + '명, 그 앞 10분 평균 약 ' + Math.round(sg.before) + '명 → 10~20분 뒤 역 쪽 입구부터 붐빌 수 있음');
    var hot = up || (sg && sg.hit);
    if (sg && sg.hit) head = '곧 붐벼요 · 10~20분 뒤 역 쪽 입구';
    else if (up) head = '곧 붐벼요 · ' + (up.h === 1 ? '1시간 안' : up.h + '시간 뒤') + ' 「' + up.x.level + '」';
    else head = '당분간 지금과 비슷해요 · 「' + p.level + '」 유지 예상';
    if (!hot) why.push('서울시 6시간 예측에서 지금보다 붐비는 시간이 없음');
    if (sg && !sg.hit) why.push('서울숲역 하차 최근 10분 약 ' + Math.round(sg.now) + '명 — 급증 아님');
    var bars = f.map(function (x) { var i = LV.indexOf(x.level); return '<span style="height:' + (30 + i * 23) + '%;background:' + (LV_C[x.level] || '#555') + '" title="' + esc(hm(x.time) + ' ' + x.level) + '"></span>'; }).join('');
    var xs = f.length ? '<div class="fcx"><span>' + esc(hm(f[0].time)) + '</span><span>' + esc(hm(f[f.length - 1].time)) + '</span></div>' : '';
    return '<div class="fc' + (hot ? ' up' : '') + '"><b>' + esc(head) + '</b><ul>' + why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' + (bars ? '<div class="fcbar">' + bars + '</div>' + xs : '') + '</div>';
  }

  /* ---------- 자동 판단 기록 ---------- */
  function judge(d, wx, aq) {
    var out = [], t = d.park && hm(d.park.time);
    if (wx && wx.current) {
      var at = wx.current.apparent_temperature, pr = wx.current.precipitation, wt = hm(wx.current.time);
      if (at >= HEAT[1]) out.push({ key: 'heat', st: 2, cls: 'bad', t: wt, b: '체감 ' + at.toFixed(1) + '℃ (≥' + HEAT[1] + ') → 야외 프로그램 중단, 실내 코스 전환', s: '곤충식물원·나비정원 등 실내 대체시설 안내' });
      else if (at >= HEAT[0]) out.push({ key: 'heat', st: 1, cls: 'w', t: wt, b: '체감 ' + at.toFixed(1) + '℃ (≥' + HEAT[0] + ') → 그늘 코스로 전환', s: '그늘 많은 숲길 우선 추천, 쿨링 쉼터 안내' });
      else out.push({ key: 'heat', st: 0, cls: 'ok', t: wt, b: '체감 ' + at.toFixed(1) + '℃ → 평소 코스 유지', s: '폭염 기준(' + HEAT[0] + '℃) 아래' });
      if (pr > 0) out.push({ key: 'rain', st: 1, cls: 'w', t: wt, b: '비 ' + pr + 'mm → 실내·지붕 있는 곳 위주 안내', s: '잔디·흙길 코스 제외' });
      else out.push({ key: 'rain', st: 0, cls: 'ok', t: wt, b: '비 없음 → 야외 코스 가능', s: '' });
    }
    if (aq && aq.current && aq.current.pm2_5 != null) {
      var pm = aq.current.pm2_5, at2 = hm(aq.current.time);
      if (pm >= PM[1]) out.push({ key: 'pm', st: 2, cls: 'bad', t: at2, b: '초미세먼지 ' + Math.round(pm) + '㎍/㎥ (≥' + PM[1] + ') → 실내 코스 전환', s: '격한 활동 프로그램 중단' });
      else if (pm >= PM[0]) out.push({ key: 'pm', st: 1, cls: 'w', t: at2, b: '초미세먼지 ' + Math.round(pm) + '㎍/㎥ (≥' + PM[0] + ') → 노약자 실내 권고', s: '야외 체험 프로그램 축소' });
      else out.push({ key: 'pm', st: 0, cls: 'ok', t: at2, b: '초미세먼지 ' + Math.round(pm) + '㎍/㎥ → 야외 활동 가능', s: '' });
    }
    if (d.park) {
      var li = LV.indexOf(d.park.level);
      out.push({ key: 'crowd', st: li, cls: li >= 2 ? 'w' : 'ok', t: t, b: '서울숲 「' + d.park.level + '」 ' + rng([d.park.min, d.park.max]) + '명' + (li >= 2 ? ' → 덜 붐비는 구역으로 코스 분산' : ' → 분산 안내 없음'), s: li >= 2 ? '붐비는 거점은 추천 순위 낮춤' : '' });
    }
    var sg = surge(d.subFlow);
    if (sg) out.push({ key: 'surge', st: sg.hit ? 1 : 0, cls: sg.hit ? 'w' : 'ok', t: hm(d.fetched ? new Date(d.fetched).toTimeString() : ''), b: sg.hit ? '서울숲역 하차 급증 → 역 쪽 입구 혼잡 경보' : '서울숲역 하차 평소 수준', s: sg.hit ? '다른 입구·덜 붐비는 거점으로 안내' : '최근 10분 약 ' + Math.round(sg.now) + '명' });
    if (d.roads && d.roads.length) {
      var jam = d.roads.filter(function (r) { return r.idx === '정체'; }).length / d.roads.length;
      out.push({ key: 'road', st: jam >= .3 ? 1 : 0, cls: jam >= .3 ? 'w' : 'ok', t: hm(d.roadAvg && d.roadAvg.time), b: '주변 도로 정체 ' + Math.round(jam * 100) + '%' + (jam >= .3 ? ' → 대중교통 이용 안내' : ' → 차량 안내 없음'), s: jam >= .3 ? '주차장 만차 가능성, 서울숲역·뚝섬역 안내' : '' });
    }
    return out;
  }
  function loadLog() { try { var v = JSON.parse(localStorage.getItem(LOG_KEY) || 'null'); if (v && v.day === new Date().toDateString()) return v; } catch (e) {} return { day: new Date().toDateString(), last: {}, items: [] }; }
  function saveLog(v) { try { localStorage.setItem(LOG_KEY, JSON.stringify(v)); } catch (e) {} }
  function record(list) {
    var lg = loadLog(), first = !Object.keys(lg.last).length;
    list.forEach(function (j) {
      if (lg.last[j.key] === j.st) return;                 // 상태가 바뀔 때만 기록
      if (first && j.st === 0 && j.key !== 'heat' && j.key !== 'crowd') { lg.last[j.key] = j.st; return; }   // 첫 화면은 핵심만
      lg.last[j.key] = j.st;
      lg.items.unshift({ t: j.t || hm(new Date().toTimeString()), b: j.b, s: j.s, cls: j.cls });
    });
    lg.items.sort(function (a, b) { return a.t < b.t ? 1 : a.t > b.t ? -1 : 0; });   // 최신 시각이 위로
    lg.items = lg.items.slice(0, 40); saveLog(lg);
    return lg.items;
  }
  function logHtml(items) {
    if (!items.length) return '<ul class="log"><li><time></time><div>아직 기록 없음</div></li></ul>';
    return '<ul class="log">' + items.map(function (i) { return '<li class="' + i.cls + '"><time>' + esc(i.t) + '</time><div><b>' + esc(i.b) + '</b>' + (i.s ? '<span>' + esc(i.s) + '</span>' : '') + '</div></li>'; }).join('') + '</ul>';
  }

  /* ---------- 조립 ---------- */
  function mount() {
    side = $('#side'); if (!side || $('#cityFlow')) return !!side;
    var st = el('style'); st.textContent = css; document.head.appendChild(st);
    box = el('section', 'cf'); box.id = 'cityFlow'; box.setAttribute('aria-live', 'polite');
    box.innerHTML = '<h3>도시 흐름 → 서울숲 <small>불러오는 중…</small></h3>';
    var anchor = side.querySelector('section.sec');
    side.insertBefore(box, anchor || null);
    return true;
  }
  function render(d, wx, aq) {
    if (!box) return;
    var items = record(judge(d, wx, aq));
    box.innerHTML =
      '<h3>도시 흐름 → 서울숲 <small>' + esc(hm(d.park && d.park.time) || '') + ' 기준 · 5분마다</small></h3>' +
      '<p class="sub">성수 일대에서 서울숲으로 들어오는 사람·차의 흐름</p>' +
      drawMap(d) +
      '<div class="lg"><span><i style="background:' + RD_C['원활'] + '"></i>원활</span><span><i style="background:' + RD_C['서행'] + '"></i>서행</span><span><i style="background:' + RD_C['정체'] + '"></i>정체</span><span><i style="background:#6af5b0;height:6px"></i>역 하차(굵을수록 많음)</span></div>' +
      '<h3 style="margin-top:14px">곧 붐벼요?</h3>' + forecast(d) +
      '<h3 style="margin-top:14px">자동 판단 기록 <small>오늘 · 바뀔 때만 기록</small></h3>' + logHtml(items) +
      '<p class="src">자료: 서울시 실시간 도시데이터(서울숲공원 도로 소통·지하철 승하차·인구 혼잡도와 12시간 예측), Open-Meteo 체감온도·초미세먼지. 기준값(체감 31/33℃, 초미세먼지 36/76㎍/㎥, 역 하차 급증 1.5배)은 주제서·잠정 규칙이며 확정 전 (검증 필요). 기록은 이 브라우저에만 저장.</p>';
  }
  function tick() {
    Promise.allSettled([J(FLOW_URL), J(WX_URL), J(AQ_URL)]).then(function (r) {
      var d = r[0].status === 'fulfilled' ? r[0].value : null;
      if (!d || d.error) { if (box) box.querySelector('small') && (box.querySelector('small').textContent = '실시간 자료를 못 받았어요'); return; }
      render(d, r[1].value, r[2].value);
    });
  }
  function start() {
    if (!mount()) { setTimeout(start, 400); return; }
    J('../data/park.geojson').then(function (g) { PARK = g; }).catch(function () {}).then(function () { tick(); setInterval(tick, REFRESH); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
