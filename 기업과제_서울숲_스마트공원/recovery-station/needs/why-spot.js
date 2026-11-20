// 소개 화면 「이론적 근거 · 선행연구 기반 기준 설정」의 카드 5장을 하나씩 짚어 설명합니다.
// - 화면에 들어오면 카드가 차례로 커지고(나머지는 흐려짐), 아래 설명판에 움직이는 그림과 풀어 쓴 설명이 나옵니다.
// - 카드를 누르면 그 카드로 바로 가고 자동 넘김은 멈춥니다(▶로 다시 재생). 마우스를 올려도 잠깐 멈춥니다.
// - 휴대폰 폭에서는 카드를 옆으로 넘기는 띠로 바뀌고, 설명판은 그 아래에 그대로 있습니다.
// - '움직임 줄이기' 설정이면 자동 넘김과 그림 움직임을 끄고, 누를 때만 바뀝니다.
// - 빌드된 묶음 파일(assets/index-*.js)은 건드리지 않습니다. 되돌리려면 이 파일과 index.html의 why-spot.js 줄을 빼면 됩니다.
// - 그림은 이해를 돕는 모식도이며, 그림 안 숫자는 카드에 적힌 값(출처: 각 카드의 문헌)만 씁니다.
(function () {
  'use strict';
  var DUR = 7000;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var mqMobile = window.matchMedia ? matchMedia('(max-width: 640px)') : { matches: false, addEventListener: function () {} };

  // 카드 출처 글자로 짝을 맞춥니다(카드 순서가 바뀌어도 맞도록)
  var INFO = [
    { key: '조현민', title: '더운 날엔 그늘·물가 길을 먼저',
      body: '기온이 33℃를 넘는 시간에 서울숲 안은 공원 밖 도로보다 5.5~7.4℃ 낮았다(서울숲 실측). 숲과 물이 더위를 덜어 준다는 뜻이다.',
      use: '더운 날에는 그늘과 물가를 지나는 길을 코스에 먼저 넣는다.', vis: visHeat },
    { key: 'Quercia', title: '조금 돌아가도 좋지만, 1.2배까지만',
      body: '조용하고 보기 좋은 길은 가장 짧은 길보다 평균 12% 정도만 길었는데, 사람들은 그 길을 더 좋아했다. 조금만 돌아가도 충분히 좋은 길을 얻는다는 뜻이다.',
      use: '그늘·한산한 길로 안내하되 가장 짧은 길의 1.2배까지만 돌아간다 (500m → 최대 600m).',
      steps: ['1.2배 안에서 그늘·한산한 길을 찾는다', '그보다 길어지면 그늘 조건을 약하게 해서 다시 찾는다', '그래도 길면 가장 짧은 길로 안내한다'],
      vis: visRoute },
    { key: '김주미', title: '머물 시간은 네 가지로 고른다',
      body: '서울숲 현장 면접 200명 가운데 38.5%가 30분~1시간 30분을 머물러 가장 많았다. 짧게 들르는 사람부터 오래 머무는 사람까지 있다.',
      use: '머물 시간 선택지를 30분 · 1시간 · 2시간 · 3시간 이상으로 나눴다.', vis: visStay },
    { key: '이지연', title: '중요한데 불만인 것부터 고친다',
      body: '중요도-만족도 분석(IPA)에서 서울숲 이용자는 편의시설을 중요하게 보지만 만족은 낮았다. 이 칸이 가장 먼저 고칠 곳이다.',
      use: '‘쉴 곳·화장실 부족’ 평가를 코스 점수에 크게 반영한다.', vis: visIpa },
    { key: 'Arnberger', title: '붐비면 다른 길, 다른 시간으로',
      body: '붐빈다고 느끼면 이용자는 다른 장소나 다른 시간으로 옮기려 한다.',
      use: '붐빌 때는 한산한 길과 덜 붐비는 시간을 함께 안내한다.', vis: visAvoid },
  ];

  // ---------- 그림(모식도) ----------
  function svg(inner, label) {
    return '<svg viewBox="0 0 300 200" role="img" aria-label="' + label + '">' + inner + '</svg>';
  }
  function visHeat() {
    return svg(
      '<line class="ws-ax" x1="20" x2="230" y1="46" y2="46"/>' +
      '<text class="ws-t ws-fade" style="--d:.2s" x="20" y="36">33℃ 넘는 시간</text>' +
      '<rect class="ws-track" x="52" y="40" width="46" height="132" rx="23"/>' +
      '<rect class="ws-grow hot" style="--d:.15s" x="56" y="46" width="38" height="122" rx="19"/>' +
      '<rect class="ws-track" x="132" y="40" width="46" height="132" rx="23"/>' +
      '<rect class="ws-grow cool" style="--d:.45s" x="136" y="98" width="38" height="70" rx="19"/>' +
      '<line class="ws-ax ws-fade" style="--d:1s" x1="178" x2="208" y1="98" y2="98"/>' +
      '<path class="ws-br ws-fade" style="--d:1.1s" d="M214 49v46M209 54l5-6 5 6M209 90l5 6 5-6"/>' +
      '<text class="ws-big ws-pop" style="--d:1.3s" x="226" y="70">−5.5</text>' +
      '<text class="ws-big ws-pop" style="--d:1.4s" x="226" y="96">~7.4℃</text>' +
      '<text class="ws-t c" x="75" y="192">공원 밖 도로</text>' +
      '<text class="ws-t c b" x="155" y="192">서울숲 안</text>',
      '공원 밖 도로보다 서울숲 안이 5.5~7.4도 낮음');
  }
  function visRoute() {
    var trees = [[78, 34], [112, 20], [150, 15], [188, 20], [222, 34]].map(function (p, i) {
      return '<circle class="ws-tree ws-pop" style="--d:' + (0.9 + i * 0.08) + 's" cx="' + p[0] + '" cy="' + p[1] + '" r="9"/>';
    }).join('');
    return svg(
      trees +
      '<path class="ws-draw dim" style="--d:.1s" pathLength="1" d="M40 72H260"/>' +
      '<path class="ws-draw" style="--d:.7s" pathLength="1" d="M40 72C80 22 220 22 260 72"/>' +
      '<circle class="ws-node" cx="40" cy="72" r="6"/><circle class="ws-node" cx="260" cy="72" r="6"/>' +
      row(110, '가장 짧은 길', 100, '1.0', '.2s', 'dim') +
      row(140, '더 좋게 평가된 길', 112, '약 1.12', '.9s', '') +
      row(170, '추천 허용 한도', 120, '1.2배', '1.5s', 'cap'),
      '가장 짧은 길 1.0, 좋게 평가된 길 약 1.12, 추천 한도 1.2배');
    function row(y, label, v, txt, d, cls) {
      var w = v * 1.25;
      return '<text class="ws-t" x="20" y="' + (y + 5) + '">' + label + '</text>' +
        '<rect class="ws-bar ' + cls + '" style="--d:' + d + '" x="112" y="' + (y - 8) + '" width="' + w + '" height="16" rx="8"/>' +
        '<text class="ws-t b ws-fade" style="--d:' + d + '" x="' + (118 + w) + '" y="' + (y + 5) + '">' + txt + '</text>';
    }
  }
  function visStay() {
    var chips = ['30분', '1시간', '2시간', '3시간 이상'], x = 18;
    var chipSvg = chips.map(function (c, i) {
      var w = c.length > 3 ? 78 : 56, s = '<g class="ws-pop" style="--d:' + (1.3 + i * 0.12) + 's"><rect class="ws-chip" x="' + x + '" y="166" width="' + w + '" height="26" rx="13"/>' +
        '<text class="ws-t c b" x="' + (x + w / 2) + '" y="183">' + c + '</text></g>';
      x += w + 8; return s;
    }).join('');
    return svg(
      '<circle class="ws-ring-bg" cx="78" cy="80" r="54"/>' +
      '<circle class="ws-ring" pathLength="100" cx="78" cy="80" r="54" transform="rotate(-90 78 80)"/>' +
      '<text class="ws-big c" x="78" y="88">38.5%</text>' +
      '<text class="ws-t b ws-fade" style="--d:.9s" x="152" y="66">30분~1시간 30분</text>' +
      '<text class="ws-t ws-fade" style="--d:1s" x="152" y="88">가장 많이 머문 시간</text>' +
      '<text class="ws-t m ws-fade" style="--d:1.1s" x="152" y="108">현장 면접 200명</text>' +
      chipSvg,
      '이용자 38.5%가 30분에서 1시간 30분 머묾, 머물 시간 선택지 4개');
  }
  function visIpa() {
    return svg(
      '<rect class="ws-quad ws-fade" style="--d:.6s" x="46" y="12" width="120" height="76"/>' +
      '<rect class="ws-frame" x="46" y="12" width="240" height="152"/>' +
      '<line class="ws-ax" x1="166" x2="166" y1="12" y2="164"/><line class="ws-ax" x1="46" x2="286" y1="88" y2="88"/>' +
      '<text class="ws-t b q" x="106" y="32">먼저 고칠 곳</text>' +
      '<text class="ws-t m q" x="226" y="32">잘하는 곳</text>' +
      '<text class="ws-t m q" x="106" y="156">뒤로 미룸</text>' +
      '<text class="ws-t m q" x="226" y="156">충분함</text>' +
      '<text class="ws-t m c" x="166" y="186">만족도 →</text>' +
      '<text class="ws-t m c" x="22" y="84">중요도</text><text class="ws-t m c" x="22" y="100">↑</text>' +
      '<g class="ws-fly" style="--d:.9s"><circle class="ws-pulse" cx="96" cy="58" r="9"/><circle class="ws-dot" cx="96" cy="58" r="7"/>' +
      '<text class="ws-t b" x="110" y="63">편의시설</text></g>',
      '편의시설은 중요도는 높고 만족도는 낮은 칸에 있음');
  }
  function visAvoid() {
    var crowd = [[52, 84], [70, 70], [88, 88], [62, 104], [96, 64], [80, 112], [104, 100], [46, 66], [114, 80], [72, 128]];
    var moves = { 4: [118, -8], 8: [128, -8], 1: [196, -16], 5: [130, 38], 9: [164, 12], 6: [150, 56] };
    var dots = crowd.map(function (p, i) {
      var m = moves[i];
      return '<circle class="ws-person' + (m ? ' go' : '') + '" style="--dx:' + (m ? m[0] : 0) + 'px;--dy:' + (m ? m[1] : 0) + 'px;--d:' + (0.6 + (i % 4) * 0.12) + 's" cx="' + p[0] + '" cy="' + p[1] + '" r="6"/>';
    }).join('');
    return svg(
      '<circle class="ws-hot" cx="80" cy="94" r="62"/>' +
      '<text class="ws-t c b" x="80" y="186">붐비는 곳</text>' +
      '<rect class="ws-zone" x="186" y="34" width="104" height="58" rx="14"/>' +
      '<text class="ws-t c b" x="238" y="26">한산한 길</text>' +
      '<rect class="ws-zone" x="186" y="112" width="104" height="58" rx="14"/>' +
      '<text class="ws-t c b" x="238" y="186">덜 붐비는 시간</text>' +
      '<g class="ws-fade" style="--d:.3s"><circle class="ws-clock" cx="270" cy="126" r="9"/><path class="ws-clock" d="M270 121v5l3 2"/></g>' +
      '<path class="ws-draw dim" style="--d:.2s" pathLength="1" d="M146 76Q166 64 182 62"/>' +
      '<path class="ws-draw dim" style="--d:.3s" pathLength="1" d="M146 112Q166 126 182 136"/>' +
      dots,
      '붐비는 곳의 사람들이 한산한 길과 덜 붐비는 시간으로 옮겨 감');
  }

  // ---------- 스타일 ----------
  var css = [
    // 카드의 '적용' 줄을 연한 상자로(제목은 윗줄, 내용은 아랫줄)
    '.hm-why .hm-whys .hm-whyc p{margin:6px 0 0;padding:12px 14px;border-radius:14px;background:var(--brand-wash);font-size:14px;line-height:1.6;color:var(--ink)}',
    '.hm-why .hm-whys .hm-whyc p em{display:block;margin:0 0 4px;font-size:12px}',
    '.hm-why .hm-whys .hm-whyc small{margin-top:auto;padding-top:4px}',
    '.hm-why.ws-on .hm-whys .hm-whyc{cursor:pointer;position:relative;transition:scale .55s cubic-bezier(.2,.7,.2,1),translate .55s cubic-bezier(.2,.7,.2,1),opacity .45s,border-color .3s,box-shadow .35s,background-color .3s;transition-delay:0s}',
    '.hm-why.ws-on .hm-whys .hm-whyc.ws-dim{opacity:.45;scale:.96}',
    '.hm-why.ws-on .hm-whys .hm-whyc.ws-dim:hover{opacity:.8}',
    '.hm-why.ws-on .hm-whys .hm-whyc.ws-act{opacity:1;scale:1.07;translate:0 -6px;z-index:2;background:var(--surface);border-color:var(--brand);box-shadow:0 22px 44px -18px color-mix(in srgb,var(--brand) 60%,transparent)}',
    '.hm-why.ws-on .hm-whys .hm-whyc.ws-act::after{content:"";position:absolute;left:50%;bottom:-9px;width:16px;height:16px;background:var(--surface);border-right:1px solid var(--brand);border-bottom:1px solid var(--brand);transform:translateX(-50%) rotate(45deg);animation:wsIn .4s both}',
    '.hm-why.ws-on .hm-whys .hm-whyc:focus-visible{outline:2px solid var(--focus);outline-offset:3px}',
    '.ws-stage{display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);grid-template-areas:"vis txt" "ctl ctl";gap:14px 32px;align-items:center;margin-top:22px;padding:26px 30px 18px;border-radius:22px;background:var(--surface-2);border:1px solid var(--hair);opacity:0;transform:translateY(16px);transition:opacity .6s,transform .6s cubic-bezier(.2,.7,.2,1)}',
    '.hm-why.ws-on .ws-stage{opacity:1;transform:none}',
    '.ws-vis{grid-area:vis;min-width:0}.ws-vis svg{display:block;width:100%;height:auto;overflow:visible}',
    '.ws-txt{grid-area:txt;min-width:0}',
    '.ws-txt>*{animation:wsUp .55s cubic-bezier(.2,.7,.2,1) both}',
    '.ws-txt>:nth-child(2){animation-delay:.06s}.ws-txt>:nth-child(3){animation-delay:.14s}.ws-txt>:nth-child(4){animation-delay:.22s}',
    '.ws-k{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--muted)}',
    '.ws-k b{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-size:12px;font-weight:800;font-variant-numeric:tabular-nums}',
    '.ws-h{margin:10px 0 8px;font-size:clamp(20px,2vw,26px);font-weight:800;letter-spacing:-.03em;line-height:1.3;color:var(--ink)}',
    '.ws-b{margin:0;font-size:15px;line-height:1.7;color:var(--ink-2)}',
    '.ws-use{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:var(--brand-wash);font-size:14.5px;font-weight:700;line-height:1.55;color:var(--ink)}',
    '.ws-use em{display:inline-block;margin-right:8px;font-style:normal;font-size:11.5px;font-weight:800;color:var(--brand)}',
    '.ws-steps{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:2px;font-weight:600;font-size:13.5px;color:var(--ink-2)}',
    '.ws-steps li{display:flex;align-items:center;gap:8px;animation:wsUp .5s var(--d,0s) cubic-bezier(.2,.7,.2,1) both}',
    '.ws-steps li b{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-size:11px;font-weight:800}',
    '.ws-steps li.ar{padding-left:5px;font-size:11px;line-height:1;color:var(--muted)}',
    '.ws-ctl{grid-area:ctl;display:flex;align-items:center;gap:10px;padding-top:12px;border-top:1px solid var(--hair)}',
    '.ws-ctl>button{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:0;border-radius:999px;background:var(--surface);color:var(--ink);cursor:pointer;box-shadow:inset 0 0 0 1px var(--hair)}',
    '.ws-ctl>button:hover{background:var(--surface-3)}.ws-ctl>button:focus-visible,.ws-seg:focus-visible{outline:2px solid var(--focus);outline-offset:2px}',
    '.ws-prog{flex:1;display:flex;gap:6px;min-width:0}',
    '.ws-seg{flex:1;height:22px;padding:0;border:0;background:none;cursor:pointer;display:flex;align-items:center}',
    '.ws-seg i{position:relative;display:block;width:100%;height:4px;border-radius:4px;background:var(--surface-3);overflow:hidden}',
    '.ws-seg i::after{content:"";position:absolute;inset:0;background:var(--brand);transform-origin:left;transform:scaleX(0)}',
    '.ws-seg.done i::after{transform:none}',
    '.ws-seg.cur i::after{animation:wsFill var(--dur) linear both}',
    '.ws-stage.ws-hold .ws-seg.cur i::after{animation-play-state:paused}',
    '.ws-stage.ws-stop .ws-seg.cur i::after{animation:none;transform:none}',
    '.ws-note{flex:none;font-size:11.5px;color:var(--muted)}',
    // 그림 공통
    '.ws-vis text{font-family:var(--font)}',
    '.ws-t{font-size:12.5px;font-weight:600;fill:var(--ink-2)}.ws-t.b{font-weight:800;fill:var(--ink)}.ws-t.m{fill:var(--muted)}.ws-t.c,.ws-big.c,.ws-t.q{text-anchor:middle}',
    '.ws-big{font-size:24px;font-weight:800;letter-spacing:-.03em;fill:var(--brand)}',
    '.ws-ax{stroke:var(--axis);stroke-width:1.5;stroke-dasharray:4 4}',
    '.ws-track{fill:var(--surface-3)}',
    '.ws-grow{transform-box:fill-box;transform-origin:bottom;animation:wsGrowY 1s var(--d,0s) cubic-bezier(.2,.7,.2,1) both}.ws-grow.hot{fill:var(--v3)}.ws-grow.cool{fill:var(--g3)}',
    '.ws-br{fill:none;stroke:var(--brand);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.ws-fade{animation:wsIn .6s var(--d,0s) both}',
    '.ws-pop{transform-box:fill-box;transform-origin:center;animation:wsPop .5s var(--d,0s) cubic-bezier(.3,1.5,.5,1) both}',
    '.ws-draw{fill:none;stroke:var(--brand);stroke-width:4;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;animation:wsDraw 1s var(--d,0s) cubic-bezier(.4,0,.2,1) forwards}',
    '.ws-draw.dim{stroke:var(--axis);stroke-width:3}',
    '.ws-node{fill:var(--surface);stroke:var(--ink);stroke-width:2.5}',
    '.ws-tree{fill:var(--g2)}',
    '.ws-bar{fill:var(--brand);transform-box:fill-box;transform-origin:left;animation:wsGrowX .8s var(--d,0s) cubic-bezier(.2,.7,.2,1) both}.ws-bar.dim{fill:var(--axis)}',
    '.ws-bar.cap{fill:none;stroke:var(--brand);stroke-width:1.5;stroke-dasharray:4 3}',
    '.ws-ring-bg{fill:none;stroke:var(--surface-3);stroke-width:16}',
    '.ws-ring{fill:none;stroke:var(--brand);stroke-width:16;stroke-linecap:round;stroke-dasharray:38.5 100;stroke-dashoffset:38.5;animation:wsRing 1.2s .2s cubic-bezier(.2,.7,.2,1) forwards}',
    '.ws-chip{fill:var(--brand-wash);stroke:color-mix(in srgb,var(--brand) 40%,transparent)}',
    '.ws-frame{fill:none;stroke:var(--axis);stroke-width:1.5}',
    '.ws-quad{fill:var(--brand-wash)}',
    '.ws-dot{fill:var(--brand)}.ws-pulse{fill:var(--brand);opacity:.35;transform-box:fill-box;transform-origin:center;animation:wsPulse 1.6s 1.9s ease-out infinite}',
    '.ws-fly{animation:wsFly 1s var(--d,0s) cubic-bezier(.3,1.3,.5,1) both}',
    '.ws-hot{fill:var(--v1);opacity:.55}',
    '.ws-zone{fill:var(--g1);stroke:color-mix(in srgb,var(--g3) 50%,transparent)}',
    '.ws-clock{fill:none;stroke:var(--ink-2);stroke-width:1.8;stroke-linecap:round}',
    '.ws-person{fill:var(--v3)}.ws-person.go{animation:wsMove 1.3s var(--d,0s) cubic-bezier(.5,0,.2,1) forwards}',
    '@keyframes wsIn{from{opacity:0}to{opacity:1}}',
    '@keyframes wsUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
    '@keyframes wsFill{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
    '@keyframes wsGrowY{from{transform:scaleY(0)}to{transform:none}}',
    '@keyframes wsGrowX{from{transform:scaleX(0)}to{transform:none}}',
    '@keyframes wsPop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}',
    '@keyframes wsDraw{to{stroke-dashoffset:0}}',
    '@keyframes wsRing{to{stroke-dashoffset:0}}',
    '@keyframes wsPulse{from{transform:scale(1);opacity:.4}to{transform:scale(2.6);opacity:0}}',
    '@keyframes wsFly{from{opacity:0;transform:translate(70px,40px)}to{opacity:1;transform:none}}',
    '@keyframes wsMove{0%{transform:none}100%{transform:translate(var(--dx),var(--dy));fill:var(--g3)}}',
    // 태블릿·휴대폰
    '@media(max-width:900px){.ws-stage{grid-template-columns:minmax(0,1fr);grid-template-areas:"vis" "txt" "ctl";padding:20px 18px 14px}.ws-vis{max-width:340px;justify-self:center;width:100%}}',
    '@media(max-width:640px){',
    '.hm-why.ws-on .hm-whys.hm-whys5{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:12px;margin-left:-18px;margin-right:-18px;padding:6px 18px 14px;scrollbar-width:none}',
    '.hm-why.ws-on .hm-whys.hm-whys5::-webkit-scrollbar{display:none}',
    '.hm-why.ws-on .hm-whys .hm-whyc{flex:0 0 80%;scroll-snap-align:center}',
    '.hm-why.ws-on .hm-whys .hm-whyc.ws-act{scale:1;translate:none;box-shadow:none}',
    '.hm-why.ws-on .hm-whys .hm-whyc.ws-act::after{display:none}',
    '.hm-why.ws-on .hm-whys .hm-whyc.ws-dim{scale:.95}',
    '.ws-note{display:none}}',
    '@media(prefers-reduced-motion:reduce){.ws-stage *,.ws-stage *::after,.hm-why.ws-on .hm-whys .hm-whyc{animation:none!important;transition:none!important}.ws-draw,.ws-ring{stroke-dashoffset:0}.ws-person.go{transform:translate(var(--dx),var(--dy));fill:var(--g3)}}',
  ].join('\n');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ---------- 동작 ----------
  function attach(sec) {
    var grid = sec.querySelector('.hm-whys');
    if (!grid) return;
    var cards = [].slice.call(grid.querySelectorAll('.hm-whyc'));
    if (cards.length < 2) return;
    sec.__ws = true;
    var infos = cards.map(function (c) {
      var src = (c.querySelector('small') || {}).textContent || '';
      var hit = INFO.filter(function (x) { return src.indexOf(x.key) >= 0; })[0];
      return { src: src, big: ((c.querySelector('b') || {}).textContent || '').trim(), info: hit };
    });
    var n = cards.length, cur = 0, playing = !reduce, inView = false, hover = false, started = false, lockScroll = 0;

    var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    var stage = el('div', 'ws-stage');
    stage.setAttribute('role', 'region');
    stage.setAttribute('aria-label', '선행연구 기준 하나씩 보기');
    stage.style.setProperty('--dur', DUR + 'ms');
    var vis = el('div', 'ws-vis'), txt = el('div', 'ws-txt');
    txt.setAttribute('aria-live', 'polite');
    var ctl = el('div', 'ws-ctl');
    var prev = el('button', null, '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>');
    var next = el('button', null, '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>');
    var play = el('button');
    prev.type = next.type = play.type = 'button';
    prev.setAttribute('aria-label', '이전 근거'); next.setAttribute('aria-label', '다음 근거');
    var prog = el('div', 'ws-prog');
    var segs = cards.map(function (c, i) {
      var b = el('button', 'ws-seg', '<i></i>');
      b.type = 'button';
      b.setAttribute('aria-label', (i + 1) + '번째 근거: ' + infos[i].big);
      b.onclick = function () { userGo(i); };
      prog.appendChild(b);
      return b;
    });
    var note = el('span', 'ws-note', '그림은 이해를 돕는 모식도');
    ctl.append(prev, prog, play, note);
    stage.append(vis, txt, ctl);
    grid.insertAdjacentElement('afterend', stage);

    function setPlayIcon() {
      play.innerHTML = playing
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>';
      play.setAttribute('aria-label', playing ? '자동 넘김 멈춤' : '자동 넘김 재생');
    }
    function sync() {
      stage.classList.toggle('ws-stop', !playing);
      stage.classList.toggle('ws-hold', playing && (!inView || hover));
      setPlayIcon();
    }
    function show(i, fromScroll) {
      cur = (i + n) % n;
      var it = infos[cur], info = it.info || {};
      cards.forEach(function (c, k) {
        c.classList.toggle('ws-act', k === cur);
        c.classList.toggle('ws-dim', k !== cur);
        c.setAttribute('aria-pressed', k === cur ? 'true' : 'false');
      });
      segs.forEach(function (s, k) {
        s.classList.remove('cur');
        s.classList.toggle('done', k < cur);
        s.setAttribute('aria-current', k === cur ? 'step' : 'false');
      });
      void segs[cur].offsetWidth;   // 진행 막대 애니메이션을 처음부터 다시
      segs[cur].classList.add('cur');
      vis.innerHTML = info.vis ? info.vis() : '';
      txt.innerHTML = '';
      var k = el('div', 'ws-k'); k.append(el('b', null, (cur + 1) + ' / ' + n), document.createTextNode(it.src));
      var h = el('h3', 'ws-h'); h.textContent = info.title || it.big;
      var b = el('p', 'ws-b'); b.textContent = info.body || ((cards[cur].querySelector('span') || {}).textContent || '');
      var u = el('p', 'ws-use'); u.append(el('em', null, '적용'), document.createTextNode(info.use || ''));
      txt.append(k, h, b);
      if (info.use) txt.append(u);
      if (info.steps) {
        var ol = el('ol', 'ws-steps');
        info.steps.forEach(function (s, j) {
          var li = el('li'); li.style.setProperty('--d', (0.45 + j * 0.25) + 's');
          li.append(el('b', null, String(j + 1)), document.createTextNode(s));
          ol.appendChild(li);
          if (j < info.steps.length - 1) { var ar = el('li', 'ar', '↓'); ar.setAttribute('aria-hidden', 'true'); ar.style.setProperty('--d', (0.55 + j * 0.25) + 's'); ol.appendChild(ar); }
        });
        u.appendChild(ol);
      }
      if (mqMobile.matches && !fromScroll) centerCard(cur);
    }
    function centerCard(i) {
      var c = cards[i];
      lockScroll = Date.now() + 700;
      grid.scrollTo({ left: c.offsetLeft - (grid.clientWidth - c.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' });
    }
    function userGo(i) { playing = false; sync(); show(i); }

    // 진행 막대가 다 차면 다음 카드로
    prog.addEventListener('animationend', function (e) {
      if (e.animationName === 'wsFill' && playing) show(cur + 1);
    });
    prev.onclick = function () { userGo(cur - 1); };
    next.onclick = function () { userGo(cur + 1); };
    play.onclick = function () { playing = !playing; sync(); if (playing) show(cur); };
    cards.forEach(function (c, i) {
      c.setAttribute('tabindex', '0');
      c.setAttribute('role', 'button');
      c.addEventListener('click', function () { userGo(i); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); userGo(i); } });
    });
    [grid, stage].forEach(function (x) {
      x.addEventListener('mouseenter', function () { if (!mqMobile.matches) { hover = true; sync(); } });
      x.addEventListener('mouseleave', function () { hover = false; sync(); });
    });
    // 휴대폰: 손으로 넘기면 가운데 카드를 보여 주고 자동 넘김은 멈춤
    var scrollT;
    grid.addEventListener('scroll', function () {
      if (!mqMobile.matches || !started || Date.now() < lockScroll) return;
      clearTimeout(scrollT);
      scrollT = setTimeout(function () {
        var mid = grid.scrollLeft + grid.clientWidth / 2, best = 0, bd = 1e9;
        cards.forEach(function (c, i) { var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
        if (best !== cur) { playing = false; sync(); show(best, true); }
      }, 140);
    }, { passive: true });

    function start() {
      if (started) return;
      started = true;
      sec.classList.add('ws-on');
      sync();
      show(0);
    }
    if (!('IntersectionObserver' in window)) { inView = true; start(); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        inView = e.isIntersecting && e.intersectionRatio > 0.2;
        // 카드가 떠오르는 애니메이션이 끝난 뒤 시작
        if (inView && !started) setTimeout(start, reduce ? 0 : 900);
        sync();
      });
    }, { threshold: [0, 0.2, 0.35] });
    io.observe(sec);
    sync();
  }

  function scan() {
    var sec = document.querySelector('section.hm-why');
    if (!sec) return;
    if (sec.__ws && sec.querySelector('.ws-stage')) return;
    if (sec.__ws) { sec.__ws = false; sec.classList.remove('ws-on'); }
    attach(sec);
  }
  var root = document.getElementById('root') || document.body, queued = false;
  new MutationObserver(function () {
    if (queued) return; queued = true;
    requestAnimationFrame(function () { queued = false; scan(); });
  }).observe(root, { childList: true, subtree: true });
  scan();
})();
