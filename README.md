# 🏎️ 3D Synthwave Circuit Racer

An arcade 3D browser racing game powered by **WebGL / Three.js** and procedural **Web Audio**, set in a glowing retro-futuristic Cyberpunk/Synthwave universe.

Outrun five distinct AI rivals across a 2.2-kilometer roller-coaster neon highway, master high-speed handbrake drifting to recharge your nitro gauge, slipstream behind opponents, and claim the podium!

---

## ⚡ Key Features

- **100% Procedural & Self-Contained:** Zero large external binary assets. All 3D vehicle models, track ribbons, curbs, checkpoint arches, sunset horizon, wireframe mountains, sound effects, and 128 BPM Synthwave music are generated mathematically in real time.
- **Synthwave Visual Atmosphere:**
  - Iconic segmented horizontal slatted sun on the horizon with sunset color gradient.
  - Multi-harmonic procedural wireframe mountain ridges in electric violet and neon magenta.
  - Infinite perspective ground grid beneath the elevated track.
  - Rich particle effects: dual high-velocity nitro exhaust flames, tire drift sparks & smoke, and relativistic speed streak lines.
- **Arcade Vehicle Kinematics & Drift Physics:**
  - Normal top speed: **190 km/h** (52.8 m/s).
  - Nitro top speed: **245 km/h** (68.1 m/s).
  - Handbrake drifting with realistic oversteer physics; charges nitro at +18%/s.
  - **Mini-Turbo Boost:** Sustained drifts ($\ge 1.2\text{s}$) award an instant +15 km/h acceleration kick upon exiting the slide.
  - Elastic barrier collisions with momentum reflection and camera trauma shake.
- **Drafting / Slipstream Mechanics:**
  - Tucking into the slipstream cone behind a rival car for $\ge 1.0\text{s}$ unlocks a **+12% top speed bonus** and streaks of high-speed air.
- **5 Unique AI Rivals on a Staggered Starting Grid:**
  - **Apex Nova** (Aggressive speed demon, cyan)
  - **Cyber Phantom** (Unpredictable lane cutter, hot pink)
  - **Neon Viper** (High cornering grip, lime green)
  - **Vapor Blade** (Smooth drafting specialist, orange)
  - **Pulse Fury** (Relentless booster, purple)
  - Dynamic rubberbanding ensures tight, nail-biting bumper-to-bumper racing.
- **Procedural Web Audio Engine:**
  - Multi-gear engine oscillator frequency sweeping across 5 virtual transmission gears.
  - Bandpass-filtered tire screech noise on asphalt during slides.
  - Sub-bass nitro boom and crash impact transients.
  - Continuous 128 BPM Synthwave soundtrack running at `-18 dB` with dynamic audio ducking during nitro and collisions.
- **Dynamic Camera System:**
  - 3 switchable driving cameras: **Chase** (third-person), **Close** (tight over-the-shoulder), and **Bumper** (low hood speed view).
  - High-speed FOV expansion ($60^\circ \to 78^\circ$) and trauma-based screen shake.
  - Cinematic 360° vehicle showcase orbit on title screen.
- **2D Vector Minimap & HUD:**
  - Real-time circuit trace with live blips for the player and 5 rivals.
  - Digital speedometer, nitro gauge, 1st–6th live standings, lap counter (3 laps), lap timer, and finish leaderboard.
- **Mobile Touch Controls:**
  - Fully responsive on mobile devices with synthetic neon touch buttons for steering, gas, reverse, nitro, and drift.

---

## 🎮 Controls

### Desktop Keyboard
| Key | Action |
| :--- | :--- |
| **W** / **&uarr;** | Accelerate / Throttle |
| **S** / **&darr;** | Brake / Reverse |
| **A** / **&larr;** | Steer Left |
| **D** / **&rarr;** | Steer Right |
| **SPACE** | Handbrake Drift |
| **SHIFT** / **N** | Nitro Boost |
| **C** | Cycle Camera View (Chase &rarr; Close &rarr; Bumper) |
| **R** | Reset Vehicle to Track Center |
| **ESC** / **P** | Pause / Resume Race |
| **ENTER** / **SPACE** | Start Race (from Title Menu) |

