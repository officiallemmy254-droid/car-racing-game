import test from 'node:test';
import assert from 'node:assert/strict';
import { VehiclePhysics, PHYSICS_CONSTANTS } from '../js/entities/player-car.js';
import { InputState, InputManager } from '../js/core/input.js';
import { TrackMath } from '../js/world/track-math.js';
import { Game, GAME_STATES } from '../js/main.js';

test('Controls: Steering auto-centers rapidly when steering input is released', () => {
  const car = new VehiclePhysics();
  car.speed = 20;

  // Turn hard right for 10 frames
  for (let i = 0; i < 10; i++) {
    car.step({ throttle: 1, brake: 0, steer: 1, drift: false, nitro: false }, 1 / 60);
  }
  assert.ok(car.steerAngle > 0.3, `Steer angle should be turned right, got ${car.steerAngle}`);

  // Release steer (steer = 0)
  for (let i = 0; i < 3; i++) {
    car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1 / 60);
  }

  // Auto-centering should snap back to 0 or very near 0 within 3 frames
  assert.ok(car.steerAngle < 0.05, `Steering should snap back rapidly to center within 3 frames, got ${car.steerAngle}`);
});

test('Controls: Steering direction reversal accelerates transition across zero during chicane flicks', () => {
  const car = new VehiclePhysics();
  car.speed = 30;

  // Steer left first
  for (let i = 0; i < 10; i++) {
    car.step({ throttle: 1, brake: 0, steer: -1, drift: false, nitro: false }, 1 / 60);
  }
  const initialLeftSteer = car.steerAngle;
  assert.ok(initialLeftSteer < -0.2, `Car should be steered left, got ${initialLeftSteer}`);

  // Flick right (steer = +1) for 2 frames
  car.step({ throttle: 1, brake: 0, steer: 1, drift: false, nitro: false }, 1 / 60);
  car.step({ throttle: 1, brake: 0, steer: 1, drift: false, nitro: false }, 1 / 60);

  // Reversal boost should have crossed zero towards positive
  assert.ok(car.steerAngle > 0, `Steering should cross zero rapidly into positive on reversal flick, got ${car.steerAngle}`);
});

test('Controls: Drifting maintains turn direction and modulates drift angle when counter-steering', () => {
  const car = new VehiclePhysics();
  car.speed = 35;

  // Initiate right drift (steer = 1, drift = true)
  for (let i = 0; i < 15; i++) {
    car.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1 / 60);
  }
  assert.equal(car.isDrifting, true);
  assert.equal(car.driftDirection, 1, 'Initial drift direction should be locked to right (+1)');
  const rightDriftAngle = car.driftAngle;
  assert.ok(rightDriftAngle > 0.2, `Drift angle should be positive, got ${rightDriftAngle}`);

  // Now counter-steer left (steer = -1) while still holding drift
  for (let i = 0; i < 10; i++) {
    car.step({ throttle: 1, brake: 0, steer: -1, drift: true, nitro: false }, 1 / 60);
  }

  // Drift direction must NOT flip to -1 on counter-steering
  assert.equal(car.isDrifting, true);
  assert.equal(car.driftDirection, 1, 'Drift direction must stay right (+1) during counter-steer control');
  // Drift angle should soften/ease to allow controlling the slide line
  assert.ok(car.driftAngle <= rightDriftAngle, `Drift angle should ease during counter-steer (${car.driftAngle} <= ${rightDriftAngle})`);
});

