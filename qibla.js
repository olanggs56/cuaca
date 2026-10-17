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

  // Menggambar skala derajat dan huruf mata angin pada piringan kompas.
  function build() {
    var NS = "http://www.w3.org/2000/svg", ticks = $("qbTicks"), labels = $("qbLabels"), i, a, len, ln, t;
    for (i = 0; i < 72; i++) {
      a = rad(i * 5);
      len = i % 18 === 0 ? 14 : i % 2 === 0 ? 10 : 6;     // 90° besar, 10° sedang, 5° kecil
      ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", (CX + 140 * Math.sin(a)).toFixed(2));
      ln.setAttribute("y1", (CY - 140 * Math.cos(a)).toFixed(2));
      ln.setAttribute("x2", (CX + (140 - len) * Math.sin(a)).toFixed(2));
      ln.setAttribute("y2", (CY - (140 - len) * Math.cos(a)).toFixed(2));
      ln.setAttribute("class", i % 18 === 0 ? "qb-tick major" : "qb-tick");
      ticks.appendChild(ln);
    }
    [["U", 0], ["T", 90], ["S", 180], ["B", 270]].forEach(function (c) {
      var ang = rad(c[1]);
      t = document.createElementNS(NS, "text");
      t.setAttribute("x", (CX + 108 * Math.sin(ang)).toFixed(2));
      t.setAttribute("y", (CY - 108 * Math.cos(ang) + 7).toFixed(2));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("class", c[0] === "U" ? "qb-letter north" : "qb-letter");
      t.textContent = c[0];
      labels.appendChild(t);
    });
  }

  function setText(node, s) { if (node && node.textContent !== s) node.textContent = s; }
  function schedule() { if (!raf) raf = requestAnimationFrame(render); }

  function render() {
    raf = 0;
    if (!el.dial) return;
    var h = heading == null ? 0 : heading;
    el.dial.setAttribute("transform", "rotate(" + (-h).toFixed(1) + " " + CX + " " + CY + ")");
    if (bearing != null) el.needle.setAttribute("transform", "rotate(" + bearing.toFixed(1) + " " + CX + " " + CY + ")");

    var aligned = false, status = "", sub = "";
    if (bearing == null) {
      status = "Menunggu lokasi…";
    } else if (heading == null) {
      if (permDenied) status = "Izin sensor gerak ditolak";
      else if (noSensor) status = "Sensor kompas tidak terbaca";
      else if (needPerm) status = "Ketuk tombol untuk mengaktifkan kompas";
      else status = "Mencari sensor kompas…";
      sub = "Arah kiblat " + Math.round(bearing) + "° dari utara. Bandingkan dengan kompas lain.";
    } else {
      var diff = wrap180(bearing - heading);
      aligned = Math.abs(diff) <= ALIGN_DEG;
      status = aligned ? "Searah kiblat" : "Putar ke " + (diff > 0 ? "kanan" : "kiri") + " " + Math.round(Math.abs(diff)) + "°";
      sub = "Arah HP " + Math.round(heading) + "° · kiblat " + Math.round(bearing) + "°";
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
    setText($("qbDist"), "± " + Math.round(dist).toLocaleString("id-ID") + " km ke Ka'bah");
    schedule();
  }
  function visible(v) {
    if (v) { start(); schedule(); } else { detach(); }   // sensor dimatikan saat tab lain dibuka
  }

  el = { dial: $("qbDial"), needle: $("qbNeedle"), wrap: $("qbWrap"), status: $("qbStatus"), sub: $("qbSub"), btn: $("qbBtn") };
  if (el.dial) {
    build();
    el.btn.addEventListener("click", requestAndStart);
    schedule();
  }

  return {
    setPlace: setPlace,
    visible: visible,
    _test: { bearingTo: bearingTo, distanceKm: distanceKm, deviceHeading: deviceHeading, wrap180: wrap180 }
  };
})();
