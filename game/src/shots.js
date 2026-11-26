// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh world, steered by a simple autopilot (bank toward
// the next ring, pitch to meet its height, throttle back for the landing), so
// the frame is what a real sortie looks like and the same seed always gives
// the same frame. The end scene retries with a fresh seed when the autopilot
// bins it, so the landing shot always shows wheels down and a score.

import { COURSE_LENGTH, RUNWAY_LENGTH, STEP } from './config.js';
import { clamp, wrapDegrees } from './random.js';
import { EVENT_CRASHED, EVENT_LANDED } from './flight.js';
import { SCREEN_LANDED, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const PLAY_SECONDS = 55;
const END_LIMIT_SECONDS = 420;
const END_RETRIES = 3;

/**
 * The autopilot's controls for one step: bank toward the target's bearing,
 * pitch to meet its height, and hold the throttle the phase asks for.
 */
function autopilotControls(world) {
  const plane = world.state.plane;
  const ring = world.nextRingTarget();
  const landing = ring === null;
  let target;
  let finalRunway = false;
  if (!landing) {
    target = { x: ring.x, alt: ring.alt, z: ring.z };
  } else if (plane.z > COURSE_LENGTH + 20 && plane.alt > 8) {
    // Past the runway and still up: climb out, turn around and come back.
    target = { x: 150, alt: 130, z: COURSE_LENGTH - 1400 };
  } else if (plane.z >= COURSE_LENGTH - RUNWAY_LENGTH / 2 - 150) {
    // Over the runway itself: the aim point is behind the plane now, so
    // chasing it would bank the wings hard at the worst moment. Aim ahead
    // instead — straight down the centreline, wings level — and aim below
    // the ground, so the plane stops floating and actually touches down.
    target = { x: 0, alt: -5, z: plane.z + 300 };
    finalRunway = true;
  } else {
    // Glide slope: the target height falls with the distance to the runway,
    // so the plane arrives low, slow and over the threshold. The slope aims
    // at a point just past the threshold, so the wheels meet the runway
    // well before its far end. The target stays at least 300 m ahead of
    // the plane, so the bearing to it never swings wild as it is reached.
    const thresholdZ = COURSE_LENGTH - RUNWAY_LENGTH / 2 - 150;
    const distance = Math.max(0, thresholdZ - plane.z);
    target = { x: 0, alt: Math.max(2, distance * 0.09), z: Math.max(thresholdZ, plane.z + 300) };
  }

  // Steer: the bearing to the target, turned into a bank angle. Over the
  // runway itself the plane steers off its centreline error directly, with
  // heavy roll damping, so it stays level instead of hunting side to side.
  const desiredHeading = (Math.atan2(target.x - plane.x, Math.max(1, target.z - plane.z)) * 180) / Math.PI;
  const headingError = wrapDegrees(desiredHeading - plane.heading);
  let steer;
  if (finalRunway) {
    steer = clamp(-plane.x / 80 - plane.roll * 0.04, -0.6, 0.6);
  } else {
    steer = clamp(headingError / 20, -1, 1);
    // Damp the roll so the wings settle; on final approach the damping is
    // stronger, because a landing needs level wings above all else.
    steer -= plane.roll * (landing ? 0.02 : 0.008);
    steer = clamp(steer, -1, 1);
  }

  // Pitch: the climb that would meet the target's height in a few seconds.
  // On final approach the autopilot flares: under 8 m it caps the descent
  // so the touchdown stays gentle enough to count as a landing. The landing
  // climb gain is higher, so the plane tracks the glide slope with only a
  // few metres of lag instead of floating past the runway.
  const altError = target.alt - plane.alt;
  const climbGain = landing ? 0.8 : 0.4;
  let desiredClimb = clamp(altError * climbGain, -20, 16);
  if (landing && plane.alt < 8) desiredClimb = clamp(desiredClimb, -5, 10);
  const speed = Math.max(30, plane.speed);
  const desiredPitch = (Math.asin(clamp(desiredClimb / speed, -0.45, 0.45)) * 180) / Math.PI;
  const pitch = clamp((plane.pitch - desiredPitch) / 7, -1, 1);

  // Throttle: cruise to the rings, ease off for the landing, and never rush
  // the approach — a slow plane has time to meet the glide slope.
  let targetThrottle;
  if (!landing) targetThrottle = 0.62;
  else if (plane.z > COURSE_LENGTH + 20 && plane.alt > 8) targetThrottle = 0.6;
  else if (plane.z < COURSE_LENGTH - 1200) targetThrottle = 0.4;
  else targetThrottle = plane.speed > 50 ? 0.1 : 0.25;
  const throttle = clamp((targetThrottle - plane.throttle) * 3, -1, 1);

  return { steer, pitch, throttle };
}

/** Fly one sortie with the autopilot until it ends or the clock runs out. */
function flySortie(world, limitSeconds) {
  let events = 0;
  const steps = Math.floor(limitSeconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    events = world.step(STEP, autopilotControls(world));
    if (events & (EVENT_LANDED | EVENT_CRASHED)) break;
  }
  return events;
}

/**
 * Set `world` to the named scene (start, play or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 * The play scene uses the canyon mission so the middle shot shows the peaks;
 * start and end use the ring run, the mission a first-time pilot meets.
 */
export function stageShot(name, world) {
  if (name === 'play') {
    world.reset(1);
    world.takeOff();
    const events = flySortie(world, PLAY_SECONDS);
    const over = (events & EVENT_CRASHED) !== 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'end') {
    for (let attempt = 0; attempt < END_RETRIES; attempt += 1) {
      // Each retry flies a fresh valley, so a bad draw never ruins the shot.
      world.state.seed += attempt * 104729;
      world.reset(0);
      world.takeOff();
      const events = flySortie(world, END_LIMIT_SECONDS);
      if ((events & EVENT_LANDED) !== 0) {
        return { screen: SCREEN_LANDED, best: world.state.score };
      }
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  world.reset(0);
  return { screen: SCREEN_TITLE, best: 0 };
}

export const SHOT_NAMES = ['start', 'play', 'end'];
