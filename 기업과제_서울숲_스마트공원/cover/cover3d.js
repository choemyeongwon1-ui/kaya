/*
 * 서울숲, 오늘 나에게 맞는 길 — 표지 (다크 3D 도시판)
 * 대시보드 HTML <head> 안에 한 줄:
 *   <script src="(경로)/cover/cover3d.js"></script>
 * 같은 폴더의 city.js(서울숲 주변 건물·물길·도로, OpenStreetMap)를 함께 불러옵니다.
 *
 * 옵션: data-auto="8000"(8초 뒤 자동으로 넘어감) · data-once="session"(탭당 한 번) · 주소에 ?cover=0 → 표지 생략
 * 바닥과 지붕은 실제 위성사진(Esri World Imagery), 건물은 OSM 실제 건물 윤곽을 높이만큼 세움.
 * three.js(CDN)로 그림. 인터넷이 없거나 WebGL이 안 되면 글자만 있는 어두운 표지로 대신 보여 줌.
 */
(function () {
  'use strict';
  var me = document.currentScript || {};
  var ds = me.dataset || {};
  // 대시보드 열기 → 이동할 주소 (script 태그에 data-href로 바꿀 수 있음, data-href="" 이면 이동 없이 표지만 걷힘)
  var DASH = 'https://choemyeongwon1-ui.github.io/kaya/%EA%B8%B0%EC%97%85%EA%B3%BC%EC%A0%9C_%EC%84%9C%EC%9A%B8%EC%88%B2_%EC%8A%A4%EB%A7%88%ED%8A%B8%EA%B3%B5%EC%9B%90/recovery-station/index.html?v=5#home';
  var opt = { auto: +(ds.auto || 0), once: ds.once || '', href: ds.href != null ? ds.href : DASH };
  try { // 이미 그 대시보드 페이지 안에 표지가 붙어 있으면 이동하지 않음
    if (opt.href && new URL(opt.href, location.href).pathname === location.pathname) opt.href = '';
  } catch (e) {}
  try {
    if (/[?&]cover=0\b/.test(location.search)) return;
    if (opt.once === 'session' && sessionStorage.getItem('sf-cover-seen')) return;
  } catch (e) {}
  var BASE = (me.src || '').replace(/[^/]*$/, '');
  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FIXT = (location.search.match(/[?&]sf3t=([\d.]+)/) || [])[1]; // 확인용: 특정 시점 장면 고정
  var LON0 = 127.0374, LAT0 = 37.5443;
  var KX = Math.cos(LAT0 * Math.PI / 180) * 111320, KY = 110574;

  // ── 스타일 ──────────────────────────────────────────────────
  var CSS = [
    '#sf3{--ink:#eef0ff;--ink2:rgba(226,230,255,.62);--mute:rgba(226,230,255,.38);--line:rgba(226,230,255,.18);--vio:#7b74ff;--vio2:#a9a4ff;--ease:cubic-bezier(.16,1,.3,1);',
    '  position:fixed;inset:0;z-index:2147483000;overflow:hidden;color:var(--ink);background:#05070d;',
    '  font-family:"IBM Plex Sans KR","IBM Plex Sans",-apple-system,system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-.005em}',
    '#sf3 *{box-sizing:border-box}',
    '#sf3 canvas{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 1.4s ease}',
    '#sf3.gl canvas{opacity:1}',
    '#sf3 .shade{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity 1.6s ease;background:linear-gradient(90deg,rgba(5,7,13,.78) 0%,rgba(5,7,13,.45) 30%,transparent 55%),linear-gradient(0deg,rgba(5,7,13,.6),transparent 25%),linear-gradient(180deg,rgba(5,7,13,.55),transparent 18%)}',
    '#sf3.ui .shade{opacity:1}',
    /* 로딩 */
    '#sf3 .load{position:absolute;inset:0;display:grid;place-items:center;z-index:5;transition:opacity .9s ease,transform 1.2s var(--ease)}',
    '#sf3.ready .load{opacity:0;transform:scale(1.25);pointer-events:none}',
    '#sf3 .ring{position:relative;width:240px;height:240px}',
    '#sf3 .ring svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
    '#sf3 .ring .spin{animation:sf3Spin 9s linear infinite;transform-origin:120px 120px}',
    '#sf3 .ring .spin2{animation:sf3Spin 5s linear infinite reverse;transform-origin:120px 120px}',
    '#sf3 .core{position:absolute;left:50%;top:50%;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;background:radial-gradient(circle,#05070d 52%,transparent 54%),conic-gradient(from 0deg,#7b74ff,#3b35c9,#a9a4ff,#7b74ff);',
    '  box-shadow:0 0 40px rgba(123,116,255,.55),inset 0 0 18px rgba(123,116,255,.6);animation:sf3Spin 2.4s linear infinite}',
    '#sf3 .dot{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;box-shadow:0 0 18px #fff}',
    '#sf3 .ltxt{position:absolute;left:50%;top:calc(50% + 160px);transform:translateX(-50%);text-align:center;white-space:nowrap;font-size:12px;letter-spacing:.24em;font-weight:600;color:var(--ink2)}',
    '#sf3 .ltxt .roll{display:inline-flex;flex-direction:column;height:1.6em;overflow:hidden;vertical-align:middle;margin:0 .5em;color:#fff}',
    '#sf3 .ltxt .roll span{height:1.6em;line-height:1.6em;transition:transform .35s var(--ease)}',
    '#sf3 .ltxt small{display:block;margin-top:10px;font-size:10px;letter-spacing:.2em;color:var(--mute)}',
    /* 지명 표시 */
    '#sf3 .tags{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity 1.2s ease}',
    '#sf3.ui .tags{opacity:1}',
    '#sf3 .tag{position:absolute;left:0;top:0;white-space:nowrap}',
    '#sf3 .tag .box{position:relative;padding:7px 12px 7px 11px;border:1px solid rgba(226,230,255,.28);border-radius:3px 10px 3px 3px;background:rgba(10,12,24,.42);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
    '#sf3 .tag .box::before{content:"";position:absolute;right:-1px;top:-1px;width:9px;height:9px;border-top:1px solid #fff;border-right:1px solid #fff;border-radius:0 8px 0 0}',
    '#sf3 .tag b{display:block;font-size:11px;font-weight:600;letter-spacing:.14em;color:#fff}',
    '#sf3 .tag i{display:block;font-style:normal;font-size:10.5px;color:var(--ink2);margin-top:2px}',
    /* 글 */
    '#sf3 .ui-el{opacity:0;transform:translateY(14px);transition:opacity 1s ease,transform 1.2s var(--ease)}',
    '#sf3.ui .ui-el{opacity:1;transform:none}',
    '#sf3 .top{position:absolute;z-index:3;left:4.4vw;right:4.4vw;top:4.4vh;display:flex;justify-content:space-between;align-items:center}',
    '#sf3 .logo{display:flex;align-items:center;gap:26px;font-size:13px;letter-spacing:.46em;font-weight:500;color:#fff;font-family:"IBM Plex Mono",ui-monospace,monospace}',
    '#sf3 .logo small{font-size:10.5px;letter-spacing:.2em;color:var(--ink2);font-weight:500}',
    '#sf3 .nav{display:flex;align-items:center;gap:18px;padding:9px 16px;border:1px solid var(--line);border-radius:999px;font:500 10.5px "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.14em;color:var(--ink2);background:rgba(10,12,24,.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}',
    '#sf3 .nav i{width:6px;height:6px;border-radius:50%;background:var(--vio2);box-shadow:0 0 10px var(--vio);display:inline-block;margin-right:8px;animation:sf3Blink 2s ease-in-out infinite}',
    '#sf3 .nav em{font-style:normal;color:#ff6b7a}',
    /* 소리 버튼 */
    '#sf3 .tr{display:flex;align-items:center;gap:10px}',
    '#sf3 .snd{display:inline-flex;align-items:center;gap:9px;height:34px;padding:0 14px 0 12px;border:1px solid var(--line);border-radius:999px;cursor:pointer;font:500 10.5px "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.14em;color:var(--ink2);background:rgba(10,12,24,.3);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:color .3s,border-color .3s,box-shadow .3s}',
    '#sf3 .snd:hover,#sf3 .snd:focus-visible{color:#fff;border-color:rgba(226,230,255,.45);outline:none}',
    '#sf3 .snd .eq{display:inline-flex;align-items:flex-end;gap:2px;height:12px}',
    '#sf3 .snd .eq i{width:2px;height:3px;border-radius:1px;background:currentColor;transition:height .3s}',
    '#sf3 .snd.on{color:#fff;border-color:rgba(169,164,255,.6);box-shadow:0 0 18px rgba(123,116,255,.35)}',
    '#sf3 .snd.on .eq i{background:var(--vio2);animation:sf3Eq 1s ease-in-out infinite}',
    '#sf3 .snd.on .eq i:nth-child(2){animation-delay:-.3s;animation-duration:.8s}#sf3 .snd.on .eq i:nth-child(3){animation-delay:-.55s;animation-duration:1.15s}#sf3 .snd.on .eq i:nth-child(4){animation-delay:-.15s;animation-duration:.9s}',
    '#sf3 .snd.ask{animation:sf3Ask 2.4s ease-in-out infinite}',
    '@keyframes sf3Eq{0%,100%{height:3px}50%{height:12px}}',
    '@keyframes sf3Ask{0%,100%{box-shadow:0 0 0 0 rgba(169,164,255,0)}50%{box-shadow:0 0 0 5px rgba(169,164,255,.18)}}',
    '#sf3 .copy{position:absolute;z-index:3;left:4.4vw;top:50%;transform:translateY(-46%);max-width:min(620px,46vw)}',
    '#sf3 .copy .ui-el{transform:translateY(22px)}#sf3.ui .copy .ui-el{transform:none}',
    '#sf3 .eyebrow{display:flex;align-items:center;gap:12px;font-size:10.5px;font-weight:600;letter-spacing:.3em;color:var(--vio2)}',
    '#sf3 .eyebrow svg{width:16px;height:16px}',
    '#sf3 h1{margin:24px 0 0;font-weight:200;line-height:1.16;letter-spacing:-.03em;font-size:clamp(36px,4.3vw,64px);color:#fff}',
    '#sf3 h1 .ln{display:block;overflow:hidden;padding:.02em 0 .08em}',
    '#sf3 h1 .l2{font-weight:400;color:rgba(238,240,255,.9)}',
    '#sf3 .ch{display:inline-block;transform:translateY(110%);opacity:0;transition:transform 1.1s var(--ease),opacity .8s ease}',
    '#sf3.ui .ch{transform:none;opacity:1}',
    '#sf3 .sub{margin:22px 0 0;font-size:clamp(13px,1vw,15px);line-height:1.8;color:var(--ink2);font-weight:300}',
    '#sf3 .btns{display:flex;align-items:center;gap:10px;margin-top:30px}',
    '#sf3 .go{display:inline-flex;align-items:center;gap:10px;padding:12px 20px 12px 22px;border-radius:999px;border:0;cursor:pointer;font:inherit;font-size:13.5px;font-weight:600;color:#0a0c18;background:#fff;box-shadow:0 0 0 0 rgba(255,255,255,.5);transition:transform .35s var(--ease),box-shadow .35s}',
    '#sf3 .go:hover,#sf3 .go:focus-visible{transform:translateY(-2px);box-shadow:0 0 30px rgba(169,164,255,.55);outline:none}',
    '#sf3 .ghost{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:999px;border:1px solid rgba(226,230,255,.35);font-size:12px;font-weight:500;letter-spacing:.08em;color:var(--ink)}',
    '#sf3 .cred{margin-top:34px;font-size:10.5px;letter-spacing:.04em;color:var(--mute)}',
    '#sf3 .chip{position:absolute;z-index:3;left:4.4vw;bottom:4.4vh;display:flex;align-items:center;gap:9px;padding:7px 13px 7px 9px;border:1px solid var(--line);border-radius:999px;font-size:11px;color:var(--ink2);background:rgba(10,12,24,.3)}',
    '#sf3 .chip b{width:14px;height:14px;border-radius:50%;background:linear-gradient(90deg,#fff 50%,#2a2d45 50%);box-shadow:0 0 0 2px rgba(255,255,255,.15)}',
    '#sf3 .mouse{position:absolute;z-index:3;left:50%;bottom:4vh;margin-left:-9px;width:18px;height:28px;border:1.5px solid rgba(226,230,255,.6);border-radius:10px}',
    '#sf3 .mouse::before{content:"";position:absolute;left:50%;top:5px;width:2px;height:6px;margin-left:-1px;border-radius:2px;background:#fff;animation:sf3Wheel 1.8s ease-in-out infinite}',
    '#sf3 .mouse::after{content:"";position:absolute;left:50%;top:34px;width:6px;height:6px;margin-left:-3px;border-right:1.5px solid rgba(226,230,255,.6);border-bottom:1.5px solid rgba(226,230,255,.6);transform:rotate(45deg)}',
    '#sf3 .compass{position:absolute;z-index:3;right:4.4vw;bottom:4.4vh;text-align:right}',
    '#sf3 .compass svg{width:64px;height:64px;display:block;margin-left:auto}',
    '#sf3 .compass small{display:block;margin-top:8px;font-size:9.5px;color:var(--mute);letter-spacing:.02em}',
    '#sf3 .bar{position:absolute;z-index:4;left:0;bottom:0;height:2px;width:100%;background:linear-gradient(90deg,var(--vio),#fff);transform-origin:left;transform:scaleX(0)}',
    '#sf3.out{pointer-events:none}',
    '#sf3.out .ui-el,#sf3.out .tags{opacity:0!important;transition:opacity .45s ease!important}',
    '#sf3.bye{opacity:0;transition:opacity .6s ease}',
    '#sf3 .veil{position:absolute;inset:0;z-index:9;background:#05070d;opacity:0;pointer-events:none;transition:opacity .55s ease}',
    '#sf3.leave .veil{opacity:1}',
    '@keyframes sf3Spin{to{transform:rotate(360deg)}}',
    '@keyframes sf3Blink{0%,100%{opacity:1}50%{opacity:.3}}',
    '@keyframes sf3Wheel{0%{transform:translateY(0);opacity:1}70%{transform:translateY(8px);opacity:0}100%{opacity:0}}',
    '@keyframes sf3Bar{to{transform:scaleX(1)}}',
    '@media (max-width:820px){',
    '  #sf3 .shade{background:linear-gradient(0deg,rgba(5,7,13,.92) 0%,rgba(5,7,13,.7) 40%,transparent 62%),linear-gradient(180deg,rgba(5,7,13,.6),transparent 15%)}',
    '  #sf3 .copy{left:22px;right:22px;top:auto;bottom:12vh;transform:none;max-width:none}',
    '  #sf3 .top{left:20px;right:20px;top:18px}#sf3 .logo small,#sf3 .nav .hide{display:none}#sf3 .logo{letter-spacing:.3em;font-size:11.5px}',
    '  #sf3 .snd .lb{display:none}#sf3 .snd{height:30px;padding:0 10px}',
    '  #sf3 .chip{left:20px;bottom:18px}#sf3 .compass{right:20px;bottom:16px}#sf3 .compass svg{width:44px;height:44px}#sf3 .compass small{display:none}',
    '  #sf3 .mouse{display:none}#sf3 .ghost{display:none}#sf3 .cred{margin-top:22px}#sf3 .tag .box{padding:5px 9px}#sf3 .tag i{display:none}}',
    '@media (prefers-reduced-motion:reduce){#sf3 *,#sf3{animation:none!important;transition-duration:.25s!important;transition-delay:0s!important}}'
  ].join('\n');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function chars(text, base, step) {
    return Array.prototype.map.call(text, function (c, i) {
      return c === ' ' ? '<span class="ch" style="width:.26em"> </span>'
        : '<span class="ch" style="transition-delay:' + (base + i * step).toFixed(2) + 's">' + c + '</span>';
    }).join('');
  }

  var style = el('style'); style.id = 'sf3-style'; style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);
  if (!document.querySelector('link[href*="IBM+Plex+Sans+KR"]')) {
    var font = el('link'); font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@200;300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';
    (document.head || document.documentElement).appendChild(font);
  }

  var L1 = '서울숲,', L2 = '오늘 나에게 맞는 길';
  var ringSvg = '<svg viewBox="0 0 240 240" aria-hidden="true">' +
    '<circle cx="120" cy="120" r="118" fill="none" stroke="rgba(226,230,255,.12)"/>' +
    '<g class="spin"><circle cx="120" cy="120" r="104" fill="none" stroke="rgba(226,230,255,.35)" stroke-dasharray="1 5"/></g>' +
    '<g class="spin2"><circle cx="120" cy="120" r="88" fill="none" stroke="rgba(169,164,255,.55)" stroke-dasharray="60 30 10 30"/></g>' +
    '<circle cx="120" cy="120" r="72" fill="none" stroke="rgba(226,230,255,.18)"/>' +
    '<circle class="prog" cx="120" cy="120" r="72" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 120 120)"/></svg>';
  var root = el('div'); root.id = 'sf3';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', L1 + ' ' + L2 + ' 표지');
  root.innerHTML =
    '<div class="tags"></div><div class="shade"></div>' +
    '<div class="load"><div class="ring">' + ringSvg + '<div class="core"></div><div class="dot"></div></div>' +
      '<div class="ltxt">LOADING SEOUL FOREST<span class="roll"><span>00</span></span>%<small>37.5443° N · 127.0374° E</small></div></div>' +
    '<div class="top ui-el" style="transition-delay:.2s"><div class="logo">SEOUL FOREST<small>SMART PARK · TOPIC 01</small></div>' +
      '<div class="tr"><button type="button" class="snd ask" aria-pressed="false" aria-label="도시 소리 켜기"><span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="lb">SOUND OFF</span></button>' +
      '<div class="nav"><span class="now">—</span><span class="hide">SEONGDONG-GU</span><em>KR</em></div></div></div>' +
    '<div class="copy">' +
      '<div class="eyebrow ui-el" style="transition-delay:.4s"><svg viewBox="0 0 24 24"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" fill="#7b74ff"/></svg>2026-2 AI-CCS · 이용자 맞춤형 스마트 공원</div>' +
      '<h1><span class="ln">' + chars(L1, .55, .05) + '</span><span class="ln l2">' + chars(L2, .8, .04) + '</span></h1>' +
      '<p class="sub ui-el" style="transition-delay:1.5s">날씨와 붐빔, 함께 온 사람과 머물 시간을 읽어<br>지금 머물기 좋은 자리와 걸을 길을 고릅니다.</p>' +
      '<div class="btns ui-el" style="transition-delay:1.75s"><button type="button" class="go">대시보드 열기<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg></button></div>' +
      '<div class="cred ui-el" style="transition-delay:2s">상명대학교 그린스마트시티학과 · 자문 ㈜한국종합기술 조경레저부</div>' +
    '</div>' +
    '<div class="chip ui-el" style="transition-delay:2.1s"><b></b>Seongdong-gu, Seoul</div>' +
    '<div class="mouse ui-el" style="transition-delay:2.2s"></div>' +
    '<div class="compass ui-el" style="transition-delay:2.3s"><svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="rgba(226,230,255,.4)"><rect x="8" y="8" width="48" height="48" stroke-dasharray="2 4"/><path d="M32 4v56M4 32h56" stroke="rgba(226,230,255,.18)"/></g><rect x="27" y="27" width="10" height="10" fill="none" stroke="#ff6b7a"/><path d="M32 10l3 7h-6z" fill="#fff"/><text x="38" y="16" fill="#fff" font-size="7" font-family="ui-monospace,monospace">N</text></svg><small>위성 © Esri, Maxar · 지도 © OpenStreetMap</small></div>' +
    '<div class="bar"></div><div class="veil"></div>';
  // 대시보드를 미리 받아 두어 이동이 빠르게
  if (opt.href) { try { var pf = document.createElement('link'); pf.rel = 'prefetch'; pf.href = opt.href.split('#')[0]; document.head.appendChild(pf); } catch (e) {} }

  var nowEl = root.querySelector('.now'), DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  function tick() {
    var d = new Date(Date.now() + (9 * 60 + new Date().getTimezoneOffset()) * 60000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    nowEl.textContent = (innerWidth < 820 ? '' : d.getFullYear() + '.') + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + DOW[d.getDay()] + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  tick(); var clock = setInterval(tick, 10000);

  document.documentElement.appendChild(root);
  var prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  var btn = root.querySelector('.go');

  // 로딩 표시
  var roll = root.querySelector('.roll'), prog = root.querySelector('.prog'), shownPct = -1;
  function setPct(p) {
    p = Math.max(0, Math.min(100, Math.round(p)));
    if (p === shownPct) return; shownPct = p;
    roll.firstChild.textContent = (p < 10 ? '0' : '') + p;
    prog.setAttribute('stroke-dasharray', p + ' ' + (100 - p));
  }
  setPct(0);

  // ── 닫기 ────────────────────────────────────────────────────
  var done = false, scene3 = null;
  // 대시보드에서 '뒤로가기'로 돌아오면(bfcache) 검은 막에 멈추지 않게 새로 불러옴
  window.addEventListener('pageshow', function (ev) { if (ev.persisted && done) location.reload(); });
  function showUI() { if (!root.classList.contains('ui')) { root.classList.add('ui'); setTimeout(function () { try { btn.focus({ preventScroll: true }); } catch (e) {} }, 1800); } }
  function close() {
    if (done) return; done = true;
    try { if (opt.once === 'session') sessionStorage.setItem('sf-cover-seen', '1'); } catch (e) {}
    root.classList.add('out');
    document.removeEventListener('keydown', onKey, true);
    clearInterval(clock);
    if (scene3) scene3.dive();
    if (window.SF_SOUND) { window.SF_SOUND.dive(); setTimeout(function () { window.SF_SOUND.dispose(); }, 2000); }
    removeWake();
    if (opt.href) { // 서울숲으로 파고든 뒤 어둠으로 가라앉으며 대시보드로 이동
      setTimeout(function () { root.classList.add('leave'); }, scene3 ? 750 : 0);
      setTimeout(function () { location.href = opt.href; }, scene3 ? 1350 : 600);
      return;
    }
    setTimeout(function () { root.classList.add('bye'); document.documentElement.style.overflow = prevOverflow; try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, scene3 ? 1000 : 300);
    setTimeout(function () { if (scene3) scene3.dispose(); root.remove(); var st = document.getElementById('sf3-style'); if (st) st.remove(); }, scene3 ? 1650 : 950);
  }
  function onKey(e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); close(); } }
  btn.addEventListener('click', close);
  root.querySelector('.mouse').addEventListener('click', close);
  root.addEventListener('wheel', function (e) { if (root.classList.contains('ui') && e.deltaY > 20) close(); }, { passive: true });
  document.addEventListener('keydown', onKey, true);
  if (opt.auto > 0) { root.querySelector('.bar').style.animation = 'sf3Bar ' + opt.auto + 'ms linear forwards'; setTimeout(close, opt.auto); }
  window.sfCover = { close: close };

  // ── 도시 소리 (sound.js) ────────────────────────────────────
  // 브라우저가 첫 클릭 전에는 소리를 막아서: 바로 켜 보고, 막히면 표지를 처음 누르거나 만질 때 켬.
  // 오른쪽 위 SOUND 버튼으로 끄고 켬(끈 상태는 기억).
  var snd = root.querySelector('.snd'), sndLb = snd.querySelector('.lb'), WAKE = ['pointerdown', 'touchstart', 'keydown'];
  function sndPref() { try { return localStorage.getItem('sf-cover-sound') !== 'off'; } catch (e) { return true; } }
  function sndShow(isOn) {
    snd.classList.toggle('on', isOn); snd.classList.toggle('ask', !isOn && sndPref());
    snd.setAttribute('aria-pressed', String(isOn)); snd.setAttribute('aria-label', isOn ? '도시 소리 끄기' : '도시 소리 켜기');
    sndLb.textContent = isOn ? 'SOUND ON' : 'SOUND OFF';
  }
  function wake(e) {
    if (done || !window.SF_SOUND || !sndPref() || window.SF_SOUND.on || (e && snd.contains(e.target))) return;
    window.SF_SOUND.start().then(function (ok) { sndShow(ok); if (ok) removeWake(); });
  }
  function removeWake() { WAKE.forEach(function (t) { document.removeEventListener(t, wake, true); }); }
  snd.addEventListener('click', function () {
    if (!window.SF_SOUND) return;
    window.SF_SOUND.toggle().then(function (isOn) {
      try { localStorage.setItem('sf-cover-sound', isOn ? 'on' : 'off'); } catch (e) {}
      sndShow(isOn); if (isOn) removeWake();
    });
  });
  (function () {
    var s = document.createElement('script'); s.src = BASE + 'sound.js?v=20261126c';
    s.onload = function () { if (sndPref()) wake(); };
    (document.head || document.documentElement).appendChild(s);
    WAKE.forEach(function (t) { document.addEventListener(t, wake, true); });
  })();

  // ── 불러오기: three.js·후처리 / 도시 데이터 / 위성사진 ─────────
  var TV = '0.160.0', ESM = 'https://esm.sh/three@' + TV, JSD = 'https://cdn.jsdelivr.net/npm/three@' + TV + '/build/three.module.js';
  var pct = { mods: 0, city: 0, sat: 0 };
  function upd() { setPct(pct.mods * 15 + pct.city * 15 + pct.sat * 70); }
  function loadMods() {
    return Promise.all([
      import(ESM),
      import(ESM + '/examples/jsm/postprocessing/EffectComposer.js'),
      import(ESM + '/examples/jsm/postprocessing/RenderPass.js'),
      import(ESM + '/examples/jsm/postprocessing/ShaderPass.js'),
      import(ESM + '/examples/jsm/postprocessing/UnrealBloomPass.js'),
      import(ESM + '/examples/jsm/postprocessing/OutputPass.js')
    ]).then(function (r) {
      pct.mods = 1; upd();
      return { T: r[0], X: { EC: r[1].EffectComposer, RP: r[2].RenderPass, SP: r[3].ShaderPass, UB: r[4].UnrealBloomPass, OP: r[5].OutputPass } };
    }).catch(function () { return import(JSD).then(function (T) { pct.mods = 1; upd(); return { T: T, X: null }; }); });
  }
  function loadCity() {
    return new Promise(function (ok, no) {
      if (window.SF_CITY) { pct.city = 1; upd(); return ok(window.SF_CITY); }
      var s = el('script'); s.src = BASE + 'city.js';
      s.onload = function () { pct.city = 1; upd(); window.SF_CITY ? ok(window.SF_CITY) : no(new Error('city')); };
      s.onerror = no; document.head.appendChild(s);
    });
  }
  // 위성사진 모자이크 (Esri World Imagery, z17, 서울숲 중심 약 3.4×3.0km)
  function loadSat() {
    var Z = 17, N = 256 * Math.pow(2, Z);
    function mx(lon) { return (lon + 180) / 360 * N; }
    function my(lat) { var s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N; }
    function lon(x) { return x / N * 360 - 180; }
    function lat(y) { var n = Math.PI - 2 * Math.PI * y / N; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
    var hw = 1700, hh = 1500;
    var tx0 = Math.floor(mx(LON0 - hw / KX) / 256), tx1 = Math.floor(mx(LON0 + hw / KX) / 256);
    var ty0 = Math.floor(my(LAT0 + hh / KY) / 256), ty1 = Math.floor(my(LAT0 - hh / KY) / 256);
    var cw = (tx1 - tx0 + 1) * 256, ch = (ty1 - ty0 + 1) * 256;
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var cx = cv.getContext('2d'); cx.fillStyle = '#1b1f26'; cx.fillRect(0, 0, cw, ch);
    var total = (tx1 - tx0 + 1) * (ty1 - ty0 + 1), got = 0;
    var box = { // 지역 좌표(m): 서쪽 x, 남쪽 y, 폭, 높이
      x: (lon(tx0 * 256) - LON0) * KX, y: (lat((ty1 + 1) * 256) - LAT0) * KY,
      w: (lon((tx1 + 1) * 256) - lon(tx0 * 256)) * KX, h: (lat(ty0 * 256) - lat((ty1 + 1) * 256)) * KY
    };
    return new Promise(function (ok) {
      var fin = false;
      function end() { if (fin) return; fin = true; try { cx.getImageData(0, 0, 1, 1); ok({ canvas: cv, box: box }); } catch (e) { ok(null); } }
      for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) (function (tx, ty) {
        var im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = function () { cx.drawImage(im, (tx - tx0) * 256, (ty - ty0) * 256); step(); };
        im.onerror = step;
        im.src = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + Z + '/' + ty + '/' + tx;
      })(tx, ty);
      function step() { got++; pct.sat = got / total; upd(); if (got >= total) end(); }
      setTimeout(end, 12000);
    });
  }
  var t0Load = performance.now();
  Promise.all([loadMods(), loadCity(), loadSat()]).then(function (r) {
    if (done) return;
    scene3 = build(r[0].T, r[1], r[0].X, r[2]);
    setPct(100);
    setTimeout(function () {
      root.classList.add('ready', 'gl'); scene3.start();
      setTimeout(showUI, FIXT ? 0 : 2600);
    }, Math.max(0, 1400 - (performance.now() - t0Load)));
  }).catch(function (e) { console.warn('[cover3d] 3D 없이 표시:', e); root.classList.add('ready'); showUI(); });

  // ── 3D 장면 ─────────────────────────────────────────────────
  function build(T, C, X, SAT) {
    var W = innerWidth, H = innerHeight, mob = W < 820;
    var renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.4;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    root.insertBefore(renderer.domElement, root.firstChild);

    var scene = new T.Scene();
    scene.background = new T.Color(0x070a12);
    scene.fog = new T.Fog(0x0a0e1a, 2200, 6500);
    var camera = new T.PerspectiveCamera(32, W / H, 10, 20000);

    // 해 질 녘 빛: 푸른 하늘빛 + 낮게 깔린 서늘한 빛
    scene.add(new T.HemisphereLight(0xa9bbff, 0x222838, 1.05));
    var moon = new T.DirectionalLight(0xc4ceff, 1.9);
    moon.position.set(-1800, 1900, 1100); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048); renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    var sc = moon.shadow.camera; sc.left = -2400; sc.right = 2400; sc.top = 2400; sc.bottom = -2400; sc.near = 100; sc.far = 7000;
    moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.6; moon.shadow.radius = 3;
    scene.add(moon); scene.add(moon.target);

    var U = { uT: { value: 0 } };
    var TGT = new T.Vector3(40, 0, -40);

    // 바닥: 위성사진
    var satTex = null, box = SAT ? SAT.box : { x: -1700, y: -1500, w: 3400, h: 3000 };
    if (SAT) { satTex = new T.CanvasTexture(SAT.canvas); satTex.colorSpace = T.SRGBColorSpace; satTex.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
    var base = new T.Mesh(new T.PlaneGeometry(30000, 30000), new T.MeshStandardMaterial({ color: 0x14181f, roughness: 1 }));
    base.rotation.x = -Math.PI / 2; base.position.y = -0.5; base.receiveShadow = true; scene.add(base);
    if (satTex) {
      var gm = new T.Mesh(new T.PlaneGeometry(box.w, box.h), new T.MeshStandardMaterial({ map: satTex, roughness: 1, color: 0xd8dcea }));
      gm.rotation.x = -Math.PI / 2; gm.position.set(box.x + box.w / 2, 0, -(box.y + box.h / 2)); gm.receiveShadow = true; scene.add(gm);
      // 사진 가장자리를 어둠으로 부드럽게
      gm.material.onBeforeCompile = function (s) {
        s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nvec2 e = min(vMapUv, 1.0 - vMapUv); diffuseColor.rgb *= smoothstep(0.0, 0.12, min(e.x, e.y)) * 0.85 + 0.15;');
      };
    }
    function shape(rings) {
      var s = new T.Shape(rings[0].map(function (p) { return new T.Vector2(p[0], p[1]); }));
      for (var i = 1; i < rings.length; i++) s.holes.push(new T.Path(rings[i].map(function (p) { return new T.Vector2(p[0], p[1]); })));
      return s;
    }
    // 물: 사진 위에 어두운 거울면
    (function () {
      var g = new T.ShapeGeometry(C.water.map(shape)); g.rotateX(-Math.PI / 2);
      var m = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x0b1122, roughness: .18, metalness: .7, transparent: true, opacity: .62 }));
      m.position.y = 0.6; scene.add(m);
    })();

    // 건물: 실제 윤곽을 높이만큼. 지붕엔 위성사진, 외벽엔 층·창(일부 불 켜짐)
    (function () {
      // 빠른 직접 조립: 벽(사각형 2삼각형) + 지붕(삼각분할). 바닥면은 생략
      var Pa = [], Na = [], Da = [];
      function tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, d) {
        Pa.push(ax, ay, az, bx, by, bz, cx, cy, cz); Na.push(nx, ny, nz, nx, ny, nz, nx, ny, nz); Da.push(d, d, d);
      }
      C.buildings.forEach(function (b) {
        var h = b.h, d = Math.random() * .9, rings = b.r;
        if (!mob || h > 12) rings.forEach(function (r, ri) {
          var cw = T.ShapeUtils.isClockWise(r.map(function (p) { return { x: p[0], y: p[1] }; }));
          var outward = (ri === 0) !== cw ? 1 : -1; // 바깥 링은 반시계 기준
          for (var i = 0; i < r.length; i++) {
            var a = r[i], c = r[(i + 1) % r.length];
            var ex = c[0] - a[0], ey = c[1] - a[1], L = Math.hypot(ex, ey) || 1;
            var nx = ey / L * outward, nz = ex / L * outward; // 지도 (x,y) → 3D (x,-y)
            if (outward > 0) {
              tri(a[0], 0, -a[1], c[0], 0, -c[1], c[0], h, -c[1], nx, 0, nz, d);
              tri(a[0], 0, -a[1], c[0], h, -c[1], a[0], h, -a[1], nx, 0, nz, d);
            } else {
              tri(c[0], 0, -c[1], a[0], 0, -a[1], a[0], h, -a[1], nx, 0, nz, d);
              tri(c[0], 0, -c[1], a[0], h, -a[1], c[0], h, -c[1], nx, 0, nz, d);
            }
          }
        });
        var contour = rings[0].map(function (p) { return new T.Vector2(p[0], p[1]); });
        var holes = rings.slice(1).map(function (r) { return r.map(function (p) { return new T.Vector2(p[0], p[1]); }); });
        var all = contour.concat.apply(contour, holes);
        var faces = T.ShapeUtils.triangulateShape(contour, holes);
        faces.forEach(function (f) {
          var A = all[f[0]], B = all[f[1]], Cc = all[f[2]];
          // 위를 향하도록 감기 방향 맞춤
          var cross = (B.x - A.x) * (Cc.y - A.y) - (B.y - A.y) * (Cc.x - A.x);
          // 지도(y 북쪽)→3D(z 남쪽) 뒤집힘 때문에 지도에서 반시계면 순서를 바꿔야 위에서 앞면
          if (cross > 0) tri(A.x, h, -A.y, Cc.x, h, -Cc.y, B.x, h, -B.y, 0, 1, 0, d);
          else tri(A.x, h, -A.y, B.x, h, -B.y, Cc.x, h, -Cc.y, 0, 1, 0, d);
        });
      });
      var P = new Float32Array(Pa), N = new Float32Array(Na), D = new Float32Array(Da);
      Pa = Na = Da = null;
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.BufferAttribute(N, 3)); g.setAttribute('aDelay', new T.BufferAttribute(D, 1));
      function rise(s) {
        s.uniforms.uT = U.uT;
        s.vertexShader = 'attribute float aDelay;\nuniform float uT;\nvarying vec3 vWP; varying vec3 vON;\n' + s.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nfloat k = clamp((uT - aDelay) / 1.2, 0.0, 1.0); k = 1.0 - pow(1.0 - k, 3.0); transformed.y *= max(k, 0.002); vWP = transformed; vON = objectNormal;');
      }
      var mat = new T.MeshStandardMaterial({ color: 0x151a27, roughness: .65, metalness: .25 });
      mat.onBeforeCompile = function (s) {
        rise(s);
        s.uniforms.uSat = { value: satTex }; s.uniforms.uBox = { value: new T.Vector4(box.x, box.y, box.w, box.h) }; s.uniforms.uHas = { value: satTex ? 1 : 0 };
        s.fragmentShader = 'varying vec3 vWP; varying vec3 vON; uniform sampler2D uSat; uniform vec4 uBox; uniform float uHas; float sfWin = 0.0; vec3 sfGlow = vec3(0.0);\n' +
          'float sfH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' + s.fragmentShader
          .replace('#include <color_fragment>', [
            '#include <color_fragment>',
            '{ vec3 n = normalize(vON);',
            '  if (n.y > 0.5) {',
            '    vec2 suv = vec2((vWP.x - uBox.x) / uBox.z, (-vWP.z - uBox.y) / uBox.w);',
            '    if (uHas > 0.5 && suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) diffuseColor.rgb = texture2D(uSat, suv).rgb * 0.95;',
            '    else diffuseColor.rgb = vec3(0.16, 0.17, 0.2);',
            '  } else if (abs(n.y) < 0.5) {',
            '    vec2 tg = normalize(vec2(-n.z, n.x));',
            '    float fu = dot(vWP.xz, tg) / 3.6, fv = vWP.y / 3.3;',
            '    vec2 w = fwidth(vec2(fu, fv));',
            '    float gx = smoothstep(0.18 - w.x, 0.18 + w.x, fract(fu)) * (1.0 - smoothstep(0.82 - w.x, 0.82 + w.x, fract(fu)));',
            '    float gy = smoothstep(0.25 - w.y, 0.25 + w.y, fract(fv)) * (1.0 - smoothstep(0.85 - w.y, 0.85 + w.y, fract(fv)));',
            '    float far = clamp(max(w.x, w.y) * 2.0, 0.0, 1.0);',
            '    sfWin = mix(gx * gy, 0.4, far) * step(3.3, vWP.y) * 0.7;',
            '    float lit = step(0.88, sfH(floor(vec2(fu, fv)) + floor(dot(vWP.xz, n.xz) * 0.07)));',
            '    float warm = sfH(floor(vec2(fu, fv)) * 1.7);',
            '    vec3 lc = mix(vec3(1.0, 0.72, 0.42), vec3(0.72, 0.8, 1.0), step(0.6, warm));',
            '    sfGlow = lc * lit * gx * gy * (1.0 - far) * step(3.3, vWP.y) * 1.8 + vec3(0.25, 0.3, 0.6) * far * 0.03;',
            '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.1, 0.16), sfWin * 0.85);',
            '    diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 18.0, vWP.y));',
            '  } }'
          ].join('\n'))
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.1, sfWin);')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += sfGlow;');
      };
      var depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
      depth.onBeforeCompile = function (s) {
        s.uniforms.uT = U.uT;
        s.vertexShader = 'attribute float aDelay;\nuniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nfloat k = clamp((uT - aDelay) / 1.2, 0.0, 1.0); k = 1.0 - pow(1.0 - k, 3.0); transformed.y *= max(k, 0.002);');
      };
      var mesh = new T.Mesh(g, mat); mesh.customDepthMaterial = depth;
      mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    })();

    // 공원 안 판정
    var parkRings = C.park.map(function (p) { return p[0]; });
    function inRing(x, y, r) {
      var c = false;
      for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
        if (((r[i][1] > y) !== (r[j][1] > y)) && (x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0])) c = !c;
      }
      return c;
    }
    function inPark(x, y) { for (var i = 0; i < parkRings.length; i++) if (inRing(x, y, parkRings[i])) return true; return false; }
    var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    parkRings.forEach(function (r) { r.forEach(function (p) { bx0 = Math.min(bx0, p[0]); by0 = Math.min(by0, p[1]); bx1 = Math.max(bx1, p[0]); by1 = Math.max(by1, p[1]); }); });
    var seed = 11; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var tmp = new T.Object3D();

    // 나무: 숲·공원·큰길 가로수 위치(Overture/OSM 녹지)에 입체 나무. 서울숲 안은 더 빽빽하게 보충
    (function () {
      var trees = [], src = C.trees || [], cap = mob ? 7000 : 24000, step = Math.max(1, Math.ceil(src.length / 2 / cap));
      for (var i = 0; i < src.length; i += 2 * step) trees.push([src[i], src[i + 1], 3 + rnd() * 3.5]);
      for (var tries = 0, add = 0; add < (mob ? 1000 : 2500) && tries < 60000; tries++) {
        var x = bx0 + rnd() * (bx1 - bx0), y = by0 + rnd() * (by1 - by0);
        if (inPark(x, y)) { trees.push([x, y, 4 + rnd() * 4]); add++; }
      }
      var tm = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({ roughness: .95 }), trees.length);
      var greens = [0x1f3a2a, 0x2a4a33, 0x18301f, 0x34573a, 0x223f2c, 0x2e3b26].map(function (c) { return new T.Color(c); });
      trees.forEach(function (t, i) {
        tmp.position.set(t[0], t[2] * 1.15, -t[1]); tmp.rotation.set(0, rnd() * 6, 0); tmp.scale.set(t[2], t[2] * 1.2, t[2]); tmp.updateMatrix();
        tm.setMatrixAt(i, tmp.matrix); tm.setColorAt(i, greens[i % greens.length]);
      });
      tm.castShadow = false; tm.receiveShadow = true; scene.add(tm);
    })();

    // 빛 웅덩이: 서울숲 둘레를 따라 보랏빛 바닥 조명
    var glowMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uA: { value: 0 }, uT: U.uT },
      vertexShader: 'varying vec2 vU; varying float vI; void main(){ vU = uv; vI = float(gl_InstanceID); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vU; varying float vI; uniform float uA; uniform float uT; void main(){ float d = length(vU - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2); float f = 0.75 + 0.25 * sin(uT * 1.6 + vI * 0.7); gl_FragColor = vec4(vec3(0.36, 0.3, 1.0) * a * f * uA * 0.55, 1.0); }'
    });
    (function () {
      var pts = [];
      parkRings.forEach(function (r) {
        var acc = 0;
        for (var i = 0; i < r.length; i++) {
          var a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (var s = (70 - acc % 70) % 70; s < L; s += 85) pts.push([a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L]);
          acc += L;
        }
      });
      var pg = new T.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
      var im = new T.InstancedMesh(pg, glowMat, pts.length);
      pts.forEach(function (p, i) { tmp.position.set(p[0], 2, -p[1]); tmp.rotation.set(0, 0, 0); tmp.scale.set(56, 1, 56); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix); });
      im.frustumCulled = false; scene.add(im);
    })();

    // 자동차: 실제 도로를 따라 양방향 — 앞은 흰 불빛, 뒤는 붉은 불빛
    var lanes = [];
    C.roads.forEach(function (r) {
      var p = r.p, cum = [0];
      for (var i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      var len = cum[cum.length - 1];
      if (len < 140) return;
      lanes.push({ p: p, cum: cum, len: len, w: r.w });
    });
    // 실제 속도감: 도시고속도로 약 70~90km/h, 일반 도로 40~55km/h. 차종 색은 흰·검정·은색·회색 위주
    var cars = [], MAXC = W > 900 ? 1100 : 500;
    lanes.forEach(function (ln, li) {
      var fast = ln.w >= 16, per = Math.max(1, Math.floor(ln.len / (fast ? 34 : 85)));
      for (var dir = -1; dir <= 1; dir += 2) for (var j = 0; j < per; j++)
        cars.push({ l: li, dir: dir, s: rnd() * ln.len, v: (fast ? 22 : 13) * (.85 + rnd() * .3), seg: 0, lane: ln.w * (fast ? (.14 + (j % 3) * .11) : .24) });
    });
    for (var ci = cars.length - 1; ci > 0; ci--) { var cj = Math.floor(rnd() * (ci + 1)), ct = cars[ci]; cars[ci] = cars[cj]; cars[cj] = ct; }
    cars.length = Math.min(cars.length, MAXC);
    var lightGeo = new T.PlaneGeometry(1, 1); lightGeo.rotateX(-Math.PI / 2); lightGeo.translate(0, 0, .5);
    var lightMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uA: { value: 1 } },
      vertexShader: 'varying vec2 vU; varying vec3 vC; void main(){ vU = uv; vC = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vU; varying vec3 vC; uniform float uA; void main(){ vec2 d = (vU - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - dot(d, d)), 2.0); gl_FragColor = vec4(vC * a * 1.6 * uA, 1.0); }'
    });
    var headMesh = new T.InstancedMesh(lightGeo, lightMat, cars.length), tailMesh = new T.InstancedMesh(lightGeo, lightMat, cars.length);
    var cHead = new T.Color(0xfff3dc), cTail = new T.Color(0xff2a3a).multiplyScalar(.8);
    cars.forEach(function (c, i) { headMesh.setColorAt(i, cHead); tailMesh.setColorAt(i, cTail); });
    headMesh.frustumCulled = tailMesh.frustumCulled = false; scene.add(headMesh); scene.add(tailMesh);
    // 차체: 각진 상자 대신 아랫단 + 유리 지붕 2단
    var bodyGeo = new T.BoxGeometry(1.85, .8, 4.5).translate(0, .55, 0);
    var cabGeo = new T.BoxGeometry(1.6, .6, 2.4).translate(0, 1.25, -.2);
    var carBody = new T.InstancedMesh(bodyGeo, new T.MeshStandardMaterial({ roughness: .35, metalness: .55 }), cars.length);
    var carCab = new T.InstancedMesh(cabGeo, new T.MeshStandardMaterial({ color: 0x0b0e16, roughness: .15, metalness: .8 }), cars.length);
    var paint = [0xe9ebee, 0xe9ebee, 0x15171c, 0x15171c, 0x9aa0a8, 0x5d636c, 0x2a3446, 0x6b1e24].map(function (c) { return new T.Color(c); });
    cars.forEach(function (c, i) { carBody.setColorAt(i, paint[Math.floor(rnd() * paint.length)]); });
    carBody.frustumCulled = carCab.frustumCulled = false; scene.add(carBody); scene.add(carCab);
    function moveCars(dt) {
      for (var i = 0; i < cars.length; i++) {
        var c = cars[i], ln = lanes[c.l], cum = ln.cum, p = ln.p;
        c.s += c.v * dt * c.dir;
        if (c.s >= ln.len) c.s -= ln.len; else if (c.s < 0) c.s += ln.len;
        var k = c.seg;
        while (k < cum.length - 2 && c.s > cum[k + 1]) k++;
        while (k > 0 && c.s < cum[k]) k--;
        c.seg = k;
        var a = p[k], b = p[k + 1], sl = (cum[k + 1] - cum[k]) || 1, u = (c.s - cum[k]) / sl;
        var dx = (b[0] - a[0]) / sl * c.dir, dy = (b[1] - a[1]) / sl * c.dir;
        var x = a[0] + (b[0] - a[0]) * u + dy * c.lane, y = a[1] + (b[1] - a[1]) * u - dx * c.lane;
        var f = Math.min(1, Math.min(c.s, ln.len - c.s) / 30);
        var ang = Math.atan2(-dx, dy);
        tmp.rotation.set(0, ang, 0);
        tmp.position.set(x, 1, -y); tmp.scale.set(f, f, f); tmp.updateMatrix(); carBody.setMatrixAt(i, tmp.matrix); carCab.setMatrixAt(i, tmp.matrix);
        // 미등: 차 뒤에 작은 붉은 빛
        tmp.position.set(x - dx * 2.6, 1.6, -(y - dy * 2.6)); tmp.scale.set(2.6 * f, 1, 1.8 * f); tmp.updateMatrix(); tailMesh.setMatrixAt(i, tmp.matrix);
        // 전조등: 차 앞 길바닥에 비치는 짧은 빛
        tmp.rotation.set(0, ang + Math.PI, 0);
        tmp.position.set(x + dx * 2.4, 1.3, -(y + dy * 2.4)); tmp.scale.set(3.4 * f, 1, 7 * f); tmp.updateMatrix(); headMesh.setMatrixAt(i, tmp.matrix);
      }
      carBody.instanceMatrix.needsUpdate = carCab.instanceMatrix.needsUpdate = headMesh.instanceMatrix.needsUpdate = tailMesh.instanceMatrix.needsUpdate = true;
    }
    moveCars(0);

    // 지명 표시: 보랏빛 육각 표지 + 모서리 꺾인 이름표 (실제 지명만)
    function loc(lo, la) { return [(lo - LON0) * KX, (la - LAT0) * KY]; }
    var PLACES = [
      { t: 'SEOUL FOREST', k: '서울숲', at: [40, 60], h: 150 },
      { t: 'SEONGSU', k: '성수동', at: loc(127.0478, 37.5452), h: 210 },
      { t: 'HAN RIVER', k: '한강', at: loc(127.0462, 37.5362), h: 90 },
      { t: 'JUNGNANGCHEON', k: '중랑천', at: loc(127.0262, 37.5482), h: 110 }
    ];
    var tagLayer = root.querySelector('.tags');
    var hexGeo = new T.CylinderGeometry(17, 17, 4, 6);
    var hexMat = new T.MeshBasicMaterial({ color: new T.Color(0x8f89ff).multiplyScalar(2.2) });
    var lineMat = new T.LineBasicMaterial({ color: 0x8f89ff, transparent: true, opacity: .55 });
    PLACES.forEach(function (p) {
      var hx = new T.Mesh(hexGeo, hexMat); hx.position.set(p.at[0], p.h, -p.at[1]); scene.add(hx); p.hex = hx;
      var lg = new T.BufferGeometry().setFromPoints([new T.Vector3(p.at[0], 0, -p.at[1]), new T.Vector3(p.at[0], p.h - 8, -p.at[1])]);
      scene.add(new T.Line(lg, lineMat));
      p.v = new T.Vector3(p.at[0], p.h, -p.at[1]);
      p.el = el('div', 'tag', '<div class="box"><b>' + p.t + '</b><i>' + p.k + '</i></div>'); tagLayer.appendChild(p.el);
    });

    // ── 후처리: 빛 번짐(bloom) → 색보정·움직임 흐림·비네트·필름 결 → 출력 ──
    var composer = null, grade = null, bloom = null;
    if (X) {
      try {
        composer = new X.EC(renderer);
        composer.addPass(new X.RP(scene, camera));
        bloom = new X.UB(new T.Vector2(W / 2, H / 2), .85, .55, .82); composer.addPass(bloom);
        grade = new X.SP({
          uniforms: { tDiffuse: { value: null }, uMB: { value: 0 }, uT: U.uT, uRes: { value: new T.Vector2(W, H) } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: [
            'uniform sampler2D tDiffuse; uniform float uMB; uniform float uT; uniform vec2 uRes; varying vec2 vUv;',
            'float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
            'void main(){',
            '  vec2 dir = (vUv - 0.5) * uMB; vec4 c = vec4(0.0);',
            '  for (int i = 0; i < 12; i++) c += texture2D(tDiffuse, vUv - dir * float(i) / 11.0);',
            '  c /= 12.0;',
            '  vec3 g = c.rgb; float l = dot(g, vec3(0.299, 0.587, 0.114));',
            '  g = mix(vec3(l), g, 0.82) * vec3(0.9, 0.95, 1.12);',
            '  vec2 q = vUv - 0.5; g *= 1.0 - dot(q, q) * 1.15;',
            '  g += (h(vUv * uRes + fract(uT) * 91.0) - 0.5) * 0.022;',
            '  gl_FragColor = vec4(g, 1.0); }'
          ].join('\n')
        });
        composer.addPass(grade);
        composer.addPass(new X.OP());
      } catch (e) { console.warn('[cover3d] 후처리 생략:', e); composer = null; }
    }

    // ── 카메라 ────────────────────────────────────────────────
    function size() {
      W = innerWidth; H = innerHeight; mob = W < 820;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      if (mob) camera.setViewOffset(W, H, 0, H * 0.22, W, H); else camera.setViewOffset(W, H, -W * 0.17, 0, W, H);
      camera.updateProjectionMatrix();
      if (composer) { composer.setSize(W, H); grade.uniforms.uRes.value.set(W, H); }
    }
    size();
    var mx = 0, my = 0, smx = 0, smy = 0;
    function onMove(e) { mx = e.clientX / W - .5; my = e.clientY / H - .5; }
    root.addEventListener('mousemove', onMove);
    function onResize() { size(); }
    addEventListener('resize', onResize);

    function ease(k) { k = Math.min(1, Math.max(0, k)); return 1 - Math.pow(1 - k, 3); }
    function easeIO(k) { k = Math.min(1, Math.max(0, k)); return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
    // 들어오는 길: 위에서 내려다보다 → 한강 위를 낮게 빠르게(흐림) → 서울숲 위로 솟아 비스듬히 내려다봄 → 천천히 회전
    var FLY = 4.6, LIFT = 2.6;
    var flyPos = new T.CatmullRomCurve3([
      new T.Vector3(-900, 3600, 1600), new T.Vector3(-2300, 600, 1250), new T.Vector3(-1500, 170, 820), new T.Vector3(-700, 230, 640)
    ], false, 'centripetal');
    var flyLook = new T.CatmullRomCurve3([
      new T.Vector3(-300, 0, 500), new T.Vector3(-1200, 20, 650), new T.Vector3(-500, 20, 300), new T.Vector3(TGT.x, 0, TGT.z)
    ], false, 'centripetal');
    var spin = 0;
    var vA = new T.Vector3(), vB = new T.Vector3(), vO = new T.Vector3(), vL = new T.Vector3(), v3 = new T.Vector3();
    function orbit(out, polarDeg, dist, az) {
      var pl = polarDeg * Math.PI / 180;
      return out.set(TGT.x + dist * Math.sin(pl) * Math.sin(az), dist * Math.cos(pl), TGT.z + dist * Math.sin(pl) * Math.cos(az));
    }
    var started = false, t0 = 0, diveT = -1, last = 0, raf = 0, alive = true, fc = 0, ft = 0, lowered = false;
    function lower() { lowered = true; renderer.setPixelRatio(.8); if (bloom) bloom.enabled = false; size(); }
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!started) { t0 = now; last = now; }
      var t = REDUCE ? 30 : FIXT ? +FIXT : (now - t0) / 1000, dt = FIXT ? 1 / 60 : Math.min(.05, (now - last) / 1000); last = now;
      if (!started) t = 0;
      U.uT.value = t;
      smx += (mx - smx) * .04; smy += (my - smy) * .04;
      var dist = mob ? 3600 : 2050;
      if (t > FLY + LIFT && !REDUCE) spin += dt * .014;
      var az = -0.55 + spin + smx * .14, polar = 49 + smy * 3;
      orbit(vO, polar, dist, az);
      var mb = 0;
      if (REDUCE) { camera.position.copy(vO); vL.set(TGT.x, 0, TGT.z); }
      else if (t < FLY) {
        var q = easeIO(t / FLY);
        flyPos.getPoint(q, vA); flyLook.getPoint(q, vL); camera.position.copy(vA);
        mb = Math.sin(Math.min(1, t / FLY) * Math.PI) * .07;
      } else if (t < FLY + LIFT) {
        var q2 = easeIO((t - FLY) / LIFT);
        flyPos.getPoint(1, vA); camera.position.lerpVectors(vA, vO, q2); camera.position.y += Math.sin(q2 * Math.PI) * 280;
        flyLook.getPoint(1, vL);
        mb = (1 - q2) * .025;
      } else { camera.position.copy(vO); vL.set(TGT.x, 0, TGT.z); }
      if (diveT >= 0) {
        var qd = easeIO((now - diveT) / 1150);
        camera.position.lerp(vB.set(TGT.x + 260, 300, TGT.z + 420), qd);
        vL.lerp(vB.set(TGT.x, 0, TGT.z - 100), qd);
        mb = Math.max(mb, qd * .09);
      }
      camera.lookAt(vL);

      glowMat.uniforms.uA.value = ease((t - FLY + .5) / 1.5);
      moveCars(REDUCE ? 0 : dt);
      var tagOn = root.classList.contains('ui');
      PLACES.forEach(function (p, i) {
        p.hex.rotation.y = t * .6 + i;
        p.hex.position.y = p.h + Math.sin(t * 1.4 + i) * 4;
        if (!tagOn) return;
        v3.copy(p.v).project(camera);
        var sx = (v3.x + 1) / 2 * W, sy = (1 - v3.y) / 2 * H;
        var vis = v3.z < 1 && sx > (mob ? 10 : W * .46) && sx < W - 150 && sy > 70 && sy < (mob ? H * .5 : H - 70);
        p.el.style.display = vis ? '' : 'none';
        if (vis) p.el.style.transform = 'translate(' + ((v3.x + 1) / 2 * W + 16).toFixed(1) + 'px,' + ((1 - v3.y) / 2 * H - 18).toFixed(1) + 'px)';
      });
      if (t < 2.6 || diveT >= 0) renderer.shadowMap.needsUpdate = true; // 건물이 솟는 동안만 그림자 다시 계산
      if (composer) { grade.uniforms.uMB.value = mb; composer.render(); } else renderer.render(scene, camera);
      // 느린 기기면 자동으로 화질 낮춤
      if (started && !FIXT && !lowered) { fc++; ft += dt; if (fc === 90) { if (ft / fc > 1 / 38) lower(); fc = 0; ft = 0; } }
    }
    raf = requestAnimationFrame(frame);

    return {
      start: function () { started = true; },
      dive: function () { diveT = performance.now(); },
      dispose: function () {
        alive = false; cancelAnimationFrame(raf);
        removeEventListener('resize', onResize);
        scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); }); });
        if (satTex) satTex.dispose();
        if (composer) { try { composer.dispose(); } catch (e) {} }
        renderer.dispose();
      }
    };
  }
})();
