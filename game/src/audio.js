// Sky Courier's sound: everything is synthesised with the Web Audio API, so
// the game ships no audio files at all. An engine hum follows the throttle, a
// soft wind follows the speed, and short chimes mark rings, landings and
// crashes. Audio starts only after the player's first gesture (browsers
// require it) and can be muted with M.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  /** Build the graph. Safe to call more than once; later calls do nothing. */
  function ensure() {
    if (context !== null) return;
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);

    // Engine: two detuned sawtooths through a low-pass filter.
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineOsc2 = context.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55 * 1.005;
    engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped white noise through a band-pass filter.
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    windSource = context.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = context.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();
  }

  /** Start the audio graph after a user gesture. */
  function start() {
    ensure();
    if (context === null || started) return;
    started = true;
    if (context.state === 'suspended') void context.resume();
  }

  /** Follow the plane: engine pitch from the throttle, wind from the speed. */
  function update(throttle, speed, flying) {
    if (context === null || !started) return;
    // A tab that was hidden suspends the context; resume it on the next
    // frame so the sound comes back without another gesture.
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const engineLevel = flying ? 0.05 + throttle * 0.075 : 0;
    engineGain.gain.setTargetAtTime(engineLevel, now, 0.1);
    engineOsc.frequency.setTargetAtTime(48 + throttle * 72, now, 0.1);
    engineFilter.frequency.setTargetAtTime(280 + throttle * 700, now, 0.1);
    const windLevel = flying ? Math.min(0.12, (speed / 95) * 0.12) : 0;
    windGain.gain.setTargetAtTime(windLevel, now, 0.15);
    windFilter.frequency.setTargetAtTime(350 + speed * 6, now, 0.15);
  }

  /** One short tone: frequency, duration and shape in one call. */
  function blip(frequency, duration, type, level, when = 0) {
    if (context === null || !started) return;
    const now = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  return {
    start,
    update,
    /** A bright two-note chime when a ring is threaded. */
    ring(centre) {
      blip(880, 0.22, 'sine', 0.22);
      blip(centre ? 1318 : 1174, 0.3, 'sine', 0.2, 0.07);
    },
    /** A dull thud for a missed ring. */
    miss() {
      blip(180, 0.18, 'triangle', 0.16);
    },
    /** A warm major chord for a landing. */
    land() {
      blip(523, 0.35, 'sine', 0.2);
      blip(659, 0.35, 'sine', 0.2, 0.09);
      blip(784, 0.5, 'sine', 0.2, 0.18);
    },
    /** A low noise burst for a crash. */
    crash() {
      if (context === null || !started) return;
      const now = context.currentTime;
      const length = Math.floor(context.sampleRate * 0.5);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      const gain = context.createGain();
      gain.gain.value = 0.5;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(now);
      blip(70, 0.5, 'sine', 0.3);
    },
    /** A short warning beep for stall and empty fuel. */
    warn() {
      blip(620, 0.14, 'square', 0.08);
      blip(620, 0.14, 'square', 0.08, 0.18);
    },
    setMuted(value) {
      muted = value;
      if (master !== null && context !== null) {
        master.gain.setTargetAtTime(muted ? 0 : 0.5, context.currentTime, 0.05);
      }
    },
    isMuted() {
      return muted;
    },
  };
}
