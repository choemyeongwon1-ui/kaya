// 소개 첫 화면 오른쪽 지도를 3D 점구름 도시로 바꾸는 시안입니다.
// - 빌드된 묶음 파일(assets/index-*.js)은 건드리지 않습니다. .intro-map 안에 캔버스를 얹고,
//   원래 Leaflet 지도는 숨겨 둡니다(오른쪽 위 「2D 지도」 버튼으로 언제든 되돌아갑니다).
// - 건물: OpenStreetMap 건물 1,802동(data/city3d.json). 높이 정보가 없는 건물은 면적으로 추정했습니다.
// - 서울숲에서 시작해 바깥으로 퍼지며, 건물이 바닥에서부터 점으로 쌓여 올라옵니다.
// - 서울숲 나무 점의 색은 서울시 실시간 혼잡도(여유·보통·약간 붐빔·붐빔)를 따릅니다.
// - 외부 라이브러리나 키 없이 WebGL만 씁니다. 되돌리려면 이 파일과 index.html의 hero3d.js 줄을 지우면 됩니다.
(function () {
  'use strict';
  var ID = 'nd-city3d';
  var DATA = 'data/city3d.json';
  var PROXY = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-crowd';
  var LOCAL = 'data/live/latest.json';
  var LEVEL = { '여유': [0.33, 0.86, 0.52], '보통': [0.98, 0.78, 0.30], '약간 붐빔': [1.0, 0.56, 0.24], '붐빔': [1.0, 0.36, 0.36] };
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'nd-city3d-off';
  var SKIP = +(new URLSearchParams(location.search).get('c3t') || 0);   // 확인용: ?c3t=6 이면 6초 지난 장면부터 봅니다

  var css = document.createElement('style');
  css.textContent = [
    '#' + ID + '{position:absolute;inset:0;z-index:450;overflow:hidden;background:radial-gradient(120% 90% at 55% 45%,#121a17 0%,#0a0f0d 55%,#050807 100%);cursor:grab;touch-action:pan-y}',
    '#' + ID + '.drag{cursor:grabbing}',
    '#' + ID + ' canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '#' + ID + ' .c3-lab{position:absolute;left:0;top:0;transform:translate(-50%,-100%);white-space:nowrap;pointer-events:none;font-size:11.5px;font-weight:700;letter-spacing:-.01em;color:rgba(255,255,255,.88);text-shadow:0 1px 6px rgba(0,0,0,.8);opacity:0;transition:opacity .8s}',
    '#' + ID + ' .c3-lab.on{opacity:1}',
    '#' + ID + ' .c3-lab.big{font-size:15px;font-weight:800}',
    '#' + ID + ' .c3-lab.st{padding:0 0 0;font-size:11px}',
    '#' + ID + ' .c3-lab.st span{display:inline-block;padding:3px 8px;border-radius:999px;background:rgba(8,12,11,.78);border:1px solid rgba(255,255,255,.16)}',
    '#' + ID + ' .c3-lab.st:after{content:"";display:block;width:1px;height:14px;margin:3px auto 0;background:rgba(255,255,255,.55)}',
    '#' + ID + ' .c3-lab.water{color:rgba(120,170,255,.9)}',
    '#' + ID + ' .c3-now{position:absolute;left:16px;bottom:16px;z-index:2;display:flex;align-items:center;gap:8px;padding:8px 13px;border-radius:999px;background:rgba(12,18,16,.72);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(6px);color:#fff;font-size:12px;font-weight:600}',
    '#' + ID + ' .c3-now i{width:9px;height:9px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}',
    '#' + ID + ' .c3-now b{font-weight:800}',
    '#' + ID + ' .c3-key{position:absolute;right:16px;bottom:16px;z-index:2;display:flex;gap:10px;font-size:10.5px;color:rgba(255,255,255,.6)}',
    '#' + ID + ' .c3-key s{display:inline-block;width:14px;height:2px;margin-right:5px;vertical-align:middle;text-decoration:none}',
    '#' + ID + ' .c3-src{position:absolute;right:16px;bottom:38px;z-index:2;font-size:10px;color:rgba(255,255,255,.4)}',
    '.' + ID + '-btn{position:absolute;right:14px;top:14px;z-index:520;padding:6px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(12,18,16,.72);color:#fff;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;backdrop-filter:blur(6px)}',
    '.' + ID + '-btn:hover{background:rgba(30,40,36,.9)}',
    '.intro-map.c3-on .map-wrap,.intro-map.c3-on>.intro-map-tag{visibility:hidden}',
    '@media(max-width:760px){#' + ID + ' .c3-key{display:none}#' + ID + ' .c3-src{right:auto;left:14px;bottom:auto;top:16px}#' + ID + ' .c3-now{left:12px;bottom:12px;font-size:11.5px}}',
  ].join('');
  document.head.appendChild(css);

  // ---------- 행렬 ----------
  function persp(fy, a, n, f) { var t = 1 / Math.tan(fy / 2), nf = 1 / (n - f); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]; }
  function look(e, c) {
    var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    var xx = -zy, xy = zx, xz = 0; l = Math.hypot(xx, xy) || 1; xx /= l; xy /= l;           // up = +z
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  }
  function mul(a, b) { var o = new Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }

  // ---------- 장면 만들기 ----------
  function rng(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function inside(x, y, r) { var c = false; for (var i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { var yi = r[i + 1], yj = r[j + 1]; if ((yi > y) !== (yj > y) && x < (r[j] - r[i]) * (y - yi) / (yj - yi) + r[i]) c = !c; } return c; }

  function build(D) {
    var P = [], L = [], R = rng(7);
    var W = [0.86, 0.9, 0.96], PARK = [-1, -1, -1];                         // PARK: 실시간 혼잡도 색(유니폼)으로 바꿉니다
    function pt(x, y, z, c, a, d, h) { P.push(x, y, z, c[0], c[1], c[2], a, d, h); }
    function ln(x1, y1, z1, x2, y2, z2, c, a, d, h) { L.push(x1, y1, z1, c[0], c[1], c[2], a, d, h, x2, y2, z2, c[0], c[1], c[2], a, d, h); }
    function poly(f, z, c, a, d, h, closed) { for (var i = 0; i + 3 < f.length; i += 2) ln(f[i], f[i + 1], z, f[i + 2], f[i + 3], z, c, a, d, h); if (closed && f.length > 4) ln(f[f.length - 2], f[f.length - 1], z, f[0], f[1], z, c, a, d, h); }

    // 서울숲 가운데
    var pk = D.park[0], cx = 0, cy = 0; for (var i = 0; i < pk.length; i += 2) { cx += pk[i]; cy += pk[i + 1]; } cx /= pk.length / 2; cy /= pk.length / 2;
    var C = { x: cx, y: cy };
    function far(x, y) { return Math.hypot(x - cx, y - cy) / 1000; }

    // 바닥 격자(100m)
    for (var g = -2400; g <= 2400; g += 100) {
      var a = g % 500 === 0 ? 0.075 : 0.035;
      ln(g, -2400, 0, g, 2400, 0, W, a, Math.abs(g) / 4000, 0);
      ln(-2400, g, 0, 2400, g, 0, W, a, Math.abs(g) / 4000, 0);
    }
    // 한강(파랑) · 큰길(빨강) · 골목(흰색 아주 옅게) · 철도
    D.water.forEach(function (f) { poly(f, 0, [0.3, 0.55, 1], 0.75, 0.35 + far(f[0], f[1]) * 0.3, 0, false); });
    D.major.forEach(function (f) { poly(f, 0, [0.95, 0.28, 0.22], 0.42, 0.5 + far(f[0], f[1]) * 0.6, 0, false); });
    D.minor.forEach(function (f) { poly(f, 0, W, 0.07, 0.6 + far(f[0], f[1]) * 0.6, 0, false); });
    D.rail.forEach(function (f) { poly(f, 0, [0.7, 0.6, 1], 0.25, 0.6 + far(f[0], f[1]) * 0.6, 0, false); });

    // 서울숲 경계와 나무
    D.park.forEach(function (r) { poly(r, 0.5, [0.4, 0.9, 0.6], 0.8, 0.15, 0, true); });
    var bx = [1e9, -1e9, 1e9, -1e9]; D.park.forEach(function (r) { for (var i = 0; i < r.length; i += 2) { bx[0] = Math.min(bx[0], r[i]); bx[1] = Math.max(bx[1], r[i]); bx[2] = Math.min(bx[2], r[i + 1]); bx[3] = Math.max(bx[3], r[i + 1]); } });
    for (var n = 0, tries = 0; n < 1700 && tries < 20000; tries++) {
      var x = bx[0] + R() * (bx[1] - bx[0]), y = bx[2] + R() * (bx[3] - bx[2]);
      if (!D.park.some(function (r) { return inside(x, y, r); })) continue;
      n++;
      var h = 6 + R() * 9, d = 0.25 + far(x, y) * 0.9 + R() * 0.3;
      pt(x, y, 0, PARK, 0.25, d, h);
      for (var k = 0; k < 5; k++) pt(x + (R() - 0.5) * 6, y + (R() - 0.5) * 6, h * (0.5 + R() * 0.5), PARK, 0.5, d, h);
    }

    // 건물: 모서리·층 테두리·외벽을 점으로, 모서리는 선으로
    D.buildings.forEach(function (b) {
      var h = b[0], f = b.slice(1), m = f.length / 2, ax = 0, ay = 0;
      for (var i = 0; i < f.length; i += 2) { ax += f[i]; ay += f[i + 1]; } ax /= m; ay /= m;
      var d = 0.9 + far(ax, ay) * 1.5 + R() * 0.45, tall = Math.min(1, h / 80);
      var col = [W[0] - tall * 0.12, W[1] - tall * 0.04, W[2]];
      for (var i = 0; i < m; i++) {
        var x1 = f[2 * i], y1 = f[2 * i + 1], j = (i + 1) % m, x2 = f[2 * j], y2 = f[2 * j + 1];
        var len = Math.hypot(x2 - x1, y2 - y1), s = Math.max(1, Math.round(len / 3.2));
        for (var k = 0; k < s; k++) {
          var u = k / s, px = x1 + (x2 - x1) * u, py = y1 + (y2 - y1) * u;
          pt(px, py, 0, col, 0.16, d, h); pt(px, py, h, col, 0.62, d, h);
          for (var z = 6.6; z < h - 1; z += 6.6) if (R() < 0.5) pt(px, py, z, col, 0.2, d, h);  // 층
          if (R() < 0.25) pt(px, py, R() * h, col, 0.16, d, h);                                       // 외벽
        }
        for (var z = 0; z <= h; z += 3.3) pt(x1, y1, z, col, 0.42, d, h);                            // 세로 모서리
        ln(x1, y1, 0, x2, y2, 0, col, 0.07, d, h); ln(x1, y1, h, x2, y2, h, col, 0.16, d, h); ln(x1, y1, 0, x1, y1, h, col, 0.1, d, h);
      }
    });
    return { P: new Float32Array(P), L: new Float32Array(L), C: C };
  }

  // ---------- WebGL ----------
  var VS = [
    'attribute vec3 p;attribute vec4 c;attribute vec2 r;',
    'uniform mat4 m;uniform float t,px;uniform mediump float mode;uniform vec3 park;varying mediump vec4 vc;',   // mode·vc는 두 셰이더의 정밀도가 같아야 연결됩니다
    'void main(){',
    ' float pr=clamp((t-r.x)/1.9,0.,1.);pr=1.-pow(1.-pr,3.);',
    ' float front=pr*(r.y+.01);vec3 q=p;vec4 col=c;if(col.r<0.)col.rgb=park;',
    ' if(mode>.5){q.z=min(p.z,front);col.a*=smoothstep(0.,.1,pr);}',
    ' else{',
    '  if(pr<=0.||p.z>front+.001){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;vc=vec4(0.);return;}',
    '  float glow=(1.-smoothstep(0.,5.,front-p.z))*(1.-smoothstep(.8,1.,pr));',
    '  col.rgb=mix(col.rgb,vec3(1.),glow*.85);col.a=min(1.,col.a+glow*.7);',
    ' }',
    ' gl_Position=m*vec4(q,1.);',
    ' gl_PointSize=clamp(3000./gl_Position.w,1.,2.4)*px;vc=col;}',
  ].join('\n');
  var FS = 'precision mediump float;varying vec4 vc;uniform float mode;void main(){if(mode<.5){vec2 d=gl_PointCoord-.5;if(dot(d,d)>.25)discard;}gl_FragColor=vec4(vc.rgb*vc.a,vc.a);}';

  function sh(gl, type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }

  function Scene(box, D) {
    var cv = document.createElement('canvas'); box.appendChild(cv);
    var gl = cv.getContext('webgl', { antialias: true, premultipliedAlpha: true, alpha: true });
    if (!gl) throw new Error('webgl');
    var pg = gl.createProgram(); gl.attachShader(pg, sh(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl, gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
    if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pg));
    gl.useProgram(pg);
    var S = build(D), U = {}; ['m', 't', 'mode', 'px', 'park'].forEach(function (k) { U[k] = gl.getUniformLocation(pg, k); });
    var A = { p: gl.getAttribLocation(pg, 'p'), c: gl.getAttribLocation(pg, 'c'), r: gl.getAttribLocation(pg, 'r') };
    function buf(arr) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return { b: b, n: arr.length / 9 }; }
    var BP = buf(S.P), BL = buf(S.L);
    function bind(B) { gl.bindBuffer(gl.ARRAY_BUFFER, B.b); gl.enableVertexAttribArray(A.p); gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 36, 0); gl.enableVertexAttribArray(A.c); gl.vertexAttribPointer(A.c, 4, gl.FLOAT, false, 36, 12); gl.enableVertexAttribArray(A.r); gl.vertexAttribPointer(A.r, 2, gl.FLOAT, false, 36, 28); }
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);     // 겹쳐도 하얗게 뭉개지지 않도록 일반 합성
    gl.uniform3fv(U.park, LEVEL['여유']);

    // 이름표
    var o = D.origin, KX = 111320 * Math.cos(o[1] * Math.PI / 180);
    function at(lon, lat) { return [(lon - o[0]) * KX, (lat - o[1]) * 111320]; }
    var labs = [
      { t: '서울숲', p: [S.C.x, S.C.y, 40], c: 'big', at: 1.2 },
      { t: '서울숲역', p: at(127.04471, 37.54362).concat(30), c: 'st', at: 2.6 },
      { t: '뚝섬역', p: at(127.04737, 37.54718).concat(30), c: 'st', at: 2.8 },
      { t: '성수동', p: at(127.0565, 37.5445).concat(60), c: 'big', at: 3.4 },
      { t: '한강', p: [60, -1010, 0], c: 'water', at: 1.0 },
      { t: '중랑천', p: [-720, 470, 0], c: 'water', at: 1.4 },
    ].map(function (l) { var e = document.createElement('div'); e.className = 'c3-lab ' + l.c; var sp = document.createElement('span'); sp.textContent = l.t; e.appendChild(sp); box.appendChild(e); l.el = e; return l; });

    var cam = { yaw: -0.5, pitch: 0.74, dist: 3000, tx: S.C.x + 420, ty: S.C.y + 120 };
    var t0 = performance.now(), last = t0, idle = 0, drag = null, W = 0, H = 0, dpr = 1, run = true, visible = true;

    function size() { dpr = Math.min(2, window.devicePixelRatio || 1); W = box.clientWidth; H = box.clientHeight; cv.width = Math.max(1, W * dpr | 0); cv.height = Math.max(1, H * dpr | 0); gl.viewport(0, 0, cv.width, cv.height); }
    size(); if (window.ResizeObserver) new ResizeObserver(size).observe(box);
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible && run) loop(); }).observe(box);

    box.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; box.classList.add('drag'); box.setPointerCapture(e.pointerId); });
    box.addEventListener('pointermove', function (e) { if (!drag) return; cam.yaw -= (e.clientX - drag.x) * 0.006; cam.pitch = Math.max(0.3, Math.min(1.35, cam.pitch + (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; idle = 0; });
    function up() { drag = null; box.classList.remove('drag'); }
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);

    var raf = 0;
    function frame(now) {
      raf = 0;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      var t = REDUCED ? 99 : (now - t0) / 1000 + SKIP;
      idle += dt; if (!REDUCED && !drag && idle > 2.5) cam.yaw += dt * 0.035;
      var cp = Math.cos(cam.pitch), eye = [cam.tx + Math.sin(cam.yaw) * cp * cam.dist, cam.ty - Math.cos(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist];
      var M = mul(persp(0.62, W / Math.max(1, H), 20, 9000), look(eye, [cam.tx, cam.ty, 0]));
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniformMatrix4fv(U.m, false, new Float32Array(M)); gl.uniform1f(U.t, t); gl.uniform1f(U.px, dpr);
      gl.uniform1f(U.mode, 1); bind(BL); gl.drawArrays(gl.LINES, 0, BL.n);
      gl.uniform1f(U.mode, 0); bind(BP); gl.drawArrays(gl.POINTS, 0, BP.n);
      labs.forEach(function (l) {
        var x = l.p[0], y = l.p[1], z = l.p[2], w = M[3] * x + M[7] * y + M[11] * z + M[15];
        var sx = (M[0] * x + M[4] * y + M[8] * z + M[12]) / w, sy = (M[1] * x + M[5] * y + M[9] * z + M[13]) / w;
        var ok = w > 0 && Math.abs(sx) < 0.95 && Math.abs(sy) < 0.95 && t > l.at;
        l.el.classList.toggle('on', ok);
        if (ok) l.el.style.transform = 'translate(' + ((sx + 1) / 2 * W).toFixed(1) + 'px,' + ((1 - sy) / 2 * H).toFixed(1) + 'px) translate(-50%,-100%)';
      });
      if (run && visible && box.isConnected && !(REDUCED && !drag && idle > 0.2)) loop();
    }
    function loop() { if (!raf) raf = requestAnimationFrame(frame); }
    box.addEventListener('pointermove', function () { if (drag) loop(); });
    loop();
    return {
      level: function (lv) { gl.uniform3fv(U.park, LEVEL[lv] || LEVEL['보통']); loop(); },
      pause: function (p) { run = !p; if (run) { last = performance.now(); loop(); } },
    };
  }

  // ---------- 화면에 붙이기 ----------
  var box = null, scene = null, btn = null, nowEl = null, data = null, off = sessionStorage.getItem(KEY) === '1';

  function make() {
    box = document.createElement('div'); box.id = ID; box.setAttribute('role', 'img');
    box.setAttribute('aria-label', '서울숲과 성수동 일대의 3D 점구름 지도. 끌어서 돌려 볼 수 있습니다.');
    nowEl = document.createElement('div'); nowEl.className = 'c3-now'; nowEl.innerHTML = '<i style="color:#55db85"></i>서울숲 지금 <b>불러오는 중</b>';
    var key = document.createElement('div'); key.className = 'c3-key';
    key.innerHTML = '<span><s style="background:#f0473a"></s>큰길</span><span><s style="background:#4d8cff"></s>물길</span><span><s style="background:#b39cff"></s>철도</span><span><s style="background:#e8eef6"></s>건물</span>';
    var src = document.createElement('div'); src.className = 'c3-src'; src.textContent = '© OpenStreetMap 기여자 · 건물 높이 일부 추정';
    box.appendChild(nowEl); box.appendChild(key); box.appendChild(src);
    btn = document.createElement('button'); btn.type = 'button'; btn.className = ID + '-btn';
    btn.addEventListener('click', function () { off = !off; sessionStorage.setItem(KEY, off ? '1' : '0'); apply(); });
  }

  function apply() {
    var host = document.querySelector('.intro .intro-map');
    if (!host || dead) return;
    if (!box) make();
    if (btn.parentNode !== host) host.appendChild(btn);
    var label = off ? '3D로 보기' : '2D 지도';
    if (btn.textContent !== label) btn.textContent = label;          // 같은 글자를 다시 쓰면 감시가 끝없이 돕니다
    host.classList.toggle('c3-on', !off);
    if (off) { if (box.parentNode) box.remove(); if (scene && !wasOff) scene.pause(true); wasOff = true; return; }
    if (box.parentNode !== host) host.appendChild(box);
    if (!data) return;
    if (!scene) { try { scene = Scene(box, data); if (lvl) scene.level(lvl.level); } catch (e) { dead = true; host.classList.remove('c3-on'); btn.remove(); box.remove(); return; } }   // WebGL을 못 쓰면 원래 2D 지도 그대로
    else if (wasOff) scene.pause(false);
    wasOff = false;
  }

  var lvl = null, wasOff = false, dead = false;
  function showLevel(d) {
    if (!d || !d.level) return;
    lvl = d; var c = LEVEL[d.level] || LEVEL['보통'];
    var rgb = 'rgb(' + c.map(function (v) { return Math.round(v * 255); }).join(',') + ')';
    var t = String(d.time || '').slice(11, 16);
    var n = d.min ? ' · ' + Math.round(d.min).toLocaleString() + '~' + Math.round(d.max).toLocaleString() + '명' : '';
    nowEl.innerHTML = '<i style="color:' + rgb + '"></i>서울숲 지금 <b style="color:' + rgb + '">' + d.level + '</b>' + n + (t ? ' · ' + t : '');
    if (scene) scene.level(d.level);
  }

  fetch(DATA).then(function (r) { return r.json(); }).then(function (d) { data = d; apply(); }).catch(function () {});
  function getJSON(u, ms) { return Promise.race([fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }), new Promise(function (_, no) { setTimeout(no, ms); })]); }
  function refresh() {
    getJSON(PROXY, 6000).then(function (d) { return d && d.level ? { level: d.level, min: d.min, max: d.max, time: d.time } : getJSON(LOCAL, 6000); })
      .catch(function () { return getJSON(LOCAL, 6000); }).then(function (d) { if (!box) make(); showLevel(d); }).catch(function () {});
  }
  refresh(); setInterval(refresh, 5 * 60 * 1000);

  var root = document.getElementById('root') || document.body, busy = false;
  new MutationObserver(function () { if (busy) return; busy = true; try { apply(); } finally { busy = false; } }).observe(root, { childList: true, subtree: true });
  apply();
})();
