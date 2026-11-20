/*
 * 서울숲, 오늘 나에게 맞는 길 — 표지(커버)
 * 어떤 대시보드 HTML이든 <head> 안에 아래 한 줄만 넣으면, 창을 열자마자 표지가 덮고 → 누르면 서울숲으로 날아 들어가며 대시보드가 보입니다.
 *
 *   <script src="(경로)/cover/cover.js"></script>
 *
 * 선택 옵션 (script 태그에 붙임)
 *   data-auto="8000"    8초 뒤 저절로 넘어감 (기본: 누를 때까지 기다림)
 *   data-once="session" 같은 탭에서는 한 번만 보여 줌 (기본: 열 때마다)
 * 주소 끝에 ?cover=0 을 붙이면 표지 없이 바로 대시보드
 *
 * 대시보드 쪽 코드는 건드리지 않습니다. 표지는 화면 맨 위에 얹혔다가 사라질 때 스스로 지워집니다.
 * 배경: Esri World Imagery 위성 타일(인터넷 연결 필요, 없으면 어두운 배경만 보임)
 */
(function () {
  'use strict';
  var me = document.currentScript || {};
  var ds = me.dataset || {};
  var opt = { auto: +(ds.auto || 0), once: ds.once || '' };
  try {
    if (/[?&]cover=0\b/.test(location.search)) return;
    if (opt.once === 'session' && sessionStorage.getItem('sf-cover-seen')) return;
  } catch (e) {}
  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 지리 데이터 ──────────────────────────────────────────────
  // 서울숲 경계 (recovery-station/data/park.geojson)
  var PARK = [[[127.04377,37.54176],[127.04394,37.54151],[127.04379,37.54053],[127.04343,37.53846],[127.04332,37.53814],[127.04282,37.53823],[127.04233,37.53835],[127.04119,37.53886],[127.03927,37.53948],[127.03752,37.54026],[127.03601,37.54083],[127.03488,37.54123],[127.03338,37.54173],[127.03132,37.54252],[127.03082,37.5429],[127.03081,37.54327],[127.03285,37.54495],[127.03518,37.54408],[127.03555,37.54391],[127.03566,37.54359],[127.03528,37.54261],[127.03545,37.54251],[127.03554,37.54265],[127.03585,37.54341],[127.03591,37.54336],[127.0357,37.54252],[127.03613,37.54242],[127.03618,37.5432],[127.03625,37.54373],[127.03684,37.54363],[127.03821,37.54316],[127.03846,37.5431],[127.03851,37.54341],[127.03673,37.54394],[127.03652,37.54416],[127.03682,37.54574],[127.03702,37.547],[127.03738,37.54827],[127.03759,37.54858],[127.03808,37.54844],[127.03755,37.5474],[127.03763,37.54727],[127.03923,37.54693],[127.03934,37.5471],[127.0416,37.5465],[127.04123,37.54562],[127.04123,37.54559],[127.04311,37.54508],[127.04193,37.54245],[127.04108,37.54267],[127.04105,37.54245],[127.04377,37.54176]],[[127.03798,37.54874],[127.03799,37.54886],[127.03824,37.54914],[127.03989,37.55032],[127.0418,37.55112],[127.04191,37.55112],[127.04226,37.54949],[127.04233,37.54882],[127.0408,37.54863],[127.03973,37.54848],[127.03948,37.54853],[127.03923,37.5483],[127.03804,37.54863],[127.03798,37.54874]]];
  // 주변 지명 (표지 연출용 대략 위치)
  var PLACES = [
    { t: '한강', e: 'HAN RIVER', lon: 127.0462, lat: 37.5362 },
    { t: '성수동', e: 'SEONGSU', lon: 127.0478, lat: 37.5452 },
    { t: '중랑천', e: 'JUNGNANGCHEON', lon: 127.0262, lat: 37.5482 }
  ];
  var Z = 16, TILE = 256;
  var TILE_URL = function (x, y) { return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + Z + '/' + y + '/' + x; };
  function px(lon, lat) {
    var n = TILE * Math.pow(2, Z), s = Math.sin(lat * Math.PI / 180);
    return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  }
  var RINGS = PARK.map(function (r) { return r.map(function (c) { return px(c[0], c[1]); }); });
  var PB = (function () {
    var a = [Infinity, Infinity, -Infinity, -Infinity];
    RINGS.forEach(function (r) { r.forEach(function (p) { a[0] = Math.min(a[0], p[0]); a[1] = Math.min(a[1], p[1]); a[2] = Math.max(a[2], p[0]); a[3] = Math.max(a[3], p[1]); }); });
    return { x0: a[0], y0: a[1], x1: a[2], y1: a[3], w: a[2] - a[0], h: a[3] - a[1], cx: (a[0] + a[2]) / 2, cy: (a[1] + a[3]) / 2 };
  })();

  // ── 스타일 ──────────────────────────────────────────────────
  var EASE = 'cubic-bezier(.16,1,.3,1)';
  var CSS = [
    '#sf-cover{--ink:#f2f7f4;--ink2:rgba(242,247,244,.66);--mute:rgba(242,247,244,.4);--mint:#6ff5b3;--gold:#f3d58e;--ease:' + EASE + ';',
    '  position:fixed;inset:0;z-index:2147483000;overflow:hidden;color:var(--ink);background:#020806;cursor:default;',
    '  font-family:Pretendard,"Pretendard Variable",-apple-system,system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-.01em}',
    '#sf-cover *{box-sizing:border-box}',
    /* 카메라: 등장/퇴장(stage) · 천천히 흐르기(drift) · 마우스 따라오기(par) · 지도 배치(world) */
    '#sf-cover .stage,#sf-cover .drift,#sf-cover .par{position:absolute;inset:0}',
    '#sf-cover .stage{opacity:0;transform:scale(1.32);filter:blur(14px) brightness(.4)}',
    '#sf-cover.on .stage{opacity:1;transform:scale(1);filter:none;transition:opacity 1.6s ease,transform 3.2s var(--ease),filter 2.6s var(--ease)}',
    '#sf-cover .drift{animation:sfKen 26s ease-in-out 3s infinite alternate}',
    '#sf-cover .par{transition:transform 1.2s cubic-bezier(.2,.7,.2,1);transform:translate3d(calc(var(--mx,0) * -18px),calc(var(--my,0) * -12px),0)}',
    '#sf-cover .world{position:absolute;left:0;top:0;transform-origin:0 0}',
    '#sf-cover .tiles{position:absolute;left:0;top:0}',
    '#sf-cover .tiles img{position:absolute;width:' + TILE + 'px;height:' + TILE + 'px;opacity:0;transition:opacity .8s;user-select:none;-webkit-user-drag:none}',
    '#sf-cover .tiles img.ld{opacity:1}',
    '#sf-cover .tiles.dark{filter:grayscale(.85) brightness(.52) contrast(1.3)}',
    '#sf-cover .tiles.color{filter:saturate(1.35) contrast(1.12) brightness(1.02);opacity:0;transition:opacity 1.8s ease 2.6s}',
    '#sf-cover.on .tiles.color{opacity:1}',
    '#sf-cover .geo{position:absolute;left:0;top:0;overflow:visible}',
    '#sf-cover .pk-glow{fill:rgba(111,245,179,.10);opacity:0;transition:opacity 2s ease 2.8s}',
    '#sf-cover.on .pk-glow{opacity:1;animation:sfBreath 5s ease-in-out 4.8s infinite}',
    '#sf-cover .pk-line{fill:none;stroke:url(#sfStroke);stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;filter:url(#sfGlow)}',
    '#sf-cover.on .pk-line{animation:sfDraw 2.4s cubic-bezier(.65,0,.25,1) 1.5s forwards}',
    '#sf-cover .pk-run{fill:none;stroke:#fff;stroke-linecap:round;stroke-dasharray:.035 .965;stroke-dashoffset:1;opacity:0;filter:url(#sfGlow2)}',
    '#sf-cover.on .pk-run{opacity:.95;transition:opacity .8s 3.8s;animation:sfRun 9s linear 3.8s infinite}',
    '#sf-cover .place{opacity:0;transition:opacity 1.4s ease}',
    '#sf-cover.on .place{opacity:1}',
    '#sf-cover .place text{font-family:inherit;fill:rgba(242,247,244,.82);paint-order:stroke;stroke:rgba(2,8,6,.75);stroke-linejoin:round}',
    '#sf-cover .place .en{fill:rgba(242,247,244,.42);letter-spacing:.22em;font-weight:600}',
    '#sf-cover .place .kr{font-weight:700;letter-spacing:-.02em}',
    /* 화면 효과 */
    '#sf-cover .tint{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 70% 50%,rgba(10,60,40,.0),rgba(2,10,7,.55) 70%),linear-gradient(180deg,rgba(2,8,6,.55),transparent 22%,transparent 70%,rgba(2,8,6,.85));mix-blend-mode:normal}',
    '#sf-cover .shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(2,8,6,.94) 0%,rgba(2,8,6,.78) 26%,rgba(2,8,6,.25) 52%,transparent 64%)}',
    '#sf-cover .grain{position:absolute;inset:-50%;pointer-events:none;opacity:.10;mix-blend-mode:overlay;animation:sfGrain 1.2s steps(6) infinite;',
    '  background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27180%27 height=%27180%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%27.9%27 numOctaves=%272%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")}',
    '#sf-cover .scan{position:absolute;top:0;bottom:0;left:-30%;width:28%;pointer-events:none;opacity:0;',
    '  background:linear-gradient(90deg,transparent,rgba(111,245,179,.10) 45%,rgba(220,255,236,.32) 50%,rgba(111,245,179,.10) 55%,transparent);mix-blend-mode:screen}',
    '#sf-cover.on .scan{animation:sfScan 2.2s cubic-bezier(.5,0,.3,1) 1s forwards}',
    /* 공원 둘레 HUD */
    '#sf-cover .hud{position:absolute;pointer-events:none}',
    '#sf-cover .hud i{position:absolute;width:18px;height:18px;border:0 solid rgba(111,245,179,.85);opacity:0;transform:scale(1.8);transition:all .9s var(--ease)}',
    '#sf-cover .hud i:nth-child(1){left:0;top:0;border-width:1.5px 0 0 1.5px}#sf-cover .hud i:nth-child(2){right:0;top:0;border-width:1.5px 1.5px 0 0}',
    '#sf-cover .hud i:nth-child(3){left:0;bottom:0;border-width:0 0 1.5px 1.5px}#sf-cover .hud i:nth-child(4){right:0;bottom:0;border-width:0 1.5px 1.5px 0}',
    '#sf-cover.on .hud i{opacity:1;transform:none;transition-delay:3.2s}',
    '#sf-cover .hud .tag{position:absolute;left:100%;top:0;margin-left:14px;white-space:nowrap;font:600 10.5px/1.7 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.12em;color:rgba(242,247,244,.55);opacity:0;transform:translateX(-8px);transition:all .9s var(--ease) 3.5s}',
    '#sf-cover .hud .tag b{display:block;color:var(--mint);font-weight:700;letter-spacing:.2em}',
    '#sf-cover.on .hud .tag{opacity:1;transform:none}',
    /* 글 */
    '#sf-cover .top{position:absolute;z-index:3;left:6vw;right:6vw;top:4.6vh;display:flex;justify-content:space-between;align-items:center;font-size:12px;letter-spacing:.16em;color:var(--ink2);font-weight:600}',
    '#sf-cover .top .brand{display:flex;align-items:center;gap:12px}',
    '#sf-cover .top .brand svg{width:22px;height:22px}',
    '#sf-cover .top .clock{font:600 12px ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.14em;display:flex;align-items:center;gap:10px}',
    '#sf-cover .top .clock i{width:7px;height:7px;border-radius:50%;background:var(--mint);box-shadow:0 0 10px var(--mint);animation:sfBlink 2s ease-in-out infinite}',
    '#sf-cover .copy{position:absolute;z-index:3;left:6vw;bottom:14vh;max-width:min(640px,48vw)}',
    '#sf-cover .eyebrow{display:flex;align-items:center;gap:12px;font-size:12px;font-weight:700;letter-spacing:.24em;color:var(--mint)}',
    '#sf-cover .eyebrow i{display:block;height:1px;width:42px;background:var(--mint);transform-origin:left;transform:scaleX(0);transition:transform 1s var(--ease) 1.4s}',
    '#sf-cover.on .eyebrow i{transform:none}',
    '#sf-cover h1{margin:22px 0 0;font-weight:300;line-height:1.08;letter-spacing:-.05em}',
    '#sf-cover h1 .ln{display:block;overflow:hidden;padding:.04em 0 .1em}',
    '#sf-cover h1 .l1{font-size:clamp(40px,5.6vw,86px);font-weight:300;color:rgba(242,247,244,.92)}',
    '#sf-cover h1 .l2{font-size:clamp(38px,5.1vw,80px);font-weight:800;white-space:nowrap}',
    '#sf-cover h1 .l2 .ch{background:linear-gradient(100deg,#ffffff 0%,#c9ffe3 40%,#6ff5b3 75%,#f3d58e 120%);background-size:var(--bw) 100%;background-position:var(--bx) 0;-webkit-background-clip:text;background-clip:text;color:transparent}',
    '#sf-cover .ch{display:inline-block;transform:translateY(112%) rotate(4deg);opacity:0;transition:transform 1.1s var(--ease),opacity .8s ease}',
    '#sf-cover.on .ch{transform:none;opacity:1}',
    '#sf-cover .rule{margin:30px 0 0;height:1px;width:100%;max-width:420px;background:linear-gradient(90deg,rgba(242,247,244,.5),transparent);transform-origin:left;transform:scaleX(0);transition:transform 1.4s var(--ease) 2.6s}',
    '#sf-cover.on .rule{transform:none}',
    '#sf-cover .sub{margin:22px 0 0;font-size:clamp(15px,1.25vw,18px);line-height:1.7;color:var(--ink2);font-weight:500}',
    '#sf-cover .sub b{color:var(--ink);font-weight:700}',
    '#sf-cover .fade{opacity:0;transform:translateY(16px);transition:opacity 1s ease,transform 1.2s var(--ease)}',
    '#sf-cover.on .fade{opacity:1;transform:none}',
    '#sf-cover .go{position:relative;overflow:hidden;margin-top:36px;display:inline-flex;align-items:center;gap:16px;padding:8px 8px 8px 26px;border-radius:999px;cursor:pointer;font:inherit;font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:var(--ink);',
    '  border:1px solid rgba(242,247,244,.28);background:rgba(242,247,244,.06);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:background .35s,border-color .35s,transform .35s var(--ease)}',
    '#sf-cover .go::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;transform:skewX(-20deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);animation:sfShine 3.6s ease-in-out 4.5s infinite}',
    '#sf-cover .go span{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:var(--mint);color:#03130b;transition:transform .45s var(--ease),background .35s}',
    '#sf-cover .go:hover,#sf-cover .go:focus-visible{background:rgba(111,245,179,.14);border-color:rgba(111,245,179,.7);outline:none;transform:translateY(-2px)}',
    '#sf-cover .go:hover span,#sf-cover .go:focus-visible span{transform:rotate(-45deg) scale(1.06);background:#fff}',
    '#sf-cover .hint{margin-left:16px;font-size:11.5px;letter-spacing:.14em;color:var(--mute);font-weight:600}',
    '#sf-cover .foot{position:absolute;z-index:3;left:6vw;right:6vw;bottom:4.6vh;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;font-size:11.5px;color:var(--mute);letter-spacing:.02em}',
    '#sf-cover .foot b{color:var(--ink2);font-weight:600}',
    '#sf-cover .foot .cr{font-size:10px;opacity:.7}',
    '#sf-cover .bar{position:absolute;z-index:4;left:0;bottom:0;height:2px;width:100%;background:linear-gradient(90deg,var(--mint),var(--gold));transform-origin:left;transform:scaleX(0)}',
    /* 퇴장: 서울숲으로 날아 들어감 */
    '#sf-cover.out{pointer-events:none}',
    '#sf-cover.out .stage{transform:scale(3.4)!important;opacity:0!important;filter:blur(6px)!important;transition:transform 1.3s cubic-bezier(.7,0,.3,1),opacity .9s ease .45s,filter .9s ease .4s!important}',
    '#sf-cover.out .copy,#sf-cover.out .top,#sf-cover.out .foot,#sf-cover.out .hud{opacity:0;transform:translateY(-20px);transition:all .5s ease}',
    '#sf-cover.out .shade,#sf-cover.out .tint{opacity:0;transition:opacity .8s ease .2s}',
    '#sf-cover.bye{opacity:0;transition:opacity .5s ease}',
    '@keyframes sfDraw{to{stroke-dashoffset:0}}',
    '@keyframes sfRun{to{stroke-dashoffset:0}}',
    '@keyframes sfKen{0%{transform:scale(1) translate3d(0,0,0)}100%{transform:scale(1.07) translate3d(-1.2%,.8%,0)}}',
    '@keyframes sfBreath{0%,100%{fill:rgba(111,245,179,.08)}50%{fill:rgba(111,245,179,.18)}}',
    '@keyframes sfScan{0%{left:-30%;opacity:0}15%{opacity:1}100%{left:110%;opacity:0}}',
    '@keyframes sfGrain{0%{transform:translate(0,0)}20%{transform:translate(-4%,3%)}40%{transform:translate(3%,-2%)}60%{transform:translate(-2%,-4%)}80%{transform:translate(4%,2%)}100%{transform:translate(0,0)}}',
    '@keyframes sfShine{0%{left:-60%}35%,100%{left:130%}}',
    '@keyframes sfBlink{0%,100%{opacity:1}50%{opacity:.35}}',
    '@keyframes sfBar{to{transform:scaleX(1)}}',
    '@media (max-width:820px){',
    '  #sf-cover .shade{background:linear-gradient(0deg,rgba(2,8,6,.96) 0%,rgba(2,8,6,.85) 38%,rgba(2,8,6,.2) 62%,transparent 75%)}',
    '  #sf-cover .copy{left:22px;right:22px;bottom:13vh;max-width:none}',
    '  #sf-cover .top{left:22px;right:22px;top:20px;font-size:10.5px}#sf-cover .top .brand span{display:none}#sf-cover .top .clock{font-size:10.5px;letter-spacing:.08em}',
    '  #sf-cover .foot{left:22px;right:22px;bottom:18px;flex-direction:column;align-items:flex-start;gap:3px;font-size:10.5px}',
    '  #sf-cover .hud .tag{display:none}#sf-cover .hint{display:none}#sf-cover .go{margin-top:26px}#sf-cover .rule{margin-top:20px}#sf-cover .sub{margin-top:16px}}',
    '@media (prefers-reduced-motion:reduce){#sf-cover *,#sf-cover{animation:none!important;transition-duration:.25s!important;transition-delay:0s!important}#sf-cover .pk-line{stroke-dashoffset:0}}'
  ].join('\n');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function chars(text, base, step) {
    return Array.prototype.map.call(text, function (c, i) {
      return c === ' ' ? '<span class="ch" style="width:.28em"> </span>'
        : '<span class="ch" style="transition-delay:' + (base + i * step).toFixed(2) + 's">' + c + '</span>';
    }).join('');
  }

  // ── 화면 만들기 ──────────────────────────────────────────────
  var style = el('style'); style.id = 'sf-cover-style'; style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);
  if (!document.querySelector('link[href*="pretendard"]')) {
    var font = el('link'); font.rel = 'stylesheet';
    font.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
    (document.head || document.documentElement).appendChild(font);
  }

  var L1 = '서울숲,', L2 = '오늘 나에게 맞는 길';
  var root = el('div');
  root.id = 'sf-cover';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', L1 + ' ' + L2 + ' 표지');
  root.innerHTML =
    '<div class="stage"><div class="drift"><div class="par"><div class="world"></div></div></div></div>' +
    '<div class="tint"></div><div class="shade"></div><div class="scan"></div><div class="grain"></div>' +
    '<div class="hud"><i></i><i></i><i></i><i></i><div class="tag"><b>SEOUL FOREST</b>37.5443° N &nbsp;127.0374° E<br>SEONGDONG-GU, SEOUL</div></div>' +
    '<div class="top fade" style="transition-delay:1.1s">' +
      '<div class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="rgba(111,245,179,.14)" stroke="rgba(111,245,179,.5)"/><path d="M16 7l6.5 10h-3.7l4.7 7.5H8.5l4.7-7.5H9.5z" fill="#6ff5b3"/></svg><span>SEOUL FOREST · SMART PARK</span></div>' +
      '<div class="clock"><i></i><span class="now">—</span></div>' +
    '</div>' +
    '<div class="copy">' +
      '<div class="eyebrow fade" style="transition-delay:1.3s"><i></i>2026-2 AI-CCS · TOPIC 01</div>' +
      '<h1><span class="ln l1">' + chars(L1, 1.55, .06) + '</span><span class="ln l2">' + chars(L2, 1.85, .045) + '</span></h1>' +
      '<div class="rule"></div>' +
      '<p class="sub fade" style="transition-delay:2.8s">날씨와 붐빔, 함께 온 사람과 머물 시간을 읽어<br><b>지금 머물기 좋은 자리와 걸을 길</b>을 고릅니다.</p>' +
      '<div class="fade" style="transition-delay:3.1s"><button type="button" class="go">대시보드 열기<span aria-hidden="true"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></button><span class="hint">CLICK · ENTER</span></div>' +
    '</div>' +
    '<div class="foot fade" style="transition-delay:3.4s"><span><b>상명대학교 그린스마트시티학과</b> · 자문 ㈜한국종합기술 조경레저부</span><span class="cr">위성 사진 © Esri, Maxar, Earthstar Geographics</span></div>' +
    '<div class="bar"></div>';

  // 제목 글자마다 그러데이션이 이어지도록 위치 지정
  var l2chars = root.querySelectorAll('.l2 .ch');
  Array.prototype.forEach.call(l2chars, function (c, i) { c.style.setProperty('--bw', (l2chars.length * 100) + '%'); c.style.setProperty('--bx', (i / Math.max(1, l2chars.length - 1) * 100) + '%'); });

  var world = root.querySelector('.world'), stage = root.querySelector('.stage'), hud = root.querySelector('.hud');

  // ── 지도 배치 (화면 크기에 맞춰 다시 계산) ────────────────────
  var built = false;
  function layout() {
    var W = innerWidth, H = innerHeight, mob = W < 820;
    var th = mob ? H * 0.36 : H * 0.66, tw = mob ? W * 0.78 : W * 0.40;
    var s = Math.min(th / PB.h, tw / PB.w);
    var tx = mob ? W * 0.5 : W * 0.71, ty = mob ? H * 0.31 : H * 0.5;
    var offX = tx - PB.cx * s, offY = ty - PB.cy * s;
    // 화면 + 여유(확대·흔들림)만큼 타일
    var m = 0.28;
    var wx0 = (-W * m - offX) / s, wy0 = (-H * m - offY) / s, wx1 = (W * (1 + m) - offX) / s, wy1 = (H * (1 + m) - offY) / s;
    var t0x = Math.floor(wx0 / TILE), t0y = Math.floor(wy0 / TILE), t1x = Math.floor(wx1 / TILE), t1y = Math.floor(wy1 / TILE);
    var ox = t0x * TILE, oy = t0y * TILE, ww = (t1x - t0x + 1) * TILE, wh = (t1y - t0y + 1) * TILE;
    world.style.transform = 'translate3d(' + (offX + ox * s) + 'px,' + (offY + oy * s) + 'px,0) scale(' + s + ')';
    world.style.width = ww + 'px'; world.style.height = wh + 'px';
    stage.style.transformOrigin = tx + 'px ' + ty + 'px';

    var dark = el('div', 'tiles dark'), color = el('div', 'tiles color');
    var pathD = RINGS.map(function (r) { return 'M' + r.map(function (p) { return (p[0] - ox).toFixed(1) + ' ' + (p[1] - oy).toFixed(1); }).join('L') + 'Z'; }).join('');
    color.style.clipPath = 'path("' + pathD + '")'; color.style.webkitClipPath = color.style.clipPath;
    color.style.width = ww + 'px'; color.style.height = wh + 'px';
    var pcx0 = Math.floor(PB.x0 / TILE), pcx1 = Math.floor(PB.x1 / TILE), pcy0 = Math.floor(PB.y0 / TILE), pcy1 = Math.floor(PB.y1 / TILE);
    for (var ty2 = t0y; ty2 <= t1y; ty2++) for (var tx2 = t0x; tx2 <= t1x; tx2++) {
      var url = TILE_URL(tx2, ty2), l = (tx2 * TILE - ox) + 'px', t = (ty2 * TILE - oy) + 'px';
      var im = new Image(); im.alt = ''; im.decoding = 'async'; im.onload = function () { this.className = 'ld'; }; im.style.left = l; im.style.top = t; im.src = url; dark.appendChild(im);
      if (tx2 >= pcx0 && tx2 <= pcx1 && ty2 >= pcy0 && ty2 <= pcy1) {
        var ic = new Image(); ic.alt = ''; ic.decoding = 'async'; ic.onload = function () { this.className = 'ld'; }; ic.style.left = l; ic.style.top = t; ic.src = url; color.appendChild(ic);
      }
    }
    // 경계선·빛·지명
    var svg = sv('svg', { class: 'geo', width: ww, height: wh, viewBox: '0 0 ' + ww + ' ' + wh, 'aria-hidden': 'true' });
    var k = 1 / s;
    svg.innerHTML =
      '<defs><linearGradient id="sfStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9fff3"/><stop offset=".5" stop-color="#6ff5b3"/><stop offset="1" stop-color="#f3d58e"/></linearGradient>' +
      '<filter id="sfGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="' + (3 * k) + '" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<filter id="sfGlow2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="' + (5 * k) + '" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<path class="pk-glow" d="' + pathD + '"/>' +
      RINGS.map(function (r, i) {
        var d = 'M' + r.map(function (p) { return (p[0] - ox).toFixed(1) + ' ' + (p[1] - oy).toFixed(1); }).join('L') + 'Z';
        return '<path class="pk-line" pathLength="1" stroke-width="' + (2 * k) + '" d="' + d + '" style="animation-delay:' + (1.5 + i * .5) + 's"/>' +
          '<path class="pk-run" pathLength="1" stroke-width="' + (3.2 * k) + '" d="' + d + '" style="animation-duration:' + (i ? 5 : 10) + 's"/>';
      }).join('') +
      PLACES.map(function (p, i) {
        var q = px(p.lon, p.lat), x = (q[0] - ox).toFixed(1), y = (q[1] - oy).toFixed(1);
        return '<g class="place" style="transition-delay:' + (3 + i * .25) + 's">' +
          '<text class="kr" x="' + x + '" y="' + y + '" text-anchor="middle" font-size="' + (15 * k) + '" stroke-width="' + (4 * k) + '">' + p.t + '</text>' +
          '<text class="en" x="' + x + '" y="' + (+y + 16 * k) + '" text-anchor="middle" font-size="' + (8.5 * k) + '" stroke-width="' + (3 * k) + '">' + p.e + '</text></g>';
      }).join('');
    world.replaceChildren(dark, color, svg);

    // HUD: 공원 둘레 모서리 표시
    var pad = 22;
    Object.assign(hud.style, { left: (PB.x0 * s + offX - pad) + 'px', top: (PB.y0 * s + offY - pad) + 'px', width: (PB.w * s + pad * 2) + 'px', height: (PB.h * s + pad * 2) + 'px' });
    built = true;
  }
  layout();

  // ── 시계 (한국 시간) ──────────────────────────────────────────
  var nowEl = root.querySelector('.now');
  var DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  function tick() {
    var d = new Date(Date.now() + (9 * 60 + new Date().getTimezoneOffset()) * 60000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    if (innerWidth < 820) { nowEl.textContent = p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); return; }
    nowEl.textContent = 'TODAY ' + d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + DOW[d.getDay()] + '  ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  tick(); var clock = setInterval(tick, 10000);

  // ── 붙이기 · 시작 ─────────────────────────────────────────────
  document.documentElement.appendChild(root);
  var prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('on'); }); });
  var btn = root.querySelector('.go');
  setTimeout(function () { try { btn.focus({ preventScroll: true }); } catch (e) {} }, 3200);

  // 마우스를 따라 지도가 살짝 움직임
  function onMove(e) {
    if (REDUCE) return;
    root.style.setProperty('--mx', ((e.clientX / innerWidth) - .5).toFixed(3));
    root.style.setProperty('--my', ((e.clientY / innerHeight) - .5).toFixed(3));
  }
  root.addEventListener('mousemove', onMove);
  var rz; function onResize() { clearTimeout(rz); rz = setTimeout(layout, 200); }
  addEventListener('resize', onResize);

  // ── 닫기: 서울숲으로 날아 들어가며 대시보드 ────────────────────
  var done = false;
  function close() {
    if (done) return; done = true;
    try { if (opt.once === 'session') sessionStorage.setItem('sf-cover-seen', '1'); } catch (e) {}
    root.classList.add('out');
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    clearInterval(clock);
    setTimeout(function () { root.classList.add('bye'); document.documentElement.style.overflow = prevOverflow; try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 900);
    setTimeout(function () { root.remove(); var st = document.getElementById('sf-cover-style'); if (st) st.remove(); }, 1500);
  }
  function onKey(e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); close(); } }
  btn.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  if (opt.auto > 0) {
    var bar = root.querySelector('.bar');
    bar.style.animation = 'sfBar ' + opt.auto + 'ms linear forwards';
    setTimeout(close, opt.auto);
  }
  window.sfCover = { close: close };
})();
