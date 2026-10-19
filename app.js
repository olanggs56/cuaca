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
  var aq = null, quakes = null, pr = null, extraSeq = 0, eqSel = 0, eqAll = false, hStart = 0, hN = 0, aqRange = null;
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
      "&hourly=temperature_2m,precipitation_probability,weather_code,is_day,surface_pressure,visibility,dew_point_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,uv_index" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant" +
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

  app.addEventListener("click", function (e) { if (e.target.closest("#eqMore")) { eqAll = true; fillQuakes(); } });

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
      head = '<div class="pr-hero" data-sheet="pr:' + PRAYERS.map(function (x) { return x[0]; }).indexOf(seg.next[0]) + '" role="button" tabindex="0">' +
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
      return '<li class="pt' + (on ? ' on' : '') + (m != null && m <= now ? ' done' : '') + (x[0] === "Sunrise" ? ' sun' : '') + '" data-sheet="pr:' + PRAYERS.indexOf(x) + '" role="button" tabindex="0"><span>' + esc(x[1]) + '</span><span class="num">' + esc(hm(t[x[0]])) + '</span></li>';
    }).join("");
    box.innerHTML = head + tl + '<ol class="pts">' + cells + '</ol>' +
      '<p class="muted src">Metode ' + esc(pr.m) + ', dihitung dari koordinat lokasimu. Bisa berbeda beberapa menit dari jadwal masjid setempat, jadi pakai jadwal resmi setempat sebagai acuan. Sumber: Aladhan. Ketuk waktu sholat untuk detail.</p>';
    box.setAttribute("data-ready", "1");
  }

  // ===== Ayat motivasi sesuai waktu (Quran Cloud) =====
  // Teks Arab dan terjemahan diambil langsung dari API saat dibuka, bukan diketik manual, supaya tidak ada salah salin.
  var Q_SLOTS = [
    { id: "pagi", from: 240, to: 600, hi: "Assalamu'alaikum", icon: "☀", verses: [
      ["94:6", "Setelah kesulitan selalu ada kemudahan."], ["93:5", "Allah akan memberi karunia sampai hatimu puas."], ["65:3", "Bertawakal, lalu biarkan Allah yang mencukupi."]] },
    { id: "siang", from: 600, to: 900, hi: "Assalamu'alaikum", icon: "☀", verses: [
      ["2:286", "Beban yang datang tidak melebihi kemampuanmu."], ["3:139", "Jangan lemah dan jangan bersedih hati."], ["62:10", "Selesai sholat, lanjutkan mencari karunia Allah."]] },
    { id: "sore", from: 900, to: 1110, hi: "Assalamu'alaikum", icon: "◐", verses: [
      ["103:3", "Saling menasihati dalam kebenaran dan kesabaran."], ["2:153", "Mintalah pertolongan dengan sabar dan sholat."], ["94:7", "Selesai satu urusan, lanjut ke urusan berikutnya dengan sungguh-sungguh."]] },
    { id: "malam", from: 1110, to: 1320, hi: "Assalamu'alaikum", icon: "☾", verses: [
      ["13:28", "Hati menjadi tenang dengan mengingat Allah."], ["25:47", "Malam adalah waktu untuk beristirahat."], ["2:152", "Ingatlah Allah, Dia pun mengingatmu."]] },
    { id: "larut", from: 1320, to: 1680, hi: "Assalamu'alaikum", icon: "✦", verses: [
      ["17:79", "Waktu tenang untuk tahajud dan berdoa."], ["39:53", "Jangan putus asa dari rahmat Allah."], ["2:186", "Allah dekat dan mengabulkan doa."]] }
  ];
  var qCache = {}, qShift = 0, qSlotId = "", qKey = "", qAudio = null, qAudioKey = "", qSeq = 0;

  function qSlot(mn) {
    var m = mn < 240 ? mn + 1440 : mn, i;
    for (i = 0; i < Q_SLOTS.length; i++) if (m >= Q_SLOTS[i].from && m < Q_SLOTS[i].to) return Q_SLOTS[i];
    return Q_SLOTS[0];
  }
  function dayOfYear() { var d = new Date(); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5); }
  function qCurrent() {
    var s = qSlot(nowMinutes(data ? data.timezone : undefined));
    if (s.id !== qSlotId) { qSlotId = s.id; qShift = 0; }
    var v = s.verses[(dayOfYear() + qShift) % s.verses.length];
    return { slot: s, ref: v[0], theme: v[1] };
  }
  function pad3(n) { n = String(n); while (n.length < 3) n = "0" + n; return n; }
  function qAudioSrc(ref, info) {
    var p = ref.split(":");
    return [info && info.audio, "https://everyayah.com/data/Alafasy_128kbps/" + pad3(p[0]) + pad3(p[1]) + ".mp3"].filter(Boolean);
  }
  function qLoad(ref) {
    if (qCache[ref]) return Promise.resolve(qCache[ref]);
    return getJSON("https://api.alquran.cloud/v1/ayah/" + ref + "/editions/quran-uthmani,id.indonesian,ar.alafasy").then(function (d) {
      var a = d && d.data, ar, id, au;
      if (!a || !a.length) throw new Error("kosong");
      a.forEach(function (x) {
        if (x.edition && x.edition.identifier === "quran-uthmani") ar = x;
        else if (x.edition && x.edition.identifier === "id.indonesian") id = x;
        else if (x.edition && x.edition.identifier === "ar.alafasy") au = x;
      });
      if (!ar || !id) throw new Error("edisi tidak lengkap");
      var s = ar.surah || {};
      qCache[ref] = { ar: ar.text, id: id.text, audio: au && au.audio, sname: s.englishName || "", sid: s.name || "", snum: s.number, anum: ar.numberInSurah };
      return qCache[ref];
    });
  }
  function qStop() { if (qAudio) { try { qAudio.pause(); } catch (e) {} } }
  function qSetBtn() {
    var b = $("qrPlay"); if (!b) return;
    var on = qAudio && !qAudio.paused && qAudioKey === qKey;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.querySelector("span").textContent = on ? "Jeda" : "Dengarkan";
    b.querySelector("path").setAttribute("d", on ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M7 4.5v15l12-7.5z");
  }
  function qPlay(ref) {
    var info = qCache[ref], srcs = qAudioSrc(ref, info), i = 0, b = $("qrPlay");
    if (qAudio && qAudioKey === qKey && !qAudio.paused) { qAudio.pause(); qSetBtn(); return; }
    if (!qAudio) {
      qAudio = new Audio(); qAudio.preload = "none";
      qAudio.addEventListener("play", qSetBtn); qAudio.addEventListener("pause", qSetBtn); qAudio.addEventListener("ended", qSetBtn);
    }
    function tryNext() {
      if (i >= srcs.length) { var e = $("qrErr"); if (e) e.textContent = "Suara tidak bisa diputar. Periksa koneksi lalu coba lagi."; qSetBtn(); return; }
      qAudio.onerror = tryNext;
      qAudio.src = srcs[i++];
      qAudioKey = qKey;
      var pr2 = qAudio.play();
      if (pr2 && pr2.catch) pr2.catch(function (err) { if (err && err.name === "NotAllowedError") { qSetBtn(); } else tryNext(); });
    }
    var er = $("qrErr"); if (er) er.textContent = "";
    if (b) b.setAttribute("aria-busy", "true");
    if (qAudioKey === qKey && qAudio.src && qAudio.error == null && qAudio.currentTime > 0 && !qAudio.ended) { qAudio.play(); } else tryNext();
    if (b) b.removeAttribute("aria-busy");
  }
  function qHtml(c, info, state) {
    var ref = c.ref, p = ref.split(":"), head = '<div class="qr-top"><span class="qr-hi">' + esc(c.slot.icon + " " + c.slot.hi) + '</span><span class="muted">Ayat untukmu</span></div>';
    var body;
    if (state === "load") body = '<p class="muted qr-load">Memuat ayat…</p>';
    else if (state === "err") body = '<p class="qr-theme">' + esc(c.theme) + '</p><p class="muted">Teks ayat belum bisa dimuat (QS ' + esc(ref) + '). <button type="button" class="qr-link" id="qrRetry">Coba lagi</button></p>';
    else body = '<div class="qr-tap" data-sheet="quran:0" role="button" tabindex="0">' +
      '<p class="qr-ar" lang="ar" dir="rtl">' + esc(info.ar) + '</p>' +
      '<p class="qr-id">“' + esc(info.id) + '”</p>' +
      '<p class="qr-ref">QS ' + esc(info.sname) + ' (' + esc(info.sid) + ') ' + esc(ref) + '</p></div>' +
      '<p class="qr-theme">' + esc(c.theme) + '</p>';
    var btns = '<div class="qr-btns"><button type="button" class="go qr-play" id="qrPlay" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg><span>Dengarkan</span></button>' +
      '<button type="button" class="qr-more" id="qrNext">Ayat lain</button></div><div class="muted qr-err" id="qrErr" role="status"></div>';
    return head + body + btns;
  }
  function fillQuran(force) {
    var box = $("qrBody"); if (!box) return;
    var c = qCurrent(), key = c.slot.id + "|" + c.ref;
    if (!force && key === qKey && box.getAttribute("data-k") === key && box.getAttribute("data-s") !== "load") return;
    if (qKey !== key) qStop();
    qKey = key;
    var my = ++qSeq, ref = c.ref;
    box.setAttribute("data-k", key);
    if (qCache[ref]) { box.setAttribute("data-s", "ok"); box.innerHTML = qHtml(c, qCache[ref], "ok"); qSetBtn(); return; }
    box.setAttribute("data-s", "load"); box.innerHTML = qHtml(c, null, "load");
    qLoad(ref).then(function () { if (my !== qSeq) return; fillQuran(true); }, function () {
      if (my !== qSeq) return;
      box.setAttribute("data-s", "err"); box.innerHTML = qHtml(c, null, "err");
    });
  }
  function quranSheet() {
    var c = qCurrent(), info = qCache[c.ref];
    if (!info) return null;
    return { title: "Ayat " + c.slot.id, html: shHead('<div class="sh-ar">﷽</div>', "", "Ayat " + c.slot.id, "QS " + info.sname + " " + c.ref) +
      '<p class="qr-ar big" lang="ar" dir="rtl">' + esc(info.ar) + '</p><p class="qr-id">“' + esc(info.id) + '”</p>' +
      kv([["Surah", esc(info.sname + " (" + info.sid + ")")], ["Ayat", esc(String(info.anum))], ["Tema", esc(c.theme)]]) +
      note("Teks Arab: Mushaf Utsmani. Terjemahan: edisi Bahasa Indonesia dari Quran Cloud (alquran.cloud), bisa sedikit berbeda dari terjemahan resmi Kemenag. Suara: qari Mishary Alafasy (Islamic Network / EveryAyah). Pemilihan ayat dan temanya disusun sendiri menurut waktu, bukan tafsir.") };
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("button");
    if (!t) return;
    if (t.id === "qrPlay") qPlay(qCurrent().ref);
    else if (t.id === "qrNext") { qShift++; var b = $("qrBody"); if (b) b.removeAttribute("data-k"); fillQuran(true); }
    else if (t.id === "qrRetry") fillQuran(true);
  });

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
    var pols = [["PM2.5", cur.pm2_5, 15, "pm2_5"], ["PM10", cur.pm10, 45, "pm10"], ["Ozon (O₃)", cur.ozone, 100, "ozone"], ["Nitrogen dioksida", cur.nitrogen_dioxide, 25, "nitrogen_dioxide"]];
    var polHtml = pols.map(function (p) {
      if (p[1] == null) return "";
      var ratio = p[1] / p[2], wd = Math.min(100, ratio * 50);
      var col = ratio <= 1 ? AQ_COL[0] : ratio <= 2 ? AQ_COL[1] : ratio <= 3.5 ? AQ_COL[2] : AQ_COL[3];
      return '<div class="pol-row" data-sheet="pol:' + p[3] + '" role="button" tabindex="0"><div class="top"><span>' + esc(p[0]) + '</span><span class="num">' + num1(p[1], 0) + ' <small class="muted">µg/m³ · ' + ratio.toFixed(1).replace(".", ",") + '× pedoman</small></span></div>' +
        '<div class="pol-bar"><i class="' + ic.trim() + '" style="width:' + wd.toFixed(1) + '%;background:' + col + '"></i><b></b></div></div>';
    }).join("");

    aqRange = null;
    var hourly = "", hr = aq.d && aq.d.hourly;
    if (hr && hr.time && hr.us_aqi && hr.time.length) {
      var from = cur.time ? hr.time.findIndex(function (t) { return t >= cur.time.slice(0, 13) + ":00"; }) : 0;
      if (from < 0) from = 0;
      var n = Math.min(24, hr.time.length - from), bars = "", topV = 100;
      for (i = 0; i < n; i++) if (hr.us_aqi[from + i] > topV) topV = hr.us_aqi[from + i];
      topV = Math.min(topV, 300);
      aqRange = { from: from, n: n };
      for (i = 0; i < n; i++) {
        var av = hr.us_aqi[from + i];
        if (av == null) continue;
        var bh = Math.max(3, Math.min(av, topV) / topV * 52);
        bars += '<rect class="hb' + ic + '" x="' + (i * 12 + 1) + '" y="' + (58 - bh).toFixed(1) + '" width="10" height="' + bh.toFixed(1) + '" rx="3" fill="' + AQ_COL[aqIdx(av)] + '" style="animation-delay:' + (i * 0.025).toFixed(3) + 's"/>' +
          '<rect class="hit" x="' + (i * 12) + '" y="0" width="12" height="78" fill="transparent" data-sheet="aqh:' + i + '"/>';
        if (i % 6 === 0) bars += '<text x="' + (i === 0 ? 1 : i * 12 + 6) + '" y="74"' + (i === 0 ? ' style="text-anchor:start"' : '') + '>' + esc(hr.time[from + i].slice(11, 16)) + '</text>';
      }
      if (bars) hourly = '<h3 class="sub-h">24 jam ke depan</h3><svg class="aqh" viewBox="0 0 288 78" aria-hidden="true">' + bars + '</svg>';
    }
    box.innerHTML =
      '<div data-sheet="aqi" role="button" tabindex="0">' + gaugeSvg(v, ic) +
      '<div class="aq-mid"><div class="aqi num">' + v + '</div><div class="aq-lv" style="color:' + AQ_COL[aqIdx(v)] + '">' + esc(lv[1]) + '</div><div class="muted">Indeks AQI (standar AS)</div></div></div>' +
      '<p class="aq-tip">' + esc(lv[2]) + '</p>' +
      '<h3 class="sub-h">Zat pencemar</h3><div class="pol">' + polHtml + '</div>' +
      '<p class="muted src">Ketuk alat ukur, zat pencemar, atau batang jam untuk penjelasan. Garis putih pada batang adalah pedoman WHO 2021 (rata-rata 24 jam, ozon 8 jam).</p>' +
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
  function magTxt(m) { return m != null ? Number(m).toFixed(1).replace(".", ",") : "?"; }
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
      el.setAttribute("data-sheet", "eq:" + eqSel);
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
      s += '<g class="qd' + (idx === eqSel ? " sel" : "") + '" data-i="' + idx + '" data-sheet="eq:' + idx + '" role="button" aria-label="Gempa M' + magTxt(q.mag) + ', ' + esc(q.place) + '">' +
        (recent ? '<circle class="pulse" cx="' + x + '" cy="' + y + '" r="' + rad.toFixed(1) + '" stroke="' + col + '"/>' : "") +
        '<circle class="dot' + ic + '" cx="' + x + '" cy="' + y + '" r="' + rad.toFixed(1) + '" fill="' + col + '" style="animation-delay:' + (pos * 0.05).toFixed(2) + 's"/>' +
        '<circle cx="' + x + '" cy="' + y + '" r="' + Math.max(14, rad) + '" fill="transparent"/></g>';
    });
    s += '<circle class="me-r" cx="150" cy="150" r="9"/><circle class="me" cx="150" cy="150" r="4.5"/></svg>';

    var shown = eqAll ? infos.length : Math.min(8, infos.length);
    var rows = "";
    for (i = 0; i < shown; i++) {
      rows += '<li class="eq' + (i === eqSel ? " sel" : "") + '" data-i="' + i + '" data-sheet="eq:' + i + '" role="button" tabindex="0"><span class="mag num" style="background:' + magColor(infos[i].mag) + '">' + magTxt(infos[i].mag) + '</span>' +
        '<div><div class="eqp">' + esc(infos[i].place) + '</div><div class="eqs muted">' + esc(eqMeta(infos[i])) + '</div></div></li>';
    }
    box.innerHTML =
      '<div class="chips three">' + chip("Terkuat", "M" + magTxt(maxM)) + chip("24 jam terakhir", n24 + " gempa") + chip("Terdekat", near === Infinity ? "-" : r(near) + " km") + '</div>' +
      s +
      '<div class="eq-sel" id="eqSel" role="button" tabindex="0" aria-live="polite"></div>' +
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
  function chip(label, val, key) {
    return '<div class="chip"' + (key ? ' data-sheet="tile:' + key + '" role="button" tabindex="0"' : "") + '><span>' + label + '</span><b class="num">' + val + '</b></div>';
  }
  function tile(cls, title, body, key) {
    return '<section class="glass tile ' + cls + '" data-sheet="tile:' + key + '" role="button" tabindex="0"><h3>' + title + '</h3>' + body + '</section>';
  }

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
    for (i = 0; i < N; i++) s += '<rect class="hit" x="' + i * CW + '" y="0" width="' + CW + '" height="' + VH + '" fill="transparent" data-sheet="hour:' + i + '"/>';
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
    hStart = start; hN = N;
    var hoursHtml = "";
    for (i = start; i < start + N; i++) {
      var hw = wx(h.weather_code[i]), pp = h.precipitation_probability[i];
      hoursHtml += '<li class="hour' + (i === start ? ' now' : '') + '" data-sheet="hour:' + (i - start) + '" role="button" tabindex="0">' +
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
      daysHtml += '<li class="day" data-sheet="day:' + k + '" role="button" tabindex="0">' +
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
      tile("wide", "Matahari", sunBody(c, dly), "sun") +
      tile("", "Angin", windBody(c), "wind") +
      tile("", "Indeks UV hari ini", uvBody(uv), "uv") +
      tile("", "Kelembapan", ringSvg(c.relative_humidity_2m, "#7cc4ff", '<b class="num rv">' + r(c.relative_humidity_2m) + '%</b>', " in") +
        '<p>' + (dew != null ? 'Titik embun ' + r(dew) + '°. ' : '') + (c.relative_humidity_2m >= 80 ? "Udara terasa lembap." : c.relative_humidity_2m <= 40 ? "Udara kering." : "Tingkat nyaman.") + '</p>', "hum") +
      tile("", "Tutupan awan", ringSvg(cc, "#e6eefa", '<b class="num rv">' + r(cc) + '%</b>', " in") +
        '<p>' + (cc < 20 ? "Langit cerah." : cc < 50 ? "Sebagian berawan." : cc < 85 ? "Berawan." : "Mendung tebal.") + '</p>', "cloud") +
      tile("", "Tekanan udara", '<div class="big num">' + r(c.surface_pressure) + ' <small>hPa</small></div><p>' +
        (pd >= 1 ? "Naik, cuaca cenderung membaik." : pd <= -1 ? "Turun, cuaca bisa memburuk." : "Stabil dalam 3 jam ke depan.") + '</p>', "pres") +
      tile("", "Jarak pandang", '<div class="big num">' + (vis != null ? (vis >= 10 ? r(vis) : vis.toFixed(1).replace(".", ",")) : "-") + ' <small>km</small></div><p>' +
        (vis == null ? "" : vis >= 10 ? "Jernih." : vis >= 5 ? "Cukup baik." : vis >= 2 ? "Terbatas." : "Sangat terbatas, hati-hati berkendara.") + '</p>', "vis") +
      tile("", "Hujan hari ini", '<div class="big num">' + (rainSum != null ? num1(rainSum, rainSum < 10 ? 1 : 0).replace(".", ",") : "-") + ' <small>mm</small></div><p>' +
        (rainMax != null ? "Peluang tertinggi " + rainMax + "%." : "") + ((c.precipitation || 0) > 0 ? " Sekarang " + c.precipitation.toFixed(1).replace(".", ",") + " mm." : "") + '</p>', "rain") +
      tile("", "Terasa seperti", '<div class="big num">' + r(c.apparent_temperature) + '<small>°</small></div><p>' +
        (feelDiff >= 2 ? "Lebih panas dari suhu sebenarnya (" + r(c.temperature_2m) + "°)." : feelDiff <= -2 ? "Lebih dingin dari suhu sebenarnya (" + r(c.temperature_2m) + "°)." : "Mirip suhu sebenarnya.") + '</p>', "feel") +
      '</div><p class="muted src hint">Ketuk kartu mana saja untuk penjelasan lengkap.</p>' +
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
        '<div class="chips">' + chip("Kelembapan", r(c.relative_humidity_2m) + "%", "hum") + chip("Angin", r(spd) + " km/j", "wind") +
          chip("Indeks UV", uv != null ? uv.toFixed(0) : "-", "uv") + chip("Hujan", rainMax != null ? rainMax + "%" : "-", "rain") + '</div>' +
      '</section>' +
      '<div class="seg" role="group" aria-label="Rincian cuaca">' +
        '<button type="button" data-sub="jam">24 jam</button><button type="button" data-sub="hari">7 hari</button><button type="button" data-sub="detail">Detail</button></div>' +
      '<section class="glass" id="sub-jam" aria-label="Per jam"><h2>' + icsvg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') + '24 jam berikutnya</h2>' +
        '<div class="hscroll"><div class="hwrap" style="width:' + N * 70 + 'px"><ol class="hours">' + hoursHtml + '</ol>' + ch.svg + '</div></div>' +
        '<p class="muted src">Tertinggi ' + r(ch.hi) + '° pukul ' + esc(ch.hiT) + ', terendah ' + r(ch.lo) + '° pukul ' + esc(ch.loT) + '. Batang biru menunjukkan peluang hujan. Geser ke samping untuk jam berikutnya, ketuk jam untuk detail.</p></section>' +
      '<section class="glass" id="sub-hari" aria-label="Per hari"><h2>' + icsvg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>') + '7 hari berikutnya</h2><ol class="days">' + daysHtml + '</ol>' +
        '<p class="muted src">Batang menunjukkan rentang suhu terendah sampai tertinggi. Titik putih adalah suhu sekarang. Ketuk hari untuk detail.</p></section>' +
      '<div id="sub-detail" aria-label="Detail cuaca">' + detail + '</div></div>' +
      '<div class="view" id="v-sholat" hidden><section class="glass" aria-label="Waktu sholat"><h2>' + icsvg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>') + 'Waktu sholat</h2><div id="prBody"></div></section>' +
        '<section class="glass qr" aria-label="Ayat motivasi"><h2>' + icsvg('<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"/>') + 'Ayat hari ini</h2><div id="qrBody"></div></section></div>' +
      '<div class="view" id="v-udara" hidden><section class="glass" aria-label="Kualitas udara"><h2>' + icsvg('<path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6"/>') + 'Kualitas udara</h2><div id="aqBody"></div></section></div>' +
      '<div class="view" id="v-gempa" hidden><section class="glass" aria-label="Gempa terdekat"><h2>' + icsvg('<path d="M2.5 12h4l2.5-6.5 4 13 2.5-6.5h6"/>') + 'Gempa di sekitarmu</h2><div id="eqBody"></div></section></div>';

    applyView();
    // Muat ulang otomatis tidak mengulang animasi masuk; hanya tampilan pertama setelah ganti lokasi.
    app.classList.toggle("quiet", !animateNext);
    if (!animateNext) { var vv = app.querySelector(".view:not([hidden])"); if (vv) vv.style.animation = "none"; }
    fillPrayer(); fillQuran(); fillAir(); fillQuakes();
    var rb = $("refresh");
    if (rb) rb.addEventListener("click", function () { load(false); });
    if (animateNext) { var te = $("temp"); if (te) countUp(te, r(c.temperature_2m)); }
    animateNext = false;
    $("subline").textContent = [clockText(), placeLabel()].filter(Boolean).join(" · ");
    startClock();
  }

  // ===== Lembar detail: muncul dari bawah saat sesuatu diketuk =====
  var sheetEl = $("sheet"), sheetBody = $("sheetBody"), shBox = $("shBox"), sheetState = null, sheetFrom = null, sheetTimer = 0;

  function kv(rows) {
    var out = rows.filter(function (x) { return x && x[1] != null && x[1] !== ""; }).map(function (x) {
      return "<div><dt>" + x[0] + "</dt><dd>" + x[1] + "</dd></div>";
    });
    return out.length ? '<dl class="kv">' + out.join("") + "</dl>" : "";
  }
  function shHead(lead, big, title, sub) {
    return '<div class="sh-head">' + lead + '<div class="sh-ht">' + (big ? '<div class="sh-big num">' + big + "</div>" : "") +
      '<div class="sh-t">' + esc(title) + "</div>" + (sub ? '<div class="muted">' + esc(sub) + "</div>" : "") + "</div></div>";
  }
  function note(s) { return '<p class="sh-note">' + s + "</p>"; }
  function lvlList(rows, cur) {
    return '<ul class="lvl">' + rows.map(function (x, i) {
      return "<li" + (i === cur ? ' class="cur"' : "") + '><i style="background:' + x[0] + '"></i><div><b>' + esc(x[1]) + '</b> <span class="num muted">' + esc(x[2]) +
        '</span><div class="muted">' + esc(x[3]) + "</div></div></li>";
    }).join("") + "</ul>";
  }
  function bars7(vals, max, fmt, col) {
    var dly = data.daily;
    return '<ul class="b7">' + vals.map(function (v, k) {
      var dd = dateParts(dly.time[k]);
      return "<li><span>" + (k === 0 ? "Hari ini" : esc(dd.wd)) + '</span><span class="trk"><i class="bar" style="left:0;width:' +
        Math.max(2, Math.min(100, (v || 0) / max * 100)).toFixed(1) + "%;background:" + col + '"></i></span><b class="num">' + fmt(v) + "</b></li>";
    }).join("") + "</ul>";
  }
  function dec(x, d) { return Number(x).toFixed(d).replace(".", ","); }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function hhmm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return p2(Math.floor(m / 60)) + ":" + p2(m % 60); }
  function latlon(lat, lon) { return dec(Math.abs(lat), 2) + "° " + (lat < 0 ? "LS" : "LU") + ", " + dec(Math.abs(lon), 2) + "° " + (lon < 0 ? "BB" : "BT"); }
  function fmtDT(ms) {
    try {
      return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: data ? data.timezone : undefined }).format(new Date(ms));
    } catch (e) { return new Date(ms).toLocaleString("id-ID"); }
  }
  function nz(v, f) { return v == null ? null : f(v); }

  // Kurva suhu satu hari penuh (24 jam) untuk lembar detail hari
  function dayCurve(h, from) {
    var W = 288, VH = 116, top = 26, bot = 72, i, t = [], lo = Infinity, hi = -Infinity, iHi = 0, iLo = 0;
    for (i = 0; i < 24; i++) {
      var v = h.temperature_2m[from + i]; t.push(v);
      if (v > hi) { hi = v; iHi = i; }
      if (v < lo) { lo = v; iLo = i; }
    }
    var span = Math.max(hi - lo, 3);
    var pts = t.map(function (v, k) { return [14 + k * (W - 28) / 23, top + (hi - v) / span * (bot - top)]; });
    var s = '<svg class="dcurve" viewBox="0 0 ' + W + " " + VH + '" aria-hidden="true">';
    for (i = 0; i < 24; i++) {
      var p = h.precipitation_probability ? h.precipitation_probability[from + i] : null;
      if (p != null && p >= 10) { var bh = Math.max(2, p / 100 * 18); s += '<rect x="' + (pts[i][0] - 4).toFixed(1) + '" y="' + (92 - bh).toFixed(1) + '" width="8" height="' + bh.toFixed(1) + '" rx="2" fill="#7cc4ff" opacity="0.6"/>'; }
    }
    s += '<path d="' + smoothPath(pts) + '" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
    [[iHi, hi], [iLo, lo]].forEach(function (m) {
      s += '<circle cx="' + pts[m[0]][0].toFixed(1) + '" cy="' + pts[m[0]][1].toFixed(1) + '" r="3.6" fill="#fff"/>' +
        '<text x="' + Math.min(W - 14, Math.max(14, pts[m[0]][0])).toFixed(1) + '" y="' + (pts[m[0]][1] + (m[1] === hi ? -9 : 16)).toFixed(1) + '" style="font-size:12px;fill:#fff">' + r(m[1]) + "°</text>";
    });
    [0, 6, 12, 18, 23].forEach(function (k) {
      s += '<text x="' + pts[k][0].toFixed(1) + '" y="110">' + h.time[from + k].slice(11, 16) + "</text>";
    });
    return s + "</svg>";
  }

  function magClass(m) {
    if (m == null) return "";
    if (m < 3) return "Mikro: jarang terasa";
    if (m < 4) return "Minor: sering terasa tipis, jarang merusak";
    if (m < 5) return "Ringan: terasa jelas, kerusakan jarang";
    if (m < 6) return "Sedang: bisa merusak bangunan yang lemah";
    if (m < 7) return "Kuat: bisa merusak di sekitar pusat gempa";
    if (m < 8) return "Besar: bisa merusak area luas";
    return "Sangat besar: kerusakan parah di area luas";
  }
  function depthClass(d) { return d == null ? "" : d < 60 ? "dangkal" : d <= 300 ? "menengah" : "dalam"; }

  // ----- Gempa -----
  function eqSheet(i) {
    var infos = quakes && quakes.infos;
    if (!infos || !infos[i]) return null;
    var q = infos[i], f = quakes.d.features[i] || {}, pp = f.properties || {}, g = (f.geometry && f.geometry.coordinates) || [];
    var url = typeof pp.url === "string" && /^https:\/\/earthquake\.usgs\.gov\//.test(pp.url) ? pp.url : null;
    var dc = depthClass(q.depth);
    var links = (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Halaman USGS</a>' : "") +
      (g.length >= 2 ? '<a href="https://www.openstreetmap.org/?mlat=' + encodeURIComponent(g[1]) + "&amp;mlon=" + encodeURIComponent(g[0]) + "#map=7/" + encodeURIComponent(g[1]) + "/" + encodeURIComponent(g[0]) + '" target="_blank" rel="noopener">Lihat di peta</a>' : "") +
      '<a href="https://www.bmkg.go.id/gempabumi/gempabumi-terkini" target="_blank" rel="noopener">Info resmi BMKG</a>';
    return {
      max: infos.length, title: "Gempa " + (i + 1) + " dari " + infos.length,
      html: '<div class="sh-head"><span class="sh-mag num" style="background:' + magColor(q.mag) + '">' + magTxt(q.mag) + '</span><div class="sh-ht"><div class="sh-t">' + esc(q.place) + '</div><div class="muted">' + (q.time ? esc(ago(q.time)) : "") + "</div></div></div>" +
        kv([
          ["Waktu kejadian", q.time ? esc(fmtDT(q.time)) : null],
          ["Jarak dari lokasimu", q.km != null ? r(q.km) + " km, arah " + compassWord(q.brg) : null],
          ["Magnitudo", magTxt(q.mag)],
          ["Kekuatan", esc(magClass(q.mag))],
          ["Kedalaman", q.depth != null ? r(q.depth) + " km (" + dc + ")" : null],
          ["Koordinat", g.length >= 2 ? latlon(g[1], g[0]) : null],
          ["Dilaporkan terasa", pp.felt ? pp.felt + " orang" : null],
          ["Intensitas (MMI)", pp.mmi != null ? dec(pp.mmi, 1) : null],
          ["Peringatan tsunami", pp.tsunami === 1 ? "Ada tanda tsunami dari USGS" : "Tidak ada dari USGS"],
          ["Status data", pp.status === "reviewed" ? "Sudah ditinjau" : pp.status === "automatic" ? "Otomatis, bisa berubah" : null]
        ]) +
        note("<b>Magnitudo</b> mengukur energi gempa. Naik 1 angka berarti energinya sekitar 32 kali lebih besar. <b>Kedalaman</b> menentukan seberapa terasa: gempa dangkal (di bawah 60 km) biasanya lebih terasa dan lebih merusak daripada gempa dalam.") +
        note("Data awal gempa sering direvisi beberapa jam setelah kejadian. Untuk peringatan resmi di Indonesia, ikuti BMKG.") +
        '<div class="sh-links">' + links + "</div>"
    };
  }

  // ----- Jam -----
  function hourSheet(i) {
    var h = data.hourly, k = hStart + i;
    if (!h || i < 0 || k >= h.time.length) return null;
    var w = wx(h.weather_code[k]), t = h.time[k], dp = dateParts(t.slice(0, 10));
    var g = function (key) { return h[key] ? h[key][k] : null; };
    var wd = g("wind_direction_10m"), ws = g("wind_speed_10m"), uv = g("uv_index"), vis = g("visibility");
    return {
      max: hN, title: i === 0 ? "Sekarang" : "Pukul " + t.slice(11, 16),
      html: shHead(icon(w[1], h.is_day[k] === 1, "xl"), r(h.temperature_2m[k]) + "°", w[0], dp.wd + ", " + dp.md + " · " + t.slice(11, 16)) +
        kv([
          ["Terasa seperti", nz(g("apparent_temperature"), function (v) { return r(v) + "°"; })],
          ["Peluang hujan", nz(g("precipitation_probability"), function (v) { return v + "%"; })],
          ["Curah hujan", nz(g("precipitation"), function (v) { return dec(v, 1) + " mm"; })],
          ["Kelembapan", nz(g("relative_humidity_2m"), function (v) { return r(v) + "%"; })],
          ["Angin", ws != null ? r(ws) + " km/j" + (wd != null ? " dari " + compassWord(wd) : "") : null],
          ["Hembusan", nz(g("wind_gusts_10m"), function (v) { return r(v) + " km/j"; })],
          ["Tutupan awan", nz(g("cloud_cover"), function (v) { return r(v) + "%"; })],
          ["Indeks UV", uv != null ? dec(uv, 1) + " (" + uvLabel(uv) + ")" : null],
          ["Tekanan udara", nz(g("surface_pressure"), function (v) { return r(v) + " hPa"; })],
          ["Jarak pandang", vis != null ? (vis >= 10000 ? r(vis / 1000) : dec(vis / 1000, 1)) + " km" : null],
          ["Titik embun", nz(g("dew_point_2m"), function (v) { return r(v) + "°"; })]
        ])
    };
  }

  // ----- Hari -----
  function daySheet(k) {
    var d = data.daily;
    if (k < 0 || k >= d.time.length) return null;
    var w = wx(d.weather_code[k]), dd = dateParts(d.time[k]), rise = tmin(d.sunrise && d.sunrise[k]), set = tmin(d.sunset && d.sunset[k]);
    var len = rise != null && set != null ? set - rise : null, h = data.hourly;
    var from = h.time.findIndex(function (t) { return t.slice(0, 10) === d.time[k]; });
    var curve = from >= 0 && from + 24 <= h.time.length ? dayCurve(h, from) : "";
    var gv = function (key) { return d[key] ? d[key][k] : null; };
    var pm = gv("precipitation_probability_max"), mm = gv("precipitation_sum"), uv = gv("uv_index_max"), wsm = gv("wind_speed_10m_max"), gum = gv("wind_gusts_10m_max"), wdd = gv("wind_direction_10m_dominant");
    var tip = pm != null && pm >= 60 ? "Hujan kemungkinan besar. Bawa payung atau jas hujan." : pm != null && pm >= 30 ? "Ada kemungkinan hujan. Siapkan payung." :
      uv != null && uv >= 8 ? "Sinar matahari kuat. Pakai tabir surya atau topi." : "Cuaca cukup nyaman untuk beraktivitas.";
    return {
      max: d.time.length, title: k === 0 ? "Hari ini" : dd.wd,
      html: shHead(icon(w[1], true, "xl"), r(d.temperature_2m_min[k]) + "° / " + r(d.temperature_2m_max[k]) + "°", w[0], dd.wd + ", " + dd.md) +
        (curve ? '<h3 class="sub-h">Suhu sepanjang hari</h3>' + curve : "") +
        kv([
          ["Peluang hujan tertinggi", nz(pm, function (v) { return v + "%"; })],
          ["Jumlah hujan", nz(mm, function (v) { return dec(v, 1) + " mm"; })],
          ["Indeks UV tertinggi", uv != null ? dec(uv, 1) + " (" + uvLabel(uv) + ")" : null],
          ["Angin maksimum", wsm != null ? r(wsm) + " km/j" + (wdd != null ? " dari " + compassWord(wdd) : "") : null],
          ["Hembusan maksimum", nz(gum, function (v) { return r(v) + " km/j"; })],
          ["Matahari terbit", rise != null ? hhmm(rise) : null],
          ["Matahari terbenam", set != null ? hhmm(set) : null],
          ["Lama siang", len != null ? Math.floor(len / 60) + " jam " + (len % 60) + " menit" : null]
        ]) + note(esc(tip))
    };
  }

  // ----- Kartu detail cuaca -----
  function tileSheet(key) {
    var c = data.current, h = data.hourly, d = data.daily, hs = hStart, i;
    var H = function (k) { return h[k] ? h[k][hs] : null; };
    var tiny = function (inner) { return '<div class="sh-ring">' + inner + "</div>"; };
    if (key === "hum") {
      var hum = c.relative_humidity_2m, dew = H("dew_point_2m");
      return { title: "Kelembapan", html: shHead(tiny(ringSvg(hum, "#7cc4ff", '<b class="num rv">' + r(hum) + "%</b>", " in")), "", "Kelembapan " + r(hum) + "%", dew != null ? "Titik embun " + r(dew) + "°" : "") +
        note("Kelembapan relatif menunjukkan seberapa jenuh udara oleh uap air. Makin tinggi, keringat makin sulit menguap, sehingga badan terasa lebih gerah. Titik embun di atas 21° biasanya terasa lembap dan kurang nyaman.") +
        lvlList([["#facc15", "Kering", "di bawah 30%", "Kulit dan tenggorokan bisa terasa kering."], ["#4ade80", "Nyaman", "30–60%", "Nyaman bagi kebanyakan orang."],
          ["#7cc4ff", "Lembap", "61–80%", "Mulai terasa gerah, umum di daerah tropis."], ["#a78bfa", "Sangat lembap", "di atas 80%", "Terasa pengap, keringat sulit menguap."]], hum < 30 ? 0 : hum <= 60 ? 1 : hum <= 80 ? 2 : 3) };
    }
    if (key === "cloud") {
      var cc = c.cloud_cover == null ? 0 : c.cloud_cover;
      return { title: "Tutupan awan", html: shHead(tiny(ringSvg(cc, "#e6eefa", '<b class="num rv">' + r(cc) + "%</b>", " in")), "", "Tutupan awan " + r(cc) + "%", "") +
        note("Persentase langit yang tertutup awan. Awan tebal mengurangi sinar matahari dan menahan panas malam hari.") +
        lvlList([["#ffd45a", "Cerah", "0–19%", "Hampir tanpa awan."], ["#fde68a", "Sebagian berawan", "20–49%", "Matahari masih sering terlihat."], ["#cbd5e1", "Berawan", "50–84%", "Langit lebih banyak tertutup."], ["#94a3b8", "Mendung", "85–100%", "Langit hampir seluruhnya tertutup."]], cc < 20 ? 0 : cc < 50 ? 1 : cc < 85 ? 2 : 3) };
    }
    if (key === "uv") {
      var uv = d.uv_index_max && d.uv_index_max[0];
      if (uv == null) return null;
      return { title: "Indeks UV", html: shHead("", dec(uv, 0), uvLabel(uv), "Tertinggi hari ini") +
        note("Indeks UV mengukur kekuatan sinar ultraviolet. Puncaknya sekitar tengah hari, dan tetap tinggi walau langit berawan.") +
        lvlList([["#4ade80", "Rendah", "0–2", "Aman, tidak perlu perlindungan khusus."], ["#facc15", "Sedang", "3–5", "Pakai tabir surya dan cari teduh saat siang."], ["#fb923c", "Tinggi", "6–7", "Pakai tabir surya, topi, dan kacamata hitam."],
          ["#ef4444", "Sangat tinggi", "8–10", "Kulit bisa terbakar dalam waktu singkat. Hindari terik 10.00–15.00."], ["#a855f7", "Ekstrem", "11 ke atas", "Hindari berada di luar saat tengah hari."]], uv < 3 ? 0 : uv < 6 ? 1 : uv < 8 ? 2 : uv < 11 ? 3 : 4) +
        '<h3 class="sub-h">7 hari ke depan</h3>' + bars7(d.uv_index_max.map(function (v) { return v; }), 12, function (v) { return v == null ? "-" : dec(v, 0); }, "linear-gradient(90deg,#4ade80,#facc15,#fb923c,#ef4444)") };
    }
    if (key === "wind") {
      var spd = c.wind_speed_10m || 0, cur = spd < 6 ? 0 : spd < 20 ? 1 : spd < 39 ? 2 : spd < 62 ? 3 : spd < 88 ? 4 : 5;
      return { title: "Angin", html: shHead("", r(spd) + " km/j", windWord(spd).charAt(0).toUpperCase() + windWord(spd).slice(1), "Dari " + compassWord(c.wind_direction_10m || 0)) +
        kv([["Arah asal angin", r(c.wind_direction_10m || 0) + "° (" + compassWord(c.wind_direction_10m || 0) + ")"], ["Hembusan", nz(c.wind_gusts_10m, function (v) { return r(v) + " km/j"; })],
          ["Maksimum hari ini", d.wind_speed_10m_max ? r(d.wind_speed_10m_max[0]) + " km/j" : null]]) +
        note("Arah angin ditulis menurut <b>asalnya</b>: angin barat laut bertiup dari barat laut menuju tenggara. Panah pada kompas menunjuk ke arah angin bertiup.") +
        lvlList([["#4ade80", "Tenang", "di bawah 6 km/j", "Asap naik lurus, daun diam."], ["#a3e635", "Sepoi-sepoi", "6–19 km/j", "Daun bergoyang, terasa di wajah."], ["#facc15", "Sedang", "20–38 km/j", "Ranting kecil bergerak, debu beterbangan."],
          ["#fb923c", "Kencang", "39–61 km/j", "Pohon kecil bergoyang, sulit berjalan melawan angin."], ["#ef4444", "Sangat kencang", "62–87 km/j", "Ranting patah, bisa merusak atap ringan."], ["#a855f7", "Badai", "88 km/j ke atas", "Berbahaya. Tetap di dalam bangunan."]], cur) };
    }
    if (key === "pres") {
      var p0 = c.surface_pressure, arr = h.surface_pressure || [], p3 = arr[Math.min(hs + 3, arr.length - 1)], pd = p3 != null && arr[hs] != null ? p3 - arr[hs] : 0, mn = Infinity, mx = -Infinity;
      for (i = hs; i < Math.min(hs + 24, arr.length); i++) { if (arr[i] < mn) mn = arr[i]; if (arr[i] > mx) mx = arr[i]; }
      return { title: "Tekanan udara", html: shHead("", r(p0) + " hPa", pd >= 1 ? "Naik" : pd <= -1 ? "Turun" : "Stabil", "Perubahan 3 jam ke depan: " + (pd >= 0 ? "+" : "") + dec(pd, 1) + " hPa") +
        kv([["Terendah 24 jam", mn === Infinity ? null : r(mn) + " hPa"], ["Tertinggi 24 jam", mx === -Infinity ? null : r(mx) + " hPa"]]) +
        note("Tekanan yang turun sering datang bersama awan dan hujan. Tekanan yang naik biasanya membawa cuaca lebih cerah dan stabil. Angka di sini adalah tekanan di permukaan lokasimu, bukan yang sudah dikoreksi ke permukaan laut, jadi lebih rendah di dataran tinggi.") };
    }
    if (key === "vis") {
      var vm = H("visibility"), vk = vm == null ? null : vm / 1000;
      if (vk == null) return null;
      return { title: "Jarak pandang", html: shHead("", (vk >= 10 ? r(vk) : dec(vk, 1)) + " km", vk >= 10 ? "Jernih" : vk >= 5 ? "Cukup baik" : vk >= 2 ? "Terbatas" : "Sangat terbatas", "Perkiraan jarak benda masih terlihat jelas") +
        note("Jarak pandang turun karena kabut, hujan lebat, atau asap. Pada jarak di bawah 2 km, kurangi kecepatan dan nyalakan lampu saat berkendara.") +
        lvlList([["#4ade80", "Jernih", "10 km ke atas", "Pemandangan jauh terlihat jelas."], ["#facc15", "Cukup baik", "5–10 km", "Sedikit berkabut atau berdebu."], ["#fb923c", "Terbatas", "2–5 km", "Kabut tipis, hujan, atau asap."], ["#ef4444", "Sangat terbatas", "di bawah 2 km", "Berbahaya untuk berkendara."]], vk >= 10 ? 0 : vk >= 5 ? 1 : vk >= 2 ? 2 : 3) };
    }
    if (key === "rain") {
      var sums = d.precipitation_sum || [], rs = sums[0], rp = d.precipitation_probability_max && d.precipitation_probability_max[0];
      return { title: "Hujan", html: shHead("", rs != null ? dec(rs, rs < 10 ? 1 : 0) + " mm" : "-", "Hujan hari ini", rp != null ? "Peluang tertinggi " + rp + "%" : "") +
        kv([["Sekarang", dec(c.precipitation || 0, 1) + " mm"]]) +
        '<h3 class="sub-h">Jumlah hujan 7 hari ke depan</h3>' + bars7(sums, Math.max(10, Math.max.apply(null, sums.filter(function (v) { return v != null; }))), function (v) { return v == null ? "-" : dec(v, v < 10 ? 1 : 0) + " mm"; }, "#7cc4ff") +
        note("Ringan: di bawah 5 mm per hari. Sedang: 5–20 mm. Lebat: 20–50 mm. Sangat lebat: di atas 50 mm. Peluang hujan adalah kemungkinan turunnya hujan di sekitar lokasimu, bukan lamanya hujan.") };
    }
    if (key === "feel") {
      var ap = c.apparent_temperature, tt = c.temperature_2m;
      return { title: "Terasa seperti", html: shHead("", r(ap) + "°", ap - tt >= 2 ? "Lebih panas dari suhu sebenarnya" : ap - tt <= -2 ? "Lebih dingin dari suhu sebenarnya" : "Mirip suhu sebenarnya", "Suhu udara " + r(tt) + "°") +
        kv([["Suhu udara", r(tt) + "°"], ["Terasa seperti", r(ap) + "°"], ["Kelembapan", r(c.relative_humidity_2m) + "%"], ["Angin", r(c.wind_speed_10m || 0) + " km/j"]]) +
        note("Suhu yang terasa menggabungkan suhu udara, kelembapan, dan angin. Udara lembap membuat panas terasa lebih menyengat karena keringat sulit menguap, sedangkan angin kencang membuat udara dingin terasa lebih dingin.") };
    }
    if (key === "sun") {
      var rise = tmin(d.sunrise && d.sunrise[0]), set = tmin(d.sunset && d.sunset[0]);
      if (rise == null || set == null) return null;
      var len = set - rise, tl = d.sunrise[1] ? tmin(d.sunset[1]) - tmin(d.sunrise[1]) : null, df = tl != null ? tl - len : null;
      return { title: "Matahari", html: shHead(icon("clear", true, "xl"), "", "Lama siang " + Math.floor(len / 60) + " jam " + (len % 60) + " menit", "") +
        kv([["Matahari terbit", hhmm(rise)], ["Tengah hari (kira-kira)", hhmm(rise + len / 2)], ["Matahari terbenam", hhmm(set)],
          ["Lama malam", Math.floor((1440 - len) / 60) + " jam " + ((1440 - len) % 60) + " menit"],
          ["Siang besok", df == null ? null : df === 0 ? "Sama panjang" : (df > 0 ? "Lebih panjang " : "Lebih pendek ") + Math.abs(df) + " menit"],
          ["Jam emas pagi (kira-kira)", hhmm(rise) + " – " + hhmm(rise + 60)], ["Jam emas sore (kira-kira)", hhmm(set - 60) + " – " + hhmm(set)]]) +
        note("Jam emas adalah satu jam setelah terbit dan satu jam sebelum terbenam, saat cahaya hangat dan lembut. Dekat khatulistiwa, panjang siang hampir sama sepanjang tahun.") };
    }
    return null;
  }

  // ----- Sholat -----
  var PR_INFO = {
    Fajr: ["Subuh", "الفجر", 2, "Dimulai saat fajar shadiq (cahaya putih melintang di ufuk timur) dan berakhir saat matahari terbit."],
    Sunrise: ["Terbit", "الشروق", 0, "Matahari terbit menandai berakhirnya waktu Subuh. Tidak ada sholat wajib pada waktu ini."],
    Dhuhr: ["Dzuhur", "الظهر", 4, "Dimulai saat matahari tergelincir ke barat setelah tepat di atas kepala, dan berakhir saat masuk waktu Ashar."],
    Asr: ["Ashar", "العصر", 4, "Dimulai saat bayangan benda sama panjang dengan bendanya (menurut mazhab Syafi'i, Maliki, dan Hanbali), dan berakhir saat matahari terbenam."],
    Maghrib: ["Maghrib", "المغرب", 3, "Dimulai saat matahari terbenam dan berakhir saat mega merah di langit barat hilang, yaitu masuk waktu Isya."],
    Isha: ["Isya", "العشاء", 4, "Dimulai saat mega merah hilang dan berlangsung sampai tengah malam (menurut pendapat yang banyak dipakai)."]
  };
  var PR_END = { Fajr: "Sunrise", Dhuhr: "Asr", Asr: "Maghrib", Maghrib: "Isha", Isha: "Midnight" };
  function prSheet(i) {
    if (!pr || !pr.ok || i < 0 || i >= PRAYERS.length) return null;
    var key = PRAYERS[i][0], t = pr.t, info = PR_INFO[key], m = mins(t[key]);
    if (m == null) return null;
    var now = nowMinutes(data ? data.timezone : undefined), end = PR_END[key] ? t[PR_END[key]] : null, em = end ? mins(end) : null;
    if (em != null && em <= m) em += 1440;        // Isya berakhir lewat tengah malam
    var status;
    if (m > now) status = "Dalam " + durText(m - now);
    else if (em != null && now < em) status = "Sedang berlangsung, berakhir " + durText(em - now) + " lagi";
    else status = "Sudah lewat " + durText(now - m) + " lalu";
    var dhuha = key === "Sunrise" ? hhmm(m + 18) : null;
    return {
      max: PRAYERS.length, title: info[0],
      html: '<div class="sh-head"><div class="sh-ar" lang="ar" dir="rtl">' + info[1] + '</div><div class="sh-ht"><div class="sh-big num">' + esc(hm(t[key])) + '</div><div class="sh-t">' + esc(info[0]) + '</div><div class="muted">' + esc(status) + "</div></div></div>" +
        kv([
          ["Berakhir", end ? (key === "Isha" ? "Tengah malam, " : "") + esc(hm(end)) : null],
          ["Rakaat fardhu", info[2] ? info[2] + " rakaat" : null],
          ["Imsak", key === "Fajr" && t.Imsak ? esc(hm(t.Imsak)) : null],
          ["Dhuha mulai (kira-kira)", dhuha],
          ["Metode perhitungan", esc(pr.m)]
        ]) + note(esc(info[3])) +
        note("Waktu dihitung dari koordinat lokasimu dan bisa berbeda beberapa menit dari jadwal masjid setempat. Pakai jadwal resmi setempat sebagai acuan.")
    };
  }

  // ----- Kualitas udara -----
  var AQ_RANGE = ["0–50", "51–100", "101–150", "151–200", "201–300", "301 ke atas"];
  var POL = {
    pm2_5: ["PM2.5", 15, "Partikel sangat halus (di bawah 2,5 mikron), lebih kecil dari sehelai rambut. Berasal dari asap kendaraan, pembakaran sampah dan lahan, serta industri.", "Bisa masuk jauh ke paru-paru dan aliran darah. Paparan lama berkaitan dengan gangguan napas dan jantung."],
    pm10: ["PM10", 45, "Partikel debu kasar (di bawah 10 mikron) dari jalan, konstruksi, asap, dan serbuk sari.", "Mengiritasi mata, hidung, dan tenggorokan, dan bisa memicu batuk atau asma."],
    ozone: ["Ozon (O₃)", 100, "Gas yang terbentuk ketika sinar matahari bereaksi dengan polusi kendaraan dan industri. Biasanya memuncak dari siang sampai sore.", "Dapat memicu batuk, nyeri dada saat menarik napas dalam, dan memperburuk asma."],
    nitrogen_dioxide: ["Nitrogen dioksida (NO₂)", 25, "Gas dari knalpot kendaraan, pembangkit listrik, dan pembakaran. Sering tinggi di dekat jalan raya.", "Mengiritasi saluran napas dan memperburuk asma, terutama pada anak-anak."]
  };
  function aqiSheet() {
    var cur = aq && aq.ok && aq.d && aq.d.current;
    if (!cur || cur.us_aqi == null) return null;
    var v = r(cur.us_aqi), idx = aqIdx(v), lv = AQ_LEVELS[idx], dom = null, best = 0;
    Object.keys(POL).forEach(function (k) { if (cur[k] != null && cur[k] / POL[k][1] > best) { best = cur[k] / POL[k][1]; dom = POL[k][0]; } });
    return {
      title: "Indeks kualitas udara",
      html: shHead("", String(v), lv[1], "Standar AQI Amerika Serikat") +
        kv([["Zat paling menonjol", dom ? esc(dom) + " (" + dec(best, 1) + "× pedoman WHO)" : null]]) + note(esc(lv[2])) +
        lvlList(AQ_LEVELS.map(function (x, i) { return [AQ_COL[i], x[1], AQ_RANGE[i], x[2]]; }), idx) +
        note("AQI diambil dari zat pencemar dengan nilai paling tinggi. Data adalah perkiraan model, bukan hasil alat ukur di lokasimu.")
    };
  }
  function polSheet(key) {
    var cur = aq && aq.ok && aq.d && aq.d.current, p = POL[key];
    if (!cur || !p || cur[key] == null) return null;
    var ratio = cur[key] / p[1], idx = ratio <= 1 ? 0 : ratio <= 2 ? 1 : ratio <= 3.5 ? 2 : 3;
    return {
      title: p[0],
      html: shHead("", dec(cur[key], 0) + " µg/m³", p[0], ratio <= 1 ? "Di bawah pedoman WHO" : "Di atas pedoman WHO") +
        kv([["Kadar sekarang", dec(cur[key], 1) + " µg/m³"], ["Pedoman WHO 2021", p[1] + " µg/m³" + (key === "ozone" ? " (8 jam)" : " (24 jam)")], ["Perbandingan", dec(ratio, 1) + "× pedoman"]]) +
        lvlList([[AQ_COL[0], "Dalam batas pedoman", "sampai 1×", "Aman menurut pedoman WHO."], [AQ_COL[1], "Sedikit melebihi", "1–2×", "Kelompok sensitif sebaiknya berhati-hati."], [AQ_COL[2], "Melebihi", "2–3,5×", "Kurangi aktivitas berat di luar."], [AQ_COL[3], "Jauh melebihi", "di atas 3,5×", "Hindari aktivitas di luar dan pertimbangkan masker."]], idx) +
        note("<b>Sumber:</b> " + esc(p[2])) + note("<b>Dampak:</b> " + esc(p[3]))
    };
  }
  function aqhSheet(i) {
    var hr = aq && aq.ok && aq.d && aq.d.hourly;
    if (!hr || !aqRange || i < 0 || i >= aqRange.n) return null;
    var av = hr.us_aqi[aqRange.from + i], t = hr.time[aqRange.from + i];
    if (av == null) return null;
    var idx = aqIdx(av), dp = dateParts(t.slice(0, 10));
    return { max: aqRange.n, title: "Pukul " + t.slice(11, 16), html: shHead("", String(r(av)), AQ_LEVELS[idx][1], dp.wd + ", " + dp.md + " · " + t.slice(11, 16)) + note(esc(AQ_LEVELS[idx][2])) +
      lvlList(AQ_LEVELS.map(function (x, k) { return [AQ_COL[k], x[1], AQ_RANGE[k], ""]; }), idx) };
  }

  // ----- Lokasi -----
  function locSheet() {
    var off = data.utc_offset_seconds, kb = bearingDeg(place.lat, place.lon, 21.4225, 39.8262), kd = distKm(place.lat, place.lon, 21.4225, 39.8262);
    return {
      title: "Lokasi",
      html: shHead("", "", place.name, placeLabel()) +
        kv([["Koordinat", latlon(place.lat, place.lon)], ["Ketinggian", data.elevation != null ? r(data.elevation) + " m di atas laut" : null],
          ["Zona waktu", esc(data.timezone || "-") + (off != null ? " (UTC" + (off >= 0 ? "+" : "−") + dec(Math.abs(off) / 3600, off % 3600 ? 1 : 0) + ")" : "")],
          ["Waktu setempat", esc(clockText())], ["Data cuaca diperbarui", esc(updatedText())],
          ["Arah kiblat", r(kb) + "° (" + compassWord(kb) + ")"], ["Jarak ke Ka'bah", Math.round(kd).toLocaleString("id-ID") + " km"]]) +
        note("Untuk memakai posisimu saat ini, ketuk tombol lokasi di kanan atas, atau cari nama kota lewat tombol kaca pembesar.")
    };
  }

  function sheetBuild(kind, arg) {
    var n = Number(arg);
    switch (kind) {
      case "hour": return hourSheet(n);
      case "day": return daySheet(n);
      case "tile": return tileSheet(arg);
      case "eq": return eqSheet(n);
      case "pr": return prSheet(n);
      case "aqi": return aqiSheet();
      case "pol": return polSheet(arg);
      case "aqh": return aqhSheet(n);
      case "loc": return locSheet();
      case "quran": return quranSheet();
    }
    return null;
  }
  function openSheet(kind, arg, from) {
    if (!data) return;
    var b;
    try { b = sheetBuild(kind, arg); } catch (e) { b = null; }
    if (!b) return;
    var isNew = !sheetEl.classList.contains("open");
    if (kind === "eq") { eqSel = Number(arg); markSel(); }
    sheetState = { kind: kind, arg: arg };
    var n = Number(arg), nav = "";
    if (b.max > 1) {
      nav = '<div class="sh-nav"><button type="button" data-nav="-1"' + (n <= 0 ? " disabled" : "") + '>‹ Sebelumnya</button><button type="button" data-nav="1"' + (n >= b.max - 1 ? " disabled" : "") + ">Berikutnya ›</button></div>";
    }
    sheetBody.innerHTML = '<div class="sh-top"><span class="sh-title" id="shTitle">' + esc(b.title) + '</span><button type="button" class="sh-x" data-close aria-label="Tutup"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="sh-scroll">' + b.html + "</div>" + nav;
    if (isNew) {
      clearTimeout(sheetTimer);
      sheetFrom = from || document.activeElement;
      sheetEl.hidden = false;
      document.documentElement.classList.add("noscroll");
      requestAnimationFrame(function () { requestAnimationFrame(function () { sheetEl.classList.add("open"); }); });
      var x = sheetBody.querySelector(".sh-x"); if (x) x.focus({ preventScroll: true });
    }
  }
  function closeSheet() {
    if (sheetEl.hidden || !sheetEl.classList.contains("open")) return;
    sheetEl.classList.remove("open");
    shBox.style.transform = ""; shBox.style.transition = "";
    document.documentElement.classList.remove("noscroll");
    clearTimeout(sheetTimer);
    sheetTimer = setTimeout(function () { sheetEl.hidden = true; sheetBody.innerHTML = ""; }, 300);
    if (sheetFrom && sheetFrom.focus) { try { sheetFrom.focus({ preventScroll: true }); } catch (e) {} }
    sheetState = null;
  }
  sheetEl.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) { closeSheet(); return; }
    var nb = e.target.closest("[data-nav]");
    if (nb && sheetState) openSheet(sheetState.kind, String(Number(sheetState.arg) + Number(nb.getAttribute("data-nav"))), sheetFrom);
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-sheet]");
    if (!t) return;
    var p = t.getAttribute("data-sheet").split(":");
    openSheet(p[0], p[1], t);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSheet();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-sheet]")) {
      e.preventDefault();
      var p = e.target.getAttribute("data-sheet").split(":");
      openSheet(p[0], p[1], e.target);
    }
  });
  // Seret gagang ke bawah untuk menutup
  (function () {
    var hd = $("shHandle"), y0 = null, dy = 0;
    if (!hd) return;
    hd.addEventListener("touchstart", function (e) { y0 = e.touches[0].clientY; dy = 0; shBox.style.transition = "none"; }, { passive: true });
    hd.addEventListener("touchmove", function (e) {
      if (y0 == null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      shBox.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });
    hd.addEventListener("touchend", function () {
      if (y0 == null) return;
      y0 = null; shBox.style.transition = "";
      if (dy > 90) closeSheet(); else shBox.style.transform = "";
    });
  })();

  function startClock() {
    clearInterval(clockTimer);
    clockTimer = setInterval(function () {
      $("subline").textContent = [clockText(), placeLabel()].filter(Boolean).join(" · ");
      fillPrayer(); fillQuran();
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
