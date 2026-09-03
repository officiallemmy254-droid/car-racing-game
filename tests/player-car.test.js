import test from 'node:test';
import assert from 'node:assert/strict';
import { VehiclePhysics, PlayerCar } from '../js/entities/player-car.js';
import { TrackMath, DEFAULT_TRACK_POINTS } from '../js/world/track-math.js';
import { CarConfig } from '../js/entities/car-builder.js';

// Minimal Three.js mock for testing PlayerCar in headless Node.js
function createMockThree() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    copy(v) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }
    length() {
      return Math.hypot(this.x, this.y, this.z);
    }
    applyEuler(euler) {
      // Simple rotation around Y axis for heading
      const cosY = Math.cos(euler.y);
      const sinY = Math.sin(euler.y);
      const x = this.x * cosY + this.z * sinY;
      const z = -this.x * sinY + this.z * cosY;
      this.x = x;
      this.z = z;
      return this;
    }
    add(v) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }
  }

  class Euler {
    constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
      this.x = x;
      this.y = y;
      this.z = z;
      this.order = order;
    }
    set(x, y, z, order = this.order) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.order = order;
      return this;
    }
  }

  class Color {
    constructor(val = 0) {
      this.set(val);
    }
    set(val) {
      this.value = val;
      return this;
    }
    getHex() {
      if (typeof this.value === 'number') return this.value;
      if (typeof this.value === 'string') return parseInt(this.value.replace('#', ''), 16);
      return 0;
    }
  }

  class Object3D {
    constructor() {
      this.name = '';
      this.position = new Vector3();
      this.rotation = new Euler();
      this.scale = new Vector3(1, 1, 1);
      this.children = [];
      this.userData = {};
      this.castShadow = false;
      this.receiveShadow = false;
    }
    add(...objs) {
      for (const obj of objs) {
        this.children.push(obj);
        obj.parent = this;
      }
      return this;
    }
    localToWorld(v) {
      const cloned = v.clone();
      cloned.applyEuler(this.rotation);
      cloned.add(this.position);
      return cloned;
    }
  }

  class Group extends Object3D {
    constructor() {
      super();
      this.isGroup = true;
    }
  }

  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.isMesh = true;
      this.geometry = geometry;
      this.material = material;
    }
  }

  class BufferGeometry {
    constructor() {
      this.attributes = {};
    }
  }

  class BoxGeometry extends BufferGeometry {
    constructor(w = 1, h = 1, d = 1) {
      super();
      this.parameters = { width: w, height: h, depth: d };
    }
  }

  class CylinderGeometry extends BufferGeometry {
    constructor(rTop = 1, rBot = 1, h = 1, seg = 8) {
      super();
      this.parameters = { radiusTop: rTop, radiusBottom: rBot, height: h, radialSegments: seg };
    }
  }

  class PlaneGeometry extends BufferGeometry {
    constructor(w = 1, h = 1) {
      super();
      this.parameters = { width: w, height: h };
    }
  }

  class Material {
    constructor(params = {}) {
      this.color = new Color(params.color ?? 0xffffff);
      this.transparent = !!params.transparent;
      this.opacity = params.opacity ?? 1.0;
      this.side = params.side ?? 0;
      this.depthWrite = params.depthWrite ?? true;
      Object.assign(this, params);
    }
  }

  class MeshStandardMaterial extends Material {
    constructor(params = {}) {
      super(params);
      this.isMeshStandardMaterial = true;
      this.roughness = params.roughness ?? 0.5;
      this.metalness = params.metalness ?? 0.5;
      this.emissive = new Color(params.emissive ?? 0x000000);
      this.emissiveIntensity = params.emissiveIntensity ?? 1.0;
    }
  }

  class MeshBasicMaterial extends Material {
    constructor(params = {}) {
      super(params);
      this.isMeshBasicMaterial = true;
    }
  }

  return {
    Vector3,
    Euler,
    Color,
    Object3D,
    Group,
    Mesh,
    BufferGeometry,
    BoxGeometry,
    CylinderGeometry,
    PlaneGeometry,
    Material,
    MeshStandardMaterial,
    MeshBasicMaterial,
    DoubleSide: 2
  };
}

test('VehiclePhysics accelerates up to top speed and respects braking', () => {
  const car = new VehiclePhysics();

  // Accelerate for 3 seconds
  for (let i = 0; i < 180; i++) {
    car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1/60);
  }
  assert.ok(car.speed > 25, 'Car should have accelerated above 25 m/s');
  assert.ok(car.speed <= 52.8 + 0.1, 'Car must not exceed max regular top speed without nitro');

  // Activate nitro
  car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: true }, 1/60);
  assert.equal(car.isBoosting, true);

  // Brake
  for (let i = 0; i < 60; i++) {
    car.step({ throttle: 0, brake: 1, steer: 0, drift: false, nitro: false }, 1/60);
  }
  assert.ok(car.speed < 20, 'Car should decelerate quickly under braking');
});

