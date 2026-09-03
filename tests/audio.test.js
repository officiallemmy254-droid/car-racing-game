import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEngineRPM,
  SoundManager,
  MUSIC_CONFIG,
  COUNTDOWN_CONFIG
} from '../js/audio/sound.js';

// --- Unit Test 1: calculateEngineRPM multi-gear calculations ---
test('calculateEngineRPM calculates multi-gear frequencies accurately', () => {
  const idle = calculateEngineRPM(0);
  assert.ok(idle.frequency >= 50 && idle.frequency <= 90, 'Idle RPM must be deep rumble');
  assert.equal(idle.gear, 1, 'At 0 speed car must be in 1st gear');

  const topGear = calculateEngineRPM(50); // ~180 km/h
  assert.ok(topGear.frequency > idle.frequency, 'High speed must have higher engine frequency');
  assert.ok(topGear.gear >= 1 && topGear.gear <= 5, 'Gear must be between 1 and 5');
  assert.equal(topGear.gear, 5, '50 m/s (~180 km/h) should be in 5th gear');
});

test('calculateEngineRPM provides progressive frequency rise across 5 virtual gears', () => {
  // Check that speeds map to 5 distinct gears
  const gear1 = calculateEngineRPM(5);
  const gear2 = calculateEngineRPM(16);
  const gear3 = calculateEngineRPM(27);
  const gear4 = calculateEngineRPM(38);
  const gear5 = calculateEngineRPM(55);

  assert.equal(gear1.gear, 1);
  assert.equal(gear2.gear, 2);
  assert.equal(gear3.gear, 3);
  assert.equal(gear4.gear, 4);
  assert.equal(gear5.gear, 5);

  // Progressive frequency rise within each gear
  const gear1Low = calculateEngineRPM(1);
  const gear1High = calculateEngineRPM(10);
  assert.ok(gear1High.frequency > gear1Low.frequency, 'Frequency must rise within gear 1');

  const gear2Low = calculateEngineRPM(12);
  const gear2High = calculateEngineRPM(21);
  assert.ok(gear2High.frequency > gear2Low.frequency, 'Frequency must rise within gear 2');

  const gear3Low = calculateEngineRPM(23);
  const gear3High = calculateEngineRPM(32);
  assert.ok(gear3High.frequency > gear3Low.frequency, 'Frequency must rise within gear 3');

  const gear4Low = calculateEngineRPM(34);
  const gear4High = calculateEngineRPM(43);
  assert.ok(gear4High.frequency > gear4Low.frequency, 'Frequency must rise within gear 4');

  const gear5Low = calculateEngineRPM(45);
  const gear5High = calculateEngineRPM(68);
  assert.ok(gear5High.frequency > gear5Low.frequency, 'Frequency must rise within gear 5');

  // Progressive base frequencies across gears
  assert.ok(gear2Low.frequency > gear1Low.frequency, 'Gear 2 base frequency must be higher than Gear 1');
  assert.ok(gear3Low.frequency > gear2Low.frequency, 'Gear 3 base frequency must be higher than Gear 2');
  assert.ok(gear4Low.frequency > gear3Low.frequency, 'Gear 4 base frequency must be higher than Gear 3');
  assert.ok(gear5Low.frequency > gear4Low.frequency, 'Gear 5 base frequency must be higher than Gear 4');

  // Reverse speed test
  const reverse = calculateEngineRPM(-10);
  assert.ok(reverse.frequency >= 50, 'Reverse speed must produce valid rumble frequency');
  assert.ok(reverse.frequency > idleFreq(reverse), 'Moving reverse speed must be higher than idle');
  function idleFreq() { return calculateEngineRPM(0).frequency; }
});

