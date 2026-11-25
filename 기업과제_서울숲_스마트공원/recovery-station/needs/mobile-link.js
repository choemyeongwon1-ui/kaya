// 대시보드 위쪽 막대(테마 버튼 옆)에 「모바일 화면」 버튼을 붙입니다.
// - 누르면 ../mobile.html(폰 모양 안에서 이용자 화면이 도는 발표용 페이지)을 새 탭으로 엽니다.
// - 대시보드는 빌드본이라 React 소스를 고치지 않고, 다시 그려져도 버튼이 남도록 지켜보며 다시 붙입니다.
(function () {
  var ID = 'nd-mobile-link';
  var HREF = './mobile.html';

  var css = document.createElement('style');
  css.textContent =
    '#' + ID + '{width:auto!important;padding:0 14px 0 11px!important;border-radius:18px!important;gap:6px;' +
    'display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:var(--ink);font-size:13px;font-weight:600;' +
    'margin-right:8px;white-space:nowrap}' +
    '#' + ID + ' svg{flex:none}' +
    '@media(max-width:700px){#' + ID + '{padding:0!important;width:36px!important}#' + ID + ' span{display:none}}';
  document.head.appendChild(css);

  function make() {
    var a = document.createElement('a');
    a.id = ID;
    a.className = 'icon-btn';
    a.href = HREF;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = '휴대폰에서 연 이용자 화면 보기 (발표용)';
    a.setAttribute('aria-label', '모바일 화면 보기');
    a.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg><span>모바일 화면</span>';
    return a;
  }

  function attach() {
    if (document.getElementById(ID)) return;
    var bar = document.querySelector('.topbar .meta-bar');
    if (!bar) return;
    bar.insertBefore(make(), bar.firstChild);
  }

  attach();
  new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true });
})();
