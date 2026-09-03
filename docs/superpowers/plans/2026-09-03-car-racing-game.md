# 3D Synthwave Circuit Racer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-performance 3D Synthwave Circuit Car Racing Game in the browser using Three.js, featuring arcade drift/nitro physics, 5 intelligent AI rivals, dynamic chase camera, procedural Web Audio soundscape, and real-time HUD and minimap.

**Architecture:** A modular ES6 architecture decoupled into a fixed 60Hz physics update loop and variable-rate WebGL rendering loop. Vehicles are procedurally constructed with custom Three.js geometries and glowing materials; audio and soundtrack are synthesized procedurally via the Web Audio API; racing circuits are generated from 3D Catmull-Rom splines with checkpoint verification and continuous barrier collision.

**Tech Stack:** JavaScript (ES6+ Modules), Three.js (r128 via CDN / ES module import), Web Audio API, HTML5 Canvas 2D (Minimap & Gauges), CSS3 (Synthwave Neon styling), Node.js `node:test` runner for logic verification.

## Global Constraints

- **Platform:** Modern desktop and mobile web browsers with WebGL support.
- **Dependencies:** Self-contained; Three.js loaded via standard ES module CDN (`https://unpkg.com/three@0.160.0/build/three.module.js`), zero large external binary 3D assets or audio files.
- **Audio Standards:** Continuous background music bed running at -18 dB with dynamic ducking during nitro and collisions. No dead silence gaps.
- **Framerate Target:** Rock-solid 60 FPS on standard hardware; physics step fixed at `dt = 1/60s`.
- **Race Format:** 6 cars total (1 player + 5 AI rivals), 3 laps per race, 8 checkpoints per lap with anti-cheat.
- **Physics Constants:** Normal top speed $52.8\text{ m/s}$ ($190\text{ km/h}$), Nitro top speed $68.1\text{ m/s}$ ($245\text{ km/h}$), reverse max $-12\text{ m/s}$, braking deceleration $42\text{ m/s}^2$.

---

### Task 1: Project Setup, Shell & Synthwave HUD Overlay

**Files:**
- Create: `C:\Users\SIR\car-racing-game\index.html`
- Create: `C:\Users\SIR\car-racing-game\css\style.css`
- Create: `C:\Users\SIR\car-racing-game\tests\shell.test.js`

**Interfaces:**
- Consumes: Browser DOM API.
- Produces: HTML container `#game-canvas`, HUD elements `#hud-position`, `#hud-lap`, `#hud-time`, `#hud-speed`, `#hud-nitro-bar`, `#minimap-canvas`, and UI overlays `#menu-screen`, `#pause-screen`, `#finish-screen`.

- [ ] **Step 1: Write test for HTML structure and DOM selectors**

