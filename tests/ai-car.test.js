import test from 'node:test';
import assert from 'node:assert/strict';
import { AICarLogic, AICar } from '../js/entities/ai-car.js';
import { TrackMath, DEFAULT_TRACK_POINTS } from '../js/world/track-math.js';
import { CarConfig } from '../js/entities/car-builder.js';

// Minimal Three.js mock for testing AICar in headless Node.js
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

test('AICarLogic navigates track spline and applies rubberbanding', () => {
  const ai = new AICarLogic({ name: 'Apex Nova', baseSpeed: 48, laneOffset: 2.0 });

  // Simulate AI updates along track of length 1000m
  const trackLength = 1000;
  for (let i = 0; i < 60; i++) {
    ai.update(1/60, trackLength, 50); // player is at 50m
  }
  assert.ok(ai.distanceTraveled > 0, 'AI should advance forward');

  // Player far ahead -> rubberband boost
  ai.update(1/60, trackLength, 300);
  assert.ok(ai.currentSpeedTarget >= ai.baseSpeed, 'AI should speed up when player is ahead');

  // Player far behind -> rubberband ease
  ai.distanceTraveled = 300;
  ai.update(1/60, trackLength, 50);
  assert.ok(ai.currentSpeedTarget <= ai.baseSpeed, 'AI should ease slightly when player is far behind');
});

test('AICarLogic advances track distance and updates spline progress accurately', () => {
  const trackLength = 1200;
  const ai = new AICarLogic({ name: 'Cyber Phantom', baseSpeed: 50, laneOffset: 0 });
  
  assert.equal(ai.distanceTraveled, 0);
  assert.equal(ai.splineProgress, 0);
  assert.equal(ai.currentLap, 1);

  // 1 second of movement at base speed
  for (let i = 0; i < 60; i++) {
    ai.update(1/60, trackLength, 0);
  }

  assert.ok(ai.distanceTraveled > 40, `Distance should advance towards ~50m, got ${ai.distanceTraveled}`);
  const expectedProgress = ai.distanceTraveled / trackLength;
  assert.ok(Math.abs(ai.splineProgress - expectedProgress) < 0.001, 'Spline progress must match distance / trackLength');
});

test('AICarLogic counts laps monotonically when crossing track length', () => {
  const trackLength = 500;
  const ai = new AICarLogic({ name: 'Pulse Fury', baseSpeed: 50, laneOffset: 0 });

  ai.distanceTraveled = 490;
  ai.update(1/60, trackLength, 490);
  assert.equal(ai.currentLap, 1, 'Still on lap 1 before crossing 500m');

  // Advance across 500m
  ai.distanceTraveled = 510;
  ai.update(1/60, trackLength, 510);
  assert.equal(ai.currentLap, 2, 'Should advance to lap 2 upon crossing 500m');

  // Advance across 1000m
  ai.distanceTraveled = 1020;
  ai.update(1/60, trackLength, 1020);
  assert.equal(ai.currentLap, 3, 'Should advance to lap 3 upon crossing 1000m');
});

test('AICarLogic dynamic rubberbanding triggers boost when player leads by >80m and eases when behind by >80m', () => {
  const trackLength = 2000;
  const ai = new AICarLogic({ name: 'Apex Nova', baseSpeed: 48 });

  ai.distanceTraveled = 200;

  // Player within 80m (e.g. at 230m) -> normal target speed (rubberband neutral)
  ai.update(1/60, trackLength, 230);
  assert.equal(ai.isRubberbandBoosting, false);
  assert.equal(ai.isRubberbandEasing, false);
  assert.ok(Math.abs(ai.currentSpeedTarget - 48) < 0.1);

  // Player > 80m ahead (player at 320m, diff = +120m) -> boost
  ai.update(1/60, trackLength, 320);
  assert.equal(ai.isRubberbandBoosting, true);
  assert.ok(ai.currentSpeedTarget > 48, 'Should boost speed target when player leads by >80m');

  // Player > 80m behind (player at 80m, diff = -120m) -> ease
  ai.update(1/60, trackLength, 80);
  assert.equal(ai.isRubberbandEasing, true);
  assert.ok(ai.currentSpeedTarget < 48, 'Should ease speed target when player trails by >80m');
});

test('AICarLogic shifts lanes to avoid obstacles and rival vehicles ahead', () => {
  const trackLength = 2000;
  // AI starting in center lane (0m)
  const ai = new AICarLogic({ name: 'Vapor Blade', baseSpeed: 46, laneOffset: 0 });

  // Other vehicle directly ahead in same lane (15m ahead)
  const obstacleVehicle = {
    distanceTraveled: 115,
    laneOffset: 0,
    speed: 30
  };

  ai.distanceTraveled = 100;
  ai.laneOffset = 0;

  // Run update with obstacle
  ai.update(1/60, trackLength, 100, [obstacleVehicle]);

  // AI should have chosen an evasive lane (left or right, non-zero target)
  assert.notEqual(ai.targetLaneOffset, 0, 'AI must select an alternative lane to evade obstacle ahead');

  // Over several frames, current laneOffset should move toward targetLaneOffset
  const initialLane = ai.laneOffset;
  for (let i = 0; i < 30; i++) {
    ai.update(1/60, trackLength, 100, [obstacleVehicle]);
  }
  assert.ok(Math.abs(ai.laneOffset - initialLane) > 0.5, 'AI must transition laterally away from blocked lane');
});