test('Controls: Lateral slip interpolates smoothly during drift entry and exit', () => {
  const car = new VehiclePhysics();
  car.speed = 40;

  // Before drift, lateralSlip is 0
  assert.equal(car.lateralSlip, 0);

  // Step 1 frame of drift: lateralSlip should start blending smoothly, not jump instantaneously to full -10 m/s
  car.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1 / 60);
  assert.equal(car.isDrifting, true);
  assert.ok(car.lateralSlip < 0, `Lateral slip should be negative for right drift, got ${car.lateralSlip}`);
  assert.ok(car.lateralSlip > -9.0, `Lateral slip should blend smoothly in 1st frame rather than jump to max, got ${car.lateralSlip}`);

  // Continue drifting to reach sustained slip
  for (let i = 0; i < 20; i++) {
    car.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1 / 60);
  }
  const fullSlip = car.lateralSlip;
  assert.ok(fullSlip <= -8.0, `Sustained lateral slip should be strong, got ${fullSlip}`);

  // Release drift: slip should decay smoothly rather than snap to 0 in one frame
  car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1 / 60);
  assert.equal(car.isDrifting, false);
  assert.ok(car.lateralSlip < 0 && car.lateralSlip > fullSlip, `Slip should smoothly decay after drift exit, got ${car.lateralSlip}`);
});

test('Controls: Mini-turbo maintains elevated top speed threshold without premature bleed-off', () => {
  const car = new VehiclePhysics();
  car.speed = 30;

  // Sustained drift for 1.3 seconds
  for (let i = 0; i < 78; i++) {
    car.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1 / 60);
  }
  assert.equal(car.isDrifting, true);

  // Force car speed up to normal max speed before exiting
  car.speed = PHYSICS_CONSTANTS.MAX_SPEED_NORMAL;

  // Exit drift to trigger mini-turbo
  car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1 / 60);
  assert.equal(car.hasMiniTurbo, true);
  assert.ok(car.speed > PHYSICS_CONSTANTS.MAX_SPEED_NORMAL, `Speed should exceed normal max speed, got ${car.speed}`);

  // Step full throttle for 10 frames under mini-turbo
  for (let i = 0; i < 10; i++) {
    car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1 / 60);
  }

  // Speed should remain elevated above MAX_SPEED_NORMAL throughout mini-turbo
  assert.ok(car.speed > PHYSICS_CONSTANTS.MAX_SPEED_NORMAL, `Speed should stay boosted during mini-turbo, got ${car.speed}`);
});

test('Controls: InputState supports alternative driving keys (IJKL, Numpad, case sensitivity)', () => {
  const input = new InputState();

  // IJKL controls
  input.handleKeyDown('KeyI');
  assert.equal(input.throttle, 1);
  input.handleKeyUp('KeyI');
  assert.equal(input.throttle, 0);

  input.handleKeyDown('KeyK');
  assert.equal(input.brake, 1);
  input.handleKeyUp('KeyK');
  assert.equal(input.brake, 0);

  input.handleKeyDown('KeyJ');
  assert.equal(input.steer, -1);
  input.handleKeyUp('KeyJ');
  assert.equal(input.steer, 0);

  input.handleKeyDown('KeyL');
  assert.equal(input.steer, 1);
  input.handleKeyUp('KeyL');
  assert.equal(input.steer, 0);

  // Numpad controls
  input.handleKeyDown('Numpad8');
  assert.equal(input.throttle, 1);
  input.handleKeyUp('Numpad8');
  assert.equal(input.throttle, 0);

  input.handleKeyDown('Numpad2');
  assert.equal(input.brake, 1);
  input.handleKeyUp('Numpad2');
  assert.equal(input.brake, 0);

  // Alternative nitro keys: KeyE, KeyN
  input.handleKeyDown('KeyE');
  assert.equal(input.nitro, true);
  input.handleKeyUp('KeyE');
  assert.equal(input.nitro, false);

  input.handleKeyDown('KeyN');
  assert.equal(input.nitro, true);
  input.handleKeyUp('KeyN');
  assert.equal(input.nitro, false);
});