```javascript
// tests/shell.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('index.html contains all essential HUD and UI overlay IDs', () => {
  const htmlPath = path.resolve('index.html');
  assert.ok(fs.existsSync(htmlPath), 'index.html must exist');
  const content = fs.readFileSync(htmlPath, 'utf8');

  const requiredIds = [
    'game-container',
    'game-canvas',
    'hud',
    'hud-position',
    'hud-lap',
    'hud-timer',
    'hud-best-lap',
    'hud-speed',
    'hud-nitro-fill',
    'minimap-canvas',
    'menu-screen',
    'start-btn',
    'countdown-overlay',
    'finish-screen',
    'leaderboard-table'
  ];

  for (const id of requiredIds) {
    assert.match(content, new RegExp(`id=["']${id}["']`), `Missing required ID: ${id}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shell.test.js`  
Expected: FAIL with "index.html must exist" or file not found.

- [ ] **Step 3: Implement index.html and css/style.css**

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>3D Synthwave Circuit Racer</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="game-container">
    <canvas id="game-canvas"></canvas>

    <!-- Top HUD Bar -->
    <div id="hud">
      <div class="hud-panel left">
        <div class="hud-label">POS</div>
        <div id="hud-position" class="hud-value neon-pink">1ST<span class="hud-sub">/6</span></div>
      </div>
      <div class="hud-panel center">
        <div class="hud-label">LAP</div>
        <div id="hud-lap" class="hud-value neon-cyan">1/3</div>
        <div id="hud-notification" class="hud-banner"></div>
      </div>
      <div class="hud-panel right">
        <div class="timer-row"><span class="hud-label">TIME</span> <span id="hud-timer" class="hud-mono">00:00.00</span></div>
        <div class="timer-row"><span class="hud-label">BEST</span> <span id="hud-best-lap" class="hud-mono">--:--.--</span></div>
      </div>
    </div>

    <!-- Minimap Radar -->
    <div id="minimap-container">
      <canvas id="minimap-canvas" width="160" height="160"></canvas>
    </div>

    <!-- Bottom Speedometer & Nitro -->
    <div id="dashboard">
      <div id="speedometer">
        <span id="hud-speed" class="speed-number">0</span>
        <span class="speed-unit">KM/H</span>
      </div>
      <div id="nitro-gauge">
        <div class="nitro-label">NITRO</div>
        <div class="nitro-track">
          <div id="hud-nitro-fill" class="nitro-fill" style="width: 100%;"></div>
        </div>
      </div>
    </div>

    <!-- Countdown Overlay -->
    <div id="countdown-overlay" class="hidden">
      <span id="countdown-text">3</span>
    </div>

    <!-- Main Menu Screen -->
    <div id="menu-screen" class="screen-overlay">
      <div class="menu-box">
        <h1 class="glitch-title" data-text="SYNTHWAVE RACER">SYNTHWAVE RACER</h1>
        <p class="subtitle">OUTRUN THE GRID // DEFEAT THE RIVALS</p>
        <div class="instructions">
          <p><strong>W / &uarr;</strong> Accelerate &nbsp;|&nbsp; <strong>S / &darr;</strong> Brake / Reverse</p>
          <p><strong>A / D / &larr; / &rarr;</strong> Steer &nbsp;|&nbsp; <strong>SPACE</strong> Drift</p>
          <p><strong>SHIFT</strong> Nitro Boost &nbsp;|&nbsp; <strong>C</strong> Camera &nbsp;|&nbsp; <strong>R</strong> Reset</p>
        </div>
        <button id="start-btn" class="neon-btn">START RACE</button>
      </div>
    </div>

    <!-- Finish / Results Screen -->
    <div id="finish-screen" class="screen-overlay hidden">
      <div class="menu-box finish-box">
        <h2 id="finish-title" class="neon-pink">RACE FINISHED</h2>
        <div id="finish-rank-callout" class="rank-callout">1ST PLACE</div>
        <div class="leaderboard-wrapper">
          <table id="leaderboard-table">
            <thead>
              <tr><th>POS</th><th>DRIVER</th><th>TOTAL TIME</th><th>BEST LAP</th></tr>
            </thead>
            <tbody id="leaderboard-body"></tbody>
          </table>
        </div>
        <button id="restart-btn" class="neon-btn">RACE AGAIN</button>
      </div>
    </div>
  </div>

  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js"
      }
    }
  </script>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

