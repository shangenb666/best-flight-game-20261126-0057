// Sky Courier — every tuning number, colour and mission definition in one place.
// The world is measured in metres. The course runs down +z from the home runway
// (z = 0) to the destination runway (z = COURSE_LENGTH). The renderer draws a
// 1280x720 logical frame and scales it to the window, so no rule here depends
// on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Length of one sortie, from the home runway threshold to the far one. */
export const COURSE_LENGTH = 6000;
/** Width of each runway strip, in metres. */
export const RUNWAY_WIDTH = 64;
/** Length of each runway strip, in metres. */
export const RUNWAY_LENGTH = 460;

/** Flight model: speeds in m/s, angles in degrees, fuel in percent. */
export const FLIGHT = {
  minSpeed: 38, // below this the wings stop flying and the plane sinks
  cruiseSpeed: 95, // speed at full throttle, level flight
  accel: 14, // m/s^2 gained when the throttle asks for more speed
  decel: 20, // m/s^2 lost when it asks for less
  maxRoll: 60, // degrees of bank at full stick
  rollRate: 180, // degrees per second the wings roll toward the stick
  maxPitch: 20, // degrees of nose up or down at full stick
  pitchRate: 55, // degrees per second the nose moves toward the stick
  sinkRate: 9, // m/s the plane sinks when it is flying too slowly
  groundEffect: 3, // metres above the ground where the sink softens
  fuelBurnIdle: 0.22, // percent of fuel per second at idle throttle
  fuelBurnFull: 0.95, // percent of fuel per second at full throttle
  fuelStart: 100,
  stallWarningSpeed: 52,
};

/** Scoring: every point the pilot can earn, in one place. */
export const SCORE = {
  ring: 50,
  ringCentre: 40, // bonus for threading a ring within 10 m of its centre
  ringCombo: 15, // extra per consecutive ring without a miss, capped below
  ringComboCap: 90,
  landingBase: 200,
  landingSoft: 150, // touchdown gentler than -3 m/s
  landingCentre: 100, // touchdown within 8 m of the runway centreline
  fuelBonusPerPercent: 2, // per percent of fuel left on landing
  timeBonusPerSecond: 1, // per second under the mission par time
};

/** How far ahead the camera sits behind the plane, and how high above it. */
export const CAMERA = { behind: 26, above: 7, fov: 420 };

/** Ring geometry: the ring's own radius, and how close the plane must pass
 *  to its centre to count as threaded (the rest of the ring still scores). */
export const RING = { radius: 26, collectRadius: 26, centreRadius: 10 };

/** How long a toast message stays on screen, in seconds. */
export const TOAST_SECONDS = 2.6;

/** The three missions. Rings are laid out from the mission's ring plan; the
 *  storm mission adds crosswind and rain, the canyon mission raises the peaks
 *  and drops the rings low between them. */
export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    tagline: 'Thread all twelve rings, then put her down on the far runway.',
    rings: 12,
    ringAltMin: 70,
    ringAltMax: 210,
    ringSpread: 320,
    peakCount: 7,
    peakHeightMax: 150,
    wind: 0,
    rain: false,
    parSeconds: 150,
    brief:
      'A calm morning over the valley. Twelve rings mark the course — fly through the middle of each one for the full bonus, then land on the far runway.',
  },
  {
    id: 'canyon',
    name: 'CANYON DELIVERY',
    tagline: 'Low, fast and between the peaks. The parcel cannot wait.',
    rings: 9,
    ringAltMin: 45,
    ringAltMax: 130,
    ringSpread: 220,
    peakCount: 14,
    peakHeightMax: 260,
    wind: 0,
    rain: false,
    parSeconds: 135,
    brief:
      'A parcel run down the canyon. The rings sit low between tall peaks — stay under the ridge line and mind your fuel, there is no room to climb out.',
  },
  {
    id: 'storm',
    name: 'STORM LANDING',
    tagline: 'Six rings in a crosswind, then a landing the weather does not want.',
    rings: 6,
    ringAltMin: 90,
    ringAltMax: 240,
    ringSpread: 380,
    peakCount: 9,
    peakHeightMax: 190,
    wind: 14, // m/s of sideways drift the pilot must crab against
    rain: true,
    parSeconds: 165,
    brief:
      'A front is coming in over the far runway. The wind pushes the plane sideways the whole way — hold a crab angle into it, and land before the fuel gauge does.',
  },
];

/** Palette: one dusk-valley style for sky, terrain, runway and instruments. */
export const PALETTE = {
  skyTop: '#1d3a5f',
  skyMid: '#7fb0d8',
  skyHorizon: '#ffd9a0',
  sun: '#fff3c4',
  sunGlow: 'rgba(255, 220, 140, 0.55)',
  cloud: 'rgba(255, 255, 255, 0.85)',
  cloudShade: 'rgba(226, 236, 245, 0.7)',
  terrainFar: '#5d7d5a',
  terrainMid: '#4c6b45',
  terrainNear: '#3d5a38',
  terrainRidge: '#33482f',
  peakRock: '#6b6f78',
  peakSnow: '#eef2f6',
  runway: '#3a3f46',
  runwayEdge: '#f2f5f7',
  runwayMark: '#ffd94d',
  grass: '#55703f',
  ring: '#ffcf3d',
  ringGlow: 'rgba(255, 207, 61, 0.45)',
  ringDone: '#7ee081',
  planeBody: '#e8ecf1',
  planeAccent: '#e4572e',
  planeGlass: '#1d3557',
  planeShadow: 'rgba(10, 20, 30, 0.35)',
  hudPanel: 'rgba(8, 18, 30, 0.62)',
  hudText: '#eef4f8',
  hudAmber: '#ffcf3d',
  hudRed: '#ff5d5d',
  hudGreen: '#7ee081',
  hudMuted: '#9fb4c4',
  rain: 'rgba(190, 210, 225, 0.5)',
};

/** Font stack for every canvas label. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Where the best score per mission is kept between visits (this browser only). */
export const BEST_KEY = 'sky-courier.best.';
