/*
 * 표지 음악 — 도심 재즈하우스 (Web Audio로 그 자리에서 연주 · 음원 파일·저작권 없음)
 *  - 120 BPM, 한 곡·한 그루브만 (메아리 없음, 짧은 잔향 → 겹쳐 들리지 않게)
 *  - 로즈 피아노 엇박 찌르기: Dm9 → G13 → Cmaj9 → A7(b9) (재즈 ii–V–I + 되돌이)
 *  - 펑키한 베이스, 사포 킥(작게)·클랩·엇박 오픈 하이햇·셰이커
 *  - 비브라폰 주제 선율(정해진 멜로디, 8마디마다 두 번)
 *  - 처음 두 마디는 필터가 닫힌 채 피아노·베이스만 → 열리며 비트가 들어옴
 * window.SF_SOUND = { start(), stop(ms), toggle(), dive(), dispose(), on }
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로, 표지에서 첫 클릭·터치·키 입력 때 켜짐.
 */
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var ctx = null, master = null, verb = null, buses = null, on = false, built = false;
  var timer = null, nextStep = 0, nextTime = 0, white = null;

  var BPM = 120, STEP = 60 / BPM / 4;               // 16분음표
  var SWING = 0.12 * STEP;                          // 짝수 아닌 16분을 살짝 늦춤(그루브)
  var mf = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  var CHORDS = [
    { n: [53, 57, 60, 64], b: 38 },   // Dm9   (F A C E)
    { n: [53, 59, 64, 69], b: 43 },   // G13   (F B E A)
    { n: [52, 55, 59, 62], b: 36 },   // Cmaj9 (E G B D)
    { n: [55, 58, 61, 65], b: 45 }    // A7(b9 #5) (G Bb C# F)
  ];
  // 비브라폰 주제: [마디 안 16분 위치(0~31, 두 마디), 음]
  var THEME_A = [[0, 69], [3, 72], [6, 74], [10, 76], [14, 74], [16, 72], [19, 71], [22, 67], [26, 69]];
  var THEME_B = [[0, 76], [3, 74], [6, 71], [10, 72], [14, 71], [16, 70], [19, 69], [22, 67], [27, 64]];
  var COMP = [[0, 3, 0.15], [3, 1, 0.08], [7, 2, 0.11], [10, 3, 0.13]];          // 로즈 찌르기 [위치, 길이(칸), 세기]
  var BASS = [[0, 0, 2], [3, 12, 1], [6, 7, 2], [8, 0, 1], [11, 10, 2]];          // 베이스 [위치, 근음 위 반음, 길이]

  function noise(sec) {
    var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function reverb(sec) {
    var c = ctx.createConvolver(), n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4); }
    c.buffer = b; return c;
  }
  function gain(v, to) { var g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  function filt(type, f, q, to) { var x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; if (to) x.connect(to); return x; }
  function panTo(v, to) { if (!ctx.createStereoPanner) return gain(1, to); var p = ctx.createStereoPanner(); p.pan.value = v; p.connect(to); return p; }

  function build() {
    built = true;
    white = noise(1);
    master = gain(0);
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.15;
    master.connect(comp); comp.connect(ctx.destination);
    verb = reverb(1.6); verb.connect(gain(0.2, master));          // 작은 클럽 정도의 짧은 잔향
    // 전체 필터: 처음엔 닫혀 있다가 비트가 들어올 때 열림
    var sweep = filt('lowpass', 20000, 0.7, master);
    var duck = gain(1, sweep);                                     // 킥에 맞춰 살짝 숨쉬는 사이드체인
    var keys = gain(0.34, duck), vib = gain(0.2, sweep), bass = gain(0.5, sweep), drums = gain(0.75, master);
    keys.connect(verb); vib.connect(verb); drums.connect(gain(0.12, verb));
    var keysF = filt('lowpass', 3200, 0.3, keys), trem = gain(1, keysF);
    var tl = ctx.createOscillator(), td = gain(0.1, trem.gain); tl.frequency.value = 5; tl.connect(td); tl.start();
    var bassF = filt('lowpass', 900, 1.2, bass);
    buses = { sweep: sweep, duck: duck, keys: trem, vib: vib, bass: bassF, drums: drums };
  }

  // ── 악기 ──────────────────────────────────────────────
  function rhodes(m, t, vel, dur) {        // FM 로즈 (짧고 단정하게 끊음)
    var f = mf(m), out = ctx.createGain(), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f; car.detune.value = Math.random() * 4 - 2;
    mg.gain.setValueAtTime(f * 2, t); mg.gain.exponentialRampToValueAtTime(f * 0.3, t + 0.25);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vel, t + 0.005);
    out.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.15); out.gain.setTargetAtTime(0.0001, t + dur, 0.06);
    mod.connect(mg); mg.connect(car.frequency); car.connect(out); out.connect(buses.keys);
    var end = t + dur + 0.5; car.start(t); mod.start(t); car.stop(end); mod.stop(end);
  }
  function vibes(m, t, vel) {
    var f = mf(m), out = ctx.createGain(), p = panTo(0.2, buses.vib);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vel, t + 0.003); out.gain.setTargetAtTime(0.0001, t + 0.03, 0.35);
    out.connect(p);
    [[1, 1], [4, 0.1], [10, 0.025]].forEach(function (h) { var o = ctx.createOscillator(), g = gain(h[1], out); o.frequency.value = f * h[0]; o.connect(g); o.start(t); o.stop(t + 2); });
  }
  function bassNote(m, t, dur) {           // 펑키 베이스: 사인 + 톱니 살짝, 손가락 튕김
    var f = mf(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = gain(0.12, g);
    o.frequency.value = f; o2.type = 'sawtooth'; o2.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.008); g.gain.exponentialRampToValueAtTime(0.6, t + 0.1); g.gain.setTargetAtTime(0.0001, t + dur, 0.03);
    o.connect(g); o2.connect(g2); g.connect(buses.bass); o.start(t); o2.start(t); o.stop(t + dur + 0.2); o2.stop(t + dur + 0.2);
  }
  function kick(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(buses.drums); o.start(t); o.stop(t + 0.32);
    var d = buses.duck.gain; d.cancelScheduledValues(t); d.setValueAtTime(1, t); d.linearRampToValueAtTime(0.7, t + 0.01); d.linearRampToValueAtTime(1, t + 0.2);
  }
  function clap(t, v) {                    // 클랩: 짧은 잡음 세 번 겹침
    var p = panTo(-0.05, buses.drums);
    [0, 0.011, 0.022].forEach(function (o, i) {
      var s = ctx.createBufferSource(), f = filt('bandpass', 1500, 1.1), g = ctx.createGain(); s.buffer = white;
      g.gain.setValueAtTime(0.0001, t + o); g.gain.exponentialRampToValueAtTime(0.22 * v, t + o + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + o + (i === 2 ? 0.16 : 0.012));
      s.connect(f); f.connect(g); g.connect(p); g.connect(verb); s.start(t + o); s.stop(t + o + 0.2);
    });
  }
  function hat(t, v, open, pan) {
    var s = ctx.createBufferSource(), f = filt('highpass', open ? 7000 : 9000, 0.5), g = ctx.createGain(), p = panTo(pan, buses.drums); s.buffer = white;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.18 : 0.03));
    s.connect(f); f.connect(g); g.connect(p); s.start(t); s.stop(t + 0.25);
  }

  // ── 악보: 16분음표 한 칸씩 ─────────────────────────────
  function play(step, t) {
    var bar = Math.floor(step / 16), s = step % 16, ch = CHORDS[bar % 4], nx = CHORDS[(bar + 1) % 4];
    var tt = s % 2 ? t + SWING : t, intro = bar < 2, fill = bar % 16 === 15;
    if (step === 0) { var sw = buses.sweep.frequency; sw.setValueAtTime(500, t); sw.exponentialRampToValueAtTime(20000, t + STEP * 32); }
    COMP.forEach(function (c) { if (c[0] === s) ch.n.forEach(function (m, i) { rhodes(m, tt + i * 0.004, c[2] - i * 0.01, c[1] * STEP); }); });
    BASS.forEach(function (b) { if (b[0] === s) bassNote(ch.b + b[1], tt, b[2] * STEP); });
    if (s === 14) bassNote(nx.b - 1, tt, STEP);                     // 다음 화음으로 반음 아래에서 접근
    // 주제 선율: 8마디 중 4·5마디(A), 6·7마디(B)
    var p8 = bar % 8, th = p8 === 4 || p8 === 5 ? THEME_A : p8 === 6 || p8 === 7 ? THEME_B : null, pos = s + (p8 % 2) * 16;
    if (th && bar >= 4) th.forEach(function (n) { if (n[0] === pos) vibes(n[1], tt, 0.12); });
    if (intro) return;
    if (s % 4 === 0 && !(fill && s >= 8)) kick(t);
    if (s === 4 || s === 12) clap(t, 1);
    if (fill && s >= 12) clap(tt, 0.5);                              // 16마디 끝 짧은 필
    if (s % 4 === 2) hat(tt, 0.06, true, 0.3);                       // 엇박 오픈 하이햇 '츠-'
    hat(tt, s % 4 === 0 ? 0.03 : 0.018, false, -0.3);                 // 셰이커 16분
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
      var t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.8, t + 1.5);
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
  // 「대시보드 열기」: 필터가 닫히며 쑥 빠지고 비브라폰 화음 하나로 마무리
  function dive() {
    if (!on) return;
    var t = ctx.currentTime, sw = buses.sweep.frequency;
    sw.cancelScheduledValues(t); sw.setValueAtTime(sw.value, t); sw.exponentialRampToValueAtTime(300, t + 0.9);
    [74, 77, 81, 84].forEach(function (m, i) { vibes(m, t + 0.3 + i * 0.05, 0.1); });
    setTimeout(function () { stop(1000); }, 500);
  }
  function dispose() { stop(300); setTimeout(function () { try { ctx && ctx.close(); } catch (e) {} }, 500); }

  window.SF_SOUND = {
    start: start, stop: stop, dive: dive, dispose: dispose,
    toggle: function () { return on ? (stop(), Promise.resolve(false)) : start(); },
    _render: function (sec) { schedule(sec); },   // 확인용(오프라인 렌더)
    get on() { return on; }
  };
})();
