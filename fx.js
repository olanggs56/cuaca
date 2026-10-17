/* ===== Animasi latar (kanvas): awan, hujan, salju, bintang, kilat, cahaya matahari ===== */
var FX = (function () {
  var cv = document.getElementById("fx"), ctx = cv.getContext("2d");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W = 0, H = 0, dpr = 1, raf = 0, last = 0, scene = null;
  var clouds = [], drops = [], flakes = [], stars = [], flash = 0, nextFlash = 0;

  var CFG = {
    clear: { cl: 4, a: 0.55, rgb: "255,255,255", sp: [4, 10], sun: true },
    cloud: { cl: 9, a: 0.48, rgb: "255,255,255", sp: [5, 14] },
    fog:   { cl: 8, a: 0.4, rgb: "238,243,247", sp: [3, 8], big: true },
    rain:  { cl: 8, a: 0.7, rgb: "56,68,86", sp: [8, 18], rain: 110 },
    storm: { cl: 9, a: 0.78, rgb: "34,42,62", sp: [10, 22], rain: 170, bolt: true },
    snow:  { cl: 6, a: 0.4, rgb: "255,255,255", sp: [3, 8], snow: 80 },
    night: { cl: 3, a: 0.28, rgb: "150,172,225", sp: [3, 7], stars: 90, moon: true }
  };
  var SW = 380, SH = 160;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function sprite(rgb) {
    var c = document.createElement("canvas");
    c.width = SW; c.height = SH;
    var g = c.getContext("2d");
    for (var i = 0; i < 10; i++) {
      var cx = SW * (0.16 + 0.68 * Math.random());
      var cy = SH * (0.4 + 0.15 * Math.random());
      var r = SH * (0.2 + 0.15 * Math.random());
      var rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, "rgba(" + rgb + ",0.9)");
      rg.addColorStop(0.55, "rgba(" + rgb + ",0.45)");
      rg.addColorStop(1, "rgba(" + rgb + ",0)");
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill();
    }
    return c;
  }

  function build() {
    if (!scene) return;
    var c = CFG[scene], i;
    var sp = [sprite(c.rgb), sprite(c.rgb), sprite(c.rgb)];
    clouds = [];
    for (i = 0; i < c.cl; i++) {
      var s = rnd(1.0, 2.1) * (c.big ? 1.4 : 1);
      clouds.push({ x: rnd(-SW * s, W), y: rnd(-20, H * 0.72), s: s, v: rnd(c.sp[0], c.sp[1]), sp: sp[i % 3], a: c.a * rnd(0.6, 1) });
    }
    drops = []; flakes = []; stars = [];
    for (i = 0; i < (c.rain || 0); i++) drops.push({ x: rnd(-40, W + 40), y: rnd(-H, H), l: rnd(14, 26), v: rnd(620, 980) });
    for (i = 0; i < (c.snow || 0); i++) flakes.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(1.2, 3.2), v: rnd(24, 60), ph: rnd(0, 6.28) });
    for (i = 0; i < (c.stars || 0); i++) stars.push({ x: rnd(0, W), y: rnd(0, H * 0.8), r: rnd(0.6, 1.7), ph: rnd(0, 6.28), sp: rnd(0.6, 2.2) });
    nextFlash = performance.now() + rnd(2500, 6000);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (reduce) draw(performance.now());
  }

  function step(dt) {
    var c = CFG[scene], i, d, k;
    for (i = 0; i < clouds.length; i++) {
      k = clouds[i];
      k.x += k.v * dt;
      if (k.x > W + 20) k.x = -SW * k.s;
    }
    for (i = 0; i < drops.length; i++) {
      d = drops[i];
      d.y += d.v * dt; d.x += d.v * dt * 0.2;
      if (d.y > H + 30) { d.y = -30; d.x = rnd(-60, W); }
      if (d.x > W + 40) d.x -= W + 80;
    }
    for (i = 0; i < flakes.length; i++) {
      d = flakes[i];
      d.y += d.v * dt; d.ph += dt;
      d.x += Math.sin(d.ph * 1.3) * 18 * dt;
      if (d.y > H + 6) { d.y = -6; d.x = rnd(0, W); }
    }
    if (c.bolt) {
      var now = performance.now();
      if (now > nextFlash) { flash = 0.7; nextFlash = now + rnd(5000, 12000); }
      if (flash > 0) flash = Math.max(0, flash - dt * 1.7);
    }
  }

  function draw(t) {
    var c = CFG[scene], i, d, g;
    ctx.clearRect(0, 0, W, H);
    if (c.sun) {
      var R = Math.max(W, H) * 0.62;
      g = ctx.createRadialGradient(W * 0.86, H * 0.08, 0, W * 0.86, H * 0.08, R);
      g.addColorStop(0, "rgba(255,238,175," + (0.62 + 0.06 * Math.sin(t / 1600)).toFixed(3) + ")");
      g.addColorStop(0.35, "rgba(255,222,150,0.2)");
      g.addColorStop(1, "rgba(255,222,150,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (c.moon) {
      g = ctx.createRadialGradient(W * 0.8, H * 0.1, 0, W * 0.8, H * 0.1, W * 0.5);
      g.addColorStop(0, "rgba(205,218,255,0.3)");
      g.addColorStop(1, "rgba(205,218,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    for (i = 0; i < stars.length; i++) {
      d = stars[i];
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 1000 * d.sp + d.ph));
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.2832); ctx.fill();
    }
    for (i = 0; i < clouds.length; i++) {
      d = clouds[i];
      ctx.globalAlpha = d.a;
      ctx.drawImage(d.sp, d.x, d.y, SW * d.s, SH * d.s);
    }
    ctx.globalAlpha = 1;
    if (drops.length) {
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1.2; ctx.lineCap = "round";
      ctx.beginPath();
      for (i = 0; i < drops.length; i++) {
        d = drops[i];
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.2, d.y + d.l);
      }
      ctx.stroke();
    }
    if (flakes.length) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (i = 0; i < flakes.length; i++) {
        d = flakes[i];
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.2832); ctx.fill();
      }
    }
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + flash.toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function loop(ts) {
    var dt = Math.min(0.05, (ts - (last || ts)) / 1000);
    last = ts;
    step(dt); draw(ts);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && !reduce && scene) { last = 0; raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.addEventListener("resize", function () { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });

  return {
    set: function (key) {
      if (!CFG[key]) key = "cloud";
      var changed = key !== scene;
      scene = key;
      if (changed || !clouds.length) { resize(); }
      if (reduce) draw(performance.now()); else start();
    }
  };
})();