test('AICarLogic initializes all 5 rival personalities from CarConfig.rivalPalettes', () => {
  assert.equal(CarConfig.rivalPalettes.length, 5);

  for (const rival of CarConfig.rivalPalettes) {
    const ai = new AICarLogic({
      name: rival.name,
      palette: rival
    });

    assert.equal(ai.name, rival.name);
    assert.ok(ai.baseSpeed > 40 && ai.baseSpeed < 55, `Base speed should be within racing range, got ${ai.baseSpeed}`);
    assert.ok(ai.aggression >= 0 && ai.aggression <= 1, 'Aggression must be normalized [0, 1]');
    assert.ok(typeof ai.laneOffset === 'number');
  }
});

test('AICar Three.js wrapper creates rival mesh, updates position, rotation, wheels and brake lights', () => {
  const mockThree = createMockThree();
  const track = new TrackMath(DEFAULT_TRACK_POINTS, 24);

  const rivalConfig = CarConfig.rivalPalettes[0]; // Apex Nova
  const aiCar = new AICar({
    three: mockThree,
    name: rivalConfig.name,
    palette: rivalConfig,
    track,
    baseSpeed: 48,
    laneOffset: 2.0,
    initialDistance: 50
  });

  assert.ok(aiCar.mesh, 'AICar must construct a Three.js root mesh');
  assert.equal(aiCar.name, 'Apex Nova');
  assert.ok(aiCar.position, 'AICar must expose position vector');
  assert.ok(aiCar.velocity, 'AICar must expose velocity vector');
  assert.ok(typeof aiCar.speed === 'number');
  assert.ok(typeof aiCar.splineProgress === 'number');
  assert.ok(typeof aiCar.currentLap === 'number');
  assert.ok(typeof aiCar.distanceTraveled === 'number');

  // Update along track
  const playerPos = { x: 0, y: 0, z: 100 };
  aiCar.update(1/60, track, playerPos, 100);

  // Position should be non-zero and follow track coordinates + lane offset
  assert.ok(aiCar.distanceTraveled > 50, 'Distance should advance');
  assert.ok(aiCar.mesh.position.y > 0, 'Mesh should rest above track elevation');

  // Wheels should rotate
  const wheel = aiCar.mesh.userData.wheels[0];
  assert.ok(wheel.rotation.x !== 0, 'Wheels must rotate with movement');

  // Brake lights function: obstacle within 10m triggers braking and taillight flare
  const obstacleAhead = {
    distanceTraveled: aiCar.distanceTraveled + 6, // 6m ahead (< 10m)
    laneOffset: aiCar.laneOffset,
    speed: 15
  };
  aiCar.update(1/60, track, playerPos, 100, [obstacleAhead]);
  assert.equal(aiCar.isBraking, true, 'isBraking must be true when obstacle is within 10m');
  const brakeLight = aiCar.mesh.userData.brakeLights[0];
  assert.equal(brakeLight.material.emissiveIntensity, 2.5, 'Brake light must flare when AI brakes');

  // Once obstacle clears, isBraking returns to false and brake lights turn off (0.4)
  aiCar.update(1/60, track, playerPos, 100, []);
  assert.equal(aiCar.isBraking, false, 'isBraking must return to false when obstacle clears');
  assert.equal(brakeLight.material.emissiveIntensity, 0.4, 'Brake light must return to idle intensity (0.4)');
});

test('AICarLogic activates isBraking with obstacle within 10m and automatically deactivates when clear', () => {
  const ai = new AICarLogic({ name: 'Apex Nova', baseSpeed: 48, laneOffset: 0 });
  const trackLength = 1000;
  ai.distanceTraveled = 200;
  ai.laneOffset = 0;

  // Obstacle ahead at 208m (8m ahead, within 10m in same lane)
  const obstacle = {
    distanceTraveled: 208,
    laneOffset: 0,
    speed: 20
  };

  ai.update(1/60, trackLength, 200, [obstacle]);
  assert.equal(ai.isBraking, true, 'isBraking should activate with obstacle within 10m');

  // Next frame: obstacle is removed / clear track
  ai.update(1/60, trackLength, 200, []);
  assert.equal(ai.isBraking, false, 'isBraking must return to false on next frame when track clears');
});

