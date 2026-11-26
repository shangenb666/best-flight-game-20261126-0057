// A small seeded random number generator (mulberry32) plus the helpers the
// world builder leans on: the same seed always gives the same valley, the
// same peaks and the same rings, which is what makes the screenshot scenes
// repeatable and the missions fair between restarts.

/** mulberry32: a fast 32-bit generator with a long, well-mixed period. */
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A value in [min, max) from the generator. */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max] from the generator. */
export function rangeInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** Pick one entry of an array, uniformly. */
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/**
 * Smooth value noise in one dimension: the sum of a few sines with seeded
 * phases and wavelengths, so the valley floor rolls instead of jumping.
 * `phases` holds one phase per octave; `wavelengths` its wavelengths.
 */
export function rollingNoise(x, phases, wavelengths, amplitude) {
  let value = 0;
  let weight = 1;
  let total = 0;
  for (let i = 0; i < phases.length; i += 1) {
    value += weight * Math.sin((x / wavelengths[i]) * Math.PI * 2 + phases[i]);
    total += weight;
    weight *= 0.5;
  }
  return (value / total) * amplitude;
}

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Degrees to radians. */
export function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Radians to degrees. */
export function radToDeg(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * Wrap an angle in degrees into (-180, 180], so a heading of 359 and a
 * heading of -1 compare as 2 degrees apart, not 360.
 */
export function wrapDegrees(degrees) {
  let wrapped = degrees % 360;
  if (wrapped <= -180) wrapped += 360;
  if (wrapped > 180) wrapped -= 360;
  return wrapped;
}