### Mobile Touch
- **Left / Right Arrows:** Virtual steering touch buttons
- **GAS / REV:** Throttle and Brake/Reverse pedals
- **NITRO / DRIFT:** Boost activation and drift trigger buttons
- **CAM / RST:** Camera cycle and vehicle reset buttons

---

## 🚀 How to Play

Because the game is built purely with standard Web standards (ES Modules, WebGL, Web Audio), you can launch it instantly with any local HTTP server:

### Option 1: Node.js / npx
```bash
# From the project directory:
npx -y serve -l 3000 .
```
Then open [http://localhost:3000](http://localhost:3000) in Chrome, Edge, Safari, or Firefox.

### Option 2: Python
```bash
# Python 3:
python -m http.server 3000
```
Then open [http://localhost:3000](http://localhost:3000).

### Option 3: VS Code Live Server
Right-click `index.html` and click **"Open with Live Server"**.

---

## 🧪 Automated Testing & Architecture

The codebase is engineered with strict separation between pure simulation logic and browser/WebGL rendering, enabling comprehensive headless unit testing in Node.js.

Run the test suite:
```bash
node --test tests/*.test.js
```

### Test Suites (95 passing tests):
1. `tests/shell.test.js` — DOM IDs, HUD elements, CSS styles
2. `tests/track.test.js` — Catmull-Rom spline, arc-length LUT, seam wrap-around, barrier collision
3. `tests/car-builder.test.js` — Car dimensions, player and 5 rival palettes, 3D hierarchy
4. `tests/player-car.test.js` — Kinematics, top speeds, braking, drift accumulation, mini-turbo kick, barrier bounce
5. `tests/ai-car.test.js` — 5 rival personalities, waypoint navigation, rubberbanding, multi-lane avoidance
6. `tests/audio.test.js` — Multi-gear engine RPM formulas, -18 dB continuous audio bed, dynamic ducking
7. `tests/particles.test.js` — Zero-GC particle pooling, exhaust flames, drift sparks, speed lines
8. `tests/input.test.js` — Key mappings, touch controls, camera modes, FOV expansion, trauma shake
9. `tests/race-manager.test.js` — Anti-cheat checkpoint sequencing, drafting speed bonus, real-time standings
10. `tests/integration.test.js` — State machine lifecycle, 60Hz physics accumulator, minimap drawing, HUD updates

---

## 📂 Project Structure

```
car-racing-game/
├── index.html                  # Main game shell, canvas, HUD, menus, and importmap
├── README.md                   # Project documentation & play guide
├── css/
│   └── style.css               # Synthwave neon glow styling, fonts, and responsive layout
├── js/
│   ├── main.js                 # Game coordinator, 60Hz loop, minimap renderer, state machine
│   ├── audio/
│   │   └── sound.js            # Procedural Web Audio synthesizer & 128 BPM synthwave engine
│   ├── core/
│   │   ├── camera.js           # Dynamic chase camera, FOV kick, trauma screen shake
│   │   ├── input.js            # Desktop keyboard and mobile virtual touch manager
│   │   └── race-manager.js     # Checkpoint anti-cheat, drafting detection, standings
│   ├── entities/
│   │   ├── car-builder.js      # Procedural 3D wedge sports car generator & rival palettes
│   │   ├── player-car.js       # Player vehicle kinematics, drift, nitro, and mini-turbo
│   │   └── ai-car.js           # 5 AI rival personalities, pathfinding, rubberbanding
│   └── world/
│       ├── environment.js      # Horizon sun, wireframe mountains, grid floor, lighting
│       ├── particles.js        # Zero-GC particle pools for exhaust, sparks, and speed lines
│       ├── track-math.js       # 24-point Catmull-Rom spline mathematics & collision bounds
│       └── track.js            # Three.js road meshes, neon curbs, barriers, checkpoint arches
└── tests/                      # 10 headless test suites (95 tests)
```

---

## 📜 License
MIT License. Built with ❤️ for speed and synthwave aesthetics.
