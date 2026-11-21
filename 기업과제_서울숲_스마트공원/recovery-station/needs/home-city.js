// 소개 화면을 '숲' 톤(이끼·세이지·숲 초록)으로 다듬습니다.
// - 첫 화면: 숲 지형 등고선 + 비스듬한 햇살 + 잎 그림자 + 빛 알갱이, 실시간 카드는 제목 아래(hero-live.js)
// - 구간 머리: 번호 · 영문 · 전문용어, 큰 외곽선 숫자
// - 현황 지표: 어두운 패널 + 미니 차트 / 문제: 큰 수치 / 전략: 시스템 흐름도 / 근거: 전문용어
// 화면에 이미 있는 수치만 쓰고(파생값은 계산식 표기), 원래 글자는 바꾸지 않습니다.
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SANS = '"Pretendard Variable",Pretendard,system-ui,sans-serif';

  var css = [
    ':root{--fr-deep:#0c1c15;--fr-forest:#143024;--fr-moss:#21452f;--fr-leaf:#cfe3a8;--fr-sage:#a7c79a;--fr-mist:#e9f0e3;--fr-amber:#e2b15c;--hc-line:rgba(233,240,227,.12);--hc-mint:var(--fr-leaf);--hc-lime:var(--fr-leaf)}',
    /* ---------- 첫 화면: 숲 — 등고선 · 햇살 · 잎 그림자 · 빛 알갱이 ---------- */
    '.hm .intro.fr-on{background:radial-gradient(120% 90% at 0% 0%,rgba(207,227,168,.10),transparent 55%),linear-gradient(160deg,var(--fr-deep) 0%,var(--fr-forest) 55%,var(--fr-moss) 100%)}',
    '.hm .intro.fr-on:before{display:none}',
    '.hm .intro.fr-on .intro-text{isolation:isolate;overflow:hidden}',
    '.fr-topo{position:absolute;inset:0;z-index:-3;pointer-events:none}',
    '.fr-topo svg{width:100%;height:100%;display:block}',
    '.fr-topo path{fill:none;stroke:rgba(207,227,168,.055);stroke-width:1}',
    '.fr-topo path.m{stroke:rgba(207,227,168,.12)}',
    '.fr-rays{position:absolute;left:-30%;top:-40%;width:120%;height:160%;z-index:-2;pointer-events:none;transform:rotate(18deg);transform-origin:0 0;',
    '  background:repeating-linear-gradient(90deg,rgba(236,244,214,0) 0px,rgba(236,244,214,.07) 26px,rgba(236,244,214,0) 64px,rgba(236,244,214,0) 120px,rgba(236,244,214,.05) 150px,rgba(236,244,214,0) 210px);',
    '  -webkit-mask-image:linear-gradient(180deg,#000 0%,rgba(0,0,0,.4) 55%,transparent 80%);mask-image:linear-gradient(180deg,#000 0%,rgba(0,0,0,.4) 55%,transparent 80%);filter:blur(10px);animation:frRay 14s ease-in-out infinite alternate}',
    '@keyframes frRay{0%{opacity:.55;transform:rotate(18deg) translateX(0)}100%{opacity:1;transform:rotate(18deg) translateX(40px)}}',
    '.fr-leaves{position:absolute;inset:-8%;z-index:-1;pointer-events:none;filter:blur(5px);opacity:.55;animation:frSway 8s ease-in-out infinite alternate;transform-origin:30% 0}',
    '.fr-leaves svg{width:100%;height:100%;display:block}',
    '@keyframes frSway{0%{transform:rotate(-1deg) translate(0,0)}100%{transform:rotate(1.2deg) translate(14px,6px)}}',
    '.fr-dust{position:absolute;inset:0;z-index:-1;pointer-events:none}',
    '.fr-dust i{position:absolute;width:3px;height:3px;border-radius:50%;background:#eaf5c8;box-shadow:0 0 8px 2px rgba(234,245,200,.45);opacity:0;animation:frFloat var(--d) linear infinite;animation-delay:var(--l)}',
    '@keyframes frFloat{0%{transform:translate(0,0);opacity:0}15%{opacity:.85}85%{opacity:.6}100%{transform:translate(var(--x),-120px);opacity:0}}',
    '.hm .intro.fr-on .intro-title{font-weight:700;letter-spacing:-.05em}',
    '.hm .intro.fr-on .intro-title em{color:var(--fr-leaf);background-image:linear-gradient(100deg,#e3efc0 0%,#b9dca0 50%,#e3efc0 100%) !important;background-size:200% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:frShine 7s ease-in-out infinite}',
    '@keyframes frShine{0%,100%{background-position:0 0}50%{background-position:100% 0}}',
    '.intro-text.hc-hero{isolation:isolate}',
    '.hc-meta{position:absolute;left:48px;right:48px;top:38px;display:flex;align-items:center;gap:12px;font:600 10.5px/1 ' + SANS + ';letter-spacing:.24em;color:rgba(233,240,227,.72)}',
    '.hc-meta svg{width:14px;height:14px;flex:none}',
    '.hc-meta i{flex:1;height:1px;background:rgba(233,240,227,.18)}',
    '.hc-meta span{letter-spacing:.08em;color:rgba(233,240,227,.42);font-variant-numeric:tabular-nums}',
    '.sf-foot{position:absolute;left:48px;right:48px;bottom:30px;display:flex;font:500 11px/1.4 ' + SANS + ';color:rgba(233,240,227,.55)}',
    '.sf-foot div{padding:0 18px;border-left:1px solid rgba(233,240,227,.16)}.sf-foot div:first-child{padding-left:0;border-left:0}',
    '.sf-foot strong{display:block;font:600 15px/1.3 ' + SANS + ';color:#fff;letter-spacing:-.01em}',
    /* 실시간 카드 */
    '.intro-text .hl-card{position:relative;left:auto;top:auto;align-self:flex-start;margin:28px 0 64px;min-width:300px;padding:13px 16px 12px;border-radius:14px;background:rgba(233,240,227,.07);border:1px solid rgba(233,240,227,.16);box-shadow:none;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}',
    '.intro-text .hl-card .hl-main{font-size:14px}.intro-text .hl-card .hl-main b{font-size:19px}',
    '.intro-text .hl-card .hl-n{font-size:15px}',
    '.intro-text .hl-card .hl-bar i{background:var(--fr-leaf)}',
    '@media (max-width:760px){.hc-meta{left:22px;right:22px;top:18px;font-size:9.5px}.hc-meta span{display:none}.intro-text .hl-card{min-width:0;margin:22px 0 70px}.sf-foot{left:22px;right:22px;bottom:18px}.sf-foot div{padding:0 10px}.sf-foot strong{font-size:13px}}',
    '@media (prefers-reduced-motion:reduce){.fr-rays,.fr-leaves,.fr-dust i,.hm .intro.fr-on .intro-title em{animation:none}.fr-dust{display:none}}',
    /* 숲 패널 공통(지표·문제·흐름도) */
    '.fr-panel{position:relative;isolation:isolate}',
    '.fr-panel > .fr-topo{position:absolute;inset:0;z-index:-1;border-radius:inherit;overflow:hidden}',
    '.fr-panel > .fr-topo path{stroke:rgba(207,227,168,.07)}',
    /* ---------- 구간 머리 ---------- */
    '.hm .part.hc-on{position:relative;isolation:isolate;overflow:hidden}',
    '.hm .part.hc-on .hm-head .hm-eyebrow{display:none}',
    '.hc-idx{display:flex;align-items:center;gap:14px;margin:0 0 6px;font:700 12px/1 ' + SANS + ';letter-spacing:.2em;color:var(--ink)}',
    '.hc-idx .n{color:var(--brand);font-variant-numeric:tabular-nums;letter-spacing:.04em}',
    '.hc-idx .r{width:44px;height:1px;background:var(--ink);opacity:.35;transform:scaleX(0);transform-origin:left;transition:transform .9s cubic-bezier(.2,.7,.2,1) .1s}',
    '.hc-idx .ko{letter-spacing:0;font-weight:700;color:var(--ink)}',
    '.hc-idx .en{font-weight:600;color:var(--muted)}',
    '.hm-head.in .hc-idx .r,.hc-noanim .hc-idx .r{transform:scaleX(1)}',
    '.hc-terms{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}',
    '.hc-terms span{padding:5px 10px;border-radius:999px;border:1px solid var(--hair);background:var(--surface);font:600 12px/1 ' + SANS + ';color:var(--ink-2)}',
    '.hc-terms span em{font-style:normal;color:var(--muted);font-weight:500;margin-left:5px;font-size:11px;letter-spacing:.04em}',
    '.hc-big-n{position:absolute;right:40px;top:18px;z-index:-1;pointer-events:none;font:200 168px/1 ' + SANS + ';letter-spacing:-.06em;color:transparent;-webkit-text-stroke:1px color-mix(in srgb,var(--ink) 12%,transparent);font-variant-numeric:tabular-nums}',
    '@media (max-width:760px){.hc-big-n{font-size:96px;right:14px;top:10px}.hc-idx .en{display:none}}',
    /* ---------- 현황 지표: 어두운 패널 ---------- */
    '.hm .hm-stats.hc-dark{gap:0;padding:6px;border-radius:24px;background:radial-gradient(100% 120% at 100% 0%,rgba(207,227,168,.10),transparent 55%),linear-gradient(160deg,var(--fr-deep) 0%,var(--fr-forest) 55%,var(--fr-moss) 100%);box-shadow:0 24px 50px -32px rgba(12,28,21,.6);',
    '  --brand:var(--fr-leaf);--surface-3:rgba(233,240,227,.12);--axis:var(--fr-sage);--muted:rgba(233,240,227,.55);--serious:var(--fr-amber)}',
    '.hc-dark .hm-stat{background:transparent;border:0;border-radius:18px;padding:24px 22px 20px;position:relative;transition:background .3s}',
    '.hc-dark .hm-stat+.hm-stat::before{content:"";position:absolute;left:0;top:22px;bottom:22px;width:1px;background:var(--hc-line)}',
    '.hc-dark .hm-stat:hover{background:rgba(255,255,255,.07)}',
    '.hc-dark .hm-stat b.num{color:#fff;font-weight:600;letter-spacing:-.045em}',
    '.hc-dark .hm-stat span{color:rgba(255,255,255,.78)}',
    '.hc-dark .hm-stat em{color:rgba(255,255,255,.42)}',
    '.hc-code{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;font:700 10.5px/1 ' + SANS + ';letter-spacing:.2em;color:var(--hc-mint)}',
    '.hc-code i{font-style:normal;font-weight:600;letter-spacing:.02em;color:rgba(255,255,255,.45);font-size:11px}',
    '.hc-viz{margin-top:auto;padding-top:14px;border-top:1px solid var(--hc-line)}',
    '.hc-viz svg{display:block;width:100%;height:auto;overflow:visible}',
    '.hc-viz .t{font:500 9px ' + SANS + ';fill:rgba(255,255,255,.5)}',
    '.hc-viz .tb{font:700 9.5px ' + SANS + ';fill:#fff}',
    '.hc-draw{stroke-dasharray:var(--len);stroke-dashoffset:var(--len);transition:stroke-dashoffset 1.6s cubic-bezier(.2,.7,.2,1) .2s}',
    '.hc-in .hc-draw{stroke-dashoffset:0}',
    '.hc-grow{transform:scaleX(0);transform-origin:left;transform-box:fill-box;transition:transform 1.2s cubic-bezier(.2,.7,.2,1) .25s}',
    '.hc-in .hc-grow{transform:scaleX(1)}',
    '.hc-pulse circle.p{transform-box:fill-box;transform-origin:center;animation:hcPulse 2.6s ease-out infinite}',
    '.hc-pulse circle.p:nth-of-type(2){animation-delay:.85s}.hc-pulse circle.p:nth-of-type(3){animation-delay:1.7s}',
    '@keyframes hcPulse{from{transform:scale(.3);opacity:.9}to{transform:scale(2.4);opacity:0}}',
    '@media (max-width:900px){.hc-dark .hm-stat+.hm-stat::before{left:22px;right:22px;top:0;bottom:auto;width:auto;height:1px}}',
    /* 소제목 영문 태그 · 핵심 문장 */
    '.hc-tag{margin-left:10px;font:600 9.5px/1 ' + SANS + ';letter-spacing:.2em;color:var(--muted)}',
    '.hc-key{display:block;margin-bottom:8px;font:700 10.5px/1.3 ' + SANS + ';letter-spacing:.2em;color:var(--brand)}',
    /* ---------- 문제: 큰 수치 ---------- */
    '.hc-big{display:flex;align-items:flex-end;gap:14px;margin:16px 0 4px;padding-top:16px;border-top:1px solid rgba(255,255,255,.16)}',
    '.hc-big strong{font:700 52px/0.9 ' + SANS + ';font-variant-numeric:tabular-nums;letter-spacing:-.05em;color:#fff}',
    '.hc-big small{display:block;font:500 12px/1.5 ' + SANS + ';color:rgba(255,255,255,.7);padding-bottom:2px}',
    '.hc-big small i{display:block;font-style:normal;font-weight:700;font-size:10px;letter-spacing:.2em;color:var(--hc-lime)}',
    '.hm-scenes .hm-scene .hm-but{background:radial-gradient(90% 120% at 100% 0%,rgba(207,227,168,.12),transparent 55%),linear-gradient(160deg,var(--fr-deep),var(--fr-moss));box-shadow:0 24px 50px -32px rgba(12,28,21,.6)}',
    '.hm-scenes .hm-scene + .hm-scene .hm-but{background:radial-gradient(110% 130% at 105% -5%,rgba(242,182,84,.6),rgba(242,182,84,.12) 45%,transparent 70%),linear-gradient(160deg,#0f2117,#22402c);box-shadow:0 24px 50px -32px rgba(12,28,21,.6)}',
    '.hm-scenes .hm-scene + .hm-scene .hc-big small i{color:#ffe7a8}',
    '.hm-scenes .hm-scene .hm-but h3{color:#fff}',
    '.hm-scenes .hm-scene .hm-but .hm-label{color:rgba(255,255,255,.65)}',
    '.hc-term-chip{display:inline-block;margin-left:10px;font:600 10px/1 ' + SANS + ';letter-spacing:.2em;color:var(--muted);vertical-align:middle}',
    /* ---------- 시스템 흐름도 ---------- */
    '.hc-flow{margin-top:22px;padding:26px 26px 20px;border-radius:24px;background:radial-gradient(80% 120% at 100% 0%,rgba(207,227,168,.10),transparent 55%),linear-gradient(160deg,#0b1712,#16291f);color:#eef3ea;box-shadow:0 24px 50px -32px rgba(12,28,21,.6)}',
    '.hc-flow-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:18px;font:700 11px/1.3 ' + SANS + ';letter-spacing:.22em;color:var(--hc-mint)}',
    '.hc-flow-h span{color:rgba(255,255,255,.55);font-weight:500;letter-spacing:0;font-size:13px}',
    '.hc-flow svg{display:block;width:100%;height:auto}',
    '.hc-flow .nd rect{fill:rgba(255,255,255,.07);stroke:rgba(255,255,255,.18);stroke-width:1}',
    '.hc-flow .nd.hot rect{fill:rgba(207,227,168,.10);stroke:var(--fr-leaf)}',
    '.hc-flow .k{font:700 10px ' + SANS + ';letter-spacing:.2em;fill:var(--fr-leaf)}',
    '.hc-flow .h{font:700 16px ' + SANS + ';fill:#fff}',
    '.hc-flow .s{font:500 11.5px ' + SANS + ';fill:rgba(255,255,255,.6)}',
    '.hc-flow .ln{fill:none;stroke:rgba(255,255,255,.22);stroke-width:1.2}',
    '.hc-flow .fb{stroke:var(--fr-amber);stroke-dasharray:3 5;animation:hcDash 1.4s linear infinite}',
    '.hc-flow .fbt{font:600 10.5px ' + SANS + ';letter-spacing:.14em;fill:var(--fr-amber)}',
    '.hc-flow .hc-dot{fill:var(--hc-mint)}',
    '@keyframes hcDash{to{stroke-dashoffset:-16}}',
    '.hc-flow-m{display:none}',
    /* ---------- 근거 카드 용어 ---------- */
    '.hc-term{font:700 9.5px/1.3 ' + SANS + ';letter-spacing:.2em;color:var(--brand)}',
    '.hc-term i{font-style:normal;color:var(--muted);letter-spacing:0;font-weight:600;margin-left:6px}',
    '@media (max-width:760px){.hc-flow-d{display:none}.hc-flow-m{display:block}.hc-big strong{font-size:40px}}',
    '@media (prefers-reduced-motion:reduce){.hc-flow .fb,.hc-pulse circle.p,.hc-sky .tw{animation:none}.hc-draw,.hc-grow,.hc-idx .r{transition:none}}',
  ].join('\n');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  var SEC = [
    { sel: 'section.hm-visit', no: '01', en: 'SITE ANALYSIS', terms: [['광역 집객권', 'Catchment'], ['수요 변동성', 'Demand Volatility'], ['역세권 접근성', 'TOD']] },
    { sel: 'section.hm-scenes', no: '02', en: 'PROBLEM DEFINITION', terms: [['정보 비대칭', 'Information Asymmetry'], ['하계 이용 저점', 'Seasonal Trough']] },
    { sel: 'section.hm-answer', no: '03', en: 'STRATEGY', terms: [['상황 인지형 경로 추천', 'Context-aware Routing'], ['이용 후 평가', 'POE'], ['환류 체계', 'Feedback Loop']] },
    { sel: 'section.hm-why', no: '04', en: 'EVIDENCE BASE', terms: [['열쾌적성', 'Thermal Comfort'], ['우회 허용', 'Detour Ratio'], ['혼잡 지각', 'Perceived Crowding']] },
  ];

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('hc-in'); io.unobserve(e.target); } });
  }, { threshold: 0.35 }) : null;
  function watch(n) { if (reduce || !io) n.classList.add('hc-in'); else io.observe(n); }


  // 숲 지형 등고선(모식): 봉우리 두 개 둘레로 일그러진 닫힌 곡선
  var LEAF = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13C3 7 7 3 13 3c0 6-4 10-10 10Z" fill="none" stroke="#cfe3a8" stroke-width="1.3"/><path d="M3 13l6-6" stroke="#cfe3a8" stroke-width="1.3"/></svg>';
  function topo(W, H, seed) {
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var peaks = [[W * (0.7 + rnd() * 0.2), H * (0.2 + rnd() * 0.3)], [W * (0.1 + rnd() * 0.3), H * (0.7 + rnd() * 0.3)]], s = '';
    peaks.forEach(function (p, pi) {
      var ph = [rnd() * 6, rnd() * 6, rnd() * 6];
      for (var r = 30; r < Math.max(W, H) * 0.9; r += 30) {
        var d = '';
        for (var a = 0; a <= 64; a++) {
          var th = a / 64 * Math.PI * 2;
          var rr = r * (1 + 0.16 * Math.sin(3 * th + ph[0] + r * 0.01) + 0.08 * Math.sin(5 * th + ph[1]) + 0.05 * Math.sin(9 * th + ph[2] + r * 0.02));
          d += (a ? 'L' : 'M') + (p[0] + rr * Math.cos(th) * 1.25).toFixed(1) + ' ' + (p[1] + rr * Math.sin(th)).toFixed(1);
        }
        s += '<path' + ((r / 30) % 4 < 1 ? ' class="m"' : '') + ' d="' + d + 'Z"/>';
      }
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + s + '</svg>';
  }
  // 위에서 드리운 잎 그림자
  function leaves() {
    var seed = 5; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var s = '';
    for (var i = 0; i < 26; i++) {
      var x = rnd() * 700, y = rnd() < 0.7 ? rnd() * 160 : 380 + rnd() * 160, sc = 0.7 + rnd() * 1.4, rot = rnd() * 360;
      s += '<path transform="translate(' + x.toFixed(0) + ' ' + y.toFixed(0) + ') rotate(' + rot.toFixed(0) + ') scale(' + sc.toFixed(2) + ')" d="M0 0C10-12 34-14 52 0C34 14 10 12 0 0Z" fill="rgba(3,10,7,.55)"/>';
    }
    return '<svg viewBox="0 0 700 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + s + '</svg>';
  }

  // ---------- 지표 카드 미니 차트 ----------
  var MONTH = [3959, 4388, 5097, 6264, 8864, 5890, 4658, 4557, 5412, 6203]; // 화면의 서울숲역 낮 평균 하차(1~10월)
  function vizRing() {
    var r = 17, c = 2 * Math.PI * r, v = 0.734;
    return '<svg viewBox="0 0 200 44" aria-hidden="true"><g transform="translate(22 22)"><circle r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="4"/>' +
      '<circle class="hc-draw" r="' + r + '" fill="none" stroke="var(--brand)" stroke-width="4" stroke-linecap="round" transform="rotate(-90)" style="--len:' + c.toFixed(1) + ';stroke-dasharray:' + (c * v).toFixed(1) + ' ' + c.toFixed(1) + '"/></g>' +
      '<text class="tb" x="52" y="19">비거주 73.4%</text><text class="t" x="52" y="33">거주 26.6% (100−73.4)</text></svg>';
  }
  function vizShare() {
    return '<svg viewBox="0 0 200 44" aria-hidden="true">' +
      '<text class="tb" x="0" y="11">서울숲 33.7%</text><rect x="0" y="16" width="200" height="5" rx="2.5" fill="var(--surface-3)"/><rect class="hc-grow" x="0" y="16" width="' + (200 * .337 / .4).toFixed(0) + '" height="5" rx="2.5" fill="var(--brand)"/>' +
      '<text class="t" x="0" y="34">여의도공원 10.0%</text><rect x="0" y="38" width="200" height="4" rx="2" fill="var(--surface-3)"/><rect class="hc-grow" x="0" y="38" width="' + (200 * .10 / .4).toFixed(0) + '" height="4" rx="2" fill="var(--axis)"/></svg>';
  }
  function vizPulse() {
    return '<svg class="hc-pulse" viewBox="0 0 200 44" aria-hidden="true"><g transform="translate(20 22)"><circle class="p" r="8" fill="none" stroke="var(--brand)" stroke-width="1.2"/><circle class="p" r="8" fill="none" stroke="var(--brand)" stroke-width="1.2"/><circle class="p" r="8" fill="none" stroke="var(--brand)" stroke-width="1.2"/><circle r="4" fill="var(--brand)"/></g>' +
      '<text class="tb" x="48" y="19">180일 누적</text><text class="t" x="48" y="33">두 공원 일평균 약 7.8만 명 (÷180)</text></svg>';
  }
  function vizSpark() {
    var max = 9000, w = 200, h = 30, n = MONTH.length;
    var pts = MONTH.map(function (v, i) { return [(i / (n - 1)) * w, h - (v / max) * h + 12]; });
    var d = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L');
    var len = 0; for (var i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    var dots = pts.map(function (p, i) { return (i === 4 || i === 7) ? '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6" fill="' + (i === 4 ? 'var(--brand)' : 'var(--serious)') + '"/>' : ''; }).join('');
    return '<svg viewBox="0 0 200 44" aria-hidden="true"><path d="' + d + 'L200 44L0 44Z" fill="var(--brand)" opacity=".1"/><path class="hc-draw" d="' + d + '" fill="none" stroke="var(--brand)" stroke-width="1.6" stroke-linejoin="round" style="--len:' + len.toFixed(0) + '"/>' + dots +
      '<text class="t" x="0" y="7">낮 평균 1~10월</text><text class="t" x="200" y="7" text-anchor="end">5월 최고 · 8월 최저</text></svg>';
  }
  var KPI = [
    { code: 'NRR', name: '비거주 유입률', viz: vizRing },
    { code: 'SOV', name: '온라인 언급 점유', viz: vizShare },
    { code: 'PEAK', name: '이벤트 집객', viz: vizPulse },
    { code: 'TOD', name: '역세권 접근 수요', viz: vizSpark },
  ];

  function decorate() {
    var hm = document.querySelector('.hm');
    if (!hm) return;

    // 0) 첫 화면
    var intro = hm.querySelector('section.intro'), it = intro && intro.querySelector('.intro-text');
    if (intro) intro.classList.add('fr-on');
    if (it && !it.querySelector('.hc-meta')) {
      it.classList.add('hc-hero');
      it.appendChild(el('div', 'hc-meta', LEAF + 'SEOUL FOREST · 서울숲<i></i><span>37.5444°N 127.0374°E</span>'));
      it.appendChild(el('div', 'fr-topo', topo(700, 520, 21)));
      it.appendChild(el('div', 'fr-rays'));
      it.appendChild(el('div', 'fr-leaves', leaves()));
      if (!reduce) {
        var dust = el('div', 'fr-dust');
        for (var k = 0; k < 16; k++) {
          var d = document.createElement('i');
          d.style.cssText = 'left:' + (8 + (k * 37) % 84) + '%;top:' + (35 + (k * 53) % 60) + '%;--d:' + (9 + (k % 5) * 2.5) + 's;--l:' + (-k * 1.3) + 's;--x:' + ((k % 2 ? 1 : -1) * (10 + k % 4 * 8)) + 'px;transform:scale(' + (0.6 + (k % 3) * 0.3) + ')';
          dust.appendChild(d);
        }
        it.appendChild(dust);
      }
      it.appendChild(el('div', 'sf-foot', '<div><strong>480,994㎡</strong>공원 면적</div><div><strong>2005</strong>개원</div><div><strong>도보 2분</strong>서울숲역</div>'));
    }

    // 1) 구간 머리
    SEC.forEach(function (s) {
      var sec = hm.querySelector(s.sel);
      if (!sec || sec.classList.contains('hc-on')) return;
      sec.classList.add('hc-on');
      sec.appendChild(el('div', 'hc-big-n', s.no));
      var head = sec.querySelector('.hm-head');
      if (head && !head.querySelector('.hc-idx')) {
        var ey = head.querySelector('.hm-eyebrow'), ko = ey ? ey.textContent.trim() : '';
        head.insertBefore(el('div', 'hc-idx', '<span class="n">' + s.no + '</span><i class="r"></i><span class="ko">' + ko + '</span><span class="en">' + s.en + '</span>'), head.firstChild);
        head.appendChild(el('div', 'hc-terms', s.terms.map(function (t) { return '<span>' + t[0] + '<em>' + t[1] + '</em></span>'; }).join('')));
        if (reduce) head.classList.add('hc-noanim');
      }
    });

    // 2) 현황 지표: 어두운 패널
    var grid = hm.querySelector('section.hm-visit .hm-stats');
    if (grid) { grid.classList.add('hc-dark', 'fr-panel'); if (!grid.querySelector(':scope > .fr-topo')) grid.appendChild(el('div', 'fr-topo', topo(1200, 300, 5))); }
    hm.querySelectorAll('section.hm-visit .hm-stat').forEach(function (st, i) {
      if (st.querySelector('.hc-code') || !KPI[i]) return;
      st.insertBefore(el('div', 'hc-code', KPI[i].code + '<i>' + KPI[i].name + '</i>'), st.firstChild);
      var v = el('div', 'hc-viz', KPI[i].viz()); st.appendChild(v); watch(v);
    });
    var tags = { '부지 변천': 'LAND-USE HISTORY', '서울시 주요 공원 면적 비교': 'SCALE BENCHMARK' };
    hm.querySelectorAll('section.hm-visit .hm-label').forEach(function (l) {
      var k = l.textContent.trim();
      if (tags[k] && !l.querySelector('.hc-tag')) l.appendChild(el('span', 'hc-tag', tags[k]));
    });
    var turn = hm.querySelector('section.hm-visit .hm-turn');
    if (turn && !turn.querySelector('.hc-key')) turn.insertBefore(el('span', 'hc-key', 'KEY INSIGHT'), turn.firstChild);

    // 3) 문제: 큰 수치
    var PB = [
      { chip: 'INFORMATION ASYMMETRY', big: '40.2%', k: 'FIRST-VISIT RATIO', s: '방문객 중 처음 온 사람 비율' },
      { chip: 'SEASONAL TROUGH', big: '−48.6%', k: 'MAY → AUG', s: '낮 하차 8,864 → 4,557명 (4,557÷8,864−1)' },
    ];
    hm.querySelectorAll('section.hm-scenes .hm-scene').forEach(function (sc, i) {
      if (!PB[i] || sc.querySelector('.hc-term-chip')) return;
      var tag = sc.querySelector('.hm-scene-tag');
      if (tag) tag.appendChild(el('span', 'hc-term-chip', PB[i].chip));
      var but = sc.querySelector('.hm-but');
      if (but) {
        var h3 = but.querySelector('h3');
        var big = el('div', 'hc-big', '<strong>' + PB[i].big + '</strong><small><i>' + PB[i].k + '</i>' + PB[i].s + '</small>');
        if (h3) h3.insertAdjacentElement('afterend', big); else but.appendChild(big);
        countUp(big.querySelector('strong'));
      }
    });

    // 4) 전략: 모듈 태그 + 흐름도
    var MOD = ['CONTEXT-AWARE ROUTING', 'POST-OCCUPANCY EVALUATION'];
    hm.querySelectorAll('section.hm-answer .hm-goal').forEach(function (g, i) {
      var sm = g.querySelector('.hm-goal-top small');
      if (sm && MOD[i] && !sm.querySelector('.hc-tag')) sm.appendChild(el('span', 'hc-tag', MOD[i]));
    });
    var gw = hm.querySelector('section.hm-answer .hm-goals');
    if (gw && !hm.querySelector('.hc-flow')) { var fl = flow(); fl.classList.add('fr-panel'); fl.appendChild(el('div', 'fr-topo', topo(1200, 260, 13))); gw.insertAdjacentElement('afterend', fl); }

    // 5) 근거: 카드별 전문용어
    var TERMS = [['THERMAL COMFORT', '열쾌적성'], ['DETOUR RATIO', '우회율'], ['DWELL TIME', '체류시간'], ['IPA', '중요도-만족도'], ['DISPLACEMENT', '혼잡 회피']];
    hm.querySelectorAll('section.hm-why .hm-whyc').forEach(function (c, i) {
      if (!TERMS[i] || c.querySelector('.hc-term')) return;
      c.insertBefore(el('div', 'hc-term', TERMS[i][0] + '<i>' + TERMS[i][1] + '</i>'), c.firstChild);
    });
  }

  function countUp(node) {
    var orig = node.textContent, m = orig.match(/[\d.]+/);
    if (!m || reduce || !io) return;
    var v = parseFloat(m[0]), dec = (m[0].split('.')[1] || '').length;
    var o = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return; o.disconnect();
      var t0 = 0;
      (function f(ts) {
        if (!t0) t0 = ts;
        var k = Math.min(1, (ts - t0) / 1400), e = 1 - Math.pow(1 - k, 3);
        node.textContent = k < 1 ? orig.replace(m[0], (v * e).toFixed(dec)) : orig;
        if (k < 1) requestAnimationFrame(f);
      })(performance.now());
    }, { threshold: .6 });
    o.observe(node);
  }

  var N = [
    { k: 'INPUT', h: '상황 데이터', s: ['기상·체감온도', '혼잡도·동행·체류시간'] },
    { k: 'ENGINE', h: '가중 경로 탐색', s: ['그늘·혼잡 가중치', '우회 허용 ≤ 1.2×'], hot: 1 },
    { k: 'OUTPUT', h: '맞춤 코스', s: ['다지점 코스', '쉴 곳·화장실 연계'] },
    { k: 'FEEDBACK', h: '장소별 평가', s: ['별점·좋았던/아쉬운 점', '장소별 만족도 누적'] },
  ];
  function flow() {
    var W = 1000, bw = 214, bh = 108, gap = (W - bw * 4) / 3, y = 4, s = '';
    N.forEach(function (n, i) {
      var x = i * (bw + gap);
      s += '<g class="nd' + (n.hot ? ' hot' : '') + '"><rect x="' + (x + .5) + '" y="' + (y + .5) + '" width="' + bw + '" height="' + bh + '" rx="16"/>' +
        '<text class="k" x="' + (x + 18) + '" y="' + (y + 26) + '">' + String(i + 1).padStart(2, '0') + '  ' + n.k + '</text>' +
        '<text class="h" x="' + (x + 18) + '" y="' + (y + 54) + '">' + n.h + '</text>' +
        '<text class="s" x="' + (x + 18) + '" y="' + (y + 77) + '">' + n.s[0] + '</text><text class="s" x="' + (x + 18) + '" y="' + (y + 94) + '">' + n.s[1] + '</text></g>';
      if (i < 3) {
        var x1 = x + bw + 4, x2 = x + bw + gap - 4, yy = y + bh / 2, id = 'hcp' + i;
        s += '<path id="' + id + '" class="ln" d="M' + x1 + ' ' + yy + 'H' + x2 + '"/><path d="M' + (x2 - 5) + ' ' + (yy - 4) + 'L' + x2 + ' ' + yy + 'L' + (x2 - 5) + ' ' + (yy + 4) + '" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.2"/>';
        if (!reduce) s += '<circle class="hc-dot" r="2.6"><animateMotion dur="2s" begin="' + (i * 0.5) + 's" repeatCount="indefinite"><mpath href="#' + id + '"/></animateMotion></circle>';
      }
    });
    var fx1 = 3 * (bw + gap) + bw / 2, fx2 = (bw + gap) + bw / 2, fy = y + bh + 6;
    s += '<path id="hcfb" class="ln fb" d="M' + fx1 + ' ' + fy + 'V' + (fy + 34) + 'H' + fx2 + 'V' + (fy + 4) + '"/>';
    if (!reduce) s += '<circle r="2.8" fill="#e2b15c"><animateMotion dur="3.4s" repeatCount="indefinite"><mpath href="#hcfb"/></animateMotion></circle>';
    s += '<text class="fbt" x="' + ((fx1 + fx2) / 2) + '" y="' + (fy + 27) + '" text-anchor="middle">FEEDBACK LOOP — 평가가 다음 추천의 가중치를 갱신</text>';
    var box = el('div', 'hc-flow');
    box.innerHTML = '<div class="hc-flow-h">SYSTEM ARCHITECTURE <span>목표 1(추천)과 목표 2(만족도)는 하나의 순환 구조로 연결된다</span></div>' +
      '<div class="hc-flow-d"><svg viewBox="0 0 ' + W + ' ' + (bh + 50) + '" role="img" aria-label="상황 데이터, 가중 경로 탐색, 맞춤 코스, 장소별 평가가 순환하는 구조">' + s + '</svg></div>' +
      '<div class="hc-flow-m">' + flowMobile() + '</div>';
    return box;
  }
  function flowMobile() {
    var s = '', y = 0, W = 320, bw = 280, bh = 74;
    N.forEach(function (n, i) {
      s += '<g class="nd' + (n.hot ? ' hot' : '') + '"><rect x=".5" y="' + (y + .5) + '" width="' + bw + '" height="' + bh + '" rx="14"/>' +
        '<text class="k" x="14" y="' + (y + 21) + '">' + String(i + 1).padStart(2, '0') + '  ' + n.k + '</text><text class="h" x="14" y="' + (y + 44) + '">' + n.h + '</text>' +
        '<text class="s" x="14" y="' + (y + 63) + '">' + n.s.join(' · ') + '</text></g>';
      if (i < 3) s += '<path class="ln" d="M' + (bw / 2) + ' ' + (y + bh + 3) + 'V' + (y + bh + 19) + '"/>';
      y += bh + 22;
    });
    var top = 74 + 22 + 37, bot = y - 22 - 37;
    s += '<path class="ln fb" d="M' + bw + ' ' + bot + 'H' + (W - 14) + 'V' + top + 'H' + bw + '"/><text class="fbt" x="' + (W - 4) + '" y="' + ((top + bot) / 2) + '" transform="rotate(90 ' + (W - 4) + ' ' + ((top + bot) / 2) + ')" text-anchor="middle">FEEDBACK</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + (y - 22) + '" role="img" aria-label="상황 데이터에서 장소별 평가까지 순환 구조">' + s + '</svg>';
  }

  var st = document.createElement('style'); st.id = 'hc-style'; st.textContent = css;
  document.head.appendChild(st);
  var root = document.getElementById('root') || document.body, q = false;
  new MutationObserver(function () {
    if (q) return; q = true;
    requestAnimationFrame(function () { q = false; decorate(); });
  }).observe(root, { childList: true, subtree: true });
  decorate();
})();
