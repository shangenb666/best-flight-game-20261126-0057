// Keyboard, mouse and touch input. Held keys and the pointer give a steering
// vector; one-shot presses (confirm, pause, mute, mission select) are queued
// as bit flags and taken once by the loop, so a press between two frames is
// never lost and never counted twice. Touch: drag anywhere to steer, and the
// on-screen throttle buttons hold the throttle up or down.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_MISSION_1 = 8;
export const ACTION_MISSION_2 = 16;
export const ACTION_MISSION_3 = 32;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['KeyQ', 'ControlLeft', 'ControlRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const MISSION_KEYS = new Map([
  ['Digit1', ACTION_MISSION_1],
  ['Digit2', ACTION_MISSION_2],
  ['Digit3', ACTION_MISSION_3],
]);

export function createInput(target) {
  const held = { left: false, right: false, up: false, down: false, throttleUp: false, throttleDown: false };
  let actions = 0;
  // Pointer steering: the drag offset from where the pointer went down,
  // normalised to [-1, 1] in each axis; 0 while no pointer is down.
  let pointerSteer = { x: 0, y: 0 };
  let pointerId = null;
  let pointerStart = null;
  let pointerThrottle = 0; // -1, 0 or 1 while a throttle button is held

  function keydown(event) {
    if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (THROTTLE_UP.has(event.code)) held.throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) held.throttleDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (MISSION_KEYS.has(event.code)) {
      if (!event.repeat) actions |= MISSION_KEYS.get(event.code);
    } else return;
    event.preventDefault();
  }

  function keyup(event) {
    if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (THROTTLE_UP.has(event.code)) held.throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) held.throttleDown = false;
  }

  function blur() {
    held.left = held.right = held.up = held.down = false;
    held.throttleUp = held.throttleDown = false;
    pointerId = null;
    pointerSteer = { x: 0, y: 0 };
  }

  function pointerdown(event) {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    const rect = target.getBoundingClientRect();
    pointerStart = { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
    // A tap (no drag yet) counts as confirm: it starts the game from a menu.
    // The loop only spends a confirm on the title and end screens, so a tap
    // mid-flight is harmless. The on-screen throttle buttons are separate DOM
    // elements, so pressing one never reaches this handler.
    actions |= ACTION_CONFIRM;
  }

  function pointermove(event) {
    if (event.pointerId !== pointerId || pointerStart === null) return;
    const rect = target.getBoundingClientRect();
    const dx = (event.clientX - rect.left - pointerStart.x) / (pointerStart.width * 0.35);
    const dy = (event.clientY - rect.top - pointerStart.y) / (pointerStart.height * 0.35);
    pointerSteer = {
      x: Math.max(-1, Math.min(1, dx)),
      y: Math.max(-1, Math.min(1, dy)),
    };
  }

  function pointerup(event) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    pointerStart = null;
    pointerSteer = { x: 0, y: 0 };
  }

  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', blur);
  target.addEventListener('pointerdown', pointerdown);
  target.addEventListener('pointermove', pointermove);
  target.addEventListener('pointerup', pointerup);
  target.addEventListener('pointercancel', pointerup);

  return {
    /** Steering in [-1, 1]: negative rolls left, positive rolls right. */
    steer() {
      const keys = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      if (keys !== 0) return keys;
      return pointerSteer.x;
    },
    /** Pitch in [-1, 1]: negative pulls the nose up, positive pushes it down. */
    pitch() {
      const keys = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (keys !== 0) return keys;
      return pointerSteer.y;
    },
    /** Throttle change in [-1, 1]: positive opens the throttle. */
    throttle() {
      if (pointerThrottle !== 0) return pointerThrottle;
      return (held.throttleUp ? 1 : 0) - (held.throttleDown ? 1 : 0);
    },
    /** Called by the on-screen throttle buttons (touch): hold up or down. */
    setPointerThrottle(value) {
      pointerThrottle = value;
    },
    /** True while the pointer is steering (a drag is in progress). */
    pointerActive() {
      return pointerId !== null;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
