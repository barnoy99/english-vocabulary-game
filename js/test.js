// Evaluation test ("מבחן הערכה"): 20 English↔Hebrew matching pairs in 4 legs of 5.
// Score = words matched correctly on the FIRST attempt; saved with the date.
(() => {
  const $ = id => document.getElementById(id);
  const TOTAL = 20, LEG_SIZE = 5;

  let legs = [], legIdx = 0, selected = null; // {btn, w, side}
  let attempted = {}, missed = [], score = 0, matchedTotal = 0, lockedCount = 0;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- word sampling ----------
  // Per-profile quotas skewed toward the hard end of that profile's pool
  // (e.g. Jonathan: 8 band-4, 8 band-3, 4 band-2). Within each band, round-robin
  // over shuffled topic groups for spread; unique Hebrew overall.
  function pickFromBand(pool, band, n, usedHe, picks) {
    const byTopic = {};
    pool.filter(w => w.band === band).forEach(w => (byTopic[w.topic] = byTopic[w.topic] || []).push(w));
    const groups = shuffle(Object.keys(byTopic).map(k => shuffle(byTopic[k])));
    let gi = 0, safety = 0, added = 0;
    while (added < n && safety++ < 2000 && groups.length) {
      const g = groups[gi++ % groups.length];
      const w = g.pop();
      if (!w || usedHe[w.he]) continue;
      usedHe[w.he] = true;
      picks.push(w);
      added++;
    }
    return added;
  }

  function pickTestWords() {
    const pool = Profiles.poolWords();
    const quota = Profiles.config[Profiles.current()].quota;
    const picks = [];
    const usedHe = {};
    let got = 0;
    quota.forEach(bn => { got += pickFromBand(pool, bn[0], bn[1], usedHe, picks); });
    let safety = 0;
    while (picks.length < TOTAL && safety++ < 2000) {
      const w = pool[Math.floor(Math.random() * pool.length)];
      if (!usedHe[w.he]) { usedHe[w.he] = true; picks.push(w); }
    }
    return shuffle(picks);
  }

  // ---------- views ----------
  function showView(name) {
    ["test-entry", "test-leg", "test-result"].forEach(id =>
      $(id).classList.toggle("gone", id !== "test-" + name));
  }

  function openTestScreen() {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $("screen-test").classList.add("active");
    renderHistory();
    showView("entry");
  }

  function backToMenu() {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $("screen-menu").classList.add("active");
  }

  // ---------- history ----------
  function fmtDate(iso) {
    const p = iso.split("-"); // YYYY-MM-DD
    return p[2] + "/" + p[1] + "/" + p[0].slice(2);
  }

  function renderHistory() {
    const tests = Storage.tests;
    const ul = $("test-history");
    ul.innerHTML = "";
    if (Profiles.current() === "guest") {
      const li = document.createElement("li");
      li.className = "stats-empty";
      li.textContent = "תוצאות של אורחים לא נשמרות 🙂";
      ul.appendChild(li);
    }
    if (!tests.length) {
      if (Profiles.current() !== "guest") {
        const li = document.createElement("li");
        li.className = "stats-empty";
        li.textContent = "עוד אין תוצאות — זה הזמן למבחן הראשון!";
        ul.appendChild(li);
      }
      return;
    }
    const best = Math.max.apply(null, tests.map(t => t.s));
    tests.slice(0, 15).forEach(t => {
      const li = document.createElement("li");
      const date = document.createElement("span");
      date.textContent = fmtDate(t.d);
      const res = document.createElement("span");
      res.className = "st-en";
      res.textContent = t.s + " / " + t.t + (t.s === best ? " 🏆" : "");
      li.appendChild(date);
      li.appendChild(res);
      ul.appendChild(li);
    });
  }

  // ---------- test flow ----------
  function startTest() {
    const words = pickTestWords();
    legs = [];
    for (let i = 0; i < words.length; i += LEG_SIZE) legs.push(words.slice(i, i + LEG_SIZE));
    legIdx = 0; missed = []; score = 0; matchedTotal = 0;
    showView("leg");
    renderLeg();
  }

  function renderLeg() {
    const leg = legs[legIdx];
    $("test-leg-num").textContent = "שלב " + (legIdx + 1) + " / " + legs.length;
    updateProgress();
    selected = null;
    lockedCount = 0;
    attempted = {};
    const colEn = $("col-en"), colHe = $("col-he");
    colEn.innerHTML = "";
    colHe.innerHTML = "";
    leg.forEach(w => colEn.appendChild(mkBtn(w.en, "en", w)));
    shuffle(leg).forEach(w => colHe.appendChild(mkBtn(w.he, "he", w)));
  }

  function updateProgress() {
    $("test-leg-progress").textContent = "✔ " + matchedTotal + " / " + TOTAL;
  }

  function mkBtn(text, side, w) {
    const b = document.createElement("button");
    b.className = "match-btn " + side;
    b.textContent = text;
    b.addEventListener("click", () => onTap(b, w, side));
    return b;
  }

  // Either language can be picked first; tapping the selected word again cancels it.
  function onTap(btn, w, side) {
    if (btn.classList.contains("locked")) return;
    AudioFX.unlock();
    if (selected && selected.btn === btn) {
      // second tap on the same word — cancel the selection
      btn.classList.remove("selected");
      selected = null;
      AudioFX.click();
      return;
    }
    if (!selected || selected.side === side) {
      // (re)select within the same column
      if (selected) selected.btn.classList.remove("selected");
      btn.classList.add("selected");
      selected = { btn, w, side };
      AudioFX.click();
      if (side === "en") AudioFX.speak(w.en);
      return;
    }
    // opposite columns — attempt the match (scoring is keyed to the English word)
    const enWord = side === "en" ? w : selected.w;
    const first = !attempted[enWord.en];
    attempted[enWord.en] = true;
    if (w.en === selected.w.en) {
      // correct pair
      if (first) score++;
      AudioFX.click();
      selected.btn.classList.remove("selected");
      selected.btn.classList.add("locked");
      btn.classList.add("locked");
      selected = null;
      lockedCount++;
      matchedTotal++;
      updateProgress();
      if (lockedCount === legs[legIdx].length) {
        setTimeout(() => {
          if (legIdx + 1 < legs.length) {
            legIdx++;
            AudioFX.levelUp();
            renderLeg();
          } else {
            finishTest();
          }
        }, 750);
      }
    } else {
      // wrong pair — red shake on both; the first-selected word stays selected
      if (first) {
        missed.push(enWord);
        const s = Storage.wordStat(enWord.en);
        s.seen++; s.wrong++; s.streak = 0;
        Storage.save();
      }
      AudioFX.thud();
      [selected.btn, btn].forEach(b => {
        b.classList.remove("miss-flash");
        void b.offsetWidth;
        b.classList.add("miss-flash");
      });
    }
  }

  function finishTest() {
    Storage.recordTest(score, TOTAL);
    AudioFX.success();
    $("test-score-big").textContent = score + " / " + TOTAL;
    $("test-msg").textContent =
      score >= 17 ? "מדהים! אלוף אמיתי! 🏆" :
      score >= 13 ? "יפה מאוד! 💪" :
      score >= 8  ? "התקדמות יפה — ממשיכים להתאמן!" :
                    "זו רק ההתחלה — המשחק יעזור ללמוד! 🚀";
    const ul = $("test-missed");
    ul.innerHTML = "";
    $("test-miss-title").classList.toggle("gone", missed.length === 0);
    if (missed.length === 0) {
      const li = document.createElement("li");
      li.className = "stats-empty";
      li.textContent = "בלי אף טעות! 🎉";
      ul.appendChild(li);
    } else {
      missed.forEach(w => {
        const li = document.createElement("li");
        const en = document.createElement("span");
        en.className = "st-en";
        en.textContent = w.en;
        const he = document.createElement("span");
        he.className = "st-he";
        he.textContent = w.he;
        li.appendChild(en);
        li.appendChild(he);
        li.addEventListener("click", () => AudioFX.speak(w.en));
        ul.appendChild(li);
      });
    }
    showView("result");
  }

  // ---------- buttons ----------
  $("btn-eval").addEventListener("click", () => { AudioFX.unlock(); AudioFX.click(); openTestScreen(); });
  $("btn-test-start").addEventListener("click", () => { AudioFX.unlock(); AudioFX.click(); startTest(); });
  $("btn-test-back").addEventListener("click", () => { AudioFX.click(); backToMenu(); });
  $("btn-test-done").addEventListener("click", () => { AudioFX.click(); backToMenu(); });
  $("btn-test-abort").addEventListener("click", () => { AudioFX.click(); showView("entry"); renderHistory(); });
})();
