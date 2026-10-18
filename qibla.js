/* ===== Kompas kiblat =====
   Menghitung arah kiblat dari koordinat ke Ka'bah, lalu memutar kompas mengikuti sensor HP.
   Ditulis sebagai skrip biasa (bukan modul) supaya tetap jalan kalau file dibuka langsung. */
var Qibla = (function () {
  "use strict";

  var KAABA = { lat: 21.4225, lon: 39.8262 };
  var DIRS = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"];
  var CX = 150, CY = 150, ALIGN_DEG = 4, SMOOTH = 0.25;

  var place = null, bearing = null, dist = null;
  var heading = null;                       // arah sisi atas HP, derajat dari utara (sudah dihaluskan)
  var listening = false, gotReading = false, gotAbs = false;
  var needPerm = false, permGranted = false, permDenied = false, noSensor = false;
  var wasAligned = false, raf = 0, watchdog = 0;
  var el = {};

  function $(id) { return document.getElementById(id); }
  function rad(d) { return d * Math.PI / 180; }
  function norm(d) { return ((d % 360) + 360) % 360; }
  function wrap180(d) { d = norm(d); return d > 180 ? d - 360 : d; }

  // Arah awal (derajat dari utara) dari titik lat/lon menuju Ka'bah, lewat lingkaran besar.
  function bearingTo(lat, lon) {
    var f1 = rad(lat), f2 = rad(KAABA.lat), dl = rad(KAABA.lon - lon);
    var y = Math.sin(dl) * Math.cos(f2);
    var x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    return norm(Math.atan2(y, x) * 180 / Math.PI);
  }
  function distanceKm(lat, lon) {
    var f1 = rad(lat), f2 = rad(KAABA.lat), dF = f2 - f1, dL = rad(KAABA.lon - lon);
    var a = Math.sin(dF / 2) * Math.sin(dF / 2) + Math.cos(f1) * Math.cos(f2) * Math.sin(dL / 2) * Math.sin(dL / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Arah HP dari sensor. alpha/beta/gamma mengikuti standar W3C DeviceOrientation.
  // HP datar: arah sisi atas HP = 360 - alpha. HP tegak: arah belakang HP.
  function deviceHeading(alpha, beta, gamma) {
    if (alpha == null) return null;
    var b = beta == null ? 0 : beta;
    if (Math.abs(b) <= 45) return norm(360 - alpha);
    var x = rad(b), y = rad(gamma || 0), z = rad(alpha);
    var vx = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y);
    var vy = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y);
    return norm(Math.atan2(vx, vy) * 180 / Math.PI);
  }

  // Menggambar skala (tiap 2°), angka tiap 30°, dan huruf mata angin pada piringan.
  function build() {
    var NS = "http://www.w3.org/2000/svg", ticks = $("qbTicks"), nums = $("qbNums"), labels = $("qbLabels"), i, a, len, ln, t, cls;
    for (i = 0; i < 180; i++) {
      var deg = i * 2;
      a = rad(deg);
      if (deg % 30 === 0) { len = 16; cls = "cp-tick maj"; }
      else if (deg % 10 === 0) { len = 12; cls = "cp-tick mid"; }
      else { len = 9; cls = "cp-tick"; }
      ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", (CX + 130 * Math.sin(a)).toFixed(2));
      ln.setAttribute("y1", (CY - 130 * Math.cos(a)).toFixed(2));
      ln.setAttribute("x2", (CX + (130 - len) * Math.sin(a)).toFixed(2));
      ln.setAttribute("y2", (CY - (130 - len) * Math.cos(a)).toFixed(2));
      ln.setAttribute("class", cls);
      ticks.appendChild(ln);
    }
    for (i = 0; i < 12; i++) {
      var d = i * 30, ar = rad(d);
      t = document.createElementNS(NS, "text");
      t.setAttribute("x", (CX + 145 * Math.sin(ar)).toFixed(2));
      t.setAttribute("y", (CY - 145 * Math.cos(ar)).toFixed(2));
      t.setAttribute("transform", "rotate(" + d + " " + (CX + 145 * Math.sin(ar)).toFixed(2) + " " + (CY - 145 * Math.cos(ar)).toFixed(2) + ")");
      t.setAttribute("class", "cp-num");
      t.textContent = String(d);
      nums.appendChild(t);
    }
    [["N", 0], ["E", 90], ["S", 180], ["W", 270]].forEach(function (c) {
      var ang = rad(c[1]), x = (CX + 92 * Math.sin(ang)).toFixed(2), y = (CY - 92 * Math.cos(ang)).toFixed(2);
      t = document.createElementNS(NS, "text");
      t.setAttribute("x", x); t.setAttribute("y", y);
      t.setAttribute("transform", "rotate(" + c[1] + " " + x + " " + y + ")");
      t.setAttribute("class", c[0] === "N" ? "cp-let cp-north" : "cp-let");
      t.textContent = c[0];
      labels.appendChild(t);
    });
    var tri = document.createElementNS(NS, "polygon");     // panah merah kecil di samping N
    tri.setAttribute("points", "124,52 118,66 130,66");
    tri.setAttribute("fill", "#ff4d3d");
    labels.appendChild(tri);
  }

  // Derajat desimal -> 1°41′44″
  function dms(v) {
    v = Math.abs(v);
    var d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 60);
    if (s === 60) { s = 0; m++; } if (m === 60) { m = 0; d++; }
    return d + "°" + m + "\u2032" + s + "\u2033";
  }
  function dirWord(h) {
    var w = DIRS[Math.round(h / 45) % 8];
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  function setText(node, s) { if (node && node.textContent !== s) node.textContent = s; }
  function schedule() { if (!raf) raf = requestAnimationFrame(render); }

  function render() {
    raf = 0;
    if (!el.dial) return;
    var h = heading == null ? 0 : heading;
    el.dial.setAttribute("transform", "rotate(" + (-h).toFixed(1) + " " + CX + " " + CY + ")");
    if (bearing != null) el.needle.setAttribute("transform", "rotate(" + bearing.toFixed(1) + " " + CX + " " + CY + ")");

    setText($("cpDeg"), heading == null ? "--" : String(Math.round(heading) % 360));
    setText($("cpDir"), heading == null ? "Kiblat" : dirWord(heading));
    var aligned = false, status = "", sub = "";
    if (bearing == null) {
      status = "Menunggu lokasi…";
    } else if (heading == null) {
      if (permDenied) status = "Izin sensor gerak ditolak";
      else if (noSensor) status = "Sensor kompas tidak terbaca";
      else if (needPerm) status = "Ketuk tombol untuk mengaktifkan kompas";
      else status = "Mencari sensor kompas…";
      sub = "Bandingkan arah kiblat dengan kompas lain.";
    } else {
      var diff = wrap180(bearing - heading);
      aligned = Math.abs(diff) <= ALIGN_DEG;
      status = aligned ? "Searah kiblat" : "Putar ke " + (diff > 0 ? "kanan" : "kiri") + " " + Math.round(Math.abs(diff)) + "°";
      sub = "";
    }
    setText(el.status, status);
    setText(el.sub, sub);
    el.wrap.classList.toggle("ok", aligned);
    el.status.classList.toggle("ok", aligned);
    if (aligned && !wasAligned) { try { if (navigator.vibrate) navigator.vibrate(35); } catch (e) {} }
    wasAligned = aligned;

    var showBtn = heading == null && (needPerm || noSensor || permDenied);
    el.btn.hidden = !showBtn;
    setText(el.btn, needPerm && !permDenied ? "Aktifkan kompas" : "Coba lagi");
  }

  // ----- Sensor -----
  function feed(h) {
    if (h == null || isNaN(h)) return;
    gotReading = true; noSensor = false;
    heading = heading == null ? h : norm(heading + wrap180(h - heading) * SMOOTH);
    schedule();
  }
  function onAbs(e) { gotAbs = true; feed(deviceHeading(e.alpha, e.beta, e.gamma)); }
  function onRel(e) {
    if (typeof e.webkitCompassHeading === "number") { feed(norm(e.webkitCompassHeading)); return; }   // iPhone
    if (!gotAbs && e.absolute === true) feed(deviceHeading(e.alpha, e.beta, e.gamma));
  }
  function attach() {
    if (listening) return;
    listening = true; gotReading = false; gotAbs = false;
    if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", onAbs, true);
    window.addEventListener("deviceorientation", onRel, true);
    clearTimeout(watchdog);
    watchdog = setTimeout(function () { if (!gotReading) { noSensor = true; schedule(); } }, 3000);
    schedule();
  }
  function detach() {
    window.removeEventListener("deviceorientationabsolute", onAbs, true);
    window.removeEventListener("deviceorientation", onRel, true);
    listening = false; clearTimeout(watchdog);
  }
  function start() {
    if (listening) return;
    var DOE = window.DeviceOrientationEvent;
    if (!DOE) { noSensor = true; schedule(); return; }
    if (typeof DOE.requestPermission === "function" && !permGranted) { needPerm = true; schedule(); return; }   // iPhone: harus lewat ketukan
    attach();
  }
  function requestAndStart() {          // dipanggil dari tombol (gestur pengguna)
    var DOE = window.DeviceOrientationEvent;
    noSensor = false; permDenied = false;
    if (DOE && typeof DOE.requestPermission === "function") {
      DOE.requestPermission().then(function (s) {
        if (s === "granted") { permGranted = true; needPerm = false; attach(); } else { permDenied = true; schedule(); }
      }).catch(function () { permDenied = true; schedule(); });
    } else {
      detach(); attach();
    }
    schedule();
  }

  // ----- Dipanggil app.js -----
  function setPlace(p) {
    if (!p || typeof p.lat !== "number" || typeof p.lon !== "number") return;
    place = p;
    bearing = bearingTo(p.lat, p.lon);
    dist = distanceKm(p.lat, p.lon);
    setText($("qbPlace"), p.name || "lokasimu");
    setText($("qbDeg"), String(Math.round(bearing)));
    setText($("qbWord"), DIRS[Math.round(bearing / 45) % 8]);
    setText($("cpLat"), dms(p.lat)); setText($("cpLon"), dms(p.lon));
    setText($("cpLatL"), p.lat >= 0 ? "Lintang Utara" : "Lintang Selatan");
    setText($("cpLonL"), p.lon >= 0 ? "Bujur Timur" : "Bujur Barat");
    setText($("qbDist"), "± " + Math.round(dist).toLocaleString("id-ID") + " km");
    schedule();
  }
  function visible(v) {
    if (v) { start(); schedule(); } else { detach(); }   // sensor dimatikan saat tab lain dibuka
  }

  el = { dial: $("qbDial"), needle: $("qbQibla"), wrap: $("qbWrap"), status: $("qbStatus"), sub: $("qbSub"), btn: $("qbBtn") };
  if (el.dial) {
    build();
    el.btn.addEventListener("click", requestAndStart);
    schedule();
  }

  return {
    setPlace: setPlace,
    visible: visible,
    _test: { dms: dms, bearingTo: bearingTo, distanceKm: distanceKm, deviceHeading: deviceHeading, wrap180: wrap180 }
  };
})();
