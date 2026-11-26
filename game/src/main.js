// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, over and landed. A mission is picked on the title screen
// (click, or keys 1-3); SPACE takes off, and SPACE again flies a new sortie.
//
// ?seed=N fixes the valley, rings and peaks. ?shot=start|play|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.

import { BEST_KEY, MISSIONS, STEP } from './config.js';
import { createWorld, EVENT_CRASHED, EVENT_FUEL_EMPTY, EVENT_LANDED, EVENT_MISSED, EVENT_RING, EVENT_CENTRE, EVENT_STALL } from './flight.js';
import {
  ACTION_CONFIRM,
  ACTION_MISSION_1,
  ACTION_MISSION_2,
  ACTION_MISSION_3,
  ACTION_MUTE,
  ACTION_PAUSE,
  createInput,
} from './input.js';
import {
  SCREEN_LANDED,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

/** Best scores, one per mission, read from this browser's storage. */
function readBest() {
  return MISSIONS.map((mission, index) => {
    try {
      return Number.parseInt(window.localStorage.getItem(BEST_KEY + index) ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  });
}

function saveBest(index, value) {
  try {
    window.localStorage.setItem(BEST_KEY + index, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

/** Announce the screen for screen readers, without touching the canvas. */
function announce(text) {
  status.textContent = text;
}

function runShot(name) {
  const scene = stageShot(name, world);
  const best = readBest();
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { best, selectedMission: world.state.missionIndex, muted: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let selectedMission = 0;
  let accumulator = 0;
  let last = performance.now();
  world.reset(selectedMission);

  /** Start a fresh sortie on the selected mission. */
  function startMission() {
    world.reset(selectedMission);
    world.takeOff();
    screen = SCREEN_PLAY;
    audio.start();
    announce(`${world.state.mission.name}: take off and fly the rings.`);
  }

  /** Record a finished sortie's score against the mission's best. */
  function finishSortie() {
    const state = world.state;
    if (state.score > best[state.missionIndex]) {
      best[state.missionIndex] = state.score;
      saveBest(state.missionIndex, state.score);
    }
  }

  /** Fold one step's events into sound and screen changes. */
  function handleEvents(events) {
    if (events & EVENT_RING) audio.ring(false);
    if (events & EVENT_CENTRE) audio.ring(true);
    if (events & EVENT_MISSED) audio.miss();
    if (events & EVENT_FUEL_EMPTY) audio.warn();
    if (events & EVENT_STALL) audio.warn();
    if (events & EVENT_LANDED) {
      audio.land();
      finishSortie();
      screen = SCREEN_LANDED;
      announce(`Delivered. Final score ${world.state.score}.`);
    }
    if (events & EVENT_CRASHED) {
      audio.crash();
      finishSortie();
      screen = SCREEN_OVER;
      announce(`Sortie lost. ${world.state.crashReason} Score ${world.state.score}.`);
    }
  }

  function frame(now) {
    const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();

    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
    }

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_MISSION_1) selectedMission = 0;
      if (actions & ACTION_MISSION_2) selectedMission = 1;
      if (actions & ACTION_MISSION_3) selectedMission = 2;
      // Rebuild the title scene only when the picked mission changes; the
      // parked plane and its valley are the same frame after frame.
      if (selectedMission !== world.state.missionIndex) world.reset(selectedMission);
      if (actions & ACTION_CONFIRM) startMission();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else {
        accumulator += elapsed;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          const events = world.step(STEP, {
            steer: input.steer(),
            pitch: input.pitch(),
            throttle: input.throttle(),
          });
          handleEvents(events);
          if (screen !== SCREEN_PLAY) break;
        }
        audio.update(world.state.plane.throttle, world.state.plane.speed, screen === SCREEN_PLAY);
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PLAY;
        last = performance.now();
        announce('Flying again.');
      } else if (actions & ACTION_CONFIRM) {
        startMission();
      }
    } else if (screen === SCREEN_OVER || screen === SCREEN_LANDED) {
      if (actions & ACTION_CONFIRM) startMission();
    }

    // R returns to the mission picker from an end screen.
    if ((screen === SCREEN_OVER || screen === SCREEN_LANDED) && actions & ACTION_PAUSE) {
      screen = SCREEN_TITLE;
      world.reset(selectedMission);
      announce('Pick a mission.');
    }

    renderer.draw(world, screen, { best, selectedMission, muted: audio.isMuted() });
    requestAnimationFrame(frame);
  }

  // Touch throttle buttons: two DOM buttons overlaid on the canvas.
  const throttleUp = document.getElementById('throttle-up');
  const throttleDown = document.getElementById('throttle-down');
  function bindThrottleButton(element, value) {
    if (!element) return;
    const press = (event) => {
      event.preventDefault();
      audio.start();
      input.setPointerThrottle(value);
    };
    const release = (event) => {
      event.preventDefault();
      input.setPointerThrottle(0);
    };
    element.addEventListener('pointerdown', press);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener('pointerleave', release);
  }
  bindThrottleButton(throttleUp, 1);
  bindThrottleButton(throttleDown, -1);

  // The first gesture anywhere starts the audio graph (browsers require it).
  window.addEventListener('pointerdown', () => audio.start(), { once: true });
  window.addEventListener('keydown', () => audio.start(), { once: true });

  requestAnimationFrame(frame);
}

if (shot !== null) runShot(shot);
else runGame();
