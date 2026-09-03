import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleSystem } from '../js/world/particles.js';
import { Environment } from '../js/world/environment.js';

// Minimal Three.js mock for testing ParticleSystem and Environment in headless Node.js
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
    add(v) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }
    sub(v) {
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
      return this;
    }
    multiplyScalar(s) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }
    normalize() {
      const len = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= len;
      this.y /= len;
      this.z /= len;
      return this;
    }
    dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }
    crossVectors(a, b) {
      const ax = a.x, ay = a.y, az = a.z;
      const bx = b.x, by = b.y, bz = b.z;
      this.x = ay * bz - az * by;
      this.y = az * bx - ax * bz;
      this.z = ax * by - ay * bx;
      return this;
    }
    length() {
      return Math.hypot(this.x, this.y, this.z);
    }
  }

  class Color {
    constructor(val = 0) {
      this.r = 0;
      this.g = 0;
      this.b = 0;
      this.set(val);
    }
    set(val) {
      if (typeof val === 'number') {
        this.r = ((val >> 16) & 255) / 255;
        this.g = ((val >> 8) & 255) / 255;
        this.b = (val & 255) / 255;
      } else if (typeof val === 'string') {
        const hex = parseInt(val.replace('#', ''), 16);
        this.r = ((hex >> 16) & 255) / 255;
        this.g = ((hex >> 8) & 255) / 255;
        this.b = (hex & 255) / 255;
      } else if (val && typeof val.r === 'number') {
        this.r = val.r;
        this.g = val.g;
        this.b = val.b;
      }
      return this;
    }
    getHex() {
      return ((Math.round(this.r * 255) << 16) |
              (Math.round(this.g * 255) << 8) |
               Math.round(this.b * 255)) >>> 0;
    }
    getHexString() {
      return this.getHex().toString(16).padStart(6, '0');
    }
  }

  class Object3D {
    constructor() {
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.scale = new Vector3(1, 1, 1);
      this.children = [];
      this.parent = null;
      this.visible = true;
    }
    add(...objs) {
      for (const o of objs) {
        this.children.push(o);
        o.parent = this;
      }
      return this;
    }
    remove(...objs) {
      for (const o of objs) {
        const idx = this.children.indexOf(o);
        if (idx !== -1) {
          this.children.splice(idx, 1);
          o.parent = null;
        }
      }
      return this;
    }
  }

  class Scene extends Object3D {
    constructor() {
      super();
      this.fog = null;
      this.background = null;
    }
  }

  class Group extends Object3D {
    constructor() {
      super();
      this.isGroup = true;
    }
  }

  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.count = array.length / itemSize;
      this.needsUpdate = false;
    }
    setXYZ(index, x, y, z) {
      const i = index * this.itemSize;
      this.array[i] = x;
      this.array[i + 1] = y;
      this.array[i + 2] = z;
    }
  }

  class BufferGeometry {
    constructor() {
      this.attributes = {};
      this.boundingSphere = null;
    }
    setAttribute(name, attribute) {
      this.attributes[name] = attribute;
      return this;
    }
    getAttribute(name) {
      return this.attributes[name];
    }
    computeBoundingSphere() {
      this.boundingSphere = { radius: 1000, center: new Vector3() };
    }
    dispose() {}
  }

  class PlaneGeometry extends BufferGeometry {
    constructor(w = 1, h = 1, segW = 1, segH = 1) {
      super();
      this.parameters = { width: w, height: h, widthSegments: segW, heightSegments: segH };
      const vertexCount = (segW + 1) * (segH + 1);
      this.attributes.position = new BufferAttribute(new Float32Array(vertexCount * 3), 3);
    }
  }

  class Material {
    constructor(params = {}) {
      this.transparent = !!params.transparent;
      this.opacity = params.opacity ?? 1.0;
      this.depthWrite = params.depthWrite ?? true;
      this.blending = params.blending ?? 0;
      this.vertexColors = !!params.vertexColors;
      this.wireframe = !!params.wireframe;
      this.color = new Color(params.color ?? 0xffffff);
      if (params.emissive !== undefined) {
        this.emissive = new Color(params.emissive);
        this.emissiveIntensity = params.emissiveIntensity ?? 1.0;
      }
    }
    dispose() {}
  }

  class MeshBasicMaterial extends Material {}
  class MeshLambertMaterial extends Material {}
  class PointsMaterial extends Material {
    constructor(params = {}) {
      super(params);
      this.size = params.size ?? 1.0;
      this.sizeAttenuation = params.sizeAttenuation ?? true;
    }
  }
  class LineBasicMaterial extends Material {}

  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.isMesh = true;
      this.geometry = geometry;
      this.material = material;
    }
  }

  class Points extends Object3D {
    constructor(geometry, material) {
      super();
      this.isPoints = true;
      this.geometry = geometry;
      this.material = material;
    }
  }

  class LineSegments extends Object3D {
    constructor(geometry, material) {
      super();
      this.isLineSegments = true;
      this.geometry = geometry;
      this.material = material;
    }
  }

  class GridHelper extends Object3D {
    constructor(size = 10, divisions = 10, color1 = 0x444444, color2 = 0x888888) {
      super();
      this.size = size;
      this.divisions = divisions;
      this.color1 = new Color(color1);
      this.color2 = new Color(color2);
    }
    dispose() {}
  }

  class DirectionalLight extends Object3D {
    constructor(color = 0xffffff, intensity = 1) {
      super();
      this.color = new Color(color);
      this.intensity = intensity;
      this.target = new Object3D();
    }
  }

  class AmbientLight extends Object3D {
    constructor(color = 0xffffff, intensity = 1) {
      super();
      this.color = new Color(color);
      this.intensity = intensity;
    }
  }

  class FogExp2 {
    constructor(color, density = 0.00025) {
      this.color = new Color(color);
      this.density = density;
    }
  }

  class Fog {
    constructor(color, near = 1, far = 1000) {
      this.color = new Color(color);
      this.near = near;
      this.far = far;
    }
  }

  return {
    Vector3,
    Color,
    Object3D,
    Scene,
    Group,
    BufferAttribute,
    BufferGeometry,
    PlaneGeometry,
    Material,
    MeshBasicMaterial,
    MeshLambertMaterial,
    PointsMaterial,
    LineBasicMaterial,
    Mesh,
    Points,
    LineSegments,
    GridHelper,
    DirectionalLight,
    AmbientLight,
    FogExp2,
    Fog,
    AdditiveBlending: 2
  };
}

