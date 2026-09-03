import test from 'node:test';
import assert from 'node:assert/strict';
import { InputState, InputManager } from '../js/core/input.js';
import { CameraController, CAMERA_MODES, CAMERA_PRESETS } from '../js/core/camera.js';

// Minimal mock camera for headless testing
function createMockCamera(initialFov = 60) {
  return {
    fov: initialFov,
    position: {
      x: 0,
      y: 0,
      z: 0,
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
      },
      clone() {
        return { x: this.x, y: this.y, z: this.z };
      },
      copy(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
      }
    },
    rotation: {
      x: 0,
      y: 0,
      z: 0,
      set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
      }
    },
    lookAtTarget: null,
    lookAt(x, y, z) {
      if (typeof x === 'object' && x !== null) {
        this.lookAtTarget = { x: x.x, y: x.y, z: x.z };
      } else {
        this.lookAtTarget = { x, y, z };
      }
    },
    projectionUpdated: false,
    updateProjectionMatrix() {
      this.projectionUpdated = true;
    }
  };
}

// ------------------------------------------------------------
// 1. InputState Unit Tests
// ------------------------------------------------------------

test('InputState maps keys to driving actions', () => {
  const input = new InputState();
  input.handleKeyDown('KeyW');
  assert.equal(input.throttle, 1);

  input.handleKeyDown('Space');
  assert.equal(input.drift, true);

  input.handleKeyDown('ShiftLeft');
  assert.equal(input.nitro, true);

  input.handleKeyUp('KeyW');
  assert.equal(input.throttle, 0);

  input.handleKeyUp('Space');
  assert.equal(input.drift, false);

  input.handleKeyUp('ShiftLeft');
  assert.equal(input.nitro, false);
});

test('InputState handles Arrow keys, reverse/brake, and steering', () => {
  const input = new InputState();

  // ArrowUp for throttle
  input.handleKeyDown('ArrowUp');
  assert.equal(input.throttle, 1);
  input.handleKeyUp('ArrowUp');
  assert.equal(input.throttle, 0);

  // KeyS and ArrowDown for brake
  input.handleKeyDown('KeyS');
  assert.equal(input.brake, 1);
  input.handleKeyUp('KeyS');
  assert.equal(input.brake, 0);

  input.handleKeyDown('ArrowDown');
  assert.equal(input.brake, 1);
  input.handleKeyUp('ArrowDown');
  assert.equal(input.brake, 0);

  // Steer Left (KeyA / ArrowLeft -> -1)
  input.handleKeyDown('KeyA');
  assert.equal(input.steer, -1);

  // Both steer left and right held -> steer neutral (0)
  input.handleKeyDown('KeyD');
  assert.equal(input.steer, 0);

  // Release left -> steer right (1)
  input.handleKeyUp('KeyA');
  assert.equal(input.steer, 1);
  input.handleKeyUp('KeyD');
  assert.equal(input.steer, 0);

  // Arrow keys for steering
  input.handleKeyDown('ArrowLeft');
  assert.equal(input.steer, -1);
  input.handleKeyUp('ArrowLeft');

  input.handleKeyDown('ArrowRight');
  assert.equal(input.steer, 1);
  input.handleKeyUp('ArrowRight');
  assert.equal(input.steer, 0);
});

test('InputState handles single-press pulses: C (switchCam), R (reset), Escape/P (pause)', () => {
  const input = new InputState();

  // Switch camera pulse
  input.handleKeyDown('KeyC');
  assert.equal(input.switchCam, true);
  input.resetPulses();
  assert.equal(input.switchCam, false);

  // Reset car pulse
  input.handleKeyDown('KeyR');
  assert.equal(input.reset, true);
  input.resetPulses();
  assert.equal(input.reset, false);

  // Pause pulse via Escape
  input.handleKeyDown('Escape');
  assert.equal(input.pause, true);
  input.resetPulses();
  assert.equal(input.pause, false);

  // Pause pulse via KeyP
  input.handleKeyDown('KeyP');
  assert.equal(input.pause, true);
  input.resetPulses();
  assert.equal(input.pause, false);
});

