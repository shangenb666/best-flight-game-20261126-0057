// Sky Courier's world: the valley, the runways, the rings, the peaks, and the
// flight model that flies the plane through them. Everything advances in fixed
// 1/60 s steps, and the whole world is rebuilt from one seed, so a mission
// plays the same way every time it is started with the same seed.

import {
  CAMERA,
  COURSE_LENGTH,
  FLIGHT,
  MISSIONS,
  RING,
  RUNWAY_LENGTH,
  RUNWAY_WIDTH,
  SCORE,
  TOAST_SECONDS,
} from './config.js';
import { clamp, createRandom, degToRad, lerp, radToDeg, range, rollingNoise } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_CENTRE = 2;
export const EVENT_MISSED = 4;
export const EVENT_LANDED = 8;
export const EVENT_CRASHED = 16;
export const EVENT_FUEL_EMPTY = 32;
export const EVENT_STALL = 64;

/** How far the plane may wander sideways before the valley ends the sortie. */
const VALLEY_HALF_WIDTH = 900;

/** A crash the pilot walks away from: touchdown this gentle still counts. */
const LANDING_MAX_SINK = 6;
/** Touchdown speed above this is a crash, however gentle the descent. */
const LANDING_MAX_SPEED = 105;

/** Distance from a point to a line segment, in the x-z plane. */
function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / lengthSq;
  t = clamp(t, 0, 1);
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return Math.sqrt((px - cx) * (px - cx) + (pz - cz) * (pz - cz));
}

/** The flight path, as waypoints: take-off, each ring, then the far runway. */
function flightPath(rings) {
  const points = [{ x: 0, z: 120 }];
  for (const ring of rings) points.push({ x: ring.x, z: ring.z });
  points.push({ x: 0, z: COURSE_LENGTH - RUNWAY_LENGTH / 2 });
  return points;
}

function buildTerrain(random, mission, rings) {
  const phasesX = [random() * Math.PI * 2, random() * Math.PI * 2];
  const phasesZ = [random() * Math.PI * 2, random() * Math.PI * 2];
  const path = flightPath(rings);
  const peaks = [];
  for (let i = 0; i < mission.peakCount; i += 1) {
    // A peak may stand beside the course, never on it: a candidate is
    // refused while its skirts would reach the flight path, and after
    // enough refusals it is pushed out to the valley's edge instead.
    let peak = null;
    for (let attempt = 0; attempt < 40 && peak === null; attempt += 1) {
      const side = random() < 0.5 ? -1 : 1;
      const far = random() < 0.7;
      const candidate = {
        x: side * range(random, far ? 260 : 130, 640),
        z: range(random, 500, COURSE_LENGTH - 500),
        height: range(random, mission.peakHeightMax * 0.45, mission.peakHeightMax),
        radius: range(random, 130, 280),
      };
      let clear = true;
      for (let s = 0; s < path.length - 1; s += 1) {
        const dist = pointSegmentDistance(candidate.x, candidate.z, path[s].x, path[s].z, path[s + 1].x, path[s + 1].z);
        if (dist < candidate.radius * 0.8 + 80) {
          clear = false;
          break;
        }
      }
      if (clear) peak = candidate;
    }
    if (peak === null) {
      peak = {
        x: (random() < 0.5 ? -1 : 1) * range(random, 520, 640),
        z: range(random, 500, COURSE_LENGTH - 500),
        height: range(random, mission.peakHeightMax * 0.45, mission.peakHeightMax),
        radius: range(random, 130, 280),
      };
    }
    peaks.push(peak);
  }
  return { phasesX, phasesZ, peaks };
}

function buildRings(random, mission) {
  const rings = [];
  const firstZ = 700;
  // The last ring sits well short of the far runway, so the pilot has a
  // full kilometre of approach to lose height and speed before landing.
  const lastZ = COURSE_LENGTH - 1400;
  let x = 0;
  for (let i = 0; i < mission.rings; i += 1) {
    const t = mission.rings === 1 ? 0.5 : i / (mission.rings - 1);
    const z = lerp(firstZ, lastZ, t) + range(random, -120, 120);
    x = clamp(x + range(random, -140, 140), -mission.ringSpread, mission.ringSpread);
    rings.push({
      x: Math.round(x),
      alt: Math.round(range(random, mission.ringAltMin, mission.ringAltMax)),
      z: Math.round(z),
      done: false,
      missed: false,
    });
  }
  return rings;
}