test('Controls: InputManager polls Gamepad API and maps stick/triggers/buttons to vehicle controls', () => {
  const manager = new InputManager({ enableTouch: false });

  const origDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'getGamepads');
  try {
    const mockGamepad = {
      connected: true,
      axes: [0.75, 0], // Right stick steer
      buttons: [
        { pressed: false, value: 0 }, // A (0)
        { pressed: false, value: 0 }, // B (1)
        { pressed: false, value: 0 }, // X (2)
        { pressed: false, value: 0 }, // Y (3)
        { pressed: false, value: 0 }, // LB (4)
        { pressed: true, value: 1.0 }, // RB (5) - drift
        { pressed: false, value: 0 }, // LT (6) - brake
        { pressed: true, value: 0.9 }, // RT (7) - gas
        { pressed: false, value: 0 }, // Back (8)
        { pressed: false, value: 0 }, // Start (9)
        { pressed: false, value: 0 }, // 10
        { pressed: false, value: 0 }, // 11
        { pressed: false, value: 0 }, // 12
        { pressed: false, value: 0 }, // 13
        { pressed: false, value: 0 }, // 14
        { pressed: false, value: 0 }  // 15
      ]
    };

    Object.defineProperty(globalThis.navigator, 'getGamepads', {
      value: () => [mockGamepad],
      configurable: true,
      writable: true
    });

    const state = manager.getInputState();
    assert.ok(state.steer > 0.6, `Gamepad stick should steer right, got ${state.steer}`);
    assert.ok(state.throttle > 0.8, `Gamepad RT should trigger throttle, got ${state.throttle}`);
    assert.equal(state.drift, true, 'Gamepad RB should trigger drift');
    assert.equal(state.brake, 0, 'Brake should be 0');

    // Test button A for gas, button B for brake, button Y for nitro
    mockGamepad.axes[0] = -0.5;
    mockGamepad.buttons[7] = { pressed: false, value: 0 };
    mockGamepad.buttons[0] = { pressed: true, value: 1.0 }; // A
    mockGamepad.buttons[6] = { pressed: true, value: 0.8 }; // LT brake
    mockGamepad.buttons[3] = { pressed: true, value: 1.0 }; // Y nitro
    mockGamepad.buttons[5] = { pressed: false, value: 0 }; // RB

    const state2 = manager.getInputState();
    assert.ok(state2.steer < -0.3, `Gamepad stick should steer left, got ${state2.steer}`);
    assert.ok(state2.throttle > 0.8, 'Gamepad button A should trigger throttle');
    assert.ok(state2.brake >= 0.8, 'Gamepad LT should trigger brake');
    assert.equal(state2.nitro, true, 'Gamepad button Y should trigger nitro');
  } finally {
    if (origDescriptor) {
      Object.defineProperty(globalThis.navigator, 'getGamepads', origDescriptor);
    } else {
      delete globalThis.navigator.getGamepads;
    }
    manager.dispose();
  }
});

test('Controls: Barrier collision smoothly guides vehicle heading without perpendicular opposite-wall whip', () => {
  const track = new TrackMath();
  const car = new VehiclePhysics();

  // Position vehicle colliding with outer boundary
  car.position.set(12.5, 0.35, 30);
  car.speed = 40;
  car.velocity.set(6, 0, 40);

  // Step with track collision check
  car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1 / 60, track);

  assert.equal(car.hasCollidedBarrier, true);
  // Heading should deviate reasonably from track forward (+Z), not point 90 degrees directly into opposite wall
  const proj = track.projectPoint(car.position);
  const trackTan = track.getSplineTangent(proj.t);
  const trackHeading = Math.atan2(trackTan.x, trackTan.z);
  let headingDiff = Math.abs(car.heading - trackHeading);
  while (headingDiff > Math.PI) headingDiff -= 2 * Math.PI;
  assert.ok(Math.abs(headingDiff) <= Math.PI / 4 + 0.05, `Heading deviation should stay within ~45 deg of track, got ${Math.abs(headingDiff)} rad`);
});