```css
/* css/style.css */
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Share+Tech+Mono&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  user-select: none;
}

body, html {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #060212;
  font-family: 'Orbitron', -apple-system, sans-serif;
  color: #fff;
}

#game-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

#game-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
}

/* HUD elements */
#hud {
  position: absolute;
  top: 16px;
  left: 24px;
  right: 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
  z-index: 10;
}

.hud-panel {
  background: rgba(10, 5, 25, 0.75);
  border: 1px solid rgba(0, 240, 255, 0.3);
  box-shadow: 0 0 15px rgba(0, 240, 255, 0.2), inset 0 0 10px rgba(255, 0, 128, 0.15);
  border-radius: 8px;
  padding: 10px 18px;
  backdrop-filter: blur(6px);
}

.hud-label {
  font-size: 11px;
  letter-spacing: 2px;
  color: #8be9fd;
  text-transform: uppercase;
}

.hud-value {
  font-size: 32px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 1px;
}

.hud-sub {
  font-size: 18px;
  color: #888;
}

.hud-mono {
  font-family: 'Share Tech Mono', monospace;
  font-size: 20px;
  color: #00f0ff;
  letter-spacing: 1px;
}

.timer-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 3px;
}

.neon-pink {
  color: #ff007f;
  text-shadow: 0 0 12px #ff007f, 0 0 24px #ff007f;
}

.neon-cyan {
  color: #00f0ff;
  text-shadow: 0 0 12px #00f0ff, 0 0 24px #00f0ff;
}

/* Minimap */
#minimap-container {
  position: absolute;
  bottom: 24px;
  left: 24px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  border: 2px solid rgba(0, 240, 255, 0.5);
  box-shadow: 0 0 20px rgba(0, 240, 255, 0.3), inset 0 0 15px rgba(255, 0, 128, 0.2);
  background: rgba(8, 4, 20, 0.85);
  backdrop-filter: blur(8px);
  overflow: hidden;
  z-index: 10;
  pointer-events: none;
}

#minimap-canvas {
  width: 100%;
  height: 100%;
}

/* Dashboard */
#dashboard {
  position: absolute;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
  z-index: 10;
}

#speedometer {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.speed-number {
  font-size: 56px;
  font-weight: 900;
  font-family: 'Share Tech Mono', monospace;
  color: #00f0ff;
  text-shadow: 0 0 15px #00f0ff, 0 0 30px #00f0ff;
}

.speed-unit {
  font-size: 14px;
  color: #ff007f;
  letter-spacing: 2px;
}

#nitro-gauge {
  width: 220px;
  margin-top: 8px;
}

.nitro-label {
  font-size: 10px;
  letter-spacing: 2px;
  color: #ff007f;
  margin-bottom: 3px;
  text-shadow: 0 0 8px #ff007f;
}

.nitro-track {
  width: 100%;
  height: 12px;
  background: rgba(20, 10, 35, 0.8);
  border: 1px solid #ff007f;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 0 10px rgba(255, 0, 128, 0.3);
}

.nitro-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff007f, #00f0ff);
  box-shadow: 0 0 12px #00f0ff;
  transition: width 0.05s linear;
}

/* Banner Notification */
#hud-notification {
  margin-top: 8px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  text-align: center;
  opacity: 0;
  transition: opacity 0.25s ease;
}

/* Countdown */
#countdown-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 120px;
  font-weight: 900;
  color: #ffeb3b;
  text-shadow: 0 0 30px #ff007f, 0 0 60px #00f0ff;
  z-index: 25;
  pointer-events: none;
  animation: pulse 0.5s ease infinite alternate;
}

/* Screen overlays */
.screen-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(5, 2, 15, 0.85);
  backdrop-filter: blur(8px);
  z-index: 30;
}

.hidden {
  display: none !important;
}

.menu-box {
  background: rgba(15, 8, 30, 0.95);
  border: 2px solid #00f0ff;
  box-shadow: 0 0 30px rgba(0, 240, 255, 0.4), inset 0 0 20px rgba(255, 0, 128, 0.3);
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  max-width: 600px;
  width: 90%;
}

.glitch-title {
  font-size: 42px;
  font-weight: 900;
  letter-spacing: 4px;
  color: #00f0ff;
  text-shadow: -2px 0 #ff007f, 2px 0 #00f0ff;
  margin-bottom: 8px;
}

.subtitle {
  font-size: 13px;
  letter-spacing: 4px;
  color: #ff007f;
  margin-bottom: 24px;
}

.instructions {
  background: rgba(0, 0, 0, 0.4);
  padding: 18px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 13px;
  color: #ccc;
  line-height: 1.8;
  margin-bottom: 28px;
}

.neon-btn {
  background: #ff007f;
  color: #fff;
  font-family: 'Orbitron', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 3px;
  border: none;
  padding: 14px 38px;
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 0 20px #ff007f;
  transition: all 0.2s ease;
}

.neon-btn:hover {
  background: #00f0ff;
  color: #05020f;
  box-shadow: 0 0 25px #00f0ff;
  transform: scale(1.05);
}

.leaderboard-wrapper {
  margin: 20px 0;
  max-height: 250px;
  overflow-y: auto;
}

#leaderboard-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Share Tech Mono', monospace;
  font-size: 15px;
}

#leaderboard-table th {
  padding: 8px;
  color: #8be9fd;
  border-bottom: 1px solid rgba(0, 240, 255, 0.3);
}

#leaderboard-table td {
  padding: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.rank-callout {
  font-size: 38px;
  font-weight: 900;
  color: #ffeb3b;
  text-shadow: 0 0 20px #ff007f;
  margin: 10px 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shell.test.js`  
