// Audio: English pronunciation via Web Speech API + WebAudio-synthesized sound effects.
// Mobile Chrome requires a user gesture before audio — unlock() is called on the first tap.
const AudioFX = (() => {
  let ctx = null;
  let voice = null;

  function ensureCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function pickVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = speechSynthesis.getVoices();
    return (
      voices.find(v => v.lang === "en-US" && v.localService) ||
      voices.find(v => v.lang === "en-US") ||
      voices.find(v => v.lang && v.lang.startsWith("en")) ||
      null
    );
  }
  if ("speechSynthesis" in window) {
    speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
    voice = pickVoice();
  }

  function unlock() {
    ensureCtx();
    // Prime speechSynthesis inside the user gesture so later speak() calls work on Android
    if ("speechSynthesis" in window && !unlock.done) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
      unlock.done = true;
    }
  }

  let speakTimer = null;
  function speak(text, rate) {
    if (!Storage.sound || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate || 0.85;
    if (!voice) voice = pickVoice();
    if (voice) u.voice = voice;
    // Android Chrome drops utterances queued immediately after cancel()
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => speechSynthesis.speak(u), 60);
  }

  // --- synthesized effects ---

  function tone(freq, dur, opts) {
    if (!Storage.sound) return;
    const ac = ensureCtx();
    if (!ac) return;
    opts = opts || {};
    const t0 = ac.currentTime + (opts.delay || 0);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const vol = opts.vol || 0.18;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, filterFreq, opts) {
    if (!Storage.sound) return;
    const ac = ensureCtx();
    if (!ac) return;
    opts = opts || {};
    const t0 = ac.currentTime + (opts.delay || 0);
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq / 8), t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(ac.destination);
    src.start(t0);
  }

  return {
    unlock,
    speak,
    click() { tone(650, 0.06, { type: "square", vol: 0.08 }); },
    launch() {
      tone(130, 0.7, { type: "sawtooth", slideTo: 750, vol: 0.14 });
      noiseBurst(0.7, 0.12, 1600);
    },
    fizzle() {
      tone(420, 0.65, { type: "square", slideTo: 70, vol: 0.12 });
      tone(300, 0.5, { type: "triangle", slideTo: 60, vol: 0.1, delay: 0.1 });
    },
    explosion() {
      noiseBurst(0.5, 0.35, 900);
      tone(90, 0.4, { type: "triangle", slideTo: 40, vol: 0.25 });
    },
    success() {
      [523, 659, 784, 1046].forEach((f, i) =>
        tone(f, 0.18, { type: "triangle", vol: 0.16, delay: i * 0.09 }));
    },
    thud() { tone(110, 0.35, { type: "sine", slideTo: 55, vol: 0.25 }); },
    levelUp() {
      [392, 523, 659, 784, 1046, 1318].forEach((f, i) =>
        tone(f, 0.16, { type: "triangle", vol: 0.15, delay: i * 0.08 }));
    }
  };
})();
