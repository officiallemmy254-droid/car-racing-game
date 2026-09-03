import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GAME_STATES, MinimapRenderer } from '../js/main.js';
import { CarConfig } from '../js/entities/car-builder.js';
import { TrackMath } from '../js/world/track-math.js';
import { Track } from '../js/world/track.js';

// Minimal Three.js mock for headless integration testing
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
    addScaledVector(v, s) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
    }
    normalize() {
      const len = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= len;
      this.y /= len;
      this.z /= len;
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
  }

  class Object3D {
    constructor() {
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.scale = new Vector3(1, 1, 1);
      this.children = [];
      this.visible = true;
    }
    add(...objs) {
      for (const o of objs) this.children.push(o);
      return this;
    }
    remove(...objs) {
      for (const o of objs) {
        const idx = this.children.indexOf(o);
        if (idx !== -1) this.children.splice(idx, 1);
      }
      return this;
    }
    lookAt() {}
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

  class PerspectiveCamera extends Object3D {
    constructor(fov = 60, aspect = 16 / 9, near = 0.1, far = 2000) {
      super();
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
    }
    updateProjectionMatrix() {}
  }

  class WebGLRenderer {
    constructor() {
      this.domElement = { width: 1920, height: 1080 };
      this.shadowMap = { enabled: false, type: null };
    }
    setSize(w, h) {
      this.domElement.width = w;
      this.domElement.height = h;
    }
    setPixelRatio() {}
    render() {}
    dispose() {}
  }

  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
      this.needsUpdate = false;
    }
  }

  class Float32BufferAttribute extends BufferAttribute {}
  class Uint16BufferAttribute extends BufferAttribute {}
  class Uint32BufferAttribute extends BufferAttribute {}

  class BufferGeometry {
    constructor() {
      this.attributes = {};
    }
    setAttribute(name, attr) {
      this.attributes[name] = attr;
      return this;
    }
    computeVertexNormals() {}
    setIndex() {}
    dispose() {}
  }

  class Material {
    constructor() {
      this.opacity = 1;
      this.transparent = false;
    }
    dispose() {}
  }

  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry || new BufferGeometry();
      this.material = material || new Material();
    }
  }

  class Points extends Mesh {}
  class LineSegments extends Mesh {}
  class AmbientLight extends Object3D {}
  class DirectionalLight extends Object3D {
    constructor() {
      super();
      this.shadow = { mapSize: { width: 1024, height: 1024 }, camera: { near: 0.5, far: 500 } };
    }
  }

  class Fog {
    constructor(color, near, far) {
      this.color = new Color(color);
      this.near = near;
      this.far = far;
    }
  }

  class GridHelper extends Object3D {
    constructor() {
      super();
      this.material = new Material();
    }
  }

  class CanvasTexture {
    constructor() {
      this.needsUpdate = false;
    }
    dispose() {}
  }

  return {
    Vector3,
    Color,
    Object3D,
    Scene,
    Group,
    PerspectiveCamera,
    WebGLRenderer,
    BufferAttribute,
    Float32BufferAttribute,
    Uint16BufferAttribute,
    Uint32BufferAttribute,
    BufferGeometry,
    Mesh,
    Points,
    LineSegments,
    AmbientLight,
    DirectionalLight,
    Fog,
    GridHelper,
    CanvasTexture,
    MeshBasicMaterial: Material,
    MeshStandardMaterial: Material,
    PointsMaterial: Material,
    LineBasicMaterial: Material,
    BoxGeometry: BufferGeometry,
    CylinderGeometry: BufferGeometry,
    PlaneGeometry: BufferGeometry,
    SphereGeometry: BufferGeometry,
    PCFSoftShadowMap: 2,
    AdditiveBlending: 2,
    NormalBlending: 1,
    DoubleSide: 2,
    FrontSide: 0,
    BackSide: 1
  };
}