// -------------------------------------------------------------
// PARTICLE SYSTEM TESTS
// -------------------------------------------------------------

test('ParticleSystem initializes pre-allocated zero-GC pools', () => {
  const THREE = createMockThree();
  const scene = new THREE.Scene();

  const particles = new ParticleSystem(scene, { maxParticles: 800, THREE });

  assert.equal(particles.maxParticles, 800, 'Max particles should match configured limit');
  assert.equal(particles.activeCount, 0, 'Active count must initialize to 0');
  assert.equal(particles.freeCount, 800, 'Free count must equal max capacity');

  // Verify TypedArray buffers are pre-allocated
  assert.ok(particles.positions instanceof Float32Array, 'Positions must be Float32Array');
  assert.ok(particles.colors instanceof Float32Array, 'Colors must be Float32Array');
  assert.ok(particles.sizes instanceof Float32Array, 'Sizes must be Float32Array');
  assert.ok(particles.velocities instanceof Float32Array, 'Velocities must be Float32Array');
  assert.ok(particles.ages instanceof Float32Array, 'Ages must be Float32Array');
  assert.ok(particles.lifetimes instanceof Float32Array, 'Lifetimes must be Float32Array');

  assert.equal(particles.positions.length, 800 * 3);
  assert.equal(particles.colors.length, 800 * 3);

  // Points mesh must be added to scene
  assert.ok(particles.pointsMesh, 'Points mesh must be created');
  assert.ok(scene.children.includes(particles.pointsMesh), 'Points mesh must be attached to scene');
});

