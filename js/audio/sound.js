/**
 * Procedural Web Audio Engine for 3D Synthwave Circuit Racer
 * Synthesizes multi-gear engine growl, tire drift screech, nitro boom/whoosh,
 * collision impacts, starting beeps, and continuous 128 BPM Synthwave soundtrack with dynamic ducking.
 */

// Music bed configuration (per audio standards: continuous background bed at -18 dB, 128 BPM)
export const MUSIC_CONFIG = {
  bpm: 128,
  gainDb: -18,
  gainLinear: Math.pow(10, -18 / 20), // ~0.12589
  duckedGainDb: -26,
  duckedGainLinear: Math.pow(10, -26 / 20), // ~0.05012 (-8 dB attenuation)
  fadeTime: 0.5,
  duckAttack: 0.06,
  duckRelease: 0.7
};

// Countdown beep configuration
export const COUNTDOWN_CONFIG = {
  countdownBeepFreq: 440, // 3, 2, 1 beeps
  goBeepFreq: 880,        // GO! beep
  normalDuration: 0.15,
  goDuration: 0.4
};

/**
 * Calculates engine RPM, virtual gear, and oscillator frequency for a given speed.
 * Deep rumble at idle (50-90 Hz), progressive rise through 5 virtual gears up to top speed.
 *
 * @param {number} speed - Speed in m/s (or vehicle speed magnitude)
 * @returns {{ frequency: number, gear: number, rpmRatio: number, minFreq: number, maxFreq: number }}
 */
export function calculateEngineRPM(speed) {
  const absSpeed = Math.abs(speed || 0);

  // 5 Virtual Gears mapped across standard driving range (0 - 52.8 m/s, up to 70 m/s with nitro)
  const gearBands = [
    { gear: 1, minSpeed: 0, maxSpeed: 11, baseFreq: 65, topFreq: 145 },
    { gear: 2, minSpeed: 11, maxSpeed: 22, baseFreq: 85, topFreq: 165 },
    { gear: 3, minSpeed: 22, maxSpeed: 33, baseFreq: 105, topFreq: 190 },
    { gear: 4, minSpeed: 33, maxSpeed: 44, baseFreq: 125, topFreq: 215 },
    { gear: 5, minSpeed: 44, maxSpeed: 70, baseFreq: 145, topFreq: 260 }
  ];

  let currentBand = gearBands[0];
  for (let i = 0; i < gearBands.length; i++) {
    const band = gearBands[i];
    if (i === gearBands.length - 1) {
      if (absSpeed >= band.minSpeed) {
        currentBand = band;
        break;
      }
    } else if (absSpeed >= band.minSpeed && absSpeed < band.maxSpeed) {
      currentBand = band;
      break;
    }
  }

  const span = currentBand.maxSpeed - currentBand.minSpeed;
  const rpmRatio = span > 0 ? Math.min(1.0, Math.max(0.0, (absSpeed - currentBand.minSpeed) / span)) : 0;
  const frequency = currentBand.baseFreq + rpmRatio * (currentBand.topFreq - currentBand.baseFreq);

  return {
    frequency: Math.round(frequency * 100) / 100,
    gear: currentBand.gear,
    rpmRatio: Math.round(rpmRatio * 1000) / 1000,
    minFreq: currentBand.baseFreq,
    maxFreq: currentBand.topFreq
  };
}

/**
 * Synthwave chord progression definitions for procedural 128 BPM soundtrack
 * 4-bar progression in D minor: Dm -> Bb -> F -> C
 */
const SYNTHWAVE_CHORDS = [
  // Bar 1: D minor
  {
    bass: 73.42, // D2
    arp: [146.83, 220.00, 293.66, 349.23, 440.00, 349.23, 293.66, 220.00] // D3, A3, D4, F4, A4, F4, D4, A3
  },
  // Bar 2: Bb major
  {
    bass: 58.27, // Bb1
    arp: [116.54, 174.61, 233.08, 293.66, 349.23, 293.66, 233.08, 174.61] // Bb2, F3, Bb3, D4, F4, D4, Bb3, F3
  },
  // Bar 3: F major
  {
    bass: 87.31, // F2
    arp: [174.61, 220.00, 261.63, 349.23, 440.00, 349.23, 261.63, 220.00] // F3, A3, C4, F4, A4, F4, C4, A3
  },
  // Bar 4: C major
  {
    bass: 65.41, // C2
    arp: [130.81, 164.81, 196.00, 261.63, 329.63, 261.63, 196.00, 164.81] // C3, E3, G3, C4, E4, C4, G3, E3
  }
];

