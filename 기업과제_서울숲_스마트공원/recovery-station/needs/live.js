// 목표 1 「실시간 탐색」 화면 위쪽에 '지금 서울숲 사람' 띠를 붙입니다.
// 값: 서울시 실시간 도시데이터(citydata_ppltn, 서울숲공원 POI101). analysis/09_live.py 가 모읍니다.
// - 서울시 API는 http 전용이고 다른 사이트에서 읽기(CORS)를 허용하지 않아, 이 화면에서 직접 부를 수 없습니다.
//   그래서 GitHub Actions(.github/workflows/seoul-forest-live.yml)가 15분마다 받아 live-data 가지에 저장하고,
//   이 파일은 그 값을 읽기만 합니다. 인증키는 화면 코드에 없습니다.
// - live-data 값을 못 읽으면 ./data/live/ 의 예비 값(마지막으로 손으로 받은 값)을 보이고 '예전 값'이라고 밝힙니다.
// - (2026-11-20) 지금 혼잡도·인구·12시간 예측은 팀 중계 서버(Supabase seoul-crowd, needs/js/config.js의 LIVE_CROWD_URL)에서
//   실시간으로 받습니다. GitHub 정기 실행은 몇 시간씩 밀리기 때문입니다. 중계 서버가 주지 않는 거주·연령·성별 비율만
//   저장된 값(live-data 또는 예비 값)을 쓰고, 그 값의 시각을 함께 표시합니다.
// 대시보드를 다시 빌드할 때는 index.html의 live.js 줄을 다시 넣거나 React 소스로 옮기면 됩니다(needs/README.md).
(function () {
  'use strict';
  var ID = 'nd-live';
  var REMOTE = 'https://raw.githubusercontent.com/choemyeongwon1-ui/kaya/live-data/';
  var LOCAL = './data/live/';
  var PROXY = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-crowd';   // config.js LIVE_CROWD_URL과 같은 주소
  var STALE_MIN = 90;          // 이보다 오래된 값이면 '수집이 늦어지고 있음'
  var REFRESH_MS = 5 * 60e3;   // 화면을 켜 둔 동안 5분마다 다시 읽기
  var LEVELS = {
    '여유': { k: 0, c: 'var(--good)', w: 'var(--good-wash)' },
    '보통': { k: 1, c: 'var(--warning)', w: 'var(--warning-wash)' },
    '약간 붐빔': { k: 2, c: 'var(--serious)', w: 'var(--serious-wash)' },
    '붐빔': { k: 3, c: 'var(--critical)', w: 'var(--critical-wash)' },
  };
  var lv = function (name) { return LEVELS[name] || { k: -1, c: 'var(--muted)', w: 'var(--surface-2)' }; };

  var style = document.createElement('style');
  style.textContent = [
    '.nd-live{margin:0 0 20px;padding:22px 24px 16px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1.5fr) minmax(0,1fr);gap:28px;align-items:start}',
    '.nd-live h4{margin:0 0 10px;font-size:13px;font-weight:700;color:var(--ink-2);letter-spacing:-.01em}',
    '.nd-live .nd-src{font-size:11.5px;color:var(--muted);font-weight:500}',
    '.nd-live .lvl{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:999px;font-weight:800;font-size:15px}',
    '.nd-live .lvl i{width:9px;height:9px;border-radius:9px;background:currentColor}',
    '.nd-live .ppl{margin:10px 0 4px;font-size:30px;font-weight:800;letter-spacing:-.03em;color:var(--ink);font-variant-numeric:tabular-nums}',
    '.nd-live .ppl small{font-size:15px;font-weight:600;color:var(--ink-2);margin-left:3px}',
    '.nd-live .msg{margin:0;font-size:13.5px;line-height:1.55;color:var(--ink-2)}',
    '.nd-live .when{margin-top:8px;font-size:12px;color:var(--muted)}',
    '.nd-live .when.late{color:var(--serious);font-weight:700}',
    // 시간대 막대: 지난 기록(진하게) + 예측(빗금)
    '.nd-live .bars{display:flex;align-items:flex-end;gap:3px;height:96px;padding-top:4px}',
    '.nd-live .bar{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end}',
    '.nd-live .bar b{display:block;width:100%;border-radius:5px 5px 2px 2px;min-height:4px}',
    '.nd-live .bar.fc b{background-image:repeating-linear-gradient(135deg,transparent 0 4px,rgba(255,255,255,.45) 4px 7px)}',
    '.nd-live .bar.nd-now b{outline:2px solid var(--ink);outline-offset:1px}',
    '.nd-live .bar span{font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.nd-live .bar.nd-now span{color:var(--ink);font-weight:800}',
    '.nd-live .keys{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px;font-size:11.5px;color:var(--ink-2)}',
    '.nd-live .keys i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:4px;vertical-align:-1px}',
    '.nd-live .keys i.fc{background:var(--axis);background-image:repeating-linear-gradient(135deg,transparent 0 3px,rgba(255,255,255,.6) 3px 5px)}',
    // 누가 와 있나
    '.nd-live .split{display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--surface-3)}',
    '.nd-live .split b{display:block;height:100%}',
    '.nd-live .split-l{display:flex;justify-content:space-between;margin:5px 0 12px;font-size:12px;color:var(--ink-2)}',
    '.nd-live .split-l strong{color:var(--ink);font-variant-numeric:tabular-nums}',
    '.nd-live .ages{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;align-items:end;height:46px}',
    '.nd-live .ages b{display:block;background:var(--brand-2);border-radius:3px 3px 1px 1px;opacity:.85}',
    '.nd-live .ages-l{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;margin-top:3px;font-size:10px;color:var(--muted);text-align:center}',
    '.nd-live .note{grid-column:1/-1;margin:0;padding-top:12px;border-top:1px solid var(--hair);font-size:11.5px;line-height:1.6;color:var(--muted)}',
    '@media(max-width:1100px){.nd-live{grid-template-columns:minmax(0,1fr) minmax(0,1.4fr)}.nd-live .nd-who{grid-column:1/-1}}',
    '@media(max-width:700px){.nd-live{grid-template-columns:minmax(0,1fr);padding:18px 18px 14px;gap:20px}.nd-live .ppl{font-size:26px}}',
  ].join('');
  document.head.appendChild(style);

  function el(tag, cls, kids, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    (kids || []).forEach(function (k) { if (k != null) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  var fmt = function (n) { return Math.round(n).toLocaleString('ko-KR'); };
  var hh = function (t) { return String(Number(t.slice(11, 13))) + '시'; };
  var toDate = function (t) { return new Date(t.replace(' ', 'T') + ':00+09:00'); };

  // ---- 자료 읽기 ----
  var state = { d: null, hist: [], from: null, loading: true };

  function getText(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); });
  }
  function parseCsv(txt) {
    var lines = txt.trim().split(/\r?\n/), head = lines.shift().split(',');
    return lines.map(function (l) { var v = l.split(','), o = {}; head.forEach(function (h, i) { o[h] = v[i]; }); return o; });
  }
  function load(base) {
    var bust = '?t=' + Math.floor(Date.now() / 60e3);
    return getText(base + 'latest.json' + bust).then(function (j) {
      var d = JSON.parse(j);
      return getText(base + 'history.csv' + bust).then(parseCsv, function () { return []; })
        .then(function (h) { return { d: d, hist: h, from: base }; });
    });
  }
  function live() {
    return fetch(PROXY + '?t=' + Math.floor(Date.now() / 60e3), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (p) { if (!p || !p.time || p.error) throw new Error('no data'); return p; });
  }
  function refresh() {
    var stored = load(REMOTE).catch(function () { return load(LOCAL); }).catch(function () { return null; });
    var now = live().catch(function () { return null; });
    return Promise.all([stored, now]).then(function (r) {
      var s = r[0], p = r[1];
      if (p) {
        var base = (s && s.d) || {};
        var d = Object.assign({}, base, { level: p.level, message: p.msg, min: p.min, max: p.max, time: p.time, forecast: p.forecast || [] });
        d.whoTime = base.time || null;     // 거주·연령·성별 값의 시각 (저장된 값)
        state = { d: d, hist: (s && s.hist) || [], from: PROXY };
      } else if (s) state = s;
      else state = { d: null, hist: [], from: null };
      render();
    });
  }

  // ---- 그리기 ----
  function build() {
    var s = state, d = s.d;
    if (!d) {
      return el('section', 'card nd-live', [el('p', 'msg', [s.loading ? '서울숲 실시간 인구를 불러오는 중…' : '서울숲 실시간 인구를 불러오지 못했습니다. 5분 뒤 다시 시도합니다.'])], { id: ID, 'aria-live': 'polite' });
    }
    var L = lv(d.level), age = Math.round((Date.now() - toDate(d.time)) / 60e3);

    // 1) 지금
    var now = el('div', 'nd-now', [
      el('h4', null, ['지금 서울숲공원에 있는 사람 ', el('span', 'nd-src', ['· 서울시 실시간 도시데이터'])]),
      el('span', 'lvl', [el('i'), d.level || '정보 없음'], { style: 'color:' + L.c + ';background:' + L.w }),
      el('div', 'ppl', [fmt(d.min) + '~' + fmt(d.max), el('small', null, ['명'])]),
      el('p', 'msg', [d.message || '']),
      el('div', 'when' + (age > STALE_MIN ? ' late' : ''), [
        Number(d.time.slice(5, 7)) + '월 ' + Number(d.time.slice(8, 10)) + '일 ' + d.time.slice(11) + ' 기준',
        age > STALE_MIN ? ' · 예전 값입니다(' + (age >= 1440 ? Math.floor(age / 1440) + '일' : Math.floor(age / 60) + '시간') + ' 전). 수집이 늦어지고 있어요' : ' · 통신 신호로 추정, 약 15분 늦게 나옵니다',
      ]),
    ]);

    // 2) 시간대: 지난 기록(오늘, 시간마다 마지막 값) + 예측 12시간
    var cutoff = toDate(d.time) - 12 * 3600e3, byHour = {};
    s.hist.forEach(function (r) {
      if (!r.time || toDate(r.time) < cutoff || r.time >= d.time) return;
      byHour[r.time.slice(0, 13)] = { time: r.time, level: r.level, max: +r.max, min: +r.min };
    });
    var past = Object.keys(byHour).sort().map(function (k) { return byHour[k]; })
      .filter(function (p) { return p.time.slice(0, 13) !== d.time.slice(0, 13); });
    var cols = past.map(function (p) { return { p: p, kind: 'past' }; })
      .concat([{ p: d, kind: 'nd-now' }])
      .concat((d.forecast || []).map(function (p) { return { p: p, kind: 'fc' }; }));
    var top = Math.max.apply(null, cols.map(function (c) { return c.p.max || 0; })) || 1;
    var bars = el('div', 'bars', cols.map(function (c) {
      var C = lv(c.p.level);
      return el('div', 'bar ' + c.kind, [
        el('b', null, [], { style: 'height:' + Math.max(6, (c.p.max / top) * 78) + 'px;background-color:' + C.c }),
        el('span', null, [c.kind === 'nd-now' ? '지금' : hh(c.p.time)]),
      ], { title: (c.kind === 'fc' ? '예측 ' : '') + c.p.time.slice(11) + ' · ' + c.p.level + ' · ' + fmt(c.p.min) + '~' + fmt(c.p.max) + '명' });
    }));
    var keys = el('div', 'keys', Object.keys(LEVELS).map(function (n) {
      return el('span', null, [el('i', null, [], { style: 'background:' + LEVELS[n].c }), n]);
    }).concat([el('span', null, [el('i', 'fc'), '빗금 = AI 예측'])]));
    var timeline = el('div', 'tl', [
      el('h4', null, [past.length ? '지난 기록과 앞으로 12시간' : '앞으로 12시간 ', el('span', 'nd-src', [past.length ? ' · 막대 높이 = 최대 인구' : '· 서울시 AI 예측, 막대 높이 = 최대 인구'])]),
      bars, keys,
    ]);

    // 3) 누가 와 있나
    var ages = ['0', '10', '20', '30', '40', '50', '60', '70'];
    var whoOld = d.whoTime && d.whoTime !== d.time;
    var who = !d.age ? el('div', 'nd-who', [el('h4', null, ['누가 와 있나']), el('p', 'msg', ['거주·연령·성별 비율은 아직 모은 값이 없습니다.'])]) : null;
    var amax = d.age ? (Math.max.apply(null, ages.map(function (a) { return d.age[a] || 0; })) || 1) : 1;
    if (!who) who = el('div', 'nd-who', [
      el('h4', null, ['누가 와 있나', whoOld ? el('span', 'nd-src', [' · ' + Number(d.whoTime.slice(5, 7)) + '월 ' + Number(d.whoTime.slice(8, 10)) + '일 ' + d.whoTime.slice(11) + ' 값']) : null]),
      el('div', 'split', [
        el('b', null, [], { style: 'width:' + d.non_resident + '%;background:var(--brand-2)' }),
        el('b', null, [], { style: 'width:' + d.resident + '%;background:var(--axis)' }),
      ], { role: 'img', 'aria-label': '비상주 ' + d.non_resident + '%, 상주 ' + d.resident + '%' }),
      el('div', 'split-l', [
        el('span', null, ['이 동네에 살지 않는 사람 ', el('strong', null, [d.non_resident + '%'])]),
        el('span', null, ['사는 사람 ', el('strong', null, [d.resident + '%'])]),
      ]),
      el('div', 'ages', ages.map(function (a) {
        return el('b', null, [], { style: 'height:' + Math.max(2, (d.age[a] / amax) * 46) + 'px', title: (a === '0' ? '10세 미만' : a + (a === '70' ? '대 이상' : '대')) + ' ' + d.age[a] + '%' });
      }), { role: 'img', 'aria-label': '연령대 비율 ' + ages.map(function (a) { return (a === '0' ? '10세 미만' : a + '대') + ' ' + d.age[a] + '%'; }).join(', ') }),
      el('div', 'ages-l', ages.map(function (a) { return el('span', null, [a === '0' ? '0' : a === '70' ? '70+' : a]); })),
      el('div', 'split-l', [el('span', null, ['남 ', el('strong', null, [d.male + '%'])]), el('span', null, ['여 ', el('strong', null, [d.female + '%'])])]),
    ]);

    var note = el('p', 'note', [
      '혼잡도는 서울숲공원의 평소 인구와 비교한 값입니다(서울시 기준: 여유 50% 이하 · 보통 75% 이하 · 약간 붐빔 100% 이하 · 붐빔 100% 초과). ',
      '공원 전체를 한 덩어리로 센 값이라 잔디광장 같은 구역별 붐빔은 이 값으로 알 수 없습니다. ',
      '‘사는 사람’은 통신사가 밤 시간 머문 곳으로 추정한 상주 인구 비율입니다. ',
      s.from === PROXY ? '혼잡도·인구·예측은 5분마다 새로 받습니다' + (whoOld ? '. 거주·연령·성별 비율은 실시간 중계 서버가 주지 않아 마지막으로 모은 값입니다.' : '.')
        : s.from === LOCAL ? '지금은 저장소의 예비 값을 보여 주고 있습니다.' : '15분마다 자동으로 모아 쌓고 있습니다.',
    ]);
    return el('section', 'card nd-live', [now, timeline, who, note], { id: ID, 'aria-live': 'polite', 'aria-label': '지금 서울숲 사람' });
  }

  function render() {
    var old = document.getElementById(ID);
    if (old) old.replaceWith(build());
    else place();
  }

  // 목표 1 화면(.goalbar.g1)일 때만 제목(.page-head) 바로 아래에 둡니다. React가 다시 그려 지워지면 다시 붙입니다.
  function place() {
    var bar = document.querySelector('.goalbar.g1'), node = document.getElementById(ID);
    if (!bar) { if (node) node.remove(); return; }
    var head = document.querySelector('main .page-head');
    if (!head) return;
    if (node && node.previousElementSibling === head) return;
    if (node) node.remove();
    head.insertAdjacentElement('afterend', build());
  }

  var root = document.getElementById('root') || document.body, busy = false;
  new MutationObserver(function () { if (busy) return; busy = true; try { place(); } finally { busy = false; } })
    .observe(root, { childList: true, subtree: true });
  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, REFRESH_MS);
})();
