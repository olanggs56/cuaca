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
  var aq = null, quakes = null, pr = null, extraSeq = 0, eqSel = 0, eqAll = false;
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
  function front(fill, dy) { return '<path class="cf" d="' + CL + '" fill="' + (fill || "#fff") + '" transform="translate(0 ' + (dy || 0) + ')"/>'; }
  function back() { return '<path class="cb" d="' + CL + '" fill="#c9d6e6" opacity="0.9" transform="translate(9 -8) scale(.72)"/>'; }
  // Kelas (rays, cf, cb, dr, sf, bolt) hanya bergerak pada ikon besar di kartu utama (lihat style.css).
  function icon(kind, isDay, size) {
    var s;
    if (kind === "clear") {
      s = isDay
        ? '<circle class="sunc" cx="24" cy="24" r="9.5" fill="#ffd45a"/><g class="rays" stroke="#ffd45a" stroke-width="2.6" stroke-linecap="round">' +
          '<path d="M24 6v4M24 38v4M6 24h4M38 24h4M11.3 11.3l2.8 2.8M33.9 33.9l2.8 2.8M11.3 36.7l2.8-2.8M33.9 14.1l2.8-2.8"/></g>'
        : '<path class="sunc" d="' + MOON + '" fill="#f3efc9"/>';
    } else if (kind === "partly") {
      s = (isDay ? '<g class="rays" style="transform-origin:32px 15px"><circle class="sunc" cx="32" cy="15" r="8.5" fill="#ffd45a"/></g>' : '<g transform="translate(14 -4) scale(.6)"><path class="sunc" d="' + MOON + '" fill="#f3efc9"/></g>') + front("#fff", 0);
    } else if (kind === "cloud") {
      s = back() + front("#fff", 0);
    } else if (kind === "fog") {
      s = back() + front("#fff", -4) + '<path class="sf" d="M11 38h26M16 43h16" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity="0.85" fill="none"/>';
    } else if (kind === "rain") {
      s = back() + front("#e9eff7", -5) +
        '<path class="dr d1" d="' + DROP + '" fill="#7cc4ff" transform="translate(15 41)"/><path class="dr d2" d="' + DROP + '" fill="#7cc4ff" transform="translate(24 44)"/><path class="dr d3" d="' + DROP + '" fill="#7cc4ff" transform="translate(33 41)"/>';
    } else if (kind === "snow") {
      s = back() + front("#f2f6fb", -5) +
        '<circle class="sf d1" cx="15" cy="40" r="2" fill="#fff"/><circle class="sf d2" cx="24" cy="44" r="2" fill="#fff"/><circle class="sf d3" cx="33" cy="40" r="2" fill="#fff"/>';
    } else {
      s = '<path class="cf" d="' + CL + '" fill="#cfd6e3" transform="translate(0 -6)"/><path class="bolt" d="M26 28l-6 10h4.5l-2.5 9 8-12h-4.8l3.3-7z" fill="#ffd45a"/>';
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
    document.documentElement.setAttribute("data-tab", tab);
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

  // Ketuk titik radar atau baris gempa untuk melihat detailnya
  app.addEventListener("click", function (e) {
    if (e.target.closest("#eqMore")) { eqAll = true; fillQuakes(); return; }
    var n = e.target.closest("#eqBody [data-i]");
    if (n) { eqSel = Number(n.getAttribute("data-i")); markSel(); }
  });
  app.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".eq[data-i]")) {
      e.preventDefault(); eqSel = Number(e.target.getAttribute("data-i")); markSel();
    }
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
  var PR5 = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  // Waktu sholat yang sedang berjalan: dari waktu terakhir ke waktu berikutnya, dalam menit.
  // Isya kemarin dan Subuh besok ikut dihitung supaya dini hari dan malam tetap punya pasangan.
  function prSeg(t, now) {
    var seq = [], i;
    for (i = 0; i < PR5.length; i++) if (mins(t[PR5[i]]) == null) return null;
    seq.push(["Isha", mins(t.Isha) - 1440]);
    PR5.forEach(function (k) { seq.push([k, mins(t[k])]); });
    seq.push(["Fajr", mins(t.Fajr) + 1440]);
    for (i = 0; i < seq.length - 1; i++) if (now >= seq[i][1] && now < seq[i + 1][1]) return { prev: seq[i], next: seq[i + 1] };
    return null;
  }
  function fillPrayer() {
    var box = $("prBody"); if (!box) return;
    if (!pr) { box.removeAttribute("data-ready"); box.innerHTML = '<p class="muted">Memuat waktu sholat…</p>'; return; }
    if (!pr.ok) { box.removeAttribute("data-ready"); box.innerHTML = '<p class="muted">Waktu sholat tidak bisa diambil. Coba perbarui beberapa saat lagi.</p>'; return; }
    var ic = box.getAttribute("data-ready") === "1" ? "" : " in";     // animasi hanya saat pertama terisi
    var t = pr.t, now = nowMinutes(data ? data.timezone : undefined), seg = prSeg(t, now), head = "", tom = false;
    if (seg) {
      var diff = seg.next[1] - now, pct = (now - seg.prev[1]) / (seg.next[1] - seg.prev[1]) * 100;
      tom = seg.next[1] >= 1440;
      head = '<div class="pr-hero">' +
        ringSvg(pct, "#ffd45a", '<div class="pr-in"><small>Menuju</small><b>' + esc(PR_NAME[seg.next[0]]) + '</b><span class="num">' + esc(hm(t[seg.next[0]])) + '</span></div>', ic, "big") +
        '<div class="pr-side"><div class="muted">' + (tom ? "Subuh besok, dalam" : "Dalam") + '</div><div class="cd">' + esc(durText(diff)) + '</div>' +
        '<div class="muted pr-last">Waktu terakhir: ' + esc(PR_NAME[seg.prev[0]]) + ' ' + esc(hm(t[seg.prev[0]])) + '</div>' +
        (pr.hj ? '<div class="hj">' + esc(pr.hj) + '</div>' : '') + '</div></div>';
    }
    var dots = PRAYERS.map(function (x) {
      var m = mins(t[x[0]]);
      return m == null ? "" : '<b class="tl-dot' + (m <= now ? " done" : "") + (x[0] === "Sunrise" ? " sun" : "") + '" style="left:' + (m / 14.4).toFixed(2) + '%"></b>';
    }).join("");
    var tl = '<div class="tl" aria-hidden="true"><div class="tl-fill' + ic + '" style="width:' + (now / 14.4).toFixed(1) + '%"></div>' + dots +
      '<i class="tl-now" style="left:' + (now / 14.4).toFixed(2) + '%"></i></div><div class="tl-lab" aria-hidden="true"><span>00:00</span><span>12:00</span><span>24:00</span></div>';
    var cells = PRAYERS.map(function (x) {
      var m = mins(t[x[0]]), on = seg && !tom && seg.next[0] === x[0];
      return '<li class="pt' + (on ? ' on' : '') + (m != null && m <= now ? ' done' : '') + (x[0] === "Sunrise" ? ' sun' : '') + '"><span>' + esc(x[1]) + '</span><span class="num">' + esc(hm(t[x[0]])) + '</span></li>';
    }).join("");
    box.innerHTML = head + tl + '<ol class="pts">' + cells + '</ol>' +
      '<p class="muted src">Metode ' + esc(pr.m) + ', dihitung dari koordinat lokasimu. Bisa berbeda beberapa menit dari jadwal masjid setempat, jadi pakai jadwal resmi setempat sebagai acuan. Sumber: Aladhan.</p>';
    box.setAttribute("data-ready", "1");
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
      "&longitude=" + encodeURIComponent(p.lon) + "&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&hourly=us_aqi&forecast_days=2&timezone=auto";
    var since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 19);
    var qUrl = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=" + encodeURIComponent(p.lat) +
      "&longitude=" + encodeURIComponent(p.lon) + "&maxradiuskm=1000&minmagnitude=2.5&orderby=time&limit=20&starttime=" + since;
    var ct = data && data.current && data.current.time ? data.current.time.slice(0, 10).split("-") : null;
    if (ct) {
      var meth = prMethod(p.country);
      var pUrl = "https://api.aladhan.com/v1/timings/" + ct[2] + "-" + ct[1] + "-" + ct[0] + "?latitude=" + encodeURIComponent(p.lat) +
        "&longitude=" + encodeURIComponent(p.lon) + "&method=" + meth[0];
      getJSON(pUrl).then(function (d) {
        if (seq !== extraSeq) return;
        var t = d && d.data && d.data.timings;
        var hj = d.data.date && d.data.date.hijri;
        pr = t ? { ok: true, t: t, m: meth[1], hj: hj ? hj.day + " " + ((hj.month && hj.month.en) || "") + " " + hj.year + " H" : "" } : { ok: false };
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

  var AQ_COL = ["#4ade80", "#facc15", "#fb923c", "#ef4444", "#a855f7", "#be123c"];
  function aqIdx(v) {
    for (var i = 0; i < AQ_LEVELS.length; i++) if (v <= AQ_LEVELS[i][0]) return i;
    return AQ_LEVELS.length - 1;
  }
  // Alat ukur setengah lingkaran 0..300 dengan jarum
  function gaugeSvg(v, ic) {
    var bounds = [0, 50, 100, 150, 200, 300], i;
    function pt(f, rad) { var a = Math.PI * (1 - f); return [(120 + rad * Math.cos(a)).toFixed(1), (120 - rad * Math.sin(a)).toFixed(1)]; }
    var s = '<svg class="gauge" viewBox="0 0 240 132" role="img" aria-label="Indeks kualitas udara ' + v + '">';
    for (i = 0; i < 5; i++) {
      var a = pt(bounds[i] / 300 + 0.006, 100), b = pt(bounds[i + 1] / 300 - 0.006, 100);
      s += '<path class="gbg" d="M' + a[0] + " " + a[1] + " A100 100 0 0 1 " + b[0] + " " + b[1] + '" stroke="' + AQ_COL[i] + '"/>';
    }
    var ang = (Math.min(v, 300) / 300 * 180 - 90).toFixed(1);
    return s + '<g class="needle' + ic + '" style="transform:rotate(' + ang + 'deg)"><path d="M120 120 L116 118 L120 34 L124 118 Z" fill="#fff"/></g><circle class="hub" cx="120" cy="120" r="8"/></svg>';
  }

  function fillAir() {
    var box = $("aqBody"); if (!box) return;
    if (!aq) { box.removeAttribute("data-ready"); box.innerHTML = '<p class="muted">Memuat kualitas udara…</p>'; return; }
    if (!aq.ok) { box.removeAttribute("data-ready"); box.innerHTML = '<p class="muted">Data kualitas udara tidak bisa diambil. Coba perbarui beberapa saat lagi.</p>'; return; }
    var cur = aq.d && aq.d.current;
    if (!cur || cur.us_aqi == null) { box.innerHTML = '<p class="muted">Data kualitas udara untuk lokasi ini belum tersedia.</p>'; return; }
    var ic = box.getAttribute("data-ready") === "1" ? "" : " in";
    var v = r(cur.us_aqi), lv = aqLevel(v), i;
    var pols = [["PM2.5", cur.pm2_5, 15], ["PM10", cur.pm10, 45], ["Ozon (O₃)", cur.ozone, 100], ["Nitrogen dioksida", cur.nitrogen_dioxide, 25]];
    var polHtml = pols.map(function (p) {
      if (p[1] == null) return "";
      var ratio = p[1] / p[2], wd = Math.min(100, ratio * 50);
      var col = ratio <= 1 ? AQ_COL[0] : ratio <= 2 ? AQ_COL[1] : ratio <= 3.5 ? AQ_COL[2] : AQ_COL[3];
      return '<div class="pol-row"><div class="top"><span>' + esc(p[0]) + '</span><span class="num">' + num1(p[1], 0) + ' <small class="muted">µg/m³ · ' + ratio.toFixed(1).replace(".", ",") + '× pedoman</small></span></div>' +
        '<div class="pol-bar"><i class="' + ic.trim() + '" style="width:' + wd.toFixed(1) + '%;background:' + col + '"></i><b></b></div></div>';
    }).join("");

    var hourly = "", hr = aq.d && aq.d.hourly;
    if (hr && hr.time && hr.us_aqi && hr.time.length) {
      var from = cur.time ? hr.time.findIndex(function (t) { return t >= cur.time.slice(0, 13) + ":00"; }) : 0;
      if (from < 0) from = 0;
      var n = Math.min(24, hr.time.length - from), bars = "", topV = 100;
      for (i = 0; i < n; i++) if (hr.us_aqi[from + i] > topV) topV = hr.us_aqi[from + i];
      topV = Math.min(topV, 300);
      for (i = 0; i < n; i++) {
        var av = hr.us_aqi[from + i];
        if (av == null) continue;
        var bh = Math.max(3, Math.min(av, topV) / topV * 52);
        bars += '<rect class="hb' + ic + '" x="' + (i * 12 + 1) + '" y="' + (58 - bh).toFixed(1) + '" width="10" height="' + bh.toFixed(1) + '" rx="3" fill="' + AQ_COL[aqIdx(av)] + '" style="animation-delay:' + (i * 0.025).toFixed(3) + 's"/>';
        if (i % 6 === 0) bars += '<text x="' + (i === 0 ? 1 : i * 12 + 6) + '" y="74"' + (i === 0 ? ' style="text-anchor:start"' : '') + '>' + esc(hr.time[from + i].slice(11, 16)) + '</text>';
      }
      if (bars) hourly = '<h3 class="sub-h">24 jam ke depan</h3><svg class="aqh" viewBox="0 0 288 78" aria-hidden="true">' + bars + '</svg>';
    }
    box.innerHTML =
      gaugeSvg(v, ic) +
      '<div class="aq-mid"><div class="aqi num">' + v + '</div><div class="aq-lv" style="color:' + AQ_COL[aqIdx(v)] + '">' + esc(lv[1]) + '</div><div class="muted">Indeks AQI (standar AS)</div></div>' +
      '<p class="aq-tip">' + esc(lv[2]) + '</p>' +
      '<h3 class="sub-h">Zat pencemar</h3><div class="pol">' + polHtml + '</div>' +
      '<p class="muted src">Garis putih pada batang adalah pedoman WHO 2021 (rata-rata 24 jam, ozon 8 jam).</p>' +
      hourly +
      '<p class="muted src">Perkiraan model Open-Meteo, bukan hasil alat ukur di lokasimu.</p>';
    box.setAttribute("data-ready", "1");
  }

  // ===== Gempa =====
  function bearingDeg(la1, lo1, la2, lo2) {
    var rad = Math.PI / 180, f1 = la1 * rad, f2 = la2 * rad, dl = (lo2 - lo1) * rad;
    var y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function quakeInfo(f, p) {
    var pp = f.properties || {}, g = (f.geometry && f.geometry.coordinates) || [], ok = g.length >= 2;
    return {
      mag: pp.mag, place: quakePlace(pp.place), time: pp.time, depth: g[2],
      km: ok ? distKm(p.lat, p.lon, g[1], g[0]) : null, brg: ok ? bearingDeg(p.lat, p.lon, g[1], g[0]) : null
    };
  }
  function magTxt(m) { return m != null ? Number(m).toFixed(1) : "?"; }
  function eqMeta(q) {
    return [q.time ? ago(q.time) : "", q.km != null ? r(q.km) + " km dari sini" : "", q.depth != null ? "kedalaman " + r(q.depth) + " km" : ""].filter(Boolean).join(" · ");
  }
  function markSel() {
    var box = $("eqBody"); if (!box || !quakes || !quakes.infos) return;
    Array.prototype.forEach.call(box.querySelectorAll("[data-i]"), function (n) {
      n.classList.toggle("sel", Number(n.getAttribute("data-i")) === eqSel);
    });
    var q = quakes.infos[eqSel], el = $("eqSel");
    if (q && el) {
      el.innerHTML = '<span class="mag sm num" style="background:' + magColor(q.mag) + '">' + magTxt(q.mag) + '</span>' +
        '<div><div class="eqp">' + esc(q.place) + '</div><div class="eqs muted">' + esc(eqMeta(q)) + '</div></div>';
    }
  }

  function fillQuakes() {
    var box = $("eqBody"); if (!box) return;
    if (!quakes) { box.removeAttribute("data-ready"); box.innerHTML = '<p class="muted">Memuat data gempa…</p>'; return; }
    if (!quakes.ok) { box.removeAttribute("data-ready"); box.innerHTML = '<p class="muted">Data gempa tidak bisa diambil. Coba perbarui beberapa saat lagi.</p>'; return; }
    var feats = (quakes.d && quakes.d.features) || [];
    var src = '<p class="muted src">Sumber: USGS. Gempa kecil di luar Amerika Serikat sering tidak tercatat. Untuk Indonesia, rujukan resminya BMKG (bmkg.go.id).</p>';
    if (!feats.length) {
      quakes.infos = [];
      box.innerHTML = '<p class="muted">Tidak ada gempa M2.5 ke atas dalam radius 1.000 km selama 7 hari terakhir.</p>' + src;
      return;
    }
    var ic = box.getAttribute("data-ready") === "1" ? "" : " in", i;
    var infos = feats.map(function (f) { return quakeInfo(f, quakes.p); });
    quakes.infos = infos;
    if (eqSel >= infos.length) eqSel = 0;

    var maxM = -1, near = Infinity, n24 = 0;
    infos.forEach(function (q) {
      if (q.mag != null && q.mag > maxM) maxM = q.mag;
      if (q.km != null && q.km < near) near = q.km;
      if (q.time && Date.now() - q.time < 864e5) n24++;
    });

    // Radar: kamu di tengah, jarak dan arah tiap gempa digambar sesuai kenyataan (skala 1.000 km).
    var R = 128, s = '<svg class="radar" viewBox="0 0 300 300" role="img" aria-label="Peta radar gempa di sekitar lokasimu">' +
      '<defs><radialGradient id="swg" cx="150" cy="150" r="130" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7cf0c0" stop-opacity="0"/><stop offset="1" stop-color="#7cf0c0" stop-opacity="0.4"/></radialGradient></defs>' +
      '<line class="rx" x1="150" y1="14" x2="150" y2="286"/><line class="rx" x1="14" y1="150" x2="286" y2="150"/>';
    for (i = 1; i <= 4; i++) {
      s += '<circle class="rr" cx="150" cy="150" r="' + (R * i / 4) + '"/>' +
        '<text class="rl" x="' + (150 + R * i / 4 * 0.7071 + 3).toFixed(1) + '" y="' + (150 - R * i / 4 * 0.7071 - 3).toFixed(1) + '">' + (i * 250) + (i === 4 ? " km" : "") + '</text>';
    }
    s += '<text class="rn" x="150" y="11">U</text>' +
      '<g class="sweep"><path d="M150 150 L66.4 50.4 A130 130 0 0 1 150 20 Z" fill="url(#swg)"/></g>';
    var order = infos.map(function (q, k) { return k; }).sort(function (a, b) { return (infos[a].mag || 0) - (infos[b].mag || 0); });
    order.forEach(function (idx, pos) {
      var q = infos[idx]; if (q.km == null) return;
      var rr = Math.min(q.km, 1000) / 1000 * R, a = q.brg * Math.PI / 180, x = (150 + rr * Math.sin(a)).toFixed(1), y = (150 - rr * Math.cos(a)).toFixed(1);
      var rad = Math.min(15, 3.5 + Math.max(0, (q.mag || 2.5) - 2.5) * 2.2), col = magColor(q.mag), recent = q.time && Date.now() - q.time < 864e5;
      s += '<g class="qd' + (idx === eqSel ? " sel" : "") + '" data-i="' + idx + '" role="button" aria-label="Gempa M' + magTxt(q.mag) + ', ' + esc(q.place) + '">' +
        (recent ? '<circle class="pulse" cx="' + x + '" cy="' + y + '" r="' + rad.toFixed(1) + '" stroke="' + col + '"/>' : "") +
        '<circle class="dot' + ic + '" cx="' + x + '" cy="' + y + '" r="' + rad.toFixed(1) + '" fill="' + col + '" style="animation-delay:' + (pos * 0.05).toFixed(2) + 's"/>' +
        '<circle cx="' + x + '" cy="' + y + '" r="' + Math.max(14, rad) + '" fill="transparent"/></g>';
    });
    s += '<circle class="me-r" cx="150" cy="150" r="9"/><circle class="me" cx="150" cy="150" r="4.5"/></svg>';

    var shown = eqAll ? infos.length : Math.min(8, infos.length);
    var rows = "";
    for (i = 0; i < shown; i++) {
      rows += '<li class="eq' + (i === eqSel ? " sel" : "") + '" data-i="' + i + '" tabindex="0"><span class="mag num" style="background:' + magColor(infos[i].mag) + '">' + magTxt(infos[i].mag) + '</span>' +
        '<div><div class="eqp">' + esc(infos[i].place) + '</div><div class="eqs muted">' + esc(eqMeta(infos[i])) + '</div></div></li>';
    }
    box.innerHTML =
      '<div class="chips three">' + chip("Terkuat", "M" + magTxt(maxM)) + chip("24 jam terakhir", n24 + " gempa") + chip("Terdekat", near === Infinity ? "-" : r(near) + " km") + '</div>' +
      s +
      '<div class="eq-sel" id="eqSel" aria-live="polite"></div>' +
      '<div class="leg" aria-hidden="true"><span><i style="background:#ffd45a"></i>M2,5–3,9</span><span><i style="background:#ffa94d"></i>M4–4,9</span><span><i style="background:#ff7a59"></i>M5–5,9</span><span><i style="background:#ff4d6d"></i>M6+</span></div>' +
      '<p class="muted eqsum">Radar menampilkan ' + infos.length + ' gempa M2.5+ dalam radius 1.000 km, 7 hari terakhir. Titik berdenyut terjadi dalam 24 jam terakhir. Ketuk titik atau baris untuk detail.</p>' +
      '<ol class="quakes">' + rows + '</ol>' +
      (infos.length > shown ? '<button class="link moreb" type="button" id="eqMore">Lihat semua (' + infos.length + ')</button>' : "") + src;
    box.setAttribute("data-ready", "1");
    markSel();
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

  // ===== Gambar kecil (SVG) dan potongan tampilan =====
  function smoothPath(pts) {
    var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1), i;
    for (i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += " C" + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + " " + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) +
        " " + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + " " + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) +
        " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
    }
    return d;
  }
  function tempColor(t) {
    if (t <= 14) return "#7cc4ff";
    if (t <= 20) return "#7fe0d0";
    if (t <= 26) return "#ffe07a";
    if (t <= 31) return "#ffb454";
    return "#ff7a59";
  }
  // Cincin kemajuan (0..100). ic = " in" supaya cincin terisi dengan animasi.
  function ringSvg(pct, color, inner, ic, size) {
    var p = Math.max(0, Math.min(100, pct || 0)).toFixed(1);
    return '<div class="ringw' + (size ? " " + size : "") + '"><svg viewBox="0 0 80 80" aria-hidden="true">' +
      '<circle class="rg-bg" cx="40" cy="40" r="33"/>' +
      '<circle class="rg-fg' + (ic || "") + '" cx="40" cy="40" r="33" pathLength="100" stroke="' + color + '" stroke-dasharray="' + p + ' 100" transform="rotate(-90 40 40)"/></svg>' +
      '<div class="ringt">' + inner + '</div></div>';
  }
  function chip(label, val) { return '<div class="chip"><span>' + label + '</span><b class="num">' + val + '</b></div>'; }
  function tile(cls, title, body) { return '<section class="glass tile ' + cls + '"><h3>' + title + '</h3>' + body + '</section>'; }

  // Kurva suhu 24 jam dengan batang peluang hujan. Lebar tiap jam 70px, sejajar dengan daftar ikon di atasnya.
  function hourChart(h, start, N) {
    var CW = 70, VH = 118, top = 30, bot = 72, i, t = [], lo = Infinity, hi = -Infinity, hiI = 0, loI = 0;
    for (i = 0; i < N; i++) {
      var v = h.temperature_2m[start + i];
      t.push(v);
      if (v > hi) { hi = v; hiI = i; }
      if (v < lo) { lo = v; loI = i; }
    }
    var span = Math.max(hi - lo, 3);
    var pts = t.map(function (v, k) { return [k * CW + CW / 2, top + (hi - v) / span * (bot - top)]; });
    var line = smoothPath(pts);
    var area = line + " L" + pts[N - 1][0].toFixed(1) + " " + (bot + 14) + " L" + pts[0][0].toFixed(1) + " " + (bot + 14) + " Z";
    var s = '<svg class="tchart" width="' + N * CW + '" height="' + VH + '" viewBox="0 0 ' + N * CW + " " + VH + '" aria-hidden="true">' +
      '<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<path class="ar in" d="' + area + '" fill="url(#tg)"/>';
    for (i = 0; i < N; i++) {
      var p = h.precipitation_probability[start + i];
      if (p != null && p >= 10) {
        var bh = Math.max(3, p / 100 * 24);
        s += '<rect class="rb in" x="' + (i * CW + CW / 2 - 7) + '" y="' + (VH - 3 - bh).toFixed(1) + '" width="14" height="' + bh.toFixed(1) + '" rx="3" fill="#7cc4ff" opacity="0.6" style="animation-delay:' + (i * 0.03).toFixed(2) + 's"/>';
      }
    }
    s += '<path class="ln in" pathLength="1" d="' + line + '" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
    for (i = 0; i < N; i++) {
      if (i === 0) s += '<circle class="pulse" cx="' + pts[i][0].toFixed(1) + '" cy="' + pts[i][1].toFixed(1) + '" r="5" fill="#fff" opacity="0.5"/>';
      s += '<circle cx="' + pts[i][0].toFixed(1) + '" cy="' + pts[i][1].toFixed(1) + '" r="' + (i === 0 ? 5 : 3.2) + '" fill="#fff"/>' +
        '<text class="tv" x="' + pts[i][0].toFixed(1) + '" y="' + (pts[i][1] - 11).toFixed(1) + '">' + r(t[i]) + '°</text>';
    }
    s += "</svg>";
    return { svg: s, hi: hi, hiT: h.time[start + hiI].slice(11, 16), lo: lo, loT: h.time[start + loI].slice(11, 16) };
  }

  // Busur perjalanan matahari dari terbit ke terbenam
  function sunBody(c, dly) {
    var rise = tmin(dly.sunrise && dly.sunrise[0]), set = tmin(dly.sunset && dly.sunset[0]), now = tmin(c.time);
    if (rise == null || set == null || now == null) return "<p>Data matahari tidak tersedia.</p>";
    var p = (now - rise) / (set - rise), up = p >= 0 && p <= 1, t = Math.max(0, Math.min(1, p)), u = 1 - t;
    var sx = u * u * 30 + 2 * u * t * 150 + t * t * 270, sy = u * u * 100 + 2 * u * t * -40 + t * t * 100;
    var msg = up ? "Matahari terbenam " + durText(set - now) + " lagi" : now < rise ? "Matahari terbit " + durText(rise - now) + " lagi" : "Matahari sudah terbenam";
    var len = set - rise, d = "M30 100 Q150 -40 270 100";
    return '<svg class="sunarc" viewBox="0 0 300 112" aria-hidden="true">' +
      '<line class="base" x1="14" y1="100" x2="286" y2="100"/><path class="track" d="' + d + '"/>' +
      (up ? '<path class="prog in" pathLength="100" d="' + d + '" stroke-dasharray="' + (t * 100).toFixed(1) + ' 100"/>' +
        '<g class="sundot in"><circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="13" fill="#ffd45a" opacity="0.3"/><circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="7" fill="#ffd45a"/></g>' : "") +
      '</svg>' +
      '<div class="suntimes"><div><span>Terbit</span><b class="num">' + esc(dly.sunrise[0].slice(11, 16)) + '</b></div>' +
      '<div><span>Lama siang</span><b class="num">' + Math.floor(len / 60) + ' j ' + (len % 60) + ' m</b></div>' +
      '<div><span>Terbenam</span><b class="num">' + esc(dly.sunset[0].slice(11, 16)) + '</b></div></div>' +
      '<p>' + esc(msg) + '</p>';
  }
  function windWord(k) {
    if (k < 6) return "tenang";
    if (k < 20) return "sepoi-sepoi";
    if (k < 39) return "sedang";
    if (k < 62) return "kencang";
    if (k < 88) return "sangat kencang";
    return "badai";
  }
  // Kompas angin: panah menunjuk ke arah angin bertiup (kebalikan dari arah asal angin).
  function windBody(c) {
    var spd = c.wind_speed_10m || 0, gust = c.wind_gusts_10m, dir = c.wind_direction_10m || 0, to = (dir + 180) % 360, i;
    var s = '<svg class="wind" viewBox="0 0 120 120" aria-hidden="true"><circle class="wr" cx="60" cy="60" r="54"/>';
    for (i = 0; i < 24; i++) {
      var a = i * 15 * Math.PI / 180, l = i % 6 === 0 ? 8 : 4;
      s += '<line class="wt" x1="' + (60 + 54 * Math.sin(a)).toFixed(1) + '" y1="' + (60 - 54 * Math.cos(a)).toFixed(1) +
        '" x2="' + (60 + (54 - l) * Math.sin(a)).toFixed(1) + '" y2="' + (60 - (54 - l) * Math.cos(a)).toFixed(1) + '"/>';
    }
    s += '<text x="60" y="28">U</text><text x="92" y="64">T</text><text x="60" y="100">S</text><text x="28" y="64">B</text>' +
      '<g transform="rotate(' + to.toFixed(0) + ' 60 60)"><g class="sway"><path class="wa" d="M60 30 L67 46 L62 44 L62 84 L58 84 L58 44 L53 46 Z"/></g></g></svg>';
    return s + '<div class="big num">' + r(spd) + ' <small>km/j</small></div><p>Dari ' + compassWord(dir) + ', ' + windWord(spd) +
      (gust != null ? '. Hembusan sampai ' + r(gust) + ' km/j.' : '.') + '</p>';
  }
  function uvBody(uv) {
    if (uv == null) return "<p>Tidak tersedia.</p>";
    var pos = Math.min(uv, 12) / 12 * 100;
    return '<div class="big num">' + uv.toFixed(0) + ' <small>' + uvLabel(uv) + '</small></div>' +
      '<div class="scale uv" aria-hidden="true"><i style="left:' + pos.toFixed(1) + '%"></i></div>' +
      '<p>' + (uv >= 3 ? "Puncak hari ini. Pakai tabir surya dan topi, hindari terik sekitar tengah hari." : "Risiko sinar UV rendah hari ini.") + '</p>';
  }

  function render(failed) {
    if (!data) return;
    var c = data.current, h = data.hourly, dly = data.daily, i, k;
    var isDay = c.is_day === 1;
    var w = wx(c.weather_code);
    var nowM = tmin(c.time), riseM = tmin(dly.sunrise && dly.sunrise[0]), setM = tmin(dly.sunset && dly.sunset[0]);
    var sky = skyKey(w[1], isDay, nowM, riseM, setM);
    document.documentElement.setAttribute("data-sky", sky);
    var spd = c.wind_speed_10m || 0;
    FX.set(sky, { wind: spd / 60, speed: 0.7 + spd / 20, sun: w[1] === "partly" && isDay && sky === "cloud" });

    var nowHour = c.time.slice(0, 13) + ":00";
    var start = h.time.findIndex(function (t) { return t >= nowHour; });
    if (start < 0) start = 0;
    var N = Math.min(24, h.time.length - start);
    var hoursHtml = "";
    for (i = start; i < start + N; i++) {
      var hw = wx(h.weather_code[i]), pp = h.precipitation_probability[i];
      hoursHtml += '<li class="hour' + (i === start ? ' now' : '') + '">' +
        '<span class="t num">' + (i === start ? "Sekarang" : esc(h.time[i].slice(11, 16))) + '</span>' +
        icon(hw[1], h.is_day[i] === 1, "sm") +
        '<span class="p num">' + (pp != null && pp >= 10 ? pp + '%' : '') + '</span></li>';
    }
    var ch = hourChart(h, start, N);

    var wmin = Math.min.apply(null, dly.temperature_2m_min), wmax = Math.max.apply(null, dly.temperature_2m_max), wspan = Math.max(wmax - wmin, 4);
    var daysHtml = "";
    for (k = 0; k < dly.time.length; k++) {
      var dw = wx(dly.weather_code[k]), dp = dly.precipitation_probability_max[k], dd = dateParts(dly.time[k]);
      var lo = dly.temperature_2m_min[k], hi = dly.temperature_2m_max[k], mm = dly.precipitation_sum ? dly.precipitation_sum[k] : 0;
      var wid = Math.max(8, (hi - lo) / wspan * 100), left = (lo - wmin) / wspan * 100;
      if (left + wid > 100) left = 100 - wid;
      var dot = "";
      if (k === 0) {
        var cur = Math.min(Math.max(c.temperature_2m, lo), hi);
        dot = '<b class="dot" style="left:' + (left + (cur - lo) / Math.max(hi - lo, 0.1) * wid).toFixed(1) + '%"></b>';
      }
      daysHtml += '<li class="day">' +
        '<span class="d">' + (k === 0 ? "Hari ini" : esc(dd.wd)) + '<small>' + esc(dd.md) + '</small></span>' +
        '<span class="i">' + icon(dw[1], true, "sm") + '<span class="p num">' + (dp != null && dp >= 10 ? dp + '%' : '') + '</span></span>' +
        '<span class="m"><span class="c">' + esc(dw[0]) + (mm != null && mm >= 0.5 ? ' · ' + num1(mm, 0) + ' mm' : '') + '</span>' +
        '<span class="rg"><span class="lo num">' + r(lo) + '°</span><span class="trk"><i class="bar in" style="left:' + left.toFixed(1) + '%;width:' + wid.toFixed(1) +
        '%;background:linear-gradient(90deg,' + tempColor(lo) + ',' + tempColor(hi) + ');animation-delay:' + (k * 0.06).toFixed(2) + 's"></i>' + dot +
        '</span><span class="hi num">' + r(hi) + '°</span></span></span></li>';
    }

    var uv = dly.uv_index_max && dly.uv_index_max[0];
    var rainMax = dly.precipitation_probability_max && dly.precipitation_probability_max[0];
    var rainSum = dly.precipitation_sum && dly.precipitation_sum[0];
    var dew = h.dew_point_2m ? h.dew_point_2m[start] : null;
    var visM = h.visibility ? h.visibility[start] : null;
    var vis = visM != null ? visM / 1000 : null;
    var p3 = h.surface_pressure ? h.surface_pressure[Math.min(start + 3, h.surface_pressure.length - 1)] : null;
    var pd = p3 != null && h.surface_pressure[start] != null ? p3 - h.surface_pressure[start] : 0;
    var feelDiff = c.apparent_temperature - c.temperature_2m;
    var cc = c.cloud_cover == null ? 0 : c.cloud_cover;

    var detail = '<div class="tiles">' +
      tile("wide", "Matahari", sunBody(c, dly)) +
      tile("", "Angin", windBody(c)) +
      tile("", "Indeks UV hari ini", uvBody(uv)) +
      tile("", "Kelembapan", ringSvg(c.relative_humidity_2m, "#7cc4ff", '<b class="num rv">' + r(c.relative_humidity_2m) + '%</b>', " in") +
        '<p>' + (dew != null ? 'Titik embun ' + r(dew) + '°. ' : '') + (c.relative_humidity_2m >= 80 ? "Udara terasa lembap." : c.relative_humidity_2m <= 40 ? "Udara kering." : "Tingkat nyaman.") + '</p>') +
      tile("", "Tutupan awan", ringSvg(cc, "#e6eefa", '<b class="num rv">' + r(cc) + '%</b>', " in") +
        '<p>' + (cc < 20 ? "Langit cerah." : cc < 50 ? "Sebagian berawan." : cc < 85 ? "Berawan." : "Mendung tebal.") + '</p>') +
      tile("", "Tekanan udara", '<div class="big num">' + r(c.surface_pressure) + ' <small>hPa</small></div><p>' +
        (pd >= 1 ? "Naik, cuaca cenderung membaik." : pd <= -1 ? "Turun, cuaca bisa memburuk." : "Stabil dalam 3 jam ke depan.") + '</p>') +
      tile("", "Jarak pandang", '<div class="big num">' + (vis != null ? (vis >= 10 ? r(vis) : vis.toFixed(1).replace(".", ",")) : "-") + ' <small>km</small></div><p>' +
        (vis == null ? "" : vis >= 10 ? "Jernih." : vis >= 5 ? "Cukup baik." : vis >= 2 ? "Terbatas." : "Sangat terbatas, hati-hati berkendara.") + '</p>') +
      tile("", "Hujan hari ini", '<div class="big num">' + (rainSum != null ? num1(rainSum, rainSum < 10 ? 1 : 0).replace(".", ",") : "-") + ' <small>mm</small></div><p>' +
        (rainMax != null ? "Peluang tertinggi " + rainMax + "%." : "") + ((c.precipitation || 0) > 0 ? " Sekarang " + c.precipitation.toFixed(1).replace(".", ",") + " mm." : "") + '</p>') +
      tile("", "Terasa seperti", '<div class="big num">' + r(c.apparent_temperature) + '<small>°</small></div><p>' +
        (feelDiff >= 2 ? "Lebih panas dari suhu sebenarnya (" + r(c.temperature_2m) + "°)." : feelDiff <= -2 ? "Lebih dingin dari suhu sebenarnya (" + r(c.temperature_2m) + "°)." : "Mirip suhu sebenarnya.") + '</p>') +
      '</div>' +
      '<div class="status">' +
      (failed
        ? '<span>Gagal memperbarui. Data terakhir pukul <span class="num">' + esc(updatedText()) + '</span>.</span>'
        : '<span>Diperbarui pukul <span class="num">' + esc(updatedText()) + '</span></span>') +
      '<button class="link" id="refresh" type="button">Perbarui sekarang</button></div>';

    var icsvg = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; };
    app.innerHTML =
      '<div class="view" id="v-cuaca"><section class="hero" aria-label="Cuaca saat ini">' +
        '<div class="hero-ico">' + icon(w[1], isDay, "xl") + '</div>' +
        '<div class="temp num" id="temp">' + r(c.temperature_2m) + '<span class="deg">°</span></div>' +
        '<div class="cond">' + esc(w[0]) + '<span class="hl num">' + r(dly.temperature_2m_min[0]) + '° / ' + r(dly.temperature_2m_max[0]) + '°</span></div>' +
        '<div class="feel">Terasa seperti ' + r(c.apparent_temperature) + '° · angin dari ' + compassWord(c.wind_direction_10m) + '</div>' +
        '<p class="tip">' + esc(adviceText(c, h, start, isDay, uv)) + '</p>' +
        '<div class="chips">' + chip("Kelembapan", r(c.relative_humidity_2m) + "%") + chip("Angin", r(spd) + " km/j") +
          chip("Indeks UV", uv != null ? uv.toFixed(0) : "-") + chip("Hujan", rainMax != null ? rainMax + "%" : "-") + '</div>' +
      '</section>' +
      '<div class="seg" role="group" aria-label="Rincian cuaca">' +
        '<button type="button" data-sub="jam">24 jam</button><button type="button" data-sub="hari">7 hari</button><button type="button" data-sub="detail">Detail</button></div>' +
      '<section class="glass" id="sub-jam" aria-label="Per jam"><h2>' + icsvg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') + '24 jam berikutnya</h2>' +
        '<div class="hscroll"><div class="hwrap" style="width:' + N * 70 + 'px"><ol class="hours">' + hoursHtml + '</ol>' + ch.svg + '</div></div>' +
        '<p class="muted src">Tertinggi ' + r(ch.hi) + '° pukul ' + esc(ch.hiT) + ', terendah ' + r(ch.lo) + '° pukul ' + esc(ch.loT) + '. Batang biru menunjukkan peluang hujan. Geser ke samping untuk jam berikutnya.</p></section>' +
      '<section class="glass" id="sub-hari" aria-label="Per hari"><h2>' + icsvg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>') + '7 hari berikutnya</h2><ol class="days">' + daysHtml + '</ol>' +
        '<p class="muted src">Batang menunjukkan rentang suhu terendah sampai tertinggi. Titik putih adalah suhu sekarang.</p></section>' +
      '<div id="sub-detail" aria-label="Detail cuaca">' + detail + '</div></div>' +
      '<div class="view" id="v-sholat" hidden><section class="glass" aria-label="Waktu sholat"><h2>' + icsvg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>') + 'Waktu sholat</h2><div id="prBody"></div></section></div>' +
      '<div class="view" id="v-udara" hidden><section class="glass" aria-label="Kualitas udara"><h2>' + icsvg('<path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6"/>') + 'Kualitas udara</h2><div id="aqBody"></div></section></div>' +
      '<div class="view" id="v-gempa" hidden><section class="glass" aria-label="Gempa terdekat"><h2>' + icsvg('<path d="M2.5 12h4l2.5-6.5 4 13 2.5-6.5h6"/>') + 'Gempa di sekitarmu</h2><div id="eqBody"></div></section></div>';

    applyView();
    // Muat ulang otomatis tidak mengulang animasi masuk; hanya tampilan pertama setelah ganti lokasi.
    app.classList.toggle("quiet", !animateNext);
    if (!animateNext) { var vv = app.querySelector(".view:not([hidden])"); if (vv) vv.style.animation = "none"; }
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
    data = null; aq = null; quakes = null; pr = null; eqSel = 0; eqAll = false;
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
