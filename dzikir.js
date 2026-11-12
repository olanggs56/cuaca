/* ===== Zikir: tasbih bersuara, zikir harian, doa harian ===== */
var Dzikir = (function () {
  "use strict";

  // ---------- Data tasbih ----------
  var LIST = [
    { id: "tasbih", lb: "Subhanallah", ar: "سُبْحَانَ ٱللَّٰهِ", lat: "Subhanallah", arti: "Maha Suci Allah", t: 33 },
    { id: "tahmid", lb: "Alhamdulillah", ar: "ٱلْحَمْدُ لِلَّٰهِ", lat: "Alhamdulillah", arti: "Segala puji bagi Allah", t: 33 },
    { id: "takbir", lb: "Allahu Akbar", ar: "ٱللَّٰهُ أَكْبَرُ", lat: "Allahu Akbar", arti: "Allah Maha Besar", t: 34 },
    { id: "tahlil", lb: "Tahlil", ar: "لَا إِلَٰهَ إِلَّا ٱللَّٰهُ", lat: "La ilaha illallah", arti: "Tidak ada tuhan selain Allah", t: 100 },
    { id: "istighfar", lb: "Istighfar", ar: "أَسْتَغْفِرُ ٱللَّٰهَ", lat: "Astaghfirullah", arti: "Aku memohon ampun kepada Allah", t: 100 },
    { id: "hawqalah", lb: "Hawqalah", ar: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّٰهِ", lat: "La hawla wala quwwata illa billah", arti: "Tiada daya dan kekuatan kecuali dengan pertolongan Allah", t: 100 },
    { id: "tasbihhamd", lb: "Tasbih + puji", ar: "سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ", lat: "Subhanallahi wa bihamdih", arti: "Maha Suci Allah dan segala puji bagi-Nya", t: 100 }
  ];
  var AFTER = ["tasbih", "tahmid", "takbir"];
  var BEADS = 33, STEP = 360 / BEADS;

  // ---------- Data zikir & doa harian ----------
  // q: daftar ayat Al-Qur'an (teks, terjemahan, dan suara qari diambil langsung dari sumbernya).
  // ar/lat/arti: teks yang saya ketik sendiri (doa dan zikir dari hadis); suaranya memakai suara perangkat.
  var ZIKIR = [
    { id: "kursi", t: "Ayat Kursi", w: "Pagi, petang, dan setelah sholat", q: ["2:255"] },
    { id: "ikhlas", t: "Surah Al-Ikhlas", w: "Pagi dan petang, 3 kali", q: ["112:1", "112:2", "112:3", "112:4"] },
    { id: "falaq", t: "Surah Al-Falaq", w: "Pagi dan petang, 3 kali", q: ["113:1", "113:2", "113:3", "113:4", "113:5"] },
    { id: "nas", t: "Surah An-Nas", w: "Pagi dan petang, 3 kali", q: ["114:1", "114:2", "114:3", "114:4", "114:5", "114:6"] },
    { id: "amana", t: "Dua ayat akhir Al-Baqarah", w: "Malam hari", q: ["2:285", "2:286"] },
    { id: "hasbi", t: "Hasbiyallah", w: "Pagi dan petang", q: ["9:129"], note: "Zikirnya ada di bagian awal ayat: \"hasbiyallahu la ilaha illa huwa, 'alaihi tawakkaltu\"." },
    { id: "lindung", t: "Perlindungan dari bahaya", w: "Pagi dan petang, 3 kali",
      ar: "بِسْمِ ٱللَّٰهِ ٱلَّذِي لَا يَضُرُّ مَعَ ٱسْمِهِ شَيْءٌ فِي ٱلْأَرْضِ وَلَا فِي ٱلسَّمَاءِ وَهُوَ ٱلسَّمِيعُ ٱلْعَلِيمُ",
      lat: "Bismillahilladzi la yadhurru ma'asmihi syai'un fil ardhi wa la fis-sama'i wa huwas-sami'ul 'alim",
      arti: "Dengan nama Allah yang bersama nama-Nya tidak ada sesuatu pun di bumi maupun di langit yang dapat membahayakan, dan Dia Maha Mendengar lagi Maha Mengetahui." },
    { id: "ridha", t: "Ridha Allah sebagai Rabb", w: "Pagi dan petang, 3 kali",
      ar: "رَضِيتُ بِٱللَّٰهِ رَبًّا، وَبِٱلْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ نَبِيًّا",
      lat: "Radhitu billahi rabba, wa bil-islami dina, wa bi-muhammadin nabiyya",
      arti: "Aku ridha Allah sebagai Rabb, Islam sebagai agama, dan Muhammad sebagai nabi." }
  ];
  var DOA = [
    { id: "bangun", t: "Bangun tidur", w: "Saat bangun",
      ar: "ٱلْحَمْدُ لِلَّٰهِ ٱلَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ ٱلنُّشُورُ",
      lat: "Alhamdulillahilladzi ahyana ba'da ma amatana wa ilaihin-nusyur",
      arti: "Segala puji bagi Allah yang menghidupkan kami setelah mematikan kami, dan kepada-Nya kami dibangkitkan." },
    { id: "tidur", t: "Sebelum tidur", w: "Saat akan tidur",
      ar: "بِٱسْمِكَ ٱللَّٰهُمَّ أَحْيَا وَبِٱسْمِكَ أَمُوتُ",
      lat: "Bismikallahumma ahya wa bismika amut",
      arti: "Dengan nama-Mu ya Allah aku hidup, dan dengan nama-Mu aku mati." },
    { id: "makan1", t: "Sebelum makan", w: "Sebelum makan",
      ar: "ٱللَّٰهُمَّ بَارِكْ لَنَا فِيمَا رَزَقْتَنَا وَقِنَا عَذَابَ ٱلنَّارِ، بِسْمِ ٱللَّٰهِ",
      lat: "Allahumma barik lana fima razaqtana wa qina 'adzaban-nar, bismillah",
      arti: "Ya Allah, berkahilah rezeki yang Engkau berikan kepada kami dan jagalah kami dari azab neraka. Dengan nama Allah." },
    { id: "makan2", t: "Sesudah makan", w: "Selesai makan",
      ar: "ٱلْحَمْدُ لِلَّٰهِ ٱلَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ",
      lat: "Alhamdulillahilladzi ath'amana wa saqana wa ja'alana muslimin",
      arti: "Segala puji bagi Allah yang telah memberi kami makan dan minum serta menjadikan kami muslim." },
    { id: "keluar", t: "Keluar rumah", w: "Saat keluar rumah",
      ar: "بِسْمِ ٱللَّٰهِ تَوَكَّلْتُ عَلَى ٱللَّٰهِ، وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّٰهِ",
      lat: "Bismillah, tawakkaltu 'alallah, wa la hawla wa la quwwata illa billah",
      arti: "Dengan nama Allah, aku bertawakal kepada Allah. Tiada daya dan kekuatan kecuali dengan pertolongan Allah." },
    { id: "kendaraan", t: "Naik kendaraan", w: "Saat naik kendaraan", q: ["43:13", "43:14"] },
    { id: "masjid1", t: "Masuk masjid", w: "Saat masuk masjid",
      ar: "ٱللَّٰهُمَّ ٱفْتَحْ لِي أَبْوَابَ رَحْمَتِكَ",
      lat: "Allahummaf-tahli abwaba rahmatik",
      arti: "Ya Allah, bukakanlah untukku pintu-pintu rahmat-Mu." },
    { id: "masjid2", t: "Keluar masjid", w: "Saat keluar masjid",
      ar: "ٱللَّٰهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ",
      lat: "Allahumma inni as'aluka min fadhlik",
      arti: "Ya Allah, sesungguhnya aku memohon karunia-Mu." },
    { id: "sapujagat", t: "Doa sapu jagat", w: "Kapan saja", q: ["2:201"] },
    { id: "ortu", t: "Doa untuk orang tua", w: "Kapan saja", q: ["17:24"], note: "Doa untuk orang tua ada di bagian akhir ayat: \"Rabbirhamhuma kama rabbayani shaghira\"." },
    { id: "ilmu", t: "Doa menambah ilmu", w: "Sebelum belajar", q: ["20:114"], note: "Doanya ada di bagian akhir ayat: \"Rabbi zidni 'ilma\"." },
    { id: "hati", t: "Doa agar hati teguh", w: "Kapan saja", q: ["3:8"] },
    { id: "ampun", t: "Doa memohon ampun", w: "Kapan saja", q: ["7:23"] },
    { id: "sholat", t: "Doa tetap mendirikan sholat", w: "Kapan saja", q: ["14:40"] },
    { id: "keluarga", t: "Doa untuk keluarga", w: "Kapan saja", q: ["25:74"] }
  ];

  // ---------- Keadaan ----------
  var KEY = "zikir.v2";
  var cur = 0, count = 0, seqMode = false, angle = 0;
  var store = { day: "", total: 0, sound: true };
  var el = {}, qCache = {}, playing = "", audio = null, seqPlay = 0, actx = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { store.sound = s.sound !== false; if (s.day === today()) store.total = s.total || 0; } } catch (e) {}
    store.day = today();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  function idx(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return i; return 0; }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  // ---------- Suara (dibuat dengan WebAudio, tanpa file) ----------
  function ctx() {
    if (!actx) { try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); } catch (e) {} }
    if (actx && actx.state === "suspended") { try { actx.resume(); } catch (e) {} }
    return actx;
  }
  function tone(c, type, f0, f1, vol, t0, dur) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function soundClick() {                       // bunyi "tik" kayu setiap ketukan
    if (!store.sound) return; var c = ctx(); if (!c) return; var t = c.currentTime;
    tone(c, "triangle", 820, 320, 0.28, t, 0.07);
    tone(c, "sine", 1650, 1100, 0.07, t, 0.04);
  }
  function soundDone() {                        // bunyi lonceng dua kali saat target tercapai
    if (!store.sound) return; var c = ctx(); if (!c) return; var t = c.currentTime;
    [0, 0.34].forEach(function (d) {
      tone(c, "sine", 880, 880, 0.3, t + d, 1.3);
      tone(c, "sine", 1318.5, 1318.5, 0.16, t + d, 1.0);
      tone(c, "sine", 1760, 1760, 0.09, t + d, 0.7);
    });
  }

  // ---------- Tasbih ----------
  function buildBeads() {
    var NS = "http://www.w3.org/2000/svg", g = $("zkBeads"), i;
    for (i = 0; i < BEADS; i++) {
      var a = i * STEP * Math.PI / 180, big = i % 11 === 0, c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", (120 + 92 * Math.sin(a)).toFixed(2));
      c.setAttribute("cy", (120 - 92 * Math.cos(a)).toFixed(2));
      c.setAttribute("r", big ? 10.5 : 7.5);
      c.setAttribute("fill", big ? "url(#zkGold)" : "url(#zkWood)");
      g.appendChild(c);
    }
  }
  function render() {
    var z = LIST[cur], pct = Math.min(1, count / z.t);
    el.ar.textContent = z.ar; el.lat.textContent = z.lat; el.arti.textContent = z.arti;
    el.num.textContent = String(count); el.tgt.textContent = "dari " + z.t;
    el.ring.setAttribute("stroke-dashoffset", (100 - pct * 100).toFixed(1));
    el.total.textContent = String(store.total);
    el.seq.textContent = seqMode ? "Paket setelah sholat: " + (AFTER.indexOf(z.id) + 1) + " dari 3" : "";
    el.wrap.classList.toggle("done", count >= z.t);
    el.snd.textContent = store.sound ? "Suara: nyala" : "Suara: mati";
    el.snd.setAttribute("aria-pressed", store.sound ? "true" : "false");
    Array.prototype.forEach.call(el.chips.children, function (b) {
      var k = b.getAttribute("data-z");
      b.setAttribute("aria-pressed", (k === z.id && !seqMode) || (k === "paket" && seqMode) ? "true" : "false");
    });
  }
  function select(id) {
    if (id === "paket") { seqMode = true; cur = idx(AFTER[0]); } else { seqMode = false; cur = idx(id); }
    count = 0; render();
  }
  function tap() {
    var z = LIST[cur];
    count++; store.total++; save();
    angle += STEP; el.beads.style.transform = "rotate(" + angle + "deg)";
    el.tap.classList.remove("pop"); void el.tap.offsetWidth; el.tap.classList.add("pop");
    if (count >= z.t) {
      soundDone(); buzz([60, 40, 60]);
      if (seqMode) {
        var n = AFTER.indexOf(z.id) + 1;
        if (n < AFTER.length) { cur = idx(AFTER[n]); count = 0; } else seqMode = false;
      }
    } else { soundClick(); buzz(12); }
    render();
  }

  // ---------- Zikir & doa harian ----------
  function getJSON(url) {
    var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, 12000);
    return fetch(url, { signal: ctl.signal }).then(function (r) { clearTimeout(to); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }, function (e) { clearTimeout(to); throw e; });
  }
  function qLoad(ref) {
    if (qCache[ref]) return Promise.resolve(qCache[ref]);
    var base = "https://api.alquran.cloud/v1/ayah/" + ref + "/editions/";
    function parse(d) {
      var ar, id, lt;
      ((d && d.data) || []).forEach(function (x) {
        var i = x.edition && x.edition.identifier;
        if (i === "quran-uthmani") ar = x; else if (i === "id.indonesian") id = x; else if (i === "en.transliteration") lt = x;
      });
      if (!ar || !id) throw new Error("edisi tidak lengkap");
      var s = ar.surah || {};
      return (qCache[ref] = { ar: ar.text, id: id.text, lat: lt ? lt.text : "", sname: s.englishName || "", snum: s.number, anum: ar.numberInSurah });
    }
    return getJSON(base + "quran-uthmani,id.indonesian,en.transliteration").then(parse, function () {
      return getJSON(base + "quran-uthmani,id.indonesian").then(parse);       // cadangan bila edisi transliterasi tidak ada
    });
  }
  function pad3(n) { n = String(n); while (n.length < 3) n = "0" + n; return n; }
  function stripBasmala(t, ref) {           // API menaruh basmalah di awal ayat pertama sebagian surah
    return ref.split(":")[1] === "1" && ref !== "1:1" ? t.replace(/^بِسْمِ[^\s]*\s+[^\s]+\s+[^\s]+\s+[^\s]+\s*/, function (m) { return m.length < 60 ? "" : m; }) : t;
  }
  function find(id) { var all = ZIKIR.concat(DOA), i; for (i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }

  function itemHtml(it) {
    return '<li class="zi" data-id="' + it.id + '"><button type="button" class="zi-h" aria-expanded="false"><span><b>' + esc(it.t) + '</b><small>' + esc(it.w) + '</small></span><i aria-hidden="true"></i></button>' +
      '<div class="zi-b" hidden></div></li>';
  }
  function renderList() {
    $("zkZikir").innerHTML = '<ul class="zi-list">' + ZIKIR.map(itemHtml).join("") + '</ul>';
    $("zkDoa").innerHTML = '<ul class="zi-list">' + DOA.map(itemHtml).join("") + '</ul>';
  }
  function bodyHtml(it, data, state) {
    var h = "";
    if (it.q) {
      if (state === "load") return '<p class="muted">Memuat ayat…</p>';
      if (state === "err") return '<p class="muted">Teks ayat belum bisa dimuat. <button type="button" class="qr-link" data-retry="' + it.id + '">Coba lagi</button></p>' + playBtn(it, true);
      data.forEach(function (d, n) {
        var ref = it.q[n], ar = stripBasmala(d.ar, ref);
        h += '<div class="zi-v"><p class="zi-ar" lang="ar" dir="rtl">' + esc(ar) + ' <span class="zi-n">﴿' + d.anum + '﴾</span></p>' +
          (d.lat ? '<p class="zi-lat">' + esc(d.lat) + '</p>' : "") + '<p class="zi-id">' + esc(d.id) + '</p></div>';
      });
      h += '<p class="muted zi-src">QS ' + esc(data[0].sname) + " " + esc(it.q[0] + (it.q.length > 1 ? "–" + it.q[it.q.length - 1].split(":")[1] : "")) + '. Teks Arab: Mushaf Utsmani. Terjemahan: edisi Bahasa Indonesia Quran Cloud (alquran.cloud).</p>';
    } else {
      h += '<p class="zi-ar" lang="ar" dir="rtl">' + esc(it.ar) + '</p><p class="zi-lat">' + esc(it.lat) + '</p><p class="zi-id">' + esc(it.arti) + '</p>';
    }
    if (it.note) h += '<p class="muted zi-src">' + esc(it.note) + '</p>';
    return h + playBtn(it, false);
  }
  function hasArabicVoice() {
    try { return (speechSynthesis.getVoices() || []).some(function (v) { return /^ar/i.test(v.lang); }); } catch (e) { return false; }
  }
  function playBtn(it, noText) {
    var ok = it.q || hasArabicVoice();
    return '<div class="zi-act">' + (ok ? '<button type="button" class="go zi-play" data-play="' + it.id + '" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg><span>Dengarkan</span></button>' : "") +
      '<span class="muted zi-who">' + (it.q ? "Suara: qari Mishary Alafasy" : ok ? "Suara perangkat, pelafalannya bisa kurang tepat" : "Suara Arab belum tersedia di perangkat ini") + '</span></div><div class="muted qr-err" role="status"></div>';
  }
  function openItem(li) {
    var it = find(li.getAttribute("data-id")), body = li.querySelector(".zi-b"), btn = li.querySelector(".zi-h");
    var open = body.hidden;
    Array.prototype.forEach.call(document.querySelectorAll(".zi"), function (o) {       // hanya satu yang terbuka
      if (o !== li) { o.querySelector(".zi-b").hidden = true; o.querySelector(".zi-h").setAttribute("aria-expanded", "false"); }
    });
    body.hidden = !open; btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) return;
    if (!it.q) { body.innerHTML = bodyHtml(it); return; }
    fillQ(it, body);
  }
  function fillQ(it, body) {
    body.innerHTML = bodyHtml(it, null, "load");
    Promise.all(it.q.map(qLoad)).then(function (data) { body.innerHTML = bodyHtml(it, data, "ok"); setPlayState(); },
      function () { body.innerHTML = bodyHtml(it, null, "err"); });
  }

  // ---------- Pemutar suara bacaan ----------
  function stopAll() {
    seqPlay++; playing = "";
    if (audio) { try { audio.pause(); } catch (e) {} }
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    setPlayState();
  }
  function setPlayState() {
    Array.prototype.forEach.call(document.querySelectorAll(".zi-play"), function (b) {
      var on = b.getAttribute("data-play") === playing;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.querySelector("span").textContent = on ? "Jeda" : "Dengarkan";
      b.querySelector("path").setAttribute("d", on ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M7 4.5v15l12-7.5z");
    });
  }
  function setErr(id, msg) {
    var li = document.querySelector('.zi[data-id="' + id + '"]'), e = li && li.querySelector(".qr-err"); if (e) e.textContent = msg || "";
  }
  function playItem(id) {
    if (playing === id) { stopAll(); return; }
    stopAll();
    var it = find(id); if (!it) return;
    playing = id; setErr(id, ""); setPlayState();
    var my = ++seqPlay;
    if (!it.q) {
      try {
        var u = new SpeechSynthesisUtterance(it.ar); u.lang = "ar-SA"; u.rate = 0.8;
        var v = speechSynthesis.getVoices().filter(function (x) { return /^ar/i.test(x.lang); })[0]; if (v) u.voice = v;
        u.onend = u.onerror = function () { if (my === seqPlay) { playing = ""; setPlayState(); } };
        speechSynthesis.speak(u);
      } catch (e) { playing = ""; setPlayState(); setErr(id, "Suara tidak bisa diputar."); }
      return;
    }
    if (!audio) audio = new Audio();
    var n = 0;
    function next() {
      if (my !== seqPlay) return;
      if (n >= it.q.length) { playing = ""; setPlayState(); return; }
      var p = it.q[n].split(":"), srcs = ["https://everyayah.com/data/Alafasy_128kbps/" + pad3(p[0]) + pad3(p[1]) + ".mp3"], k = 0;
      function tryOne() {
        if (my !== seqPlay) return;
        if (k >= srcs.length) { playing = ""; setPlayState(); setErr(id, "Suara tidak bisa diputar. Periksa koneksi lalu coba lagi."); return; }
        audio.onerror = function () { k++; tryOne(); };
        audio.onended = function () { n++; next(); };
        audio.src = srcs[k];
        var pr = audio.play(); if (pr && pr.catch) pr.catch(function (e) { if (e && e.name === "NotAllowedError") { playing = ""; setPlayState(); } });
      }
      tryOne();
    }
    next();
  }

  // ---------- Tab dalam (Tasbih / Zikir harian / Doa harian) ----------
  function showPane(k) {
    ["tasbih", "zikir", "doa"].forEach(function (x) { $("zk-" + x).hidden = x !== k; });
    Array.prototype.forEach.call(document.querySelectorAll("#zkSeg button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-pane") === k ? "true" : "false"); });
    if (k !== "tasbih") { /* tetap memutar bila sedang berjalan */ }
  }

  function init() {
    el = { ar: $("zkAr"), lat: $("zkLat"), arti: $("zkArti"), num: $("zkNum"), tgt: $("zkTgt"), ring: $("zkRing"), total: $("zkTotal"),
      wrap: $("zkWrap"), chips: $("zkChips"), seq: $("zkSeq"), beads: $("zkBeads"), tap: $("zkTap"), snd: $("zkSound") };
    if (!el.ar) return;
    load(); buildBeads(); renderList();
    var html = '<button type="button" data-z="paket">Setelah sholat</button>';
    LIST.forEach(function (z) { html += '<button type="button" data-z="' + z.id + '">' + z.lb + '</button>'; });
    el.chips.innerHTML = html;
    el.chips.addEventListener("click", function (e) { var b = e.target.closest("button[data-z]"); if (b) select(b.getAttribute("data-z")); });
    el.tap.addEventListener("click", tap);
    $("zkReset").addEventListener("click", function () { count = 0; render(); });
    $("zkResetDay").addEventListener("click", function () { store.total = 0; save(); render(); });
    el.snd.addEventListener("click", function () { store.sound = !store.sound; save(); render(); if (store.sound) soundClick(); });
    $("zkSeg").addEventListener("click", function (e) { var b = e.target.closest("button[data-pane]"); if (b) showPane(b.getAttribute("data-pane")); });
    document.addEventListener("click", function (e) {
      var h = e.target.closest && e.target.closest(".zi-h"); if (h) { openItem(h.parentNode); return; }
      var p = e.target.closest && e.target.closest("[data-play]"); if (p) { playItem(p.getAttribute("data-play")); return; }
      var r = e.target.closest && e.target.closest("[data-retry]"); if (r) { var li = r.closest(".zi"); fillQ(find(r.getAttribute("data-retry")), li.querySelector(".zi-b")); }
    });
    try { if (window.speechSynthesis) speechSynthesis.onvoiceschanged = function () { /* daftar suara siap */ }; } catch (e) {}
    showPane("tasbih"); render();
  }
  init();
  return { _test: { tap: tap, select: select, angle: function () { return angle; }, stop: stopAll } };
})();
