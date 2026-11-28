// 소개 탭: 우리 사이트 화면을 그대로 보여 주며 이용 흐름을 소개하는 7장(가로로 넘김).
// 시작 영상(표지)·이용자 화면·만족도(운영 관제)와 같은 결: 화면 전체를 쓰는 어두운 위성 배경, 고정폭 영문 라벨, 얇은 큰 제목, 민트 강조.
// 장마다 실제 화면 캡처(needs/intro/*.jpg, 1440×900)를 브라우저 창에 담아 띄우고, 짚을 곳에 빛나는 표시를 겹칩니다.
// 기존 소개(현황·문제·전략·근거)는 숨기기만 하고 지우지 않습니다.
(function () {
  'use strict';
  var BASE = ((document.currentScript || {}).src || '').replace(/[^/]*$/, '');
  var IMG = BASE + 'intro/';
  var TOUR = BASE + 'tour.html';
  var MOBILE = BASE + '../mobile.html';
  var OPS = BASE + '../ops/index.html';
  var V = '?v=20261128c';
  var HOST = 'choemyeongwon1-ui.github.io/kaya/…/recovery-station/';

  // 표시 위치는 캡처 화면(1440×900) 기준 좌표. side: 글상자가 붙는 쪽
  var SLIDES = [
    { key: 'home', img: 'home.jpg', bg: 'cover.jpg', url: 'needs/tour.html', en: 'SEOUL FOREST · HOW IT WORKS',
      title: '서울숲,<br>오늘 나에게 <em>맞는 길</em>',
      body: '지금 붐비는 정도와 날씨를 보고, 함께 온 사람과 머물 시간에 맞는 산책 코스를 지도에 그려 드려요. 설치도 가입도 없이 링크 하나로 열려요.',
      cta: true, zoom: [30, 40],
      marks: [[210, 235, 'r', '지금 붐빔 · 1시간 뒤 예측'], [780, 335, 't', '역에서 내리는 사람 수'], [210, 450, 'r', '날씨에 맞춘 한 줄 안내'], [1200, 455, 'l', '고르기 어려우면 추천 코스']] },
    { key: 'pick', img: 'pick.jpg', url: 'needs/tour.html', en: '01 · CHOOSE',
      title: '세 번만 고르면<br><em>코스가 나와요</em>',
      body: '하고 싶은 것, 같이 온 사람, 머물 시간. 세 가지를 고르면 지금 붐빔과 날씨를 계산해 들를 곳과 길을 바로 그려요.',
      zoom: [70, 30],
      marks: [[1072, 117, 'b', '고른 조건 · 걷기 · 연인과 · 1시간'], [560, 410, 'b', '지도에 바로 그려지는 길'], [1190, 525, 'l', '들를 곳 3곳 · 지금 붐빔'], [1050, 767, 't', '출발']] },
    { key: 'weather', img: 'heat.jpg', url: 'needs/tour.html?wx=heat', en: '02 · WEATHER-AWARE',
      title: '더운 날엔 그늘로,<br><em>비 오면 실내로</em>',
      body: '체감 33℃가 넘으면 나무 그늘과 물가를, 비·미세먼지·추운 날엔 곤충식물원·나비정원 같은 실내를 먼저 골라요. 아이·어르신과 오면 계단 없는 길로.',
      zoom: [14, 50],
      marks: [[210, 460, 'r', '체감 36° → 그늘·물가 위주로'], [210, 300, 'r', '17시쯤 붐빌 수 있어요'], [700, 510, 'b', '붐비는 역 · 실시간']] },
    { key: 'rate', img: 'rate.jpg', url: 'needs/tour.html', en: '03 · ON THE WAY',
      title: '도착하면<br><em>표정 하나면 돼요</em>',
      body: '좋으면 그대로 다음 곳으로, 아쉬우면 까닭(붐빔·더위·쉴 곳)을 고르면 남은 코스를 바로 바꿔요. 표정은 이름·위치 없이 공원을 고치는 데만 써요.',
      zoom: [80, 30],
      marks: [[1197, 288, 'b', '표정 하나 · 1초 평가'], [480, 400, 'r', '도착한 곳 사진'], [1157, 37, 'b', '「이 나무 뭐지?」 사진으로 나무 이름']] },
    { key: 'end', img: 'end.jpg', url: 'needs/tour.html', en: '04 · RECEIPT & COUPON',
      title: '산책 영수증 받고,<br><em>동네 혜택까지</em>',
      body: '공원 곳곳 영수증 기계 12곳 중 가장 가까운 곳으로 안내해요. 표정을 남기면 영수증에서 카페 할인·주차 1시간 무료·동네 가게 할인 중 하나를 골라요.',
      note: '영수증 기계와 혜택은 우리 팀이 제안하는 운영 방식이에요.', zoom: [45, 42],
      marks: [[660, 384, 't', '가장 가까운 영수증 기계 · 3분'], [1190, 350, 'b', '표정 → 영수증 → 혜택 고르기'], [548, 96, 'r', '공원 곳곳 12곳']] },
    { key: 'ops', img: 'ops.jpg', url: 'ops/index.html', en: '05 · SATISFACTION MAP',
      title: '남긴 표정이<br><em>공원을 바꿔요</em>',
      body: '모인 표정은 시간대별 만족도 지도가 돼요. 점수가 낮은 곳은 빨갛게 보이고, 붐빔·날씨·환경 중 무엇이 문제인지와 고칠 방법을 관리자에게 알려요.',
      ops: true, zoom: [50, 45],
      marks: [[1350, 105, 'l', '지금 공원 만족도'], [640, 400, 'r', '낮은 곳은 빨갛게'], [1220, 540, 'l', '지금 조치할 곳 · 고칠 방법'], [520, 845, 't', '시간대별로 돌려 보기']] },
    { key: 'why', bg: 'ops.jpg', en: 'WHY WE BUILT THIS', research: true,
      title: '처음 온 사람도, 한여름에도<br><em>서울숲에 오래 머물도록</em>' },
  ];

  var RESEARCH = [
    { h: 'SITE', k: '현황', t: '서울 전역에서 찾아오는 공원', rows: [['73.4%', '동네 밖에서 온 방문객', '서울시 실시간 인구데이터(2026-11-19)'], ['1위', '서울 직영 공원 26곳 중 온라인 언급 비중 33.7%', '서울AI재단(2026)']] },
    { h: 'PROBLEM', k: '문제', t: '정보는 부족하고, 여름엔 발길이 끊겨요', rows: [['40.2%', '처음 온 방문객. 안내 시설로 정보를 얻는 경우는 드묾', '주신하·김영희(2010)'], ['−48.6%', '서울숲역 낮 하차 5월 8,864명 → 8월 4,557명', '서울 열린데이터광장 OA-12252(2026)']] },
    { h: 'SOLUTION', k: '해결', t: '추천과 평가가 한 바퀴로 이어져요', flow: ['날씨·붐빔·동행', '그늘·한산한 길 찾기<small>가장 짧은 길의 1.2배까지</small>', '맞춤 코스', '장소별 표정 평가', '다음 추천에 반영'] },
    { h: 'EVIDENCE', k: '근거', t: '선행연구 값을 기준으로', rows: [['5.5~7.4℃', '33℃ 넘는 시간, 공원 안이 밖 도로보다 시원', '조현민·권태경(2022)'], ['12%', '조용하고 보기 좋은 길이 더 길어도 더 선호', 'Quercia 외(2014)'], ['IPA', '편의시설: 중요도는 높고 만족은 낮음', '이지연(2012)']] },
  ];

  var E = 'cubic-bezier(.16,1,.3,1)';
  var MONO = 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace';
  var css = [
    /* 소개 탭에 있을 때만: 페이지를 어둡게, 상단 바를 투명하게 */
    'html.dk-page body{background:#04090a;overflow:hidden}',
    'html.dk-page .hm > :not(.dk){display:none !important}',
    'html.dk-page .topbar{position:fixed;left:0;right:0;top:0;background:linear-gradient(rgba(4,9,10,.88),rgba(4,9,10,0));-webkit-backdrop-filter:none;backdrop-filter:none}',
    'html.dk-page .topbar-inner{max-width:none;padding:18px 40px}',
    'html.dk-page .brand-title{color:#f1f7f3}',
    'html.dk-page .goal-tab{color:rgba(241,247,243,.62);background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}',
    'html.dk-page .goal-tab:hover{color:#f1f7f3;background:rgba(255,255,255,.08)}',
    'html.dk-page .goal-tab.g1[aria-selected=true]{background:#6af5b0;color:#03140b;box-shadow:none}',
    'html.dk-page .goal-tab .tab-n{box-shadow:inset 0 0 0 1.5px rgba(241,247,243,.5) !important;color:rgba(241,247,243,.8) !important}',
    'html.dk-page .topbar button:not(.goal-tab){background:rgba(255,255,255,.06);color:#f1f7f3;border-color:rgba(255,255,255,.1)}',
    '.dk{--m:#6af5b0;--ink:#f1f7f3;--mu:rgba(241,247,243,.62);--ln:rgba(255,255,255,.1);--gl:rgba(8,16,13,.72);',
    '  position:fixed;inset:0;z-index:900;overflow:hidden;color:var(--ink);font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;background:#04090a;user-select:none;touch-action:pan-y}',
    /* 배경: 장마다 그 화면을 흐리게 깔고 천천히 움직임 */
    '.dk-bg{position:absolute;inset:0;z-index:0}',
    '.dk-bg div{position:absolute;inset:-8%;background-size:cover;background-position:center;opacity:0;transform:scale(1.15);filter:blur(28px) saturate(1.2) brightness(.42);transition:opacity 1.2s,transform 9s linear}',
    '.dk-bg div.cover{filter:blur(9px) brightness(.55) saturate(1.1);inset:-3%}',
    '.dk-bg div.on{opacity:1;transform:scale(1.02)}',
    '.dk-shade{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(90deg,rgba(4,9,10,.97) 0%,rgba(4,9,10,.86) 34%,rgba(4,9,10,.2) 62%,rgba(4,9,10,.35) 100%),linear-gradient(0deg,rgba(4,9,10,.85),transparent 26%)}',
    '.dk-grain{position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.06;background-image:radial-gradient(rgba(255,255,255,.8) .5px,transparent .6px);background-size:3px 3px}',
    /* 장 */
    '.dk-track{position:absolute;inset:0;z-index:2}',
    '.dk-slide{position:absolute;inset:0;padding:110px 56px 110px 64px;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,.66fr) minmax(0,1.34fr);gap:40px;align-items:center;visibility:hidden;pointer-events:none}',
    '.dk-slide.on{visibility:visible;pointer-events:auto}',
    '.dk-slide.full{grid-template-columns:1fr;align-content:center}',
    '.dk-copy{position:relative;z-index:3;max-width:520px}',
    '.dk-en{display:flex;align-items:center;gap:12px;font:600 12px/1 ' + MONO + ';letter-spacing:.26em;color:var(--m);margin-bottom:26px}',
    '.dk-en i{width:8px;height:8px;border-radius:2px;background:var(--m);box-shadow:0 0 12px var(--m);transform:rotate(45deg)}',
    '.dk-title{margin:0 0 24px;font-size:clamp(34px,3.7vw,58px);line-height:1.14;letter-spacing:-.04em;font-weight:300;color:#eef3f0}',
    '.dk-title em{font-style:normal;font-weight:600;color:var(--m)}',
    '.dk-body{margin:0 0 30px;font-size:16.5px;line-height:1.75;color:var(--mu);max-width:470px}',
    '.dk-note{margin:-14px 0 24px;font-size:12.5px;line-height:1.5;color:rgba(241,247,243,.42)}',
    /* 글 등장: 가려진 줄에서 올라옴 */
    '.dk-line{display:block;overflow:hidden;padding-bottom:.08em}',
    '.dk-line > span{display:block;transform:translateY(105%);transition:transform 1s ' + E + '}',
    '.dk-slide.on .dk-line > span{transform:none;transition-delay:calc(.25s + var(--i) * .09s)}',
    '.dk-fade{opacity:0;transform:translateY(16px);transition:opacity .8s,transform 1s ' + E + '}',
    '.dk-slide.on .dk-fade{opacity:1;transform:none;transition-delay:calc(.55s + var(--i) * .1s)}',
    '.dk-en{opacity:0;letter-spacing:.6em;transition:opacity .8s,letter-spacing 1.2s ' + E + '}',
    '.dk-slide.on .dk-en{opacity:1;letter-spacing:.26em;transition-delay:.1s}',
    '.dk-cta{display:flex;flex-wrap:wrap;gap:12px}',
    '.dk-btn{display:inline-flex;align-items:center;gap:10px;padding:15px 22px;border-radius:999px;font:700 15px/1 inherit;text-decoration:none;cursor:pointer;color:var(--ink);background:rgba(255,255,255,.06);border:1px solid var(--ln);transition:transform .3s ' + E + ',background .2s}',
    '.dk-btn:hover{transform:translateY(-2px);background:rgba(255,255,255,.12)}',
    '.dk-btn.main{background:#fff;color:#0a0f0d;border-color:#fff}',
    '.dk-btn.main:hover{background:var(--m);border-color:var(--m)}',
    '.dk-btn span{transition:transform .3s}.dk-btn:hover span{transform:translate(3px,-3px)}',
    /* 브라우저 창(실제 화면) */
    '.dk-win{position:relative;z-index:2;justify-self:end;width:calc(100% + 40px);margin-right:-40px;max-width:1240px;perspective:1800px}',
    '.dk-win-in{border-radius:14px;overflow:hidden;background:#0b1210;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 50px 120px -30px rgba(0,0,0,.85),0 0 90px -30px rgba(106,245,176,.35);',
    '  transform:translateX(90px) rotateY(-16deg) rotateX(6deg) scale(.92);opacity:0;transform-origin:left center;transition:transform 1.4s ' + E + ',opacity 1s}',
    '.dk-slide.on .dk-win-in{transform:rotateY(-5deg) rotateX(1.5deg);opacity:1;transition-delay:.2s}',
    '.dk-chrome{display:flex;align-items:center;gap:14px;height:36px;padding:0 14px;background:#121a17;border-bottom:1px solid rgba(255,255,255,.06)}',
    '.dk-chrome i{width:11px;height:11px;border-radius:50%;background:#3a4440}.dk-chrome i:nth-child(1){background:#ff6058}.dk-chrome i:nth-child(2){background:#ffbd2e}.dk-chrome i:nth-child(3){background:#28c941}',
    '.dk-url{flex:1;max-width:520px;margin:0 auto;height:22px;border-radius:7px;background:rgba(255,255,255,.06);display:flex;align-items:center;gap:7px;padding:0 10px;font:500 11.5px/1 ' + MONO + ';color:rgba(241,247,243,.55);overflow:hidden;white-space:nowrap}',
    '.dk-url b{color:rgba(241,247,243,.85);font-weight:600}',
    '.dk-open{font:600 11px/1 ' + MONO + ';letter-spacing:.06em;color:var(--m);text-decoration:none;white-space:nowrap}',
    '.dk-open:hover{text-decoration:underline}',
    '.dk-screen{position:relative;aspect-ratio:1440/900;overflow:hidden}',
    '.dk-shot{position:absolute;inset:0;background-size:100% 100%;transform-origin:var(--zx) var(--zy);transform:scale(1);transition:transform 10s cubic-bezier(.3,0,.2,1)}',
    '.dk-slide.on .dk-shot{transform:scale(1.07);transition-delay:1.4s}',
    '.dk-scan{position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(transparent,rgba(106,245,176,.16),transparent);transform:translateY(-100%);pointer-events:none}',
    '.dk-slide.on .dk-scan{animation:dkScan 1.6s ' + E + ' .9s}',
    '@keyframes dkScan{to{transform:translateY(400%)}}',
    /* 짚는 표시 */
    '.dk-mark{position:absolute;width:0;height:0;z-index:2}',
    '.dk-mark .dot{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border-radius:50%;background:var(--m);box-shadow:0 0 0 4px rgba(106,245,176,.25),0 0 22px var(--m);transform:scale(0);transition:transform .6s cubic-bezier(.3,1.6,.5,1)}',
    '.dk-mark .dot:after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid var(--m);animation:dkRing 2.2s ease-out infinite}',
    '@keyframes dkRing{0%{transform:scale(1);opacity:.9}100%{transform:scale(3);opacity:0}}',
    '.dk-mark .lab{position:absolute;white-space:nowrap;padding:9px 13px;border-radius:10px;background:rgba(6,12,10,.92);border:1px solid rgba(106,245,176,.45);font-size:13.5px;font-weight:700;color:#eafff4;box-shadow:0 12px 30px -10px rgba(0,0,0,.7);opacity:0;transition:opacity .5s,transform .7s ' + E + '}',
    '.dk-mark .lab small{display:block;font:600 9.5px/1 ' + MONO + ';letter-spacing:.18em;color:var(--m);margin-bottom:5px}',
    '.dk-mark.r .lab{left:22px;top:-18px;transform:translateX(-10px)}',
    '.dk-mark.l .lab{right:22px;top:-18px;transform:translateX(10px)}',
    '.dk-mark.b .lab{left:-30px;top:20px;transform:translateY(-8px)}',
    '.dk-mark.t .lab{left:-30px;bottom:20px;transform:translateY(8px)}',
    '.dk-slide.on .dk-mark .dot{transform:scale(1);transition-delay:calc(1.5s + var(--i) * .45s)}',
    '.dk-slide.on .dk-mark .lab{opacity:1;transform:none;transition-delay:calc(1.65s + var(--i) * .45s)}',
    /* 연구 배경 장 */
    '.dk-slide.full .dk-copy{max-width:1240px;width:100%}',
    '.dk-slide.full .dk-title{font-size:clamp(30px,3.3vw,48px);margin-bottom:34px}',
    '.dk-res{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}',
    '.dk-res section{padding:20px 20px 18px;border-radius:16px;background:var(--gl);border:1px solid var(--ln);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);display:flex;flex-direction:column;gap:14px;opacity:0;transform:translateY(40px);transition:opacity .8s,transform 1.1s ' + E + '}',
    '.dk-slide.on .dk-res section{opacity:1;transform:none;transition-delay:calc(.5s + var(--i) * .14s)}',
    '.dk-res h4{margin:0;display:flex;justify-content:space-between;font:600 10.5px/1 ' + MONO + ';letter-spacing:.22em;color:var(--m)}',
    '.dk-res h4 span{letter-spacing:0;font-family:inherit;color:var(--mu)}',
    '.dk-res h5{margin:0;font-size:16.5px;line-height:1.4;font-weight:600;letter-spacing:-.02em}',
    '.dk-res .r b{display:block;font-size:30px;font-weight:300;letter-spacing:-.03em;font-variant-numeric:tabular-nums;white-space:nowrap;color:#fff}',
    '.dk-res .r p{margin:3px 0 0;font-size:12.5px;line-height:1.5;color:rgba(241,247,243,.82)}',
    '.dk-res .r cite{display:block;margin-top:4px;font-size:11px;line-height:1.4;font-style:normal;color:rgba(241,247,243,.45)}',
    '.dk-res ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}',
    '.dk-res ol li{position:relative;padding:9px 12px;border-radius:10px;background:rgba(106,245,176,.07);border:1px solid rgba(106,245,176,.14);font-size:13px;font-weight:600;opacity:0;transform:translateX(-10px);transition:all .6s ' + E + '}',
    '.dk-slide.on .dk-res ol li{opacity:1;transform:none;transition-delay:calc(1.1s + var(--i) * .16s)}',
    '.dk-res ol li small{display:block;font-weight:500;font-size:11px;color:var(--mu)}',
    '.dk-res ol li:not(:last-child):after{content:"";position:absolute;left:50%;bottom:-9px;width:1px;height:8px;background:var(--m)}',
    '.dk-res ol li:last-child{background:var(--m);color:#03140b;border-color:var(--m)}',
    '.dk-law{margin:18px 0 26px;font-size:11.5px;line-height:1.6;color:rgba(241,247,243,.42)}',
    /* 아래 넘김 막대 */
    '.dk-nav{position:absolute;left:64px;right:56px;bottom:34px;z-index:5;display:flex;align-items:center;gap:22px}',
    '.dk-steps{display:flex;gap:18px;flex:1;min-width:0}',
    '.dk-steps button{flex:1;max-width:150px;padding:12px 0 0;border:0;background:none;color:rgba(241,247,243,.4);font:600 10.5px/1.3 ' + MONO + ';letter-spacing:.14em;text-align:left;cursor:pointer;position:relative;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .3s}',
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
    '@media (max-width:1100px){.dk-slide{padding:100px 32px 110px 36px;gap:24px;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}.dk-nav{left:36px;right:32px}.dk-steps button{font-size:0}.dk-res{grid-template-columns:repeat(2,minmax(0,1fr))}.dk-mark .lab{font-size:12px;padding:7px 10px}}',
    '@media (max-width:820px){html.dk-page .topbar-inner{padding:10px 16px}.dk-slide{grid-template-columns:1fr;align-content:start;padding:118px 20px 100px;gap:22px;overflow-y:auto}.dk-win{justify-self:stretch}.dk-win-in{transform:translateY(40px)}.dk-slide.on .dk-win-in{transform:none}.dk-title{font-size:32px}.dk-body{font-size:15px}.dk-mark .lab{display:none}.dk-res{grid-template-columns:1fr}.dk-nav{left:20px;right:20px;bottom:18px;gap:12px}.dk-steps{gap:6px}.dk-arrow{width:42px;height:42px}.dk-shade{background:linear-gradient(0deg,rgba(4,9,10,.9),rgba(4,9,10,.6))}}',
    '@media (prefers-reduced-motion:reduce){.dk *,.dk *:before,.dk *:after{transition-duration:.01s !important;animation:none !important}}',
  ].join('\n');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function slideHtml(s) {
    var n = 0, fade = function (cls) { return ' class="dk-fade ' + (cls || '') + '" style="--i:' + (n++) + '"'; };
    var h = '<div class="dk-copy"><div class="dk-en"><i></i>' + esc(s.en) + '</div>';
    h += '<h2 class="dk-title">' + s.title.split('<br>').map(function (l, i) { return '<span class="dk-line"><span style="--i:' + i + '">' + l + '</span></span>'; }).join('') + '</h2>';
    if (s.body) h += '<p' + fade('dk-body') + '>' + esc(s.body) + '</p>';
    if (s.note) h += '<p' + fade('dk-note') + '>' + esc(s.note) + '</p>';
    if (s.research) {
      h += '<div class="dk-res">' + RESEARCH.map(function (c, ci) {
        var inner = c.flow ? '<ol>' + c.flow.map(function (f, k) { return '<li style="--i:' + k + '">' + f + '</li>'; }).join('') + '</ol>'
          : c.rows.map(function (r) { return '<div class="r"><b data-n="' + esc(r[0]) + '">' + esc(r[0]) + '</b><p>' + esc(r[1]) + '</p><cite>' + esc(r[2]) + '</cite></div>'; }).join('');
        return '<section style="--i:' + ci + '"><h4>' + c.h + '<span>' + c.k + '</span></h4><h5>' + esc(c.t) + '</h5>' + inner + '</section>';
      }).join('') + '</div><p class="dk-law">근거 법령 · 도시공원법 제10조의2(공원녹지정보체계: 이용자 편의증진), 같은 법 시행규칙 제9조 제3항, 서울시 도시공원 조례 제8조, 스마트도시법 제2조 제2호</p>';
    }
    if (s.cta || s.research) h += '<div' + fade('dk-cta') + '><a class="dk-btn main" href="' + TOUR + '">코스 찾기 시작 <span>↗</span></a><a class="dk-btn" href="' + MOBILE + '">폰 화면으로 보기</a></div>';
    if (s.ops) h += '<div' + fade('dk-cta') + '><a class="dk-btn" href="' + OPS + '">만족도 지도 열기 <span>↗</span></a></div>';
    h += '</div>';
    if (s.img) {
      var href = s.url.indexOf('needs/') === 0 ? BASE + s.url.slice(6) : BASE + '../' + s.url;
      h += '<div class="dk-win"><div class="dk-win-in"><div class="dk-chrome"><i></i><i></i><i></i><div class="dk-url">' + esc(HOST) + '<b>' + esc(s.url) + '</b></div><a class="dk-open" href="' + href + '">OPEN ↗</a></div>' +
        '<div class="dk-screen"><div class="dk-shot" data-src="' + IMG + s.img + V + '" style="--zx:' + s.zoom[0] + '%;--zy:' + s.zoom[1] + '%"></div>' +
        (s.marks || []).map(function (m, i) { return '<div class="dk-mark ' + m[2] + '" style="--i:' + i + ';left:' + (m[0] / 14.4) + '%;top:' + (m[1] / 9) + '%"><span class="dot"></span><span class="lab"><small>' + String(i + 1).padStart(2, '0') + '</small>' + esc(m[3]) + '</span></div>'; }).join('') +
        '<div class="dk-scan"></div></div></div></div>';
    }
    return h;
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
    var root = el('section', 'dk');
    root.setAttribute('aria-roledescription', 'carousel'); root.setAttribute('aria-label', '서울숲 코스 찾기 소개');
    var bg = el('div', 'dk-bg');
    SLIDES.forEach(function (s) { var d = el('div', s.bg === 'cover.jpg' ? 'cover' : ''); d.dataset.src = IMG + (s.bg || s.img) + V; bg.appendChild(d); });
    root.appendChild(bg); root.appendChild(el('div', 'dk-shade')); root.appendChild(el('div', 'dk-grain'));
    var track = el('div', 'dk-track');
    SLIDES.forEach(function (s, k) { var sl = el('div', 'dk-slide' + (s.research ? ' full' : ''), slideHtml(s)); sl.setAttribute('role', 'group'); sl.setAttribute('aria-label', (k + 1) + ' / ' + SLIDES.length); track.appendChild(sl); });
    root.appendChild(track);
    var nav = el('div', 'dk-nav'), steps = el('div', 'dk-steps'), count = el('div', 'dk-count');
    var prev = el('button', 'dk-arrow prev', '←'), next = el('button', 'dk-arrow next', '→');
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', '이전 장'); next.setAttribute('aria-label', '다음 장');
    SLIDES.forEach(function (s, k) { var b = el('button', '', esc(k === 0 ? 'INTRO' : s.en.replace(/^\d+ · /, ''))); b.type = 'button'; b.onclick = function () { go(k); }; steps.appendChild(b); });
    nav.appendChild(steps); nav.appendChild(count); nav.appendChild(prev); nav.appendChild(next);
    root.appendChild(nav);
    document.body.appendChild(root);
    document.documentElement.classList.add('dk-page');
    dk = root;

    function load(k) {
      if (k < 0 || k >= SLIDES.length) return;
      var b = bg.children[k]; if (b.dataset.src) { b.style.backgroundImage = 'url("' + b.dataset.src + '")'; delete b.dataset.src; }
      var s = track.children[k].querySelector('.dk-shot[data-src]'); if (s) { s.style.backgroundImage = 'url("' + s.dataset.src + '")'; delete s.dataset.src; }
    }
    var cur = -1, busy = 0;
    function go(k) {
      k = Math.max(0, Math.min(SLIDES.length - 1, k));
      if (k === cur) return;
      cur = k;
      load(k); load(k + 1);
      Array.prototype.forEach.call(track.children, function (c, j) { if (j === k) { c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); } else c.classList.remove('on'); });
      Array.prototype.forEach.call(bg.children, function (c, j) { c.classList.toggle('on', j === k); });
      Array.prototype.forEach.call(steps.children, function (c, j) { c.classList.toggle('on', j === k); c.classList.toggle('done', j < k); });
      count.innerHTML = '<b>' + String(k + 1).padStart(2, '0') + '</b> / ' + String(SLIDES.length).padStart(2, '0');
      prev.disabled = k === 0; next.disabled = k === SLIDES.length - 1;
      if (SLIDES[k].research) countUp(track.children[k]);
    }
    function step(d) { var now = Date.now(); if (now - busy < 450) return; busy = now; go(cur + d); }
    prev.onclick = function () { step(-1); };
    next.onclick = function () { step(1); };
    root._key = function (e) {
      if (!root.isConnected) return;
      if (/INPUT|TEXTAREA|SELECT|BUTTON/.test((document.activeElement || {}).tagName || '') && e.key === ' ') return;
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { step(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { step(-1); e.preventDefault(); }
    };
    document.addEventListener('keydown', root._key);
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
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(d) < 14) return;
      e.preventDefault();
      var now = Date.now(); if (now - wheelAt < 900) return; wheelAt = now;
      step(d > 0 ? 1 : -1);
    }, { passive: false });
    go(0);
  }
  function teardown() {
    if (!dk) return;
    document.removeEventListener('keydown', dk._key);
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