// Mock DOM elements helper
function createMockDOM() {
  const elements = {};

  const makeElement = (id, tagName = 'div') => {
    const el = {
      id,
      tagName: tagName.toUpperCase(),
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); },
        toggle(c) { if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c); }
      },
      style: {},
      _innerHTML: '',
      _textContent: '',
      get innerHTML() { return this._innerHTML; },
      set innerHTML(val) {
        this._innerHTML = String(val);
        this._textContent = String(val).replace(/<[^>]*>/g, '');
      },
      get textContent() { return this._textContent || this._innerHTML.replace(/<[^>]*>/g, ''); },
      set textContent(val) {
        this._textContent = String(val);
        this._innerHTML = String(val);
      },
      get innerText() { return this.textContent; },
      set innerText(val) { this.textContent = val; },
      listeners: {},
      addEventListener(evt, fn) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(fn);
      },
      removeEventListener(evt, fn) {
        if (this.listeners[evt]) {
          this.listeners[evt] = this.listeners[evt].filter(f => f !== fn);
        }
      },
      click() {
        if (this.listeners['click']) {
          for (const fn of this.listeners['click']) fn({ preventDefault() {} });
        }
      },
      appendChild(child) {
        if (!this.children) this.children = [];
        this.children.push(child);
      },
      querySelector(selector) {
        return null;
      },
      querySelectorAll() {
        return [];
      }
    };
    elements[id] = el;
    return el;
  };

  const canvasContextMock = {
    clearRect() {},
    beginPath() { this._path = []; },
    moveTo(x, y) { this._path.push(['M', x, y]); },
    lineTo(x, y) { this._path.push(['L', x, y]); },
    closePath() {},
    stroke() { this._strokes = (this._strokes || 0) + 1; },
    fill() { this._fills = (this._fills || 0) + 1; },
    arc(x, y, r) {
      this._arcs = this._arcs || [];
      this._arcs.push({ x, y, r });
    },
    save() {},
    restore() {},
    clip() {},
    setTransform() {},
    lineWidth: 1,
    strokeStyle: '#000',
    fillStyle: '#000',
    shadowBlur: 0,
    shadowColor: 'transparent',
    _path: [],
    _strokes: 0,
    _fills: 0,
    _arcs: []
  };

  const makeCanvas = (id, w = 800, h = 600) => {
    const el = makeElement(id, 'canvas');
    el.width = w;
    el.height = h;
    el.getContext = (type) => {
      if (type === '2d') return canvasContextMock;
      return null;
    };
    return el;
  };

  // Build required HUD & overlay elements matching index.html
  const gameCanvas = makeCanvas('game-canvas', 1920, 1080);
  const minimapCanvas = makeCanvas('minimap-canvas', 160, 160);
  const hudPosition = makeElement('hud-position');
  const hudLap = makeElement('hud-lap');
  const hudTimer = makeElement('hud-timer');
  const hudBestLap = makeElement('hud-best-lap');
  const hudSpeed = makeElement('hud-speed');
  const hudNitroFill = makeElement('hud-nitro-fill');
  const hudNotification = makeElement('hud-notification');
  const countdownOverlay = makeElement('countdown-overlay');
  countdownOverlay.classList.add('hidden');
  const countdownText = makeElement('countdown-text');
  const menuScreen = makeElement('menu-screen');
  const pauseScreen = makeElement('pause-screen');
  pauseScreen.classList.add('hidden');
  const finishScreen = makeElement('finish-screen');
  finishScreen.classList.add('hidden');
  const startBtn = makeElement('start-btn', 'button');
  const resumeBtn = makeElement('resume-btn', 'button');
  const restartBtn = makeElement('restart-btn', 'button');
  const finishTitle = makeElement('finish-title');
  const finishRankCallout = makeElement('finish-rank-callout');
  const leaderboardTable = makeElement('leaderboard-table', 'table');
  const leaderboardBody = makeElement('leaderboard-body', 'tbody');

  return {
    elements,
    canvasContextMock,
    getElementById(id) {
      return elements[id] || null;
    }
  };
}

// ============================================================================
// Integration Test Suite
// ============================================================================

test('Module export integrity: exports Game, GAME_STATES, and MinimapRenderer', () => {
  assert.ok(Game, 'Game class must be exported');
  assert.equal(typeof Game, 'function');
  assert.ok(GAME_STATES, 'GAME_STATES must be exported');
  assert.equal(GAME_STATES.MENU, 'MENU');
  assert.equal(GAME_STATES.COUNTDOWN, 'COUNTDOWN');
  assert.equal(GAME_STATES.RACING, 'RACING');
  assert.equal(GAME_STATES.PAUSED, 'PAUSED');
  assert.equal(GAME_STATES.FINISH, 'FINISH');
  assert.ok(MinimapRenderer, 'MinimapRenderer must be exported');
});