function buildClouds(random) {
  const clouds = [];
  for (let i = 0; i < 42; i += 1) {
    clouds.push({
      x: range(random, -900, 900),
      alt: range(random, 280, 460),
      z: range(random, 0, COURSE_LENGTH),
      size: range(random, 60, 170),
    });
  }
  return clouds;
}

export function createWorld(seed) {
  const state = {
    seed,
    missionIndex: 0,
    mission: MISSIONS[0],
    status: 'ready', // ready | flying | landed | crashed
    time: 0,
    score: 0,
    combo: 0,
    ringsDone: 0,
    ringsMissed: 0,
    nextRing: 0,
    landedHome: false,
    landingQuality: null, // { sink, centreOffset, speed } once landed
    crashReason: '',
    fuelEmptyAnnounced: false,
    stallAnnounced: false,
    airborne: false,
    toast: '',
    toastTimer: 0,
    plane: {
      x: 0, alt: 2, z: 120,
      heading: 0, pitch: 0, roll: 0,
      speed: 0, throttle: 0, fuel: FLIGHT.fuelStart, damage: 0,
      verticalSpeed: 0,
    },
    terrain: { phasesX: [0, 0], phasesZ: [0, 0], peaks: [] },
    rings: [],
    clouds: [],
  };

  /** Height of the valley floor at (x, z), in metres; 0 on the runways. */
  function terrainHeight(x, z) {
    let height =
      16 +
      rollingNoise(x, state.terrain.phasesX, [900, 320], 24) +
      rollingNoise(z, state.terrain.phasesZ, [1300, 460], 20);
    // The valley floor stays low and gentle down the middle of the course,
    // so take-off, low rings and the landing approach are never a lottery.
    const corridor = clamp(1 - (Math.abs(x) - 120) / 140, 0, 1);
    height = lerp(height, 12, corridor * 0.85);
    for (const peak of state.terrain.peaks) {
      const dx = x - peak.x;
      const dz = z - peak.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < peak.radius) {
        const fall = 1 - dist / peak.radius;
        height += peak.height * fall * fall;
      }
    }
    // Flatten the ground under both runways so take-off and landing are fair.
    const runwayBlend = runwayFlatten(x, z);
    return height * (1 - runwayBlend);
  }

  /** 1 on a runway, fading to 0 about 90 m outside its strip. */
  function runwayFlatten(x, z) {
    const onStrip = (z0) => {
      const dz = z < z0 ? z0 - z : z > z0 + RUNWAY_LENGTH ? z - (z0 + RUNWAY_LENGTH) : 0;
      // The flat ground extends a little past the strip's edges, so the
      // runway has shoulders instead of a lip to clip on the way down.
      const dx = Math.max(0, Math.abs(x) - (RUNWAY_WIDTH / 2 + 25));
      const dist = Math.sqrt(dx * dx + dz * dz);
      return clamp(1 - dist / 90, 0, 1);
    };
    return Math.max(onStrip(0), onStrip(COURSE_LENGTH - RUNWAY_LENGTH));
  }

  /** True when the plane is over a runway strip (for landing checks). */
  function overRunway(x, z) {
    if (Math.abs(x) > RUNWAY_WIDTH / 2) return false;
    return (z >= -20 && z <= RUNWAY_LENGTH + 20) || (z >= COURSE_LENGTH - RUNWAY_LENGTH - 20 && z <= COURSE_LENGTH + 20);
  }

  function setToast(text) {
    state.toast = text;
    state.toastTimer = TOAST_SECONDS;
  }

  /** (Re)build the world for a mission: terrain, rings and clouds from the seed. */
  function reset(missionIndex) {
    const random = createRandom(state.seed + missionIndex * 7919);
    state.missionIndex = missionIndex;
    state.mission = MISSIONS[missionIndex];
    state.status = 'ready';
    state.time = 0;
    state.score = 0;
    state.combo = 0;
    state.ringsDone = 0;
    state.ringsMissed = 0;
    state.nextRing = 0;
    state.landedHome = false;
    state.landingQuality = null;
    state.crashReason = '';
    state.fuelEmptyAnnounced = false;
    state.stallAnnounced = false;
    state.toast = '';
    state.toastTimer = 0;
    state.airborne = false; // true once the plane has left the ground
    state.plane = {
      x: 0, alt: 2, z: 120,
      heading: 0, pitch: 0, roll: 0,
      speed: 0, throttle: 0, fuel: FLIGHT.fuelStart, damage: 0,
      verticalSpeed: 0,
    };
    // Rings first: the peaks are placed around the flight path they mark,
    // so a peak never stands where the pilot has to fly.
    state.rings = buildRings(random, state.mission);
    state.terrain = buildTerrain(random, state.mission, state.rings);
    state.clouds = buildClouds(random);
  }

  /**
   * One fixed step. `controls` is { steer, pitch, throttle } in [-1, 1]
   * (steer: +1 rolls right; pitch: -1 pulls the nose up). Returns an
   * EVENT_* bitmask of what happened in this step.
   */
  function step(dt, controls) {
    if (state.status !== 'flying') return EVENT_NONE;
    const plane = state.plane;
    const mission = state.mission;
    let events = EVENT_NONE;
    state.time += dt;
    if (state.toastTimer > 0) state.toastTimer -= dt;

    // Throttle: the lever moves at a fixed rate; an empty tank leaves it dead.
    const throttleRate = 0.7;
    plane.throttle = clamp(plane.throttle + controls.throttle * throttleRate * dt, 0, 1);
    const effectiveThrottle = plane.fuel > 0 ? plane.throttle : 0;
    if (plane.fuel <= 0 && !state.fuelEmptyAnnounced) {
      state.fuelEmptyAnnounced = true;
      events |= EVENT_FUEL_EMPTY;
      setToast('FUEL EMPTY — glide her down!');
    }

    // Speed chases what the throttle asks for; a dead engine bleeds speed.
    const targetSpeed = FLIGHT.minSpeed + effectiveThrottle * (FLIGHT.cruiseSpeed - FLIGHT.minSpeed);
    const rate = targetSpeed > plane.speed ? FLIGHT.accel : FLIGHT.decel;
    plane.speed += clamp(targetSpeed - plane.speed, -rate * dt, rate * dt);
    if (plane.fuel <= 0) plane.speed = Math.max(24, plane.speed - 6 * dt);

    // Roll toward the stick, then turn at a rate the bank and speed set.
    const targetRoll = controls.steer * FLIGHT.maxRoll;
    plane.roll += clamp(targetRoll - plane.roll, -FLIGHT.rollRate * dt, FLIGHT.rollRate * dt);
    const turnRate = (9.81 / Math.max(plane.speed, 20)) * Math.tan(degToRad(plane.roll));
    plane.heading += radToDeg(turnRate * dt);

    // Pitch toward the stick; the nose sets the climb, the wings set the sink.
    const targetPitch = -controls.pitch * FLIGHT.maxPitch;
    plane.pitch += clamp(targetPitch - plane.pitch, -FLIGHT.pitchRate * dt, FLIGHT.pitchRate * dt);
    let verticalSpeed = Math.sin(degToRad(plane.pitch)) * plane.speed;
    if (plane.speed < FLIGHT.minSpeed) {
      verticalSpeed -= FLIGHT.sinkRate * (1 - plane.speed / FLIGHT.minSpeed);
    }
    const ground = terrainHeight(plane.x, plane.z);
    if (plane.alt - ground < FLIGHT.groundEffect && verticalSpeed < 0) {
      verticalSpeed *= 0.7; // ground effect softens the last few metres
    }
    plane.verticalSpeed = verticalSpeed;

    // Move: forward along the heading, sideways with the crosswind.
    const forward = Math.cos(degToRad(plane.pitch)) * plane.speed * dt;
    const headingRad = degToRad(plane.heading);
    plane.x += Math.sin(headingRad) * forward + mission.wind * dt;
    plane.z += Math.cos(headingRad) * forward;
    plane.alt += verticalSpeed * dt;

    // Fuel burns faster the harder the engine works.
    plane.fuel = Math.max(
      0,
      plane.fuel - (FLIGHT.fuelBurnIdle + effectiveThrottle * (FLIGHT.fuelBurnFull - FLIGHT.fuelBurnIdle)) * dt,
    );

    // Stall warning: slow and low is how sorties end early.
    if (plane.speed < FLIGHT.stallWarningSpeed && plane.alt - ground < 60 && !state.stallAnnounced) {
      state.stallAnnounced = true;
      events |= EVENT_STALL;
      setToast('STALL WARNING — throttle up!');
    } else if (plane.speed >= FLIGHT.stallWarningSpeed + 8) {
      state.stallAnnounced = false;
    }

    // Rings: the next one is scored the moment the plane crosses its plane.
    const ring = state.rings[state.nextRing];
    if (ring && plane.z >= ring.z) {
      const dx = plane.x - ring.x;
      const dy = plane.alt - ring.alt;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= RING.collectRadius) {
        ring.done = true;
        state.ringsDone += 1;
        state.combo += 1;
        const centre = dist <= RING.centreRadius;
        const comboBonus = Math.min(SCORE.ringCombo * (state.combo - 1), SCORE.ringComboCap);
        const gained = SCORE.ring + (centre ? SCORE.ringCentre : 0) + comboBonus;
        state.score += gained;
        events |= centre ? EVENT_CENTRE : EVENT_RING;
        setToast(
          centre
            ? `RING ${state.ringsDone} — DEAD CENTRE! +${gained}`
            : `RING ${state.ringsDone} — +${gained}`,
        );
      } else {
        ring.missed = true;
        state.ringsMissed += 1;
        state.combo = 0;
        events |= EVENT_MISSED;
        setToast(`MISSED RING ${state.ringsDone + state.ringsMissed} — combo lost`);
      }
      state.nextRing += 1;
    }

    // The valley walls end the sortie: the plane is lost beyond them.
    if (Math.abs(plane.x) > VALLEY_HALF_WIDTH || plane.z < -300 || plane.z > COURSE_LENGTH + 600) {
      return crash('Lost beyond the valley — the sortie ends here.');
    }

    // Once the plane has climbed clear of the ground it counts as airborne,
    // and only then can a later touchdown be a landing.
    if (plane.alt - terrainHeight(plane.x, plane.z) > 15) state.airborne = true;

    // Ground contact: a runway landing, a take-off roll, or a crash.
    const clearance = plane.alt - terrainHeight(plane.x, plane.z);
    if (clearance <= 0) {
      plane.alt = terrainHeight(plane.x, plane.z);
      const gentle = plane.verticalSpeed >= -LANDING_MAX_SINK;
      const slow = plane.speed <= LANDING_MAX_SPEED;
      const level = Math.abs(plane.roll) < 20 && Math.abs(plane.pitch) < 12;
      if (overRunway(plane.x, plane.z) && state.airborne && gentle && slow && level) {
        return land();
      }
      if (overRunway(plane.x, plane.z) && !state.airborne) {
        // Still on the take-off roll: stay on the ground and keep
        // accelerating; the plane lifts off once the wings bite.
        plane.verticalSpeed = 0;
        return events;
      }
      return crash(
        plane.alt <= 2 && overRunway(plane.x, plane.z)
          ? 'Too hard on the runway — the landing gear gave way.'
          : 'Terrain impact — the valley wins this one.',
      );
    }
    return events;

    function crash(reason) {
      state.status = 'crashed';
      state.crashReason = reason;
      state.plane.damage = 100;
      state.plane.speed = 0;
      return events | EVENT_CRASHED;
    }

    function land() {
      state.status = 'landed';
      state.landedHome = plane.z < COURSE_LENGTH / 2;
      const centreOffset = Math.abs(plane.x);
      const sink = Math.abs(plane.verticalSpeed);
      state.landingQuality = { sink, centreOffset, speed: plane.speed };
      let gained = SCORE.landingBase;
      if (sink <= 3) gained += SCORE.landingSoft;
      if (centreOffset <= 8) gained += SCORE.landingCentre;
      if (!state.landedHome) {
        gained += Math.round(plane.fuel * SCORE.fuelBonusPerPercent);
        gained += Math.max(0, Math.round((state.mission.parSeconds - state.time) * SCORE.timeBonusPerSecond));
      }
      state.score += gained;
      setToast(state.landedHome ? `Back home — +${gained}` : `DELIVERED! Landing +${gained}`);
      return events | EVENT_LANDED;
    }
  }

  /** Start the take-off roll: the plane is on the home runway, engine idle. */
  function takeOff() {
    if (state.status !== 'ready') return;
    state.status = 'flying';
    state.plane.throttle = 0.35;
  }

  /** The next ring the pilot is flying toward, or null once they are all passed. */
  function nextRingTarget() {
    return state.rings[state.nextRing] ?? null;
  }

  /** How far along the course the plane is, 0 at take-off and 1 at the far runway. */
  function progress() {
    return clamp(state.plane.z / COURSE_LENGTH, 0, 1);
  }

  /** Compass heading in degrees, 0 = north (down the course), clockwise. */
  function compassHeading() {
    return ((state.plane.heading % 360) + 360) % 360;
  }

  return {
    state,
    reset,
    step,
    takeOff,
    terrainHeight,
    overRunway,
    nextRingTarget,
    progress,
    compassHeading,
    camera: CAMERA,
  };
}