test('InputState supports virtual controls and getState snapshot', () => {
  const input = new InputState();

  input.setThrottle(0.8);
  input.setBrake(0.5);
  input.setSteer(-0.6);
  input.setDrift(true);
  input.setNitro(true);
  input.triggerSwitchCam();
  input.triggerReset();
  input.triggerPause();

  const state = input.getState();
  assert.equal(state.throttle, 0.8);
  assert.equal(state.brake, 0.5);
  assert.equal(state.steer, -0.6);
  assert.equal(state.drift, true);
  assert.equal(state.nitro, true);
  assert.equal(state.switchCam, true);
  assert.equal(state.reset, true);
  assert.equal(state.pause, true);

  input.resetPulses();
  assert.equal(input.switchCam, false);
  assert.equal(input.reset, false);
  assert.equal(input.pause, false);
  // Continuous inputs stay set
  assert.equal(input.throttle, 0.8);

  input.resetAll();
  assert.equal(input.throttle, 0);
  assert.equal(input.brake, 0);
  assert.equal(input.steer, 0);
  assert.equal(input.drift, false);
  assert.equal(input.nitro, false);
});

test('InputManager provides input state and handles lifecycle gracefully in Node', () => {
  const manager = new InputManager({ enableTouch: false });
  const state = manager.getInputState();

  assert.ok(typeof state === 'object');
  assert.equal(state.throttle, 0);
  assert.equal(state.brake, 0);
  assert.equal(state.steer, 0);
  assert.equal(state.drift, false);
  assert.equal(state.nitro, false);

  // update resets pulses
  manager.state.triggerSwitchCam();
  assert.equal(manager.getInputState().switchCam, true);
  manager.update();
  assert.equal(manager.getInputState().switchCam, false);

  // dispose cleans up without errors
  manager.dispose();
});

// ------------------------------------------------------------
// 2. CameraController Unit Tests
// ------------------------------------------------------------

test('CameraController initializes with 3 modes and cycles via switchView()', () => {
  const camera = createMockCamera();
  const controller = new CameraController(camera);

  // Modes should match specification
  assert.equal(CAMERA_MODES.CHASE, 'CHASE');
  assert.equal(CAMERA_MODES.CLOSE, 'CLOSE');
  assert.equal(CAMERA_MODES.BUMPER, 'BUMPER');

  // Preset measurements check
  assert.ok(Math.abs(CAMERA_PRESETS[CAMERA_MODES.CHASE].distance - 7.5) < 0.1);
  assert.ok(Math.abs(CAMERA_PRESETS[CAMERA_MODES.CHASE].height - 2.8) < 0.1);
  assert.ok(Math.abs(CAMERA_PRESETS[CAMERA_MODES.CLOSE].distance - 5.0) < 0.1);
  assert.ok(Math.abs(CAMERA_PRESETS[CAMERA_MODES.CLOSE].height - 1.8) < 0.1);
  assert.ok(Math.abs(CAMERA_PRESETS[CAMERA_MODES.BUMPER].distance - 0.2) < 0.1);
  assert.ok(Math.abs(CAMERA_PRESETS[CAMERA_MODES.BUMPER].height - 0.9) < 0.1);

  // Initial mode is CHASE
  assert.equal(controller.currentMode, CAMERA_MODES.CHASE);

  // Cycle: CHASE -> CLOSE -> BUMPER -> CHASE
  controller.switchView();
  assert.equal(controller.currentMode, CAMERA_MODES.CLOSE);

  controller.switchView();
  assert.equal(controller.currentMode, CAMERA_MODES.BUMPER);

  controller.switchView();
  assert.equal(controller.currentMode, CAMERA_MODES.CHASE);

  // setMode
  controller.setMode(CAMERA_MODES.CLOSE);
  assert.equal(controller.currentMode, CAMERA_MODES.CLOSE);
});

test('CameraController follows target vehicle with velocity lag and lookahead', () => {
  const camera = createMockCamera();
  const controller = new CameraController(camera);

  // Target car positioned at (0, 0.35, 10) heading north (+Z)
  const targetCar = {
    physics: {
      position: { x: 0, y: 0.35, z: 10 },
      velocity: { x: 0, y: 0, z: 20 },
      heading: 0,
      speed: 20,
      isBoosting: false
    }
  };

  // Run initial snap / updates
  for (let i = 0; i < 30; i++) {
    controller.update(targetCar, 1 / 60);
  }

  // In CHASE mode with car at z=10, camera should lag behind (z < 10) and be elevated (y > 2.0)
  assert.ok(camera.position.z < 10, `Camera z should be behind car (< 10), got ${camera.position.z}`);
  assert.ok(camera.position.y >= 2.5, `Camera y should be elevated (~2.8m), got ${camera.position.y}`);

  // Look target should look ahead of vehicle (+Z direction)
  assert.ok(camera.lookAtTarget, 'Camera should have called lookAt');
  assert.ok(camera.lookAtTarget.z > 10, `LookAt z should be ahead of vehicle (> 10), got ${camera.lookAtTarget.z}`);
});