test('Game initializes subsystems, player car, and 5 AI rival cars on starting grid', () => {
  const mockThree = createMockThree();
  const mockDOM = createMockDOM();

  const game = new Game({
    three: mockThree,
    dom: mockDOM,
    headless: true,
    autoStartLoop: false
  });

  // Verify subsystems
  assert.ok(game.track, 'Track must be instantiated');
  assert.ok(game.environment, 'Environment must be instantiated');
  assert.ok(game.particleSystem, 'ParticleSystem must be instantiated');
  assert.ok(game.soundManager, 'SoundManager must be instantiated');
  assert.ok(game.inputManager, 'InputManager must be instantiated');
  assert.ok(game.cameraController, 'CameraController must be instantiated');
  assert.ok(game.raceManager, 'RaceManager must be instantiated');

  // Verify Player and Rivals
  assert.ok(game.playerCar, 'PlayerCar must be instantiated');
  assert.equal(Array.isArray(game.aiCars), true, 'aiCars must be an array');
  assert.equal(game.aiCars.length, 5, 'Must have 5 AI rival cars');

  // Verify 5 rival names from CarConfig
  const expectedNames = CarConfig.rivalPalettes.map(p => p.name);
  const actualNames = game.aiCars.map(c => c.name);
  assert.deepEqual(actualNames, expectedNames, 'AI rivals must match CarConfig.rivalPalettes in order');

  // Verify Staggered starting grid
  // Rivals should be placed ahead of player on track distance
  const playerDist = game.playerCar.physics.distanceAlongTrack;
  for (let i = 0; i < game.aiCars.length; i++) {
    const ai = game.aiCars[i];
    assert.ok(
      ai.logic.distanceTraveled > playerDist,
      `AI rival ${ai.name} (dist ${ai.logic.distanceTraveled}) should be ahead of player (dist ${playerDist})`
    );
  }

  // Initial state should be MENU
  assert.equal(game.state, GAME_STATES.MENU, 'Initial state must be MENU');
  assert.equal(game.cameraController.isMenuMode, true, 'Camera should be in menu orbit mode in MENU');
});

test('MinimapRenderer draws track loop path and live vehicle position blips', () => {
  const mockDOM = createMockDOM();
  const minimapCanvas = mockDOM.getElementById('minimap-canvas');
  const ctx = minimapCanvas.getContext('2d');

  const trackMath = new TrackMath();
  const renderer = new MinimapRenderer(minimapCanvas, trackMath);

  const playerCar = {
    position: { x: 0, y: 0, z: 20 },
    getSpeed: () => 30
  };

  const aiCars = [
    { name: 'Apex Nova', position: { x: 10, y: 0, z: 50 }, palette: { primaryColor: '#00f0ff' } },
    { name: 'Cyber Phantom', position: { x: -10, y: 0, z: 80 }, palette: { primaryColor: '#ff007f' } }
  ];

  ctx._strokes = 0;
  ctx._fills = 0;
  ctx._arcs = [];

  renderer.draw(playerCar, aiCars, 0);

  assert.ok(ctx._strokes > 0, 'Track loop path should be stroked');
  assert.ok(ctx._arcs.length >= 3, 'Should draw arcs for player and 2 AI blips');
  assert.ok(ctx._fills > 0, 'Vehicle blips should be filled');
});

test('State Machine: MENU -> COUNTDOWN -> RACING with beeps and camera transition', () => {
  const mockThree = createMockThree();
  const mockDOM = createMockDOM();

  const game = new Game({
    three: mockThree,
    dom: mockDOM,
    headless: true,
    autoStartLoop: false
  });

  const countdownOverlay = mockDOM.getElementById('countdown-overlay');
  const countdownText = mockDOM.getElementById('countdown-text');
  const menuScreen = mockDOM.getElementById('menu-screen');

  assert.equal(game.state, GAME_STATES.MENU);
  assert.equal(menuScreen.classList.contains('hidden'), false);

  // Trigger start
  game.startCountdown();

  assert.equal(game.state, GAME_STATES.COUNTDOWN);
  assert.equal(menuScreen.classList.contains('hidden'), true);
  assert.equal(countdownOverlay.classList.contains('hidden'), false);
  assert.equal(game.cameraController.isMenuMode, false, 'Camera should exit menu orbit');

  // Step countdown simulation: 0.0s -> 1.0s -> 2.0s -> 3.0s -> GO!
  game.updateCountdown(0.5);
  assert.equal(countdownText.textContent, '3');
  assert.equal(game.state, GAME_STATES.COUNTDOWN);

  game.updateCountdown(1.0);
  assert.equal(countdownText.textContent, '2');
  assert.equal(game.state, GAME_STATES.COUNTDOWN);

  game.updateCountdown(1.0);
  assert.equal(countdownText.textContent, '1');
  assert.equal(game.state, GAME_STATES.COUNTDOWN);

  game.updateCountdown(1.0);
  assert.equal(countdownText.textContent, 'GO!');
  assert.equal(game.state, GAME_STATES.RACING, 'Countdown completion transitions to RACING');
});

