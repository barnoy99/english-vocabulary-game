// Word Missile — main game logic
// Modes: menu | pick | wrongwait | flight | crashed | succeeded | levelup | gameover | stats
(() => {
  const WORDS_PER_LEVEL = 8;
  const MAX_LIVES = 3;

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const screens = { menu: $("screen-menu"), game: $("screen-game"), stats: $("screen-stats") };
  const canvas = $("game-canvas");
  const ctx = canvas.getContext("2d");
  const pickArea = $("pick-area");
  const steerStrip = $("steer-strip");
  const toast = $("toast");
  const scorePop = $("score-pop");

  // ---------- state ----------
  let mode = "menu";
  let score = 0, lives = MAX_LIVES, level = 1, wordsDone = 0, retries = 0;
  let current = null;           // current word object
  let recent = [];              // last shown English words (avoid quick repeats)
  let flight = null;
  let particles = [];
  let shake = 0;
  let steering = false;
  let shownSteerHint = false;
  let W = 0, H = 0;             // canvas CSS size
  let roadLeft = 0, roadRight = 0, missileY = 0;
  let ambientDecos = [];
  let timers = [];

  function after(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  // ---------- canvas sizing ----------
  function resize() {
    const wrap = $("canvas-wrap");
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    roadLeft = W * 0.14;
    roadRight = W * 0.86;
    missileY = H * 0.8;
    seedAmbient();
  }

  function seedAmbient() {
    ambientDecos = [];
    const emojis = ["🌵", "🪨", "🌾", "🌵"];
    for (let i = 0; i < 7; i++) {
      const left = i % 2 === 0;
      ambientDecos.push({
        x: left ? 6 + Math.random() * (roadLeft - 36) : roadRight + 6 + Math.random() * (W - roadRight - 36),
        y: (i / 7) * H + Math.random() * 30,
        emoji: emojis[i % emojis.length],
        size: 20 + Math.random() * 12
      });
    }
  }

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- word selection (smart repetition) ----------
  const RECENT_WORDS = 20;       // a word (right or wrong) won't return as target within this window
  const RECENT_DISTRACTORS = 12; // recently shown wrong-answer options are avoided when possible
  let recentDistractors = [];

  function pushRecent(en) {
    recent.push(en);
    if (recent.length > RECENT_WORDS) recent.shift();
  }

  function pickNextWord() {
    let pool = WORDS.filter(w => recent.indexOf(w.en) === -1);
    if (pool.length < 10) pool = WORDS;
    const stats = Storage.allStats();
    const weights = pool.map(w => {
      const s = stats[w.en];
      if (!s || s.seen === 0) return 6;                    // unseen: high, new vocabulary flows in fast
      let base = (s.wrong + 1) / (s.streak + 1);           // struggled words come back
      if (s.streak >= 3) base *= 0.25;                     // mastered: rare
      return Math.max(0.2, base * 2);
    });
    let total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function distractorsFor(word) {
    const ok = w => w.en !== word.en && w.he !== word.he;
    const fresh = w => recentDistractors.indexOf(w.en) === -1;
    const sameTopic = shuffle(WORDS.filter(w => ok(w) && w.topic === word.topic));
    const others = shuffle(WORDS.filter(w => ok(w) && w.topic !== word.topic));
    const picks = [];
    const usedHe = { [word.he]: true };
    // first pass prefers options not shown recently; second pass allows repeats if needed
    for (const allowRepeat of [false, true]) {
      for (const src of [sameTopic, others]) {
        for (const w of src) {
          if (picks.length >= 2) break;
          if (usedHe[w.he]) continue;
          if (!allowRepeat && !fresh(w)) continue;
          picks.push(w);
          usedHe[w.he] = true;
        }
      }
      if (picks.length >= 2) break;
    }
    picks.forEach(w => {
      recentDistractors.push(w.en);
      if (recentDistractors.length > RECENT_DISTRACTORS) recentDistractors.shift();
    });
    return picks;
  }

  // ---------- round flow ----------
  function startRound(word, keepRetries) {
    clearTimers();
    current = word;
    if (!keepRetries) retries = 0;
    flight = null;
    mode = "pick";
    $("target-word").textContent = word.en;
    $("target-sub").textContent = "בחרו את הטיל עם התרגום הנכון!";
    toast.classList.remove("show");
    renderMissiles(word);
    pickArea.classList.remove("gone");
    steerStrip.classList.add("gone");
    after(300, () => AudioFX.speak(word.en));
  }

  function renderMissiles(word) {
    pickArea.innerHTML = "";
    const options = shuffle([word].concat(distractorsFor(word)));
    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "missile";
      btn.innerHTML = '<span class="rocket">🚀</span><span class="m-word"></span>';
      btn.querySelector(".m-word").textContent = opt.he;
      btn.addEventListener("click", () => onPick(btn, opt));
      pickArea.appendChild(btn);
    });
  }

  function onPick(btn, opt) {
    if (mode !== "pick") return;
    AudioFX.unlock();
    const stat = Storage.wordStat(current.en);
    if (opt.en === current.en) {
      // correct — launch!
      stat.seen++;
      Storage.save();
      mode = "flight";
      AudioFX.launch();
      btn.classList.add("launch");
      pickArea.querySelectorAll(".missile").forEach(b => { if (b !== btn) b.classList.add("dim"); });
      $("target-sub").textContent = "הטיסו את הטיל אל המילה! 🎯";
      beginFlight();
    } else {
      // wrong — fizzle, lose a life, reveal the answer
      mode = "wrongwait";
      stat.seen++; stat.wrong++; stat.streak = 0;
      Storage.save();
      pushRecent(current.en); // returns later with priority, but not immediately
      AudioFX.fizzle();
      btn.classList.add("fizzle");
      pickArea.querySelectorAll(".missile").forEach(b => {
        if (b.querySelector(".m-word").textContent === current.he) b.classList.add("reveal");
      });
      showToast("התשובה: " + current.en + " = " + current.he);
      loseLife();
      after(2200, () => {
        if (lives <= 0) gameOver();
        else startRound(pickNextWord());
      });
    }
  }

  function beginFlight() {
    flight = {
      traveled: 0,
      dist: 2000 + level * 260,
      speed: 215 + level * 28,
      missileX: W / 2,
      targetX: W / 2,
      launchT: 0,
      obstacles: [],
      decos: [],
      sinceSpawn: 0,
      sinceDeco: 0,
      gapCenter: W / 2
    };
    after(500, () => {
      if (mode !== "flight") return;
      pickArea.classList.add("gone");
      steerStrip.classList.remove("gone");
      if (!shownSteerHint) {
        shownSteerHint = true;
        $("steer-hint").classList.add("show");
        after(2600, () => $("steer-hint").classList.remove("show"));
      }
    });
  }

  const OBSTACLES = [
    { emoji: "🌵", r: 20 },
    { emoji: "🛢️", r: 18 },
    { emoji: "🪨", r: 17 }
  ];

  function spawnRow() {
    const f = flight;
    const roadW = roadRight - roadLeft;
    // the safe gap zigzags across the road so the player must actually steer
    f.gapCenter = clamp(
      f.gapCenter + (Math.random() - 0.5) * roadW * 0.8,
      roadLeft + 44, roadRight - 44
    );
    const gapHalf = Math.max(34, 52 - level * 3);
    const count = 1 + Math.floor(Math.random() * 2) + (level >= 3 && Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const t = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
        const x = roadLeft + t.r + Math.random() * (roadW - t.r * 2);
        if (Math.abs(x - f.gapCenter) < gapHalf + t.r) continue;
        if (f.obstacles.some(o => o.y < -20 && Math.abs(o.x - x) < o.r + t.r + 14)) continue;
        const snake = level >= 2 && Math.random() < 0.18;
        f.obstacles.push({
          x, y: -70, r: t.r,
          emoji: snake ? "🐍" : t.emoji,
          vx: snake ? (Math.random() < 0.5 ? -1 : 1) * (36 + level * 6) : 0
        });
        break;
      }
    }
  }

  function updateFlight(dt) {
    const f = flight;
    f.launchT += dt;
    // steering: missile eases toward the finger position
    const k = 1 - Math.exp(-10 * dt);
    f.missileX += (f.targetX - f.missileX) * k;
    f.missileX = clamp(f.missileX, roadLeft + 16, roadRight - 16);

    f.traveled += f.speed * dt;
    const remaining = f.dist - f.traveled;

    // spawn obstacles (stop near the gate so the finish is a clear runway)
    const ds = f.speed * dt;
    f.sinceSpawn += ds;
    f.sinceDeco += ds;
    const interval = Math.max(140, 270 - level * 16);
    if (f.sinceSpawn >= interval && remaining > H * 0.95) {
      f.sinceSpawn = 0;
      spawnRow();
    }
    if (f.sinceDeco > 130) {
      f.sinceDeco = 0;
      if (Math.random() < 0.5) {
        const left = Math.random() < 0.5;
        f.decos.push({
          x: left ? 6 + Math.random() * (roadLeft - 36) : roadRight + 6 + Math.random() * (W - roadRight - 36),
          y: -50,
          emoji: ["🌵", "🪨", "🌾"][Math.floor(Math.random() * 3)],
          size: 18 + Math.random() * 14
        });
      }
    }

    // move objects down / snakes sideways
    for (const o of f.obstacles) {
      o.y += ds;
      if (o.vx) {
        o.x += o.vx * dt;
        if (o.x < roadLeft + o.r || o.x > roadRight - o.r) {
          o.vx = -o.vx;
          o.x = clamp(o.x, roadLeft + o.r, roadRight - o.r);
        }
      }
    }
    for (const d of f.decos) d.y += ds;
    f.obstacles = f.obstacles.filter(o => o.y < H + 90);
    f.decos = f.decos.filter(d => d.y < H + 60);

    // launch slide-in: missile rises from below the screen
    const drawY = missileDrawY();

    // collision (forgiving hitboxes)
    if (f.launchT > 0.55) {
      for (const o of f.obstacles) {
        if (Math.abs(o.x - f.missileX) < o.r * 0.75 + 11 &&
            Math.abs(o.y - drawY) < o.r * 0.75 + 19) {
          crash();
          return;
        }
      }
    }
    if (remaining <= 30) succeed();
  }

  function missileDrawY() {
    const rise = Math.max(0, 1 - flight.launchT / 0.6);
    return missileY + rise * (H - missileY + 60);
  }

  function crash() {
    mode = "crashed";
    AudioFX.explosion();
    shake = 14;
    burst(flight.missileX, missileDrawY(), 30, ["#ff9f43", "#ee5253", "#feca57", "#8d6e63", "#777"]);
    loseLife();
    showToast("בום! 💥 נסו שוב את אותה מילה");
    after(1500, () => {
      if (lives <= 0) gameOver();
      else { retries++; startRound(current, true); }
    });
  }

  function succeed() {
    mode = "succeeded";
    AudioFX.success();
    burst(flight.missileX, 60, 36, ["#ffd32a", "#0be881", "#4bcffa", "#ff9ff3", "#ffdd59"]);
    const stat = Storage.wordStat(current.en);
    stat.correct++; stat.streak++;
    Storage.save();
    const pts = Math.max(5, 10 + level * 2 - retries * 3);
    score += pts;
    updateHUD();
    showScorePop("+" + pts);
    pushRecent(current.en);
    wordsDone++;
    after(600, () => AudioFX.speak(current.en));
    after(1500, () => {
      if (wordsDone >= WORDS_PER_LEVEL) doLevelUp();
      else startRound(pickNextWord());
    });
  }

  function loseLife() {
    lives--;
    updateHUD();
  }

  function doLevelUp() {
    mode = "levelup";
    level++;
    wordsDone = 0;
    const gotLife = lives < MAX_LIVES;
    if (gotLife) lives++;
    updateHUD();
    AudioFX.levelUp();
    $("level-num").textContent = level;
    $("level-note").textContent = gotLife ? "קיבלתם ❤️ בחזרה! המכשולים נהיים מהירים..." : "המכשולים נהיים מהירים...";
    $("overlay-level").classList.add("show");
  }

  function gameOver() {
    mode = "gameover";
    AudioFX.thud();
    const record = Storage.recordGame(score, level);
    $("go-score").textContent = score;
    $("go-high").textContent = Storage.highScore;
    $("go-record").classList.toggle("gone", !record);
    $("overlay-gameover").classList.add("show");
  }

  function resetRun() {
    score = 0; lives = MAX_LIVES; level = 1; wordsDone = 0; retries = 0;
    recent = [];
    updateHUD();
  }

  // ---------- HUD / UI ----------
  function updateHUD() {
    $("hud-hearts").textContent = "❤️".repeat(Math.max(0, lives)) + "🤍".repeat(MAX_LIVES - Math.max(0, lives));
    $("hud-score").textContent = score;
    $("hud-level").textContent = level;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
  }

  function showScorePop(txt) {
    scorePop.textContent = txt;
    scorePop.classList.remove("pop");
    void scorePop.offsetWidth; // restart the CSS animation
    scorePop.classList.add("pop");
  }

  function show(name) {
    Object.keys(screens).forEach(k => screens[k].classList.toggle("active", k === name));
    if (name === "game") resize();
  }

  // ---------- particles ----------
  function burst(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 240;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: 0.7 + Math.random() * 0.6,
        r: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 320 * dt;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
  }

  // ---------- rendering ----------
  function render() {
    ctx.save();
    if (shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= 0.88;
    }
    const scroll = flight ? flight.traveled : 0;

    // sand + road
    ctx.fillStyle = "#e8c070";
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = "#cf9f52";
    ctx.fillRect(roadLeft, -20, roadRight - roadLeft, H + 40);
    ctx.fillStyle = "#a5762f";
    ctx.fillRect(roadLeft - 4, -20, 4, H + 40);
    ctx.fillRect(roadRight, -20, 4, H + 40);

    // dashed center line, scrolling with travel
    const dash = 30, gap = 26, seg = dash + gap;
    ctx.fillStyle = "#f3e0ac";
    let y0 = (scroll % seg) - seg;
    for (let y = y0; y < H + seg; y += seg) ctx.fillRect(W / 2 - 3, y, 6, dash);

    // shoulder decorations
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const decos = flight ? ambientDecos.concat(flight.decos) : ambientDecos;
    for (const d of decos) {
      const dy = flight && ambientDecos.indexOf(d) !== -1 ? (d.y + scroll) % (H + 60) - 30 : d.y;
      ctx.font = d.size + "px serif";
      ctx.fillText(d.emoji, d.x + 14, dy);
    }

    if (flight) {
      // obstacles
      for (const o of flight.obstacles) {
        ctx.font = o.r * 2.1 + "px serif";
        ctx.fillText(o.emoji, o.x, o.y);
      }
      // finish gate
      const remaining = flight.dist - flight.traveled;
      if (remaining < missileY + 90) {
        drawGate(missileY - remaining);
      }
      // missile
      if (mode === "flight" || mode === "succeeded") {
        drawMissile(flight.missileX, mode === "succeeded" ? Math.max(20, missileDrawY() - 40) : missileDrawY());
      }
    }

    // particles
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawGate(y) {
    const postW = 10, bannerH = 26;
    ctx.fillStyle = "#6d4c2f";
    ctx.fillRect(roadLeft - 6, y - 34, postW, 54);
    ctx.fillRect(roadRight - 4, y - 34, postW, 54);
    // glow
    ctx.fillStyle = "rgba(255, 220, 90, 0.25)";
    ctx.fillRect(roadLeft, y - 30 + bannerH, roadRight - roadLeft, 40);
    // checkered banner
    const sq = 13;
    for (let i = 0; (roadLeft + 4 + i * sq) < roadRight - 4; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? "#222" : "#fff";
        ctx.fillRect(roadLeft + 4 + i * sq, y - 30 + j * sq, Math.min(sq, roadRight - 4 - (roadLeft + 4 + i * sq)), sq);
      }
    }
  }

  function drawMissile(x, y) {
    ctx.save();
    ctx.translate(x, y);
    // flame (below the rocket, in unrotated space)
    if (mode === "flight") {
      const fl = 14 + Math.random() * 12;
      ctx.fillStyle = "#ff9f43";
      ctx.beginPath();
      ctx.moveTo(-7, 22); ctx.lineTo(0, 22 + fl); ctx.lineTo(7, 22); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#feca57";
      ctx.beginPath();
      ctx.moveTo(-4, 22); ctx.lineTo(0, 22 + fl * 0.6); ctx.lineTo(4, 22); ctx.closePath();
      ctx.fill();
    }
    // same rocket as the pick buttons: 🚀 emoji rotated from NE to straight up
    ctx.rotate(-Math.PI / 4);
    ctx.font = "46px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🚀", 0, 0);
    ctx.restore();
  }

  // ---------- main loop ----------
  // rAF pauses in hidden tabs (a free "pause" when the phone is locked / app switched).
  // The setTimeout fallback keeps the loop chain alive if the page loads while hidden.
  let last = performance.now();
  function schedule() {
    if (document.hidden) setTimeout(() => loop(performance.now()), window.__testMode ? 16 : 250);
    else requestAnimationFrame(loop);
  }
  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (!document.hidden || window.__testMode) {
      if (mode === "flight") updateFlight(dt);
      updateParticles(dt);
      if (screens.game.classList.contains("active")) render();
    }
    schedule();
  }

  // ---------- input (finger steering) ----------
  function setTarget(clientX) {
    if (!flight) return;
    const rect = canvas.getBoundingClientRect();
    flight.targetX = clamp(clientX - rect.left, roadLeft + 16, roadRight - 16);
  }
  const touchLayer = $("touch-layer");
  touchLayer.addEventListener("pointerdown", e => {
    AudioFX.unlock();
    if (mode === "flight") {
      steering = true;
      setTarget(e.clientX);
    }
  });
  touchLayer.addEventListener("pointermove", e => {
    if (steering && mode === "flight") setTarget(e.clientX);
  });
  window.addEventListener("pointerup", () => { steering = false; });
  window.addEventListener("pointercancel", () => { steering = false; });

  // ---------- stats screen ----------
  function renderStats() {
    const stats = Storage.allStats();
    let mastered = 0, seen = 0;
    const hard = [];
    for (const w of WORDS) {
      const s = stats[w.en];
      if (!s || s.seen === 0) continue;
      seen++;
      if (s.streak >= 3) mastered++;
      else if (s.wrong > 0) hard.push({ w, s });
    }
    $("stats-mastered").textContent = mastered;
    $("stats-seen").textContent = seen;
    $("stats-total").textContent = WORDS.length;
    $("stats-high").textContent = Storage.highScore;
    hard.sort((a, b) => b.s.wrong - a.s.wrong);
    const list = $("stats-list");
    list.innerHTML = "";
    if (hard.length === 0) {
      const li = document.createElement("li");
      li.className = "stats-empty";
      li.textContent = "אין כרגע מילים קשות — כל הכבוד! 🎉";
      list.appendChild(li);
    } else {
      hard.slice(0, 30).forEach(({ w }) => {
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
        list.appendChild(li);
      });
    }
  }

  // ---------- buttons ----------
  function syncSoundBtn() {
    $("btn-sound").textContent = Storage.sound ? "🔊 צליל / Sound" : "🔇 צליל / Sound";
  }

  $("btn-start").addEventListener("click", () => {
    AudioFX.unlock();
    AudioFX.click();
    resetRun();
    clearTimers();
    particles = [];
    show("game");
    startRound(pickNextWord());
  });

  $("btn-stats").addEventListener("click", () => {
    AudioFX.click();
    renderStats();
    show("stats");
    mode = "stats";
  });

  $("btn-stats-back").addEventListener("click", () => {
    AudioFX.click();
    show("menu");
    mode = "menu";
    $("menu-high").textContent = Storage.highScore;
  });

  $("btn-reset").addEventListener("click", () => {
    if (confirm("לאפס את כל ההתקדמות והשיא?")) {
      Storage.resetProgress();
      renderStats();
      $("menu-high").textContent = Storage.highScore;
    }
  });

  $("btn-sound").addEventListener("click", () => {
    Storage.toggleSound();
    syncSoundBtn();
    AudioFX.click();
  });

  $("btn-speak").addEventListener("click", () => {
    AudioFX.unlock();
    if (current) AudioFX.speak(current.en);
  });

  $("btn-continue").addEventListener("click", () => {
    AudioFX.click();
    $("overlay-level").classList.remove("show");
    startRound(pickNextWord());
  });

  $("btn-again").addEventListener("click", () => {
    AudioFX.click();
    $("overlay-gameover").classList.remove("show");
    resetRun();
    startRound(pickNextWord());
  });

  $("btn-menu").addEventListener("click", () => {
    AudioFX.click();
    $("overlay-gameover").classList.remove("show");
    clearTimers();
    mode = "menu";
    $("menu-high").textContent = Storage.highScore;
    show("menu");
  });

  // ---------- init ----------
  window.addEventListener("resize", resize);
  $("menu-high").textContent = Storage.highScore;
  syncSoundBtn();
  resize();
  updateHUD();
  schedule();
})();
