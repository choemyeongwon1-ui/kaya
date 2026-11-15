// 기존 대시보드(서울숲, 머무는 숲)의 위쪽 탭 줄에 '3 나에게 맞는 곳'을 더합니다.
// 대시보드는 빌드된 묶음 파일(assets/index-*.js)이라 직접 고칠 수 없어, 화면이 그려진 뒤 탭 하나를 덧붙입니다.
// 대시보드를 다시 빌드할 때는 React 소스의 탭 줄에 같은 링크를 넣고 이 파일은 지우면 됩니다(README 참고).
(function () {
  'use strict';
  var HREF = './needs/', ID = 'nd-link', LABEL = '나에게 맞는 곳';

  var style = document.createElement('style');
  style.textContent = [
    ':root{--goal3:#1f4e79}',
    ':root[data-theme=dark]{--goal3:#5fa3dc}',
    '@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--goal3:#5fa3dc}}',
    '.goals-nav a.tab{text-decoration:none}',
    '.goal-tab.g3 .tab-n{box-shadow:inset 0 0 0 2px var(--goal3);background:transparent;color:var(--goal3)}',
    '@media(max-width:760px){.goals-nav{scrollbar-width:none}.goals-nav::-webkit-scrollbar{display:none}.goals-nav .tab{flex:0 0 auto}}',
    '.nd-float{position:fixed;right:16px;bottom:16px;z-index:2000;display:inline-flex;align-items:center;gap:8px;padding:11px 16px;border-radius:999px;',
    'background:#1f4e79;color:#fff;font-weight:700;font-size:14px;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.25)}',
  ].join('');
  document.head.appendChild(style);

  function makeLink() {
    var a = document.createElement('a'), n = document.createElement('span');
    a.id = ID; a.href = HREF; a.className = 'tab goal-tab g3';
    a.title = '하고 싶은 일·머물 시간·같이 온 사람에 맞춰 갈 곳과 산책길을 골라 드립니다';
    n.className = 'tab-n'; n.textContent = '3';
    a.appendChild(n); a.appendChild(document.createTextNode(LABEL));
    return a;
  }

  // 탭 줄이 그려지거나 다시 그려질 때마다 링크가 맨 끝에 있는지 확인합니다
  function ensure() {
    var nav = document.querySelector('.goals-nav');
    if (!nav) return false;
    var link = document.getElementById(ID);
    if (!link || link.parentNode !== nav) { if (link) link.remove(); nav.appendChild(makeLink()); }
    else if (nav.lastElementChild !== link) nav.appendChild(link);
    return true;
  }

  var root = document.getElementById('root') || document.body;
  new MutationObserver(ensure).observe(root, { childList: true, subtree: true });
  ensure();

  // 탭 줄을 끝내 찾지 못하면(대시보드 구조가 바뀐 경우) 화면 구석의 단추로 대신합니다
  setTimeout(function () {
    if (document.getElementById(ID)) return;
    var a = makeLink();
    a.className = 'nd-float'; a.removeChild(a.firstChild);
    document.body.appendChild(a);
  }, 5000);
})();
