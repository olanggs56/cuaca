/* ===== Zikir: penghitung tasbih + bacaan ===== */
var Dzikir = (function () {
  "use strict";
  var LIST = [
    { id: "tasbih", lb: "Subhanallah", ar: "سُبْحَانَ ٱللَّٰهِ", lat: "Subhanallah", arti: "Maha Suci Allah", t: 33 },
    { id: "tahmid", lb: "Alhamdulillah", ar: "ٱلْحَمْدُ لِلَّٰهِ", lat: "Alhamdulillah", arti: "Segala puji bagi Allah", t: 33 },
    { id: "takbir", lb: "Allahu Akbar", ar: "ٱللَّٰهُ أَكْبَرُ", lat: "Allahu Akbar", arti: "Allah Maha Besar", t: 34 },
    { id: "tahlil", lb: "Tahlil", ar: "لَا إِلَٰهَ إِلَّا ٱللَّٰهُ", lat: "La ilaha illallah", arti: "Tidak ada tuhan selain Allah", t: 100 },
    { id: "istighfar", lb: "Istighfar", ar: "أَسْتَغْفِرُ ٱللَّٰهَ", lat: "Astaghfirullah", arti: "Aku memohon ampun kepada Allah", t: 100 },
    { id: "hawqalah", lb: "Hawqalah", ar: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّٰهِ", lat: "La hawla wala quwwata illa billah", arti: "Tiada daya dan kekuatan kecuali dengan pertolongan Allah", t: 100 },
    { id: "tasbihhamd", lb: "Tasbih + puji", ar: "سُبْحَانَ ٱللَّٰهِ وَبِحَمْدِهِ", lat: "Subhanallahi wa bihamdih", arti: "Maha Suci Allah dan segala puji bagi-Nya", t: 100 }
  ];
  var AFTER = ["tasbih", "tahmid", "takbir"];          // paket setelah sholat 33 + 33 + 34
  var KEY = "zikir.v1";
  var cur = 0, count = 0, seqMode = false, store = { day: "", total: 0 };
  var el = {};

  function $(id) { return document.getElementById(id); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.day === today()) store = s; } catch (e) {}
    if (store.day !== today()) store = { day: today(), total: 0 };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
  function idx(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return i; return 0; }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  function render() {
    var z = LIST[cur], pct = Math.min(1, count / z.t);
    el.ar.textContent = z.ar; el.lat.textContent = z.lat; el.arti.textContent = z.arti;
    el.num.textContent = String(count); el.tgt.textContent = "dari " + z.t;
    el.ring.setAttribute("stroke-dashoffset", (100 - pct * 100).toFixed(1));
    el.total.textContent = String(store.total);
    el.seq.textContent = seqMode ? "Paket setelah sholat: " + (AFTER.indexOf(z.id) + 1) + " dari 3" : "";
    el.wrap.classList.toggle("done", count >= z.t);
    Array.prototype.forEach.call(el.chips.children, function (b) {
      b.setAttribute("aria-pressed", (b.getAttribute("data-z") === z.id && !seqMode) || (b.getAttribute("data-z") === "paket" && seqMode) ? "true" : "false");
    });
  }
  function select(id) {
    if (id === "paket") { seqMode = true; cur = idx(AFTER[0]); } else { seqMode = false; cur = idx(id); }
    count = 0; render();
  }
  function tap() {
    var z = LIST[cur];
    count++; store.total++; save();
    if (count >= z.t) {
      buzz([60, 40, 60]);
      if (seqMode) {
        var n = AFTER.indexOf(z.id) + 1;
        if (n < AFTER.length) { cur = idx(AFTER[n]); count = 0; }
        else { seqMode = false; el.seq.textContent = ""; }
      }
    } else buzz(12);
    render();
    if (count === 0 && seqMode) return;
  }
  function reset() { count = 0; render(); }
  function resetDay() { store.total = 0; save(); render(); }

  function init() {
    el = { ar: $("zkAr"), lat: $("zkLat"), arti: $("zkArti"), num: $("zkNum"), tgt: $("zkTgt"), ring: $("zkRing"),
      total: $("zkTotal"), wrap: $("zkWrap"), chips: $("zkChips"), seq: $("zkSeq") };
    if (!el.ar) return;
    load();
    var html = '<button type="button" data-z="paket">Setelah sholat</button>';
    LIST.forEach(function (z) { html += '<button type="button" data-z="' + z.id + '">' + z.lb + '</button>'; });
    el.chips.innerHTML = html;
    el.chips.addEventListener("click", function (e) { var b = e.target.closest("button[data-z]"); if (b) select(b.getAttribute("data-z")); });
    $("zkTap").addEventListener("click", tap);
    $("zkReset").addEventListener("click", reset);
    $("zkResetDay").addEventListener("click", resetDay);
    render();
  }
  init();
  return { _test: { tap: tap, select: select } };
})();