test('CameraController expands FOV dynamically on nitro boost and high speed', () => {
  const camera = createMockCamera(60);
  const controller = new CameraController(camera, { baseFov: 60, maxFov: 78 });

  const targetCar = {
    physics: {
      position: { x: 0, y: 0.35, z: 0 },
      heading: 0,
      speed: 10,
      isBoosting: false
    }
  };

  // Base state at low speed
  controller.update(targetCar, 1 / 60);
  assert.ok(Math.abs(camera.fov - 60) < 1.0, `Base FOV should be near 60, got ${camera.fov}`);

  // Activate nitro boost
  targetCar.physics.isBoosting = true;
  targetCar.physics.speed = 65;

  // Step 60 frames (~1.0s)
  for (let i = 0; i < 60; i++) {
    controller.update(targetCar, 1 / 60);
  }

  assert.ok(camera.fov > 72, `FOV should expand significantly on nitro (approaching 78), got ${camera.fov}`);
  assert.ok(camera.fov <= 78.1, `FOV must not exceed max FOV 78, got ${camera.fov}`);

  // Deactivate nitro boost and stop
  targetCar.physics.isBoosting = false;
  targetCar.physics.speed = 0;

  for (let i = 0; i < 60; i++) {
    controller.update(targetCar, 1 / 60);
  }

  assert.ok(camera.fov < 65, `FOV should decay back towards base FOV (60), got ${camera.fov}`);
});

test('CameraController trauma screen shake decays over time', () => {
  const camera = createMockCamera();
  const controller = new CameraController(camera, { traumaDecay: 2.0 });

  assert.equal(controller.trauma, 0);

  // Add trauma from collision
  controller.addTrauma(0.6);
  assert.equal(controller.trauma, 0.6);

  // Adding beyond 1.0 is clamped
  controller.addTrauma(0.8);
  assert.equal(controller.trauma, 1.0);

  const targetCar = {
    physics: {
      position: { x: 0, y: 0.35, z: 0 },
      heading: 0,
      speed: 0,
      isBoosting: false
    }
  };

  // Update with dt = 0.2s: trauma should decay (1.0 - 2.0 * 0.2 = 0.6)
  controller.update(targetCar, 0.2);
  assert.ok(Math.abs(controller.trauma - 0.6) < 0.05, `Trauma should decay to ~0.6, got ${controller.trauma}`);

  // Update for another 0.4s: trauma should decay to 0
  controller.update(targetCar, 0.4);
  assert.equal(controller.trauma, 0, `Trauma should be 0 after decay, got ${controller.trauma}`);
});

test('CameraController menu orbit mode rotates smoothly around center position', () => {
  const camera = createMockCamera();
  const controller = new CameraController(camera);

  const center = { x: 0, y: 0.35, z: 0 };
  controller.setMenuMode(true, center);
  assert.equal(controller.isMenuMode, true);

  // Step 1: Initial position on circle
  controller.update(null, 0.01);
  const dist1 = Math.hypot(camera.position.x - center.x, camera.position.z - center.z);
  assert.ok(dist1 > 4.0, `Camera orbit radius should be > 4m, got ${dist1}`);

  const x1 = camera.position.x;
  const z1 = camera.position.z;

  // Step 2: Advance time by 1.0s
  controller.update(null, 1.0);
  const x2 = camera.position.x;
  const z2 = camera.position.z;

  // Camera should have orbited (position changed along arc)
  assert.notEqual(x1, x2, 'Camera x position should change during orbit');
  assert.notEqual(z1, z2, 'Camera z position should change during orbit');

  // Camera should look towards center
  assert.ok(camera.lookAtTarget, 'Camera should look at center during menu orbit');
  assert.ok(Math.hypot(camera.lookAtTarget.x - center.x, camera.lookAtTarget.z - center.z) < 0.1);

  // Exit menu mode
  controller.setMenuMode(false);
  assert.equal(controller.isMenuMode, false);
});