/**
 * Complete procedural Web Audio synthesizer class
 */
export class SoundManager {
  /**
   * @param {Object} [options]
   * @param {AudioContext} [options.audioContext] Optional injected AudioContext (useful for testing)
   */
  constructor(options = {}) {
    this.audioCtx = options.audioContext || null;

    // Detect if Web Audio is available
    const hasGlobalAudio = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    const hasNodeAudio = typeof globalThis !== 'undefined' && globalThis.AudioContext;
    this.isSupported = Boolean(options.audioContext || hasGlobalAudio || hasNodeAudio);

    this.isInitialized = false;
    this.isMusicPlaying = false;
    this.isDucked = false;
    this.isNitroActive = false;

    // Audio node references
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;

    // Engine synth nodes
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;

    // Drift screech nodes
    this.noiseBuffer = null;
    this.driftNoiseNode = null;
    this.driftFilter = null;
    this.driftGain = null;

    // Nitro nodes
    this.nitroNoiseNode = null;
    this.nitroFilter = null;
    this.nitroGain = null;

    // Music scheduler state
    this.musicTimer = null;
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.crashDuckTimeout = null;
  }

  /**
   * Resumes or initializes the AudioContext on user interaction
   * @returns {Promise<void>}
   */
  async startAudio() {
    if (!this.isSupported) return;

    if (!this.audioCtx) {
      const AudioCtxClass = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
                            (typeof globalThis !== 'undefined' && globalThis.AudioContext);
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      } else {
        return;
      }
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    if (!this.isInitialized) {
      this._initAudioGraph();
    }
  }

  /**
   * Builds the procedural audio routing graph
   * @private
   */
  _initAudioGraph() {
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime || 0;

    // 1. Master Output Gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(1.0, now);
    this.masterGain.connect(ctx.destination);

    // 2. Sound Effects Gain
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.85, now);
    this.sfxGain.connect(this.masterGain);

