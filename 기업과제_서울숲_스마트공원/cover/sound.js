/*
 * 표지 음악 — 밤 도시 로파이·딥하우스 (Web Audio로 그 자리에서 연주 · 음원 파일·저작권 없음)
 *  - 일렉트릭 피아노(FM 합성) 화음: Fmaj9 → Em9 → Dm9 → Cmaj9 (내려가는 도시의 밤 진행)
 *  - 부드러운 패드, 깊은 베이스, 둥근 킥·스네어·스윙 하이햇 (92 BPM)
 *  - 킥이 칠 때 화음이 살짝 숨는 사이드체인, 밑에는 먼 도시 소리를 아주 작게
 *  - 처음 두 마디는 피아노만, 셋째 마디부터 비트가 들어옴
 * window.SF_SOUND = { start(), stop(ms), toggle(), dive(), dispose(), on }
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로, 표지에서 첫 클릭·터치·키 입력 때 켜짐.
 */
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var ctx = null, master = null, verb = null, buses = null, on = false, built = false;
  var timer = null, timers = [], nextStep = 0, nextTime = 0, white = null, brown = null;

  var BPM = 92, STEP = 60 / BPM / 4;          // 16분음표 길이
  var SWING = 0.18;                          // 뒤쪽 8분음표를 늦추는 정도(박 길이 비율)
  var mf = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  // 화음(일렉트릭 피아노 음) · 베이스 근음
  var CHORDS = [
    { n: [52, 57, 60, 67], b: 41 },   // Fmaj9
    { n: [55, 59, 62, 66], b: 40 },   // Em9
    { n: [53, 57, 60, 64], b: 38 },   // Dm9
    { n: [52, 55, 59, 62], b: 36 }    // Cmaj9
  ];
  var LICK = [[0, 76], [3, 74], [6, 72], [10, 69], [13, 67]];   // 8마디마다 끝에 짧은 멜로디

  function noise(kind, sec) {
    var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), last = 0;
      for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    }
    return b;
  }
  function reverb(sec) {
    var c = ctx.createConvolver(), n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    c.buffer = b; return c;
  }
  function gain(v, to) { var g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  function filt(type, f, q, to) { var x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; if (to) x.connect(to); return x; }
  function env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  function build() {
    built = true;
    white = noise('white', 2); brown = noise('brown', 6);
    master = gain(0);
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 2.5; comp.attack.value = 0.01; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    verb = reverb(2.6); var wet = gain(0.32, master); verb.connect(wet);

    // 버스: 화음(사이드체인)·드럼·베이스
    var duck = gain(1, master), keys = gain(0.34, duck), pad = gain(0.06, duck);
    keys.connect(verb); pad.connect(verb);
    // 일렉트릭 피아노: 살짝 어둡게 + 느린 트레몰로
    var keysF = filt('lowpass', 2600, 0.3, keys), trem = gain(1, keysF);
    var tl = ctx.createOscillator(), td = gain(0.12, trem.gain); tl.frequency.value = 4.2; tl.connect(td); tl.start();
    var padF = filt('lowpass', 900, 0.5, pad);
    var drums = gain(0.8, master), dverb = gain(0.25, verb); drums.connect(dverb);
    var bass = gain(0.32, master), bassF = filt('lowpass', 420, 0.7, bass);
    buses = { duck: duck, keys: trem, pad: padF, drums: drums, bass: bassF };

    // 밑에 깔리는 먼 도시 소리(아주 작게)
    var r = ctx.createBufferSource(); r.buffer = brown; r.loop = true;
    var rf = filt('lowpass', 170), rg = gain(0.12, duck); r.connect(rf); rf.connect(rg); r.start();
    timers.push(setInterval(function () { if (on) car(); }, 7000));
  }

  // ── 악기 ──────────────────────────────────────────────
  function ep(m, t, vel, dur) {            // FM 일렉트릭 피아노 한 음
    var f = mf(m), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), a = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f; car.detune.value = Math.random() * 6 - 3;
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.25, t + 0.5);
    mod.connect(mg); mg.connect(car.frequency);
    var tine = ctx.createOscillator(), tg = ctx.createGain(); tine.frequency.value = f * 14;   // 건반 때리는 '띵'
    tg.gain.setValueAtTime(f * 0.9, t); tg.gain.exponentialRampToValueAtTime(1, t + 0.06); tine.connect(tg); tg.connect(car.frequency);
    a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    a.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.5); a.gain.setValueAtTime(vel * 0.35, t + dur); a.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
    car.connect(a); a.connect(buses.keys);
    var end = t + dur + 1; [car, mod, tine].forEach(function (o) { o.start(t); o.stop(end); });
  }
  function padChord(notes, t, dur) {
    notes.forEach(function (m) {
      var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = mf(m); o.detune.value = Math.random() * 10 - 5;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.5); g.gain.setValueAtTime(0.25, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
      o.connect(g); g.connect(buses.pad); o.start(t); o.stop(t + dur + 0.5);
    });
  }
  function bassNote(m, t, dur) {
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = mf(m); o2.type = 'triangle'; o2.frequency.value = mf(m + 12);
    var g2 = gain(0.18, g);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.012); g.gain.setValueAtTime(0.8, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g2); g.connect(buses.bass); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function kick(t, v) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    env(g, t, 0.9 * v, 0.003, 0.38); o.connect(g); g.connect(buses.drums); o.start(t); o.stop(t + 0.45);
    // 사이드체인: 킥이 칠 때 화음이 살짝 숨었다가 돌아옴
    var d = buses.duck.gain; d.cancelScheduledValues(t); d.setValueAtTime(1, t); d.linearRampToValueAtTime(0.45, t + 0.02); d.linearRampToValueAtTime(1, t + 0.32);
  }
  function snare(t, v) {
    var s = ctx.createBufferSource(), f = filt('bandpass', 1900, 0.8), g = ctx.createGain(); s.buffer = white;
    env(g, t, 0.32 * v, 0.002, 0.2); s.connect(f); f.connect(g); g.connect(buses.drums); g.connect(verb); s.start(t); s.stop(t + 0.25);
    var o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = 185; env(og, t, 0.18 * v, 0.002, 0.08); o.connect(og); og.connect(buses.drums); o.start(t); o.stop(t + 0.12);
  }
  function hat(t, v, open) {
    var s = ctx.createBufferSource(), f = filt('highpass', 7800, 0.6), g = ctx.createGain(); s.buffer = white;
    env(g, t, 0.07 * v, 0.001, open ? 0.16 : 0.035);
    if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = 0.25; s.connect(f); f.connect(g); g.connect(p); p.connect(buses.drums); }
    else { s.connect(f); f.connect(g); g.connect(buses.drums); }
    s.start(t); s.stop(t + 0.2);
  }
  function car() {                          // 가끔 지나가는 차(아주 작게)
    var t = ctx.currentTime, dur = 4 + Math.random() * 2, s = ctx.createBufferSource(), f = filt('bandpass', 600, 0.7), g = ctx.createGain(), dir = Math.random() < 0.5 ? -1 : 1;
    s.buffer = white; s.loop = true;
    f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1300, t + dur * 0.5); f.frequency.linearRampToValueAtTime(450, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g);
    if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.8 * dir, t); p.pan.linearRampToValueAtTime(0.8 * dir, t + dur); g.connect(p); p.connect(buses.duck); } else g.connect(buses.duck);
    s.start(t); s.stop(t + dur + 0.1);
  }

  // ── 악보: 16분음표 한 칸씩 ─────────────────────────────
  function play(step, t) {
    var bar = Math.floor(step / 16), s = step % 16, ch = CHORDS[bar % 4], beats = bar >= 2, drop = bar % 16 >= 14;
    var tt = (s % 4 === 2) ? t + SWING * STEP * 4 * 0.5 : t;   // 뒤쪽 8분음표 스윙
    if (s === 0) { padChord(ch.n, t, STEP * 16); ch.n.forEach(function (m, i) { ep(m, t + i * 0.012, 0.16, STEP * 5); }); }
    if (s === 6) ch.n.forEach(function (m, i) { ep(m, tt + i * 0.01, 0.1, STEP * 3); });
    if (s === 14 && bar % 2 === 1) ep(ch.n[3] + 12, tt, 0.07, STEP * 2);
    if (bar % 8 === 7) LICK.forEach(function (l) { if (l[0] === s) ep(l[1], s % 4 === 2 ? tt : t, 0.09, STEP * 2); });
    if (beats) {
      if (s === 0) bassNote(ch.b, t, STEP * 5);
      if (s === 7) bassNote(ch.b + 7, t, STEP * 2);
      if (s === 10) bassNote(ch.b + 12, tt, STEP * 3);
      if (!drop && (s === 0 || s === 10)) kick(s === 10 ? tt : t, s === 0 ? 1 : 0.8);
      if (s === 4 || s === 12) snare(t, 1);
      if (s % 2 === 0 && Math.random() > 0.08) hat(tt, s % 4 === 0 ? 1 : 0.6, s === 14 && bar % 2 === 1);
    }
  }
  function schedule(until) {
    while (nextTime < until) { play(nextStep, nextTime); nextStep++; nextTime += STEP; }
  }

  function start() {
    if (on) return Promise.resolve(true);
    try { if (!ctx) ctx = new AC(); } catch (e) { return Promise.resolve(false); }
    // 첫 클릭 전에는 resume()이 끝나지 않고 멈춰 있을 수 있어 0.4초까지만 기다림
    return Promise.race([ctx.resume(), new Promise(function (ok) { setTimeout(ok, 400); })]).then(function () {
      if (ctx.state !== 'running' || on) return on;
      if (!built) build();
      on = true;
      var t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.75, t + 2.5);
      if (nextTime < t) { nextStep = 0; nextTime = t + 0.1; }
      clearInterval(timer); timer = setInterval(function () { schedule(ctx.currentTime + 0.15); }, 30);
      schedule(t + 0.15);
      return true;
    }).catch(function () { return false; });
  }
  function stop(ms) {
    if (!on) return; on = false;
    var t = ctx.currentTime, d = (ms == null ? 600 : ms) / 1000;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + d);
    setTimeout(function () { if (!on) { clearInterval(timer); timer = null; nextTime = 0; if (ctx) ctx.suspend(); } }, d * 1000 + 100);
  }
  // 「대시보드 열기」로 서울숲에 파고들 때: 쑥 올라가는 바람 소리 뒤 서서히 꺼짐
  function dive() {
    if (!on) return;
    var t = ctx.currentTime, s = ctx.createBufferSource(), f = filt('bandpass', 300, 2), g = ctx.createGain();
    s.buffer = white; s.loop = true; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3200, t + 1.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    s.connect(f); f.connect(g); g.connect(master); g.connect(verb); s.start(t); s.stop(t + 1.5);
    setTimeout(function () { stop(900); }, 500);
  }
  function dispose() { stop(300); timers.forEach(clearInterval); timers = []; setTimeout(function () { try { ctx && ctx.close(); } catch (e) {} }, 500); }

  window.SF_SOUND = {
    start: start, stop: stop, dive: dive, dispose: dispose,
    toggle: function () { return on ? (stop(), Promise.resolve(false)) : start(); },
    _render: function (sec) { schedule(sec); },   // 확인용(오프라인 렌더)
    get on() { return on; }
  };
})();
