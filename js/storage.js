// Persistent progress in localStorage: per-word learning stats, high score, sound toggle.
const Storage = (() => {
  const KEY = "vocabMissiles_state";
  let state = { highScore: 0, bestLevel: 1, sound: true, words: {}, tests: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = Object.assign(state, JSON.parse(raw));
    if (!state.words) state.words = {};
    if (!state.tests) state.tests = [];
  } catch (e) { /* private mode / corrupt data — play without persistence */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  // Stats for a word, created on first access: seen / correct / wrong / streak
  function wordStat(en) {
    if (!state.words[en]) state.words[en] = { seen: 0, correct: 0, wrong: 0, streak: 0 };
    return state.words[en];
  }

  return {
    get highScore() { return state.highScore; },
    get bestLevel() { return state.bestLevel; },
    get sound() { return state.sound; },
    recordGame(score, level) {
      let record = false;
      if (score > state.highScore) { state.highScore = score; record = true; }
      if (level > state.bestLevel) state.bestLevel = level;
      save();
      return record;
    },
    toggleSound() { state.sound = !state.sound; save(); return state.sound; },
    wordStat,
    save,
    allStats() { return state.words; },
    get tests() { return state.tests; },
    recordTest(score, total) {
      state.tests.unshift({ d: new Date().toISOString().slice(0, 10), s: score, t: total });
      if (state.tests.length > 50) state.tests.length = 50;
      save();
    },
    resetProgress() {
      state = { highScore: 0, bestLevel: 1, sound: state.sound, words: {}, tests: [] };
      save();
    }
  };
})();