test('VehiclePhysics triggers drift state on handbrake at speed and accumulates nitro', () => {
  const car = new VehiclePhysics();
  car.speed = 35;
  car.nitroLevel = 20;

  car.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1/60);
  assert.equal(car.isDrifting, true);
  assert.ok(car.nitroLevel > 20, 'Drifting should recharge nitro gauge');
});

test('VehiclePhysics accelerates up to regular top speed 52.8 m/s and nitro boost reaches 68.1 m/s with consumption', () => {
  const car = new VehiclePhysics();

  // Run full throttle for 400 frames to reach top speed
  for (let i = 0; i < 400; i++) {
    car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1/60);
  }
  assert.ok(car.speed >= 52.0 && car.speed <= 52.8 + 0.05, `Top speed should approach 52.8 m/s, got ${car.speed}`);

  // Activate nitro with full gauge
  car.nitroLevel = 100;
  for (let i = 0; i < 180; i++) {
    car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: true }, 1/60);
  }
  assert.ok(car.speed > 52.8, 'Nitro boost must exceed regular top speed');
  assert.ok(car.speed <= 68.1 + 0.1, `Nitro speed should be capped at 68.1 m/s, got ${car.speed}`);
  assert.ok(car.nitroLevel < 100, 'Nitro gauge must deplete while boosting');
  assert.ok(car.nitroLevel >= 0, 'Nitro gauge must not fall below 0');

  // Deplete all nitro
  for (let i = 0; i < 300; i++) {
    car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: true }, 1/60);
  }
  assert.equal(car.nitroLevel, 0);
  assert.equal(car.isBoosting, false, 'Boosting must stop when nitro is depleted');
});

test('VehiclePhysics braking decelerates at 42 m/s^2 and supports reverse speed max -12 m/s', () => {
  const car = new VehiclePhysics();
  car.speed = 42;

  // 1 second of full braking at 42 m/s^2
  for (let i = 0; i < 60; i++) {
    car.step({ throttle: 0, brake: 1, steer: 0, drift: false, nitro: false }, 1/60);
  }
  assert.ok(car.speed <= 1.0, `Speed should drop to ~0 m/s after 1s braking from 42 m/s, got ${car.speed}`);
  assert.equal(car.isBraking, true);

  // Continuing to hold brake / reverse at standstill moves backwards
  for (let i = 0; i < 120; i++) {
    car.step({ throttle: 0, brake: 1, steer: 0, drift: false, nitro: false }, 1/60);
  }
  assert.ok(car.speed < 0, 'Car should move in reverse when holding brake at standstill');
  assert.ok(car.speed >= -12.0 - 0.1, `Reverse speed must not exceed -12 m/s, got ${car.speed}`);

  // Applying forward throttle in reverse brakes forward
  for (let i = 0; i < 60; i++) {
    car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1/60);
  }
  assert.ok(car.speed >= 0, 'Applying throttle in reverse should bring car back to forward motion');
});

test('VehiclePhysics speed-sensitive steering and drift mechanics calculate oversteer', () => {
  const car = new VehiclePhysics();
  car.speed = 5;

  // Steering at low speed gives higher steering angle (~0.62 rad)
  car.step({ throttle: 1, brake: 0, steer: 1, drift: false, nitro: false }, 1/10);
  const lowSpeedSteer = car.steerAngle;
  assert.ok(lowSpeedSteer > 0.45, `Low speed steer should be high (up to 0.62), got ${lowSpeedSteer}`);

  // High speed attenuates steering down towards 0.22 rad
  const fastCar = new VehiclePhysics();
  fastCar.speed = 52.8;
  fastCar.step({ throttle: 1, brake: 0, steer: 1, drift: false, nitro: false }, 1/10);
  const highSpeedSteer = fastCar.steerAngle;
  assert.ok(highSpeedSteer < lowSpeedSteer, 'High speed steering angle must be attenuated');
  assert.ok(highSpeedSteer <= 0.35, `High speed steer should be attenuated, got ${highSpeedSteer}`);

  // Drift oversteer yaw angle
  fastCar.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1/30);
  assert.equal(fastCar.isDrifting, true);
  assert.ok(Math.abs(fastCar.driftAngle) > 0, 'Drift must create a non-zero oversteer angle');
});