test('ParticleSystem.emitExhaust produces normal exhaust puffs and high-velocity nitro flame bursts', () => {
  const THREE = createMockThree();
  const scene = new THREE.Scene();
  const particles = new ParticleSystem(scene, { maxParticles: 500, THREE });

  const pos = { x: 0, y: 0.3, z: -2 };
  const vel = { x: 0, y: 0, z: 20 };

  // 1. Normal exhaust
  const emittedNormal = particles.emitExhaust(pos, vel, null, false);
  assert.ok(emittedNormal > 0, 'Should emit at least 1 particle for normal exhaust');
  const normalActive = particles.activeCount;
  assert.equal(normalActive, emittedNormal);

  // 2. High-energy nitro exhaust
  const emittedNitro = particles.emitExhaust(pos, vel, '#00f0ff', true);
  assert.ok(emittedNitro > emittedNormal, 'Nitro must emit more flame particles than normal exhaust');
  assert.equal(particles.activeCount, normalActive + emittedNitro);

  // Check attributes of recently emitted nitro particle
  const latestIdx = particles.lastAllocatedIndex;
  assert.ok(latestIdx >= 0 && latestIdx < particles.maxParticles);
  assert.equal(particles.active[latestIdx], 1, 'Particle at latest index must be marked active');
  assert.ok(particles.sizes[latestIdx] > 0, 'Particle must have non-zero size');
  assert.ok(particles.lifetimes[latestIdx] > 0, 'Particle must have non-zero lifetime');
});

test('ParticleSystem.emitDriftSparks emits sparks and smoke at tire contact patches', () => {
  const THREE = createMockThree();
  const scene = new THREE.Scene();
  const particles = new ParticleSystem(scene, { maxParticles: 500, THREE });

  const tirePos = { x: -0.85, y: 0.05, z: -1.3 };
  const tireVel = { x: 5, y: 0, z: 30 };

  const emitted = particles.emitDriftSparks(tirePos, tireVel, '#ffea00');
  assert.ok(emitted >= 2, 'Drift emission should generate multiple spark/smoke particles');
  assert.equal(particles.activeCount, emitted);

  // Check that sparks have gravity applied (downward acceleration flag)
  let foundSparkWithGravity = false;
  for (let i = 0; i < particles.maxParticles; i++) {
    if (particles.active[i] && particles.gravity[i] !== 0) {
      foundSparkWithGravity = true;
      break;
    }
  }
  assert.ok(foundSparkWithGravity, 'Drift sparks must simulate gravity for realistic ground bounce/fall');
});

test('ParticleSystem.update advances simulation, applies drag/gravity, and recycles expired particles without GC', () => {
  const THREE = createMockThree();
  const scene = new THREE.Scene();
  const particles = new ParticleSystem(scene, { maxParticles: 100, THREE });

  particles.emitExhaust({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 10 }, null, false);
  const initialCount = particles.activeCount;
  assert.ok(initialCount > 0);

  // Capture position before update
  const idx = particles.lastAllocatedIndex;
  const initialZ = particles.positions[idx * 3 + 2];

  // Update small dt
  particles.update(0.016);
  const updatedZ = particles.positions[idx * 3 + 2];
  assert.notEqual(updatedZ, initialZ, 'Particle position must change on update');
  assert.ok(particles.ages[idx] > 0, 'Particle age must increase');

  // Fast forward beyond particle lifetime to trigger recycling
  particles.update(2.0); // 2 seconds exceeds exhaust lifetime
  assert.equal(particles.activeCount, 0, 'All particles should be recycled when lifetime expires');
  assert.equal(particles.freeCount, 100, 'Free count must be restored to maximum capacity');
  assert.equal(particles.active[idx], 0, 'Expired particle must be inactive');
});

