// 메인 대시보드(서울숲, 머무는 숲)의 목표 2 「취약지역 개선」 화면 결론 상자 아래에 「근거 보기」 띠를 붙이고,
// 누르면 진행현황 대시보드의 '근거 보강' 탭(대기 실측 비교 · 지하철 하차 · 문헌)을 창(iframe)으로 띄웁니다.
// - 빌드된 묶음 파일(assets/index-*.js)은 건드리지 않습니다. 화면이 그려진 뒤 띠만 덧붙입니다.
// - 띠의 숫자는 ../output/evidence.json(analysis/10_evidence.py 결과, 인증키 없음)에서 읽습니다. 못 읽으면 숫자 없이 띠만 보입니다.
// - 되돌리려면 이 파일을 지우고 index.html의 evidence-open.js 줄을 빼면 됩니다.
(function () {
  'use strict';
  var SRC = '../%EC%84%9C%EC%9A%B8%EC%88%B2_%EC%A7%84%ED%96%89%ED%98%84%ED%99%A9_%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C.html?embed=1#evidence';
  var DATA = '../output/evidence.json', BAR = 'nd-ev-bar', DLG = 'nd-ev-dlg';

  var style = document.createElement('style');
  style.textContent = [
    '#' + BAR + '{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:14px 0 4px;padding:12px 14px 12px 16px;border-radius:var(--radius,12px);',
    'background:var(--surface);border:1px solid var(--hair);box-shadow:var(--shadow)}',
    '#' + BAR + ' .k{font:800 13.5px/1.3 var(--font);color:var(--ink);white-space:nowrap}',
    '#' + BAR + ' .chips{display:flex;flex-wrap:wrap;gap:6px;flex:1;min-width:0}',
    '#' + BAR + ' .chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:var(--surface-2);color:var(--ink-2);font:600 12.5px/1.3 var(--font)}',
    '#' + BAR + ' .chip b{color:var(--ink);font-weight:800;font-variant-numeric:tabular-nums}',
    '#' + BAR + ' button{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:0;border-radius:999px;cursor:pointer;',
    'background:var(--brand);color:var(--brand-ink);font:700 13px/1 var(--font);white-space:nowrap}',
    '#' + BAR + ' button:hover{filter:brightness(1.1)}',
    '#' + BAR + ' button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}',
    '#' + DLG + '{position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(10,18,14,.55);backdrop-filter:blur(3px)}',
    '#' + DLG + '[hidden]{display:none}',
    '#' + DLG + ' .tw{display:flex;flex-direction:column;width:min(1400px,100%);height:100%;background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow-lg);overflow:hidden}',
    '#' + DLG + ' .th{display:flex;align-items:center;gap:10px;padding:10px 12px 10px 18px;border-bottom:1px solid var(--hair)}',
    '#' + DLG + ' .th h2{margin:0;min-width:0;font-size:15px;font-weight:800;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#' + DLG + ' .th h2 small{margin-left:8px;font-size:12px;font-weight:500;color:var(--muted)}',
    '#' + DLG + ' .th .sp{flex:1}',
    '#' + DLG + ' .th a,#' + DLG + ' .th button{flex:none;display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:0;border-radius:999px;cursor:pointer;',
    'background:var(--surface-2);color:var(--ink-2);font:600 12.5px/1 var(--font);text-decoration:none;white-space:nowrap}',
    '#' + DLG + ' .th a:hover,#' + DLG + ' .th button:hover{background:var(--surface-3);color:var(--ink)}',
    '#' + DLG + ' .th .x{width:32px;padding:0;justify-content:center;font-size:16px}',
    '#' + DLG + ' iframe{flex:1;width:100%;border:0;background:#F3F5F8}',
    '@media(max-width:760px){#' + DLG + '{padding:0}#' + DLG + ' .tw{border-radius:0}#' + DLG + ' .th h2 small{display:none}}',
    'body.nd-ev-lock{overflow:hidden}',
  ].join('');
  document.head.appendChild(style);

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'onclick') e.onclick = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (k) { e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }

  // ---- 띠에 넣을 요약 숫자 ----
  var chips = [['대기 실측', '도로변 측정소 비교'], ['지하철 하차', '서울숲역·뚝섬역 12개월'], ['문헌', '주신하(2008)']];
  fetch(DATA, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (E) {
    if (!E) return;
    var a = E.air && E.air.pol, s = E.subway && E.subway.stations;
    var up = function (p) { return '+' + Math.round((p.ratio - 1) * 100) + '%'; };
    if (a && a.pm25 && a.no2) chips[0] = ['도로변 PM2.5 ' + up(a.pm25) + ' · NO₂ ' + up(a.no2), '대기 지표 방향 확인'];
    if (s && s.length) chips[1] = ['역 하차 연 ' + Math.round(s.reduce(function (t, x) { return t + x.off_year; }, 0) / 1e4).toLocaleString('ko-KR') + '만 명', '출입구 유입 검토안'];
    chips[2] = ['동선·밀도 12곳 중 최하위', '주신하(2008)'];
    var bar = document.getElementById(BAR);
    if (bar) bar.replaceWith(makeBar());
  }).catch(function () {});

  // ---- 띄우는 창 ----
  var dlg, frame, lastFocus;
  function makeDialog() {
    frame = el('iframe', { title: '근거 보강: 대기 실측 비교 · 지하철 하차 · 문헌' });
    dlg = el('div', { id: DLG, role: 'dialog', 'aria-modal': 'true', 'aria-label': '취약지역 진단 근거', hidden: '' }, [
      el('div', { class: 'tw' }, [
        el('div', { class: 'th' }, [
          el('h2', {}, ['취약지역 진단의 근거', el('small', {}, ['진행현황 대시보드의 「근거 보강」 탭을 그대로 띄웁니다'])]),
          el('span', { class: 'sp' }),
          el('a', { href: SRC.replace('?embed=1', ''), target: '_blank', rel: 'noopener' }, ['새 탭으로 ↗']),
          el('button', { type: 'button', class: 'x', 'aria-label': '닫기', onclick: close }, ['✕']),
        ]),
        frame,
      ]),
    ]);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dlg.hidden) close(); });
    document.body.appendChild(dlg);
  }
  function open() {
    if (!dlg) makeDialog();
    lastFocus = document.activeElement;
    if (!frame.getAttribute('src')) frame.src = SRC;
    dlg.hidden = false; document.body.classList.add('nd-ev-lock');
    dlg.querySelector('.x').focus();
  }
  function close() {
    if (!dlg || dlg.hidden) return;
    dlg.hidden = true; document.body.classList.remove('nd-ev-lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ---- 목표 2 결론 상자 아래 띠 (React가 다시 그려 지워지면 다시 붙임) ----
  function makeBar() {
    return el('div', { id: BAR, role: 'region', 'aria-label': '진단 근거' }, [
      el('span', { class: 'k' }, ['이 진단의 근거']),
      el('span', { class: 'chips' }, chips.map(function (c) { return el('span', { class: 'chip', title: c[1] }, [el('b', {}, [c[0]]), c[1]]); })),
      el('button', { type: 'button', onclick: open, 'aria-label': '근거 보기: 대기 실측 비교, 지하철 하차, 문헌' }, ['근거 보기 →']),
    ]);
  }
  function ensure() {
    var g2 = document.querySelector('.goals-nav .goal-tab.g2[aria-selected="true"]');
    var ans = g2 && document.querySelector('main section.answer, section.answer');
    var bar = document.getElementById(BAR);
    if (!ans) { if (bar) bar.remove(); return; }
    if (bar && bar.previousElementSibling === ans) return;
    if (bar) bar.remove();
    ans.insertAdjacentElement('afterend', makeBar());
  }
  new MutationObserver(ensure).observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
  ensure();
})();
