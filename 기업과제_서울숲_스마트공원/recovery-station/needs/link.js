// 기존 대시보드(서울숲, 머무는 숲)의 위쪽 탭 줄에 '3 맞춤형 추천'을 더합니다.
// 대시보드는 빌드된 묶음 파일(assets/index-*.js)이라 직접 고칠 수 없어, 화면이 그려진 뒤 탭 하나를 덧붙입니다.
// 대시보드를 다시 빌드할 때는 React 소스의 탭 줄에 같은 링크를 넣고 이 파일은 지우면 됩니다(README 참고).
(function () {
  'use strict';
  var HREF = './needs/', ID = 'nd-link', LABEL = '맞춤형 추천';

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
    // 소개 화면 PART 3의 목표 3 카드: 목표 1·2 카드 아래에 가로로 길게 놓습니다
    '.ans-card.g3{grid-column:1/-1;background:linear-gradient(150deg,#173b5c 0%,#2f6fa3 100%);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:34px;row-gap:18px;align-content:start}',
    '.ans-card.g3>.ans-tag,.ans-card.g3>h3,.ans-card.g3>.ans-gos{grid-column:1}',
    '.ans-card.g3>.ans-gos{align-self:end}',
    '.ans-card.g3>.ans-demo{grid-column:2;grid-row:1/4;align-self:center}',
    '.ans-card.g3 .demo-row b{background:#1f4e79}',
    '.ans-card.g3 .demo-row.pick{background:#e3edf7;color:#1f4e79}',
    '.ans-card.g3 .demo-row.pick i{flex:none;width:8px;height:8px;border-radius:99px;background:#2f6fa3;box-shadow:0 0 0 4px #2f6fa333}',
    '.ans-card.g3 .demo-row small{font-weight:600;color:#5b6660}',
    '.ans-card.g3 .ans-lede{margin:0;font-size:14px;line-height:1.65;color:#ffffffd1}',
    'a.ans-go{display:inline-block;text-decoration:none}',
    '.nd-g3-card{opacity:0;transform:translateY(28px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}',
    '.nd-g3-card.in{opacity:1;transform:none}',
    '@media(prefers-reduced-motion:reduce){.nd-g3-card{opacity:1;transform:none;transition:none}}',
    '@media(max-width:900px){.ans-card.g3{grid-template-columns:minmax(0,1fr)}.ans-card.g3>*{grid-column:1!important;grid-row:auto!important}}',
    'a.nd-invite-g3{background:#1f4e79;color:#fff;border:0;text-decoration:none}',
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

  // 작은 요소 만들기 도우미: el('div', 'class', [자식...]) — 글자는 textContent로만 넣습니다
  function el(tag, cls, kids, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    (kids || []).forEach(function (k) { e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // 소개 화면 PART 3(해법)에 놓을 목표 3 카드. 예시 값은 맞춤 추천 화면의 실제 계산 결과입니다
  // (평일 오후 · 아이와 · 놀기·체험 · 2시간 → 숲속놀이터, 관리자 화면 기본 제안 개수).
  function makeCard() {
    var demo = el('div', 'ans-demo', [
      el('div', 'demo-row pick', [el('i'), '아이와 · 놀기·체험 · 2시간']),
      el('div', 'demo-arrow', ['↓']),
      el('div', 'demo-row', [el('b', null, ['이용자']), '숲속놀이터 · 나무 그늘 94% · 화장실 75m']),
      el('div', 'demo-row', [el('b', null, ['산책']), '그늘·계단 없는 길로 40분 코스']),
      el('div', 'demo-row', [el('b', null, ['관리자']), '벤치 10 · 그늘 8 · 화장실 2곳 놓을 자리 제안']),
      el('span', 'demo-note', ['화면 예시']),
    ], { 'aria-label': '화면 예시' });
    var card = el('article', 'ans-card g3 nd-g3-card', [
      el('div', 'ans-tag', [el('span', null, ['목표 3']), '사람마다 다른 필요 · 할 일 · 머물 시간 · 동행']),
      el('h3', null, [el('span', 'ans-name', ['맞춤형 추천']), '누구와, 무엇을, 얼마나 머물지에 맞춰', el('br'), '갈 곳과 걷는 길을 골라 드립니다']),
      el('p', 'ans-lede', ['추천마다 그늘·화장실·붐빔·머물 수 있는 시간을 이유로 보여 주고, 서울숲이 맞지 않는 날에는 근처 도서관·주민센터를 알려 줍니다. 관리자에게는 쉬기 어려운 곳과 벤치·그늘·화장실이 필요한 자리를 보여 주고, AI가 보고서를 씁니다.']),
      demo,
      el('div', 'ans-gos', [
        el('a', 'ans-go', ['맞춤 추천 보기 →'], { href: HREF }),
        el('a', 'ans-go', ['쉬기 어려운 곳 →'], { href: HREF + '#admin' }),
      ]),
    ], { id: 'nd-g3-card' });
    // 다른 카드처럼 화면에 들어올 때 나타나게 합니다
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { card.classList.add('in'); io.disconnect(); } }); }, { threshold: .15 });
      io.observe(card);
    } else card.classList.add('in');
    return card;
  }

  // 소개 화면 맨 아래 '직접 찾아보세요' 단추 줄에 목표 3 단추를 더합니다
  function makeInvite() {
    return el('a', 'btn nd-invite-g3', ['목표 3 · 맞춤형 추천 →'], { href: HREF, id: 'nd-invite-g3' });
  }

  // 부모 안에 id 요소가 맨 끝에 있도록 둡니다(React가 다시 그려 지워지면 새로 만듭니다)
  function keepLast(parent, id, make) {
    if (!parent) return;
    var node = document.getElementById(id);
    if (!node || node.parentNode !== parent) { if (node) node.remove(); parent.appendChild(make()); }
    else if (parent.lastElementChild !== node) parent.appendChild(node);
  }

  // 탭 줄이 그려지거나 다시 그려질 때마다 링크가 맨 끝에 있는지 확인합니다
  function ensure() {
    keepLast(document.querySelector('#solution .ans'), 'nd-g3-card', makeCard);
    keepLast(document.querySelector('.invite .invite-btns'), 'nd-invite-g3', makeInvite);
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