test('State Machine: RACING -> PAUSED -> RACING with input freeze', () => {
  const mockThree = createMockThree();
  const mockDOM = createMockDOM();

  const game = new Game({
    three: mockThree,
    dom: mockDOM,
    headless: true,
    autoStartLoop: false
  });

  game.setState(GAME_STATES.RACING);
  assert.equal(game.state, GAME_STATES.RACING);

  const pauseScreen = mockDOM.getElementById('pause-screen');

  // Pause the game
  game.togglePause();
  assert.equal(game.state, GAME_STATES.PAUSED);
  assert.equal(pauseScreen.classList.contains('hidden'), false);

  // During pause, stepPhysics does not advance car physics or timer
  const posBefore = { ...game.playerCar.physics.position };
  game.stepPhysics(1 / 60);
  assert.equal(game.playerCar.physics.position.x, posBefore.x);
  assert.equal(game.playerCar.physics.position.z, posBefore.z);

  // Resume the game
  game.togglePause();
  assert.equal(game.state, GAME_STATES.RACING);
  assert.equal(pauseScreen.classList.contains('hidden'), true);
});

test('State Machine: RACING -> FINISH populates leaderboard table and rank callout', () => {
  const mockThree = createMockThree();
  const mockDOM = createMockDOM();

  const game = new Game({
    three: mockThree,
    dom: mockDOM,
    headless: true,
    autoStartLoop: false
  });

  game.setState(GAME_STATES.RACING);

  const finishScreen = mockDOM.getElementById('finish-screen');
  const leaderboardBody = mockDOM.getElementById('leaderboard-body');
  const finishRank = mockDOM.getElementById('finish-rank-callout');

  // Trigger race finish
  game.finishRace();

  assert.equal(game.state, GAME_STATES.FINISH);
  assert.equal(finishScreen.classList.contains('hidden'), false);
  assert.ok(leaderboardBody.innerHTML.length > 0, 'Leaderboard HTML should be populated');
  assert.ok(finishRank.textContent.includes('PLACE') || finishRank.textContent.includes('1ST'), 'Finish rank should be displayed');
});

test('Fixed 60Hz physics step updates player, AI, particles, and HUD elements', () => {
  const mockThree = createMockThree();
  const mockDOM = createMockDOM();

  const game = new Game({
    three: mockThree,
    dom: mockDOM,
    headless: true,
    autoStartLoop: false
  });

  game.setState(GAME_STATES.RACING);

  // Set mock input to accelerate
  game.inputManager.state._virtualThrottle = 1.0;

  // Run 10 physics steps
  for (let i = 0; i < 10; i++) {
    game.stepPhysics(1 / 60);
  }

  // Player should have accelerated
  assert.ok(game.playerCar.getSpeed() > 0, 'Player car should accelerate with throttle');

  // Check HUD updates
  const hudSpeed = mockDOM.getElementById('hud-speed');
  const hudPosition = mockDOM.getElementById('hud-position');
  const hudLap = mockDOM.getElementById('hud-lap');
  const hudTimer = mockDOM.getElementById('hud-timer');

  assert.notEqual(hudSpeed.textContent, '0');
  assert.ok(hudPosition.textContent.includes('/6'));
  assert.ok(hudLap.textContent.includes('/3'));
  assert.notEqual(hudTimer.textContent, '00:00.00');
});

test('Restart race resets vehicle positions and returns to countdown', () => {
  const mockThree = createMockThree();
  const mockDOM = createMockDOM();

  const game = new Game({
    three: mockThree,
    dom: mockDOM,
    headless: true,
    autoStartLoop: false
  });

  game.setState(GAME_STATES.RACING);

  // Move vehicles
  game.inputManager.state._virtualThrottle = 1.0;
  for (let i = 0; i < 20; i++) {
    game.stepPhysics(1 / 60);
  }

  // Restart
  game.restartRace();

  // Should transition to COUNTDOWN
  assert.equal(game.state, GAME_STATES.COUNTDOWN);
  assert.equal(game.raceManager.currentLap, 1);
  assert.equal(game.playerCar.getSpeed(), 0);
});
