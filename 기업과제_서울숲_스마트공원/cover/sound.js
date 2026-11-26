/*
 * 표지 음악 — 몽환 재즈 (Web Audio로 그 자리에서 연주 · 음원 파일·저작권 없음)
 *  - 로즈 피아노(FM 합성, 좌우 코러스, 느린 테이프 흔들림) 화음:
 *    Fmaj7(#11) → Em11 → Ebmaj7(#11) → Dm11 — 반음씩 미끄러져 내려가는 꿈같은 진행
 *  - 비브라폰 멜로디(드문드문), 넓게 부풀었다 사라지는 패드
 *  - 콘트라베이스 퉁김, 브러시 스네어, 라이드 심벌(재즈 스윙), 아주 여린 킥 (100 BPM, 표지는 몇 초만 보이므로 처음부터 바로 전부 연주)
 *  - 메아리 없이 적당한 잔향, 밝은 음색(덜 어둡게)
 * window.SF_SOUND = { start(), stop(ms), toggle(), dive(), dispose(), on }
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로, 표지에서 첫 클릭·터치·키 입력 때 켜짐.
 */
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var ctx = null, master = null, verb = null, echo = null, buses = null, wob = null, on = false, built = false;
  var timer = null, nextStep = 0, nextTime = 0, white = null;

  var BPM = 100, BEAT = 60 / BPM, STEP = BEAT / 3;   // 셋잇단(스윙) 한 칸 = 1/3박, 한 마디 12칸
  var mf = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  var CHORDS = [
    { n: [57, 60, 64, 71], b: 41, sc: [69, 71, 72, 76, 79, 81] },   // Fmaj7(#11)
    { n: [55, 59, 62, 69], b: 40, sc: [67, 69, 71, 74, 76, 79] },   // Em11
    { n: [55, 58, 62, 69], b: 39, sc: [67, 69, 70, 74, 77, 79] },   // Ebmaj7(#11)
    { n: [53, 57, 60, 67], b: 38, sc: [65, 67, 69, 72, 74, 77] }    // Dm11
  ];

  function noise(sec) {
    var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function reverb(sec) {
    var c = ctx.createConvolver(), n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2); }
    c.buffer = b; return c;
  }
  function gain(v, to) { var g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  function filt(type, f, q, to) { var x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; if (to) x.connect(to); return x; }
  function panTo(v, to) { if (!ctx.createStereoPanner) return gain(1, to); var p = ctx.createStereoPanner(); p.pan.value = v; p.connect(to); return p; }

  function build() {
    built = true;
    white = noise(2);
    master = gain(0);
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 2; comp.attack.value = 0.02; comp.release.value = 0.3;
    master.connect(comp); comp.connect(ctx.destination);
    // 긴 잔향(어두운 홀)
    verb = reverb(2.8); var vF = filt('lowpass', 7000), wet = gain(0.3, master); verb.connect(vF); vF.connect(wet);
    // 테이프 흔들림: 아주 느린 음높이 출렁임(모든 건반·비브라폰에 공유)
    wob = gain(5); var wl = ctx.createOscillator(); wl.frequency.value = 0.23; wl.connect(wob); wl.start();

    var keys = gain(0.3, master), vib = gain(0.2, master), pad = gain(0.05, master);
    keys.connect(verb); vib.connect(verb); pad.connect(verb);
    var keysF = filt('lowpass', 4200, 0.2, keys), trem = gain(1, keysF);
    var tl = ctx.createOscillator(), td = gain(0.18, trem.gain); tl.frequency.value = 3.1; tl.connect(td); tl.start();
    var padF = filt('lowpass', 1500, 0.4, pad); var pl = ctx.createOscillator(), pd = gain(400, padF.frequency); pl.frequency.value = 0.05; pl.connect(pd); pl.start();
    var drums = gain(0.6, master), dv = gain(0.35, verb); drums.connect(dv);
    var bass = gain(0.42, master), bassF = filt('lowpass', 700, 0.6, bass); bass.connect(gain(0.12, verb));
    buses = { keys: trem, vib: vib, pad: padF, drums: drums, bass: bassF };
  }

  // ── 악기 ──────────────────────────────────────────────
  function rhodes(m, t, vel, dur, pan) {   // FM 로즈 한 음 (좌우 살짝 다른 음정 = 코러스)
    var f = mf(m), out = ctx.createGain(), p = panTo(pan, buses.keys);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vel, t + 0.01);
    out.gain.exponentialRampToValueAtTime(vel * 0.45, t + 0.6); out.gain.setTargetAtTime(0.0001, t + Math.max(dur, 0.65), 0.3);
    out.connect(p);
    var car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f; car.detune.value = pan * 8; wob.connect(car.detune);
    mg.gain.setValueAtTime(f * 2, t); mg.gain.exponentialRampToValueAtTime(f * 0.25, t + 0.6);
    mod.connect(mg); mg.connect(car.frequency); car.connect(out);
    var end = t + dur + 1.8; car.start(t); mod.start(t); car.stop(end); mod.stop(end);
  }
  function vibes(m, t, vel) {              // 비브라폰: 맑은 사인 + 높은 배음, 모터 트레몰로
    var f = mf(m), out = ctx.createGain(), am = ctx.createGain(), p = panTo(Math.random() * 0.8 - 0.4, buses.vib);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vel, t + 0.004); out.gain.setTargetAtTime(0.0001, t + 0.05, 0.6);
    var lfo = ctx.createOscillator(), ld = gain(0.35, am.gain); am.gain.value = 0.65; lfo.frequency.value = 5.5; lfo.connect(ld);
    out.connect(am); am.connect(p);
    [[1, 1], [4, 0.12], [10, 0.03]].forEach(function (h) {
      var o = ctx.createOscillator(), g = gain(h[1], out); o.frequency.value = f * h[0]; wob.connect(o.detune); o.connect(g); o.start(t); o.stop(t + 5);
    });
    lfo.start(t); lfo.stop(t + 5);
  }
  function padChord(notes, t, dur) {
    notes.concat([notes[0] - 12]).forEach(function (m, i) {
      var o = ctx.createOscillator(), g = ctx.createGain(), p = panTo((i % 2 ? 1 : -1) * 0.6, buses.pad);
      o.type = 'triangle'; o.frequency.value = mf(m); o.detune.value = Math.random() * 14 - 7;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 1.6); g.gain.setValueAtTime(0.22, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
      o.connect(g); g.connect(p); o.start(t); o.stop(t + dur + 0.7);
    });
  }
  function bassNote(m, t, dur, vel) {      // 콘트라베이스 퉁김
    var f = mf(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.012, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); o2.type = 'triangle'; o2.frequency.value = f * 2;
    var g2 = gain(0.25, g);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.015); g.gain.exponentialRampToValueAtTime(vel * 0.45, t + 0.25); g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
    o.connect(g); o2.connect(g2); g.connect(buses.bass); o.start(t); o2.start(t); o.stop(t + dur + 0.8); o2.stop(t + dur + 0.8);
  }
  function brush(t, v) {                   // 브러시 스네어: 쓸어내리는 '쉬익'
    var s = ctx.createBufferSource(), f = filt('bandpass', 2600, 0.5), g = ctx.createGain(), p = panTo(-0.15, buses.drums); s.buffer = white;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.03); g.gain.setTargetAtTime(0.0001, t + 0.05, 0.12);
    s.connect(f); f.connect(g); g.connect(p); s.start(t); s.stop(t + 0.7);
  }
  function ride(t, v) {                    // 라이드 심벌: 높은 금속성 '팅' + 잔향
    var s = ctx.createBufferSource(), f = filt('highpass', 6500, 0.4), g = ctx.createGain(), p = panTo(0.35, buses.drums); s.buffer = white;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * v, t + 0.002); g.gain.setTargetAtTime(0.0001, t + 0.01, 0.18);
    var o = ctx.createOscillator(), og = gain(0); o.type = 'square'; o.frequency.value = 5400 + Math.random() * 300;
    og.gain.setValueAtTime(0.012 * v, t); og.gain.setTargetAtTime(0.0001, t, 0.15); o.connect(og); og.connect(f);
    s.connect(f); f.connect(g); g.connect(p); s.start(t); s.stop(t + 1); o.start(t); o.stop(t + 1);
  }
  function kick(t, v) {                    // 아주 여린 킥(재즈 '페더링')
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(buses.drums); o.start(t); o.stop(t + 0.4);
  }

  // ── 악보: 셋잇단 한 칸씩 (한 마디 = 4박 × 3칸) ────────────
  var melodyBar = -1, phrase = [];
  function play(step, t) {
    var bar = Math.floor(step / 12), s = step % 12, beat = Math.floor(s / 3), sub = s % 3, ch = CHORDS[bar % 4], nx = CHORDS[(bar + 1) % 4];
    var drums = true, hum = (Math.random() - 0.5) * 0.012;   // 사람처럼 살짝 어긋나게
    if (s === 0) {
      padChord(ch.n, t, BEAT * 4);
      ch.n.forEach(function (m, i) { rhodes(m, t + i * 0.028, 0.15 - i * 0.012, BEAT * 2.4, i % 2 ? 0.45 : -0.45); });
    }
    if (beat === 2 && sub === 2) ch.n.slice(1).forEach(function (m, i) { rhodes(m, t + hum + i * 0.02, 0.07, BEAT * 1.2, i % 2 ? -0.4 : 0.4); });   // 셋째 박 뒤 살짝 밀어 치기
    // 비브라폰: 홀수 마디마다 그 화음 음계에서 2~4음을 드문드문
    if (s === 0 && bar !== melodyBar) {
      melodyBar = bar; phrase = [];
      if (true) { var k = 2 + Math.floor(Math.random() * 3), at = [2, 5, 6, 8, 9, 11]; for (var i = 0; i < k; i++) phrase.push([at[Math.floor(Math.random() * at.length)], ch.sc[Math.floor(Math.random() * ch.sc.length)]]); }
    }
    phrase.forEach(function (p) { if (p[0] === s) vibes(p[1], t + hum, 0.09); });
    // 베이스: 1박 근음, 3박 5도, 4박 끝에 다음 화음으로 반음 접근
    {
      if (s === 0) bassNote(ch.b, t, BEAT * 1.6, 0.9);
      if (s === 6) bassNote(ch.b + 7, t + hum, BEAT * 1.2, 0.7);
      if (s === 11) bassNote(nx.b + 1, t + hum, BEAT * 0.3, 0.55);
    }
    if (drums) {
      if (sub === 0 || (sub === 2 && (beat === 1 || beat === 3))) ride(t + hum, sub === 0 ? (beat % 2 ? 1 : 0.8) : 0.55);   // 칭- 칭기-칭 칭기-칭
      if (sub === 0 && (beat === 1 || beat === 3)) brush(t + hum, 1);
      if (s === 0) kick(t, 1);
      if (s === 8 && Math.random() < 0.4) kick(t + hum, 0.6);
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
      var t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.8, t + 0.6);
      if (nextTime < t) { nextStep = 0; nextTime = t + 0.1; melodyBar = -1; }
      clearInterval(timer); timer = setInterval(function () { schedule(ctx.currentTime + 0.2); }, 40);
      schedule(t + 0.2);
      return true;
    }).catch(function () { return false; });
  }
  function stop(ms) {
    if (!on) return; on = false;
    var t = ctx.currentTime, d = (ms == null ? 800 : ms) / 1000;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + d);
    setTimeout(function () { if (!on) { clearInterval(timer); timer = null; nextTime = 0; if (ctx) ctx.suspend(); } }, d * 1000 + 100);
  }
  // 「대시보드 열기」로 서울숲에 파고들 때: 비브라폰 화음이 반짝 울리고 잔향 속으로 사라짐
  function dive() {
    if (!on) return;
    var t = ctx.currentTime;
    [72, 76, 79, 83].forEach(function (m, i) { vibes(m, t + i * 0.06, 0.1); });
    setTimeout(function () { stop(1200); }, 400);
  }
  function dispose() { stop(300); setTimeout(function () { try { ctx && ctx.close(); } catch (e) {} }, 600); }

  window.SF_SOUND = {
    start: start, stop: stop, dive: dive, dispose: dispose,
    toggle: function () { return on ? (stop(), Promise.resolve(false)) : start(); },
    _render: function (sec) { schedule(sec); },   // 확인용(오프라인 렌더)
    get on() { return on; }
  };
})();
