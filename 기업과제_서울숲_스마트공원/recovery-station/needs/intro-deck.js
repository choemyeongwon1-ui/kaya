// 소개 탭: 이용자에게 '서울숲 코스 찾기'를 소개하는 가로 넘김 7장.
// 장마다 오른쪽 폰 틀에 실제 이용자 화면(tour.html?preview=1)을 띄우고, 그 장의 장면(코스·날씨·평가·영수증)까지 저절로 눌러서 보여 줍니다.
// 미리보기에서 누른 표정은 통계로 보내지 않습니다(review.js의 preview 처리). 마지막 장만 연구 배경을 한 장으로 요약합니다.
// 기존 소개(현황·문제·전략·근거)는 숨기기만 하고 지우지 않습니다.
(function () {
  'use strict';
  var BASE = ((document.currentScript || {}).src || '').replace(/[^/]*$/, '');
  var TOUR = BASE + 'tour.html';
  var MOBILE = BASE + '../mobile.html';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var COURSE = /\d곳 · \d+분/;
  var SLIDES = [
    { key: 'home', kicker: '서울숲 산책 안내', title: '오늘 서울숲,<br><em>어디로 걸을까요?</em>',
      body: '지금 날씨와 붐비는 정도를 보고, 나에게 맞는 산책 코스를 지도에 그려 드려요. 설치도 가입도 없이 링크 하나로 열려요.',
      cta: true, scene: { steps: [] } },
    { key: 'pick', kicker: '01 · 고르기', title: '세 번만 고르면<br><em>코스가 나와요</em>',
      items: [['🌿', '하고 싶은 것', '쉬기 · 걷기 · 놀기 · 운동 · 구경 · 피크닉'], ['👥', '같이 온 사람', '혼자 · 연인 · 친구 · 아이 · 어르신 · 반려견'], ['⏱', '머물 시간', '30분부터 3시간 이상까지']],
      note: '고르기 어려우면 추천 코스를 바로 눌러도 돼요.', scene: { steps: [COURSE] } },
    { key: 'weather', kicker: '02 · 날씨에 맞춰', title: '더운 날엔 그늘로,<br><em>비 오면 실내로</em>',
      items: [['☀️', '더운 날', '나무 그늘과 물가를 지나는 길로'], ['🌧', '비·미세먼지·추운 날', '곤충식물원·나비정원 같은 실내를 먼저'], ['👣', '붐빌 때', '한산한 곳과 덜 붐비는 시간을 알려 줘요'], ['♿', '아이·어르신과', '계단 없는 길로']],
      wx: true, note: '아래 날씨를 눌러 화면이 어떻게 바뀌는지 보세요.', scene: { wx: 'heat', steps: [], focus: '.tr-status-slot' } },
    { key: 'rate', kicker: '03 · 걸으며', title: '도착하면<br><em>표정 하나만 눌러 주세요</em>',
      items: [['😊', '좋으면', '그대로 다음 곳으로 이어 가요'], ['😞', '아쉬우면', '까닭(붐빔·더위·쉴 곳)을 고르면 남은 코스를 바로 바꿔요'], ['🌳', '가는 길에', '정원 이야기와 「이 나무 뭐지?」로 나무 이름도']],
      note: '표정은 이름·위치 없이 공원 길과 쉼터를 고치는 데만 써요.', scene: { steps: [COURSE, /^출발/, /^도착 화면 보기/] } },
    { key: 'end', kicker: '04 · 마치면', title: '산책 영수증 받고,<br><em>카페 쿠폰도 챙기세요</em>',
      items: [['🧾', '오늘 산책 영수증', '걸은 길·시간·칼로리가 찍힌 한 장'], ['📍', '영수증 기계 12곳', '공원 곳곳에, 가장 가까운 곳으로 길 안내'], ['☕', '카페 할인 쿠폰', '표정을 남기면 영수증과 함께. 어떤 표정이든 똑같이']],
      note: '영수증 기계와 카페 쿠폰은 우리 팀이 제안하는 운영 방식이에요.', scene: { steps: [COURSE, /^출발/, /^도착 화면 보기/, /^여기서 산책 마치기/], focus: '.tr-exit' } },
    { key: 'go', kicker: '시작하기', title: '지금 바로<br><em>걸어 볼까요?</em>',
      body: '서울숲 입구에서 링크를 열면 내 위치에서 시작해요. 집에서 미리 코스를 둘러봐도 좋아요.',
      cta: true, scene: { steps: [] } },
    { key: 'why', kicker: '우리가 이걸 만든 이유', title: '처음 온 사람도, 한여름에도<br><em>서울숲에 오래 머물도록</em>', research: true },
  ];

  var RESEARCH = [
    { h: '현황', t: '서울 전역에서 찾아오는 공원', rows: [['73.4%', '동네 밖에서 온 방문객', '서울시 실시간 인구데이터(2026-11-19)'], ['1위', '서울 직영 공원 26곳 중 온라인 언급 비중 33.7%', '서울AI재단(2026)']] },
    { h: '문제', t: '정보는 부족하고, 여름엔 발길이 끊겨요', rows: [['40.2%', '처음 온 방문객. 안내 시설로 정보를 얻는 경우는 드묾', '주신하·김영희(2010)'], ['−48.6%', '서울숲역 낮 하차 5월 8,864명 → 8월 4,557명', '서울 열린데이터광장 OA-12252(2026)']] },
    { h: '해결', t: '추천과 평가가 한 바퀴로 이어져요', flow: ['날씨·붐빔·동행', '그늘·한산한 길 찾기<small>가장 짧은 길의 1.2배까지</small>', '맞춤 코스', '장소별 표정 평가', '다음 추천에 반영'] },
    { h: '근거', t: '선행연구 값을 기준으로', rows: [['5.5~7.4℃', '33℃ 넘는 시간, 공원 안이 밖 도로보다 시원', '조현민·권태경(2022)'], ['12%', '조용하고 보기 좋은 길이 더 길어도 더 선호', 'Quercia 외(2014)'], ['IPA', '편의시설: 중요도는 높고 만족은 낮음', '이지연(2012)']] },
  ];

  var css = [
    '.hm.dk-on > :not(.dk){display:none !important}',
    '.dk{--dk-mint:#6af5b0;--dk-ink:#f1f7f3;--dk-mute:rgba(241,247,243,.58);--dk-line:rgba(255,255,255,.09);--dk-glass:rgba(10,18,14,.6);',
    '  position:relative;overflow:hidden;border-radius:28px;color:var(--dk-ink);font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;',
    '  background:radial-gradient(90% 80% at 85% 10%,rgba(106,245,176,.10),transparent 60%),radial-gradient(70% 70% at 0% 100%,rgba(106,245,176,.06),transparent 60%),linear-gradient(160deg,#07120d 0%,#0b1d15 55%,#10281c 100%);',
    '  box-shadow:0 30px 80px -30px rgba(5,20,12,.55);isolation:isolate;touch-action:pan-y;user-select:none}',
    '.dk-topo{position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.9}',
    '.dk-topo path{fill:none;stroke:rgba(106,245,176,.05);stroke-width:1}',
    '.dk-track{display:flex;height:100%;transition:transform .7s cubic-bezier(.16,1,.3,1);will-change:transform}',
    '.dk.drag .dk-track{transition:none}',
    '.dk-slide{flex:0 0 100%;height:100%;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);align-items:center;gap:40px;padding:56px 72px 92px;box-sizing:border-box}',
    '.dk-slide.full{grid-template-columns:1fr;align-content:center}',
    '.dk-copy{max-width:560px}',
    '.dk-kicker{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;letter-spacing:.06em;color:var(--dk-mint);margin-bottom:18px}',
    '.dk-kicker:before{content:"";width:22px;height:1.5px;background:currentColor;opacity:.7}',
    '.dk-title{margin:0 0 20px;font-size:clamp(32px,4.1vw,56px);line-height:1.13;letter-spacing:-.045em;font-weight:750}',
    '.dk-title em{font-style:normal;color:var(--dk-mint)}',
    '.dk-body{margin:0 0 28px;font-size:17px;line-height:1.65;color:var(--dk-mute)}',
    '.dk-items{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:10px}',
    '.dk-items li{display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:16px;background:var(--dk-glass);border:1px solid var(--dk-line);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}',
    '.dk-items li span{flex:none;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:19px;background:rgba(106,245,176,.08)}',
    '.dk-items li b{display:block;font-size:15.5px;margin-bottom:2px}',
    '.dk-items li small{font-size:13.5px;color:var(--dk-mute);line-height:1.45}',
    '.dk-note{font-size:13px;color:var(--dk-mute);margin:0}',
    '.dk-cta{display:flex;flex-wrap:wrap;gap:10px}',
    '.dk-btn{display:inline-flex;align-items:center;gap:10px;padding:15px 22px;border-radius:999px;font:700 15.5px/1 inherit;text-decoration:none;cursor:pointer;border:1px solid var(--dk-line);background:rgba(255,255,255,.05);color:var(--dk-ink);transition:transform .2s,background .2s}',
    '.dk-btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.09)}',
    '.dk-btn.main{background:var(--dk-mint);border-color:var(--dk-mint);color:#03140b;box-shadow:0 0 0 6px rgba(106,245,176,.12),0 10px 30px -10px rgba(106,245,176,.6)}',
    '.dk-btn.main:hover{background:#86f8c0}',
    '.dk-wx{display:flex;gap:8px;margin:0 0 14px;flex-wrap:wrap}',
    '.dk-wx button{padding:9px 15px;border-radius:999px;border:1px solid var(--dk-line);background:rgba(255,255,255,.04);color:var(--dk-ink);font:600 13.5px/1 inherit;cursor:pointer}',
    '.dk-wx button.on{background:var(--dk-mint);border-color:var(--dk-mint);color:#03140b}',
    /* 폰 틀(장마다 하나씩 두지 않고 한 개를 오른쪽에 고정) */
    '.dk-phone{position:absolute;top:50%;right:9%;transform:translateY(-54%);z-index:2;transition:opacity .45s,transform .7s cubic-bezier(.16,1,.3,1)}',
    '.dk-phone.off{opacity:0;pointer-events:none;transform:translate(40px,-54%)}',
    '.dk-phone-in{position:relative;width:375px;height:780px;border-radius:52px;padding:12px;background:#0b0f0d;box-shadow:0 0 0 1.5px rgba(255,255,255,.12),0 40px 90px -30px rgba(0,0,0,.8),0 0 120px -40px rgba(106,245,176,.35);transform-origin:center;box-sizing:border-box}',
        '.dk-phone iframe{width:100%;height:100%;border:0;border-radius:41px;background:#050b08;display:block}',
    '.dk-load{position:absolute;inset:12px;border-radius:41px;display:grid;place-items:center;background:#050b08;color:var(--dk-mute);font-size:13px;transition:opacity .4s;z-index:2;pointer-events:none}',
    '.dk-load i{display:block;width:26px;height:26px;margin:0 auto 10px;border-radius:50%;border:2px solid rgba(106,245,176,.2);border-top-color:var(--dk-mint);animation:dkSpin 1s linear infinite}',
    '.dk-load.off{opacity:0}',
    '@keyframes dkSpin{to{transform:rotate(360deg)}}',
    '.dk-live{position:absolute;left:50%;top:-30px;transform:translateX(-50%);font-size:12px;color:var(--dk-mute);white-space:nowrap}',
    '.dk-live b{color:var(--dk-mint)}',
    /* 넘기기 */
    '.dk-nav{position:absolute;left:72px;right:72px;bottom:30px;display:flex;align-items:center;gap:18px;z-index:3}',
    '.dk-dots{display:flex;gap:6px;flex:1}',
    '.dk-dots button{flex:0 0 auto;width:28px;height:4px;padding:0;border:0;border-radius:4px;background:rgba(255,255,255,.16);cursor:pointer;transition:width .4s,background .3s}',
    '.dk-dots button.on{width:56px;background:var(--dk-mint)}',
    '.dk-count{white-space:nowrap;font-size:13px;font-variant-numeric:tabular-nums;color:var(--dk-mute)}',
    '.dk-count b{color:var(--dk-ink)}',
    '.dk-arrow{width:46px;height:46px;border-radius:50%;border:1px solid var(--dk-line);background:rgba(255,255,255,.05);color:var(--dk-ink);font-size:18px;cursor:pointer;display:grid;place-items:center;transition:background .2s,opacity .2s}',
    '.dk-arrow:hover{background:rgba(255,255,255,.12)}',
    '.dk-arrow:disabled{opacity:.3;cursor:default}',
    '.dk-arrow.next:not(:disabled){background:var(--dk-mint);border-color:var(--dk-mint);color:#03140b}',
    /* 마지막 장: 연구 배경 한 장 */
    '.dk-slide.full .dk-copy{max-width:1180px;width:100%}',
    '.dk-slide.full{padding-top:40px;padding-bottom:100px}',
    '.dk-slide.full .dk-title{font-size:clamp(28px,3.2vw,44px);margin-bottom:22px}',
    '.dk-res{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:6px}',
    '.dk-res section{padding:18px 18px 16px;border-radius:18px;background:var(--dk-glass);border:1px solid var(--dk-line);display:flex;flex-direction:column;gap:12px}',
    '.dk-res h4{margin:0;font-size:12px;letter-spacing:.08em;color:var(--dk-mint)}',
    '.dk-res h5{margin:0;font-size:16px;line-height:1.35;letter-spacing:-.02em}',
    '.dk-res .r b{display:block;font-size:26px;white-space:nowrap;letter-spacing:-.03em;font-variant-numeric:tabular-nums}',
    '.dk-res .r p{margin:2px 0 0;font-size:12.5px;line-height:1.45;color:var(--dk-ink);opacity:.85}',
    '.dk-res .r cite{display:block;margin-top:3px;font-style:normal;font-size:11px;color:var(--dk-mute)}',
    '.dk-res ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}',
    '.dk-res ol li{position:relative;padding:8px 10px;border-radius:10px;background:rgba(106,245,176,.07);font-size:13px;font-weight:600}',
    '.dk-res ol li small{display:block;font-weight:500;font-size:11px;color:var(--dk-mute)}',
    '.dk-res ol li:not(:last-child):after{content:"↓";position:absolute;left:50%;bottom:-11px;font-size:10px;color:var(--dk-mint);transform:translateX(-50%)}',
    '.dk-res ol li:last-child{background:var(--dk-mint);color:#03140b}',
    '.dk-law{margin:16px 0 0;font-size:11.5px;color:var(--dk-mute);line-height:1.5}',
    /* 등장 */
    '.dk-slide .dk-copy > *{opacity:0;transform:translateY(14px);transition:opacity .6s,transform .7s cubic-bezier(.16,1,.3,1)}',
    '.dk-slide.on .dk-copy > *{opacity:1;transform:none}',
    '.dk-slide.on .dk-copy > *:nth-child(2){transition-delay:.06s}.dk-slide.on .dk-copy > *:nth-child(3){transition-delay:.12s}.dk-slide.on .dk-copy > *:nth-child(4){transition-delay:.18s}.dk-slide.on .dk-copy > *:nth-child(5){transition-delay:.24s}',
    '@media (max-width:1100px){.dk-slide{padding:44px 40px 88px;gap:24px}.dk-phone{right:4%}.dk-nav{left:40px;right:40px}.dk-res{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@media (max-width:820px){.dk{border-radius:22px}.dk-slide{grid-template-columns:1fr;padding:30px 22px 86px;align-content:start;overflow-y:auto}.dk-phone{display:none}.dk-nav{left:22px;right:22px;bottom:22px}.dk-title{font-size:32px}.dk-body{font-size:15.5px}.dk-res{grid-template-columns:1fr}.dk-nav{gap:10px}.dk-dots{gap:4px;min-width:0}.dk-dots button{width:12px}.dk-dots button.on{width:26px}.dk-count{white-space:nowrap;font-size:12px}.dk-arrow{width:40px;height:40px;flex:none}}',
    '@media (prefers-reduced-motion:reduce){.dk-track,.dk-slide .dk-copy > *{transition:none}}',
  ].join('\n');

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function topo() {
    var p = '';
    for (var i = 0; i < 14; i++) {
      var y = 40 + i * 52, a = 18 + (i % 4) * 8;
      p += '<path d="M-20 ' + y + ' C 260 ' + (y - a) + ', 520 ' + (y + a * 1.4) + ', 820 ' + (y - a * .6) + ' S 1300 ' + (y + a) + ', 1620 ' + (y - a * .4) + '"/>';
    }
    return '<svg viewBox="0 0 1600 760" preserveAspectRatio="none">' + p + '</svg>';
  }

  function slideHtml(s) {
    var h = '<div class="dk-copy"><div class="dk-kicker">' + esc(s.kicker) + '</div><h2 class="dk-title">' + s.title + '</h2>';
    if (s.body) h += '<p class="dk-body">' + esc(s.body) + '</p>';
    if (s.items) h += '<ul class="dk-items">' + s.items.map(function (x) { return '<li><span>' + x[0] + '</span><div><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></div></li>'; }).join('') + '</ul>';
    if (s.wx) h += '<div class="dk-wx">' + [['heat', '☀️ 폭염'], ['dust', '😷 미세먼지'], ['rain', '🌧 호우'], ['cold', '🥶 한파']].map(function (w, i) { return '<button type="button" data-wx="' + w[0] + '"' + (i ? '' : ' class="on"') + '>' + w[1] + '</button>'; }).join('') + '</div>';
    if (s.note) h += '<p class="dk-note">' + esc(s.note) + '</p>';
    if (s.cta) h += '<div class="dk-cta"><a class="dk-btn main" href="' + TOUR + '">코스 찾기 시작 <span>→</span></a><a class="dk-btn" href="' + MOBILE + '">폰 화면으로 보기</a></div>';
    if (s.research) {
      h += '<div class="dk-res">' + RESEARCH.map(function (c) {
        var inner = c.flow ? '<ol>' + c.flow.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ol>'
          : c.rows.map(function (r) { return '<div class="r"><b>' + esc(r[0]) + '</b><p>' + esc(r[1]) + '</p><cite>' + esc(r[2]) + '</cite></div>'; }).join('');
        return '<section><h4>' + esc(c.h) + '</h4><h5>' + esc(c.t) + '</h5>' + inner + '</section>';
      }).join('') + '</div><p class="dk-law">근거 법령 · 도시공원법 제10조의2(공원녹지정보체계: 이용자 편의증진), 같은 법 시행규칙 제9조 제3항, 서울시 도시공원 조례 제8조, 스마트도시법 제2조 제2호</p>';
    }
    return h + '</div>';
  }

  // ── 폰 미리보기: 장면마다 tour.html을 새로 열고, 버튼을 차례로 눌러 그 장면까지 데려감 ──
  function Phone(root) {
    var wrap = el('div', 'dk-phone off'), inner = el('div', 'dk-phone-in'), frame = document.createElement('iframe'), load = el('div', 'dk-load', '<div><i></i>화면 불러오는 중</div>');
    frame.title = '서울숲 코스 찾기 미리보기'; frame.loading = 'lazy'; frame.setAttribute('allow', 'geolocation');
    inner.appendChild(frame); inner.appendChild(load); wrap.appendChild(inner);
    wrap.appendChild(el('div', 'dk-live', '<b>●</b> 실제 화면이에요 · 눌러 보세요'));
    root.appendChild(wrap);
    var token = 0, curUrl = '';
    function fit() {
      var H = root.clientHeight - 120, W = root.clientWidth * .42;
      var k = Math.max(.5, Math.min(1, H / 780, W / 375));
      inner.style.transform = 'scale(' + k + ')';
      wrap.style.width = 375 * k + 'px'; wrap.style.height = 780 * k + 'px';
      inner.style.position = 'absolute'; inner.style.left = (375 * k - 375) / 2 + 'px'; inner.style.top = (780 * k - 780) / 2 + 'px';
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function btns(doc) { return Array.prototype.filter.call(doc.querySelectorAll('#tour button, #tour a'), function (b) { return b.offsetParent && !b.disabled; }); }
    async function play(scene) {
      var my = ++token;
      var url = TOUR + '?preview=1' + (scene.wx ? '&wx=' + scene.wx : '');
      load.classList.remove('off');
      if (url !== curUrl || scene.steps.length || scene.reload) {
        curUrl = url;
        frame.src = url + '&t=' + my;
        await new Promise(function (r) { frame.onload = r; setTimeout(r, 12000); });
      }
      if (my !== token) return;
      var win = frame.contentWindow, doc;
      for (var i = 0; i < 60 && my === token; i++) { try { doc = frame.contentDocument; if (win.__tour && btns(doc).length > 4) break; } catch (e) { return done(); } await sleep(200); }
      for (var s = 0; s < scene.steps.length && my === token; s++) {
        var re = scene.steps[s], b = null;
        for (var j = 0; j < 40 && my === token; j++) { b = btns(doc).find(function (x) { return re.test(x.innerText.trim()); }); if (b) break; await sleep(200); }
        if (!b) break;
        b.click();
        await sleep(s === scene.steps.length - 1 ? 900 : 1100);
      }
      if (my !== token) return;
      if (scene.focus) { await sleep(900); var f = null; for (var q = 0; q < 20 && my === token && !(f = doc.querySelector(scene.focus)); q++) await sleep(200); if (f && my === token) { var sc = f.parentElement; while (sc && sc !== doc.body && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement; if (sc && sc !== doc.body) { var top = f.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 12; sc.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' }); } } }   // 부모 페이지는 움직이지 않게 iframe 안의 스크롤 칸만 내림
      done();
      function done() { if (my === token) load.classList.add('off'); }
    }
    return {
      fit: fit,
      show: function (on) { wrap.classList.toggle('off', !on); },
      visible: function () { return getComputedStyle(wrap).display !== 'none'; },
      play: function (scene) { if (!frame.src) { /* 처음 */ } play(scene).catch(function () { load.classList.add('off'); }); },
    };
  }

  function build(hm) {
    if (hm.querySelector(':scope > .dk')) return;
    var dk = el('section', 'dk');
    dk.setAttribute('aria-roledescription', 'carousel'); dk.setAttribute('aria-label', '서울숲 코스 찾기 소개');
    dk.appendChild(el('div', 'dk-topo', topo()));
    var track = el('div', 'dk-track');
    SLIDES.forEach(function (s, i) {
      var sl = el('div', 'dk-slide' + (s.research ? ' full' : ''), slideHtml(s));
      sl.setAttribute('role', 'group'); sl.setAttribute('aria-label', (i + 1) + ' / ' + SLIDES.length);
      track.appendChild(sl);
    });
    dk.appendChild(track);
    var nav = el('div', 'dk-nav');
    var prev = el('button', 'dk-arrow prev', '←'), next = el('button', 'dk-arrow next', '→'), dots = el('div', 'dk-dots'), count = el('div', 'dk-count');
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', '이전 장'); next.setAttribute('aria-label', '다음 장');
    SLIDES.forEach(function (s, i) { var d = el('button'); d.type = 'button'; d.setAttribute('aria-label', (i + 1) + '장 · ' + s.kicker); d.onclick = function () { go(i); }; dots.appendChild(d); });
    nav.appendChild(dots); nav.appendChild(count); nav.appendChild(prev); nav.appendChild(next);
    dk.appendChild(nav);
    hm.insertBefore(dk, hm.firstChild);
    hm.classList.add('dk-on');

    var phone = Phone(dk), cur = -1, playT = null;
    function size() {
      var top = dk.getBoundingClientRect().top + window.scrollY;
      var vh = window.innerHeight;
      dk.style.height = Math.max(560, vh - Math.max(0, top) - 24) + 'px';
      phone.fit();
    }
    function go(i) {
      i = Math.max(0, Math.min(SLIDES.length - 1, i));
      if (i === cur) return;
      cur = i;
      track.style.transform = 'translateX(' + (-100 * i) + '%)';
      Array.prototype.forEach.call(track.children, function (c, k) { c.classList.toggle('on', k === i); });
      Array.prototype.forEach.call(dots.children, function (c, k) { c.classList.toggle('on', k === i); });
      count.innerHTML = '<b>' + String(i + 1).padStart(2, '0') + '</b> / ' + String(SLIDES.length).padStart(2, '0');
      prev.disabled = i === 0; next.disabled = i === SLIDES.length - 1;
      var s = SLIDES[i];
      phone.show(!!s.scene);
      clearTimeout(playT);
      if (s.scene && phone.visible()) playT = setTimeout(function () { phone.play(s.scene); }, 350);   // 휙휙 넘길 때는 마지막 장만 불러옴
    }
    prev.onclick = function () { go(cur - 1); };
    next.onclick = function () { go(cur + 1); };
    // 날씨 고르기(3장)
    dk.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.dk-wx button');
      if (!b) return;
      Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.toggle('on', x === b); });
      phone.play({ wx: b.dataset.wx, steps: [], focus: '.tr-status-slot' });
    });
    // 키보드 ← →
    document.addEventListener('keydown', function (e) {
      if (!document.body.contains(dk) || !hm.classList.contains('dk-on') || dk.offsetParent === null) return;
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { go(cur + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(cur - 1); e.preventDefault(); }
    });
    // 끌어서 넘기기(마우스·터치)
    var sx = null, sy = 0, dx = 0, lock = null;
    dk.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('a,button,iframe,.dk-phone')) return;
      sx = e.clientX; sy = e.clientY; dx = 0; lock = null;
    });
    window.addEventListener('pointermove', function (e) {
      if (sx == null) return;
      var x = e.clientX - sx, y = e.clientY - sy;
      if (lock == null && (Math.abs(x) > 8 || Math.abs(y) > 8)) lock = Math.abs(x) > Math.abs(y) ? 'x' : 'y';
      if (lock !== 'x') return;
      dx = x; dk.classList.add('drag');
      track.style.transform = 'translateX(calc(' + (-100 * cur) + '% + ' + dx + 'px))';
    });
    window.addEventListener('pointerup', function () {
      if (sx == null) return;
      dk.classList.remove('drag');
      var w = dk.clientWidth, was = cur;
      if (lock === 'x' && Math.abs(dx) > w * .12) { cur = -1; go(was + (dx < 0 ? 1 : -1)); }
      else track.style.transform = 'translateX(' + (-100 * cur) + '%)';
      sx = null;
    });
    // 트랙패드 가로 밀기 / 휠
    var wheelAt = 0;
    dk.addEventListener('wheel', function (e) {
      if (e.target.closest('.dk-phone')) return;
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
      if (!d || Math.abs(d) < 18) return;
      e.preventDefault();
      var now = Date.now(); if (now - wheelAt < 700) return; wheelAt = now;
      go(cur + (d > 0 ? 1 : -1));
    }, { passive: false });
    window.addEventListener('resize', size);
    size();
    go(0);
    setTimeout(size, 300);
  }

  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  function scan() { var hm = document.querySelector('.hm'); if (hm) build(hm); }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') scan(); else document.addEventListener('DOMContentLoaded', scan);
})();
