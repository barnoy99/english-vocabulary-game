# טיל המילים 🚀 Word Missile

An English vocabulary practice game for Israeli elementary schoolers, built for Chrome on a phone (portrait, touch only).

**Three profiles**, each with its own saved progress, word pool, and evaluation-test history:
- **Jonathan (👦 יהונתן)** — desert theme, ~420 harder words (bands 2–4)
- **Abigail (👧 אביגיל)** — hair-salon theme (comb instead of missile; knots, scissors, soap and lice as obstacles), ~430 age-appropriate words (bands 0–2)
- **Guest (👤 אורח)** — picks a theme, plays with all ~720 words, nothing is saved

**How it works:** an English word appears in a target gate at the top and is spoken aloud. Three missiles at the bottom each carry a Hebrew word — tap the one with the correct translation, then slide your finger left/right to fly the missile up a desert road, dodging cacti, barrels, rocks and snakes until it reaches the finish gate.

- ~460 words based on the Israeli MoE English curriculum (plus an advanced band), organized by topic — all in play from the start
- Smart repetition: new words get priority, missed words come back more often until mastered (saved in localStorage), and a ~20-word no-repeat window keeps rounds varied
- Arcade levels: every 8 words the obstacles get faster and denser
- 3 lives, score, high score, and a "My Words" practice list
- Hebrew UI with English sub-labels; word pronunciation via the browser's speech synthesis

Plain HTML/CSS/JS — no build step. Open `index.html` via any static server.
