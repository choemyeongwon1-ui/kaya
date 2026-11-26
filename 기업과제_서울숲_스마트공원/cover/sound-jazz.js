/*
 * 표지 음악 — 서울 시티 재즈 (네오소울 그루브 · Web Audio로 그 자리에서 연주 · 음원 파일·저작권 없음)
 *  - 98 BPM, 메아리·코러스 없이 건조하고 단단하게(잔향은 아주 짧게만)
 *  - 로즈 피아노 엇박 화음: Fmaj7(#11) → Em11 → Ebmaj7(#11) → Dm11 (반음씩 내려가는 진행)
 *  - 비브라폰 주제 선율(화음마다 정해진 멜로디), 매끈한 베이스
 *  - 단단한 킥·림샷·16분 하이햇(살짝 스윙) — 처음부터 바로 연주(표지는 몇 초만 보임)
 * window.SF_SOUND = { start(), stop(ms), toggle(), dive(), dispose(), on }
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로, 표지에서 첫 클릭·터치·키 입력 때 켜짐.
 */
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var ctx = null, master = null, room = null, buses = null, on = false, built = false;
  var timer = null, nextStep = 0, nextTime = 0, white = null;

  var BPM = 98, STEP = 60 / BPM / 4, SWING = 0.1 * STEP;
  var mf = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  var CHORDS = [
    { n: [57, 60, 64, 71], b: 41 },   // Fmaj7(#11)  A C E B
    { n: [55, 59, 62, 69], b: 40 },   // Em11        G B D A
    { n: [55, 58, 62, 69], b: 39 },   // Ebmaj7(#11) G Bb D A
    { n: [53, 57, 60, 67], b: 38 }    // Dm11        F A C G
  ];
  // 화음마다 정해진 비브라폰 선율 [16분 위치, 음]
  var MEL = [
    [[2, 72], [4, 76], [7, 79], [10, 76], [13, 71]],
    [[0, 74], [3, 71], [6, 67], [10, 69]],
    [[2, 70], [4, 74], [7, 79], [10, 74], [13, 69]],
    [[0, 72], [3, 69], [6, 65], [10, 67], [14, 69]]
  ];
  var COMP = [[0, 5, 0.15, 0], [6, 2, 0.08, 1], [10, 4, 0.12, 0]];   // 로즈 [위치, 길이, 세기, 윗음만?]
  var BASS = [[0, 0, 5], [7, 7, 2], [10, 12, 2]];                    // 베이스 [위치, 근음 위 반음, 길이]

  function noise(sec) {
    var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function shortRoom(sec) {
    var c = ctx.createConvolver(), n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 6); }
    c.buffer = b; return c;
  }
  function gain(v, to) { var g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  function filt(type, f, q, to) { var x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; if (to) x.connect(to); return x; }
  function panTo(v, to) { if (!ctx.createStereoPanner) return gain(1, to); var p = ctx.createStereoPanner(); p.pan.value = v; p.connect(to); return p; }

  function build() {
    built = true;
    white = noise(1);
    master = gain(0);
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.12;
    master.connect(comp); comp.connect(ctx.destination);
    var tone = filt('lowpass', 20000, 0.7, master);                 // 「대시보드 열기」 때 닫히는 전체 필터
    room = shortRoom(0.9); room.connect(gain(0.1, tone));          // 아주 짧은 방 울림만(메아리 없음)
    var duck = gain(1, tone);
    var keys = gain(0.36, duck), vib = gain(0.22, tone), bass = gain(0.5, tone), drums = gain(0.8, tone);
    keys.connect(room); vib.connect(room);
    var keysF = filt('lowpass', 3800, 0.2, keys), trem = gain(1, keysF);
    var tl = ctx.createOscillator(), td = gain(0.12, trem.gain); tl.frequency.value = 4.6; tl.connect(td); tl.start();
    buses = { tone: tone, duck: duck, keys: trem, vib: panTo(0.15, vib), bass: filt('lowpass', 800, 0.8, bass), drums: drums };
  }

  // ── 악기 ──────────────────────────────────────────────
  function rhodes(m, t, vel, dur) {
    var f = mf(m), out = ctx.createGain(), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f;
    mg.gain.setValueAtTime(f * 2.1, t); mg.gain.exponentialRampToValueAtTime(f * 0.3, t + 0.3);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vel, t + 0.004);
    out.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.2); out.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    mod.connect(mg); mg.connect(car.frequency); car.connect(out); out.connect(buses.keys);
    var end = t + dur + 0.4; car.start(t); mod.start(t); car.stop(end); mod.stop(end);
  }
  function vibes(m, t, vel) {
    var f = mf(m), out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vel, t + 0.003); out.gain.setTargetAtTime(0.0001, t + 0.02, 0.28);
    out.connect(buses.vib);
    [[1, 1], [4, 0.1], [10, 0.025]].forEach(function (h) { var o = ctx.createOscillator(), g = gain(h[1], out); o.frequency.value = f * h[0]; o.connect(g); o.start(t); o.stop(t + 1.6); });
  }
  function bassNote(m, t, dur) {
    var f = mf(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = gain(0.2, g);
    o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.65, t + 0.15); g.gain.setTargetAtTime(0.0001, t + dur, 0.04);
    o.connect(g); o2.connect(g2); g.connect(buses.bass); o.start(t); o2.start(t); o.stop(t + dur + 0.3); o2.stop(t + dur + 0.3);
  }
  function kick(t, v) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(buses.drums); o.start(t); o.stop(t + 0.28);
    var d = buses.duck.gain; d.cancelScheduledValues(t); d.setValueAtTime(1, t); d.linearRampToValueAtTime(0.8, t + 0.01); d.linearRampToValueAtTime(1, t + 0.18);
  }
  function rim(t, v) {                     // 림샷: 짧고 단단한 '딱'
    var s = ctx.createBufferSource(), f = filt('bandpass', 2400, 1.4), g = ctx.createGain(); s.buffer = white;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    var o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(330, t + 0.03);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.25 * v, t + 0.001); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    var p = panTo(-0.05, buses.drums); s.connect(f); f.connect(g); g.connect(p); o.connect(og); og.connect(p);
    s.start(t); s.stop(t + 0.1); o.start(t); o.stop(t + 0.1);
  }
  function hat(t, v, open) {
    var s = ctx.createBufferSource(), f = filt('highpass', 8500, 0.5), g = ctx.createGain(), p = panTo(0.3, buses.drums); s.buffer = white;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.14 : 0.025));
    s.connect(f); f.connect(g); g.connect(p); s.start(t); s.stop(t + 0.2);
  }

  // ── 악보: 16분음표 한 칸씩 ─────────────────────────────
  function play(step, t) {
    var bar = Math.floor(step / 16), s = step % 16, ci = bar % 4, ch = CHORDS[ci], nx = CHORDS[(bar + 1) % 4];
    var tt = s % 2 ? t + SWING : t;
    COMP.forEach(function (c) { if (c[0] === s) (c[3] ? ch.n.slice(1) : ch.n).forEach(function (m) { rhodes(m, tt, c[2], c[1] * STEP); }); });
    BASS.forEach(function (b) { if (b[0] === s) bassNote(ch.b + b[1], tt, b[2] * STEP); });
    if (s === 14) bassNote(nx.b + 1, tt, STEP * 1.5);                 // 다음 화음으로 반음 위에서 접근
    if (bar % 8 < 4) MEL[ci].forEach(function (n) { if (n[0] === s) vibes(n[1], tt, 0.13); });   // 8마디 중 앞 4마디에 주제
    if (s === 0 || s === 10) kick(t, 1);
    if (s === 7) kick(tt, 0.5);
    if (s === 4 || s === 12) rim(t, 1);
    hat(tt, s % 4 === 0 ? 0.05 : s % 2 ? 0.022 : 0.035, s === 14 && bar % 2 === 1);
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
      var t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.65, t + 0.5);
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
    var t = ctx.currentTime, tf = buses.tone.frequency;
    tf.cancelScheduledValues(t); tf.setValueAtTime(tf.value, t); tf.exponentialRampToValueAtTime(400, t + 0.8);
    [72, 76, 79, 83].forEach(function (m) { vibes(m, t + 0.25, 0.1); });
    setTimeout(function () { stop(900); }, 500);
  }
  function dispose() { stop(300); setTimeout(function () { try { ctx && ctx.close(); } catch (e) {} }, 500); }

  window.SF_SOUND = {
    start: start, stop: stop, dive: dive, dispose: dispose,
    toggle: function () { return on ? (stop(), Promise.resolve(false)) : start(); },
    _render: function (sec) { schedule(sec); },   // 확인용(오프라인 렌더)
    get on() { return on; }
  };
})();