Expected: PASS with 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css tests/shell.test.js
git commit -m "feat: add index shell, synthwave neon styles and HUD overlays"
```

---

### Task 2: Track Spline Geometry, Road Generation & Collision Mathematics

**Files:**
- Create: `C:\Users\SIR\car-racing-game\js\world\track.js`
- Create: `C:\Users\SIR\car-racing-game\tests\track.test.js`

**Interfaces:**
- Consumes: Three.js math classes (`Vector3`, `CatmullRomCurve3`).
- Produces: `Track` class:
  - `getSplinePoint(t: number): Vector3`
  - `getSplineTangent(t: number): Vector3`
  - `findClosestPointOnTrack(position: Vector3): { t: number, distance: number, lateralDistance: number, normal: Vector3, trackPoint: Vector3 }`
  - `checkBarrierCollision(position: Vector3, radius: number): { collided: boolean, normal: Vector3, penetration: number }`
  - `createMeshes(): THREE.Group` (returns road, neon curbs, glowing barriers, checkpoints, and start gantry)

- [ ] **Step 1: Write failing unit test for track math and collision**

```javascript
// tests/track.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TrackMath } from '../js/world/track-math.js';

test('TrackMath generates closed spline and projects points accurately', () => {
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 0, z: 100 },
    { x: 0, y: 0, z: 100 }
  ];
  const track = new TrackMath(points, 24); // 24m width

  const pointOnCenter = { x: 50, y: 0, z: 0 };
  const projCenter = track.projectPoint(pointOnCenter);
  assert.ok(Math.abs(projCenter.lateralDistance) < 0.5, 'Center line should have ~0 lateral distance');

  const pointNearBarrier = { x: 50, y: 0, z: 11.5 }; // close to half-width (12m)
  const collision1 = track.checkBarrierCollision(pointNearBarrier, 1.2);
  assert.equal(collision1.collided, true, 'Point within radius of barrier must report collision');

  const pointOutsideBarrier = { x: 50, y: 0, z: 15 };
  const collision2 = track.checkBarrierCollision(pointOutsideBarrier, 1.0);
  assert.equal(collision2.collided, true, 'Point beyond barrier must collide');
  assert.ok(collision2.penetration > 0, 'Penetration should be positive');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/track.test.js`  
Expected: FAIL (module not found).

- [ ] **Step 3: Implement js/world/track-math.js and js/world/track.js**

Implement `TrackMath` (pure logic for Node & browser testability) and `Track` (Three.js mesh generator).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/track.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/world/track-math.js js/world/track.js tests/track.test.js
git commit -m "feat: implement 3D spline circuit geometry, road mesh generator, and barrier collision"
```

---

### Task 3: Procedural 3D Synthwave Car Constructor

**Files:**
- Create: `C:\Users\SIR\car-racing-game\js\entities\car-builder.js`
- Create: `C:\Users\SIR\car-racing-game\tests\car-builder.test.js`

**Interfaces:**
- Consumes: Three.js (`Group`, `BoxGeometry`, `CylinderGeometry`, `MeshStandardMaterial`).
- Produces: `CarBuilder.createCarMesh(options: { primaryColor, accentColor, glowColor, isPlayer }): { root: THREE.Group, wheels: THREE.Mesh[], brakeLights: THREE.Mesh[], headlights: THREE.Mesh[], exhaustPipes: THREE.Vector3[] }`

- [ ] **Step 1: Write test for car builder specifications**

```javascript
// tests/car-builder.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CarConfig } from '../js/entities/car-builder.js';

test('CarConfig specifies valid dimensions and 6 rival color palettes', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/car-builder.test.js`  
Expected: FAIL.

