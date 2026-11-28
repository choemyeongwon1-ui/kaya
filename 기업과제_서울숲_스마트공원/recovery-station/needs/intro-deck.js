// 소개 탭: 이용자에게 '서울숲 코스 찾기'를 소개하는 발표 슬라이드 7장(가로로 넘김).
// 장마다 한 화면을 꽉 채우고, 그림은 SVG·CSS 애니메이션으로 그립니다(실제 지도 모양이 아닌 설명용 그림).
// 마지막 장만 연구 배경을 한 장으로 요약합니다. 기존 소개(현황·문제·전략·근거)는 숨기기만 하고 지우지 않습니다.
(function () {
  'use strict';
  var BASE = ((document.currentScript || {}).src || '').replace(/[^/]*$/, '');
  var TOUR = BASE + 'tour.html';
  var MOBILE = BASE + '../mobile.html';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 설명용 공원 그림(공통) ──
  var PARK = 'M62 74 C120 30 226 38 288 60 C350 84 366 146 334 196 C302 246 222 266 150 250 C88 236 38 192 44 140 C47 110 40 92 62 74Z';
  var TREES = [[110, 100], [128, 92], [118, 116], [240, 80], [258, 92], [246, 102], [160, 210], [176, 222], [300, 120], [312, 136], [80, 150], [96, 162]];
  function park(extra, cls) {
    return '<svg class="dk-map ' + (cls || '') + '" viewBox="0 0 400 300" aria-hidden="true">' +
      '<defs><radialGradient id="dkG" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#1e4a35"/><stop offset="1" stop-color="#0f2a1e"/></radialGradient>' +
      '<filter id="dkGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<path class="pk-fill" d="' + PARK + '" fill="url(#dkG)"/>' +
      '<path class="pk-edge" d="' + PARK + '" pathLength="1"/>' +
      '<path class="pk-river" d="M0 282 C90 262 190 292 280 270 S 380 258 400 266"/>' +
      TREES.map(function (t, i) { return '<circle class="pk-tree" style="--i:' + i + '" cx="' + t[0] + '" cy="' + t[1] + '" r="' + (7 + (i % 3) * 2) + '"/>'; }).join('') +
      (extra || '') + '</svg>';
  }
  var ROUTE = 'M90 205 C128 176 150 124 200 116 S 282 104 302 152';
  var STOPS = [[90, 205], [200, 116], [302, 152]];
  function stops(cls) { return STOPS.map(function (s, i) { return '<g class="pk-stop ' + (cls || '') + '" style="--i:' + i + '" transform="translate(' + s[0] + ' ' + s[1] + ')"><circle r="11"/><text y="4">' + (i + 1) + '</text></g>'; }).join(''); }

  var V = {
    // 1. 표지: 공원 윤곽이 그려지고, 장소 점이 켜지고, 붐빔 알약이 뜸
    home: function () {
      var dots = [[120, 110, 'g'], [200, 116, 'y'], [250, 90, 'g'], [302, 152, 'g'], [170, 214, 'y'], [90, 205, 'g'], [276, 210, 'r']];
      return '<div class="dk-vis v-home">' + park(
        dots.map(function (d, i) { return '<g class="pk-pulse ' + d[2] + '" style="--i:' + i + '" transform="translate(' + d[0] + ' ' + d[1] + ')"><circle class="ring" r="6"/><circle r="5"/></g>'; }).join('')) +
        '<div class="v-pill"><i></i>지금 서울숲 <b>보통</b></div>' +
        '<div class="v-chip c1">☀️ 18° 맑음</div><div class="v-chip c2">🚇 서울숲역 도보 2분</div>' +
        '</div>';
    },
    // 2. 세 번 고르기: 카드 3장이 차례로 눌리고, 지도에 길이 그려짐
    pick: function () {
      var cards = [['하고 싶은 것', ['쉬기', '걷기', '놀기'], 1], ['같이 온 사람', ['혼자', '연인', '아이'], 2], ['머물 시간', ['30분', '1시간', '2시간'], 1]];
      return '<div class="dk-vis v-pick"><div class="v-cards">' + cards.map(function (c, i) {
        return '<div class="v-card" style="--i:' + i + '"><small>' + (i + 1) + ' · ' + c[0] + '</small><div>' + c[1].map(function (o, k) { return '<span class="' + (k === c[2] ? 'pick' : '') + '">' + o + '</span>'; }).join('') + '</div></div>';
      }).join('') + '</div><div class="v-arrow">→</div>' + park('<path class="pk-route draw" d="' + ROUTE + '" pathLength="1"/>' + stops('late'), 'small') + '</div>';
    },
    // 3. 날씨: 저절로 폭염 → 호우 → 미세먼지 → 한파로 바뀌며 길이 그늘/실내로 바뀜
    weather: function () {
      var drops = '', flakes = '', haze = '';
      for (var i = 0; i < 26; i++) drops += '<i style="--x:' + (i * 37 % 100) + '%;--d:' + (0.6 + (i % 5) * .12) + 's;--l:' + (-(i % 7) * .2) + 's"></i>';
      for (i = 0; i < 18; i++) flakes += '<i style="--x:' + (i * 53 % 100) + '%;--d:' + (3 + (i % 4)) + 's;--l:' + (-(i % 6) * .6) + 's">❄</i>';
      for (i = 0; i < 14; i++) haze += '<i style="--x:' + (i * 29 % 100) + '%;--y:' + (i * 41 % 90) + '%;--d:' + (5 + i % 4) + 's"></i>';
      var house = '<g class="pk-house" transform="translate(262 214)"><rect x="-15" y="-6" width="30" height="20" rx="3"/><path d="M-19 -5 L0 -20 L19 -5Z"/><text y="9">실내</text></g>';
      var shade = 'M90 205 C110 170 100 130 118 108 S 230 70 250 90 S 300 110 306 128';
      var inside = 'M90 205 C140 228 200 238 262 222';
      return '<div class="dk-vis v-weather" data-w="heat">' +
        '<div class="v-sky"><div class="sun"><i></i></div><div class="rain">' + drops + '</div><div class="snow">' + flakes + '</div><div class="haze">' + haze + '</div></div>' +
        park(house + '<path class="pk-route r-shade" d="' + shade + '" pathLength="1"/><path class="pk-route r-in" d="' + inside + '" pathLength="1"/><g class="pk-stop" transform="translate(90 205)"><circle r="11"/><text y="4">▶</text></g>') +
        '<div class="v-wtag"><b class="t-heat">체감 35℃ · 그늘과 물가로</b><b class="t-rain">호우 · 실내로 먼저</b><b class="t-dust">미세먼지 나쁨 · 실내로 먼저</b><b class="t-cold">체감 −10℃ · 실내로 먼저</b></div>' +
        '</div>';
    },
    // 4. 표정: 도착 카드 → 😞 누름 → '붐벼요' → 남은 길이 바로 바뀜
    rate: function () {
      return '<div class="dk-vis v-rate">' + park(
        '<path class="pk-route" d="M90 205 C128 176 150 124 200 116" pathLength="1" style="stroke-dashoffset:0"/>' +
        '<path class="pk-route old" d="M200 116 C246 96 290 112 302 152" pathLength="1"/>' +
        '<path class="pk-route new" d="M200 116 C214 160 240 192 272 208" pathLength="1"/>' +
        '<g class="pk-crowd" transform="translate(302 152)">' + [[-10, -6], [6, -10], [10, 6], [-6, 10], [0, 0], [-14, 6], [14, -2]].map(function (p, i) { return '<circle style="--i:' + i + '" cx="' + p[0] + '" cy="' + p[1] + '" r="3.2"/>'; }).join('') + '</g>' +
        '<g class="pk-stop" transform="translate(90 205)"><circle r="11"/><text y="4">1</text></g><g class="pk-stop here" transform="translate(200 116)"><circle r="13"/><text y="4">2</text></g>' +
        '<g class="pk-stop alt" transform="translate(272 208)"><circle r="11"/><text y="4">3</text></g>', 'small') +
        '<div class="v-ask"><small>2 · 거울연못</small><b>이 자리, 쾌적한가요?</b><div class="faces"><span class="f5">😊</span><span class="f3">😐</span><span class="f1">😞</span></div><div class="why"><span>붐벼요</span><span>더워요</span><span>쉴 곳 없음</span></div><div class="v-fix">↻ 남은 코스를 한산한 곳으로 바꿨어요</div></div>' +
        '<div class="v-tap"></div></div>';
    },
    // 5. 영수증: 기계에서 영수증이 출력되고, 쿠폰이 떨어짐 + 공원 곳곳 기계 핀
    end: function () {
      var pins = [[96, 204], [300, 150], [200, 116], [150, 240], [250, 86], [120, 100], [320, 190], [70, 140], [230, 220], [180, 60], [280, 120], [140, 170]];
      return '<div class="dk-vis v-end">' + park(pins.map(function (p, i) { return '<g class="pk-kiosk" style="--i:' + i + '" transform="translate(' + p[0] + ' ' + p[1] + ')"><rect x="-9" y="-9" width="18" height="18" rx="5"/><text y="4">🧾</text></g>'; }).join(''), 'small') +
        '<div class="v-machine"><div class="slot"></div><div class="paper"><b>서울숲 산책 영수증</b><p><span>걸은 시간</span><span>52분</span></p><p><span>걸은 거리</span><span>2.4km</span></p><p><span>들른 곳</span><span>4곳</span></p><p><span>좋았던 곳</span><span>은행나무숲</span></p><svg viewBox="0 0 120 40"><path d="M6 30 C30 6 50 34 70 16 S 104 10 114 24" pathLength="1"/></svg><em>오늘도 잘 쉬다 가요</em></div></div>' +
        '<div class="v-coupon"><b>☕ 카페 할인 쿠폰</b><small>성수 근처 카페에서 보여 주세요</small></div>' +
        '</div>';
    },
    // 6. 시작: 물결 + 떠다니는 잎 + 큰 버튼
    go: function () {
      var leaves = '';
      for (var i = 0; i < 14; i++) leaves += '<i style="--x:' + (i * 61 % 100) + '%;--d:' + (7 + i % 5) + 's;--l:' + (-i * .8) + 's;--r:' + (i * 47 % 360) + 'deg">🍃</i>';
      return '<div class="dk-vis v-go"><div class="ripple"><i></i><i></i><i></i></div><div class="leaf">' + leaves + '</div><div class="v-logo"><svg viewBox="0 0 24 24"><path d="M12 2.5 19 13h-3.6l4.6 7.5H4L8.6 13H5z"/></svg></div></div>';
    },
  };

  var SLIDES = [
    { key: 'home', kicker: '서울숲 산책 안내', title: '오늘 서울숲,<br><em>어디로 걸을까요?</em>',
      body: '지금 날씨와 붐비는 정도를 보고, 나에게 맞는 산책 코스를 지도에 그려 드려요. 설치도 가입도 없이 링크 하나로 열려요.', cta: true },
    { key: 'pick', kicker: '01 · 고르기', title: '세 번만 고르면<br><em>코스가 나와요</em>',
      items: [['🌿', '하고 싶은 것', '쉬기 · 걷기 · 놀기 · 운동 · 구경 · 피크닉'], ['👥', '같이 온 사람', '혼자 · 연인 · 친구 · 아이 · 어르신 · 반려견'], ['⏱', '머물 시간', '30분부터 3시간 이상까지']],
      note: '고르기 어려우면 추천 코스를 바로 눌러도 돼요.' },
    { key: 'weather', kicker: '02 · 날씨에 맞춰', title: '더운 날엔 그늘로,<br><em>비 오면 실내로</em>',
      items: [['☀️', '더운 날', '나무 그늘과 물가를 지나는 길로'], ['🌧', '비·미세먼지·추운 날', '곤충식물원·나비정원 같은 실내를 먼저'], ['👣', '붐빌 때 · 아이·어르신과', '한산한 곳, 계단 없는 길로']],
      wx: true },
    { key: 'rate', kicker: '03 · 걸으며', title: '도착하면<br><em>표정 하나면 돼요</em>',
      items: [['😊', '좋으면', '그대로 다음 곳으로 이어 가요'], ['😞', '아쉬우면', '까닭을 고르면 남은 코스를 바로 바꿔요']],
      note: '표정은 이름·위치 없이 공원 길과 쉼터를 고치는 데만 써요.' },
    { key: 'end', kicker: '04 · 마치면', title: '산책 영수증 받고,<br><em>카페 쿠폰도 챙기세요</em>',
      items: [['🧾', '영수증 기계 12곳', '공원 곳곳에, 가장 가까운 곳으로 길 안내'], ['☕', '카페 할인 쿠폰', '표정을 남기면 영수증과 함께. 어떤 표정이든 똑같이']],
      note: '영수증 기계와 카페 쿠폰은 우리 팀이 제안하는 운영 방식이에요.' },
    { key: 'go', kicker: '시작하기', title: '지금 바로<br><em>걸어 볼까요?</em>',
      body: '서울숲 입구에서 링크를 열면 내 위치에서 시작해요. 집에서 미리 코스를 둘러봐도 좋아요.', cta: true },
    { key: 'why', kicker: '우리가 이걸 만든 이유', title: '처음 온 사람도, 한여름에도<br><em>서울숲에 오래 머물도록</em>', research: true },
  ];

  var RESEARCH = [
    { h: '현황', t: '서울 전역에서 찾아오는 공원', rows: [['73.4%', '동네 밖에서 온 방문객', '서울시 실시간 인구데이터(2026-11-19)'], ['1위', '서울 직영 공원 26곳 중 온라인 언급 비중 33.7%', '서울AI재단(2026)']] },
    { h: '문제', t: '정보는 부족하고, 여름엔 발길이 끊겨요', rows: [['40.2%', '처음 온 방문객. 안내 시설로 정보를 얻는 경우는 드묾', '주신하·김영희(2010)'], ['−48.6%', '서울숲역 낮 하차 5월 8,864명 → 8월 4,557명', '서울 열린데이터광장 OA-12252(2026)']] },
    { h: '해결', t: '추천과 평가가 한 바퀴로 이어져요', flow: ['날씨·붐빔·동행', '그늘·한산한 길 찾기<small>가장 짧은 길의 1.2배까지</small>', '맞춤 코스', '장소별 표정 평가', '다음 추천에 반영'] },
    { h: '근거', t: '선행연구 값을 기준으로', rows: [['5.5~7.4℃', '33℃ 넘는 시간, 공원 안이 밖 도로보다 시원', '조현민·권태경(2022)'], ['12%', '조용하고 보기 좋은 길이 더 길어도 더 선호', 'Quercia 외(2014)'], ['IPA', '편의시설: 중요도는 높고 만족은 낮음', '이지연(2012)']] },
  ];

  var E = 'cubic-bezier(.16,1,.3,1)';
  var css = [
    '.hm.dk-on > :not(.dk){display:none !important}',
    '.dk{--m:#6af5b0;--ink:#f1f7f3;--mu:rgba(241,247,243,.6);--ln:rgba(255,255,255,.09);--gl:rgba(10,20,15,.55);',
    '  position:relative;overflow:hidden;border-radius:28px;color:var(--ink);font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;background:#07120d;',
    '  box-shadow:0 30px 80px -30px rgba(5,20,12,.55);isolation:isolate;touch-action:pan-y;user-select:none}',
    '.dk:fullscreen{border-radius:0}',
    /* 배경: 흐르는 빛 덩어리 + 반딧불 */
    '.dk-bg{position:absolute;inset:-20%;z-index:-2;pointer-events:none;filter:blur(60px);opacity:.9}',
    '.dk-bg i{position:absolute;border-radius:50%;animation:dkBlob 18s ease-in-out infinite alternate}',
    '.dk-bg i:nth-child(1){width:50%;height:60%;left:50%;top:0;background:rgba(106,245,176,.16)}',
    '.dk-bg i:nth-child(2){width:45%;height:55%;left:5%;top:45%;background:rgba(40,140,100,.22);animation-duration:22s;animation-delay:-6s}',
    '.dk-bg i:nth-child(3){width:35%;height:40%;left:35%;top:30%;background:rgba(226,177,92,.08);animation-duration:26s;animation-delay:-12s}',
    '@keyframes dkBlob{0%{transform:translate(0,0) scale(1)}50%{transform:translate(8%,-6%) scale(1.15)}100%{transform:translate(-6%,8%) scale(.92)}}',
    '.dk-fly{position:absolute;inset:0;z-index:-1;pointer-events:none}',
    '.dk-fly i{position:absolute;left:var(--x);bottom:-10px;width:3px;height:3px;border-radius:50%;background:#dfffe9;box-shadow:0 0 10px 3px rgba(106,245,176,.5);opacity:0;animation:dkFly var(--d) linear infinite;animation-delay:var(--l)}',
    '@keyframes dkFly{0%{transform:translate(0,0);opacity:0}10%{opacity:.9}90%{opacity:.5}100%{transform:translate(var(--dx),-110vh);opacity:0}}',
    /* 장 넘김: 들어오는 장은 살짝 커지며, 나가는 장은 작아지며 흐려짐 */
    '.dk-track{display:flex;height:100%;transition:transform .9s ' + E + ';will-change:transform}',
    '.dk.drag .dk-track{transition:none}',
    '.dk-slide{position:relative;flex:0 0 100%;height:100%;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);align-items:center;gap:48px;padding:56px 72px 96px;box-sizing:border-box;transition:opacity .8s,transform .9s ' + E + ';opacity:.15;transform:scale(.92)}',
    '.dk-slide.on{opacity:1;transform:none}',
    '.dk-slide.full{grid-template-columns:1fr;align-content:center}',
    '.dk-copy{max-width:540px;position:relative;z-index:2}',
    '.dk-kicker{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--m);margin-bottom:20px}',
    '.dk-kicker:before{content:"";width:0;height:2px;background:currentColor;transition:width .8s ' + E + ' .2s}',
    '.dk-slide.on .dk-kicker:before{width:30px}',
    '.dk-title{margin:0 0 22px;font-size:clamp(34px,4.4vw,62px);line-height:1.12;letter-spacing:-.045em;font-weight:780}',
    '.dk-title .w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.06em}',
    '.dk-title .w > span{display:inline-block;transform:translateY(110%) rotate(6deg);transition:transform .9s ' + E + ';transition-delay:calc(.15s + var(--i) * .07s)}',
    '.dk-slide.on .dk-title .w > span{transform:none}',
    '.dk-title em{font-style:normal;background:linear-gradient(100deg,#6af5b0 0%,#c9ffe3 45%,#6af5b0 70%);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:dkShine 5s ease-in-out infinite}',
    '@keyframes dkShine{0%,100%{background-position:100% 0}50%{background-position:0 0}}',
    '.dk-body{margin:0 0 30px;font-size:18px;line-height:1.65;color:var(--mu)}',
    '.dk-items{list-style:none;margin:0 0 18px;padding:0;display:grid;gap:10px}',
    '.dk-items li{display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:16px;background:var(--gl);border:1px solid var(--ln);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}',
    '.dk-items li span{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:20px;background:rgba(106,245,176,.09)}',
    '.dk-items li b{display:block;font-size:16px;margin-bottom:2px}',
    '.dk-items li small{font-size:13.5px;color:var(--mu);line-height:1.45}',
    '.dk-note{font-size:13px;color:var(--mu);margin:0}',
    /* 등장 순서(글) */
    '.dk-copy .rv{opacity:0;transform:translateX(-28px);filter:blur(6px);transition:opacity .7s,transform .9s ' + E + ',filter .7s;transition-delay:calc(.45s + var(--i) * .1s)}',
    '.dk-slide.on .dk-copy .rv{opacity:1;transform:none;filter:none}',
    '.dk-cta{display:flex;flex-wrap:wrap;gap:12px}',
    '.dk-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:10px;padding:16px 24px;border-radius:999px;font:700 16px/1 inherit;text-decoration:none;cursor:pointer;border:1px solid var(--ln);background:rgba(255,255,255,.05);color:var(--ink);transition:transform .25s ' + E + ',background .2s}',
    '.dk-btn:hover{transform:translateY(-2px) scale(1.03);background:rgba(255,255,255,.1)}',
    '.dk-btn.main{background:var(--m);border-color:var(--m);color:#03140b;animation:dkPulse 2.4s ease-in-out infinite}',
    '.dk-btn.main:after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.7),transparent);transform:skewX(-20deg);animation:dkSweep 3.2s ease-in-out infinite}',
    '.dk-btn.main span{transition:transform .25s}.dk-btn.main:hover span{transform:translateX(4px)}',
    '@keyframes dkPulse{0%,100%{box-shadow:0 0 0 0 rgba(106,245,176,.45),0 10px 30px -10px rgba(106,245,176,.6)}50%{box-shadow:0 0 0 12px rgba(106,245,176,0),0 10px 30px -10px rgba(106,245,176,.6)}}',
    '@keyframes dkSweep{0%,60%{left:-60%}100%{left:130%}}',
    /* 그림 영역 */
    '.dk-vis{position:relative;width:100%;aspect-ratio:4/3;max-height:calc(100% - 20px);justify-self:center;opacity:0;transform:translateX(60px) scale(.94);transition:opacity .9s,transform 1.1s ' + E + ';transition-delay:.25s}',
    '.dk-slide.on .dk-vis{opacity:1;transform:none}',
    '.dk-map{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
    '.dk-map.small{inset:auto 0 0 auto;width:72%;height:72%}',
    '.pk-fill{opacity:0;transition:opacity 1.2s .6s}',
    '.dk-slide.on .pk-fill{opacity:1}',
    '.pk-edge{fill:none;stroke:var(--m);stroke-width:2;stroke-dasharray:1;stroke-dashoffset:1;filter:url(#dkGlow)}',
    '.dk-slide.on .pk-edge{animation:dkDraw 2.2s ' + E + ' .3s forwards}',
    '.pk-river{fill:none;stroke:rgba(106,180,245,.35);stroke-width:14;stroke-linecap:round}',
    '.pk-tree{fill:#2f6b4c;transform-box:fill-box;transform-origin:center;transform:scale(0)}',
    '.dk-slide.on .pk-tree{animation:dkPop .7s ' + E + ' forwards,dkSway 4s ease-in-out infinite alternate;animation-delay:calc(1s + var(--i) * .06s),calc(1.8s + var(--i) * .2s)}',
    '@keyframes dkPop{0%{transform:scale(0)}70%{transform:scale(1.25)}100%{transform:scale(1)}}',
    '@keyframes dkPopIn{0%{opacity:0;transform:scale(0)}70%{opacity:1;transform:scale(1.25)}100%{opacity:1;transform:scale(1)}}',
    '@keyframes dkSway{0%{transform:scale(1)}100%{transform:scale(1.12)}}',
    '@keyframes dkDraw{to{stroke-dashoffset:0}}',
    '.pk-route{fill:none;stroke:var(--m);stroke-width:5;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;filter:url(#dkGlow)}',
    '.dk-slide.on .pk-route.draw{animation:dkDraw 1.6s ' + E + ' 2.3s forwards}',
    '.pk-stop{transform-box:fill-box}',
    '.pk-stop circle{fill:#0b1d15;stroke:var(--m);stroke-width:2.5}',
    '.pk-stop text{fill:var(--m);font:800 11px/1 Pretendard,sans-serif;text-anchor:middle}',
    '.pk-stop.late{opacity:0}',
    '.dk-slide.on .pk-stop.late{animation:dkFade .5s ' + E + ' forwards;animation-delay:calc(2.4s + var(--i) * .5s)}',
    '@keyframes dkFade{from{opacity:0}to{opacity:1}}',
    '.pk-pulse circle{fill:#6af5b0}.pk-pulse.y circle{fill:#ffd27a}.pk-pulse.r circle{fill:#ff8a7a}',
    '.pk-pulse{opacity:0}',
    '.dk-slide.on .pk-pulse{animation:dkFade .4s forwards;animation-delay:calc(1.6s + var(--i) * .15s)}',
    '.pk-pulse .ring{fill:none !important;stroke:currentColor;stroke-width:2;transform-box:fill-box;transform-origin:center;animation:dkRing 2s ease-out infinite;animation-delay:calc(var(--i) * .3s)}',
    '.pk-pulse.g{color:#6af5b0}.pk-pulse.y{color:#ffd27a}.pk-pulse.r{color:#ff8a7a}',
    '@keyframes dkRing{0%{transform:scale(1);opacity:.9}100%{transform:scale(3.4);opacity:0}}',
    /* 1. 표지 */
    '.v-pill,.v-chip{position:absolute;display:flex;align-items:center;gap:8px;padding:11px 16px;border-radius:999px;background:rgba(10,20,15,.8);border:1px solid var(--ln);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-size:15px;font-weight:700;opacity:0;transform:translateY(16px) scale(.9);white-space:nowrap}',
    '.v-pill{left:36%;top:44%}.v-pill b{color:#ffd27a}.v-pill i{width:8px;height:8px;border-radius:50%;background:#ffd27a;box-shadow:0 0 0 0 rgba(255,210,122,.6);animation:dkDot 1.6s infinite}',
    '@keyframes dkDot{0%{box-shadow:0 0 0 0 rgba(255,210,122,.6)}100%{box-shadow:0 0 0 12px rgba(255,210,122,0)}}',
    '.v-chip{font-size:13px;font-weight:600}.v-chip.c1{right:2%;top:6%}.v-chip.c2{left:0;bottom:8%}',
    '.dk-slide.on .v-pill{animation:dkUp .8s ' + E + ' 2.5s forwards}',
    '.dk-slide.on .v-chip.c1{animation:dkUp .8s ' + E + ' 2.9s forwards,dkFloat 5s ease-in-out 3.7s infinite}',
    '.dk-slide.on .v-chip.c2{animation:dkUp .8s ' + E + ' 3.2s forwards,dkFloat 6s ease-in-out 4s infinite}',
    '@keyframes dkUp{to{opacity:1;transform:none}}',
    '@keyframes dkFloat{0%,100%{opacity:1;transform:translateY(0)}50%{opacity:1;transform:translateY(-8px)}}',
    /* 2. 고르기 */
    '.v-cards{position:absolute;left:0;top:4%;width:46%;display:flex;flex-direction:column;gap:12px;z-index:2}',
    '.v-card{padding:14px 16px;border-radius:18px;background:rgba(10,20,15,.82);border:1px solid var(--ln);opacity:0;transform:translateX(-30px) rotate(-3deg)}',
    '.v-card small{display:block;font-size:12px;color:var(--mu);margin-bottom:9px;font-weight:600}',
    '.v-card div{display:flex;gap:6px}',
    '.v-card span{flex:1;display:flex;justify-content:center;text-align:center;padding:9px 0;border-radius:11px;background:rgba(255,255,255,.05);font-size:14px;font-weight:600;transition:background .3s,color .3s,transform .3s}',
    '.dk-slide.on .v-card{animation:dkCard .8s ' + E + ' forwards;animation-delay:calc(.5s + var(--i) * .55s)}',
    '@keyframes dkCard{to{opacity:1;transform:none}}',
    '.dk-slide.on .v-card span.pick{animation:dkPick .5s ' + E + ' forwards;animation-delay:calc(1s + var(--i) * .55s)}',
    '@keyframes dkPick{0%{transform:scale(1)}40%{transform:scale(.88)}100%{transform:scale(1.04);background:#6af5b0;color:#03140b;box-shadow:0 0 22px rgba(106,245,176,.5)}}',
    '.v-arrow{position:absolute;left:47%;top:30%;font-size:34px;color:var(--m);opacity:0}',
    '.dk-slide.on .v-arrow{animation:dkArrow 1.4s ease-in-out 2.2s infinite}',
    '@keyframes dkArrow{0%{opacity:0;transform:translateX(-10px)}50%{opacity:1}100%{opacity:0;transform:translateX(14px)}}',
    /* 3. 날씨 */
    '.v-sky{position:absolute;inset:-6% -4% 30% -4%;overflow:hidden;border-radius:24px;pointer-events:none;z-index:3}',
    '.v-sky > div{position:absolute;inset:0;opacity:0;transition:opacity .8s}',
    '.v-weather[data-w=heat] .sun,.v-weather[data-w=rain] .rain,.v-weather[data-w=cold] .snow,.v-weather[data-w=dust] .haze{opacity:1}',
    '.sun i{position:absolute;right:6%;top:4%;width:74px;height:74px;border-radius:50%;background:radial-gradient(circle,#fff6c8 0%,#ffd27a 55%,#ffb347 100%);box-shadow:0 0 60px 20px rgba(255,200,90,.45)}',
    '.sun i:before{content:"";position:absolute;inset:-26px;border-radius:50%;background:repeating-conic-gradient(rgba(255,210,122,.55) 0 6deg,transparent 6deg 30deg);-webkit-mask:radial-gradient(circle,transparent 46%,#000 47%,#000 70%,transparent 71%);mask:radial-gradient(circle,transparent 46%,#000 47%,#000 70%,transparent 71%);animation:dkSpin 12s linear infinite}',
    '@keyframes dkSpin{to{transform:rotate(360deg)}}',
    '.rain i{position:absolute;left:var(--x);top:-20%;width:2px;height:22px;background:linear-gradient(transparent,rgba(160,210,255,.9));border-radius:2px;animation:dkRain var(--d) linear infinite;animation-delay:var(--l)}',
    '@keyframes dkRain{to{transform:translate(-30px,320px)}}',
    '.snow i{position:absolute;left:var(--x);top:-10%;font-style:normal;color:#e6f4ff;font-size:14px;animation:dkSnow var(--d) linear infinite;animation-delay:var(--l)}',
    '@keyframes dkSnow{0%{transform:translate(0,0) rotate(0)}100%{transform:translate(30px,300px) rotate(300deg)}}',
    
    '.haze i{position:absolute;left:var(--x);top:var(--y);width:90px;height:90px;border-radius:50%;background:rgba(210,190,140,.16);filter:blur(14px);animation:dkHaze var(--d) ease-in-out infinite alternate}',
    '@keyframes dkHaze{to{transform:translate(40px,-20px) scale(1.3)}}',
    '.v-weather .pk-route{transition:opacity .5s}',
    '.v-weather .r-shade,.v-weather .r-in{opacity:0}',
    '.v-weather[data-w=heat] .r-shade{opacity:1;animation:dkDraw 1.4s ' + E + ' forwards}',
    '.v-weather:not([data-w=heat]) .r-in{opacity:1;animation:dkDraw 1.2s ' + E + ' forwards}',
    '.pk-house rect,.pk-house path{fill:#16382a;stroke:#9fd8ff;stroke-width:2}',
    '.pk-house text{fill:#9fd8ff;font:700 8px/1 Pretendard,sans-serif;text-anchor:middle}',
    '.v-weather[data-w=heat] .pk-house{opacity:.35}',
    '.v-weather:not([data-w=heat]) .pk-house{animation:dkHouse 1.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}',
    '@keyframes dkHouse{0%,100%{filter:none}50%{filter:drop-shadow(0 0 8px #9fd8ff)}}',
    '.v-weather[data-w=heat] .pk-tree{fill:#3f9a6a}',
    '.v-wtag{position:absolute;left:4%;bottom:2%;z-index:4}',
    '.v-wtag b{display:none;padding:12px 18px;border-radius:14px;background:rgba(10,20,15,.85);border:1px solid var(--ln);font-size:16px;animation:dkUp .6s ' + E + ' forwards;opacity:0;transform:translateY(12px)}',
    '.v-weather[data-w=heat] .t-heat,.v-weather[data-w=rain] .t-rain,.v-weather[data-w=dust] .t-dust,.v-weather[data-w=cold] .t-cold{display:inline-block}',
    '.dk-wx{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}',
    '.dk-wx button{position:relative;overflow:hidden;padding:10px 16px;border-radius:999px;border:1px solid var(--ln);background:rgba(255,255,255,.04);color:var(--ink);font:600 14px/1 inherit;cursor:pointer;transition:background .3s,color .3s,transform .2s}',
    '.dk-wx button:hover{transform:translateY(-2px)}',
    '.dk-wx button.on{background:var(--m);border-color:var(--m);color:#03140b}',
    '.dk-wx button.on:after{content:"";position:absolute;left:0;bottom:0;height:3px;width:100%;background:rgba(3,20,11,.35);transform-origin:left;animation:dkBar 3.2s linear forwards}',
    '.dk-wx.hold button.on:after{display:none}',
    '@keyframes dkBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
    /* 4. 표정 */
    '.v-ask{position:absolute;left:0;top:2%;width:50%;padding:18px;border-radius:20px;background:rgba(10,20,15,.86);border:1px solid var(--ln);z-index:3;opacity:0;transform:translateY(20px)}',
    '.dk-slide.on .v-ask{animation:dkUp .8s ' + E + ' .5s forwards}',
    '.v-ask small{font-size:12px;color:var(--mu)}.v-ask b{display:block;margin:4px 0 14px;font-size:17px}',
    '.v-ask .faces{display:flex;justify-content:space-around;margin-bottom:12px}',
    '.v-ask .faces span{font-size:36px;opacity:0;transform:scale(0);transition:filter .3s}',
    '.dk-slide.on .v-ask .faces span{animation:dkPopIn .6s ' + E + ' forwards}',
    '.dk-slide.on .v-ask .f5{animation-delay:1s}.dk-slide.on .v-ask .f3{animation-delay:1.15s}.dk-slide.on .v-ask .f1{animation-delay:1.3s}',
    '.v-rate.s1 .faces .f5,.v-rate.s1 .faces .f3{filter:grayscale(1) opacity(.35)}',
    '.v-rate.s1 .faces .f1{transform:scale(1.25) !important;filter:drop-shadow(0 0 12px rgba(255,138,122,.8))}',
    '.v-ask .why{display:flex;gap:6px;flex-wrap:wrap;min-height:30px}',
    '.v-ask .why span{padding:7px 11px;border-radius:999px;font-size:13px;font-weight:600;background:rgba(255,255,255,.05);opacity:0;transform:translateY(8px);transition:all .4s ' + E + '}',
    '.v-rate.s1 .why span{opacity:1;transform:none}.v-rate.s1 .why span:nth-child(2){transition-delay:.08s}.v-rate.s1 .why span:nth-child(3){transition-delay:.16s}',
    '.v-rate.s2 .why span:first-child{background:#ff8a7a;color:#2a0905}',
    '.v-ask .v-fix{margin-top:12px;font-size:13.5px;font-weight:700;color:var(--m);opacity:0;transform:translateY(6px);transition:all .5s ' + E + '}',
    '.v-rate.s3 .v-fix{opacity:1;transform:none}',
    '.v-rate .pk-route.old{stroke-dashoffset:0;transition:stroke .5s,opacity .6s}',
    '.v-rate.s2 .pk-route.old{stroke:#ff8a7a;stroke-dasharray:.02 .03;filter:none}',
    '.v-rate.s3 .pk-route.old{opacity:0}',
    '.v-rate .pk-route.new{opacity:0}',
    '.v-rate.s3 .pk-route.new{opacity:1;animation:dkDraw 1.3s ' + E + ' forwards}',
    '.pk-crowd circle{fill:#ff8a7a;opacity:0;transition:opacity .4s}',
    '.v-rate.s2 .pk-crowd circle{opacity:1;animation:dkJit .5s ease-in-out infinite alternate;animation-delay:calc(var(--i) * -.1s)}',
    '@keyframes dkJit{to{transform:translate(1.5px,-1.5px)}}',
    '.pk-stop.alt{opacity:0;transition:opacity .5s .9s}.v-rate.s3 .pk-stop.alt{opacity:1}',
    '.pk-stop.here circle{animation:dkHere 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}',
    '@keyframes dkHere{0%,100%{stroke-width:2.5}50%{stroke-width:6}}',
    '.v-tap{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid #fff;opacity:0;pointer-events:none;z-index:5}',
    '.v-tap.go{animation:dkTap .7s ease-out}',
    '@keyframes dkTap{0%{opacity:1;transform:scale(.4)}100%{opacity:0;transform:scale(1.6)}}',
    /* 5. 영수증 */
    '.v-machine{position:absolute;left:2%;top:0;width:44%;z-index:3}',
    '.v-machine .slot{height:22px;border-radius:12px;background:linear-gradient(#2a3a33,#151f1a);box-shadow:inset 0 3px 6px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)}',
    '.v-machine .paper{margin:-6px 8% 0;padding:16px 16px 18px;background:#fbfaf3;color:#1d241f;border-radius:0 0 6px 6px;font-size:12.5px;clip-path:inset(0 0 100% 0);transform:translateY(-14px);',
    '  -webkit-mask:linear-gradient(#000 calc(100% - 8px),transparent 0),radial-gradient(circle at 6px 100%,transparent 5px,#000 5.5px) bottom/12px 8px repeat-x;mask:linear-gradient(#000 calc(100% - 8px),transparent 0),radial-gradient(circle at 6px 100%,transparent 5px,#000 5.5px) bottom/12px 8px repeat-x}',
    '.dk-slide.on .v-machine .paper{animation:dkPrint 2.4s steps(24) .8s forwards}',
    '@keyframes dkPrint{to{clip-path:inset(0 0 0 0);transform:none}}',
    '.v-machine .paper b{display:block;text-align:center;font-size:13.5px;letter-spacing:.04em;padding-bottom:8px;margin-bottom:8px;border-bottom:1px dashed #9aa59d}',
    '.v-machine .paper p{display:flex;justify-content:space-between;margin:4px 0;font-variant-numeric:tabular-nums}',
    '.v-machine .paper p span:first-child{color:#6b766e}',
    '.v-machine .paper svg{display:block;width:100%;height:38px;margin:8px 0 4px}',
    '.v-machine .paper path{fill:none;stroke:#1f8a5a;stroke-width:2.5;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1}',
    '.dk-slide.on .v-machine .paper path{animation:dkDraw 1.2s ease 3s forwards}',
    '.v-machine .paper em{display:block;text-align:center;font-style:normal;color:#6b766e;font-size:11.5px}',
    '.v-coupon{position:absolute;left:20%;top:72%;z-index:4;padding:14px 20px 14px 22px;border-radius:14px;background:linear-gradient(120deg,#6af5b0,#c9ffe3);color:#03140b;box-shadow:0 18px 40px -12px rgba(106,245,176,.6);opacity:0;transform:translateY(-60px) rotate(-12deg);',
    '  -webkit-mask:radial-gradient(circle at 0 50%,transparent 9px,#000 9.5px) left/51% 100% no-repeat,radial-gradient(circle at 100% 50%,transparent 9px,#000 9.5px) right/51% 100% no-repeat;mask:radial-gradient(circle at 0 50%,transparent 9px,#000 9.5px) left/51% 100% no-repeat,radial-gradient(circle at 100% 50%,transparent 9px,#000 9.5px) right/51% 100% no-repeat}',
    '.v-coupon b{display:block;font-size:17px}.v-coupon small{font-size:12px;opacity:.75}',
    '.dk-slide.on .v-coupon{animation:dkCoupon 1s cubic-bezier(.3,1.6,.5,1) 3.6s forwards,dkWiggle 2.6s ease-in-out 4.8s infinite}',
    '@keyframes dkCoupon{to{opacity:1;transform:rotate(-4deg)}}',
    '@keyframes dkWiggle{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(-1deg) translateY(-6px)}}',
    '.pk-kiosk{opacity:0}',
    '.pk-kiosk rect{fill:#ffd27a}.pk-kiosk text{font-size:10px;text-anchor:middle}',
    '.dk-slide.on .pk-kiosk{animation:dkFade .4s forwards;animation-delay:calc(1.6s + var(--i) * .12s)}',
    /* 6. 시작 */
    '.v-go{display:grid;place-items:center}',
    '.ripple{position:absolute;inset:0;display:grid;place-items:center}',
    '.ripple i{position:absolute;width:40%;aspect-ratio:1;border-radius:50%;border:2px solid rgba(106,245,176,.5);animation:dkRip 3.6s ease-out infinite}',
    '.ripple i:nth-child(2){animation-delay:1.2s}.ripple i:nth-child(3){animation-delay:2.4s}',
    '@keyframes dkRip{0%{transform:scale(.6);opacity:1}100%{transform:scale(2.3);opacity:0}}',
    '.v-logo{position:relative;width:28%;aspect-ratio:1;border-radius:30%;background:linear-gradient(145deg,#6af5b0,#1f8a5a);display:grid;place-items:center;box-shadow:0 0 80px rgba(106,245,176,.5);transform:scale(0) rotate(-30deg)}',
    '.dk-slide.on .v-logo{animation:dkLogo 1.1s cubic-bezier(.3,1.6,.5,1) .5s forwards,dkBob 4s ease-in-out 1.6s infinite}',
    '@keyframes dkLogo{to{transform:none}}',
    '@keyframes dkBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}',
    '.v-logo svg{width:55%;fill:#03140b}',
    '.leaf{position:absolute;inset:0;overflow:hidden;pointer-events:none}',
    '.leaf i{position:absolute;left:var(--x);top:-12%;font-style:normal;font-size:22px;animation:dkLeaf var(--d) linear infinite;animation-delay:var(--l)}',
    '@keyframes dkLeaf{0%{transform:translate(0,0) rotate(var(--r));opacity:0}10%{opacity:.9}100%{transform:translate(-60px,120%) rotate(calc(var(--r) + 360deg));opacity:0}}',
    /* 7. 연구 배경 */
    '.dk-slide.full .dk-copy{max-width:1180px;width:100%}',
    '.dk-slide.full .dk-title{font-size:clamp(28px,3.2vw,44px);margin-bottom:24px}',
    '.dk-res{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}',
    '.dk-res section{padding:18px 18px 16px;border-radius:18px;background:var(--gl);border:1px solid var(--ln);display:flex;flex-direction:column;gap:12px;opacity:0;transform:translateY(40px) rotateX(20deg);transform-origin:top;transition:opacity .7s,transform 1s ' + E + ';transition-delay:calc(.5s + var(--i) * .15s)}',
    '.dk-slide.on .dk-res section{opacity:1;transform:none}',
    '.dk-res h4{margin:0;font-size:12px;letter-spacing:.08em;color:var(--m)}',
    '.dk-res h5{margin:0;font-size:16px;line-height:1.35;letter-spacing:-.02em}',
    '.dk-res .r b{display:block;font-size:28px;letter-spacing:-.03em;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.dk-res .r p{margin:2px 0 0;font-size:12.5px;line-height:1.45;opacity:.85}',
    '.dk-res .r cite{display:block;margin-top:3px;font-style:normal;font-size:11px;color:var(--mu)}',
    '.dk-res ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}',
    '.dk-res ol li{position:relative;padding:8px 10px;border-radius:10px;background:rgba(106,245,176,.07);font-size:13px;font-weight:600;opacity:0;transform:translateX(-12px);transition:all .5s ' + E + ';transition-delay:calc(1.2s + var(--i) * .18s)}',
    '.dk-slide.on .dk-res ol li{opacity:1;transform:none}',
    '.dk-res ol li small{display:block;font-weight:500;font-size:11px;color:var(--mu)}',
    '.dk-res ol li:not(:last-child):after{content:"↓";position:absolute;left:50%;bottom:-12px;font-size:10px;color:var(--m);transform:translateX(-50%)}',
    '.dk-res ol li:last-child{background:var(--m);color:#03140b}',
    '.dk-slide.on .dk-res ol li:last-child{animation:dkLoop 2s ease-in-out 2.4s infinite}',
    '@keyframes dkLoop{0%,100%{box-shadow:0 0 0 0 rgba(106,245,176,.5)}50%{box-shadow:0 0 0 8px rgba(106,245,176,0)}}',
    '.dk-law{margin:16px 0 0;font-size:11.5px;color:var(--mu);line-height:1.5}',
    /* 넘기기 */
    '.dk-nav{position:absolute;left:72px;right:72px;bottom:30px;display:flex;align-items:center;gap:18px;z-index:5}',
    '.dk-dots{display:flex;gap:6px;flex:1;min-width:0}',
    '.dk-dots button{position:relative;overflow:hidden;flex:0 0 auto;width:28px;height:4px;padding:0;border:0;border-radius:4px;background:rgba(255,255,255,.16);cursor:pointer;transition:width .5s ' + E + '}',
    '.dk-dots button.on{width:64px}',
    '.dk-dots button.on:after{content:"";position:absolute;inset:0;background:var(--m);transform-origin:left;animation:dkBar var(--auto,0s) linear forwards}',
    '.dk-dots button.done{background:rgba(106,245,176,.45)}',
    '.dk-count{white-space:nowrap;font-size:13px;font-variant-numeric:tabular-nums;color:var(--mu)}',
    '.dk-count b{color:var(--ink)}',
    '.dk-arrow,.dk-full{width:46px;height:46px;flex:none;border-radius:50%;border:1px solid var(--ln);background:rgba(255,255,255,.05);color:var(--ink);font-size:18px;cursor:pointer;display:grid;place-items:center;transition:background .2s,opacity .2s,transform .2s}',
    '.dk-arrow:hover,.dk-full:hover{background:rgba(255,255,255,.12);transform:scale(1.06)}',
    '.dk-arrow:disabled{opacity:.3;cursor:default;transform:none}',
    '.dk-arrow.next:not(:disabled){background:var(--m);border-color:var(--m);color:#03140b}',
    '.dk-full{font-size:15px}',
    '.dk-progress{position:absolute;left:0;top:0;height:3px;background:var(--m);box-shadow:0 0 12px var(--m);transition:width .9s ' + E + ';z-index:5}',
    '@media (max-width:1100px){.dk-slide{padding:44px 40px 92px;gap:28px}.dk-nav{left:40px;right:40px}.dk-res{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@media (max-width:820px){.dk{border-radius:22px}.dk-slide{grid-template-columns:1fr;grid-template-rows:auto 1fr;padding:28px 22px 84px;align-content:start;gap:10px;overflow-y:auto}.dk-vis{max-height:none;width:100%;transform:translateY(30px)}.dk-title{font-size:31px}.dk-body{font-size:15.5px}.dk-items li{padding:10px 12px}.dk-res{grid-template-columns:1fr}',
    '  .dk-slide{padding-bottom:110px}.dk-vis{flex:none;aspect-ratio:4/3.4}.v-machine{width:50%}.v-machine .paper{font-size:10.5px;padding:12px 10px}.v-coupon{left:8%;top:76%;padding:10px 14px 10px 16px}.v-coupon b{font-size:14px}.v-cards{width:56%}.v-card span{font-size:12px}.v-ask{width:62%;padding:12px}.v-ask .faces span{font-size:26px}',
    '  .dk-nav{left:0;right:0;bottom:0;padding:16px 22px 18px;gap:10px;background:linear-gradient(transparent,#07120d 35%)}.dk-dots{gap:4px}.dk-dots button{width:12px}.dk-dots button.on{width:28px}.dk-count{font-size:12px}.dk-arrow{width:40px;height:40px}.dk-full{display:none}}',
    '@media (prefers-reduced-motion:reduce){.dk *,.dk *:before,.dk *:after{animation-duration:.01s !important;animation-iteration-count:1 !important;transition-duration:.01s !important}}',
  ].join('\n');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // 제목을 어절 단위로 쪼개 한 단어씩 올라오게
  function words(html) {
    var i = 0;
    return html.split(/(<br>|<em>|<\/em>)/).map(function (part) {
      if (/^<\/?(br|em)>$/.test(part)) return part;
      return part.split(/(\s+)/).map(function (w) { return /^\s+$/.test(w) || !w ? w : '<span class="w"><span style="--i:' + (i++) + '">' + w + '</span></span>'; }).join('');
    }).join('');
  }

  function slideHtml(s) {
    var n = 0, rv = function () { return ' class="rv" style="--i:' + (n++) + '"'; };
    var h = '<div class="dk-copy"><div class="dk-kicker">' + esc(s.kicker) + '</div><h2 class="dk-title">' + words(s.title) + '</h2>';
    if (s.body) h += '<p' + rv().replace('class="rv"', 'class="rv dk-body"') + '>' + esc(s.body) + '</p>';
    if (s.items) h += '<ul class="dk-items">' + s.items.map(function (x) { return '<li' + rv() + '><span>' + x[0] + '</span><div><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></div></li>'; }).join('') + '</ul>';
    if (s.wx) h += '<div' + rv().replace('class="rv"', 'class="rv dk-wx"') + '>' + [['heat', '☀️ 폭염'], ['rain', '🌧 호우'], ['dust', '😷 미세먼지'], ['cold', '🥶 한파']].map(function (w, i) { return '<button type="button" data-wx="' + w[0] + '"' + (i ? '' : ' class="on"') + '>' + w[1] + '</button>'; }).join('') + '</div>';
    if (s.note) h += '<p' + rv().replace('class="rv"', 'class="rv dk-note"') + '>' + esc(s.note) + '</p>';
    if (s.cta) h += '<div' + rv().replace('class="rv"', 'class="rv dk-cta"') + '><a class="dk-btn main" href="' + TOUR + '">코스 찾기 시작 <span>→</span></a><a class="dk-btn" href="' + MOBILE + '">폰 화면으로 보기</a></div>';
    if (s.research) {
      h += '<div class="dk-res">' + RESEARCH.map(function (c, ci) {
        var inner = c.flow ? '<ol>' + c.flow.map(function (f, k) { return '<li style="--i:' + k + '">' + f + '</li>'; }).join('') + '</ol>'
          : c.rows.map(function (r) { return '<div class="r"><b data-n="' + esc(r[0]) + '">' + esc(r[0]) + '</b><p>' + esc(r[1]) + '</p><cite>' + esc(r[2]) + '</cite></div>'; }).join('');
        return '<section style="--i:' + ci + '"><h4>' + esc(c.h) + '</h4><h5>' + esc(c.t) + '</h5>' + inner + '</section>';
      }).join('') + '</div><p class="dk-law">근거 법령 · 도시공원법 제10조의2(공원녹지정보체계: 이용자 편의증진), 같은 법 시행규칙 제9조 제3항, 서울시 도시공원 조례 제8조, 스마트도시법 제2조 제2호</p>';
    }
    h += '</div>';
    if (V[s.key]) h += V[s.key]();
    return h;
  }

  // 숫자가 0부터 올라가게(연구 배경 장)
  function countUp(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.dk-res .r b[data-n]'), function (b) {
      var orig = b.dataset.n, m = /(-|−)?(\d+(?:\.\d+)?)/.exec(orig);
      if (!m || reduce) { b.textContent = orig; return; }
      var v = parseFloat(m[2]), dec = (m[2].split('.')[1] || '').length, t0 = 0;
      (function f(ts) {
        if (!t0) t0 = ts;
        var k = Math.min(1, (ts - t0 - 700) / 1300); if (k < 0) k = 0;
        var e = 1 - Math.pow(1 - k, 3);
        b.textContent = orig.replace(m[2], (v * e).toFixed(dec));
        if (k < 1 && b.isConnected) requestAnimationFrame(f); else b.textContent = orig;
      })(performance.now());
    });
  }

  function build(hm) {
    if (hm.querySelector(':scope > .dk')) return;
    var dk = el('section', 'dk');
    dk.setAttribute('aria-roledescription', 'carousel'); dk.setAttribute('aria-label', '서울숲 코스 찾기 소개');
    var bg = el('div', 'dk-bg', '<i></i><i></i><i></i>'), fly = el('div', 'dk-fly');
    for (var i = 0; i < 22; i++) { var f = el('i'); f.style.cssText = '--x:' + (i * 47 % 100) + '%;--d:' + (9 + i % 7) + 's;--l:' + (-i * 1.3) + 's;--dx:' + ((i % 5) - 2) * 30 + 'px'; fly.appendChild(f); }
    dk.appendChild(bg); dk.appendChild(fly);
    var prog = el('div', 'dk-progress'); dk.appendChild(prog);
    var track = el('div', 'dk-track');
    SLIDES.forEach(function (s, k) {
      var sl = el('div', 'dk-slide' + (s.research ? ' full' : ''), slideHtml(s));
      sl.setAttribute('role', 'group'); sl.setAttribute('aria-label', (k + 1) + ' / ' + SLIDES.length);
      track.appendChild(sl);
    });
    dk.appendChild(track);
    var nav = el('div', 'dk-nav');
    var prev = el('button', 'dk-arrow prev', '←'), next = el('button', 'dk-arrow next', '→'), full = el('button', 'dk-full', '⛶'), dots = el('div', 'dk-dots'), count = el('div', 'dk-count');
    prev.type = next.type = full.type = 'button'; prev.setAttribute('aria-label', '이전 장'); next.setAttribute('aria-label', '다음 장'); full.title = '전체 화면(F)';
    SLIDES.forEach(function (s, k) { var d = el('button'); d.type = 'button'; d.setAttribute('aria-label', (k + 1) + '장 · ' + s.kicker); d.onclick = function () { go(k); }; dots.appendChild(d); });
    nav.appendChild(dots); nav.appendChild(count); nav.appendChild(full); nav.appendChild(prev); nav.appendChild(next);
    dk.appendChild(nav);
    hm.insertBefore(dk, hm.firstChild);
    hm.classList.add('dk-on');

    var cur = -1, timers = [];
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function size() {
      if (document.fullscreenElement === dk) { dk.style.height = ''; return; }
      var top = dk.getBoundingClientRect().top + window.scrollY;
      dk.style.height = Math.max(580, window.innerHeight - Math.max(0, top) - 24) + 'px';
    }
    // 장마다 이어지는 연출(날씨 돌아가기, 표정 누르기)
    var scenes = {
      weather: function (sl) {
        var vis = sl.querySelector('.v-weather'), bar = sl.querySelector('.dk-wx'), order = ['heat', 'rain', 'dust', 'cold'], k = 0;
        bar.classList.remove('hold');
        function set(w) {
          vis.dataset.w = w;
          Array.prototype.forEach.call(bar.children, function (b) { b.classList.toggle('on', b.dataset.wx === w); });
          // 길 다시 그리기
          Array.prototype.forEach.call(vis.querySelectorAll('.pk-route,.v-wtag b'), function (p) { p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; });
        }
        set('heat');
        (function loop() { later(function () { if (bar.classList.contains('hold')) return; k = (k + 1) % 4; set(order[k]); loop(); }, 3200); })();
        bar.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; bar.classList.add('hold'); set(b.dataset.wx); };
      },
      rate: function (sl) {
        var vis = sl.querySelector('.v-rate'), tap = vis.querySelector('.v-tap');
        function run() {
          vis.classList.remove('s1', 's2', 's3');
          later(function () { var f = vis.querySelector('.f1').getBoundingClientRect(), r = vis.getBoundingClientRect(); tap.style.left = (f.left - r.left + f.width / 2) + 'px'; tap.style.top = (f.top - r.top + f.height / 2) + 'px'; tap.classList.remove('go'); void tap.offsetWidth; tap.classList.add('go'); vis.classList.add('s1'); }, 2100);
          later(function () { var c = vis.querySelector('.why span').getBoundingClientRect(), r = vis.getBoundingClientRect(); tap.style.left = (c.left - r.left + c.width / 2) + 'px'; tap.style.top = (c.top - r.top + c.height / 2) + 'px'; tap.classList.remove('go'); void tap.offsetWidth; tap.classList.add('go'); vis.classList.add('s2'); }, 3300);
          later(function () { vis.classList.add('s3'); }, 4500);
          later(run, 9000);
        }
        run();
      },
      why: function (sl) { countUp(sl); },
    };
    function go(k) {
      k = Math.max(0, Math.min(SLIDES.length - 1, k));
      if (k === cur) return;
      cur = k;
      clearTimers();
      track.style.transform = 'translateX(' + (-100 * k) + '%)';
      Array.prototype.forEach.call(track.children, function (c, j) { if (j === k) { c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); } else c.classList.remove('on'); });
      Array.prototype.forEach.call(dots.children, function (c, j) { c.classList.toggle('on', j === k); c.classList.toggle('done', j < k); });
      count.innerHTML = '<b>' + String(k + 1).padStart(2, '0') + '</b> / ' + String(SLIDES.length).padStart(2, '0');
      prev.disabled = k === 0; next.disabled = k === SLIDES.length - 1;
      prog.style.width = ((k + 1) / SLIDES.length * 100) + '%';
      var sc = scenes[SLIDES[k].key]; if (sc) sc(track.children[k]);
    }
    prev.onclick = function () { go(cur - 1); };
    next.onclick = function () { go(cur + 1); };
    full.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else if (dk.requestFullscreen) dk.requestFullscreen(); };
    document.addEventListener('fullscreenchange', function () { setTimeout(size, 50); });
    document.addEventListener('keydown', function (e) {
      if (!dk.isConnected || dk.offsetParent === null && document.fullscreenElement !== dk) return;
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && document.fullscreenElement === dk)) { go(cur + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(cur - 1); e.preventDefault(); }
      else if (e.key === 'f' || e.key === 'F') full.onclick();
    });
    // 끌어서 넘기기(마우스·터치)
    var sx = null, sy = 0, dx = 0, lock = null;
    dk.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('a,button')) return;
      sx = e.clientX; sy = e.clientY; dx = 0; lock = null;
    });
    window.addEventListener('pointermove', function (e) {
      if (sx == null) return;
      var x = e.clientX - sx, y = e.clientY - sy;
      if (lock == null && (Math.abs(x) > 8 || Math.abs(y) > 8)) lock = Math.abs(x) > Math.abs(y) ? 'x' : 'y';
      if (lock !== 'x') return;
      dx = x; dk.classList.add('drag');
      track.style.transform = 'translateX(calc(' + (-100 * cur) + '% + ' + dx * .8 + 'px))';
    });
    window.addEventListener('pointerup', function () {
      if (sx == null) return;
      dk.classList.remove('drag');
      var was = cur;
      if (lock === 'x' && Math.abs(dx) > dk.clientWidth * .1) { cur = -1; go(was + (dx < 0 ? 1 : -1)); }
      else track.style.transform = 'translateX(' + (-100 * cur) + '%)';
      sx = null;
    });
    var wheelAt = 0;
    dk.addEventListener('wheel', function (e) {
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
      if (!d || Math.abs(d) < 18) return;
      e.preventDefault();
      var now = Date.now(); if (now - wheelAt < 800) return; wheelAt = now;
      go(cur + (d > 0 ? 1 : -1));
    }, { passive: false });
    window.addEventListener('resize', size);
    size(); go(0); setTimeout(size, 300);
  }

  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  function scan() { var hm = document.querySelector('.hm'); if (hm) build(hm); }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') scan(); else document.addEventListener('DOMContentLoaded', scan);
})();