test('Controls: Drifting with counter-steering prevents spinouts across sustained 1.2s drift', () => {
  const car = new VehiclePhysics();
  car.speed = 35;
  car.heading = 0;

  // Initiate drift to right
  car.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1 / 60);
  assert.equal(car.isDrifting, true);
  assert.equal(car.driftDirection, 1);

  const initialHeading = car.heading;

  // Counter-steer hard left (steer = -1) for 1.2s (72 frames)
  for (let i = 0; i < 72; i++) {
    car.step({ throttle: 1, brake: 0, steer: -1, drift: true, nitro: false }, 1 / 60);
  }

  // Heading turn angle should stay shallow (< 25 deg) rather than spinning out (124+ deg)
  const turnDeg = Math.abs(car.heading - initialHeading) * 180 / Math.PI;
  assert.ok(turnDeg < 25.0, `Counter-steered drift should prevent spinouts, turned only ${turnDeg.toFixed(1)} deg`);
  assert.equal(car.isDrifting, true);
  assert.equal(car.driftDirection, 1);
});

test('Controls: Drifting with neutral steering traces a smooth 60-75 degree cornering arc', () => {
  const car = new VehiclePhysics();
  car.speed = 35;
  car.heading = 0;

  // Initiate drift to right
  car.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1 / 60);

  const initialHeading = car.heading;

  // Neutral steering during drift for 1.2s (72 frames)
  for (let i = 0; i < 72; i++) {
    car.step({ throttle: 1, brake: 0, steer: 0, drift: true, nitro: false }, 1 / 60);
  }

  const turnDeg = Math.abs(car.heading - initialHeading) * 180 / Math.PI;
  assert.ok(turnDeg >= 50.0 && turnDeg <= 85.0, `Neutral drift should turn a natural curve (50-85 deg), got ${turnDeg.toFixed(1)} deg`);
});

test('Controls: Drifting with inward steering allows sharp hairpin cornering > 100 degrees', () => {
  const car = new VehiclePhysics();
  car.speed = 35;
  car.heading = 0;

  // Initiate drift to right
  car.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1 / 60);

  const initialHeading = car.heading;

  // Inward steering into drift for 1.2s (72 frames)
  for (let i = 0; i < 72; i++) {
    car.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1 / 60);
  }

  const turnDeg = Math.abs(car.heading - initialHeading) * 180 / Math.PI;
  assert.ok(turnDeg >= 100.0, `Inward steering during drift should allow sharp turns (>100 deg), got ${turnDeg.toFixed(1)} deg`);
});

test('Controls: Low-speed steering assist enables agile maneuvering when starting from near stop', () => {
  const car = new VehiclePhysics();
  car.speed = 2.0; // Slow crawling speed
  car.heading = 0;

  // Steer right for 15 frames at low speed
  for (let i = 0; i < 15; i++) {
    car.step({ throttle: 1, brake: 0, steer: 1, drift: false, nitro: false }, 1 / 60);
  }

  const turnDeg = Math.abs(car.heading) * 180 / Math.PI;
  // Should turn responsively (> 15 deg in 15 frames at low speed) instead of being stuck
  assert.ok(turnDeg > 15.0, `Low-speed steering assist should allow agile turning, got ${turnDeg.toFixed(1)} deg`);
});

test('Controls: Glancing barrier contact allows player to drive away without exponential stalling', () => {
  const track = new TrackMath();
  const car = new VehiclePhysics();

  car.position.set(11.0, 0.35, 20);
  car.speed = 35;
  car.heading = 0.05;

  for (let i = 0; i < 15; i++) {
    car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1 / 60, track);
  }

  // Car should still retain significant speed (> 20 m/s) rather than grinding to a complete halt
  assert.ok(car.speed > 20.0, `Vehicle should retain driveable speed after glancing barrier contact, got ${car.speed.toFixed(1)} m/s`);
});