    // 3. Music Bed Gain (-18 dB continuous background gain)
    this.musicGain = ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.0001, now);
    this.musicGain.connect(this.masterGain);

    // Pre-create 2-second looped white noise buffer for drift, nitro, and snare
    this.noiseBuffer = this._createNoiseBuffer(2);

    // 4. Engine Synthesizer Network
    // Primary oscillator: Sawtooth for rich mechanical engine buzz
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.setValueAtTime(65, now);

    // Secondary oscillator: Triangle sub-octave rumble for weight
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'triangle';
    this.engineOsc2.frequency.setValueAtTime(32.5, now);

    // Resonant Lowpass Filter for engine roar
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(350, now);
    this.engineFilter.Q.setValueAtTime(2.5, now);

    this.engineGain = ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.2, now);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);

    this.engineOsc1.start(now);
    this.engineOsc2.start(now);

    // 5. Drift Screech Noise Synthesizer
    if (this.noiseBuffer) {
      this.driftNoiseNode = ctx.createBufferSource();
      this.driftNoiseNode.buffer = this.noiseBuffer;
      this.driftNoiseNode.loop = true;

      this.driftFilter = ctx.createBiquadFilter();
      this.driftFilter.type = 'bandpass';
      this.driftFilter.frequency.setValueAtTime(1400, now);
      this.driftFilter.Q.setValueAtTime(4.0, now);

      this.driftGain = ctx.createGain();
      this.driftGain.gain.setValueAtTime(0.0, now);

      this.driftNoiseNode.connect(this.driftFilter);
      this.driftFilter.connect(this.driftGain);
      this.driftGain.connect(this.sfxGain);

      this.driftNoiseNode.start(now);
    }

    // 6. Nitro Continuous Rush Synthesizer
    if (this.noiseBuffer) {
      this.nitroNoiseNode = ctx.createBufferSource();
      this.nitroNoiseNode.buffer = this.noiseBuffer;
      this.nitroNoiseNode.loop = true;

      this.nitroFilter = ctx.createBiquadFilter();
      this.nitroFilter.type = 'highpass';
      this.nitroFilter.frequency.setValueAtTime(800, now);
      this.nitroFilter.Q.setValueAtTime(1.2, now);

      this.nitroGain = ctx.createGain();
      this.nitroGain.gain.setValueAtTime(0.0, now);

      this.nitroNoiseNode.connect(this.nitroFilter);
      this.nitroFilter.connect(this.nitroGain);
      this.nitroGain.connect(this.sfxGain);

      this.nitroNoiseNode.start(now);
    }

    this.isInitialized = true;
  }

  /**
   * Generates a mono white noise buffer
   * @private
   */
  _createNoiseBuffer(durationSeconds) {
    if (!this.audioCtx || typeof this.audioCtx.createBuffer !== 'function') return null;
    const sampleRate = this.audioCtx.sampleRate || 44100;
    const bufferSize = Math.floor(sampleRate * durationSeconds);
    const buffer = this.audioCtx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Dynamically modulates engine pitch and lowpass filter based on speed and throttle
   * @param {number} speedRatio - Normalized speed ratio (0 to ~1.3) or raw speed in m/s
   * @param {boolean} isAccelerating - Whether throttle is applied
   */
  updateEngine(speedRatio, isAccelerating) {
    if (!this.isInitialized || !this.engineOsc1) return;

    // Support both normalized ratio (0..1.5) or speed in m/s (0..70)
    const speed = speedRatio <= 1.5 ? speedRatio * 52.8 : speedRatio;
    const rpm = calculateEngineRPM(speed);
    const now = this.audioCtx.currentTime || 0;

    // Pitch modulation: fundamental and sub-octave
    this.engineOsc1.frequency.setValueAtTime(rpm.frequency, now);
    this.engineOsc2.frequency.setValueAtTime(rpm.frequency * 0.5, now);

    // Lowpass filter modulation: open up aggressively when accelerating
    const filterFreq = isAccelerating
      ? 1100 + rpm.rpmRatio * 2200
      : 350 + rpm.rpmRatio * 450;
    this.engineFilter.frequency.setValueAtTime(filterFreq, now);

    // Gain modulation
    const engineVol = isAccelerating
      ? 0.22 + rpm.rpmRatio * 0.14
      : 0.14 + rpm.rpmRatio * 0.06;
    this.engineGain.gain.setValueAtTime(engineVol, now);
  }

  /**
   * Modulates engine RPM, frequency and lowpass filter
   * @param {number} speed - Forward vehicle speed in m/s or speedRatio
   * @param {boolean} [isAccelerating=false] - Whether throttle is actively applied
   */
  setEngineRPM(speed, isAccelerating = false) {
    this.updateEngine(speed, isAccelerating);
  }

  /**
   * Modulates tire screech noise bandpass filter and gain for drift slides
   * @param {number} intensity - Drift intensity [0, 1]
   */
  setDriftScreech(intensity) {
    if (!this.isInitialized || !this.driftGain) return;

    const clamped = Math.max(0, Math.min(1, intensity || 0));
    const now = this.audioCtx.currentTime || 0;

    if (clamped <= 0.02) {
      this.driftGain.gain.setValueAtTime(0.0, now);
    } else {
      const gain = Math.min(0.3, clamped * 0.3);
      const centerFreq = 1200 + clamped * 800; // 1200Hz to 2000Hz
      this.driftGain.gain.setValueAtTime(gain, now);
      this.driftFilter.frequency.setValueAtTime(centerFreq, now);
    }
  }

  /**
   * Triggers nitro sub-bass boom, white noise rush, and dynamic music ducking
   * @param {boolean} active - True to activate, false to deactivate
   */
  triggerNitro(active) {
    if (!this.isInitialized) return;

    this.isNitroActive = Boolean(active);
    const now = this.audioCtx.currentTime || 0;

    if (this.isNitroActive) {
      // 1. Sub-bass boom (60Hz drop)
      const boomOsc = this.audioCtx.createOscillator();
      const boomGain = this.audioCtx.createGain();

      boomOsc.type = 'sine';
      boomOsc.frequency.setValueAtTime(90, now);
      boomOsc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

      boomGain.gain.setValueAtTime(0.45, now);
      boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      boomOsc.connect(boomGain);
      boomGain.connect(this.sfxGain);

      boomOsc.start(now);
      boomOsc.stop(now + 0.45);

      // 2. White noise rush
      if (this.nitroGain) {
        this.nitroGain.gain.setValueAtTime(0.28, now);
      }

      // 3. Duck background music
      this.duckMusic();
    } else {
      // Stop nitro whoosh
      if (this.nitroGain) {
        this.nitroGain.gain.setValueAtTime(0.0, now);
      }

      // Restore music volume
      this.unduckMusic();
    }
  }

  /**
   * Plays snappy collision impact sound (punchy sub thud + metal noise burst) and ducks music
   */
  playCrash() {
    if (!this.isInitialized) return;

    const now = this.audioCtx.currentTime || 0;

    // Low sub thud
    const thudOsc = this.audioCtx.createOscillator();
    const thudGain = this.audioCtx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(140, now);
    thudOsc.frequency.exponentialRampToValueAtTime(30, now + 0.22);

    thudGain.gain.setValueAtTime(0.6, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    thudOsc.connect(thudGain);
    thudGain.connect(this.sfxGain);
    thudOsc.start(now);
    thudOsc.stop(now + 0.28);

    // Impact noise burst
    if (this.noiseBuffer) {
      const burstSrc = this.audioCtx.createBufferSource();
      burstSrc.buffer = this.noiseBuffer;

      const burstFilter = this.audioCtx.createBiquadFilter();
      burstFilter.type = 'bandpass';
      burstFilter.frequency.setValueAtTime(900, now);
      burstFilter.Q.setValueAtTime(1.8, now);

      const burstGain = this.audioCtx.createGain();
      burstGain.gain.setValueAtTime(0.5, now);
      burstGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      burstSrc.connect(burstFilter);
      burstFilter.connect(burstGain);
      burstGain.connect(this.sfxGain);

      burstSrc.start(now);
      burstSrc.stop(now + 0.25);
    }

    // Dynamic music ducking on impact
    this.duckMusic();
    if (this.crashDuckTimeout) clearTimeout(this.crashDuckTimeout);
    this.crashDuckTimeout = setTimeout(() => {
      if (!this.isNitroActive) {
        this.unduckMusic();
      }
    }, 600);
  }

  /**
   * Plays starting countdown beeps
   * @param {boolean} isFinal - False for 3, 2, 1 (440Hz), True for GO (880Hz)
   */
  playCountdownBeep(isFinal) {
    if (!this.isInitialized) return;

    const freq = isFinal ? COUNTDOWN_CONFIG.goBeepFreq : COUNTDOWN_CONFIG.countdownBeepFreq;
    const duration = isFinal ? COUNTDOWN_CONFIG.goDuration : COUNTDOWN_CONFIG.normalDuration;
    const now = this.audioCtx.currentTime || 0;

    const beepOsc = this.audioCtx.createOscillator();
    const beepGain = this.audioCtx.createGain();

    beepOsc.type = isFinal ? 'triangle' : 'sine';
    beepOsc.frequency.setValueAtTime(freq, now);

    beepGain.gain.setValueAtTime(0.35, now);
    beepGain.gain.setValueAtTime(0.35, now + duration * 0.7);
    beepGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    beepOsc.connect(beepGain);
    beepGain.connect(this.sfxGain);

    beepOsc.start(now);
    beepOsc.stop(now + duration + 0.05);
  }

  /**
   * Dynamically attenuates background music gain during intense sound effects
   */
  duckMusic() {
    if (!this.musicGain) return;
    this.isDucked = true;
    const now = (this.audioCtx && this.audioCtx.currentTime) || 0;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(MUSIC_CONFIG.duckedGainLinear, now + MUSIC_CONFIG.duckAttack);
  }

  /**
   * Smoothly restores background music gain to standard -18 dB level
   */
  unduckMusic() {
    if (!this.musicGain) return;
    this.isDucked = false;
    const now = (this.audioCtx && this.audioCtx.currentTime) || 0;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(MUSIC_CONFIG.gainLinear, now + MUSIC_CONFIG.duckRelease);
  }

  /**
   * Starts continuous 128 BPM Synthwave soundtrack loop at -18 dB
   */
  startMusic() {
    if (!this.isInitialized || this.isMusicPlaying) return;

    this.isMusicPlaying = true;
    const now = this.audioCtx.currentTime || 0;

    // Smooth fade in
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(MUSIC_CONFIG.gainLinear, now + 0.3);

    // 128 BPM clock: 1 beat = 60/128 = 0.46875s; 16th note = 0.1171875s
    const stepDuration = 60 / (MUSIC_CONFIG.bpm * 4);
    this.musicStep = 0;
    this.nextNoteTime = now + 0.05;

    // Lookahead scheduler runs every 40ms to schedule upcoming notes
    this.musicTimer = setInterval(() => {
      this._scheduleMusicSteps(stepDuration);
    }, 40);
  }

  /**
   * Web Audio lookahead scheduler for seamless, drift-free procedural synthwave loop
   * @private
   */
  _scheduleMusicSteps(stepDuration) {
    if (!this.audioCtx || !this.isMusicPlaying) return;

    const scheduleAhead = 0.15; // Schedule 150ms ahead
    const currentTime = this.audioCtx.currentTime || 0;
    const now = currentTime;

    // Tab inactivity clamping: if browser tab was backgrounded/minimized,
    // protect against note bursts when returning to the tab.
    this.nextNoteTime = Math.max(this.nextNoteTime, now);

    while (this.nextNoteTime < currentTime + scheduleAhead) {
      this._playSequenceStep(this.musicStep, this.nextNoteTime);
      this.nextNoteTime += stepDuration;
      this.musicStep = (this.musicStep + 1) % 64; // 4 bars of 16 steps
    }
  }

  /**
   * Alias for scheduler notes loop
   * @private
   */
  _scheduleMusicNotes(stepDuration) {
    return this._scheduleMusicSteps(stepDuration);
  }

  /**
   * Plays notes and rhythm for a specific step in the 64-step sequence
   * @private
   */
  _playSequenceStep(step, time) {
    const barIndex = Math.floor(step / 16) % 4;
    const stepInBar = step % 16;
    const chord = SYNTHWAVE_CHORDS[barIndex];

    // 1. Synth Arpeggios (16th notes with ascending/descending pattern)
    const arpFreq = chord.arp[stepInBar % 8];
    this._playSynthArp(arpFreq, time);

    // 2. Rolling Synthwave Bass (16th note driving pulse)
    const bassFreq = (stepInBar % 2 === 0) ? chord.bass : chord.bass * 2;
    this._playSynthBass(bassFreq, time);

    // 3. Drum accents: 4-on-the-floor kick, snappy snare on 2 & 4
    if (stepInBar % 4 === 0) {
      this._playKick(time);
    }
    if (stepInBar === 4 || stepInBar === 12) {
      this._playSnare(time);
    }
  }

  /**
   * Arpeggiator pluck note synthesizer
   * @private
   */
  _playSynthArp(freq, time) {
    if (!this.audioCtx || !this.musicGain) return;
    const osc = this.audioCtx.createOscillator();
    const filter = this.audioCtx.createBiquadFilter();
    const gain = this.audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, time);
    filter.frequency.exponentialRampToValueAtTime(350, time + 0.11);

    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.13);
  }

  /**
   * Rolling bass pulse synthesizer
   * @private
   */
  _playSynthBass(freq, time) {
    if (!this.audioCtx || !this.musicGain) return;
    const osc = this.audioCtx.createOscillator();
    const filter = this.audioCtx.createBiquadFilter();
    const gain = this.audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + 0.09);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.11);
  }

  /**
   * Procedural punchy kick drum
   * @private
   */
  _playKick(time) {
    if (!this.audioCtx || !this.musicGain) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.07);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.09);
  }

  /**
   * Procedural filtered noise snare
   * @private
   */
  _playSnare(time) {
    if (!this.audioCtx || !this.musicGain || !this.noiseBuffer) return;
    const noise = this.audioCtx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, time);

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    noise.start(time);
    noise.stop(time + 0.11);
  }

  /**
   * Stops music smoothly with exponential fade out (no hard clicks or raw dropouts)
   */
  stopMusic() {
    if (!this.isMusicPlaying) return;

    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }

    this.isMusicPlaying = false;

    if (this.musicGain) {
      const now = (this.audioCtx && this.audioCtx.currentTime) || 0;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(0.0001, now + MUSIC_CONFIG.fadeTime);
    }
  }

  /**
   * Cleans up audio oscillators and contexts
   */
  dispose() {
    this.stopMusic();
    if (this.engineOsc1) {
      try { this.engineOsc1.stop(); } catch (e) {}
    }
    if (this.engineOsc2) {
      try { this.engineOsc2.stop(); } catch (e) {}
    }
    if (this.driftNoiseNode) {
      try { this.driftNoiseNode.stop(); } catch (e) {}
    }
    if (this.nitroNoiseNode) {
      try { this.nitroNoiseNode.stop(); } catch (e) {}
    }
    if (this.audioCtx && typeof this.audioCtx.close === 'function') {
      try { this.audioCtx.close(); } catch (e) {}
    }
    this.isInitialized = false;
  }
}
