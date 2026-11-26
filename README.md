# Sky Courier

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/shangenb666/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/shangenb666/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A pocket flight game in the browser: a chase-view courier jet over a seeded valley. Take off from the home runway, thread the golden rings, mind the fuel gauge, and put her down gently on the far runway. Three missions — a calm ring run, a low canyon delivery between tall peaks, and a storm landing in a crosswind — each with its own valley, its own par time and its own best score. No library, no network, no build step: plain ES modules on canvas, with synthesised engine and wind sound.

## How to play

- **← → / A D** — bank and turn. **↑ ↓** — pitch the nose up and down (W/S also pitch, matching the arrow keys).
- **SHIFT** — throttle up, **Q** — throttle down. On touch screens, drag to steer and hold the **+ / −** buttons for throttle.
- **SPACE** — take off, fly again. **P / ESC** — pause. **M** — mute. **1 / 2 / 3** — pick a mission on the title screen.
- Fly through the middle of a ring for the full bonus (dead centre pays extra, and a streak of rings builds a combo). Miss one and the combo is gone.
- Land on the far runway: gentle, slow, level and near the centreline scores best, and leftover fuel and time under par add to the total. Hit the ground anywhere else and the sortie is lost.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` through any static server. `?seed=N` fixes the valley, rings and peaks; `?shot=start|play|end` stages a screenshot scene (see `shots.json`).

## Build the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory and writes `dossier.json` with the vendored make.fun library. The game sources live in `game/src/`: `config.js` (tuning, missions, palette), `flight.js` (world and flight model), `render.js` (chase-view renderer and HUD), `input.js` (keyboard, mouse, touch), `audio.js` (synthesised sound), `shots.js` (screenshot scenes and autopilot) and `main.js` (boot and game loop). See `METHODOLOGY.md` for how it was built and tested.

---

Entered on [make.fun](https://make.fun/?ref=xt6z1twn&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards
