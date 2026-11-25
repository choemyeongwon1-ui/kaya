// 대시보드 위쪽 막대(테마 버튼 옆)에 「모바일 화면」 버튼을 붙입니다.
// - 누르면 ./mobile.html(폰 모양 안에서 이용자 화면이 도는 발표용 페이지)을 같은 탭에서 엽니다.
//   모바일 화면의 「대시보드」 버튼이 뒤로 가기로 돌아오므로, 보던 대시보드 화면·스크롤 위치가 그대로 남습니다.
// - 대시보드는 빌드본이라 React 소스를 고치지 않고, 다시 그려져도 버튼이 남도록 지켜보며 다시 붙입니다.
(function () {
  if (window.top !== window) return; // never inside the phone frame
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

  // 누를 때 스크롤 위치를 기억 → 모바일 화면에서 돌아오면 그 자리로 되돌림
  // (브라우저가 이전 화면을 보관하지 않고 새로 불러오는 경우 대비)
  var KEY = 'nd-mobile-return';
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#' + ID)) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ y: scrollY, url: location.href, t: Date.now() })); } catch (err) {}
  }, true);

  function restore() {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); } catch (err) {}
    if (!s || s.url !== location.href || Date.now() - s.t > 3 * 3600e3 || !s.y) return;
    // The app renders late and may jump to top on mount, so hold the position for a few seconds;
    // stop as soon as the presenter scrolls by hand.
    var until = Date.now() + 4000, stop = false;
    var quit = function () { stop = true; };
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (t) { addEventListener(t, quit, { once: true, passive: true }); });
    (function go() {
      if (stop || Date.now() > until) return;
      if (Math.abs(window.scrollY - s.y) > 4) window.scrollTo(0, s.y);
      setTimeout(go, 80);
    })();
  }
  // Only restore when we arrive back from the mobile page (its button or the browser back button).
  var fromMobile = /\/mobile\.html/.test(document.referrer || '') || (performance.getEntriesByType && (performance.getEntriesByType('navigation')[0] || {}).type === 'back_forward');
  window.addEventListener('pageshow', function (e) {
    if (e.persisted || !fromMobile) { try { sessionStorage.removeItem(KEY); } catch (err) {} return; }
    restore();
  });

  attach();
  new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true });
})();