// --- Unit Test 2: Music bed parameters & ducking ---
test('MUSIC_CONFIG specifies 128 BPM, -18 dB continuous gain (~0.125), and ducking attenuation', () => {
  assert.equal(MUSIC_CONFIG.bpm, 128, 'Music bed tempo must be 128 BPM');
  assert.equal(MUSIC_CONFIG.gainDb, -18, 'Continuous background bed must run at -18 dB');

  // Gain in linear amplitude: 10^(-18/20) ~ 0.12589
  assert.ok(
    MUSIC_CONFIG.gainLinear >= 0.12 && MUSIC_CONFIG.gainLinear <= 0.13,
    `Continuous gain linear must be ~0.125, got ${MUSIC_CONFIG.gainLinear}`
  );

  // Ducking attenuation
  assert.ok(MUSIC_CONFIG.duckedGainDb < MUSIC_CONFIG.gainDb, 'Ducked gain must be quieter than normal gain');
  assert.ok(
    MUSIC_CONFIG.duckedGainLinear < MUSIC_CONFIG.gainLinear,
    'Ducked linear gain must be lower than base linear gain'
  );
  // Ducking attenuation should be at least 6 dB reduction
  const attenuationDb = MUSIC_CONFIG.gainDb - MUSIC_CONFIG.duckedGainDb;
  assert.ok(attenuationDb >= 6, `Ducking attenuation must be at least 6 dB, got ${attenuationDb} dB`);
});

// --- Unit Test 3: Countdown beep frequencies ---
test('COUNTDOWN_CONFIG defines 440 Hz for countdown beeps and 880 Hz for GO', () => {
  assert.equal(COUNTDOWN_CONFIG.countdownBeepFreq, 440, 'Countdown beep must be 440 Hz');
  assert.equal(COUNTDOWN_CONFIG.goBeepFreq, 880, 'GO beep must be 880 Hz');
});

// --- Unit Test 4: Headless fallback without AudioContext ---
test('SoundManager handles headless environment gracefully without crashing', () => {
  const soundManager = new SoundManager();
  assert.equal(soundManager.isSupported, false, 'Should flag unsupported when no AudioContext');

  // Verify all methods execute safely in headless mode
  assert.doesNotThrow(() => soundManager.startAudio());
  assert.doesNotThrow(() => soundManager.updateEngine(0.8, true));
  assert.doesNotThrow(() => soundManager.updateEngine(0, false));
  assert.doesNotThrow(() => soundManager.setDriftScreech(0.7));
  assert.doesNotThrow(() => soundManager.setDriftScreech(0));
  assert.doesNotThrow(() => soundManager.triggerNitro(true));
  assert.doesNotThrow(() => soundManager.triggerNitro(false));
  assert.doesNotThrow(() => soundManager.playCrash());
  assert.doesNotThrow(() => soundManager.playCountdownBeep(false));
  assert.doesNotThrow(() => soundManager.playCountdownBeep(true));
  assert.doesNotThrow(() => soundManager.startMusic());
  assert.doesNotThrow(() => soundManager.duckMusic());
  assert.doesNotThrow(() => soundManager.unduckMusic());
  assert.doesNotThrow(() => soundManager.stopMusic());
});

// --- Unit Test 5: SoundManager with Mock AudioContext ---
function createMockAudioContext() {
  const scheduledEvents = [];

  class MockAudioParam {
    constructor(defaultValue = 0) {
      this.value = defaultValue;
    }
    setValueAtTime(val, time) {
      this.value = val;
      scheduledEvents.push({ type: 'setValueAtTime', val, time });
    }
    linearRampToValueAtTime(val, time) {
      this.value = val;
      scheduledEvents.push({ type: 'linearRampToValueAtTime', val, time });
    }
    exponentialRampToValueAtTime(val, time) {
      this.value = val;
      scheduledEvents.push({ type: 'exponentialRampToValueAtTime', val, time });
    }
    setTargetAtTime(val, time, constant) {
      this.value = val;
      scheduledEvents.push({ type: 'setTargetAtTime', val, time, constant });
    }
  }

  class MockNode {
    constructor() {
      this.connections = [];
    }
    connect(dest) {
      this.connections.push(dest);
      return dest;
    }
    disconnect() {
      this.connections = [];
    }
  }

  class MockGainNode extends MockNode {
    constructor() {
      super();
      this.gain = new MockAudioParam(1.0);
    }
  }

  class MockOscillatorNode extends MockNode {
    constructor() {
      super();
      this.type = 'sine';
      this.frequency = new MockAudioParam(440);
      this.detune = new MockAudioParam(0);
      this.started = false;
      this.stopped = false;
    }
    start(time = 0) {
      this.started = true;
      scheduledEvents.push({ type: 'oscStart', time });
    }
    stop(time = 0) {
      this.stopped = true;
      scheduledEvents.push({ type: 'oscStop', time });
    }
  }

  class MockBiquadFilterNode extends MockNode {
    constructor() {
      super();
      this.type = 'lowpass';
      this.frequency = new MockAudioParam(350);
      this.Q = new MockAudioParam(1);
    }
  }

  class MockBufferSourceNode extends MockNode {
    constructor() {
      super();
      this.buffer = null;
      this.loop = false;
      this.started = false;
      this.stopped = false;
    }
    start(time = 0) {
      this.started = true;
      scheduledEvents.push({ type: 'bufferStart', time });
    }
    stop(time = 0) {
      this.stopped = true;
      scheduledEvents.push({ type: 'bufferStop', time });
    }
  }

  class MockAudioContextInstance {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = new MockNode();
      this.sampleRate = 44100;
    }
    async resume() {
      this.state = 'running';
    }
    createGain() {
      return new MockGainNode();
    }
    createOscillator() {
      return new MockOscillatorNode();
    }
    createBiquadFilter() {
      return new MockBiquadFilterNode();
    }
    createBufferSource() {
      return new MockBufferSourceNode();
    }
    createBuffer(channels, length, sampleRate) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: () => new Float32Array(length)
      };
    }
  }

  return {
    MockAudioContextInstance,
    scheduledEvents
  };
}

