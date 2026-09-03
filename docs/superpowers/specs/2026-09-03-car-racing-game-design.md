# 3D Synthwave Circuit Racer — Design Specification

**Date:** 2026-09-03  
**Status:** Approved by User  
**Target Platform:** Modern Web Browsers (WebGL / Three.js, ES6 Modules)  
**Location:** `C:\Users\SIR\car-racing-game`

---

## 1. Overview & Game Vision

*3D Synthwave Circuit Racer* is an arcade 3D racing game set in a vibrant retro-futuristic synthwave world. The player pilots a glowing neon supercar around an undulating multi-lane circuit against 5 distinct AI rivals. The game combines snappy arcade handling, high-speed drifts, rechargeable nitro boosts, slipstream overtaking, dynamic camera motion, and a fully synthesized Web Audio soundtrack and sound effect suite running at a rock-solid 60 FPS without external asset downloads.

---

## 2. Architecture & File Structure

The project is structured into clean, isolated ES6 modules without bulky dependencies:

```
car-racing-game/
├── index.html                  # Main viewport, UI overlays, HUD, start/finish dialogs
├── css/
│   └── style.css               # Synthwave neon CSS, typography, minimap styling, responsive layout
├── js/
│   ├── main.js                 # Engine loop, state machine, initialization, resize handling
│   ├── audio/
│   │   └── sound.js            # Web Audio synth (engine RPM, tire screech, boost roar, synthwave music)
│   ├── core/
│   │   ├── input.js            # Keyboard (WASD/Arrows/Space/Shift) and mobile touch virtual controls
│   │   ├── camera.js           # Dynamic chase camera with velocity-lag, FOV kick, and screen shake
│   │   └── race-manager.js     # Standings (1st–6th), lap tracking, splits, checkpoint validation
│   ├── entities/
│   │   ├── car-builder.js      # Procedural 3D synthwave sports car generator (body, cockpit, spoiler, wheels)
│   │   ├── player-car.js       # Player vehicle physics, acceleration, braking, drift & nitro state
│   │   └── ai-car.js           # AI waypoint navigation, obstacle detection, lane changes, rubberbanding
│   └── world/
│       ├── track.js            # 3D Catmull-Rom spline circuit, road mesh, neon curbs, barriers, checkpoints
│       ├── environment.js      # Retro wireframe sun, neon horizon mountain range, infinite ground grid
│       └── particles.js        # Nitro exhaust flames, drift sparks, tire smoke, and speed warp lines
└── docs/
    └── superpowers/specs/      # Design and implementation specifications
```

---

## 3. Vehicle Dynamics & Arcade Physics

The physics engine uses a fixed-timestep update loop (`dt = 1/60 s`) decoupled from rendering.

### 3.1 Kinematics & Longitudinal Physics
* **Acceleration & Top Speeds:**
  * Top Speed (Normal): $52.8\text{ m/s}$ ($190\text{ km/h}$).
  * Top Speed (Nitro Boost): $68.1\text{ m/s}$ ($245\text{ km/h}$).
  * Acceleration Force: $28\text{ m/s}^2$ scaling non-linearly with current speed.
  * Reverse Speed: Max $-12\text{ m/s}$ ($-43\text{ km/h}$).
  * Natural Drag & Rolling Friction: $0.988$ per frame coasting friction; aerodynamic drag coefficient $C_d = 0.0012$.
* **Braking:**
  * Braking Deceleration: $42\text{ m/s}^2$. Triggers bright red rear taillight flare.

### 3.2 Lateral Physics & Steering
* **Speed-Sensitive Steering:**
  * Max steering angle: $0.62\text{ rad}$ at low speed, attenuating down to $0.22\text{ rad}$ at max speed to guarantee high-speed control stability.
  * Steering Return Rate: $8.0\text{ rad/s}$ auto-centering.

### 3.3 Drift Mechanics
* **Trigger:** Initiated by holding `Space` (handbrake) while cornering above $15\text{ m/s}$, or aggressive counter-steering at speed.
* **Drift Dynamics:**
  * Lateral friction drops by $65\%$, allowing the vehicle to slide outward at an oversteer yaw angle while retaining forward momentum.
  * Particle emitters spawn glowing neon drift sparks and smoke puffs from the rear tires.
  * Sound engine crossfades in a resonant tire screech.
