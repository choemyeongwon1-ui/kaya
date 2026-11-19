// 메인 대시보드(서울숲, 머무는 숲) 위쪽 줄에 「이용자 화면」 단추를 붙이고,
// 누르면 따로 만든 「서울숲 코스 찾기」(needs/tour.html)를 대시보드 위에 창처럼 띄웁니다.
// - 두 화면은 합치지 않습니다. tour.html 파일은 건드리지 않고 iframe으로 그대로 보여 주기만 합니다.
// - 코스 찾기 안에서 다른 화면(맞춤형 추천 등)으로 가는 링크를 누르면 창을 닫고 그 화면으로 옮겨 갑니다(대시보드 안에 대시보드가 겹치지 않게).
// - 이 파일을 지우고 index.html의 tour-open.js 줄을 빼면 원래대로 돌아갑니다.
(function () {
  'use strict';
  var SRC = './needs/tour.html', BTN = 'nd-tour-open', DLG = 'nd-tour-dlg';

  var style = document.createElement('style');
  style.textContent = [
    '#' + BTN + '{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px 0 11px;border:0;border-radius:999px;cursor:pointer;',
    'background:var(--brand);color:var(--brand-ink);font:700 13.5px/1 var(--font);box-shadow:var(--shadow);white-space:nowrap}',
    '#' + BTN + ':hover{filter:brightness(1.1)}',
    '#' + BTN + ':focus-visible{outline:2px solid var(--focus);outline-offset:2px}',
    '#' + BTN + ' svg{flex:none}',
    // 좁은 화면에서는 위쪽 줄이 두 줄로 늘지 않게 글자를 빼고 둥근 아이콘 단추로 둡니다
    '@media(max-width:1100px){#' + BTN + '{width:36px;padding:0;justify-content:center}#' + BTN + ' .t{display:none}}',
    // 이 폭에서만 위쪽 줄이 단추 때문에 두 줄이 되므로, 단추를 화면 오른쪽 아래에 띄웁니다
    '@media(min-width:861px) and (max-width:929px){#' + BTN + '{position:fixed;right:16px;bottom:16px;z-index:2000;width:auto;padding:0 14px 0 11px}#' + BTN + ' .t{display:inline}}',
    '#' + DLG + '{position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(10,18,14,.55);backdrop-filter:blur(3px)}',
    '#' + DLG + '[hidden]{display:none}',
    '#' + DLG + ' .tw{display:flex;flex-direction:column;width:min(1400px,100%);height:100%;background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow-lg);overflow:hidden;transition:width .25s}',
    '#' + DLG + '.phone .tw{width:min(430px,100%)}',
    '#' + DLG + ' .th{display:flex;align-items:center;gap:10px;padding:10px 12px 10px 18px;border-bottom:1px solid var(--hair)}',
    '#' + DLG + ' .th h2{margin:0;font-size:15px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#' + DLG + ' .th h2 small{margin-left:8px;font-size:12px;font-weight:500;color:var(--muted)}',
    '#' + DLG + ' .th .sp{flex:1}',
    '#' + DLG + ' .th button,#' + DLG + ' .th a{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:0;border-radius:999px;cursor:pointer;',
    'background:var(--surface-2);color:var(--ink-2);font:600 12.5px/1 var(--font);text-decoration:none;white-space:nowrap}',
    '#' + DLG + ' .th button:hover,#' + DLG + ' .th a:hover{background:var(--surface-3);color:var(--ink)}',
    '#' + DLG + ' .th button[aria-pressed=true]{background:var(--brand-wash);color:var(--brand)}',
    '#' + DLG + ' .th button,#' + DLG + ' .th a{flex:none}',
    '#' + DLG + ' .th h2{min-width:0}',
    '#' + DLG + ' .th .x{width:32px;padding:0;justify-content:center;font-size:16px}',
    '#' + DLG + ' iframe{flex:1;width:100%;border:0;background:var(--page)}',
    '@media(max-width:760px){#' + DLG + '{padding:0}#' + DLG + ' .tw{border-radius:0}#' + DLG + ' .th h2 small,#' + DLG + ' .th .ph{display:none}}',
    'body.nd-tour-lock{overflow:hidden}',
  ].join('');
  document.head.appendChild(style);

  var NS = 'http://www.w3.org/2000/svg';
  function routeIcon() {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    [['circle', { cx: 6, cy: 19, r: 3 }], ['path', { d: 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15' }], ['circle', { cx: 18, cy: 5, r: 3 }]].forEach(function (p) {
      var e = document.createElementNS(NS, p[0]); Object.keys(p[1]).forEach(function (k) { e.setAttribute(k, p[1][k]); }); s.appendChild(e);
    });
    return s;
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'onclick') e.onclick = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (k) { e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }

  // ---- 띄우는 창 ----
  var dlg, frame, lastFocus;
  function makeDialog() {
    frame = el('iframe', { title: '서울숲 코스 찾기 (이용자 화면)', allow: 'geolocation' });
    frame.addEventListener('load', function () {
      // 코스 찾기 안의 링크로 다른 화면에 가면 창을 닫고 그 화면을 연다(같은 사이트라 주소를 읽을 수 있음)
      try {
        var loc = frame.contentWindow.location;
        if (loc.href !== 'about:blank' && !/\/tour\.html$/.test(loc.pathname)) { var to = loc.href; close(); window.location.href = to; }
      } catch (e) { /* 다른 사이트면 그대로 둔다 */ }
    });
    var phone = el('button', { type: 'button', class: 'ph', 'aria-pressed': 'false', onclick: function () {
      var on = !dlg.classList.contains('phone'); dlg.classList.toggle('phone', on); phone.setAttribute('aria-pressed', String(on));
    } }, ['휴대폰 크기']);
    dlg = el('div', { id: DLG, role: 'dialog', 'aria-modal': 'true', 'aria-label': '서울숲 코스 찾기 — 이용자 화면', hidden: '' }, [
      el('div', { class: 'tw' }, [
        el('div', { class: 'th' }, [
          el('h2', {}, ['이용자 화면 · 서울숲 코스 찾기', el('small', {}, ['따로 만든 화면을 그대로 띄워 보여 줍니다'])]),
          el('span', { class: 'sp' }),
          phone,
          el('a', { href: SRC, target: '_blank', rel: 'noopener' }, ['새 탭으로 ↗']),
          el('button', { type: 'button', class: 'x', 'aria-label': '닫기', onclick: close }, ['✕']),
        ]),
        frame,
      ]),
    ]);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });   // 바깥 어두운 곳을 누르면 닫기
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dlg.hidden) close(); });
    document.body.appendChild(dlg);
  }
  function open() {
    if (!dlg) makeDialog();
    lastFocus = document.activeElement;
    if (!frame.getAttribute('src')) frame.src = SRC;   // 처음 열 때만 불러오고, 닫았다 열면 보던 곳 그대로
    dlg.hidden = false; document.body.classList.add('nd-tour-lock');
    dlg.querySelector('.x').focus();
  }
  function close() {
    if (!dlg || dlg.hidden) return;
    dlg.hidden = true; document.body.classList.remove('nd-tour-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ---- 위쪽 줄 단추 (React가 다시 그려 지워지면 다시 붙임) ----
  function makeBtn() {
    return el('button', { type: 'button', id: BTN, 'aria-label': '이용자 화면 · 코스 찾기 열기', title: '목적·동행·머물 시간을 고르면 산책 코스를 지도에 그려 주는 이용자 화면', onclick: open },
      [routeIcon(), el('span', { class: 't' }, ['이용자 화면 · 코스 찾기'])]);
  }
  function ensure() {
    var bar = document.querySelector('.topbar .meta-bar');
    if (!bar) return;
    var b = document.getElementById(BTN);
    if (b && b.parentNode === bar && bar.firstElementChild === b) return;
    if (b) b.remove();
    bar.insertBefore(makeBtn(), bar.firstChild);
  }
  new MutationObserver(ensure).observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
  ensure();
})();
