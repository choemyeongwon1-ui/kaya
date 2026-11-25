// 이용자 화면(tour.html) 위쪽 「돌아가기」 옆에 「모바일로 보기」 버튼을 붙입니다.
// - 누르면 ../mobile.html(폰 모양 안에서 이 화면이 도는 발표용 페이지)을 같은 탭에서 엽니다.
// - 모바일 화면 왼쪽 위 「‹ 이용자 화면」이 여기 기억해 둔 주소로 되돌아옵니다.
// - tour.js는 건드리지 않습니다. 화면이 다시 그려져도 버튼이 남도록 지켜보며 다시 붙입니다.
// - 폰 안(iframe)에서는 붙이지 않습니다.
(function () {
  if (window.top !== window) return;
  var ID = 'nd-mobile-open', KEY = 'nd-mobile-return';

  var css = document.createElement('style');
  css.textContent = '#' + ID + '{display:inline-flex!important;color:var(--ink)}#' + ID + ' svg{flex:none}';
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

  function attach() {
    if (document.getElementById(ID)) return;
    var back = document.querySelector('.tr-link.tr-back');
    if (!back || !back.parentNode) return;
    back.parentNode.insertBefore(make(), back);
  }

  attach();
  new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true });
})();
