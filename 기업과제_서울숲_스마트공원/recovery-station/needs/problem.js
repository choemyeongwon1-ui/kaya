// 소개 화면 PART 1 「발견」을 기획 보고서 1.2절 「문제의식」 네 가지로 바꿉니다.
// - 빌드된 묶음 파일(assets/index-*.js)은 건드리지 않습니다. 원래 PART 1(#scenes, 성수의 네 장면)은 숨기고
//   그 바로 뒤에 같은 모양의 구역(#nd-problem)을 붙입니다. React가 다시 그려도 다시 붙입니다.
// - 소개 첫 화면의 '성수의 네 장면에서 문제를 발견하고' 문장도 문제의식에 맞게 바꿉니다.
// - 되돌리려면 이 파일을 지우고 index.html의 problem.js 줄을 빼면 됩니다(원래 PART 1이 그대로 다시 보입니다).
(function () {
  'use strict';
  var ID = 'nd-problem';
  var INTRO_OLD = '성수의 네 장면에서 문제를 발견하고, 데이터로 답을 찾았습니다.';
  var INTRO_NEW = '처음 온 사람이 서울숲에서 겪는 네 가지 문제를 살피고, 데이터로 답을 찾았습니다.';

  // 보고서 「디설스 서울숲 보고서 3」 1.2 문제의식
  var ITEMS = [
    { n: '01', k: '정보 부족', big: '40.2', unit: '%', cap: '서울숲 방문객 중 처음 온 사람',
      body: '서울숲 방문객의 40.2%가 처음 온 사람이었고, 안내 시설로 정보를 얻는 경우는 드물었습니다.',
      src: '주신하·김영희 (2010), 한국조경학회지 38(5)' },
    { n: '02', k: '구역별 혼잡을 알 수 없음', big: '1', unit: '개', cap: '서울시 실시간 데이터가 주는 서울숲 혼잡도 값',
      body: '서울시 실시간 데이터는 서울숲 전체의 혼잡도 하나만 알려 줍니다. 공원 안 어느 곳이 여유로운지는 알 수 없습니다.',
      src: '서울시 실시간 도시데이터 (OA-21778)' },
    { n: '03', k: '몰림과 회피', big: '1,400', unit: '만 명', cap: '2026 서울국제정원박람회 180일 방문객',
      body: '붐빈다고 느끼면 이용자는 다른 장소나 시간으로 옮기려 합니다. 정원박람회처럼 큰 행사가 열리면 방문객 자체가 크게 늘어납니다.',
      src: 'Arnberger 외 (2010) · 서울시 발표 (서울숲·매헌시민의숲 합계)' },
    { n: '04', k: '머물기 어려운 땅', big: '8.8', unit: 'ha', cap: '그늘과 쉼터가 부족해 머물기 어려운 땅',
      body: '20m 격자 분석 결과, 그늘과 쉼터가 부족해 머물기 어려운 땅이 8.8ha였습니다.',
      src: '팀 분석 · 20m 칸 1,097개', go: ['어디인지 보기 →', '#expert'] },
  ];

  var style = document.createElement('style');
  style.textContent = [
    '#scenes{display:none!important}',
    '#' + ID + ' .pb-lead{margin:18px 0 0;max-width:46em;font-size:17px;line-height:1.7;color:var(--ink-2)}',
    '#' + ID + ' .pb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:34px}',
    '#' + ID + ' .pb-card{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(0,1.2fr);gap:22px;align-items:start;padding:26px 26px 22px;border-radius:22px;background:var(--surface-2);border:1px solid var(--hair)}',
    '#' + ID + ' .pb-num{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;color:var(--brand)}',
    '#' + ID + ' .pb-num b{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-size:11.5px}',
    '#' + ID + ' .pb-big{margin-top:14px;font-size:clamp(34px,4vw,50px);font-weight:800;letter-spacing:-.04em;line-height:1;color:var(--brand);font-variant-numeric:tabular-nums}',
    '#' + ID + ' .pb-big small{margin-left:3px;font-size:.42em;font-weight:700;letter-spacing:0}',
    '#' + ID + ' .pb-cap{margin-top:8px;font-size:12.5px;line-height:1.5;color:var(--ink-2)}',
    '#' + ID + ' h3{margin:0;font-size:19px;font-weight:800;letter-spacing:-.03em;color:var(--ink)}',
    '#' + ID + ' .pb-body{margin:10px 0 0;font-size:14.5px;line-height:1.7;color:var(--ink-2)}',
    '#' + ID + ' .pb-src{margin-top:12px;font-size:11.5px;color:var(--muted)}',
    '#' + ID + ' .pb-go{display:inline-block;margin-top:12px;font-size:13px;font-weight:700;color:var(--brand);text-decoration:none}',
    '#' + ID + ' .pb-go:hover{text-decoration:underline}',
    '@media(max-width:1100px){#' + ID + ' .pb-grid{grid-template-columns:minmax(0,1fr)}}',
    '@media(max-width:600px){#' + ID + ' .pb-card{grid-template-columns:minmax(0,1fr);gap:12px;padding:22px 20px}}',
  ].join('');
  document.head.appendChild(style);

  function el(tag, cls, kids, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    (kids || []).forEach(function (k) { if (k != null) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function make() {
    return el('section', 'part', [
      el('div', 'part-kick', ['PART 1 · 문제의식']),
      el('h2', 'part-title', ['처음 온 사람은 어디로 가야 할지 모른다 — ', el('em', 'pt-em', ['붐비는 곳과 비어 있는 곳'])]),
      el('p', 'pb-lead', ['처음 온 사람은 서울숲에서 어디로 가야 할지 잘 모릅니다. 그 결과 붐비는 곳과 비어 있는 곳이 함께 생깁니다.']),
      el('div', 'pb-grid', ITEMS.map(function (it) {
        return el('article', 'pb-card', [
          el('div', null, [
            el('span', 'pb-num', [el('b', null, [it.n]), '문제']),
            el('div', 'pb-big', [it.big, el('small', null, [it.unit])]),
            el('div', 'pb-cap', [it.cap]),
          ]),
          el('div', null, [
            el('h3', null, [it.k]),
            el('p', 'pb-body', [it.body]),
            el('div', 'pb-src', [it.src]),
            it.go ? el('a', 'pb-go', [it.go[0]], { href: it.go[1] }) : null,
          ]),
        ]);
      })),
    ], { id: ID, 'aria-label': '문제의식' });
  }

  function ensure() {
    var scenes = document.getElementById('scenes'), node = document.getElementById(ID);
    if (!scenes) { if (node) node.remove(); }
    else if (!node || node.previousElementSibling !== scenes) { if (node) node.remove(); scenes.insertAdjacentElement('afterend', make()); }
    var sub = document.querySelector('.intro .intro-sub');
    if (sub && sub.innerHTML.indexOf(INTRO_OLD) >= 0) sub.innerHTML = sub.innerHTML.replace(INTRO_OLD, INTRO_NEW);
    // 왼쪽 목차(PART 1 · 발견)의 이름을 바꿉니다
    var r1 = document.querySelector('nav.rail button');
    if (r1) r1.childNodes.forEach(function (c) { if (c.nodeType === 3 && c.nodeValue === '발견') c.nodeValue = '문제의식'; });
  }

  // '질문 따라가기'와 목차의 PART 1은 원래 숨긴 #scenes로 스크롤하므로, 새 구역으로 보냅니다
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.intro .btn-hero, nav.rail button');
    if (!b) return;
    if (b.matches('nav.rail button') && b !== document.querySelector('nav.rail button')) return;   // PART 2·3은 그대로
    var node = document.getElementById(ID);
    if (!node) return;
    e.preventDefault(); e.stopPropagation();
    node.scrollIntoView({ behavior: 'smooth' });
  }, true);

  var root = document.getElementById('root') || document.body, busy = false;
  new MutationObserver(function () { if (busy) return; busy = true; try { ensure(); } finally { busy = false; } })
    .observe(root, { childList: true, subtree: true });
  ensure();
})();