* **Drift Reward & Mini-Turbo:**
  * Drifting continuously charges the Nitro Boost gauge ($+18\%$ per second of drift).
  * Exiting a drift sustained for $\ge 1.2\text{ seconds}$ grants a momentary "Mini-Turbo" boost ($+15\text{ km/h}$ kick for $0.8\text{ s}$).

### 3.4 Nitro Boost & Drafting
* **Nitro Gauge:** Total capacity $100$ units. Fully charged provides $4.0\text{ seconds}$ of continuous boost.
* **Visuals on Boost:** Twin neon exhaust flames emit from car exhausts; camera FOV kicks from $60^\circ$ to $78^\circ$; peripheral speed lines shoot past the viewport.
* **Drafting (Slipstream):**
  * When driving within an 18-meter distance cone directly behind a rival car for $\ge 1.0\text{ s}$, drafting engages.
  * Blue aerodynamic speed trails appear alongside the player's chassis and top speed increases by $+12\%$.

### 3.5 Collision Responses
* **Track Barrier Collisions:** Computes collision distance against track boundary margins. Penetration yields an elastic reflection vector, dampens forward speed by $30\%$, produces a spark particle burst, and triggers a $0.25\text{ s}$ camera shake.
* **Vehicle-to-Vehicle Collisions:** Cylindrical bounding volumes repel each other with lateral impulse deflection and metal impact audio.

---

## 4. Track System & 3D Spline Circuit

### 4.1 Track Geometry
* **Closed-Loop Spline:** Defined by $24$ 3D control points forming a looped Catmull-Rom curve with sweeping curves, elevation crests ($+12\text{ m}$ rise and fall), and an S-bend chicane.
* **Track Mesh Construction:**
  * Width: $24\text{ meters}$ (accommodates 4-wide vehicle racing).
  * Asphalt: Dark textured material with glowing neon lane dividers and cyan/magenta glowing curb strips along corners.
  * Barriers: Continuous elevated safety guardrails flanking the left and right track margins with emissive pulsing neon strips.
  * Checkpoints: $8$ invisible sector planes evenly distributed along the spline for progress calculation and lap verification.
  * Start/Finish Gantry: Overhead neon truss structure with animated green/red LED start lights and overhead banner.

---

## 5. AI Opponents & Waypoint Navigation

### 5.1 AI Grid (5 Rivals)
Each opponent has a distinct identity, livery color, and racing style:
1. **Apex Nova** — Color: Electric Cyan (`#00f0ff`) | Style: Aggressive line, frequent booster.
2. **Cyber Phantom** — Color: Laser Magenta (`#ff007f`) | Style: Clean apex cutter, high top speed.
3. **Neon Viper** — Color: Toxic Lime (`#39ff14`) | Style: Defensive lane blocker, late-braker.
4. **Vapor Blade** — Color: Sunset Orange (`#ff6b08`) | Style: Fast starter, drift enthusiast.
5. **Pulse Fury** — Color: Deep Violet (`#9d00ff`) | Style: Steady balanced racer.

### 5.2 Navigation & Pathing
* **Spline Following:** AI tracks target waypoints along the circuit spline with lateral offsets ($[-7\text{ m}, +7\text{ m}]$) representing 3 dynamic racing lanes.
* **Obstacle & Rival Avoidance:** Forward raycast sensors detect obstacles or cars ahead within $20\text{ meters}$, triggering dynamic lane transitions.
* **Dynamic Rubberbanding:**
  * If the player falls behind by $> 80\text{ meters}$, AI speed targets reduce by $8\%$.
  * If the player leads by $> 80\text{ meters}$, AI speed targets increase by $6\%$ with strategic nitro activation to maintain nail-biting competitiveness.

---

## 6. Graphics, Shaders & Visual Effects

* **The Synthwave Horizon:**
  * Giant 2D/3D retro wireframe sun positioned on the horizon with horizontal slatted segment cuts and yellow-to-pink color gradient.
  * Procedural glowing mountain silhouettes on the distant horizon rendered in wireframe violet.
  * Sub-track ground plane rendered with an infinite glowing retro perspective grid.
