/* ===== Animasi latar (kanvas) =====
   Matahari berpendar dengan sinar berputar, bulan sesuai fase asli, bintang berkelip dan jatuh,
   awan berlapis, hujan dua lapis dengan tetes di kaca, kilat bercabang, salju, kabut, senja. */
var FX = (function () {
  var cv = document.getElementById("fx"), ctx = cv.getContext("2d");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W = 0, H = 0, dpr = 1, raf = 0, last = 0, scene = null, opt = { wind: 0.2, sun: false, speed: 1 };
  var clouds = [], drops = [], flakes = [], stars = [], beads = [], mist = [], motes = [];
  var flash = 0, nextFlash = 0, bolt = null, shoot = null, nextShoot = 0, nextBead = 0;

  var CFG = {
    clear: { cl: 4, a: 0.5, rgb: "255,255,255", sp: [4, 10], sun: true, motes: 26 },
    cloud: { cl: 9, a: 0.48, rgb: "255,255,255", sp: [5, 14] },
    fog:   { cl: 6, a: 0.38, rgb: "238,243,247", sp: [3, 8], big: true, mist: true },
    rain:  { cl: 8, a: 0.7, rgb: "56,68,86", sp: [8, 18], rain: 130, beads: true },
    storm: { cl: 9, a: 0.78, rgb: "34,42,62", sp: [10, 22], rain: 190, bolt: true, beads: true },
    snow:  { cl: 6, a: 0.4, rgb: "255,255,255", sp: [3, 8], snow: 90 },
    night: { cl: 3, a: 0.28, rgb: "150,172,225", sp: [3, 7], stars: 100, moon: true, shoot: true },
    dusk:  { cl: 7, a: 0.5, rgb: "255,196,170", sp: [4, 10], sun: true, low: true, horizon: true, motes: 30 }
  };
  var SW = 380, SH = 160, TAU = Math.PI * 2;

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
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
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
      clouds.push({ x: rnd(-SW * s, W), y: rnd(-20, H * 0.72), s: s, v: rnd(c.sp[0], c.sp[1]) * (0.55 + 0.45 * s), sp: sp[i % 3], a: c.a * rnd(0.6, 1), ph: rnd(0, TAU), bob: rnd(3000, 6000) });
    }
    drops = []; flakes = []; stars = []; beads = []; mist = []; motes = [];
    var n = c.rain || 0;
    for (i = 0; i < n; i++) {
      var near = i % 3 === 0;                                  // sepertiga tetes dekat (besar, cepat), sisanya jauh
      drops.push({ x: rnd(-60, W + 60), y: rnd(-H, H), near: near,
        l: near ? rnd(20, 32) : rnd(9, 15), v: near ? rnd(1000, 1350) : rnd(520, 760) });
    }
    for (i = 0; i < (c.snow || 0); i++) {
      var big = i % 4 === 0;
      flakes.push({ x: rnd(0, W), y: rnd(0, H), r: big ? rnd(2.4, 4) : rnd(1, 2.2), v: big ? rnd(46, 74) : rnd(22, 44), ph: rnd(0, TAU), sw: rnd(10, 26) });
    }
    for (i = 0; i < (c.stars || 0); i++) stars.push({ x: rnd(0, W), y: rnd(0, H * 0.82), r: rnd(0.5, 1.7), ph: rnd(0, TAU), sp: rnd(0.6, 2.4), tint: Math.random() < 0.2 ? "255,226,190" : Math.random() < 0.3 ? "190,210,255" : "255,255,255" });
    for (i = 0; i < (c.motes || 0); i++) motes.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(1.2, 3.6), vx: rnd(-4, 8), vy: rnd(4, 16), ph: rnd(0, TAU), sp: rnd(0.4, 1.4), a: rnd(0.25, 0.6) });
    if (c.mist) for (i = 0; i < 4; i++) mist.push({ y: H * (0.14 + 0.22 * i), x: rnd(0, W), v: rnd(6, 16) * (i % 2 ? -1 : 1), ph: rnd(0, TAU) });
    var now = performance.now();
    nextFlash = now + rnd(2500, 6000);
    nextShoot = now + rnd(3000, 8000); shoot = null; bolt = null; nextBead = now;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (reduce) draw(performance.now());
  }

  // Petir bercabang: titik-titik zig-zag dari atas ke tengah layar.
  function makeBolt() {
    var x = rnd(W * 0.15, W * 0.85), y = -10, pts = [[x, y]], i, br = [];
    var steps = 9, endY = H * rnd(0.4, 0.65);
    for (i = 1; i <= steps; i++) {
      x += rnd(-38, 38); y = endY * i / steps;
      pts.push([x, y]);
      if (i > 2 && i < steps - 1 && Math.random() < 0.4) {
        var bx = x, by = y, seg = [[bx, by]];
        for (var j = 0; j < 3; j++) { bx += rnd(10, 36) * (Math.random() < 0.5 ? -1 : 1); by += rnd(18, 34); seg.push([bx, by]); }
        br.push(seg);
      }
    }
    return { main: pts, br: br };
  }

  // Umur bulan 0..1 (0 = bulan baru), dari bulan baru acuan 6 Jan 2000 18:14 UTC.
  function moonPhase() {
    var d = (Date.now() - 947182440000) / 86400000;
    return (((d / 29.530588853) % 1) + 1) % 1;
  }

  function step(dt, now) {
    var c = CFG[scene], i, d, k, slant = opt.wind;
    for (i = 0; i < clouds.length; i++) {
      k = clouds[i];
      k.x += k.v * dt * opt.speed;
      if (k.x > W + 20) k.x = -SW * k.s;
    }
    for (i = 0; i < drops.length; i++) {
      d = drops[i];
      d.y += d.v * dt; d.x += d.v * dt * slant;
      if (d.y > H + 40) { d.y = -40; d.x = rnd(-80, W); }
      if (d.x > W + 60) d.x -= W + 120;
    }
    for (i = 0; i < flakes.length; i++) {
      d = flakes[i];
      d.y += d.v * dt; d.ph += dt;
      d.x += Math.sin(d.ph * 1.2) * d.sw * dt;
      if (d.y > H + 8) { d.y = -8; d.x = rnd(0, W); }
    }
    for (i = 0; i < motes.length; i++) {                    // debu cahaya melayang pelan, terbawa angin
      d = motes[i]; d.x += (d.vx + opt.speed * 6) * dt; d.y -= d.vy * dt;
      if (d.y < -10) { d.y = H + 10; d.x = rnd(0, W); }
      if (d.x > W + 10) d.x = -10; else if (d.x < -10) d.x = W + 10;
    }
    for (i = 0; i < mist.length; i++) { mist[i].x += mist[i].v * dt; if (mist[i].x > W * 1.3) mist[i].x = -W * 0.3; if (mist[i].x < -W * 0.3) mist[i].x = W * 1.3; }
    if (c.bolt) {
      if (now > nextFlash) { flash = 0.75; bolt = makeBolt(); nextFlash = now + rnd(4500, 11000); if (Math.random() < 0.4) nextFlash = now + 260; }
      if (flash > 0) flash = Math.max(0, flash - dt * 1.9);
    }
    if (c.shoot) {
      if (!shoot && now > nextShoot) {
        var a = rnd(0.35, 0.6);
        shoot = { x: rnd(W * 0.1, W * 0.7), y: rnd(0, H * 0.3), vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, life: 0 };
        nextShoot = now + rnd(5000, 12000);
      }
      if (shoot) { shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; shoot.life += dt; if (shoot.life > 0.9) shoot = null; }
    }
    if (c.beads) {                                          // tetes air menempel di kaca layar, lalu meluncur turun
      if (now > nextBead && beads.length < 16) { beads.push({ x: rnd(10, W - 10), y: rnd(10, H * 0.8), r: 0, rmax: rnd(2.2, 5.2), v: 0, trail: 0, life: 0, slide: Math.random() < 0.6 }); nextBead = now + rnd(250, 900); }
      for (i = beads.length - 1; i >= 0; i--) {
        d = beads[i]; d.life += dt;
        if (d.r < d.rmax) d.r += dt * 2.2;
        else if (d.slide) { d.v = Math.min(d.v + dt * 50 * (d.rmax / 3), 120); d.y += d.v * dt; d.trail = Math.min(d.trail + d.v * dt, 90); }
        if (d.y > H + 10 || d.life > (d.slide ? 14 : 9)) beads.splice(i, 1);
      }
    }
  }

  function drawSun(t, c) {
    var sx = W * (c.low ? 0.76 : 0.84), sy = H * (c.low ? 0.27 : 0.105);
    var dim = c.dim || 1, i, g, R = Math.max(W, H) * 0.62;
    var warm = c.low ? "255,196,140" : "255,232,165";
    g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
    g.addColorStop(0, "rgba(" + warm + "," + ((0.6 + 0.06 * Math.sin(t / 1600)) * dim).toFixed(3) + ")");
    g.addColorStop(0.35, "rgba(" + warm + "," + (0.2 * dim).toFixed(3) + ")");
    g.addColorStop(1, "rgba(" + warm + ",0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(t / 11000);
    ctx.fillStyle = "rgba(255,246,210," + (0.1 * dim).toFixed(3) + ")";
    for (i = 0; i < 16; i++) {
      ctx.rotate(TAU / 16);
      var len = (i % 2 ? 110 : 190) * (1 + 0.12 * Math.sin(t / 900 + i));
      ctx.beginPath(); ctx.moveTo(-6, -40); ctx.lineTo(0, -40 - len); ctx.lineTo(6, -40); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 34);
    g.addColorStop(0, "rgba(255,255,244," + dim + ")");
    g.addColorStop(0.62, "rgba(255,240,170," + (0.95 * dim).toFixed(3) + ")");
    g.addColorStop(1, "rgba(255,214,120,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 34, 0, TAU); ctx.fill();
    // kilau lensa di sepanjang garis ke tengah-bawah layar
    var tx = W * 0.4, ty = H * 0.85, f = [0.3, 0.52, 0.78];
    for (i = 0; i < f.length; i++) {
      var fx = sx + (tx - sx) * f[i], fy = sy + (ty - sy) * f[i], fr = 14 + i * 12;
      ctx.fillStyle = "rgba(255,226,170," + ((0.05 + 0.025 * Math.sin(t / 1300 + i * 2)) * dim).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, TAU); ctx.fill();
    }
  }

  function drawMoon(t) {
    var mx = W * 0.8, my = H * 0.1, r = 26, p = moonPhase(), waxing = p < 0.5, q = waxing ? p : 1 - p, g;
    g = ctx.createRadialGradient(mx, my, r * 0.6, mx, my, W * 0.5);
    g.addColorStop(0, "rgba(205,218,255," + (0.3 + 0.03 * Math.sin(t / 2200)).toFixed(3) + ")");
    g.addColorStop(1, "rgba(205,218,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(mx, my);
    ctx.fillStyle = "rgba(40,56,100,0.62)";                 // sisi gelap bulan
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    if (!waxing) ctx.scale(-1, 1);
    var cs = Math.cos(q * TAU), rx = Math.abs(cs) * r;
    ctx.fillStyle = "#f6f2d6";
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);     // tepi sisi terang
    if (cs > 0) ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, true);    // sabit: terminator melengkung ke kanan
    else ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, Math.PI * 1.5, false);          // cembung: terminator melengkung ke kiri
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(170,165,140,0.28)";               // kawah
    ctx.beginPath(); ctx.arc(-6, -6, 5, 0, TAU); ctx.arc(8, 4, 3.6, 0, TAU); ctx.arc(-3, 11, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function draw(t) {
    var c = CFG[scene], i, d, g, T = t / 1000;
    ctx.clearRect(0, 0, W, H);
    if (c.sun) drawSun(t, c);
    else if (opt.sun) drawSun(t, { dim: 0.55 });
    if (c.horizon) {
      g = ctx.createRadialGradient(W * 0.5, H * 1.02, 0, W * 0.5, H * 1.02, H * 0.7);
      g.addColorStop(0, "rgba(255,150,100,0.4)"); g.addColorStop(1, "rgba(255,150,100,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (c.moon) drawMoon(t);

    for (i = 0; i < stars.length; i++) {
      d = stars[i];
      var tw = 0.5 + 0.5 * Math.sin(T * d.sp + d.ph);
      ctx.globalAlpha = 0.3 + 0.7 * tw;
      ctx.fillStyle = "rgb(" + d.tint + ")";
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (0.85 + 0.3 * tw), 0, TAU); ctx.fill();
      if (d.r > 1.35) {                                      // bintang terang: kilau silang
        ctx.globalAlpha = 0.25 * tw; ctx.strokeStyle = "rgb(" + d.tint + ")"; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(d.x - 5, d.y); ctx.lineTo(d.x + 5, d.y); ctx.moveTo(d.x, d.y - 5); ctx.lineTo(d.x, d.y + 5); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (shoot) {                                             // bintang jatuh
      var al = 1 - shoot.life / 0.9, mag = Math.hypot(shoot.vx, shoot.vy);
      g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx / mag * 90, shoot.y - shoot.vy / mag * 90);
      g.addColorStop(0, "rgba(255,255,255," + al.toFixed(3) + ")"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = g; ctx.lineWidth = 1.8; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx / mag * 90, shoot.y - shoot.vy / mag * 90); ctx.stroke();
    }

    for (i = 0; i < mist.length; i++) {                      // pita kabut
      d = mist[i];
      ctx.save();
      ctx.translate(d.x, d.y + Math.sin(T * 0.3 + d.ph) * 14); ctx.scale(1, 0.2);
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.9);
      g.addColorStop(0, "rgba(236,242,247," + (0.3 + 0.08 * Math.sin(T * 0.5 + d.ph)).toFixed(3) + ")"); g.addColorStop(1, "rgba(236,242,247,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, W * 0.9, 0, TAU); ctx.fill();
      ctx.restore();
    }
    for (i = 0; i < clouds.length; i++) {
      d = clouds[i];
      ctx.globalAlpha = d.a;
      ctx.drawImage(d.sp, d.x, d.y + Math.sin(t / d.bob + d.ph) * 5, SW * d.s, SH * d.s);
    }
    ctx.globalAlpha = 1;

    for (i = 0; i < motes.length; i++) {                     // kilau debu cahaya
      d = motes[i];
      var ma = d.a * (0.5 + 0.5 * Math.sin(T * d.sp + d.ph));
      ctx.fillStyle = "rgba(255,246,214," + ma.toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,246,214," + (ma * 0.22).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 3, 0, TAU); ctx.fill();
    }
    if (drops.length) {
      var sl = opt.wind;
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 0.9; ctx.beginPath();
      for (i = 0; i < drops.length; i++) { d = drops[i]; if (!d.near) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * sl, d.y + d.l); } }
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1.5; ctx.beginPath();
      for (i = 0; i < drops.length; i++) { d = drops[i]; if (d.near) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * sl, d.y + d.l); } }
      ctx.stroke();
    }
    for (i = 0; i < beads.length; i++) {                     // tetes di kaca
      d = beads[i];
      var fade = Math.min(1, d.life / 0.6) * Math.min(1, (d.slide ? 14 : 9) - d.life);
      if (d.trail > 1) {
        ctx.strokeStyle = "rgba(255,255,255," + (0.1 * fade).toFixed(3) + ")"; ctx.lineWidth = Math.max(1, d.r * 0.7);
        ctx.beginPath(); ctx.moveTo(d.x, d.y - d.trail); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255," + (0.16 * fade).toFixed(3) + ")";
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 1.2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255," + (0.35 * fade).toFixed(3) + ")"; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255," + (0.7 * fade).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.4, Math.max(0.5, d.r * 0.24), 0, TAU); ctx.fill();
    }
    if (flakes.length) {
      for (i = 0; i < flakes.length; i++) {
        d = flakes[i];
        ctx.fillStyle = "rgba(255,255,255," + (d.r > 2.3 ? 0.95 : 0.7) + ")";
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
      }
    }
    if (flash > 0) {
      if (bolt) {
        var ba = Math.min(1, flash * 1.6);
        ctx.save();
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.shadowColor = "rgba(190,210,255," + ba.toFixed(3) + ")"; ctx.shadowBlur = 18;
        ctx.strokeStyle = "rgba(255,255,255," + ba.toFixed(3) + ")"; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(bolt.main[0][0], bolt.main[0][1]);
        for (i = 1; i < bolt.main.length; i++) ctx.lineTo(bolt.main[i][0], bolt.main[i][1]);
        ctx.stroke();
        ctx.lineWidth = 1.4;
        for (i = 0; i < bolt.br.length; i++) {
          ctx.beginPath(); ctx.moveTo(bolt.br[i][0][0], bolt.br[i][0][1]);
          for (var j = 1; j < bolt.br[i].length; j++) ctx.lineTo(bolt.br[i][j][0], bolt.br[i][j][1]);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.fillStyle = "rgba(255,255,255," + (flash * 0.8).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function loop(ts) {
    var dt = Math.min(0.05, (ts - (last || ts)) / 1000);
    last = ts;
    step(dt, ts); draw(ts);
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && !reduce && scene) { last = 0; raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.addEventListener("resize", function () { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });

  return {
    // key: clear/cloud/fog/rain/storm/snow/night/dusk. o.wind = kemiringan hujan (0..0.6), o.speed = kecepatan awan (0.5..3), o.sun = matahari redup di balik awan.
    set: function (key, o) {
      if (!CFG[key]) key = "cloud";
      o = o || {};
      var wind = typeof o.wind === "number" ? Math.max(0.05, Math.min(0.6, o.wind)) : 0.2;
      var changed = key !== scene || !!o.sun !== opt.sun;
      opt = { wind: wind, sun: !!o.sun, speed: typeof o.speed === "number" ? Math.max(0.5, Math.min(3, o.speed)) : 1 };
      scene = key;
      if (changed || !clouds.length) { resize(); }
      if (reduce) draw(performance.now()); else start();
    }
  };
})();
