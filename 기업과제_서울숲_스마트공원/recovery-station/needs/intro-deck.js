// 소개 탭: 서울숲 위성지도 한 장 위에서 장마다 카메라가 옮겨 가며, 길·붐빔·그늘·표정·영수증이 움직이는 그림으로 이용 흐름을 보여 주는 8장(가로로 넘김).
// 실제 화면 캡처는 쓰지 않음(뒤에서 직접 쓰게 될 화면을 미리 반복해 보여 주지 않도록).
// 결은 표지·이용자 화면·만족도와 같게: 어두운 위성 바탕, 민트 강조, 고정폭 라벨, 얇은 큰 제목.
// 지도 좌표는 needs/intro/map.jpg(2560×1600, Esri World Imagery를 이용자 화면과 같은 데이터로 맞춰 찍은 것) 기준 픽셀.
// 기존 소개(현황·문제·전략·근거)는 숨기기만 하고 지우지 않습니다.
(function () {
  'use strict';
  var BASE = ((document.currentScript || {}).src || '').replace(/[^/]*$/, '');
  var MAP = BASE + 'intro/map.jpg?v=20261128d';
  var TOUR = BASE + 'tour.html';

  // ── 지도 위 좌표(px) ──
  var START = [1594, 790];
  var STOPS = [{ n: '거울연못', p: [1427, 747] }, { n: '서울숲호수', p: [1197, 706] }, { n: '사슴우리', p: [965, 879] }];
  var SEG = [
    [[1594, 790], [1526, 760], [1515, 792], [1487, 782], [1456, 771], [1429, 762], [1427, 747]],
    [[1427, 747], [1429, 762], [1407, 754], [1397, 753], [1403, 739], [1392, 733], [1367, 730], [1345, 736], [1317, 743], [1295, 752], [1287, 757], [1292, 744], [1281, 728], [1277, 714], [1272, 706], [1262, 699], [1259, 694], [1248, 699], [1219, 714], [1213, 710], [1192, 720], [1197, 706]],
    [[1197, 706], [1192, 720], [1114, 758], [1098, 762], [1085, 770], [1083, 779], [1077, 792], [1068, 792], [1055, 788], [1049, 783], [1039, 788], [1027, 799], [1023, 815], [1021, 826], [1009, 859], [1000, 879], [995, 903], [976, 880], [965, 879]],
  ];
  var ALT = [[1197, 706], [1172, 676], [1134, 639], [1092, 676], [1046, 731], [998, 796], [965, 879]];   // 붐빔을 피해 바꾼 길
  var RAIN = [[1594, 790], [1515, 792], [1483, 858], [1400, 850], [1309, 837], [1296, 925], [1291, 1010]];
  var HUB = {
    family: [1320, 675], mirror: [1427, 747], horse: [1511, 768], stage: [1265, 642], courts: [1372, 552], visitor: [1483, 858], play: [1309, 837],
    insect: [1291, 1010], butterfly: [1316, 1012], deer: [965, 879], lake: [1197, 706], wetland: [1360, 260], gateN: [1461, 472], gateS: [1594, 790],
    ginkgo: [1134, 639], wind: [998, 796], skate: [1519, 672], museum: [1559, 1291], hangang: [1475, 1340], bird: [1325, 332], kidsForest: [1264, 269], gallery: [1357, 993],
  };
  var KIOSK = ['gateS', 'gateN', 'family', 'stage', 'lake', 'skate', 'insect', 'deer', 'wind', 'wetland', 'museum', 'hangang'];

  var SLIDES = [
    { key: 'intro', tab: '소개', en: 'SEOUL FOREST · 서울숲 산책 길잡이', cam: [1280, 790, 0.95],
      title: '서울숲,<br>오늘은 <em>어디로 걸을까요?</em>',
      body: '지금 붐비는 곳, 오늘 날씨, 함께 온 사람에 맞춰 걷기 좋은 길을 골라 드려요. 앱 설치도, 가입도 필요 없어요.', cta: true },
    { key: 'crowd', tab: '붐빔', en: '01 · 붐비는 곳 미리 보기', cam: [1250, 760, 1.45],
      title: '지금 붐비는 곳을<br><em>먼저 알려 드려요</em>',
      body: '역에서 내리는 사람과 시간대를 보고, 어디가 북적이고 어디가 한산한지 보여 드려요. 한 시간 뒤 모습도 미리 알 수 있어요.' },
    { key: 'pick', tab: '고르기', en: '02 · 나에게 맞는 길', cam: [1280, 790, 1.05], hud: true,
      title: '하고 싶은 것만<br><em>골라 주세요</em>',
      body: '무엇을 하고 싶은지, 누구와 왔는지, 얼마나 머물지. 세 가지만 고르면 들를 곳과 걸을 길이 지도에 바로 그려져요.' },
    { key: 'weather', tab: '날씨', en: '03 · 날씨에 맞춰서', cam: [1340, 850, 1.05], hud: true,
      title: '더우면 그늘로,<br><em>비 오면 실내로</em>',
      body: '햇볕이 뜨거운 날엔 나무 그늘이 이어진 길로, 비나 미세먼지가 심한 날엔 곤충식물원·나비정원 같은 실내로 안내해요.' },
    { key: 'rate', tab: '표정', en: '04 · 걸으면서 한 번씩', cam: [1250, 790, 1.6],
      title: '도착하면<br><em>표정 하나만 눌러요</em>',
      body: '좋았는지 아쉬웠는지 표정 하나면 돼요. "너무 붐벼요"처럼 아쉬운 까닭을 고르면 남은 길을 더 나은 쪽으로 바로 바꿔 드려요.' },
    { key: 'receipt', tab: '영수증', en: '05 · 산책을 마치면', cam: [1130, 880, 0.98], hud: true,
      title: '다 걸으면<br><em>영수증 한 장</em>',
      body: '공원 곳곳 12곳의 영수증 기계 중 가장 가까운 곳으로 안내해요. 오늘 걸은 길이 담긴 영수증과 함께 근처 카페·가게 할인 쿠폰을 드려요.',
      note: '영수증 기계와 쿠폰은 우리 팀이 제안하는 운영 방식이에요.' },
    { key: 'better', tab: '더 좋은 공원', en: '06 · 모두의 표정이 모이면', cam: [1290, 740, 1.2],
      title: '남긴 표정으로<br><em>공원이 좋아져요</em>',
      body: '표정이 모이면 장소마다 얼마나 좋았는지 지도로 보여요. 아쉽다는 곳이 많으면 공원을 돌보는 분들이 그늘막·쉼터·안내를 먼저 고쳐요.' },
    { key: 'why', tab: '만든 이유', en: '왜 만들었나요', cam: [1280, 790, 0.85], research: true,
      title: '처음 온 사람도, 한여름에도<br><em>서울숲에 오래 머물도록</em>' },
  ];

  var RESEARCH = [
    { h: '지금 서울숲', viz: 'waffle', t: '서울 곳곳에서 찾아오는 공원', rows: [['73.4%', '방문객 중 동네 밖에서 온 사람', '서울시 실시간 인구데이터(2026-11-19)'], ['1위', '서울시 직영 공원 26곳 중 온라인에서 가장 많이 이야기됨(33.7%)', '서울AI재단(2026)']] },
    { h: '불편한 점', viz: 'bars', t: '처음 오면 막막하고, 여름엔 발길이 줄어요', rows: [['40.2%', '처음 와 본 방문객. 안내판으로 정보를 얻는 경우는 드물어요', '주신하·김영희(2010)'], ['−48.6%', '서울숲역 낮 시간 내리는 사람, 5월 8,864명 → 8월 4,557명', '서울 열린데이터광장 OA-12252(2026)']] },
    { h: '그래서 이렇게', t: '추천하고, 듣고, 다시 고쳐요', flow: ['날씨·붐빔·함께 온 사람', '그늘지고 한산한 길 찾기<small>가장 짧은 길보다 20%까지만 더 걸어요</small>', '나에게 맞는 코스', '장소마다 표정 남기기', '다음 추천과 공원 관리에 반영'] },
    { h: '참고한 연구', viz: 'paths', t: '연구에서 나온 값을 기준으로', thermo: true, rows: [['5.5~7.4℃', '33℃가 넘는 시간, 공원 안이 바깥 도로보다 시원해요', '조현민·권태경(2022)'], ['12%', '조용하고 보기 좋은 길이면 조금 더 길어도 더 좋아해요', 'Quercia 외(2014)'], ['IPA', '편의시설은 중요하지만 만족은 낮은 편이에요', '이지연(2012)']] },
  ];

  // 마지막 장 카드 아래 움직이는 그림(값은 위 출처 그대로)
  var VIZ = {
    waffle: function () { var h = ''; for (var i = 0; i < 100; i++) h += '<i' + (i < 73 ? ' class="on" style="--d:' + (0.9 + i * 0.016).toFixed(3) + 's"' : '') + '></i>'; return '<div class="vz"><div class="waf" aria-hidden="true">' + h + '</div><p><b>100명 중 73명</b>은 동네 밖에서 와요</p></div>'; },
    bars: function () { return '<div class="vz"><div class="bars2" aria-hidden="true"><div class="bc"><b>8,864명</b><u><i style="--h:100%"></i></u><span>5월</span></div><div class="bc hot"><b>4,557명</b><u><i style="--h:51.4%"></i></u><span>8월 ☀️</span></div><em>−48.6%</em></div><p>서울숲역에서 낮에 내리는 사람</p></div>'; },
  };
  VIZ.paths = function () {
    return '<div class="vz"><svg class="pth" viewBox="0 0 300 96" aria-hidden="true">' +
      '<path class="p-short" pathLength="1" d="M20,70 L280,70"/><path class="p-quiet" pathLength="1" d="M20,70 C70,26 140,28 170,38 S250,48 280,70"/>' +
      '<g class="p-tree"><circle cx="92" cy="30" r="8"/><circle cx="132" cy="27" r="10"/><circle cx="212" cy="42" r="8"/></g>' +
      '<circle cx="20" cy="70" r="6" fill="#fff"/><circle cx="280" cy="70" r="6" fill="#fff"/>' +
      '<text x="150" y="90" class="t-short">가장 짧은 길 · 차 소리</text><text x="150" y="10" class="t-quiet">12% 더 길어도 조용한 길 🌳</text></svg>' +
      '<p>사람들은 <b>조금 돌아가도 조용하고 보기 좋은 길</b>을 골라요</p></div>';
  };
  var THERMO = '<div class="thm" aria-hidden="true"><div class="tb hot"><i style="--h:87%"></i><span>도로</span></div><div class="tb"><i style="--h:42%"></i><span>공원</span></div></div>';

  var E = 'cubic-bezier(.16,1,.3,1)', B = 'cubic-bezier(.3,1.6,.5,1)';
  var MONO = 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';
  var css = [
    '@property --inv{syntax:"<number>";inherits:true;initial-value:1}',
    /* 소개 탭에 있을 때만: 페이지를 어둡게, 상단 바를 투명하게 */
    'html.dk-page body{background:#04090a;overflow:hidden}',
    'html.dk-page .hm > :not(.dk){display:none !important}',
    'html.dk-page .topbar{position:fixed;left:0;right:0;top:0;background:linear-gradient(rgba(4,9,10,.88),rgba(4,9,10,0));-webkit-backdrop-filter:none;backdrop-filter:none}',
    'html.dk-page .topbar-inner{max-width:none;padding:18px 40px}',
    'html.dk-page .brand-title{color:#f1f7f3}',
    'html.dk-page .goals-nav{background:rgba(8,16,13,.72) !important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08) !important;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}',
    'html.dk-page .goal-tab{color:rgba(241,247,243,.62);background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}',
    'html.dk-page .goal-tab:hover{color:#f1f7f3;background:rgba(255,255,255,.08)}',
    'html.dk-page .goal-tab.g1[aria-selected=true]{background:#6af5b0;color:#03140b;box-shadow:none}',
    'html.dk-page .goal-tab .tab-n{box-shadow:inset 0 0 0 1.5px rgba(241,247,243,.5) !important;color:rgba(241,247,243,.8) !important}',
    'html.dk-page .topbar button:not(.goal-tab){background:rgba(255,255,255,.06);color:#f1f7f3;border-color:rgba(255,255,255,.1)}',
    '.dk{--m:#6af5b0;--hot:#ff7a45;--ink:#f1f7f3;--mu:rgba(241,247,243,.66);--ln:rgba(255,255,255,.1);--gl:rgba(8,16,13,.74);',
    '  position:fixed;inset:0;z-index:900;overflow:hidden;color:var(--ink);font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;background:#04090a;user-select:none;touch-action:pan-y}',
    /* 지도 세계: 카메라가 장마다 옮겨 감 */
    '.dk-world{position:absolute;left:0;top:0;width:2560px;height:1600px;transform-origin:0 0;transition:transform 1.8s ' + E + ',--inv 1.8s ' + E + ';will-change:transform}',
    '.dk-world > img{position:absolute;inset:0;width:100%;height:100%;filter:saturate(.5) brightness(.5) contrast(1.15);opacity:0;transition:opacity 1.6s}',
    '.dk-world > img.ok{opacity:1}',
    '.dk-tint{position:absolute;inset:0;background:radial-gradient(ellipse 34% 40% at 50% 50%,rgba(106,245,176,.07),transparent 70%),rgba(4,20,16,.28);mix-blend-mode:normal;pointer-events:none}',
    '.dk-world svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}',
    '.dk-world svg *{transform-box:fill-box;transform-origin:center}',
    '.dk-layer{position:absolute;inset:0}',
    '.dk-shade{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(90deg,rgba(4,9,10,.96) 0%,rgba(4,9,10,.84) 30%,rgba(4,9,10,.12) 56%,rgba(4,9,10,0) 80%,rgba(4,9,10,.4) 100%),linear-gradient(0deg,rgba(4,9,10,.9),transparent 22%),linear-gradient(180deg,rgba(4,9,10,.6),transparent 18%)}',
    '.dk-grain{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.05;background-image:radial-gradient(rgba(255,255,255,.8) .5px,transparent .6px);background-size:3px 3px}',
    /* 장면 묶음: 켜질 때마다 애니메이션이 처음부터 */
    '.dk-sc{opacity:0;visibility:hidden;transition:opacity .5s,visibility 0s .5s}',
    '.dk-sc.on{opacity:1;visibility:visible;transition:opacity .7s .35s,visibility 0s}',
    '.dk-sc .draw{stroke-dasharray:1 1;stroke-dashoffset:1}',
    '.dk-sc.on .draw{animation:dkDraw var(--t,2s) ' + E + ' var(--d,0s) forwards}',
    '@keyframes dkDraw{to{stroke-dashoffset:0}}',
    '.dk-sc .pop{transform:scale(0);opacity:0}',
    '.dk-sc.on .pop{animation:dkPop .7s ' + B + ' var(--d,0s) forwards}',
    '@keyframes dkPop{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}',
    '.dk-sc .fade{opacity:0}',
    '.dk-sc.on .fade{animation:dkFade .8s ease var(--d,0s) forwards}',
    '@keyframes dkFade{to{opacity:1}}',
    '.dk-sc.on .out{animation:dkOut .8s ease var(--d,0s) forwards}',
    '@keyframes dkOut{to{opacity:.12}}',
    /* 길 */
    '.rt{fill:none;stroke-linecap:round;stroke-linejoin:round}',
    '.rt.glow{stroke:var(--m);stroke-width:22;opacity:.22;filter:blur(6px)}',
    '.rt.main{stroke:var(--m);stroke-width:8}',
    '.rt.hot{stroke:var(--hot);stroke-width:7;stroke-dasharray:4 18}',
    '.rt.gold{stroke:#ffd27a;stroke-width:7}',
    '.rt.dim{stroke:rgba(255,255,255,.4);stroke-width:6;stroke-dasharray:2 14}',
    /* 지도 위 표시(HTML): 화면에서 늘 같은 크기로 보이게 */
    '.pin{position:absolute;width:0;height:0;transform:scale(var(--inv))}',
    '.pin > b{position:absolute;left:0;top:0;display:block}',
    '.dot{position:absolute;left:-7px;top:-7px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.18),0 0 18px rgba(255,255,255,.6)}',
    '.dot.m{background:var(--m);box-shadow:0 0 0 5px rgba(106,245,176,.22),0 0 22px var(--m)}',
    '.ring:after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid var(--m);animation:dkRing 2.4s ease-out infinite}',
    '@keyframes dkRing{0%{transform:scale(1);opacity:.9}100%{transform:scale(3.2);opacity:0}}',
    '.num{position:absolute;left:-17px;top:-17px;width:34px;height:34px;border-radius:50%;background:var(--m);color:#03140b;font:800 16px/34px ' + MONO + ';text-align:center;box-shadow:0 0 0 6px rgba(106,245,176,.2),0 8px 24px -6px rgba(0,0,0,.7)}',
    '.tag{position:absolute;white-space:nowrap;padding:8px 12px;border-radius:10px;background:rgba(6,12,10,.9);border:1px solid rgba(255,255,255,.14);font-size:14px;font-weight:700;color:#f1f7f3;box-shadow:0 12px 30px -10px rgba(0,0,0,.8);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}',
    '.tag small{font-weight:600;color:var(--mu);margin-left:6px}',
    '.tag.r{left:24px;top:-17px}.tag.l{right:24px;top:-17px}.tag.t{left:0;bottom:24px;transform:translateX(-50%)}.tag.b{left:0;top:24px;transform:translateX(-50%)}',
    '.tag.m{border-color:rgba(106,245,176,.55);color:#eafff4}',
    '.tag.hot{border-color:rgba(255,122,69,.6)}',
    '.tag.calm{border-color:rgba(106,245,176,.45)}',
    '.tag.t.pop,.tag.b.pop{transform:translateX(-50%) scale(0)}',
    '.dk-sc.on .tag.t.pop,.dk-sc.on .tag.b.pop{animation-name:dkPopX}',
    '@keyframes dkPopX{0%{transform:translateX(-50%) scale(0);opacity:0}100%{transform:translateX(-50%) scale(1);opacity:1}}',
    '.lbl{position:absolute;left:12px;top:-9px;white-space:nowrap;font-size:13px;font-weight:600;color:rgba(241,247,243,.85);text-shadow:0 1px 6px #000,0 0 2px #000}',
    '.face{position:absolute;left:-30px;top:-82px;width:60px;height:60px;border-radius:50%;display:grid;place-items:center;font-size:34px;background:rgba(6,12,10,.92);border:2px solid var(--m);box-shadow:0 14px 30px -8px rgba(0,0,0,.8),0 0 30px -6px var(--m)}',
    '.face:after{content:"";position:absolute;left:50%;bottom:-9px;margin-left:-7px;border:7px solid transparent;border-top-color:var(--m);border-bottom:0}',
    '.face.bad{border-color:var(--hot);box-shadow:0 14px 30px -8px rgba(0,0,0,.8),0 0 30px -6px var(--hot)}.face.bad:after{border-top-color:var(--hot)}',
    '.kio{position:absolute;left:-19px;top:-19px;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:19px;background:rgba(6,12,10,.9);border:1.5px solid rgba(255,210,122,.6);box-shadow:0 8px 20px -6px rgba(0,0,0,.8)}',
    '.kio.best{background:#ffd27a;border-color:#ffd27a;box-shadow:0 0 0 7px rgba(255,210,122,.22),0 0 30px rgba(255,210,122,.7)}',
    '.walker{position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 0 0 6px rgba(106,245,176,.4),0 0 26px var(--m)}',
    /* 붐빔 */
    '.blob{animation:dkBreath 3.2s ease-in-out infinite}',
    '.blob.b2{animation-delay:-1.1s}.blob.b3{animation-delay:-2s}',
    '@keyframes dkBreath{0%,100%{transform:scale(.86);opacity:.75}50%{transform:scale(1.08);opacity:1}}',
    /* 날씨: 더위 ↔ 비 */
    '.dk .wx-rain{opacity:0;transition:opacity .8s}.dk.rain .wx-rain{opacity:1}',
    '.dk .wx-heat{transition:opacity .8s}.dk.rain .wx-heat{opacity:0}',
    '.canopy{fill:#3fdc8c;opacity:0}',
    '.dk-sc.on .canopy{animation:dkCanopy 1s ease var(--d) forwards}',
    '@keyframes dkCanopy{0%{opacity:0;transform:scale(.3)}100%{opacity:.32;transform:scale(1)}}',
    '.shimmer{animation:dkShim 1.2s linear infinite}',
    '@keyframes dkShim{to{stroke-dashoffset:-44}}',
    '.dk-rainfx{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:0;transition:opacity .8s;overflow:hidden}',
    '.dk.rain.s-weather .dk-rainfx{opacity:1}',
    '.dk-rainfx i{position:absolute;top:-12%;width:1.5px;height:90px;background:linear-gradient(transparent,rgba(190,230,255,.55));animation:dkFall linear infinite}',
    '@keyframes dkFall{to{transform:translate(-60px,125vh)}}',
    '.dk-sun{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:0;transition:opacity 1s;background:radial-gradient(circle at 88% 4%,rgba(255,170,90,.32),transparent 45%)}',
    '.dk.s-weather:not(.rain) .dk-sun{opacity:1}',
    /* 화면 고정 카드(HUD) */
    '.dk-hud{position:absolute;z-index:3;right:56px;top:120px;width:330px}',
    '.card{padding:18px 18px 16px;border-radius:18px;background:var(--gl);border:1px solid var(--ln);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);box-shadow:0 30px 60px -20px rgba(0,0,0,.8)}',
    '.dk-sc .card{transform:translateY(30px);opacity:0}',
    '.dk-sc.on .card{animation:dkCard 1s ' + E + ' .4s forwards}',
    '@keyframes dkCard{to{transform:none;opacity:1}}',
    '.card h6{margin:0 0 10px;font:700 12.5px/1 inherit;letter-spacing:.02em;color:var(--m)}',
    '.chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}',
    '.chip{position:relative;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-size:13.5px;font-weight:600;color:rgba(241,247,243,.75);overflow:hidden}',
    '.dk-sc.on .chip.sel{animation:dkSel .5s ease var(--d) forwards}',
    '@keyframes dkSel{0%{transform:scale(1)}40%{transform:scale(.9)}100%{transform:scale(1);background:var(--m);border-color:var(--m);color:#03140b}}',
    '.chip.sel:after{content:"";position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px;border-radius:50%;background:rgba(255,255,255,.7);opacity:0}',
    '.dk-sc.on .chip.sel:after{animation:dkTap .7s ease-out var(--d) forwards}',
    '@keyframes dkTap{0%{opacity:.9;transform:scale(0)}100%{opacity:0;transform:scale(9)}}',
    '.result{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:14px;background:var(--m);color:#03140b;font-weight:800;font-size:15px}',
    '.result span{font:700 12px/1 ' + MONO + '}',
    '.temp{display:flex;align-items:center;gap:14px}',
    '.temp i{font-style:normal;font-size:44px;line-height:1;transition:transform .6s ' + B + '}',
    '.temp b{font-size:52px;font-weight:200;letter-spacing:-.04em;font-variant-numeric:tabular-nums}',
    '.temp b sup{font-size:22px;font-weight:400;vertical-align:top;margin-left:2px}',
    '.temp p{margin:2px 0 0;font-size:13px;color:var(--mu)}',
    '.say{margin-top:12px;padding:11px 13px;border-radius:12px;font-size:14px;font-weight:700;background:rgba(106,245,176,.12);border:1px solid rgba(106,245,176,.3);color:#eafff4}',
    '.dk .w-r{display:none}.dk.rain .w-r{display:block}.dk.rain .w-h{display:none}',
    '.dk.rain .temp b{color:#bfe6ff}',
    /* 영수증 */
    '.slot{height:12px;border-radius:8px;background:#0b1210;border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 3px 6px rgba(0,0,0,.8);margin:0 6px;position:relative;z-index:2}',
    '.paperwrap{overflow:hidden;margin:-6px 18px 0;padding:0 0 30px}',
    '.paper{background:#f7f5ee;color:#1d2420;padding:18px 18px 16px;font:500 13px/1.75 inherit;font-variant-numeric:tabular-nums;transform:translateY(-104%);box-shadow:0 20px 40px -14px rgba(0,0,0,.7);-webkit-mask:linear-gradient(#000,#000) top/100% calc(100% - 8px) no-repeat,radial-gradient(circle at 6px 8px,transparent 5px,#000 5.5px) bottom left/12px 8px repeat-x;mask:linear-gradient(#000,#000) top/100% calc(100% - 8px) no-repeat,radial-gradient(circle at 6px 8px,transparent 5px,#000 5.5px) bottom left/12px 8px repeat-x}',
    '.dk-sc.on .paper{animation:dkPrint 3.2s steps(26,end) 1.4s forwards}',
    '@keyframes dkPrint{to{transform:none}}',
    '.paper h5{margin:0;text-align:center;font:800 15px/1.3 "Pretendard Variable",Pretendard,sans-serif;letter-spacing:-.02em}',
    '.paper .c{text-align:center;font-size:11px;color:#6b726c}',
    '.paper hr{border:0;border-top:1.5px dashed #b9bdb5;margin:9px 0}',
    '.paper .row{display:flex;justify-content:space-between}',
    '.paper .cp{margin-top:4px;padding:9px 10px;border:1.5px dashed #1d4d3a;border-radius:6px;color:#1d4d3a;font-weight:800;text-align:center;font-family:"Pretendard Variable",Pretendard,sans-serif;font-size:13.5px}',
    '.paper .bars{height:26px;margin-top:10px;background:repeating-linear-gradient(90deg,#1d2420 0 2px,transparent 2px 4px,#1d2420 4px 5px,transparent 5px 8px,#1d2420 8px 11px,transparent 11px 12px)}',
    /* 글 */
    '.dk-track{position:absolute;inset:0;z-index:2;pointer-events:none}',
    '.dk-slide{position:absolute;inset:0;padding:110px 56px 120px 64px;box-sizing:border-box;display:flex;align-items:center;visibility:hidden}',
    '.dk-slide.on{visibility:visible}',
    '.dk-slide.on .dk-copy{pointer-events:auto}',
    '.dk-copy{position:relative;z-index:3;max-width:500px}',
    '.dk-en{display:flex;align-items:center;gap:12px;font:700 13.5px/1 inherit;letter-spacing:.2em;color:var(--m);margin-bottom:26px;opacity:0;transition:opacity .8s,letter-spacing 1.2s ' + E + '}',
    '.dk-en i{width:8px;height:8px;border-radius:2px;background:var(--m);box-shadow:0 0 12px var(--m);transform:rotate(45deg)}',
    '.dk-slide.on .dk-en{opacity:1;letter-spacing:.03em;transition-delay:.1s}',
    '.dk-title{margin:0 0 24px;font-size:clamp(34px,3.6vw,56px);line-height:1.16;letter-spacing:-.04em;font-weight:300;color:#eef3f0;word-break:keep-all}',
    '.dk-title em{font-style:normal;font-weight:600;color:var(--m)}',
    '.dk-body{margin:0 0 30px;font-size:17px;line-height:1.75;color:var(--mu);max-width:440px;word-break:keep-all}',
    '.dk-note{margin:-14px 0 24px;font-size:12.5px;line-height:1.5;color:rgba(241,247,243,.42)}',
    '.dk-line{display:block;overflow:hidden;padding-bottom:.08em}',
    '.dk-line > span{display:block;transform:translateY(105%);transition:transform 1s ' + E + '}',
    '.dk-slide.on .dk-line > span{transform:none;transition-delay:calc(.25s + var(--i) * .09s)}',
    '.dk-fade{opacity:0;transform:translateY(16px);transition:opacity .8s,transform 1s ' + E + '}',
    '.dk-slide.on .dk-fade{opacity:1;transform:none;transition-delay:calc(.55s + var(--i) * .1s)}',
    '.dk-cta{display:flex;flex-wrap:wrap;gap:12px}',
    '.dk-btn{white-space:nowrap;display:inline-flex;align-items:center;gap:10px;padding:16px 24px;border-radius:999px;font:700 15.5px/1 inherit;text-decoration:none;cursor:pointer;background:#fff;color:#0a0f0d;transition:transform .3s ' + E + ',background .2s}',
    '.dk-btn:hover{transform:translateY(-2px);background:var(--m)}',
    '.dk-btn span{transition:transform .3s}.dk-btn:hover span{transform:translate(3px,-3px)}',
    /* 만든 이유(마지막 장) */
    '.dk-slide.full .dk-copy{max-width:1680px;width:100%}',
    '.dk-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:22px}.dk-head .dk-title{margin:0 !important}',
    '.vz{margin-top:auto;padding-top:16px;border-top:1px solid var(--ln)}',
    '.vz p{margin:10px 0 0;font-size:13px;color:var(--mu)}.vz p b{color:#fff}',
    '.waf{display:grid;grid-template-columns:repeat(20,1fr);gap:4px}',
    '.waf i{aspect-ratio:1;border-radius:50%;background:rgba(255,255,255,.1)}',
    '.dk-slide.on .waf i.on{animation:dkWaf .5s ease var(--d) forwards}',
    '@keyframes dkWaf{0%{transform:scale(.4)}60%{transform:scale(1.25)}100%{transform:scale(1);background:var(--m);box-shadow:0 0 8px rgba(106,245,176,.6)}}',
    '.bars2{position:relative;display:flex;align-items:flex-end;gap:18px;height:96px;padding-right:70px}',
    '.bc{flex:1;max-width:70px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}',
    '.bc u{flex:1;width:100%;position:relative}.bc i{position:absolute;left:0;bottom:0;display:block;width:100%;height:var(--h);border-radius:4px 4px 0 0;background:var(--m);transform:scaleY(0);transform-origin:bottom}',
    '.bc.hot i{background:var(--hot)}',
    '.dk-slide.on .bc i{animation:dkBar 1.2s ' + E + ' 1s forwards}.dk-slide.on .bc.hot i{animation-delay:1.5s}',
    '@keyframes dkBar{to{transform:scaleY(1)}}',
    '.bc{gap:4px}.bc b{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;opacity:0}.dk-slide.on .bc b{animation:dkFade .6s ease 1.9s forwards}',
    '.bc span{font-size:12.5px;color:var(--mu);white-space:nowrap}',
    '.bars2 em{position:absolute;right:0;top:34%;font-style:normal;font-size:20px;font-weight:700;color:var(--hot);opacity:0}.dk-slide.on .bars2 em{animation:dkFade .6s ease 2.4s forwards}',
    '.loopback{margin-top:auto;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;border:1px dashed rgba(106,245,176,.4);font-size:13px;font-weight:600;color:#eafff4}',
    '.loopback span{font-size:22px;color:var(--m);display:inline-block}.dk-slide.on .loopback span{animation:dkSpin 2.5s linear infinite}',
    '@keyframes dkSpin{to{transform:rotate(-360deg)}}',
    '.dk-slide.on .dk-res ol li{animation:dkStep 6s ease infinite;animation-delay:calc(2s + var(--i) * 1.2s)}',
    '@keyframes dkStep{0%,100%{box-shadow:none}4%,16%{box-shadow:0 0 0 2px var(--m),0 0 22px rgba(106,245,176,.45)}22%{box-shadow:none}}',
    '.pth{display:block;width:100%;height:auto;overflow:visible}',
    '.pth path{fill:none;stroke-linecap:round;stroke-dasharray:1 1;stroke-dashoffset:1}',
    '.pth .p-short{stroke:var(--hot);stroke-width:3;opacity:.8}.pth .p-quiet{stroke:var(--m);stroke-width:4}',
    '.dk-slide.on .pth .p-short{animation:dkDraw 1s ease 1.2s forwards}.dk-slide.on .pth .p-quiet{animation:dkDraw 1.6s ' + E + ' 2s forwards}',
    '.pth .p-tree circle{fill:#3fdc8c;opacity:0}.dk-slide.on .pth .p-tree circle{animation:dkFade .6s ease 3s forwards}',
    '.pth text{font-size:11.5px;font-weight:600;text-anchor:middle;opacity:0}.pth .t-short{fill:#ffb08a}.pth .t-quiet{fill:#bfffe0}',
    '.dk-slide.on .pth .t-short{animation:dkFade .6s ease 1.8s forwards}.dk-slide.on .pth .t-quiet{animation:dkFade .6s ease 3.2s forwards}',
    '.dk-res .r.th{position:relative;padding-right:84px;min-height:96px}',
    '.thm{position:absolute;right:0;top:0;display:flex;gap:12px}',
    '.tb{display:flex;flex-direction:column;align-items:center;gap:5px}',
    '.tb:before{content:"";order:0}',
    '.tb i{position:relative;display:block;width:14px;height:80px;border-radius:7px;background:rgba(255,255,255,.1);overflow:hidden}',
    '.tb i:after{content:"";position:absolute;left:0;right:0;bottom:0;height:var(--h);background:var(--m);border-radius:7px;transform:scaleY(0);transform-origin:bottom}',
    '.tb.hot i:after{background:var(--hot)}',
    '.dk-slide.on .tb i:after{animation:dkBar 1.4s ' + E + ' 1.2s forwards}.dk-slide.on .tb:not(.hot) i:after{animation-delay:1.7s}',
    '.tb span{font-size:11px;color:var(--mu)}',
    '.dk-slide.full .dk-title{font-size:clamp(28px,2.8vw,42px);margin-bottom:22px}',
    '.dk-res{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:20px}',
    '.dk-res section{padding:18px 20px 16px;border-radius:16px;background:var(--gl);border:1px solid var(--ln);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);display:flex;flex-direction:column;gap:11px;opacity:0;transform:translateY(40px);transition:opacity .8s,transform 1.1s ' + E + '}',
    '.dk-slide.on .dk-res section{opacity:1;transform:none;transition-delay:calc(.5s + var(--i) * .14s)}',
    '.dk-res h4{margin:0;font:700 12.5px/1 inherit;letter-spacing:.02em;color:var(--m)}',
    '.dk-res h5{margin:0;font-size:16.5px;line-height:1.4;font-weight:600;letter-spacing:-.02em;word-break:keep-all}',
    '.dk-res .r b{display:block;font-size:27px;font-weight:300;letter-spacing:-.03em;font-variant-numeric:tabular-nums;white-space:nowrap;color:#fff}',
    '.dk-res .r p{margin:3px 0 0;font-size:13px;line-height:1.5;color:rgba(241,247,243,.84);word-break:keep-all}',
    '.dk-res .r cite{display:block;margin-top:4px;font-size:11px;line-height:1.4;font-style:normal;color:rgba(241,247,243,.45)}',
    '.dk-res ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}',
    '.dk-res ol li{position:relative;padding:9px 12px;border-radius:10px;background:rgba(106,245,176,.07);border:1px solid rgba(106,245,176,.14);font-size:13px;font-weight:600;opacity:0;transform:translateX(-10px);transition:all .6s ' + E + '}',
    '.dk-slide.on .dk-res ol li{opacity:1;transform:none;transition-delay:calc(1.1s + var(--i) * .16s)}',
    '.dk-res ol li small{display:block;font-weight:500;font-size:11px;color:var(--mu)}',
    '.dk-res ol li:not(:last-child):after{content:"";position:absolute;left:50%;bottom:-9px;width:1px;height:8px;background:var(--m)}',
    '.dk-res ol li:last-child{background:rgba(106,245,176,.22);border-color:rgba(106,245,176,.5)}',
    '.dk.s-why .dk-shade{background:rgba(4,9,10,.82)}',
    /* 아래 넘김 막대 */
    '.dk-nav{position:absolute;left:64px;right:56px;bottom:34px;z-index:5;display:flex;align-items:center;gap:22px}',
    '.dk-steps{display:flex;gap:16px;flex:1;min-width:0}',
    '.dk-steps button{flex:1;max-width:140px;padding:12px 0 0;border:0;background:none;color:rgba(241,247,243,.42);font:600 12.5px/1.3 inherit;text-align:left;cursor:pointer;position:relative;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .3s}',
    '.dk-steps button:before,.dk-steps button:after{content:"";position:absolute;left:0;top:0;height:2px;width:100%;background:rgba(255,255,255,.14)}',
    '.dk-steps button:after{background:var(--m);transform:scaleX(0);transform-origin:left;transition:transform .6s ' + E + '}',
    '.dk-steps button.done:after{transform:scaleX(1);opacity:.45}',
    '.dk-steps button.on{color:var(--ink)}',
    '.dk-steps button.on:after{transform:scaleX(1);opacity:1;box-shadow:0 0 10px var(--m)}',
    '.dk-steps button:hover{color:var(--ink)}',
    '.dk-count{font:600 12px/1 ' + MONO + ';letter-spacing:.1em;color:var(--mu);white-space:nowrap}',
    '.dk-count b{color:var(--ink);font-size:15px}',
    '.dk-arrow{width:48px;height:48px;flex:none;border-radius:50%;border:1px solid var(--ln);background:rgba(255,255,255,.05);color:var(--ink);font-size:18px;cursor:pointer;display:grid;place-items:center;transition:background .2s,opacity .2s,transform .3s ' + E + '}',
    '.dk-arrow:hover{background:rgba(255,255,255,.14);transform:scale(1.06)}',
    '.dk-arrow:disabled{opacity:.25;cursor:default;transform:none}',
    '.dk-arrow.next:not(:disabled){background:#fff;color:#0a0f0d;border-color:#fff}',
    '@media (max-width:1100px){.dk-slide{padding:100px 32px 120px 36px}.dk-nav{left:36px;right:32px}.dk-copy{max-width:420px}.dk-hud{right:28px;width:290px}.dk-res{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@media (max-width:820px){html.dk-page .topbar-inner{padding:10px 16px}',
    '  .dk-slide{align-items:flex-end;padding:0 20px 92px}.dk-slide.full{align-items:flex-start;padding:110px 20px 100px;overflow-y:auto;pointer-events:auto}',
    '  .dk-copy{max-width:none}.dk-en{margin-bottom:14px;font-size:11px}.dk-title{font-size:30px;margin-bottom:12px}.dk-body{font-size:15px;line-height:1.6;margin-bottom:18px}.dk-note{margin:-8px 0 14px}',
    '  .dk-shade{background:linear-gradient(0deg,rgba(4,9,10,.97) 0%,rgba(4,9,10,.9) 36%,rgba(4,9,10,0) 62%),linear-gradient(180deg,rgba(4,9,10,.7),transparent 16%)}',
    '  .dk-hud{right:10px;top:118px;width:300px;transform:scale(.6);transform-origin:top right}',
    '  .dk-head{flex-direction:column;align-items:flex-start;gap:16px}.dk-res{grid-template-columns:1fr}.dk-nav{left:20px;right:20px;bottom:18px;gap:12px}.dk-steps{gap:5px}.dk-steps button{font-size:0}.dk-arrow{width:42px;height:42px}}',
    '@media (prefers-reduced-motion:reduce){.dk *,.dk *:before,.dk *:after{transition-duration:.01s !important;animation-duration:.01s !important;animation-delay:0s !important}}',
  ].join('\n');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function d(pts) { return 'M' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join('L'); }
  function join(list) { var out = []; list.forEach(function (s, i) { out = out.concat(i ? s.slice(1) : s); }); return out; }
  function rt(cls, pts, del, dur) { return '<path class="rt ' + cls + '" pathLength="1" d="' + d(pts) + '" style="--d:' + (del || 0) + 's;--t:' + (dur || 2) + 's"/>'; }
  function pin(p, inner, cls) { return '<div class="pin ' + (cls || '') + '" style="left:' + p[0] + 'px;top:' + p[1] + 'px">' + inner + '</div>'; }
  function tag(side, text, cls, del) { return '<span class="tag ' + side + ' ' + (cls || '') + ' pop" style="--d:' + del + 's">' + text + '</span>'; }

  var ROUTE = join(SEG);
  var WALK = join([SEG[0], SEG[1], ALT]);

  // 장면마다 지도 위 그림(SVG)과 표시(HTML), 화면 고정 카드(HUD)
  function scenes() {
    var S = {};
    // 0. 소개: 공원 안 장소들이 하나씩 켜짐
    var lab = { lake: '서울숲호수', family: '가족마당', deer: '사슴우리', insect: '곤충식물원', wetland: '습지생태원', skate: '스케이트파크', museum: '수도박물관', ginkgo: '은행나무숲' };
    S.intro = { svg: '', html: Object.keys(HUB).filter(function (k) { return k !== 'museum' && k !== 'hangang'; }).map(function (k, i) {
      return pin(HUB[k], '<b class="pop" style="--d:' + (0.4 + i * 0.06).toFixed(2) + 's"><span class="dot m' + (lab[k] ? ' ring' : '') + '"></span>' + (lab[k] ? '<span class="lbl">' + lab[k] + '</span>' : '') + '</b>');
    }).join('') };

    // 1. 붐빔: 붐비는 곳은 붉게 숨쉬고, 역에서 사람이 흘러 들어옴
    var hot = [['family', 120, 'b1'], ['mirror', 90, 'b2'], ['gateS', 80, 'b3'], ['skate', 70, 'b2']];
    var calm = [['deer', 80, 'b1'], ['wind', 60, 'b3'], ['ginkgo', 70, 'b2'], ['insect', 60, 'b1']];
    var flowA = [[1760, 820], [1594, 790], [1515, 792], [1427, 747], [1320, 675]], flowB = [[1760, 840], [1594, 790], [1526, 760], [1519, 672]], flowC = [[1760, 800], [1594, 790], [1487, 782], [1483, 858]];
    var people = '';
    [flowA, flowB, flowC].forEach(function (f, fi) { for (var i = 0; i < 7; i++) people += '<circle r="5" fill="#fff" opacity=".85"><animateMotion dur="' + (5 + fi) + 's" begin="-' + (i * (5 + fi) / 7).toFixed(2) + 's" repeatCount="indefinite" path="' + d(f) + '"/></circle>'; });
    S.crowd = {
      svg: '<defs><radialGradient id="dkHot"><stop offset="0" stop-color="#ff5a3c" stop-opacity=".85"/><stop offset=".5" stop-color="#ff8a3c" stop-opacity=".35"/><stop offset="1" stop-color="#ff8a3c" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="dkCalm"><stop offset="0" stop-color="#6af5b0" stop-opacity=".55"/><stop offset="1" stop-color="#6af5b0" stop-opacity="0"/></radialGradient></defs>' +
        hot.map(function (h) { return '<circle class="blob ' + h[2] + '" cx="' + HUB[h[0]][0] + '" cy="' + HUB[h[0]][1] + '" r="' + h[1] + '" fill="url(#dkHot)"/>'; }).join('') +
        calm.map(function (h) { return '<circle class="blob ' + h[2] + '" cx="' + HUB[h[0]][0] + '" cy="' + HUB[h[0]][1] + '" r="' + h[1] + '" fill="url(#dkCalm)"/>'; }).join('') +
        '<g class="fade" style="--d:.8s">' + people + '</g>',
      html: pin(HUB.family, tag('t', '가족마당 <small>북적여요</small>', 'hot', 1.2)) + pin(HUB.gateS, tag('b', '서울숲역 쪽 입구 <small>사람이 몰려요</small>', 'hot', 1.5)) +
        pin(HUB.deer, tag('b', '사슴우리 <small>한산해요</small>', 'calm', 1.8)) + pin(HUB.ginkgo, tag('t', '은행나무숲 <small>한산해요</small>', 'calm', 2.1)),
    };

    // 2. 고르기: 카드에서 셋을 고르면 길이 그려지고 들를 곳 번호가 뜸
    var chip = function (t, sel, del) { return '<span class="chip' + (sel ? ' sel' : '') + '" style="--d:' + (del || 0) + 's">' + t + '</span>'; };
    S.pick = {
      svg: rt('glow draw', ROUTE, 3.1, 2.4) + rt('main draw', ROUTE, 3.1, 2.4),
      html: pin(START, '<b class="pop" style="--d:3s"><span class="dot"></span>' + '<span class="tag b">여기서 출발</span></b>') +
        STOPS.map(function (s, i) { return pin(s.p, '<b class="pop" style="--d:' + (3.6 + i * 0.6) + 's"><span class="num">' + (i + 1) + '</span></b>' + tag(i === 2 ? 'b' : 't', s.n, 'm', 3.8 + i * 0.6)); }).join(''),
      hud: '<div class="card"><h6>무엇을 하고 싶나요?</h6><div class="chips">' + chip('🚶 산책', 1, 1.2) + chip('🧺 피크닉') + chip('🦌 동물 보기', 1, 1.6) + chip('📸 사진') + chip('🌿 조용히 쉬기') + '</div>' +
        '<h6>누구와 왔나요?</h6><div class="chips">' + chip('🙋 혼자') + chip('💑 연인과', 1, 2.0) + chip('👨‍👩‍👧 가족과') + '</div>' +
        '<h6>얼마나 머물까요?</h6><div class="chips">' + chip('30분') + chip('1시간', 1, 2.4) + chip('2시간') + '</div>' +
        '<div class="result pop" style="--d:2.9s">들를 곳 3곳 · 걸어서 16분 <span>→</span></div></div>',
    };

    // 3. 날씨: 더운 날(땡볕 길 대신 그늘 길) ↔ 비 오는 날(실내로)
    var sunny = [START, [1519, 672], [1372, 610], [1265, 600], [1150, 650], [1060, 760], STOPS[2].p];   // 그늘 없는 잔디마당 쪽
    S.weather = {
      svg: '<g class="wx-heat">' + '<path class="rt hot shimmer fade" style="--d:.6s" d="' + d(sunny) + '"/>' + rt('glow draw', ROUTE, 1.6, 2.2) + rt('main draw', ROUTE, 1.6, 2.2) + '<g class="canopies"></g></g>' +
        '<g class="wx-rain">' + rt('glow', RAIN) + '<path class="rt main" d="' + d(RAIN) + '"/></g>',
      html: '<div class="wx-heat">' + pin([1372, 610], tag('t', '☀️ 땡볕 길', 'hot', 1)) + pin([1080, 800], tag('b', '🌳 그늘이 이어진 길', 'm', 2.6)) + '</div>' +
        '<div class="wx-rain">' + pin(HUB.insect, '<b><span class="dot m ring"></span></b><span class="tag b m">🏠 곤충식물원 · 실내</span>') + pin(HUB.butterfly, '<span class="tag r">🦋 나비정원</span>') + '</div>',
      hud: '<div class="card"><h6>오늘 날씨</h6><div class="temp"><i class="w-h">☀️</i><i class="w-r">🌧️</i><div><b><span class="tnum">33</span><sup>℃</sup></b><p class="w-h">한낮 · 햇볕이 뜨거워요</p><p class="w-r">비가 와요 · 미세먼지 나쁨</p></div></div>' +
        '<div class="say w-h">그늘 많은 길로 바꿨어요 🌳</div><div class="say w-r">실내에서 즐기는 코스로 바꿨어요 🏠</div></div>',
    };

    // 4. 표정: 걷는 점이 들를 곳에 닿을 때마다 표정이 뜨고, 아쉬운 곳 다음 길은 바로 바뀜
    S.rate = {
      svg: rt('glow', join([SEG[0], SEG[1]])) + rt('main', join([SEG[0], SEG[1]])) + '<path class="rt main out" style="--d:5.4s" d="' + d(SEG[2]) + '"/>' +
        rt('glow draw', ALT, 5.6, 1.4) + rt('main draw', ALT, 5.6, 1.4),
      html: STOPS.map(function (s, i) { return pin(s.p, '<b><span class="num">' + (i + 1) + '</span></b>'); }).join('') +
        pin(STOPS[0].p, '<b class="pop" style="--d:1.7s"><span class="face">😊</span></b>') +
        pin(STOPS[1].p, '<b class="pop" style="--d:4.9s"><span class="face bad">☹️</span></b>' + tag('l', '너무 붐벼요 → <b style="color:var(--m)">한적한 길로 바꿨어요</b>', 'hot', 5.3)) +
        pin(STOPS[2].p, '<b class="pop" style="--d:8.9s"><span class="face">😊</span></b>') +
        '<div class="pin walkpin"><b><span class="walker"></span></b></div>',
    };

    // 5. 영수증: 공원 곳곳 기계 12곳이 켜지고, 가장 가까운 곳이 빛남. 영수증이 인쇄돼 나옴
    S.receipt = {
      svg: rt('glow', WALK) + '<path class="rt main" style="opacity:.55" d="' + d(WALK) + '"/>',
      html: KIOSK.map(function (k, i) { return pin(HUB[k], '<b class="pop" style="--d:' + (0.5 + i * 0.09).toFixed(2) + 's"><span class="kio' + (k === 'deer' ? ' best ring' : '') + '">🧾</span></b>'); }).join('') +
        pin(HUB.deer, tag('b', '가장 가까운 영수증 기계 · 1분', 'm', 1.8)),
      hud: '<div class="slot"></div><div class="paperwrap"><div class="paper"><h5>서울숲 산책 영수증</h5><div class="c"><span class="today"></span> · 연인과 · 1시간</div><hr>' +
        '<div class="row"><span>1 거울연못</span><span>😊</span></div><div class="row"><span>2 서울숲호수</span><span>☹️</span></div><div class="row"><span>3 사슴우리</span><span>😊</span></div><hr>' +
        '<div class="row"><span>걸은 시간</span><span>16분</span></div><div class="row"><span>들른 곳</span><span>3곳</span></div><hr>' +
        '<div class="cp">✂ 근처 카페 할인 쿠폰</div><div class="bars"></div></div></div>',
    };

    // 6. 더 좋은 공원: 장소마다 표정이 모여 색이 되고, 아쉬운 곳은 고쳐져서 초록으로
    var good = ['deer', 'lake', 'wetland', 'ginkgo', 'insect', 'butterfly', 'bird', 'wind', 'gallery'], mid = ['stage', 'mirror', 'courts', 'play', 'horse'];
    S.better = {
      svg: '<defs><radialGradient id="dkG"><stop offset="0" stop-color="#6af5b0" stop-opacity=".7"/><stop offset="1" stop-color="#6af5b0" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="dkY"><stop offset="0" stop-color="#ffd27a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="dkR"><stop offset="0" stop-color="#ff5a3c" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a3c" stop-opacity="0"/></radialGradient></defs>' +
        good.map(function (k, i) { return '<circle class="pop" style="--d:' + (0.5 + i * 0.1).toFixed(2) + 's" cx="' + HUB[k][0] + '" cy="' + HUB[k][1] + '" r="58" fill="url(#dkG)"/>'; }).join('') +
        mid.map(function (k, i) { return '<circle class="pop" style="--d:' + (0.8 + i * 0.1).toFixed(2) + 's" cx="' + HUB[k][0] + '" cy="' + HUB[k][1] + '" r="54" fill="url(#dkY)"/>'; }).join('') +
        '<circle class="blob pop" style="--d:1.4s" cx="' + HUB.family[0] + '" cy="' + HUB.family[1] + '" r="95" fill="url(#dkR)"/>' +
        '<circle class="fade" style="--d:4.6s" cx="' + HUB.family[0] + '" cy="' + HUB.family[1] + '" r="95" fill="url(#dkG)"/>',
      html: pin(HUB.family, tag('t', '가족마당 · "그늘이 없어요"가 많아요 ☹️', 'hot', 2) + '<span class="tag b m pop" style="--d:3.4s">⛱ 그늘막·벤치를 먼저 보완해요</span>') +
        pin(HUB.deer, tag('b', '사슴우리 😊', 'calm', 1.2)) + pin(HUB.wetland, tag('r', '습지생태원 😊', 'calm', 1.4)) + pin(HUB.mirror, tag('r', '거울연못 🙂', '', 1.6)),
    };
    S.why = { svg: '', html: '' };
    return S;
  }

  function slideHtml(s) {
    var n = 0, fade = function (cls) { return ' class="dk-fade ' + (cls || '') + '" style="--i:' + (n++) + '"'; };
    var h = '<div class="dk-copy"><div class="dk-en"><i></i>' + esc(s.en) + '</div>';
    h += '<h2 class="dk-title">' + s.title.split('<br>').map(function (l, i) { return '<span class="dk-line"><span style="--i:' + i + '">' + l + '</span></span>'; }).join('') + '</h2>';
    if (s.body) h += '<p' + fade('dk-body') + '>' + esc(s.body) + '</p>';
    if (s.note) h += '<p' + fade('dk-note') + '>' + esc(s.note) + '</p>';
    if (s.research) {
      h = h.replace('<h2', '<div class="dk-head"><h2').replace('</h2>', '</h2><div class="dk-fade dk-cta" style="--i:0"><a class="dk-btn" href="' + TOUR + '">코스 찾기 시작 <span>↗</span></a></div></div>');
      h += '<div class="dk-res">' + RESEARCH.map(function (c, ci) {
        var inner = c.flow ? '<ol>' + c.flow.map(function (f, k) { return '<li style="--i:' + k + '">' + f + '</li>'; }).join('') + '</ol><div class="loopback"><span>↺</span> 다음에 올 땐 더 잘 맞춰 드려요</div>'
          : c.rows.map(function (r) { return '<div class="r' + (c.thermo && r[0].indexOf('℃') > 0 ? ' th' : '') + '">' + (c.thermo && r[0].indexOf('℃') > 0 ? THERMO : '') + '<b data-n="' + esc(r[0]) + '">' + esc(r[0]) + '</b><p>' + esc(r[1]) + '</p><cite>' + esc(r[2]) + '</cite></div>'; }).join('');
        return '<section style="--i:' + ci + '"><h4>' + c.h + '</h4><h5>' + esc(c.t) + '</h5>' + inner + (c.viz ? VIZ[c.viz]() : '') + '</section>';
      }).join('') + '</div>';
    }
    if (s.cta) h += '<div' + fade('dk-cta') + '><a class="dk-btn" href="' + TOUR + '">코스 찾기 시작 <span>↗</span></a></div>';
    return h + '</div>';
  }

  function countUp(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.dk-res .r b[data-n]'), function (b) {
      var orig = b.dataset.n, m = /(\d+(?:\.\d+)?)/.exec(orig);
      if (!m) return;
      var v = parseFloat(m[1]), dec = (m[1].split('.')[1] || '').length, t0 = performance.now();
      (function f(ts) {
        var k = Math.max(0, Math.min(1, (ts - t0 - 700) / 1300)), e = 1 - Math.pow(1 - k, 3);
        b.textContent = orig.replace(m[1], (v * e).toFixed(dec));
        if (k < 1 && b.isConnected) requestAnimationFrame(f); else b.textContent = orig;
      })(t0);
    });
  }

  var dk = null;
  function build() {
    var S = scenes();
    var root = el('section', 'dk');
    root.setAttribute('aria-roledescription', 'carousel'); root.setAttribute('aria-label', '서울숲 코스 찾기 소개');

    var world = el('div', 'dk-world');
    var img = new Image(); img.alt = ''; img.onload = function () { img.classList.add('ok'); }; img.src = MAP;
    world.appendChild(img); world.appendChild(el('div', 'dk-tint'));
    var svg = '<svg viewBox="0 0 2560 1600" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">', layer = '', hud = '';
    SLIDES.forEach(function (s) {
      var sc = S[s.key];
      svg += '<g class="dk-sc" data-k="' + s.key + '">' + sc.svg + '</g>';
      layer += '<div class="dk-sc dk-layer" data-k="' + s.key + '">' + sc.html + '</div>';
      if (sc.hud) hud += '<div class="dk-sc dk-hud" data-k="' + s.key + '">' + sc.hud + '</div>';
    });
    world.insertAdjacentHTML('beforeend', svg + '</svg>' + layer);
    root.appendChild(world);
    root.appendChild(el('div', 'dk-sun'));
    var rain = el('div', 'dk-rainfx');
    for (var i = 0; i < 70; i++) { var r = el('i'); r.style.left = (Math.random() * 110) + '%'; r.style.animationDuration = (0.55 + Math.random() * 0.5).toFixed(2) + 's'; r.style.animationDelay = (-Math.random()).toFixed(2) + 's'; rain.appendChild(r); }
    root.appendChild(rain);
    root.appendChild(el('div', 'dk-shade')); root.appendChild(el('div', 'dk-grain'));
    root.insertAdjacentHTML('beforeend', hud);
    var today = new Date(); Array.prototype.forEach.call(root.querySelectorAll('.today'), function (t) { t.textContent = today.getFullYear() + '.' + String(today.getMonth() + 1).padStart(2, '0') + '.' + String(today.getDate()).padStart(2, '0'); });

    var track = el('div', 'dk-track');
    SLIDES.forEach(function (s, k) { var sl = el('div', 'dk-slide' + (s.research ? ' full' : ''), slideHtml(s)); sl.setAttribute('role', 'group'); sl.setAttribute('aria-label', (k + 1) + ' / ' + SLIDES.length); track.appendChild(sl); });
    root.appendChild(track);
    var nav = el('div', 'dk-nav'), steps = el('div', 'dk-steps'), count = el('div', 'dk-count');
    var prev = el('button', 'dk-arrow prev', '←'), next = el('button', 'dk-arrow next', '→');
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', '이전 장'); next.setAttribute('aria-label', '다음 장');
    SLIDES.forEach(function (s, k) { var b = el('button', '', esc(s.tab)); b.type = 'button'; b.setAttribute('aria-label', (k + 1) + '. ' + s.tab); b.onclick = function () { go(k); }; steps.appendChild(b); });
    nav.appendChild(steps); nav.appendChild(count); nav.appendChild(prev); nav.appendChild(next);
    root.appendChild(nav);
    document.body.appendChild(root);
    document.documentElement.classList.add('dk-page');
    dk = root;

    // 그늘 길을 따라 나무 그늘 점 찍기(길이를 재야 해서 화면에 붙인 뒤)
    var wpath = root.querySelector('.dk-sc[data-k=weather] .rt.main');
    var can = root.querySelector('.canopies');
    if (wpath && can && wpath.getTotalLength) {
      var tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path'); tmp.setAttribute('d', d(ROUTE)); can.appendChild(tmp);
      var L = tmp.getTotalLength(), out = '';
      for (var c = 0; c < 22; c++) { var pt = tmp.getPointAtLength(L * (c + 0.5) / 22), off = (c % 2 ? 1 : -1) * (12 + (c * 7) % 14); out += '<circle class="canopy" style="--d:' + (1.8 + c * 0.09).toFixed(2) + 's" cx="' + (pt.x + off).toFixed(0) + '" cy="' + (pt.y - off * 0.6).toFixed(0) + '" r="' + (20 + (c * 5) % 12) + '"/>'; }
      can.innerHTML = out;
    }
    // 걷는 점 경로(들를 곳마다 잠깐 멈춤)
    var walkPin = root.querySelector('.walkpin'), walkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    walkPath.setAttribute('d', d(WALK)); root.querySelector('svg').appendChild(walkPath); walkPath.style.display = 'none';
    var lenOf = function (pts) { var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d(pts)); p.style.display = 'none'; root.querySelector('svg').appendChild(p); var l = p.getTotalLength(); p.remove(); return l; };
    var WL = walkPath.getTotalLength(), a1 = lenOf(SEG[0]) / WL, a2 = lenOf(join([SEG[0], SEG[1]])) / WL;
    var KT = [[0, 0], [0.16, a1], [0.3, a1], [0.52, a2], [0.66, a2], [0.98, 1], [1, 1]];   // [시간 비율, 길 비율]
    var walkRaf = 0;
    function walk(t0) {
      cancelAnimationFrame(walkRaf);
      var DUR = 9200;
      (function f(ts) {
        var t = Math.min(1, (ts - t0) / DUR), j = 1;
        while (j < KT.length - 1 && KT[j][0] < t) j++;
        var A = KT[j - 1], Bk = KT[j], u = Bk[0] === A[0] ? 1 : (t - A[0]) / (Bk[0] - A[0]); u = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        var p = walkPath.getPointAtLength(WL * (A[1] + (Bk[1] - A[1]) * u));
        walkPin.style.left = p.x + 'px'; walkPin.style.top = p.y + 'px';
        if (t < 1 && root.isConnected && root.classList.contains('s-rate')) walkRaf = requestAnimationFrame(f);
      })(t0);
    }

    // 날씨 장: 더위 ↔ 비를 번갈아
    var wxTimer = 0, tnum = root.querySelector('.tnum');
    function countTo(from, to, ms) { var t0 = performance.now(); (function f(ts) { var k = Math.min(1, (ts - t0) / ms), e = 1 - Math.pow(1 - k, 3); tnum.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); })(t0); }
    function weather(on) {
      clearTimeout(wxTimer); root.classList.remove('rain');
      if (!on) return;
      countTo(24, 33, 1600);
      wxTimer = setTimeout(function rainy() {
        root.classList.add('rain'); countTo(33, 19, 1200);
        wxTimer = setTimeout(function () { root.classList.remove('rain'); countTo(19, 33, 1200); wxTimer = setTimeout(rainy, 6500); }, 6000);
      }, 6500);
    }

    var cur = -1, busy = 0;
    function camera() {
      if (cur < 0) return;
      var W = innerWidth, H = innerHeight, c = SLIDES[cur].cam, narrow = W <= 820, s, cx, cy;
      if (narrow) { s = Math.min(c[2], 1.15) / 1.05 * 0.85 * Math.min(W / 700, H / 1250); cx = W * 0.5; cy = H * (SLIDES[cur].hud ? 0.4 : 0.34); }
      else { s = c[2] * Math.min(H / 1100, W / 1700); cx = W * (SLIDES[cur].hud ? 0.54 : 0.63); cy = H * 0.5; }
      world.style.transform = 'translate(' + (cx - c[0] * s).toFixed(1) + 'px,' + (cy - c[1] * s).toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
      world.style.setProperty('--inv', (1 / s).toFixed(4));
    }
    function go(k) {
      k = Math.max(0, Math.min(SLIDES.length - 1, k));
      if (k === cur) return;
      cur = k;
      var key = SLIDES[k].key;
      root.className = 'dk s-' + key;
      camera();
      Array.prototype.forEach.call(root.querySelectorAll('.dk-sc'), function (g) {
        var on = g.getAttribute('data-k') === key;
        g.classList.remove('on');
        if (on) { void g.getBoundingClientRect(); g.classList.add('on'); }
      });
      Array.prototype.forEach.call(track.children, function (c, j) { if (j === k) { c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); } else c.classList.remove('on'); });
      Array.prototype.forEach.call(steps.children, function (c, j) { c.classList.toggle('on', j === k); c.classList.toggle('done', j < k); });
      count.innerHTML = '<b>' + String(k + 1).padStart(2, '0') + '</b> / ' + String(SLIDES.length).padStart(2, '0');
      prev.disabled = k === 0; next.disabled = k === SLIDES.length - 1;
      weather(key === 'weather');
      if (key === 'rate') { var t0 = performance.now() + 900; walkPin.style.left = START[0] + 'px'; walkPin.style.top = START[1] + 'px'; setTimeout(function () { if (root.classList.contains('s-rate')) walk(performance.now()); }, 900); }
      if (SLIDES[k].research) countUp(track.children[k]);
    }
    function step(dlt) { var now = Date.now(); if (now - busy < 450) return; busy = now; go(cur + dlt); }
    prev.onclick = function () { step(-1); };
    next.onclick = function () { step(1); };
    root._key = function (e) {
      if (!root.isConnected) return;
      var tg = (document.activeElement || {}).tagName || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tg) || (tg === 'BUTTON' && e.key === ' ')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { step(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { step(-1); e.preventDefault(); }
    };
    root._resize = camera;
    document.addEventListener('keydown', root._key);
    addEventListener('resize', camera);
    root._stop = function () { clearTimeout(wxTimer); cancelAnimationFrame(walkRaf); };
    // 끌기·밀기
    var sx = null, sy = 0;
    root.addEventListener('pointerdown', function (e) { if (e.button !== 0 || e.target.closest('a,button')) return; sx = e.clientX; sy = e.clientY; });
    root.addEventListener('pointerup', function (e) {
      if (sx == null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    });
    var wheelAt = 0;
    root.addEventListener('wheel', function (e) {
      var sl = e.target.closest && e.target.closest('.dk-slide');
      if (sl && sl.scrollHeight > sl.clientHeight + 4 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) return;   // 좁은 화면에서 장 안을 내려 볼 때
      var dd = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(dd) < 14) return;
      e.preventDefault();
      var now = Date.now(); if (now - wheelAt < 900) return; wheelAt = now;
      step(dd > 0 ? 1 : -1);
    }, { passive: false });
    root._go = go;
    go(0);
  }
  function teardown() {
    if (!dk) return;
    document.removeEventListener('keydown', dk._key);
    removeEventListener('resize', dk._resize);
    dk._stop();
    dk.remove(); dk = null;
    document.documentElement.classList.remove('dk-page');
  }

  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  function scan() {
    var hm = document.querySelector('.hm');
    if (hm && !dk) build();
    else if (!hm && dk) teardown();
  }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') scan(); else document.addEventListener('DOMContentLoaded', scan);
})();