test('ParticleSystem bounds and speed streak lines activate at high velocity', () => {
  const THREE = createMockThree();
  const scene = new THREE.Scene();
  const particles = new ParticleSystem(scene, { maxParticles: 100, speedLineCount: 40, THREE });

  const camPos = { x: 0, y: 2, z: 0 };
  const camForward = { x: 0, y: 0, z: 1 };

  // Speed lines inactive
  particles.updateSpeedLines(camPos, camForward, false);
  assert.equal(particles.speedLinesActive, false, 'Speed lines should be inactive');
  assert.equal(particles.speedLinesMesh.visible, false, 'Speed lines mesh should be hidden when inactive');

  // Speed lines active (e.g. speed > 180 km/h or nitro boost)
  particles.updateSpeedLines(camPos, camForward, true);
  assert.equal(particles.speedLinesActive, true, 'Speed lines should be active');
  assert.equal(particles.speedLinesMesh.visible, true, 'Speed lines mesh should be visible when active');

  // Also support emitSpeedLines alias from brief
  particles.emitSpeedLines(camPos, true);
  assert.equal(particles.speedLinesActive, true);
});

test('ParticleSystem handles pool saturation cleanly without exceeding capacity', () => {
  const THREE = createMockThree();
  const scene = new THREE.Scene();
  const particles = new ParticleSystem(scene, { maxParticles: 20, THREE });

  // Try emitting more than capacity (20)
  for (let i = 0; i < 10; i++) {
    particles.emitExhaust({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, null, true);
  }

  assert.equal(particles.activeCount, 20, 'Active count must not exceed max capacity 20');
  assert.equal(particles.freeCount, 0, 'Free count should reach 0 under full load');

  // Next emit should return 0 particles emitted without throwing
  const overflowEmitted = particles.emitExhaust({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, null, false);
  assert.equal(overflowEmitted, 0, 'Should drop emission when pool is fully saturated');
});

// -------------------------------------------------------------
// ENVIRONMENT TESTS
// -------------------------------------------------------------

test('Environment.create builds synthwave sky, lighting, fog, sun, wireframe mountains, and ground grid', () => {
  const THREE = createMockThree();
  const scene = new THREE.Scene();

  const env = Environment.create(scene, { THREE });

  // 1. Fog & Scene Background
  assert.ok(scene.fog, 'Scene fog must be configured');
  assert.equal(scene.fog.color.getHex(), 0x060212, 'Fog color must be synthwave #060212');
  assert.ok(scene.background, 'Scene background must be configured');
  assert.equal(scene.background.getHex(), 0x060212, 'Scene background must match deep synthwave #060212');

  // 2. Lighting
  assert.ok(env.lights.ambient, 'Ambient light must be present');
  assert.ok(env.lights.sunLight, 'Directional sun light must be present');

  // 3. Slatted Synthwave Sun
  assert.ok(env.sun, 'Sun mesh/group must be created');
  assert.ok(env.sun.slats && env.sun.slats.length > 0, 'Sun must feature segmented horizontal blinds/slats');
  assert.ok(env.sun.glow, 'Sun must have a glowing halo/corona');

  // 4. Procedural Wireframe Horizon Mountain Ridges
  assert.ok(env.mountains, 'Wireframe mountains must be created');
  assert.ok(env.mountains.layers && env.mountains.layers.length >= 2, 'Mountains should have multiple depth layers');
  for (const layer of env.mountains.layers) {
    assert.equal(layer.material.wireframe, true, 'Mountain ridges must use wireframe rendering');
  }

  // 5. Infinite Perspective Ground Grid
  assert.ok(env.grid, 'Ground grid must be created');
  assert.ok(env.grid.mesh, 'Ground grid mesh must exist');

  // 6. Update pulsation
  const initialScaleY = env.sun.group.scale.y;
  env.update(1.5, 0.016);
  assert.ok(typeof env.sun.group.scale.y === 'number');
});

test('Environment and ParticleSystem handle clean disposal without errors', () => {
  const THREE = createMockThree();
  const scene = new THREE.Scene();

  const env = Environment.create(scene, { THREE });
  const particles = new ParticleSystem(scene, { maxParticles: 100, THREE });

  assert.doesNotThrow(() => {
    particles.dispose();
    env.dispose();
  }, 'Disposal of environment and particles must not throw');
});
