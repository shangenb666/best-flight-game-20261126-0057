# Sky Courier — how it was built

## What the game is

Sky Courier is a chase-view arcade flight game in plain HTML, CSS and
JavaScript — no engine, no library, no network request, no build step. The
player flies a courier jet down a 6 km valley: take off, thread golden rings,
manage fuel and speed, and land on the far runway. Three missions vary the
course (a calm ring run, a low canyon delivery, a storm landing in a
crosswind with rain), each generated from one seed so a mission plays the
same way every time it is started with the same seed.

## Flight model

The simulation runs in fixed 1/60 s steps. Speed chases what the throttle
asks for; roll steers the turn (turn rate from bank angle and speed, as a
real banked turn does); pitch sets the climb, and flying below the minimum
speed makes the plane sink. Fuel burns faster at high throttle, an empty
tank leaves the plane gliding, and ground effect softens the last few
metres. A touchdown counts as a landing only on a runway, gentle, slow and
level — anything else is a crash. Rings score when the plane crosses their
plane within 26 m of the centre; dead-centre passes and unbroken streaks
pay bonuses. Landing score adds softness, centreline and leftover-fuel and
time-under-par bonuses.

## Rendering

One canvas, one chase camera behind the plane. The valley floor is a
projected mesh (depth slices, dense nearby and sparse far away), coloured by
distance and height; peaks are cones with snow caps; the runways are
projected quads with centreline dashes; rings are glowing hoops with a
tether down to the ground so their height reads; clouds are soft ellipses.
The world banks slightly with the plane while the HUD stays level. The HUD
carries speed, altitude, a compass tape, throttle/fuel/hull gauges, an
artificial horizon, a next-ring bearing marker, a course progress strip and
score. Sound is synthesised with the Web Audio API (engine hum, wind,
chimes) — the game ships no audio files.

## Files

- `game/index.html` — canvas, touch throttle buttons, screen-reader status line.
- `game/src/config.js` — every tuning number, mission and colour.
- `game/src/random.js` — seeded RNG and the helpers the world builder uses.
- `game/src/flight.js` — terrain, rings, peaks, physics, scoring.
- `game/src/render.js` — chase-view renderer, HUD and screens.
- `game/src/input.js` — keyboard, mouse and touch.
- `game/src/audio.js` — synthesised engine, wind and chimes.
- `game/src/shots.js` — screenshot scenes and the autopilot that flies them.
- `game/src/main.js` — boot, fixed-step loop, screens, best scores.
- `main.ts` — copies `game/` and `screenshots/` to the output and writes
  `dossier.json` with the vendored make.fun library. `serve.ts` serves
  `game/` locally for play-testing.

## Testing

- `node --check` on every game source file.
- `node main.ts` with `MAKEFUN_OUTPUT_DIR=out`, then `node serve.ts` and
  the game opened in a headless Chromium at 1280x720: the title screen, a
  mid-flight frame and the landing screen were screenshotted from the real
  game code (`?shot=start|play|end&seed=1`) and inspected as images.
- The autopilot in `shots.js` flies the full ring-run mission and lands it,
  which exercises the same physics, ring scoring and landing checks a player
  meets; the play shot uses the canyon mission to show the peaks. The end
  shot retries with a fresh seed if the autopilot bins it, so the landing
  frame always shows wheels down and a score.
- The game was also driven through its take-off in the browser to confirm
  the loop, the HUD and the controls respond (throttle, bank, pitch).

## Screenshots

`1-start.jpg` (title over the parked jet on the home runway), `2-play.jpg`
(mid-flight through a ring in the canyon) and `3-end.jpg` (the delivered
landing screen). All three are real renders of the game's own code, taken
with headless Chromium at 1280x720 and converted to JPEG.
