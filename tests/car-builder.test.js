import test from 'node:test';
import assert from 'node:assert/strict';
import { CarConfig, CarBuilder } from '../js/entities/car-builder.js';

// Minimal Three.js mock for testing CarBuilder in headless Node.js
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
  }

  class Euler {
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
    MeshStandardMaterial,
    MeshBasicMaterial,
    DoubleSide: 2
  };
}

test('CarConfig specifies valid dimensions and 5 AI rival color palettes', () => {
  assert.ok(CarConfig.dimensions.length > 0);
  assert.ok(CarConfig.dimensions.width > 0);
  assert.ok(CarConfig.dimensions.wheelRadius > 0);
  assert.equal(CarConfig.rivalPalettes.length, 5, 'Must define 5 distinct AI rival palettes');

  for (const rival of CarConfig.rivalPalettes) {
    assert.ok(rival.name, 'AI rival must have a name');
    assert.ok(rival.primaryColor, 'AI rival must have a primary color');
    assert.ok(rival.glowColor, 'AI rival must have a glow color');
  }
});

test('CarConfig dimensions closely match synthwave racer specification', () => {
  const d = CarConfig.dimensions;
  assert.ok(Math.abs(d.length - 4.4) < 0.2, `Length should be ~4.4m, got ${d.length}`);
  assert.ok(Math.abs(d.width - 2.0) < 0.2, `Width should be ~2.0m, got ${d.width}`);
  assert.ok(Math.abs(d.height - 1.1) < 0.2, `Height should be ~1.1m, got ${d.height}`);
  assert.ok(Math.abs(d.wheelRadius - 0.35) < 0.05, `Wheel radius should be ~0.35m, got ${d.wheelRadius}`);
  assert.ok(Math.abs(d.wheelbase - 2.6) < 0.2, `Wheelbase should be ~2.6m, got ${d.wheelbase}`);
  assert.ok(Math.abs(d.trackWidth - 1.7) < 0.2, `Track width should be ~1.7m, got ${d.trackWidth}`);
});

test('CarConfig defines player palette and 5 rival palettes matching spec colors', () => {
  // Player palette
  assert.ok(CarConfig.playerPalette, 'Must define playerPalette');
  assert.ok(CarConfig.playerPalette.primaryColor, 'Player must have primaryColor');
  assert.ok(CarConfig.playerPalette.accentColor, 'Player must have accentColor');
  assert.ok(CarConfig.playerPalette.glowColor, 'Player must have glowColor');

  // 5 AI rivals from spec: Apex Nova, Cyber Phantom, Neon Viper, Vapor Blade, Pulse Fury
  const rivals = CarConfig.rivalPalettes;
  const names = rivals.map(r => r.name);
  assert.ok(names.includes('Apex Nova'), 'Rival Apex Nova must be defined');
  assert.ok(names.includes('Cyber Phantom'), 'Rival Cyber Phantom must be defined');
  assert.ok(names.includes('Neon Viper'), 'Rival Neon Viper must be defined');
  assert.ok(names.includes('Vapor Blade'), 'Rival Vapor Blade must be defined');
  assert.ok(names.includes('Pulse Fury'), 'Rival Pulse Fury must be defined');

  const apex = rivals.find(r => r.name === 'Apex Nova');
  assert.match(apex.primaryColor.toString().toLowerCase(), /00f0ff/, 'Apex Nova must be Electric Cyan (#00f0ff)');

  const cyber = rivals.find(r => r.name === 'Cyber Phantom');
  assert.match(cyber.primaryColor.toString().toLowerCase(), /ff007f/, 'Cyber Phantom must be Laser Magenta (#ff007f)');

  const viper = rivals.find(r => r.name === 'Neon Viper');
  assert.match(viper.primaryColor.toString().toLowerCase(), /39ff14/, 'Neon Viper must be Toxic Lime (#39ff14)');

  const vapor = rivals.find(r => r.name === 'Vapor Blade');
  assert.match(vapor.primaryColor.toString().toLowerCase(), /ff6b08/, 'Vapor Blade must be Sunset Orange (#ff6b08)');

  const pulse = rivals.find(r => r.name === 'Pulse Fury');
  assert.match(pulse.primaryColor.toString().toLowerCase(), /9d00ff/, 'Pulse Fury must be Deep Violet (#9d00ff)');
});

test('CarBuilder.createCarMesh constructs full 3D synthwave sports car hierarchy', () => {
  const mockThree = createMockThree();

  const car = CarBuilder.createCarMesh({
    primaryColor: '#00f0ff',
    accentColor: '#ff007f',
    glowColor: '#00f0ff',
    isPlayer: true,
    THREE: mockThree
  });

  // Verify return interface contract
  assert.ok(car.root, 'Must return root group');
  assert.ok(car.wheels, 'Must return wheels array');
  assert.equal(car.wheels.length, 4, 'Must have 4 wheels (front-left, front-right, rear-left, rear-right)');
  assert.ok(car.brakeLights, 'Must return brakeLights array');
  assert.ok(car.brakeLights.length >= 1, 'Must have at least 1 brake light bar mesh');
  assert.ok(car.headlights, 'Must return headlights array');
  assert.equal(car.headlights.length, 2, 'Must have 2 headlights (left, right)');
  assert.ok(car.exhaustPipes, 'Must return exhaustPipes array');
  assert.equal(car.exhaustPipes.length, 2, 'Must have 2 exhaust pipe positions for nitro trails');

  // Verify exhaust pipe positions (rear facing: negative Z)
  for (const pipe of car.exhaustPipes) {
    assert.ok(pipe.z < -1.5, `Exhaust pipe must be at the rear of car (z < -1.5m), got z=${pipe.z}`);
    assert.ok(pipe.y > 0, `Exhaust pipe height must be above ground, got y=${pipe.y}`);
  }
  // Symmetric X coordinates
  assert.ok(Math.abs(car.exhaustPipes[0].x + car.exhaustPipes[1].x) < 0.05, 'Exhaust pipes should be symmetric about car center X');

  // Verify brake light control
  assert.equal(typeof car.setBraking, 'function', 'Must provide setBraking function');
  car.setBraking(false);
  const idleIntensity = car.brakeLights[0].material.emissiveIntensity;
  car.setBraking(true);
  const brakeIntensity = car.brakeLights[0].material.emissiveIntensity;
  assert.ok(brakeIntensity > idleIntensity, `Braking emissive intensity (${brakeIntensity}) must be greater than idle (${idleIntensity})`);

  // Verify front wheel steering pivots
  assert.ok(car.wheelPivots, 'Must return wheelPivots');
  assert.ok(car.wheelPivots.frontLeft, 'Must have frontLeft steer pivot');
  assert.ok(car.wheelPivots.frontRight, 'Must have frontRight steer pivot');

  // Steering angle can be applied to pivots
  car.wheelPivots.frontLeft.rotation.y = 0.35;
  assert.equal(car.wheelPivots.frontLeft.rotation.y, 0.35);

  // Underglow mesh
  assert.ok(car.underglow, 'Must include underglow mesh');
});
