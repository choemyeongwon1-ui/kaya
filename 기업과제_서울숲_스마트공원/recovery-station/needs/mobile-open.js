// 이용자 화면(tour.html) 왼쪽 아래 구석(내 위치 버튼 옆)에 「모바일로 보기」 버튼을 붙입니다.
// - 누르면 ../mobile.html(폰 모양 안에서 이 화면이 도는 발표용 페이지)을 같은 탭에서 엽니다.
// - 모바일 화면 왼쪽 위 「‹ 이용자 화면」이 여기 기억해 둔 주소로 되돌아옵니다.
// - tour.js는 건드리지 않습니다. 화면이 다시 그려져도 버튼이 남도록 지켜보며 다시 붙입니다.
// - 폰 안(iframe)에서는 붙이지 않습니다.
(function () {
  if (window.top !== window) return;
  var ID = 'nd-mobile-open', KEY = 'nd-mobile-return';

  var css = document.createElement('style');
  // Bottom-left corner, right next to the 내 위치 button (.tr-locate: left 22px, bottom 30px, 44px).
  // Desktop only — on a real phone the user is already on mobile.
  css.textContent =
    '#' + ID + '{position:fixed;z-index:1050;left:76px;bottom:35px;display:inline-flex!important;color:var(--ink);padding:9px 14px}' +
    '#' + ID + ' svg{flex:none}' +
    '@media(max-width:899px){#' + ID + '{display:none!important}}';
  document.head.appendChild(css);

  function make() {
    var a = document.createElement('a');
    a.id = ID;
    a.className = 'tr-link';
    a.href = '../mobile.html';
    a.title = '휴대폰에서 연 모습으로 보기 (발표용)';
    a.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>모바일로 보기';
    a.addEventListener('click', function () {
      try { sessionStorage.setItem(KEY, JSON.stringify({ url: location.href, t: Date.now() })); } catch (e) {}
    });
    return a;
  }

  // The button lives on <body> (outside #tour), so tour re-renders never remove it:
  // attach once, then stop watching — a subtree observer would fire on every map tile while panning.
  var mo = null;
  function attach() {
    if (document.getElementById(ID)) { if (mo) mo.disconnect(); return; }
    if (!document.body || !document.querySelector('.tr-locate')) return; // wait until the tour screen is built
    document.body.appendChild(make());
    if (mo) mo.disconnect();
  }

  attach();
  if (!document.getElementById(ID)) {
    mo = new MutationObserver(attach);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
