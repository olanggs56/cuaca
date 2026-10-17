/* ===== Aplikasi cuaca ===== */
(function () {
  "use strict";

  var DEFAULT_PLACE = { name: "Jakarta", admin: "DKI Jakarta", country: "Indonesia", lat: -6.2146, lon: 106.8451 };
  var REFRESH_MS = 5 * 60 * 1000;

  var $ = function (id) { return document.getElementById(id); };
  var app = $("app"), q = $("q"), sugg = $("sugg"), form = $("form"), btnSearch = $("btnSearch");
  var place = loadPlace();
  if (window.Qibla) Qibla.setPlace(place);
  var data = null, fetchedAt = 0, timer = null, clockTimer = null, loadSeq = 0, animateNext = true;
  var aq = null, quakes = null, pr = null, extraSeq = 0;
  var tab = "cuaca", sub = "jam";   // menu aktif: cuaca selalu jadi tampilan awal

  // Kode cuaca WMO -> [teks, jenis ikon]
  var WX = {
    0: ["Cerah", "clear"], 1: ["Cerah berawan", "partly"], 2: ["Berawan sebagian", "partly"], 3: ["Mendung", "cloud"],
    45: ["Berkabut", "fog"], 48: ["Kabut beku", "fog"],
    51: ["Gerimis ringan", "rain"], 53: ["Gerimis", "rain"], 55: ["Gerimis lebat", "rain"],
    56: ["Gerimis beku", "rain"], 57: ["Gerimis beku lebat", "rain"],
    61: ["Hujan ringan", "rain"], 63: ["Hujan sedang", "rain"], 65: ["Hujan lebat", "rain"],
    66: ["Hujan beku", "rain"], 67: ["Hujan beku lebat", "rain"],
    71: ["Salju ringan", "snow"], 73: ["Salju sedang", "snow"], 75: ["Salju lebat", "snow"], 77: ["Butiran salju", "snow"],
    80: ["Hujan lokal ringan", "rain"], 81: ["Hujan lokal", "rain"], 82: ["Hujan lokal deras", "rain"],
    85: ["Hujan salju ringan", "snow"], 86: ["Hujan salju lebat", "snow"],
    95: ["Badai petir", "storm"], 96: ["Badai petir, hujan es", "storm"], 99: ["Badai petir, hujan es lebat", "storm"]
  };
  function wx(code) { return WX[code] || ["Tidak diketahui", "cloud"]; }

  // Langit: hujan, badai, salju punya tema sendiri; selain itu malam hari memakai langit malam.
  // Senja: cerah atau berawan tipis dalam 45 menit dari matahari terbit atau terbenam.
  function tmin(s) { var m = /T(\d{2}):(\d{2})/.exec(s || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function skyKey(kind, isDay, nowM, riseM, setM) {
    if (kind === "rain" || kind === "storm" || kind === "snow") return kind;
    if (!isDay) return "night";
    if (kind === "fog") return "fog";
    if ((kind === "clear" || kind === "partly") && nowM != null &&
        ((riseM != null && Math.abs(nowM - riseM) <= 45) || (setM != null && Math.abs(nowM - setM) <= 45))) return "dusk";
    if (kind === "clear") return "clear";
    return "cloud";
  }

  // Ikon berwarna (viewBox 48)
  var CL = "M14 36h19a8 8 0 0 0 1.2-15.9A11 11 0 0 0 13 22.4 6.8 6.8 0 0 0 14 36z";
  var MOON = "M31 9A15 15 0 1 0 40 31 12 12 0 0 1 31 9z";
  var DROP = "M0-4c1.8 2.6 2.7 4 2.7 5.3a2.7 2.7 0 0 1-5.4 0C-2.7 0 -1.8-1.4 0-4z";
  function front(fill, dy) { return '<path d="' + CL + '" fill="' + (fill || "#fff") + '" transform="translate(0 ' + (dy || 0) + ')"/>'; }
  function back() { return '<path d="' + CL + '" fill="#c9d6e6" opacity="0.9" transform="translate(9 -8) scale(.72)"/>'; }
  function icon(kind, isDay, size) {
    var s;
    if (kind === "clear") {
      s = isDay
        ? '<circle cx="24" cy="24" r="9.5" fill="#ffd45a"/><g stroke="#ffd45a" stroke-width="2.6" stroke-linecap="round">' +
          '<path d="M24 6v4M24 38v4M6 24h4M38 24h4M11.3 11.3l2.8 2.8M33.9 33.9l2.8 2.8M11.3 36.7l2.8-2.8M33.9 14.1l2.8-2.8"/></g>'
        : '<path d="' + MOON + '" fill="#f3efc9"/>';
    } else if (kind === "partly") {
      s = (isDay ? '<circle cx="32" cy="15" r="8.5" fill="#ffd45a"/>' : '<g transform="translate(14 -4) scale(.6)"><path d="' + MOON + '" fill="#f3efc9"/></g>') + front("#fff", 0);
    } else if (kind === "cloud") {
      s = back() + front("#fff", 0);
    } else if (kind === "fog") {
      s = back() + front("#fff", -4) + '<path d="M11 38h26M16 43h16" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity="0.85" fill="none"/>';
    } else if (kind === "rain") {
      s = back() + front("#e9eff7", -5) +
        '<path d="' + DROP + '" fill="#7cc4ff" transform="translate(15 41)"/><path d="' + DROP + '" fill="#7cc4ff" transform="translate(24 44)"/><path d="' + DROP + '" fill="#7cc4ff" transform="translate(33 41)"/>';
    } else if (kind === "snow") {
      s = back() + front("#f2f6fb", -5) +
        '<circle cx="15" cy="40" r="2" fill="#fff"/><circle cx="24" cy="44" r="2" fill="#fff"/><circle cx="33" cy="40" r="2" fill="#fff"/>';
    } else {
      s = '<path d="' + CL + '" fill="#cfd6e3" transform="translate(0 -6)"/><path d="M26 28l-6 10h4.5l-2.5 9 8-12h-4.8l3.3-7z" fill="#ffd45a"/>';
    }
    return '<svg class="ico' + (size ? " " + size : "") + '" viewBox="0 0 48 48" aria-hidden="true">' + s + '</svg>';
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function r(n) { return Math.round(n); }
  function compassWord(deg) {
    var d = ["utara", "timur laut", "timur", "tenggara", "selatan", "barat daya", "barat", "barat laut"];
    return d[Math.round(deg / 45) % 8];
  }
  function uvLabel(u) {
    if (u == null) return "";
    if (u < 3) return "rendah";
    if (u < 6) return "sedang";
    if (u < 8) return "tinggi";
    if (u < 11) return "sangat tinggi";
    return "ekstrem";
  }
  function dateParts(dateStr) {
    var d = new Date(dateStr + "T00:00:00Z");
    return {
      md: new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(d) + " " + d.getUTCDate(),
      wd: new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: "UTC" }).format(d)
    };
  }

  // Saran singkat dari data yang ada
  function adviceText(c, h, start, isDay, uv) {
    var maxRain = 0;
    for (var i = start; i < Math.min(start + 6, h.time.length); i++) {
      var p = h.precipitation_probability[i];
      if (p != null && p > maxRain) maxRain = p;
    }
    if (c.weather_code >= 95) return "Ada badai petir. Sebaiknya hindari berada di ruang terbuka.";
    if (maxRain >= 60) return "Hujan kemungkinan besar dalam 6 jam ke depan (" + maxRain + "%). Bawa payung atau jas hujan.";
    if (maxRain >= 30) return "Ada kemungkinan hujan dalam 6 jam ke depan (" + maxRain + "%). Siapkan payung.";
    if (c.apparent_temperature >= 35) return "Udara terasa panas. Perbanyak minum air dan cari tempat teduh.";
    if (isDay && uv != null && uv >= 8) return "Sinar matahari kuat hari ini. Pakai tabir surya atau topi.";
    if (c.apparent_temperature <= 12) return "Udara terasa dingin. Pakai jaket.";
    return "Cuaca cukup nyaman untuk beraktivitas.";
  }

  // Penyimpanan lokasi terakhir
  function loadPlace() {
    try {
      var s = localStorage.getItem("cuaca:last");
      if (s) {
        var p = JSON.parse(s);
        if (p && typeof p.lat === "number" && typeof p.lon === "number") return p;
      }
    } catch (e) {}
    return DEFAULT_PLACE;
  }
  function savePlace(p) { try { localStorage.setItem("cuaca:last", JSON.stringify(p)); } catch (e) {} }

  function getJSON(url) {
    var ctl = new AbortController();
    var to = setTimeout(function () { ctl.abort(); }, 12000);
    return fetch(url, { signal: ctl.signal }).then(function (res) {
      clearTimeout(to);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }, function (e) { clearTimeout(to); throw e; });
  }

  function forecastUrl(p) {
    return "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(p.lat) +
      "&longitude=" + encodeURIComponent(p.lon) +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,is_day" +
      "&hourly=temperature_2m,precipitation_probability,weather_code,is_day,surface_pressure,visibility,dew_point_2m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset" +
      "&timezone=auto&forecast_days=7&wind_speed_unit=kmh";
  }

  function placeLabel() {
    var parts = [];
    if (place.admin && place.admin !== place.name) parts.push(place.admin);
    if (place.country) parts.push(place.country);
    return parts.join(", ");
  }
  function setHeader() {
    $("city").textContent = place.name;
    var lab = placeLabel();
    $("subline").textContent = lab;
  }
  function clockText() {
    if (!data) return "";
    try {
      return new Intl.DateTimeFormat("id-ID", {
        weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
        hour12: false, timeZone: data.timezone
      }).format(new Date());
    } catch (e) { return ""; }
  }
  function updatedText() {
    return new Date(fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function load(showSpinner) {
    var seq = ++loadSeq;
    setHeader();
    if (showSpinner && !data) app.innerHTML = '<div class="glass msg"><p>Memuat data cuaca…</p></div>';
    return getJSON(forecastUrl(place)).then(function (d) {
      if (seq !== loadSeq) return;
      data = d; fetchedAt = Date.now();
      render();
      loadExtras();
      schedule();
    }).catch(function () {
      if (seq !== loadSeq) return;
      if (data) {
        render(true);
      } else {
        app.innerHTML = '<div class="glass msg err"><p><strong>Data cuaca tidak bisa diambil.</strong></p>' +
          '<p>Periksa koneksi internet, lalu coba lagi. Jika halaman ini dibuka dari dalam aplikasi atau pratinjau yang memblokir akses internet, buka file ini langsung di browser.</p>' +
          '<button class="go" id="retry" type="button">Coba lagi</button></div>';
        var b = $("retry"); if (b) b.addEventListener("click", function () { load(true); });
      }
      schedule();
    });
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { load(false); }, REFRESH_MS);
  }

  // ===== Menu tab =====
  function applyView() {
    ["cuaca", "sholat", "kiblat", "udara", "gempa"].forEach(function (k) { var v = $("v-" + k); if (v) v.hidden = k !== tab; });
    if (window.Qibla) Qibla.visible(tab === "kiblat");
    ["jam", "hari", "detail"].forEach(function (k) { var p = $("sub-" + k); if (p) p.hidden = k !== sub; });
    Array.prototype.forEach.call(document.querySelectorAll("#nav button"), function (b) {
      if (b.getAttribute("data-tab") === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    Array.prototype.forEach.call(document.querySelectorAll(".seg button"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-sub") === sub ? "true" : "false");
    });
  }
  $("nav").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-tab]");
    if (!b) return;
    tab = b.getAttribute("data-tab");
    applyView();
    window.scrollTo(0, 0);
  });
  app.addEventListener("click", function (e) {
    var b = e.target.closest(".seg button[data-sub]");
    if (!b) return;
    sub = b.getAttribute("data-sub");
    applyView();
  });

  // ===== Waktu sholat (Aladhan) =====
  var PRAYERS = [["Fajr", "Subuh"], ["Sunrise", "Terbit"], ["Dhuhr", "Dzuhur"], ["Asr", "Ashar"], ["Maghrib", "Maghrib"], ["Isha", "Isya"]];
  var PR_NAME = { Fajr: "Subuh", Dhuhr: "Dzuhur", Asr: "Ashar", Maghrib: "Maghrib", Isha: "Isya" };
  function prMethod(country) {
    var c = country || "";
    if (/indonesia/i.test(c)) return [20, "Kemenag RI"];
    if (/malaysia/i.test(c)) return [17, "JAKIM"];
    if (/singapur|singapore/i.test(c)) return [11, "MUIS"];
    return [3, "Muslim World League"];
  }
  function mins(s) { var m = /(\d{1,2}):(\d{2})/.exec(s || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function hm(s) { var m = /(\d{1,2}):(\d{2})/.exec(s || ""); return m ? (m[1].length < 2 ? "0" : "") + m[1] + ":" + m[2] : "-"; }
  function nowMinutes(tz) {
    try {
      var parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).formatToParts(new Date());
      var h = 0, m = 0;
      parts.forEach(function (p) { if (p.type === "hour") h = Number(p.value) % 24; if (p.type === "minute") m = Number(p.value); });
      return h * 60 + m;
    } catch (e) { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  }
  function durText(mn) {
    var h = Math.floor(mn / 60), m = mn % 60;
    return h > 0 ? h + " jam " + m + " menit" : m + " menit";
  }
  function nextPrayer(t, now) {
    var five = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    for (var i = 0; i < five.length; i++) {
      var m = mins(t[five[i]]);
      if (m != null && m > now) return { key: five[i], diff: m - now, tomorrow: false };
    }
    var f = mins(t.Fajr);
    return f == null ? null : { key: "Fajr", diff: 1440 - now + f, tomorrow: true };
  }
  function fillPrayer() {
    var box = $("prBody"); if (!box) return;
    if (!pr) { box.innerHTML = '<p class="muted">Memuat waktu sholat…</p>'; return; }
    if (!pr.ok) { box.innerHTML = '<p class="muted">Waktu sholat tidak bisa diambil. Coba perbarui beberapa saat lagi.</p>'; return; }
    var t = pr.t, now = nowMinutes(data ? data.timezone : undefined);
    var nx = nextPrayer(t, now);
    var head = nx
      ? '<div class="pr-next"><div class="muted">Berikutnya, dalam ' + esc(durText(nx.diff)) + '</div>' +
        '<div class="pr-nm">' + esc(PR_NAME[nx.key]) + (nx.tomorrow ? ' besok' : '') + ' <span class="num">' + esc(hm(t[nx.key])) + '</span></div></div>'
      : '';
    var cells = PRAYERS.map(function (x) {
      var on = nx && !nx.tomorrow && nx.key === x[0];
      return '<li class="pt' + (on ? ' on' : '') + (x[0] === "Sunrise" ? ' sun' : '') + '"><span>' + esc(x[1]) + '</span><span class="num">' + esc(hm(t[x[0]])) + '</span></li>';
    }).join("");
    box.innerHTML = head + '<ol class="pts">' + cells + '</ol>' +
      '<p class="muted src">Metode ' + esc(pr.m) + ', dihitung dari koordinat lokasimu. Bisa berbeda beberapa menit dari jadwal masjid setempat, jadi pakai jadwal resmi setempat sebagai acuan. Sumber: Aladhan.</p>';
  }

  // ===== Kualitas udara (Open-Meteo Air Quality) dan gempa (USGS) =====
  var AQ_LEVELS = [
    [50, "Baik", "Udara bersih. Aman untuk beraktivitas di luar."],
    [100, "Sedang", "Kualitas udara dapat diterima. Orang yang sangat sensitif sebaiknya mengurangi aktivitas berat di luar."],
    [150, "Tidak sehat bagi kelompok sensitif", "Anak-anak, lansia, dan penderita asma sebaiknya mengurangi aktivitas di luar."],
    [200, "Tidak sehat", "Kurangi aktivitas berat di luar dan pertimbangkan memakai masker."],
    [300, "Sangat tidak sehat", "Hindari aktivitas di luar. Pakai masker bila terpaksa keluar."],
    [Infinity, "Berbahaya", "Tetap di dalam ruangan dan tutup jendela."]
  ];
  function aqLevel(v) {
    for (var i = 0; i < AQ_LEVELS.length; i++) if (v <= AQ_LEVELS[i][0]) return AQ_LEVELS[i];
    return AQ_LEVELS[AQ_LEVELS.length - 1];
  }
  var DIR = {
    N: "utara", NNE: "utara-timur laut", NE: "timur laut", ENE: "timur-timur laut", E: "timur", ESE: "timur-tenggara",
    SE: "tenggara", SSE: "selatan-tenggara", S: "selatan", SSW: "selatan-barat daya", SW: "barat daya", WSW: "barat-barat daya",
    W: "barat", WNW: "barat-barat laut", NW: "barat laut", NNW: "utara-barat laut"
  };
  function quakePlace(s) {
    if (!s) return "Lokasi tidak diketahui";
    var m = /^(\d+)\s*km\s+([NSEW]{1,3})\s+of\s+(.+)$/.exec(s);
    return m && DIR[m[2]] ? m[1] + " km " + DIR[m[2]] + " " + m[3] : s;
  }
  function distKm(la1, lo1, la2, lo2) {
    var R = 6371, rad = Math.PI / 180;
    var dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
    var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function magColor(m) {
    if (m == null) return "#cfd8e3";
    if (m < 4) return "#ffd45a";
    if (m < 5) return "#ffa94d";
    if (m < 6) return "#ff7a59";
    return "#ff4d6d";
  }
  function ago(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000), n, u;
    if (s < 3600) { n = Math.max(1, Math.round(s / 60)); u = "minute"; }
    else if (s < 86400) { n = Math.round(s / 3600); u = "hour"; }
    else { n = Math.round(s / 86400); u = "day"; }
    try { return new Intl.RelativeTimeFormat("id", { numeric: "auto" }).format(-n, u); }
    catch (e) { return n + " " + (u === "minute" ? "menit" : u === "hour" ? "jam" : "hari") + " lalu"; }
  }
  function num1(x, d) { return x == null ? "-" : Number(x).toFixed(d || 0); }

  function loadExtras() {
    var seq = ++extraSeq, p = place;
    var aUrl = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + encodeURIComponent(p.lat) +
      "&longitude=" + encodeURIComponent(p.lon) + "&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&timezone=auto";
    var since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19);
    var qUrl = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=" + encodeURIComponent(p.lat) +
      "&longitude=" + encodeURIComponent(p.lon) + "&maxradiuskm=1000&minmagnitude=2.5&orderby=time&limit=10&starttime=" + since;
    var ct = data && data.current && data.current.time ? data.current.time.slice(0, 10).split("-") : null;
    if (ct) {
      var meth = prMethod(p.country);
      var pUrl = "https://api.aladhan.com/v1/timings/" + ct[2] + "-" + ct[1] + "-" + ct[0] + "?latitude=" + encodeURIComponent(p.lat) +
        "&longitude=" + encodeURIComponent(p.lon) + "&method=" + meth[0];
      getJSON(pUrl).then(function (d) {
        if (seq !== extraSeq) return;
        var t = d && d.data && d.data.timings;
        pr = t ? { ok: true, t: t, m: meth[1] } : { ok: false };
        fillPrayer();
      }).catch(function () {
        if (seq !== extraSeq) return;
        if (!pr || !pr.ok) pr = { ok: false };
        fillPrayer();
      });
    }
    getJSON(aUrl).then(function (d) {
      if (seq !== extraSeq) return;
      aq = { ok: true, d: d }; fillAir();
    }).catch(function () {
      if (seq !== extraSeq) return;
      if (!aq || !aq.ok) aq = { ok: false };
      fillAir();
    });
    getJSON(qUrl).then(function (d) {
      if (seq !== extraSeq) return;
      quakes = { ok: true, d: d, p: p }; fillQuakes();
    }).catch(function () {
      if (seq !== extraSeq) return;
      if (!quakes || !quakes.ok) quakes = { ok: false };
      fillQuakes();
    });
  }

  function fillAir() {
    var box = $("aqBody"); if (!box) return;
    if (!aq) { box.innerHTML = '<p class="muted">Memuat kualitas udara…</p>'; return; }
    if (!aq.ok) { box.innerHTML = '<p class="muted">Data kualitas udara tidak bisa diambil. Coba perbarui beberapa saat lagi.</p>'; return; }
    var cur = aq.d && aq.d.current;
    if (!cur || cur.us_aqi == null) { box.innerHTML = '<p class="muted">Data kualitas udara untuk lokasi ini belum tersedia.</p>'; return; }
    var v = r(cur.us_aqi), lv = aqLevel(v);
    var pos = Math.min(v, 300) / 300 * 100;
    box.innerHTML =
      '<div class="aq-top"><div class="aqi num">' + v + '</div><div><div class="aq-lv">' + esc(lv[1]) + '</div><div class="muted">Indeks AQI (standar AS)</div></div></div>' +
      '<div class="scale" aria-hidden="true"><i style="left:' + pos.toFixed(1) + '%"></i></div>' +
      '<p class="aq-tip">' + esc(lv[2]) + '</p>' +
      '<dl class="metrics">' +
        '<div><dt>PM2.5</dt><dd class="num">' + num1(cur.pm2_5, 0) + ' <small>µg/m³</small></dd></div>' +
        '<div><dt>PM10</dt><dd class="num">' + num1(cur.pm10, 0) + ' <small>µg/m³</small></dd></div>' +
        '<div><dt>Ozon (O₃)</dt><dd class="num">' + num1(cur.ozone, 0) + ' <small>µg/m³</small></dd></div>' +
        '<div><dt>Nitrogen dioksida</dt><dd class="num">' + num1(cur.nitrogen_dioxide, 0) + ' <small>µg/m³</small></dd></div>' +
      '</dl>' +
      '<p class="muted src">Perkiraan model Open-Meteo, bukan hasil alat ukur di lokasimu.</p>';
  }

  function fillQuakes() {
    var box = $("eqBody"); if (!box) return;
    if (!quakes) { box.innerHTML = '<p class="muted">Memuat data gempa…</p>'; return; }
    if (!quakes.ok) { box.innerHTML = '<p class="muted">Data gempa tidak bisa diambil. Coba perbarui beberapa saat lagi.</p>'; return; }
    var feats = (quakes.d && quakes.d.features) || [];
    var src = '<p class="muted src">Sumber: USGS. Gempa kecil di luar Amerika Serikat sering tidak tercatat. Untuk Indonesia, rujukan resminya BMKG (bmkg.go.id).</p>';
    if (!feats.length) {
      box.innerHTML = '<p class="muted">Tidak ada gempa M2.5 ke atas dalam radius 1.000 km selama 7 hari terakhir.</p>' + src;
      return;
    }
    var rows = feats.map(function (f) {
      var p = f.properties || {}, g = (f.geometry && f.geometry.coordinates) || [];
      var km = g.length >= 2 ? r(distKm(quakes.p.lat, quakes.p.lon, g[1], g[0])) : null;
      var meta = [p.time ? ago(p.time) : "", km != null ? km + " km dari sini" : "", g[2] != null ? "kedalaman " + r(g[2]) + " km" : ""].filter(Boolean).join(" · ");
      return '<li class="eq"><span class="mag num" style="background:' + magColor(p.mag) + '">' + (p.mag != null ? Number(p.mag).toFixed(1) : "?") + '</span>' +
        '<div><div class="eqp">' + esc(quakePlace(p.place)) + '</div><div class="eqs muted">' + esc(meta) + '</div></div></li>';
    }).join("");
    box.innerHTML = '<p class="muted eqsum">' + feats.length + ' gempa terbaru M2.5+ dalam radius 1.000 km, 7 hari terakhir</p><ol class="quakes">' + rows + '</ol>' + src;
  }

  function countUp(el, to) {
    var from = 0, t0 = performance.now(), dur = 800;
    function f(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.firstChild.nodeValue = String(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(f);
    }
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    requestAnimationFrame(f);
  }

  function render(failed) {
    if (!data) return;
    var c = data.current, h = data.hourly, dly = data.daily;
    var isDay = c.is_day === 1;
    var w = wx(c.weather_code);
    var sky = skyKey(w[1], isDay);
    document.documentElement.setAttribute("data-sky", sky);
    FX.set(sky);

    var nowHour = c.time.slice(0, 13) + ":00";
    var start = h.time.findIndex(function (t) { return t >= nowHour; });
    if (start < 0) start = 0;
    var hoursHtml = "";
    for (var i = start; i < Math.min(start + 24, h.time.length); i++) {
      var hw = wx(h.weather_code[i]);
      var pp = h.precipitation_probability[i];
      hoursHtml += '<li class="hour' + (i === start ? ' now' : '') + '">' +
        '<span class="t num">' + (i === start ? "Sekarang" : esc(h.time[i].slice(11, 16))) + '</span>' +
        icon(hw[1], h.is_day[i] === 1, "sm") +
        '<span class="p num">' + (pp != null && pp >= 10 ? pp + '%' : '') + '</span>' +
        '<span class="v num">' + r(h.temperature_2m[i]) + '°</span></li>';
    }

    var daysHtml = "";
    for (var k = 0; k < dly.time.length; k++) {
      var dw = wx(dly.weather_code[k]);
      var dp = dly.precipitation_probability_max[k];
      var dd = dateParts(dly.time[k]);
      daysHtml += '<li class="day">' +
        '<span class="d">' + (k === 0 ? 'Hari ini<small>' + esc(dd.md) + '</small>' : esc(dd.md) + '<small>' + esc(dd.wd) + '</small>') + '</span>' +
        '<span class="i">' + icon(dw[1], true, "sm") + '<span class="p num">' + (dp != null && dp >= 10 ? dp + '%' : '') + '</span></span>' +
        '<span class="c">' + esc(dw[0]) + '</span>' +
        '<span class="r num"><span class="lo">' + r(dly.temperature_2m_min[k]) + '°</span> / ' + r(dly.temperature_2m_max[k]) + '°</span></li>';
    }

    var uv = dly.uv_index_max && dly.uv_index_max[0];
    var sunrise = dly.sunrise && dly.sunrise[0] ? dly.sunrise[0].slice(11, 16) : "-";
    var sunset = dly.sunset && dly.sunset[0] ? dly.sunset[0].slice(11, 16) : "-";
    var rise = animateNext ? " rise" : "";

    app.innerHTML =
      '<div class="view" id="v-cuaca"><section class="hero' + rise + '" aria-label="Cuaca saat ini">' +
        '<div class="temp num" id="temp">' + r(c.temperature_2m) + '<span class="deg">°</span></div>' +
        '<div class="cond">' + esc(w[0]) + '<span class="hl num">' + r(dly.temperature_2m_min[0]) + '° / ' + r(dly.temperature_2m_max[0]) + '°</span></div>' +
        '<div class="feel">Terasa seperti ' + r(c.apparent_temperature) + '° · Angin ' + compassWord(c.wind_direction_10m) + ' ' + r(c.wind_speed_10m) + ' km/j</div>' +
        '<p class="tip">' + esc(adviceText(c, h, start, isDay, uv)) + '</p>' +
      '</section>' +
      '<div class="seg" role="group" aria-label="Rincian cuaca">' +
        '<button type="button" data-sub="jam">24 jam</button><button type="button" data-sub="hari">7 hari</button><button type="button" data-sub="detail">Detail</button></div>' +
      '<section class="glass" id="sub-jam" aria-label="Per jam"><h2><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>24 jam berikutnya</h2><ol class="hours">' + hoursHtml + '</ol></section>' +
      '<section class="glass" id="sub-hari" aria-label="Per hari"><h2><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>7 hari berikutnya</h2><ol class="days">' + daysHtml + '</ol></section>' +
      '<section class="glass" id="sub-detail" aria-label="Detail cuaca"><h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h10a3 3 0 1 0-3-3M4 12h14a3 3 0 1 1-3 3M4 16h7"/></svg>Detail sekarang</h2>' +
        '<dl class="metrics">' +
          '<div><dt>Kelembapan</dt><dd class="num">' + r(c.relative_humidity_2m) + '%</dd></div>' +
          '<div><dt>Tekanan udara</dt><dd class="num">' + r(c.surface_pressure) + ' <small>hPa</small></dd></div>' +
          '<div><dt>Curah hujan</dt><dd class="num">' + (c.precipitation || 0).toFixed(1) + ' <small>mm</small></dd></div>' +
          '<div><dt>Indeks UV hari ini</dt><dd class="num">' + (uv != null ? uv.toFixed(0) : "-") + ' <small>' + uvLabel(uv) + '</small></dd></div>' +
          '<div><dt>Matahari terbit</dt><dd class="num">' + esc(sunrise) + '</dd></div>' +
          '<div><dt>Matahari terbenam</dt><dd class="num">' + esc(sunset) + '</dd></div>' +
        '</dl>' +
        '<div class="status">' +
        (failed
          ? '<span>Gagal memperbarui. Data terakhir pukul <span class="num">' + esc(updatedText()) + '</span>.</span>'
          : '<span>Diperbarui pukul <span class="num">' + esc(updatedText()) + '</span></span>') +
        '<button class="link" id="refresh" type="button">Perbarui sekarang</button></div>' +
      '</section></div>' +
      '<div class="view" id="v-sholat" hidden><section class="glass" aria-label="Waktu sholat"><h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>Waktu sholat</h2><div id="prBody"></div></section></div>' +
      '<div class="view" id="v-udara" hidden><section class="glass" aria-label="Kualitas udara"><h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6"/></svg>Kualitas udara</h2><div id="aqBody"></div></section></div>' +
      '<div class="view" id="v-gempa" hidden><section class="glass" aria-label="Gempa terdekat"><h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12h4l2.5-6.5 4 13 2.5-6.5h6"/></svg>Gempa terdekat</h2><div id="eqBody"></div></section></div>';

    applyView();
    fillPrayer(); fillAir(); fillQuakes();
    var rb = $("refresh");
    if (rb) rb.addEventListener("click", function () { load(false); });
    if (animateNext) { var te = $("temp"); if (te) countUp(te, r(c.temperature_2m)); }
    animateNext = false;
    $("subline").textContent = [clockText(), placeLabel()].filter(Boolean).join(" · ");
    startClock();
  }

  function startClock() {
    clearInterval(clockTimer);
    clockTimer = setInterval(function () {
      $("subline").textContent = [clockText(), placeLabel()].filter(Boolean).join(" · ");
      fillPrayer();
    }, 30000);
  }

  function choose(p) {
    place = p;
    savePlace(p);
    if (window.Qibla) Qibla.setPlace(p);
    data = null; aq = null; quakes = null; pr = null;
    animateNext = true;
    closeSearch();
    q.value = "";
    load(true);
  }

  // Pencarian kota
  var searchTimer = null, searchSeq = 0, results = [];
  function openSearch() {
    form.hidden = false; btnSearch.setAttribute("aria-pressed", "true");
    q.focus();
  }
  function closeSearch() {
    form.hidden = true; btnSearch.setAttribute("aria-pressed", "false"); hideSugg();
  }
  function hideSugg() { sugg.hidden = true; sugg.innerHTML = ""; q.setAttribute("aria-expanded", "false"); }
  btnSearch.addEventListener("click", function () { if (form.hidden) openSearch(); else closeSearch(); });

  function geocode(name) {
    var seq = ++searchSeq;
    var url = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(name) + "&count=6&language=id&format=json";
    return getJSON(url).then(function (res) {
      if (seq !== searchSeq) return null;
      results = (res.results || []).map(function (x) {
        return { name: x.name, admin: x.admin1 || "", country: x.country || "", lat: x.latitude, lon: x.longitude };
      });
      return results;
    });
  }
  function showSugg(list) {
    if (!list || !list.length) {
      sugg.innerHTML = '<li style="padding:10px 6px;color:var(--soft)">Kota tidak ditemukan.</li>';
    } else {
      sugg.innerHTML = list.map(function (p, i) {
        var sub = [p.admin, p.country].filter(Boolean).join(", ");
        return '<li><button type="button" data-i="' + i + '">' + esc(p.name) + '<small>' + esc(sub) + '</small></button></li>';
      }).join("");
    }
    sugg.hidden = false;
    q.setAttribute("aria-expanded", "true");
  }

  q.addEventListener("input", function () {
    clearTimeout(searchTimer);
    var v = q.value.trim();
    if (v.length < 2) { hideSugg(); return; }
    searchTimer = setTimeout(function () {
      geocode(v).then(function (l) { if (l) showSugg(l); }).catch(hideSugg);
    }, 300);
  });
  sugg.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-i]");
    if (b) choose(results[Number(b.getAttribute("data-i"))]);
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = q.value.trim();
    if (v.length < 2) return;
    geocode(v).then(function (l) {
      if (l && l.length) choose(l[0]); else if (l) showSugg(l);
    }).catch(function () { showSugg([]); });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSearch(); });

  // Nama tempat dari koordinat (Nominatim / OpenStreetMap). Gagal = tanpa nama, cuaca tetap tampil.
  function reverseName(lat, lon) {
    var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=id" +
      "&lat=" + encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lon);
    return getJSON(url).then(function (res) {
      var a = (res && res.address) || {};
      return {
        name: a.city || a.town || a.municipality || a.county || a.village || a.suburb || a.state || "",
        admin: a.state || "",
        country: a.country || ""
      };
    }).catch(function () { return {}; });
  }

  // Lokasi saya
  $("btnLocate").addEventListener("click", function () {
    var btn = $("btnLocate");
    function fail(msg) {
      btn.disabled = false; btn.style.opacity = "";
      var old = $("geoerr"); if (old) old.remove();
      app.insertAdjacentHTML("afterbegin", '<div class="glass msg err" id="geoerr"><p>' + esc(msg) + '</p></div>');
      setTimeout(function () { var g = $("geoerr"); if (g) g.remove(); }, 7000);
    }
    if (!navigator.geolocation) { fail("Browser ini tidak mendukung lokasi. Cari nama kota saja."); return; }
    btn.disabled = true; btn.style.opacity = "0.5";
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      reverseName(lat, lon).then(function (info) {
        btn.disabled = false; btn.style.opacity = "";
        choose({ name: info.name || "Lokasi Anda", admin: info.admin || "", country: info.country || "", lat: lat, lon: lon });
      });
    }, function () {
      fail("Lokasi tidak bisa dibaca. Izinkan akses lokasi di browser, atau cari nama kota.");
    }, { timeout: 10000, maximumAge: 60000 });
  });

  // Perbarui saat tab kembali aktif dan data sudah basi
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && Date.now() - fetchedAt > REFRESH_MS) load(false);
  });

  FX.set("cloud");
  load(true);
})();
