/*
 * 표지 음악 — 오프닝 곡 「머무는 숲」 (ElevenLabs Music으로 만든 60초 앰비언트 일렉트로닉, 같은 폴더의 opening.mp3)
 * window.SF_SOUND = { start(), stop(ms), toggle(), dive(), dispose(), on }
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로, 표지에서 첫 클릭·터치·키 입력 때 켜짐(cover3d.js가 처리).
 */
(function () {
  'use strict';
  var BASE = ((document.currentScript || {}).src || '').replace(/[^/]*$/, '');
  var VOL = 0.7, a = new Audio(BASE + 'opening.mp3?v=20261126');
  a.loop = true; a.preload = 'auto'; a.volume = VOL;
  var on = false, fade = null;
  function ramp(to, ms, done) {
    clearInterval(fade);
    var from = a.volume, t0 = Date.now();
    fade = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / ms);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(fade); if (done) done(); }
    }, 40);
  }
  function start() {
    if (on) return Promise.resolve(true);
    a.volume = 0;
    var p;
    try { p = a.play(); } catch (e) { return Promise.resolve(false); }
    return Promise.resolve(p).then(function () { on = true; ramp(VOL, 800); return true; }, function () { return false; });
  }
  function stop(ms) {
    if (!on) return; on = false;
    ramp(0, ms == null ? 600 : ms, function () { if (!on) a.pause(); });
  }
  // 「대시보드 열기」: 소리가 천천히 빠지며 끝남
  function dive() { if (on) stop(1400); }
  function dispose() { stop(300); setTimeout(function () { a.pause(); a.removeAttribute('src'); a.load(); }, 500); }

  window.SF_SOUND = {
    start: start, stop: stop, dive: dive, dispose: dispose,
    toggle: function () { return on ? (stop(), Promise.resolve(false)) : start(); },
    get on() { return on; }
  };
})();
