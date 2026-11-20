// 소개 첫 화면 오른쪽 지도에 '실시간' 표시를 붙입니다.
// - 왼쪽 위 LIVE 카드: 서울시 실시간 도시데이터(서울숲공원) 혼잡도·인구를 팀 중계 서버(Supabase seoul-crowd)에서 5분마다 받습니다.
//   못 받으면 data/live/latest.json(예비 값)을 쓰고 '예전 값'이라고 밝힙니다. 인증키는 이 파일에 없습니다.
// - 거점 점: 숨 쉬듯 퍼지는 고리를 덧그립니다. 점 색은 요일·시간·날씨로 계산한 '예상'이라 범례에 그렇게 적습니다.
(function () {
  'use strict';
  var PROXY = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-crowd';
  var LOCAL = './data/live/latest.json';
  var REFRESH = 5 * 60e3;
  var COLOR = { '여유': '#3ccf7a', '보통': '#f2b233', '약간 붐빔': '#ef8a52', '붐빔': '#e5534b' };
  var SVGNS = 'http://www.w3.org/2000/svg';

  var css = document.createElement('style');
  css.textContent = [
    '.hl-card{position:absolute;left:14px;top:14px;z-index:600;min-width:210px;padding:11px 14px 10px;border-radius:14px;background:rgba(10,16,13,.78);border:1px solid rgba(255,255,255,.12);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#f1f7f3;box-shadow:0 6px 22px rgba(0,0,0,.28);font-size:12px;line-height:1.35;pointer-events:none}',
    '.hl-top{display:flex;align-items:center;gap:8px;margin-bottom:7px}',
    '.hl-live{display:inline-flex;align-items:center;gap:6px;padding:2px 8px 2px 7px;border-radius:999px;background:rgba(229,83,75,.18);color:#ff8a80;font-size:10.5px;font-weight:800;letter-spacing:.08em}',
    '.hl-live i{width:7px;height:7px;border-radius:50%;background:#ff5a4f;animation:hlBlink 1.4s ease-in-out infinite}',
    '.hl-clock{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:700;color:rgba(241,247,243,.85);font-size:11.5px}',
    '.hl-main{display:flex;align-items:baseline;gap:7px;font-size:13px;font-weight:600}',
    '.hl-main b{font-size:17px;font-weight:800}',
    '.hl-n{font-variant-numeric:tabular-nums;color:rgba(241,247,243,.9);font-weight:700}',
    '.hl-sub{margin-top:5px;font-size:10.5px;color:rgba(241,247,243,.55);font-variant-numeric:tabular-nums}',
    '.hl-sub.old{color:#f5d58a}',
    '.hl-bar{margin-top:7px;height:2px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden}',
    '.hl-bar i{display:block;height:100%;width:100%;background:rgba(127,224,168,.7);transform-origin:left;transition:transform 1s linear}',
    '.hl-scan{position:absolute;inset:0;z-index:450;pointer-events:none;background:linear-gradient(180deg,transparent 0,rgba(127,224,168,.07) 48%,rgba(127,224,168,.16) 50%,transparent 52%);background-size:100% 220%;animation:hlScan 6s linear infinite;mix-blend-mode:screen}',
    '.hl-ring{pointer-events:none;transform-box:fill-box;transform-origin:center;animation:hlRing 2.6s ease-out infinite}',
    '@keyframes hlRing{0%{transform:scale(1);opacity:.75}80%,100%{transform:scale(3.2);opacity:0}}',
    '@keyframes hlBlink{0%,100%{opacity:1}50%{opacity:.25}}',
    '@keyframes hlScan{0%{background-position:0 120%}100%{background-position:0 -120%}}',
    '@media(max-width:600px){.hl-card{left:10px;top:10px;min-width:0;padding:9px 11px 8px}.hl-main b{font-size:15px}}',
    '@media(prefers-reduced-motion:reduce){.hl-ring,.hl-scan,.hl-live i{animation:none}.hl-ring{opacity:0}}'
  ].join('');
  document.head.appendChild(css);

  var state = null, nextAt = 0, card = null;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var fmt = function (n) { return Math.round(n).toLocaleString('ko-KR'); };

  function build(host) {
    card = document.createElement('div');
    card.className = 'hl-card';
    card.setAttribute('aria-live', 'polite');
    card.innerHTML = '<div class="hl-top"><span class="hl-live"><i></i>LIVE</span><span class="hl-clock"></span></div>' +
      '<div class="hl-main">서울숲 지금 <b>…</b><span class="hl-n"></span></div>' +
      '<div class="hl-sub">서울시 실시간 도시데이터 불러오는 중</div><div class="hl-bar"><i></i></div>';
    host.appendChild(card);
    var scan = document.createElement('div'); scan.className = 'hl-scan'; host.appendChild(scan);
    paint(); tick();
  }

  function paint() {
    if (!card) return;
    var d = state;
    var b = card.querySelector('.hl-main b'), n = card.querySelector('.hl-n'), s = card.querySelector('.hl-sub');
    if (!d) return;
    var c = COLOR[d.level] || '#f1f7f3';
    b.textContent = d.level; b.style.color = c;
    card.querySelector('.hl-live i').style.background = c;
    n.textContent = d.min ? fmt(d.min) + '~' + fmt(d.max) + '명' : '';
    var t = String(d.time || '').slice(11, 16);
    s.textContent = d.old ? '예전 값 · ' + String(d.time || '').slice(5, 16).replace('-', '/') + ' 기준'
      : '서울시 실시간 도시데이터 · ' + t + ' 기준';
    s.classList.toggle('old', !!d.old);
  }

  function tick() {
    if (!card) return;
    var now = new Date();
    var txt = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()), ck = card.querySelector('.hl-clock');
    if (ck.textContent !== txt) ck.textContent = txt;
    var left = Math.max(0, nextAt - Date.now());
    card.querySelector('.hl-bar i').style.transform = 'scaleX(' + (left / REFRESH).toFixed(3) + ')';
  }

  function getJSON(u, ms) {
    return Promise.race([fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }),
      new Promise(function (_, no) { setTimeout(no, ms); })]);
  }
  function refresh() {
    nextAt = Date.now() + REFRESH;
    getJSON(PROXY + '?t=' + Math.floor(Date.now() / 60e3), 6000)
      .then(function (d) { if (!d || !d.level) throw 0; return { level: d.level, min: d.min, max: d.max, time: d.time }; })
      .catch(function () { return getJSON(LOCAL, 6000).then(function (d) { return { level: d.level, min: d.min, max: d.max, time: d.time, old: true }; }); })
      .then(function (d) { state = d; paint(); }).catch(function () {});
  }

  // 거점 점(흰 테두리 원)마다 퍼지는 고리 하나씩. Leaflet이 점을 다시 그리면 고리도 따라갑니다.
  function rings(host) {
    var dots = host.querySelectorAll('.leaflet-overlay-pane path[stroke="#ffffff"]');
    dots.forEach(function (p, i) {
      var r = p.__hlRing;
      if (!r || !r.isConnected) {
        r = document.createElementNS(SVGNS, 'path');
        r.setAttribute('class', 'hl-ring');
        r.setAttribute('fill', 'none');
        r.setAttribute('stroke-width', '2');
        r.style.animationDelay = (-(i * 0.37) % 2.6).toFixed(2) + 's';
        p.parentNode.insertBefore(r, p);
        p.__hlRing = r;
      }
      if (r.getAttribute('d') !== p.getAttribute('d')) r.setAttribute('d', p.getAttribute('d'));
      var f = p.getAttribute('fill');
      if (r.getAttribute('stroke') !== f) r.setAttribute('stroke', f);
    });
  }

  function apply() {
    var host = document.querySelector('.intro .intro-map');
    if (!host) { card = null; return; }
    if (!card || !host.contains(card)) build(host);
    rings(host);
  }

  refresh(); setInterval(refresh, REFRESH);
  setInterval(tick, 1000);
  var root = document.getElementById('root') || document.body, busy = false;
  new MutationObserver(function () { if (busy) return; busy = true; try { apply(); } finally { busy = false; } })
    .observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['d', 'fill'] });
  apply();
})();