* **3D Supercars:**
  * Sleek geometric wedge body styling reminiscent of 1980s concept supercars (Countach / DeLorean aesthetic).
  * Dual emissive LED headlights projecting forward light cones.
  * Full-width neon rear taillight bar that flares intensely during braking.
  * Emissive underglow neon strips casting light beneath each car.
  * Four independent wheels with alloy rims that rotate with velocity and steer with input.
* **Particle Systems:**
  * Exhaust Boost: High-velocity point particles in cyan/magenta trailing behind exhausts.
  * Drift Smoke & Sparks: Low-poly billboard quads and bright glowing spark lines emitting at wheel contact points.
  * Speed Warp Streaks: Cylindrical particle field surrounding the camera, activated above $180\text{ km/h}$.

---

## 7. Procedural Web Audio Engine

Built strictly with the native browser Web Audio API:
* **Dynamic Engine Sound:**
  * Dual sawtooth/triangle oscillators passed through an exponential low-pass resonant filter.
  * Pitch and filter cutoff dynamically map to car velocity, simulating RPM rise across 5 gears.
* **Tire Screech:**
  * Pink/white noise buffer piped through a bandpass filter ($800\text{ Hz} - 2500\text{ Hz}$), modulated by the vehicle's lateral drift velocity.
* **Nitro Boost:**
  * Filtered white noise sweep coupled with sub-bass sine wave boom ($60\text{ Hz}$).
* **Collision Sound:**
  * Snappy low-passed noise burst with quick decay ($0.15\text{ s}$).
* **Continuous Synthwave Music Bed:**
  * Multi-voice synthesizer playing an energetic 128 BPM 80s synthwave arpeggiator with punchy synth bass, warm chord pads, and 4-on-the-floor kick/hi-hat pattern.
  * Continuous background bed volume set to $-18\text{ dB}$, with automatic audio ducking when nitro or collision effects fire.

---

## 8. HUD & User Interface

* **Top Left:** Current standing (`1ST / 6`) with animated rank shifting when overtaking.
* **Top Center:** Current Lap (`LAP 1 / 3` → `LAP 2 / 3` → `FINAL LAP!`).
* **Top Right:** Race Timer (`00:00.00`) & Best Lap Time (`BEST --:--.--`).
* **Bottom Left:** 2D Vector Track Minimap displaying real-time positions of the player (pulsing cyan icon) and 5 AI cars (colored pips).
* **Bottom Right:** Curved digital tachometer with glowing needle, digital speed readout (`KM/H`), and vertical glowing Nitro Meter (`NITRO [||||||||]`).
* **Notification Overlays:** Giant arcade text transitions for `"3... 2... 1... GO!"`, `"DRIFT BONUS!"`, `"SLIPSTREAM!"`, `"FINAL LAP!"`, and `"VICTORY / 1ST PLACE"`.
* **Controls & Help Modal:** Overlay displaying keyboard and touch controls with pause/restart actions.

---

## 9. Race Rules & State Machine

* **States:**
  * `MENU`: Title screen, synthwave music preview, rotating vehicle showcase, "START RACE" CTA.
  * `COUNTDOWN`: 3-second camera sweep transitioning into cockpit/chase view; 3-2-1 audio beeps.
  * `RACING`: Full user control, AI pathfinding, lap timing, checkpoint sequencing.
  * `PAUSED`: Freeze-frame loop with resume and restart options.
  * `FINISH`: Slow-motion camera rotation around player crossing the line, celebratory particle shower, final leaderboard displaying all 6 finish times.
* **Anti-Cheat:** Lap completion requires hitting all 8 checkpoints in order; jumping barriers will not advance lap progress.

---

## 10. Verification & Quality Plan

1. **Standalone Execution:** Ensure `index.html` loads and runs seamlessly via a local web server (e.g. `npx serve` or Python HTTP server) without missing asset 404s or CORS errors.
2. **Physics & Control Verification:** Verify acceleration, progressive braking, drift handling, nitro boost, and track barrier collision bounce.
3. **AI Navigation Verification:** Ensure all 5 AI opponents follow waypoints, navigate corners cleanly, avoid direct pile-ups, and complete full laps.
4. **Audio Verification:** Confirm Web Audio starts cleanly upon first user interaction, engine RPM modulates with speed, drift screech triggers during slides, and music bed plays continuously with ducking.
5. **HUD & Standings Verification:** Confirm real-time position updates (1st to 6th) accurately reflect track progress, lap increments correctly, and leaderboard presents results upon race completion.