test('VehiclePhysics awards mini-turbo boost kick on exiting sustained drift >= 1.2s', () => {
  const car = new VehiclePhysics();
  car.speed = 30;
  car.nitroLevel = 10;

  // Sustained drift for 1.3 seconds (78 frames at 60fps)
  for (let i = 0; i < 78; i++) {
    car.step({ throttle: 1, brake: 0, steer: 1, drift: true, nitro: false }, 1/60);
  }
  assert.equal(car.isDrifting, true);
  assert.ok(car.driftDuration >= 1.2, `Drift duration should be >= 1.2s, got ${car.driftDuration}`);

  const speedBeforeExit = car.speed;

  // Exit drift (release drift and steer)
  car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1/60);
  assert.equal(car.isDrifting, false);
  assert.equal(car.hasMiniTurbo, true, 'Exiting sustained drift must activate mini-turbo');
  assert.ok(car.speed > speedBeforeExit, 'Mini-turbo must provide an instant speed kick (+15 km/h)');
});

test('VehiclePhysics barrier collision applies 30% speed damping, separation, and reflection', () => {
  const track = new TrackMath();
  const car = new VehiclePhysics();

  // Position vehicle near track boundary (track width = 24m, half-width = 12m)
  // Spline start is (0,0,0) with tangent (0,0,1) and normal (1,0,0)
  // Set car position beyond half-width: x = 12.5 (penetrating left barrier)
  car.position.set(12.5, 0.35, 20);
  car.speed = 40;
  car.velocity.set(5, 0, 40);

  // Step with track collision check
  car.step({ throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, 1/60, track);

  assert.equal(car.hasCollidedBarrier, true, 'Barrier collision flag should be set');
  assert.ok(car.speed <= 40 * 0.75, `Speed should be damped by ~30% (<= 30 m/s), got ${car.speed}`);
  assert.ok(car.position.x < 12.5, `Car position must be pushed inward away from barrier, got x=${car.position.x}`);
});

test('VehiclePhysics resets cleanly to track centerline and heading on resetToTrack', () => {
  const track = new TrackMath();
  const car = new VehiclePhysics();

  // Place car off-track, rotated and drifting
  car.position.set(100, 20, 200);
  car.heading = Math.PI;
  car.speed = 30;
  car.isDrifting = true;
  car.hasMiniTurbo = true;

  car.resetToTrack(track);

  assert.equal(car.isDrifting, false);
  assert.equal(car.hasMiniTurbo, false);
  assert.equal(car.speed, 0);
  assert.equal(car.velocity.x, 0);
  assert.equal(car.velocity.z, 0);

  // Projected onto track: lateral distance to track center should be ~0
  const proj = track.projectPoint(car.position);
  assert.ok(Math.abs(proj.lateralDistance) < 0.1, `Car should be centered on track, got lateral ${proj.lateralDistance}`);
  assert.ok(Math.abs(car.position.y - (proj.trackPoint.y + 0.35)) < 0.01, 'Car height should rest on track');
});

test('PlayerCar integrates Three.js mesh, updates wheel steering, roll, and reactive brake lights', () => {
  const mockThree = createMockThree();
  const player = new PlayerCar({
    three: mockThree,
    palette: CarConfig.playerPalette,
    initialPosition: { x: 0, y: 0.35, z: 10 }
  });

  assert.ok(player.mesh, 'PlayerCar must have a Three.js root mesh');
  assert.equal(player.mesh.position.z, 10);
  assert.equal(player.speed, 0);

  // Steer and brake
  const input = { throttle: 0, brake: 1, steer: 0.8, drift: false, nitro: false };
  player.update(1/60, null, input);

  assert.equal(player.isBraking, true);
  assert.ok(player.physics.steerAngle > 0, 'Steering angle should be updated');

  // Verify wheel pivot steering in mesh
  const frontLeftPivot = player.mesh.userData.wheelPivots.frontLeft;
  assert.ok(frontLeftPivot.rotation.y > 0, 'Front wheel pivot must reflect steering yaw');

  // Taillight brake flare
  const brakeLight = player.mesh.userData.brakeLights[0];
  assert.equal(brakeLight.material.emissiveIntensity, 2.5, 'Taillights should flare during braking');
});

test('PlayerCar provides exhaust and tire positions for cameras and particle systems', () => {
  const mockThree = createMockThree();
  const player = new PlayerCar({
    three: mockThree,
    palette: CarConfig.playerPalette,
    initialPosition: { x: 10, y: 0.35, z: 50 }
  });

  const exhaustPositions = player.getExhaustPositions();
  assert.equal(exhaustPositions.length, 2, 'Should provide 2 exhaust positions');
  assert.ok(typeof exhaustPositions[0].x === 'number');
  assert.ok(typeof exhaustPositions[0].z === 'number');

  const tirePositions = player.getRearTirePositions();
  assert.equal(tirePositions.length, 2, 'Should provide 2 rear tire positions');

  const headingVec = player.getHeadingVector();
  assert.ok(Math.abs(Math.hypot(headingVec.x, headingVec.z) - 1.0) < 0.01, 'Heading vector should be normalized');

  assert.equal(player.getSpeed(), 0);
  assert.equal(player.getSpeedKmH(), 0);
  assert.equal(player.getNitroLevel(), 100);
});