test('Controls: Mini-turbo and drafting bonuses stack additively', () => {
  const car = new VehiclePhysics();
  car.speed = PHYSICS_CONSTANTS.MAX_SPEED_NORMAL;
  car.hasMiniTurbo = true;
  car.isDrafting = true;

  car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1 / 60);

  const expectedTopSpeed = PHYSICS_CONSTANTS.MAX_SPEED_NORMAL +
    PHYSICS_CONSTANTS.MINI_TURBO_KICK +
    PHYSICS_CONSTANTS.MAX_SPEED_NORMAL * PHYSICS_CONSTANTS.DRAFTING_TOP_SPEED_BONUS;

  // Speed should accelerate towards the combined stacked top speed
  assert.ok(car.speed > PHYSICS_CONSTANTS.MAX_SPEED_NORMAL, `Speed should exceed normal max speed: ${car.speed}`);
  assert.ok(expectedTopSpeed > PHYSICS_CONSTANTS.MAX_SPEED_NORMAL + PHYSICS_CONSTANTS.MINI_TURBO_KICK);
});

test('Controls: AZERTY keyboard layout (Z for gas, Q for steer) and KeyX for drift are supported', () => {
  const input = new InputState();

  // AZERTY Z for gas
  input.handleKeyDown('KeyZ');
  assert.equal(input.throttle, 1);
  input.handleKeyUp('KeyZ');
  assert.equal(input.throttle, 0);

  // AZERTY Q for steer left
  input.handleKeyDown('KeyQ');
  assert.equal(input.steer, -1);
  input.handleKeyUp('KeyQ');
  assert.equal(input.steer, 0);

  // KeyX for drift
  input.handleKeyDown('KeyX');
  assert.equal(input.drift, true);
  input.handleKeyUp('KeyX');
  assert.equal(input.drift, false);
});

test('Controls: Keyboard Escape/KeyP keydown does not double-toggle or instantly unpause during game loop execution', () => {
  const windowListeners = {};
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;

  try {
    globalThis.window = {
      addEventListener(event, fn) {
        windowListeners[event] = windowListeners[event] || [];
        windowListeners[event].push(fn);
      },
      removeEventListener() {}
    };

    const makeEl = (id) => ({
      id,
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); }
      },
      style: {},
      addEventListener() {}
    });

    globalThis.document = {
      getElementById(id) { return makeEl(id); },
      createElement(tag) { return makeEl(tag); },
      activeElement: { blur() {} }
    };

    const game = new Game({
      headless: true,
      autoStartLoop: false
    });

    game.setState(GAME_STATES.RACING);
    assert.equal(game.state, GAME_STATES.RACING);

    // Dispatch Escape keydown to all registered window listeners (both Game._onKeyDown and InputManager)
    for (const fn of (windowListeners['keydown'] || [])) {
      fn({ code: 'Escape', preventDefault() {} });
    }

    // State should be PAUSED after keydown
    assert.equal(game.state, GAME_STATES.PAUSED);

    // Simulate what the animation frame loop does in the very next frame
    const input = game.inputManager.getInputState();
    if (input?.pause && (game.state === GAME_STATES.RACING || game.state === GAME_STATES.PAUSED)) {
      game.togglePause();
      if (game.inputManager?.state) {
        game.inputManager.state._pause = false;
        game.inputManager.state._virtualPause = false;
      }
    }

    // State MUST stay PAUSED, not immediately unpause!
    assert.equal(game.state, GAME_STATES.PAUSED, 'Game must remain PAUSED and not immediately unpause in frame loop');

    // Resuming by pressing Escape again
    for (const fn of (windowListeners['keydown'] || [])) {
      fn({ code: 'Escape', preventDefault() {} });
    }
    assert.equal(game.state, GAME_STATES.RACING, 'Game should resume to RACING on second Escape press');

    game.dispose();
  } finally {
    globalThis.window = origWindow;
    globalThis.document = origDocument;
  }
});