test('AICarLogic returns to preferred lane on clear track', () => {
  // Pulse Fury preferredLaneOffset is 0.0
  const ai = new AICarLogic({ name: 'Pulse Fury', baseSpeed: 46, laneOffset: 5.0 });
  const trackLength = 1000;
  assert.equal(ai.preferredLaneOffset, 0.0);
  assert.equal(ai.laneOffset, 5.0);

  // When track is clear, targetLaneOffset immediately relaxes to preferredLaneOffset
  ai.update(1/60, trackLength, 0, []);
  assert.equal(ai.targetLaneOffset, ai.preferredLaneOffset, 'targetLaneOffset must relax to preferredLaneOffset');

  // Over time, laneOffset smoothly shifts back towards 0.0
  for (let i = 0; i < 90; i++) {
    ai.update(1/60, trackLength, 0, []);
  }
  assert.ok(Math.abs(ai.laneOffset - 0.0) < 0.2, `laneOffset should have returned near 0.0, got ${ai.laneOffset}`);
});

test('AICarLogic enforces nitro cooldown and dt-scaled probability', () => {
  const ai = new AICarLogic({ name: 'Apex Nova', baseSpeed: 48 });
  const trackLength = 1000;
  ai.distanceTraveled = 100;
  assert.equal(ai.boostCooldown, 0);

  // Force nitro trigger by setting Math.random to return 0
  const originalRandom = Math.random;
  Math.random = () => 0; // guaranteed trigger when conditions met

  try {
    // playerDiff = 300 - 100 = 200 (> 120)
    ai.update(1/60, trackLength, 300);
    assert.equal(ai.isBoosting, true, 'Should trigger boost');
    assert.ok(ai.boostTimer > 1.9 && ai.boostTimer <= 2.0, `Boost timer should be ~2.0s minus dt, got ${ai.boostTimer}`);
    assert.ok(ai.boostCooldown > 5.9, `Boost cooldown should be set to 6.0s, got ${ai.boostCooldown}`);

    // Immediately after, even if player leads, nitro cannot trigger again due to cooldown & timer
    ai.isBoosting = false;
    ai.boostTimer = 0;
    // boostCooldown is still ~5.9s
    ai.update(1/60, trackLength, 300);
    assert.equal(ai.isBoosting, false, 'Should not trigger boost while on cooldown');

    // Simulate cooldown countdown
    for (let i = 0; i < 365; i++) {
      ai.update(1/60, trackLength, 100);
    }
    assert.ok(ai.boostCooldown <= 0, 'Boost cooldown should expire after 6 seconds');
  } finally {
    Math.random = originalRandom;
  }
});

test('AICar sets correct pitch orientation on incline (nose up) and decline (nose down)', () => {
  const mockThree = createMockThree();
  const mockTrackUphill = {
    totalLength: 1000,
    getSplinePoint: () => ({ x: 0, y: 10, z: 100 }),
    getSplineTangent: () => ({ x: 0, y: 0.3, z: 0.954 }), // uphill: positive tangent.y
    getNormalAt: () => ({ x: 1, y: 0, z: 0 })
  };

  const aiUphill = new AICar({
    three: mockThree,
    track: mockTrackUphill,
    initialDistance: 100
  });
  aiUphill.update(1/60, mockTrackUphill, null, 100);
  assert.ok(aiUphill.mesh.rotation.x < 0, `Positive tangent.y (uphill) must produce negative pitch (-X rotation), got ${aiUphill.mesh.rotation.x}`);

  const mockTrackDownhill = {
    totalLength: 1000,
    getSplinePoint: () => ({ x: 0, y: 10, z: 100 }),
    getSplineTangent: () => ({ x: 0, y: -0.3, z: 0.954 }), // downhill: negative tangent.y
    getNormalAt: () => ({ x: 1, y: 0, z: 0 })
  };

  const aiDownhill = new AICar({
    three: mockThree,
    track: mockTrackDownhill,
    initialDistance: 100
  });
  aiDownhill.update(1/60, mockTrackDownhill, null, 100);
  assert.ok(aiDownhill.mesh.rotation.x > 0, `Negative tangent.y (downhill) must produce positive pitch (+X rotation), got ${aiDownhill.mesh.rotation.x}`);
});

test('AICarLogic and AICar handle null playerPosition and negative distance cleanly', () => {
  const ai = new AICarLogic({ name: 'Cyber Phantom', baseSpeed: 50 });
  const track = { totalLength: 1000 };

  // Call update(dt, track, null, playerDistance)
  ai.distanceTraveled = 100;
  ai.update(1/60, track, null, 250); // playerDiff = 150 (> 80)
  assert.equal(ai.isRubberbandBoosting, true, 'Should parse playerDistance correctly even when playerPosition is null');

  // Test resetToTrack with negative distance
  const mockThree = createMockThree();
  const trackMath = new TrackMath(DEFAULT_TRACK_POINTS, 24);
  const aiCar = new AICar({ three: mockThree, track: trackMath });

  aiCar.resetToTrack(trackMath, -50);
  assert.ok(aiCar.splineProgress >= 0 && aiCar.splineProgress < 1, `splineProgress must be in [0, 1) for negative distance, got ${aiCar.splineProgress}`);
  const trackLen = trackMath.totalLength;
  const expected = (((-50 % trackLen) + trackLen) % trackLen) / trackLen;
  assert.ok(Math.abs(aiCar.splineProgress - expected) < 0.0001);
});
