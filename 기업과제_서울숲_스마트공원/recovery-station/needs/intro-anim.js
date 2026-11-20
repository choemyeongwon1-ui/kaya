// 소개 화면 숫자가 보일 때 0에서 원래 값까지 올라가게 합니다(한 번만).
// 글자만 잠깐 바꾸고 끝나면 원래 글자 그대로 돌려놓습니다. '움직임 줄이기' 설정이면 하지 않습니다.
(function () {
  'use strict';
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;
  var SEL = '.hm .hm-stat b.num, .hm .hm-whyc > b, .hm .hm-area-r b, .hm .hm-green-r b, .hm .hm-goal-nums strong';
  var NUM = /\d[\d,]*(?:\.\d+)?/g;
  var DUR = 1300;
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };

  function run(el) {
    var orig = el.textContent;
    var parts = [], last = 0, m;
    NUM.lastIndex = 0;
    while ((m = NUM.exec(orig))) {
      var raw = m[0], v = parseFloat(raw.replace(/,/g, ''));
      parts.push(orig.slice(last, m.index));
      parts.push({ v: v, dec: (raw.split('.')[1] || '').length, comma: raw.indexOf(',') >= 0 });
      last = m.index + raw.length;
    }
    parts.push(orig.slice(last));
    if (!parts.some(function (p) { return typeof p === 'object' && p.v >= 2; })) return;   // '1위' 같은 값은 그대로
    var t0 = 0;
    function fmt(p, k) {
      var x = p.v * k;
      var s = x.toFixed(p.dec);
      if (p.comma) { var a = s.split('.'); a[0] = Number(a[0]).toLocaleString('en-US'); s = a.join('.'); }
      return s;
    }
    function frame(ts) {
      if (!t0) t0 = ts;
      var k = ease(Math.min(1, (ts - t0) / DUR));
      var txt = parts.map(function (p) { return typeof p === 'object' ? fmt(p, k) : p; }).join('');
      if (el.textContent !== txt) el.textContent = txt;
      if (k < 1) requestAnimationFrame(frame); else if (el.textContent !== orig) el.textContent = orig;
    }
    requestAnimationFrame(frame);
  }

  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      // 카드가 떠오르는 시간에 맞춰 조금 늦게 시작
      setTimeout(function () { run(e.target); }, 250);
    });
  }, { threshold: 0.6 });

  function scan() {
    document.querySelectorAll(SEL).forEach(function (el) {
      if (el.__hmCount) return;
      el.__hmCount = true;
      io.observe(el);
    });
  }
  var root = document.getElementById('root') || document.body, queued = false;
  new MutationObserver(function () {
    if (queued) return; queued = true;
    requestAnimationFrame(function () { queued = false; scan(); });
  }).observe(root, { childList: true, subtree: true });
  scan();
})();
