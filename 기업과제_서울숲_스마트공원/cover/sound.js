/*
 * 표지 도시 소리 (Web Audio로 그 자리에서 만듦 — 음원 파일·저작권 없음)
 *  - 낮게 깔리는 도시 웅웅거림(먼 차 소리)
 *  - 가끔 좌우로 지나가는 차
 *  - 서울숲 나뭇잎을 스치는 바람
 *  - 아주 가끔 먼 지하철 소리
 * window.SF_SOUND = { start(), stop(ms), toggle(), dive(), on }
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로, 표지에서 첫 클릭·터치·키 입력 때 켜짐.
 */
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var ctx = null, master = null, verb = null, timers = [], on = false, built = false;

  function noiseBuf(kind, sec) {
    var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), last = 0, b0 = 0, b1 = 0, b2 = 0;
      for (var i = 0; i < n; i++) {
        var w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else if (kind === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6; }
        else d[i] = w;
      }
    }
    return b;
  }
  function loop(buf) { var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); return s; }
  function reverb(sec) {
    var c = ctx.createConvolver(), n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    c.buffer = b; return c;
  }
  function lfo(param, rate, depth, base) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth; param.value = base;
    o.connect(g); g.connect(param); o.start(); return o;
  }
  function every(minS, maxS, fn) {
    (function next() { timers.push(setTimeout(function () { if (on) fn(); next(); }, (minS + Math.random() * (maxS - minS)) * 1000)); })();
  }

  function build() {
    built = true;
    master = ctx.createGain(); master.gain.value = 0;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ctx.destination);
    verb = reverb(3.4); var wet = ctx.createGain(); wet.gain.value = 0.55; verb.connect(wet); wet.connect(master);
    var brown = noiseBuf('brown', 6), pink = noiseBuf('pink', 6), white = noiseBuf('white', 3);

    // 1) 도시 웅웅거림: 갈색 잡음 저역 + 천천히 숨쉬듯
    var r = loop(brown), rf = ctx.createBiquadFilter(), rg = ctx.createGain();
    rf.type = 'lowpass'; rf.frequency.value = 160;
    lfo(rg.gain, 0.045, 0.08, 0.32);
    r.connect(rf); rf.connect(rg); rg.connect(master); r.start();
    // 2) 먼 도심 잡음(분홍 잡음 중역, 아주 작게)
    var p = loop(pink), pf = ctx.createBiquadFilter(), pg = ctx.createGain();
    pf.type = 'bandpass'; pf.Q.value = 0.7; lfo(pf.frequency, 0.03, 120, 420);
    pg.gain.value = 0.05; p.connect(pf); pf.connect(pg); pg.connect(master); p.start();

    // 3) 숲 바람: 나뭇잎이 스치는 소리, 천천히 불었다 잦아듦(좌우 따로)
    [-0.6, 0.6].forEach(function (pn, i) {
      var w = loop(pink), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      hp.type = 'highpass'; hp.frequency.value = 700; lp.type = 'lowpass'; lfo(lp.frequency, 0.05 + i * 0.02, 1200, 2600);
      lfo(g.gain, 0.06 + i * 0.025, 0.035, 0.045);
      w.connect(hp); hp.connect(lp); lp.connect(g);
      if (ctx.createStereoPanner) { var pp = ctx.createStereoPanner(); pp.pan.value = pn; g.connect(pp); pp.connect(master); } else g.connect(master);
      w.start();
    });

    // 4) 지나가는 차: 낮은 엔진음 + 타이어 쉭 소리가 다가왔다 멀어지며 좌→우(또는 우→좌)
    every(3, 8, function () {
      var t = ctx.currentTime, dur = 3.5 + Math.random() * 3, dir = Math.random() < 0.5 ? -1 : 1, peak = 0.06 + Math.random() * 0.08;
      var out = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(peak, t + dur * 0.5); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (pan) { pan.pan.setValueAtTime(-0.85 * dir, t); pan.pan.linearRampToValueAtTime(0.85 * dir, t + dur); out.connect(pan); pan.connect(master); } else out.connect(master);
      // 엔진(낮은 웅)
      var e = loop(brown), ef = ctx.createBiquadFilter(), eg = ctx.createGain();
      ef.type = 'lowpass'; ef.frequency.setValueAtTime(140, t); ef.frequency.linearRampToValueAtTime(260, t + dur * 0.5); ef.frequency.linearRampToValueAtTime(110, t + dur);
      eg.gain.value = 1.1; e.connect(ef); ef.connect(eg); eg.connect(out);
      // 타이어(쉭) — 가까워질수록 밝게, 멀어지면 낮게(도플러 느낌)
      var r = ctx.createBufferSource(), rf = ctx.createBiquadFilter(), rg = ctx.createGain();
      r.buffer = white; r.loop = true; rf.type = 'bandpass'; rf.Q.value = 0.6;
      rf.frequency.setValueAtTime(700, t); rf.frequency.linearRampToValueAtTime(1500, t + dur * 0.48); rf.frequency.linearRampToValueAtTime(550, t + dur);
      rg.gain.value = 0.35; r.connect(rf); rf.connect(rg); rg.connect(out);
      e.start(t); e.stop(t + dur + 0.1); r.start(t); r.stop(t + dur + 0.1);
    });

    // 6) 먼 지하철: 낮은 굉음 + 철컥철컥(바퀴 이음매)
    every(18, 32, function () {
      var t = ctx.currentTime, dur = 7, s = loop(brown), f = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 320;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      var clack = ctx.createOscillator(), cg = ctx.createGain(); clack.type = 'square'; clack.frequency.value = 3.2; cg.gain.value = 0.35; am.gain.value = 0.65;
      clack.connect(cg); cg.connect(am.gain);
      s.connect(f); f.connect(am); am.connect(g); g.connect(master); s.start(t); s.stop(t + dur); clack.start(t); clack.stop(t + dur);
    });
  }

  function start() {
    if (on) return Promise.resolve(true);
    try { if (!ctx) ctx = new AC(); } catch (e) { return Promise.resolve(false); }
    // 첫 클릭 전에는 resume()이 끝나지 않고 멈춰 있을 수 있어 0.4초까지만 기다림
    return Promise.race([ctx.resume(), new Promise(function (ok) { setTimeout(ok, 400); })]).then(function () {
      if (ctx.state !== 'running' || on) return on;
      if (!built) build();
      on = true;
      var t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0.8, t + 3);
      return true;
    }).catch(function () { return false; });
  }
  function stop(ms) {
    if (!on) return; on = false;
    var t = ctx.currentTime, d = (ms == null ? 600 : ms) / 1000;
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + d);
    setTimeout(function () { if (!on && ctx) ctx.suspend(); }, d * 1000 + 100);
  }
  // 「대시보드 열기」로 서울숲에 파고들 때: 쑥 올라가는 바람 소리 뒤 서서히 꺼짐
  function dive() {
    if (!on) return;
    var t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf('white', 2); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3200, t + 1.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    s.connect(f); f.connect(g); g.connect(master); g.connect(verb); s.start(t); s.stop(t + 1.5);
    setTimeout(function () { stop(900); }, 500);
  }
  function dispose() { stop(300); timers.forEach(clearTimeout); timers = []; setTimeout(function () { try { ctx && ctx.close(); } catch (e) {} }, 500); }

  window.SF_SOUND = {
    start: start, stop: stop, dive: dive, dispose: dispose,
    toggle: function () { return on ? (stop(), Promise.resolve(false)) : start(); },
    get on() { return on; }
  };
})();