test('SoundManager initializes Web Audio graph and controls soundscape', async () => {
  const { MockAudioContextInstance } = createMockAudioContext();
  const mockCtx = new MockAudioContextInstance();

  const sound = new SoundManager({ audioContext: mockCtx });
  assert.equal(sound.isSupported, true);

  // 1. startAudio initializes graph and resumes context
  await sound.startAudio();
  assert.equal(mockCtx.state, 'running');
  assert.ok(sound.isInitialized, 'SoundManager should be initialized');

  // 2. Engine sound updates
  sound.updateEngine(0.0, false); // Idle
  const idleFreq = sound.engineOsc1.frequency.value;
  assert.ok(idleFreq >= 50 && idleFreq <= 90, `Idle engine osc freq should be 50-90Hz, got ${idleFreq}`);

  sound.updateEngine(0.8, true); // High speed accelerating
  const highFreq = sound.engineOsc1.frequency.value;
  assert.ok(highFreq > idleFreq, 'High speed engine frequency must be higher than idle');
  assert.ok(sound.engineFilter.frequency.value > 500, 'Accelerating should open lowpass filter');

  // 3. Drift screech
  sound.setDriftScreech(0.8);
  assert.ok(sound.driftGain.gain.value > 0, 'Drift screech gain must be active');
  sound.setDriftScreech(0);
  assert.equal(sound.driftGain.gain.value, 0, 'Drift screech gain must return to 0');

  // 4. Nitro
  sound.triggerNitro(true);
  assert.ok(sound.nitroGain.gain.value > 0, 'Nitro sound gain must be active');
  assert.ok(sound.isDucked, 'Music should be ducked while nitro is active');

  sound.triggerNitro(false);
  assert.equal(sound.nitroGain.gain.value, 0, 'Nitro gain must return to 0 when inactive');

  // 5. Crash
  sound.playCrash();
  assert.ok(sound.isDucked, 'Crash should trigger music ducking');

  // 6. Countdown beeps
  let createdBeepFreq = null;
  const originalCreateOsc = mockCtx.createOscillator;
  mockCtx.createOscillator = () => {
    const osc = originalCreateOsc.call(mockCtx);
    const origStart = osc.start.bind(osc);
    osc.start = (time) => {
      createdBeepFreq = osc.frequency.value;
      return origStart(time);
    };
    return osc;
  };

  sound.playCountdownBeep(false);
  assert.equal(createdBeepFreq, 440, 'Normal countdown beep should be 440 Hz');

  sound.playCountdownBeep(true);
  assert.equal(createdBeepFreq, 880, 'Final GO countdown beep should be 880 Hz');

  // 7. Music continuous playback and ducking
  sound.startMusic();
  assert.ok(sound.isMusicPlaying, 'Music should be playing');
  assert.equal(sound.musicGain.gain.value, MUSIC_CONFIG.gainLinear, 'Music should play at -18 dB');

  sound.duckMusic();
  assert.equal(sound.musicGain.gain.value, MUSIC_CONFIG.duckedGainLinear, 'Music should duck to duckedGainLinear');

  sound.unduckMusic();
  assert.equal(sound.musicGain.gain.value, MUSIC_CONFIG.gainLinear, 'Music should recover to base gain');

  sound.stopMusic();
  assert.equal(sound.isMusicPlaying, false, 'Music should stop');
});