- [ ] **Step 3: Implement js/entities/car-builder.js**

Implement `CarConfig` and `CarBuilder` with procedural wedge body, cockpit canopy, rear wing, neon underglow, 4 spinning wheels, and brake flare.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/car-builder.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/entities/car-builder.js tests/car-builder.test.js
git commit -m "feat: implement procedural 3D synthwave sports car constructor"
```

---

### Task 4: Vehicle Kinematics, Drift Mechanics & Nitro Boost

**Files:**
- Create: `C:\Users\SIR\car-racing-game\js\entities\player-car.js`
- Create: `C:\Users\SIR\car-racing-game\tests\player-car.test.js`

**Interfaces:**
- Consumes: User input state (`throttle`, `brake`, `steer`, `drift`, `nitro`).
- Produces: `PlayerCar` class:
  - `update(dt: number, track: TrackMath)`
  - `position: Vector3`, `velocity: Vector3`, `speed: number (m/s)`, `heading: number`
  - `isDrifting: boolean`, `nitroLevel: number`, `isBoosting: boolean`
  - `resetToTrack(track: TrackMath)`

- [ ] **Step 1: Write failing unit test for vehicle physics dynamics**

```javascript
// tests/player-car.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { VehiclePhysics } from '../js/entities/player-car.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/player-car.test.js`  
Expected: FAIL.

- [ ] **Step 3: Implement js/entities/player-car.js**

Implement `VehiclePhysics` core class (with speed-sensitive steering, lateral drift slip, nitro consumption/recharge, drag, and mini-turbo) and `PlayerCar` (integrating Three.js mesh, wheel animation, and sound triggers).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/player-car.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/entities/player-car.js tests/player-car.test.js
git commit -m "feat: implement vehicle physics, drift mechanics, and nitro boost"
```

---

### Task 5: AI Opponents & Waypoint Navigation

**Files:**
- Create: `C:\Users\SIR\car-racing-game\js\entities\ai-car.js`
- Create: `C:\Users\SIR\car-racing-game\tests\ai-car.test.js`

**Interfaces:**
- Consumes: `TrackMath`, other vehicle positions.
- Produces: `AICar` class:
  - `update(dt: number, track: TrackMath, playerPosition: Vector3, playerDistance: number)`
  - `splineProgress: number`, `currentLap: number`, `position: Vector3`

- [ ] **Step 1: Write failing unit test for AI steering & rubberbanding**

```javascript
// tests/ai-car.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { AICarLogic } from '../js/entities/ai-car.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai-car.test.js`  
Expected: FAIL.

- [ ] **Step 3: Implement js/entities/ai-car.js**

Implement `AICarLogic` and `AICar` with 3-lane pathfinding, forward obstacle raycasting, avoidance lane changes, and dynamic rubberbanding.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai-car.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/entities/ai-car.js tests/ai-car.test.js
git commit -m "feat: implement AI rival navigation, obstacle avoidance, and dynamic rubberbanding"
```

---

### Task 6: Procedural Web Audio Engine (Synthesizer & Soundscape)

**Files:**
- Create: `C:\Users\SIR\car-racing-game\js\audio\sound.js`
- Create: `C:\Users\SIR\car-racing-game\tests\audio.test.js`

**Interfaces:**
- Consumes: Native `AudioContext`.
- Produces: `SoundManager` class:
  - `startAudio()`: Initializes audio context upon first user gesture
  - `updateEngine(speedRatio: number, isAccelerating: boolean)`: Modulates engine oscillators & filter
  - `setDriftScreech(intensity: number)`: Modulates tire screech noise bandpass filter
  - `triggerNitro(active: boolean)`: Plays nitro boom & whoosh
  - `playCrash()`: Plays snappy collision impact sound
  - `playCountdownBeep(isFinal: boolean)`: High/low pitch starting beeps
  - `startMusic()` / `stopMusic()`: Continuous 128 BPM Synthwave arpeggios at -18 dB with dynamic ducking

- [ ] **Step 1: Write test for audio parameter mapping**

```javascript
// tests/audio.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEngineRPM } from '../js/audio/sound.js';

