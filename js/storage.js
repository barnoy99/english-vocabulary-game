// Persistent progress in localStorage, per player profile.
// Shape: { sound, profiles: { jonathan: {highScore, bestLevel, words, tests}, abigail: {...} } }
// The "guest" profile lives only in memory — nothing about it is ever written to disk.
const Storage = (() => {
  const KEY = "vocabMissiles_state";
  const blank = () => ({ highScore: 0, bestLevel: 1, words: {}, tests: [] });

  let root = { sound: true, profiles: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.profiles) {
        root = parsed;
      } else if (parsed && typeof parsed.sound === "boolean") {
        root.sound = parsed.sound; // pre-profile format: keep sound, start everyone from zero
      }
    }
  } catch (e) { /* private mode / corrupt data — play without persistence */ }

  let profileId = null;
  let persist = false;
  let state = blank(); // active profile data (guest: volatile copy)

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(root)); } catch (e) {}
  }

  // Stats for a word, created on first access: seen / correct / wrong / streak
  function wordStat(en) {
    if (!state.words[en]) state.words[en] = { seen: 0, correct: 0, wrong: 0, streak: 0 };
    return state.words[en];
  }

  return {
    setProfile(id) {
      profileId = id;
      persist = id !== "guest";
      if (persist) {
        if (!root.profiles[id]) root.profiles[id] = blank();
        state = root.profiles[id];
        save();
      } else {
        state = blank(); // fresh volatile slate every time a guest enters
      }
    },
    get profile() { return profileId; },
    get highScore() { return state.highScore; },
    get bestLevel() { return state.bestLevel; },
    get sound() { return root.sound; },
    recordGame(score, level) {
      let record = false;
      if (score > state.highScore) { state.highScore = score; record = true; }
      if (level > state.bestLevel) state.bestLevel = level;
      if (persist) save();
      return record;
    },
    toggleSound() { root.sound = !root.sound; save(); return root.sound; },
    wordStat,
    save() { if (persist) save(); },
    allStats() { return state.words; },
    get tests() { return state.tests; },
    recordTest(score, total) {
      state.tests.unshift({ d: new Date().toISOString().slice(0, 10), s: score, t: total });
      if (state.tests.length > 50) state.tests.length = 50;
      if (persist) save();
    },
    resetProgress() {
      state = blank();
      if (persist && profileId) { root.profiles[profileId] = state; save(); }
    }
  };
})();