test('calculateEngineRPM calculates multi-gear frequencies accurately', () => {
  const idle = calculateEngineRPM(0);
  assert.ok(idle.frequency >= 50 && idle.frequency <= 90, 'Idle RPM must be deep rumble');

  const topGear = calculateEngineRPM(50); // ~180 km/h
  assert.ok(topGear.frequency > idle.frequency, 'High speed must have higher engine frequency');
  assert.ok(topGear.gear >= 1 && topGear.gear <= 5, 'Gear must be between 1 and 5');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/audio.test.js`  
Expected: FAIL.

- [ ] **Step 3: Implement js/audio/sound.js**

Implement Web Audio oscillator network, noise generator for tires/nitro, engine gear mapping, audio ducking compressor, and procedural synthwave arpeggiator.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/audio.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/audio/sound.js tests/audio.test.js
git commit -m "feat: implement procedural Web Audio synthesizer, engine modulation, and continuous synthwave music"
```

---

### Task 7: Visual Atmosphere, Wireframe Horizon & Particle Systems

**Files:**
- Create: `C:\Users\SIR\car-racing-game\js\world\environment.js`
- Create: `C:\Users\SIR\car-racing-game\js\world\particles.js`

**Interfaces:**
- Consumes: Three.js scene.
- Produces:
  - `Environment.create(scene)`: Wireframe slatted sun, glowing horizon mountain peaks, infinite ground grid, and synthwave ambient lighting.
  - `ParticleSystem`: `emitExhaust(pos, vel, color)`, `emitDriftSparks(pos, vel)`, `emitSpeedLines(camPos, active)`.

- [ ] **Step 1: Implement js/world/environment.js**

Build procedural wireframe mountain geometry using sine-noise displacement, horizontal-cut glowing sun mesh, and infinite perspective grid with custom emissive shader/materials.

- [ ] **Step 2: Implement js/world/particles.js**

Build GPU/Instanced or point-based particle systems for dual nitro exhaust flames, drift sparks, tire smoke, and warp speed lines.

- [ ] **Step 3: Commit**

```bash
git add js/world/environment.js js/world/particles.js
git commit -m "feat: implement synthwave sunset horizon, wireframe mountains, and dynamic particle systems"
```

---

### Task 8: Dynamic Chase Camera & Input Controller

**Files:**
- Create: `C:\Users\SIR\car-racing-game\js\core\camera.js`
- Create: `C:\Users\SIR\car-racing-game\js\core\input.js`
- Create: `C:\Users\SIR\car-racing-game\tests\input.test.js`

**Interfaces:**
- Consumes: Window keyboard/touch events, vehicle position/velocity.
- Produces:
  - `InputManager`: `getInputState(): { throttle, brake, steer, drift, nitro, reset, switchCam, pause }`
  - `CameraController`: `update(targetCar, dt)` (manages 3 camera views: Chase, Close, Bumper; velocity lag; FOV kick; screen shake)

- [ ] **Step 1: Write unit test for input mapping**

```javascript
// tests/input.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputState } from '../js/core/input.js';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/input.test.js`  
Expected: FAIL.

- [ ] **Step 3: Implement js/core/input.js and js/core/camera.js**

Implement keyboard event listeners, virtual touch buttons for mobile screens, and smooth lerp chase camera with dynamic FOV and trauma shake.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/input.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/core/input.js js/core/camera.js tests/input.test.js
git commit -m "feat: implement dynamic chase camera and multi-device input controller"
```

---

### Task 9: Race Manager, Checkpoint Tracking & Real-Time Standings

**Files:**
- Create: `C:\Users\SIR\car-racing-game\js\core\race-manager.js`
- Create: `C:\Users\SIR\car-racing-game\tests\race-manager.test.js`

**Interfaces:**
- Consumes: Array of vehicles with spline progress and lap counts.
- Produces: `RaceManager` class:
  - `update(dt: number, playerCar, aiCars)`
  - `getStandings(): { rank: number, totalDrivers: number, standings: DriverResult[] }`
  - `lapTimes: { current: number, best: number, lapCount: number, isFinished: boolean }`
  - `checkpoints: CheckpointTracker`

- [ ] **Step 1: Write unit test for checkpoint validation and standings calculation**

```javascript
// tests/race-manager.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { StandingsCalculator, CheckpointTracker } from '../js/core/race-manager.js';

test('StandingsCalculator sorts drivers by total race distance', () => {
  const drivers = [
    { id: 'player', name: 'Player', lap: 1, splineProgress: 0.4 },
    { id: 'ai1', name: 'Apex Nova', lap: 1, splineProgress: 0.8 },
    { id: 'ai2', name: 'Cyber Phantom', lap: 2, splineProgress: 0.1 }
  ];

  const standings = StandingsCalculator.calculate(drivers, 1000);
  assert.equal(standings[0].id, 'ai2', 'ai2 on lap 2 must be 1st');
  assert.equal(standings[1].id, 'ai1', 'ai1 with 0.8 progress must be 2nd');
  assert.equal(standings[2].id, 'player', 'player must be 3rd');
});

test('CheckpointTracker validates sequential checkpoint hits and counts laps', () => {
  const tracker = new CheckpointTracker(8); // 8 checkpoints per lap
  assert.equal(tracker.currentLap, 1);

  // Hit checkpoints 0 through 7 sequentially
  for (let cp = 0; cp < 8; cp++) {
    const valid = tracker.hitCheckpoint(cp);
    assert.equal(valid, true, `Checkpoint ${cp} should be valid`);
  }

  // Cross start/finish after hitting all checkpoints
  const completed = tracker.completeLap();
  assert.equal(completed, true);
  assert.equal(tracker.currentLap, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/race-manager.test.js`  
Expected: FAIL.

- [ ] **Step 3: Implement js/core/race-manager.js**

Implement standings calculation, lap timing, checkpoint sequencing, slipstream draft detection, and race finishing logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/race-manager.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/core/race-manager.js tests/race-manager.test.js
git commit -m "feat: implement race manager, sequential checkpoint tracking, and real-time standings"
```

---

### Task 10: Game Integration, Minimap Renderer & Main Loop

**Files:**
- Create: `C:\Users\SIR\car-racing-game\js\main.js`

**Interfaces:**
- Consumes: All modules from Tasks 1–9.
- Produces: Fully functional game lifecycle coordinating Three.js WebGL renderer, fixed 60Hz physics loop, HUD updates, 2D vector minimap drawing, countdown sequence, and race finish leaderboard.

- [ ] **Step 1: Implement main.js**

Assemble:
- Three.js WebGLRenderer with high-DPI scaling and shadows.
- Scene assembly: track, environment, player car, 5 AI rivals, particle emitters.
- Minimap 2D canvas drawing routine with circuit track trace and live vehicle blips.
- State machine: `MENU` &rarr; `COUNTDOWN` &rarr; `RACING` &rarr; `FINISH` &rarr; `RESTART`.
- Event listeners for Start, Restart, and Pause.

- [ ] **Step 2: Test game launching via local web server**

Run: `npx -y serve -l 3000 C:\Users\SIR\car-racing-game` (or verify all files resolve without syntax errors).

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "feat: integrate main game loop, minimap radar, HUD bindings, and state machine"
```

---

### Task 11: Comprehensive Verification, Audio Polish & Playtesting

**Files:**
- Modify: `C:\Users\SIR\car-racing-game\js\entities\player-car.js` (tuning if needed)
- Modify: `C:\Users\SIR\car-racing-game\js\world\track.js` (tuning barrier feel if needed)
- Modify: `C:\Users\SIR\car-racing-game\README.md` (instructions to play)

- [ ] **Step 1: Run all automated tests**

Run: `node --test tests/*.test.js`  
Expected: All tests PASS.

- [ ] **Step 2: Verify game execution in browser**

Launch local server, test 3-2-1 countdown, player acceleration/steering, drift sparks & sound, nitro boost, AI car navigation, lap completion, and finish leaderboard.

- [ ] **Step 3: Create README.md with play instructions**

- [ ] **Step 4: Commit and finalize**

```bash
git add README.md
git commit -m "docs: add comprehensive game README and play instructions"
```
