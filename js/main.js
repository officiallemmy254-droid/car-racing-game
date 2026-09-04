/**
 * 3D Synthwave Circuit Racer — Main Integration, Minimap & Game Loop
 * Integrates:
 * - Three.js WebGLRenderer with high-DPI scaling and shadow mapping
 * - Procedural world: Track circuit, Environment horizon, ParticleSystem
 * - Procedural Web Audio: SoundManager (engine RPM, tire screech, nitro, countdown, 128 BPM synthwave)
 * - Vehicle fleet: PlayerCar on starting grid + 5 AI rivals from CarConfig.rivalPalettes
 * - CameraController: Chase / Close / Bumper views with velocity lag, FOV kick, trauma screen shake, and menu orbit
 * - InputManager: Desktop keyboard controls & mobile touch overlay
 * - RaceManager: Standings, sequential checkpoint anti-cheat, drafting slipstream, lap timing, finish leaderboard
 * - 2D Vector Minimap radar on #minimap-canvas with track circuit loop and live vehicle blips
 * - Decoupled fixed 60Hz physics accumulator loop (dt = 1/60s)
 * - State Machine: MENU -> COUNTDOWN -> RACING -> PAUSED -> FINISH -> RESTART
 */

// Graceful Three.js import with headless Node.js fallback
let defaultThree = globalThis.THREE || null;
try {
  const threeModule = await import('three');
  defaultThree = threeModule.default || threeModule;
} catch (e) {
  // Graceful fallback for headless Node testing
}

import { TrackMath, DEFAULT_TRACK_POINTS } from './world/track-math.js';
import { Track } from './world/track.js';
import { Environment } from './world/environment.js';
import { ParticleSystem } from './world/particles.js';
import { SoundManager } from './audio/sound.js';
import { InputManager } from './core/input.js';
import { CameraController } from './core/camera.js';
import { RaceManager } from './core/race-manager.js';
import { CarBuilder, CarConfig } from './entities/car-builder.js';
import { PlayerCar } from './entities/player-car.js';
import { AICar } from './entities/ai-car.js';

/**
 * Game state enumeration
 */
export const GAME_STATES = {
  MENU: 'MENU',
  COUNTDOWN: 'COUNTDOWN',
  RACING: 'RACING',
  PAUSED: 'PAUSED',
  FINISH: 'FINISH'
};

/**
 * 2D Vector Minimap Radar Renderer
 * Draws the closed track spline loop and live vehicle position blips onto the 2D canvas.
 */
export class MinimapRenderer {
  /**
   * @param {HTMLCanvasElement|Object} canvas
   * @param {TrackMath} trackMath
   */
  constructor(canvas, trackMath) {
    this.canvas = canvas;
    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    this.trackMath = trackMath;

    this.width = canvas?.width || 160;
    this.height = canvas?.height || 160;
    this.padding = 16;

    this._computeBounds();
  }

  /**
   * Pre-computes 2D bounding box of the track circuit
   * @private
   */
  _computeBounds() {
    if (!this.trackMath) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const sampleCount = 200;
    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount;
      const pt = this.trackMath.getSplinePoint(t);
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.z < minZ) minZ = pt.z;
      if (pt.z > maxZ) maxZ = pt.z;
    }

    // Add safe margin
    const margin = 20;
    this.minX = minX - margin;
    this.maxX = maxX + margin;
    this.minZ = minZ - margin;
    this.maxZ = maxZ + margin;

    const spanX = Math.max(1, this.maxX - this.minX);
    const spanZ = Math.max(1, this.maxZ - this.minZ);

    const drawW = this.width - this.padding * 2;
    const drawH = this.height - this.padding * 2;

    this.scale = Math.min(drawW / spanX, drawH / spanZ);
    this.offsetX = (this.width - spanX * this.scale) / 2;
    this.offsetY = (this.height - spanZ * this.scale) / 2;
  }

  /**
   * Maps 3D world (x, z) coordinates into 2D canvas coordinates
   * @param {number} x
   * @param {number} z
   * @returns {{ mx: number, my: number }}
   */
  worldToMap(x, z) {
    return {
      mx: (x - this.minX) * this.scale + this.offsetX,
      my: (this.maxZ - z) * this.scale + this.offsetY
    };
  }

  /**
   * Renders radar background, circuit spline path, start line, and live car dots
   * @param {Object} playerCar
   * @param {Array<Object>} aiCars
   * @param {number} [time=0] Elapsed time for pulsing effects
   */
  draw(playerCar, aiCars = [], time = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // Save state for circular clipping
    if (typeof ctx.save === 'function') ctx.save();

    // 1. Draw track loop path
    if (this.trackMath) {
      ctx.beginPath();
      const samples = 120;
      for (let i = 0; i <= samples; i++) {
        const t = (i % samples) / samples;
        const pt = this.trackMath.getSplinePoint(t);
        const { mx, my } = this.worldToMap(pt.x, pt.z);
        if (i === 0) {
          ctx.moveTo(mx, my);
        } else {
          ctx.lineTo(mx, my);
        }
      }
      ctx.closePath();

      // Outer track glow
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // Inner track line
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Start/Finish indicator tick
      const startPt = this.trackMath.getSplinePoint(0);
      const startNorm = this.trackMath.getNormalAt(0);
      const s1 = this.worldToMap(startPt.x - startNorm.x * 6, startPt.z - startNorm.z * 6);
      const s2 = this.worldToMap(startPt.x + startNorm.x * 6, startPt.z + startNorm.z * 6);

      ctx.beginPath();
      ctx.moveTo(s1.mx, s1.my);
      ctx.lineTo(s2.mx, s2.my);
      ctx.strokeStyle = '#ffeb3b'; // Golden start line
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // 2. Draw AI Rival blips
    if (Array.isArray(aiCars)) {
      for (const ai of aiCars) {
        const pos = ai.position || ai.logic?.position;
        if (!pos) continue;

        const { mx, my } = this.worldToMap(pos.x, pos.z);
        const color = ai.palette?.primaryColor || ai.color || '#ff007f';

        ctx.beginPath();
        ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // 3. Draw Player blip (pulsing cyan circle with white center)
    if (playerCar) {
      const pos = playerCar.position || playerCar.physics?.position;
      if (pos) {
        const { mx, my } = this.worldToMap(pos.x, pos.z);

        // Pulsing radar glow
        const pulse = 4.5 + Math.sin(time * 8.0) * 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
        ctx.fill();

        // Inner solid dot
        ctx.beginPath();
        ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (typeof ctx.restore === 'function') ctx.restore();
  }
}

/**
 * Main Synthwave Circuit Racer Game Controller
 */
export class Game {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = options;
    this.three = options.three || defaultThree || globalThis.THREE;

    // DOM resolution
    this.dom = options.dom || (typeof document !== 'undefined' ? document : null);
    this.headless = Boolean(options.headless || !this.three);

    // Game lifecycle state
    this.state = GAME_STATES.MENU;
    this.isRunning = false;
    this.animationFrameId = null;

    // Time & loop variables
    this.totalElapsedTime = 0;
    this.countdownRemaining = 3.0;
    this.countdownStep = 3;
    this.lastFrameTime = 0;
    this.physicsAccumulator = 0;
    this.fixedDt = 1 / 60;
    this.maxAccumulator = 0.25;

    // Banner notification timer & lap tracking
    this.notificationTimeout = null;
    this._lastNotifiedLap = 1;

    // Staggered starting grid definitions (row offsets along track)
    this.gridSlots = [
      { name: 'Apex Nova', distOffset: 50, laneOffset: -3.5 },
      { name: 'Cyber Phantom', distOffset: 41, laneOffset: 3.5 },
      { name: 'Neon Viper', distOffset: 32, laneOffset: -3.5 },
      { name: 'Vapor Blade', distOffset: 23, laneOffset: 3.5 },
      { name: 'Pulse Fury', distOffset: 14, laneOffset: -3.5 },
      { name: 'Player', distOffset: 5, laneOffset: 3.5 }
    ];

    // Subsystems
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.trackMath = null;
    this.track = null;
    this.environment = null;
    this.particleSystem = null;
    this.soundManager = null;
    this.inputManager = null;
    this.cameraController = null;
    this.raceManager = null;
    this.minimapRenderer = null;
    this.playerCar = null;
    this.aiCars = [];

    // Initialize DOM elements and subsystems
    this._initDOMElements();
    this._initThreeScene();
    this._initWorld();
    this._initSoundAndInput();
    this._initVehicles();
    this._initRaceManager();
    this._initMinimap();
    this._bindEvents();

    // Start in MENU state
    this.setState(GAME_STATES.MENU);

    // Auto-start animation loop if not disabled
    if (options.autoStartLoop !== false && !this.headless) {
      this.start();
    }
  }

  /**
   * Resolves HTML DOM element references
   * @private
   */
  _initDOMElements() {
    const getEl = (id) => {
      if (this.dom && typeof this.dom.getElementById === 'function') {
        return this.dom.getElementById(id);
      }
      return null;
    };

    this.ui = {
      gameCanvas: getEl('game-canvas'),
      minimapCanvas: getEl('minimap-canvas'),
      hudPosition: getEl('hud-position'),
      hudLap: getEl('hud-lap'),
      hudTimer: getEl('hud-timer'),
      hudBestLap: getEl('hud-best-lap'),
      hudSpeed: getEl('hud-speed'),
      hudNitroFill: getEl('hud-nitro-fill'),
      hudNotification: getEl('hud-notification'),
      countdownOverlay: getEl('countdown-overlay'),
      countdownText: getEl('countdown-text'),
      menuScreen: getEl('menu-screen'),
      pauseScreen: getEl('pause-screen'),
      finishScreen: getEl('finish-screen'),
      startBtn: getEl('start-btn'),
      resumeBtn: getEl('resume-btn'),
      restartBtn: getEl('restart-btn'),
      finishTitle: getEl('finish-title'),
      finishRankCallout: getEl('finish-rank-callout'),
      leaderboardBody: getEl('leaderboard-body')
    };
  }

  /**
   * Sets up Three.js WebGLRenderer, PerspectiveCamera, Scene, and resize handlers
   * @private
   */
  _initThreeScene() {
    if (!this.three) return;

    const THREE = this.three;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    const aspect = (typeof window !== 'undefined' && window.innerWidth && window.innerHeight)
      ? window.innerWidth / window.innerHeight
      : 16 / 9;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2500);

    // WebGLRenderer
    const canvas = this.ui.gameCanvas || this.options.canvas;
    if (canvas && typeof THREE.WebGLRenderer === 'function') {
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          powerPreference: 'high-performance'
        });

        const pixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(window.devicePixelRatio, 2) : 1;
        this.renderer.setPixelRatio(pixelRatio);

        const width = (typeof window !== 'undefined' && window.innerWidth) || 1920;
        const height = (typeof window !== 'undefined' && window.innerHeight) || 1080;
        this.renderer.setSize(width, height);

        if (this.renderer.shadowMap) {
          this.renderer.shadowMap.enabled = true;
          if (THREE.PCFSoftShadowMap) {
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
          }
        }
      } catch (e) {
        // Fallback for mock environments
        this.renderer = null;
      }
    }

    // Camera Controller
    this.cameraController = new CameraController(this.camera, {
      baseFov: 60,
      maxFov: 78
    });

    // Window resize handler
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._onResize = () => {
        if (!this.camera || !this.renderer) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.aspect = w / h;
        if (typeof this.camera.updateProjectionMatrix === 'function') {
          this.camera.updateProjectionMatrix();
        }
        this.renderer.setSize(w, h);
      };
      window.addEventListener('resize', this._onResize);
    }
  }

  /**
   * Builds circuit track spline, atmosphere, and particle engine
   * @private
   */
  _initWorld() {
    this.trackMath = new TrackMath(DEFAULT_TRACK_POINTS, 24);

    if (this.three) {
      Track.setThree(this.three);
      Environment.setThree(this.three);
      ParticleSystem.setThree(this.three);
    }

    this.track = new Track(this.trackMath, { THREE: this.three });

    if (this.scene && typeof this.track.createMeshes === 'function') {
      const trackGroup = this.track.createMeshes();
      if (trackGroup) {
        this.scene.add(trackGroup);
      }
    }

    if (this.scene) {
      this.environment = Environment.create(this.scene, { THREE: this.three });
      this.particleSystem = new ParticleSystem(this.scene, { THREE: this.three });
    }
  }

  /**
   * Initializes SoundManager and InputManager
   * @private
   */
  _initSoundAndInput() {
    this.soundManager = new SoundManager();
    this.inputManager = new InputManager();
  }

  /**
   * Procedurally builds player sports car and 5 AI rivals on starting grid
   * @private
   */
  _initVehicles() {
    if (this.three) {
      CarBuilder.setThree(this.three);
    }

    // 1. Build Player Car
    const playerSlot = this.gridSlots.find(s => s.name === 'Player') || { distOffset: 5, laneOffset: 3.5 };
    const playerT = playerSlot.distOffset / this.trackMath.totalLength;
    const playerPt = this.trackMath.getSplinePoint(playerT);
    const playerNorm = this.trackMath.getNormalAt(playerT);
    const playerTan = this.trackMath.getSplineTangent(playerT);

    const initialPlayerPos = {
      x: playerPt.x + playerNorm.x * playerSlot.laneOffset,
      y: playerPt.y + 0.35,
      z: playerPt.z + playerNorm.z * playerSlot.laneOffset
    };
    const initialPlayerHeading = Math.atan2(playerTan.x, playerTan.z);

    this.playerCar = new PlayerCar({
      three: this.three,
      palette: CarConfig.playerPalette,
      initialPosition: initialPlayerPos,
      initialHeading: initialPlayerHeading,
      scene: this.scene
    });

    this.playerCar.physics.distanceAlongTrack = playerSlot.distOffset;
    this.playerCar.physics.splineProgress = playerT;

    // 2. Build 5 AI Rivals from CarConfig.rivalPalettes
    this.aiCars = [];
    for (let i = 0; i < CarConfig.rivalPalettes.length; i++) {
      const palette = CarConfig.rivalPalettes[i];
      const slot = this.gridSlots.find(s => s.name === palette.name) || {
        distOffset: 14 + i * 9,
        laneOffset: (i % 2 === 0 ? -3.5 : 3.5)
      };

      const ai = new AICar({
        name: palette.name,
        palette,
        track: this.trackMath,
        three: this.three,
        scene: this.scene,
        initialDistance: slot.distOffset,
        laneOffset: slot.laneOffset,
        speed: 0
      });

      this.aiCars.push(ai);
    }
  }

  /**
   * Sets up RaceManager
   * @private
   */
  _initRaceManager() {
    this.raceManager = new RaceManager({
      totalLaps: 3,
      totalCheckpoints: 8,
      trackLength: this.trackMath.totalLength
    });
    this.raceManager.playerCar = this.playerCar;
    this.raceManager.aiCars = this.aiCars;
    this.raceManager.track = this.trackMath;
  }

  /**
   * Sets up 2D Minimap radar
   * @private
   */
  _initMinimap() {
    const canvas = this.ui.minimapCanvas || this.options.minimapCanvas;
    this.minimapRenderer = new MinimapRenderer(canvas, this.trackMath);
  }

  /**
   * Binds UI click listeners and keyboard actions
   * @private
   */
  _bindEvents() {
    // Start button
    if (this.ui.startBtn) {
      this.ui.startBtn.addEventListener('click', () => {
        if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        this.soundManager.startAudio();
        this.soundManager.startMusic();
        this.startCountdown();
      });
    }

    // Resume button
    if (this.ui.resumeBtn) {
      this.ui.resumeBtn.addEventListener('click', () => {
        if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        this.resume();
      });
    }

    // Restart button
    if (this.ui.restartBtn) {
      this.ui.restartBtn.addEventListener('click', () => {
        if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        this.restartRace();
      });
    }

    // Global keyboard shortcuts (Pause toggle on Esc/P, Start on Enter/Space in MENU, Restart in FINISH)
    this._onKeyDown = (e) => {
      const code = e.code || e.key;
      if (code === 'Escape' || code === 'KeyP' || code === 'p' || code === 'P') {
        if (this.state === GAME_STATES.RACING || this.state === GAME_STATES.PAUSED) {
          this.togglePause();
          // Consume pause pulse in InputState to prevent double-toggle in animation frame loop
          if (this.inputManager?.state) {
            this.inputManager.state._pause = false;
            this.inputManager.state._virtualPause = false;
          }
        }
      } else if ((code === 'Enter' || code === 'Space' || code === ' ') && this.state === GAME_STATES.MENU) {
        this.soundManager.startAudio();
        this.soundManager.startMusic();
        this.startCountdown();
      } else if ((code === 'Enter' || code === 'Space' || code === ' ' || code === 'KeyR' || code === 'r' || code === 'R') && this.state === GAME_STATES.FINISH) {
        this.restartRace();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
    }
  }

  /**
   * Sets current state of the game
   * @param {string} newState
   */
  setState(newState) {
    this.state = newState;

    // Update screen overlays
    const show = (el, visible) => {
      if (!el) return;
      if (visible) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    };

    switch (this.state) {
      case GAME_STATES.MENU:
        show(this.ui.menuScreen, true);
        show(this.ui.pauseScreen, false);
        show(this.ui.finishScreen, false);
        show(this.ui.countdownOverlay, false);
        if (this.cameraController && this.playerCar) {
          this.cameraController.setMenuMode(true, this.playerCar.position);
        }
        break;

      case GAME_STATES.COUNTDOWN:
        show(this.ui.menuScreen, false);
        show(this.ui.pauseScreen, false);
        show(this.ui.finishScreen, false);
        show(this.ui.countdownOverlay, true);
        if (this.cameraController) {
          this.cameraController.setMenuMode(false);
          this.cameraController.snap();
        }
        break;

      case GAME_STATES.RACING:
        show(this.ui.menuScreen, false);
        show(this.ui.pauseScreen, false);
        show(this.ui.finishScreen, false);
        show(this.ui.countdownOverlay, false);
        // Reset physics accumulator so stale time from countdown/pause
        // doesn't cause a burst of catch-up physics steps
        this.physicsAccumulator = 0;
        this.lastFrameTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (this.cameraController) {
          this.cameraController.setMenuMode(false);
        }
        break;

      case GAME_STATES.PAUSED:
        show(this.ui.pauseScreen, true);
        break;

      case GAME_STATES.FINISH:
        show(this.ui.finishScreen, true);
        this._populateLeaderboard();
        break;
    }
  }

  /**
   * Starts countdown sequence: 3 -> 2 -> 1 -> GO!
   */
  startCountdown() {
    this.countdownRemaining = 3.0;
    this.countdownStep = 3;

    if (this.ui.countdownText) {
      this.ui.countdownText.textContent = '3';
    }

    this.soundManager.playCountdownBeep(false);
    this.setState(GAME_STATES.COUNTDOWN);
  }

  /**
   * Advances countdown simulation tick
   * @param {number} dt Delta time in seconds
   */
  updateCountdown(dt) {
    if (this.state !== GAME_STATES.COUNTDOWN) return;

    this.countdownRemaining -= dt;

    if (this.countdownRemaining <= 2.0 && this.countdownStep === 3) {
      this.countdownStep = 2;
      if (this.ui.countdownText) this.ui.countdownText.textContent = '2';
      this.soundManager.playCountdownBeep(false);
    } else if (this.countdownRemaining <= 1.0 && this.countdownStep === 2) {
      this.countdownStep = 1;
      if (this.ui.countdownText) this.ui.countdownText.textContent = '1';
      this.soundManager.playCountdownBeep(false);
    } else if (this.countdownRemaining <= 0.0 && this.countdownStep === 1) {
      this.countdownStep = 0;
      if (this.ui.countdownText) this.ui.countdownText.textContent = 'GO!';
      this.soundManager.playCountdownBeep(true);
      this.setState(GAME_STATES.RACING);

      // Hide countdown overlay shortly after GO
      setTimeout(() => {
        if (this.state !== GAME_STATES.COUNTDOWN && this.ui.countdownOverlay) {
          this.ui.countdownOverlay.classList.add('hidden');
        }
      }, 700);
    }
  }

  /**
   * Pauses the game
   */
  pause() {
    if (this.state === GAME_STATES.RACING) {
      this.setState(GAME_STATES.PAUSED);
    }
  }

  /**
   * Resumes the game
   */
  resume() {
    if (this.state === GAME_STATES.PAUSED) {
      this.setState(GAME_STATES.RACING);
    }
  }

  /**
   * Toggles pause / resume
   */
  togglePause() {
    if (this.state === GAME_STATES.RACING) {
      this.pause();
    } else if (this.state === GAME_STATES.PAUSED) {
      this.resume();
    }
  }

  /**
   * Completes race and transitions to FINISH state
   */
  finishRace() {
    this.raceManager.isFinished = true;
    this.setState(GAME_STATES.FINISH);
  }

  /**
   * Populates finish leaderboard table and rank callout
   * @private
   */
  _populateLeaderboard() {
    const leaderboard = this.raceManager.getLeaderboard();

    // Callout (e.g. "1ST PLACE")
    const standings = this.raceManager.getStandings();
    const playerRank = standings.rank || 1;
    const ordinal = RaceManager.getOrdinal(playerRank);

    if (this.ui.finishRankCallout) {
      this.ui.finishRankCallout.textContent = `${ordinal} PLACE`;
    }

    if (this.ui.finishTitle) {
      this.ui.finishTitle.textContent = playerRank === 1 ? 'VICTORY' : 'RACE FINISHED';
    }

    // Populate table rows
    if (this.ui.leaderboardBody && Array.isArray(leaderboard)) {
      let rowsHtml = '';
      for (const row of leaderboard) {
        const isPlayer = row.isPlayer;
        const colorStyle = `color: ${row.color || (isPlayer ? '#00f0ff' : '#ff007f')};`;
        const rowClass = isPlayer ? 'style="background: rgba(0, 240, 255, 0.15); font-weight: bold;"' : '';

        rowsHtml += `
          <tr ${rowClass}>
            <td style="${colorStyle}">${row.rank}</td>
            <td style="${colorStyle}">${row.name}</td>
            <td>${row.formattedTotalTime}</td>
            <td>${row.formattedBestLapTime}</td>
          </tr>
        `;
      }
      this.ui.leaderboardBody.innerHTML = rowsHtml;
    }
  }

  /**
   * Shows temporary banner notification on HUD
   * @param {string} text
   * @param {number} [duration=2000]
   */
  showNotification(text, duration = 2000) {
    if (!this.ui.hudNotification) return;
    this.ui.hudNotification.textContent = text;
    this.ui.hudNotification.style.opacity = '1';

    if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
    this.notificationTimeout = setTimeout(() => {
      if (this.ui.hudNotification) {
        this.ui.hudNotification.style.opacity = '0';
      }
    }, duration);
  }

  /**
   * Resets vehicle grid positions and race state
   */
  resetStartingGrid() {
    // 1. Reset Player
    const playerSlot = this.gridSlots.find(s => s.name === 'Player') || { distOffset: 5, laneOffset: 3.5 };
    const playerT = playerSlot.distOffset / this.trackMath.totalLength;
    const playerPt = this.trackMath.getSplinePoint(playerT);
    const playerNorm = this.trackMath.getNormalAt(playerT);
    const playerTan = this.trackMath.getSplineTangent(playerT);

    const initialPlayerPos = {
      x: playerPt.x + playerNorm.x * playerSlot.laneOffset,
      y: playerPt.y + 0.35,
      z: playerPt.z + playerNorm.z * playerSlot.laneOffset
    };
    const initialPlayerHeading = Math.atan2(playerTan.x, playerTan.z);

    this.playerCar.physics.position.set(initialPlayerPos.x, initialPlayerPos.y, initialPlayerPos.z);
    this.playerCar.physics.heading = initialPlayerHeading;
    this.playerCar.physics.speed = 0;
    this.playerCar.physics.velocity.set(0, 0, 0);
    this.playerCar.physics.steerAngle = 0;
    this.playerCar.physics.distanceAlongTrack = playerSlot.distOffset;
    this.playerCar.physics.splineProgress = playerT;
    this.playerCar.physics.lateralDistance = 0;
    this.playerCar.physics.nitroLevel = 100.0;
    this.playerCar.physics.isBoosting = false;
    this.playerCar.physics.isDrifting = false;
    this.playerCar.physics.driftAngle = 0;
    this.playerCar.physics.driftDuration = 0;
    this.playerCar.physics.lateralSlip = 0;
    this.playerCar.physics.hasMiniTurbo = false;
    this.playerCar.physics.isBraking = false;
    this.playerCar.physics.hasCollidedBarrier = false;
    this.playerCar.currentLap = 1;
    this.playerCar.previousProgress = playerT;
    this.playerCar.pitch = 0;
    this.playerCar.roll = 0;

    if (this.playerCar.mesh) {
      this.playerCar.mesh.position.set(initialPlayerPos.x, initialPlayerPos.y, initialPlayerPos.z);
      if (typeof this.playerCar.mesh.rotation.set === 'function') {
        this.playerCar.mesh.rotation.set(0, initialPlayerHeading, 0);
      } else {
        this.playerCar.mesh.rotation.x = 0;
        this.playerCar.mesh.rotation.y = initialPlayerHeading;
        this.playerCar.mesh.rotation.z = 0;
      }
      if (typeof this.playerCar.mesh.setSteering === 'function') {
        this.playerCar.mesh.setSteering(0);
      }
      if (typeof this.playerCar.mesh.setBraking === 'function') {
        this.playerCar.mesh.setBraking(false);
      }
    }

    // 2. Reset AI Rivals
    for (let i = 0; i < this.aiCars.length; i++) {
      const ai = this.aiCars[i];
      const slot = this.gridSlots.find(s => s.name === ai.name) || {
        distOffset: 14 + i * 9,
        laneOffset: (i % 2 === 0 ? -3.5 : 3.5)
      };

      ai.resetToTrack(this.trackMath, slot.distOffset, slot.laneOffset);
    }

    this._lastNotifiedLap = 1;
  }

  /**
   * Restarts the entire race
   */
  restartRace() {
    this.raceManager.reset();
    this.resetStartingGrid();
    this._lastNotifiedLap = 1;
    this.startCountdown();
  }

  /**
   * Fixed 60Hz physics tick decoupled from rendering frame
   * @param {number} dt Delta time (1/60s)
   */
  stepPhysics(dt = 1 / 60) {
    if (this.state !== GAME_STATES.RACING && this.state !== GAME_STATES.FINISH) return;

    // 1. Get input state
    const input = this.inputManager?.getInputState
      ? this.inputManager.getInputState()
      : (this.inputManager?.getState ? this.inputManager.getState() : (this.inputManager?.state?.getState ? this.inputManager.state.getState() : (this.inputManager?.state || {})));

    // Check single-frame reset pulse
    if (input.reset) {
      this.playerCar.resetToTrack(this.trackMath);
      if (this.inputManager?.state) {
        this.inputManager.state._reset = false;
        this.inputManager.state._virtualReset = false;
      }
    }

    // 2. Update Player Car physics
    const activeInput = this.state === GAME_STATES.RACING ? input : { throttle: 0, brake: 0.5, steer: 0, drift: false, nitro: false };
    this.playerCar.update(dt, this.trackMath, activeInput);

    // Collision response: camera trauma & crash sound
    if (this.playerCar.hasCollidedBarrier) {
      if (this.cameraController) {
        this.cameraController.addTrauma(0.4);
      }
      this.soundManager.playCrash();
      if (this.particleSystem) {
        this.particleSystem.emitDriftSparks(this.playerCar.position, this.playerCar.velocity);
      }
    }

    // 3. Update 5 AI Rivals
    const allVehicles = [this.playerCar, ...this.aiCars];
    const playerTotalDist = (Math.max(1, this.raceManager.currentLap) - 1) * this.trackMath.totalLength + (this.playerCar.physics.distanceAlongTrack || 0);
    for (const ai of this.aiCars) {
      ai.update(
        dt,
        this.trackMath,
        this.playerCar.position,
        playerTotalDist,
        allVehicles
      );
    }

    // 4. Update Race Manager (lap timing, checkpoints, slipstream drafting, standings)
    this.raceManager.update(dt, this.playerCar, this.aiCars, this.trackMath);

    // 5. Modulate Procedural Web Audio
    if (this.soundManager.isInitialized) {
      const isAccelerating = (activeInput.throttle || 0) > 0.05;
      this.soundManager.updateEngine(this.playerCar.getSpeed(), isAccelerating);

      const driftIntensity = this.playerCar.isDrifting
        ? Math.min(1.0, Math.abs(this.playerCar.driftAngle) / 0.35)
        : 0;
      this.soundManager.setDriftScreech(driftIntensity);
      this.soundManager.triggerNitro(this.playerCar.isBoosting);
    }

    // 6. Particle system emissions
    if (this.particleSystem) {
      // Dual exhaust pipes
      const exhausts = this.playerCar.getExhaustPositions();
      for (const ep of exhausts) {
        this.particleSystem.emitExhaust(ep, this.playerCar.velocity, null, this.playerCar.isBoosting);
      }

      // Drift sparks and smoke
      if (this.playerCar.isDrifting) {
        const tires = this.playerCar.getRearTirePositions();
        for (const tp of tires) {
          this.particleSystem.emitDriftSparks(tp, this.playerCar.velocity);
        }
      }

      // Speed streak lines (> 180 km/h or boosting)
      const isSpeeding = this.playerCar.getSpeed() >= 48.0 || this.playerCar.isBoosting;
      const camPos = this.camera?.position || { x: 0, y: 3, z: 0 };
      const fwd = this.playerCar.getHeadingVector();
      this.particleSystem.updateSpeedLines(camPos, fwd, isSpeeding);

      this.particleSystem.update(dt);
    }

    // 7. Update HUD bindings
    this._updateHUD();

    // 8. Check race finish
    if (this.raceManager.isFinished && this.state === GAME_STATES.RACING) {
      this.finishRace();
    }
  }

  /**
   * Updates all HUD DOM readouts
   * @private
   */
  _updateHUD() {
    const raceInfo = this.raceManager.getRaceInfo();
    const standings = this.raceManager.getStandings();
    const rankOrdinal = RaceManager.getOrdinal(standings.rank || 1);

    // Position (e.g. 1ST/6)
    if (this.ui.hudPosition) {
      this.ui.hudPosition.innerHTML = `${rankOrdinal}<span class="hud-sub">/6</span>`;
    }

    // Lap (e.g. 1/3 or FINAL LAP)
    if (this.ui.hudLap) {
      if (raceInfo.isFinalLap) {
        this.ui.hudLap.textContent = 'FINAL LAP';
      } else {
        this.ui.hudLap.textContent = `${raceInfo.currentLap}/${raceInfo.totalLaps}`;
      }
    }

    // Timer & Best Lap
    if (this.ui.hudTimer) {
      this.ui.hudTimer.textContent = RaceManager.formatTime(raceInfo.lapTime);
    }
    if (this.ui.hudBestLap) {
      this.ui.hudBestLap.textContent = RaceManager.formatTime(raceInfo.bestLapTime);
    }

    // Speedometer (display absolute speed in km/h for both forward and reverse)
    if (this.ui.hudSpeed) {
      this.ui.hudSpeed.textContent = String(Math.round(Math.abs(this.playerCar.getSpeed()) * 3.6));
    }

    // Nitro meter fill
    if (this.ui.hudNitroFill) {
      const nitroPct = Math.max(0, Math.min(100, this.playerCar.getNitroLevel()));
      this.ui.hudNitroFill.style.width = `${nitroPct}%`;
    }

    // Lap change banner notification
    if (this._lastNotifiedLap !== raceInfo.currentLap && raceInfo.currentLap > 1) {
      this._lastNotifiedLap = raceInfo.currentLap;
      this.showNotification(raceInfo.isFinalLap ? 'FINAL LAP!' : `LAP ${raceInfo.currentLap} / ${raceInfo.totalLaps}`, 1500);
    }

    // Notifications (mini-turbo, drafting)
    if (this.playerCar.hasMiniTurbo) {
      this.showNotification('MINI-TURBO BOOST!', 800);
    } else if (raceInfo.isDrafting) {
      this.showNotification('SLIPSTREAM DRAFTING!', 500);
    }
  }

  /**
   * Starts animation loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const loop = (currentTime) => {
      if (!this.isRunning) return;

      this.animationFrameId = (typeof requestAnimationFrame === 'function')
        ? requestAnimationFrame(loop)
        : null;

      const now = currentTime || (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const dtSec = Math.min((now - this.lastFrameTime) / 1000, this.maxAccumulator);
      this.lastFrameTime = now;
      this.totalElapsedTime += dtSec;

      // 1. Countdown update
      if (this.state === GAME_STATES.COUNTDOWN) {
        this.updateCountdown(dtSec);
      }

      // 2. Decoupled fixed 60Hz physics accumulator loop
      //    Cap accumulator to maxAccumulator to prevent spiral-of-death
      //    (if physics can't keep up, we drop frames rather than freeze)
      if (this.state === GAME_STATES.RACING) {
        this.physicsAccumulator += dtSec;
        if (this.physicsAccumulator > this.maxAccumulator) {
          this.physicsAccumulator = this.maxAccumulator;
        }
        while (this.physicsAccumulator >= this.fixedDt) {
          this.stepPhysics(this.fixedDt);
          this.physicsAccumulator -= this.fixedDt;
        }
      } else if (this.state === GAME_STATES.FINISH) {
        // Slow-motion physics accumulator in finish
        this.physicsAccumulator += dtSec * 0.35;
        if (this.physicsAccumulator > this.maxAccumulator) {
          this.physicsAccumulator = this.maxAccumulator;
        }
        while (this.physicsAccumulator >= this.fixedDt) {
          this.stepPhysics(this.fixedDt);
          this.physicsAccumulator -= this.fixedDt;
        }
      }

      // 3. Input processing & Camera update
      const input = this.inputManager?.getInputState
        ? this.inputManager.getInputState()
        : (this.inputManager?.getState ? this.inputManager.getState() : (this.inputManager?.state?.getState ? this.inputManager.state.getState() : (this.inputManager?.state || null)));

      if (input?.pause && (this.state === GAME_STATES.RACING || this.state === GAME_STATES.PAUSED)) {
        this.togglePause();
        if (this.inputManager?.state) {
          this.inputManager.state._pause = false;
          this.inputManager.state._virtualPause = false;
        }
      }
      if (input?.reset && this.state === GAME_STATES.RACING) {
        this.playerCar.resetToTrack(this.trackMath);
        if (this.inputManager?.state) {
          this.inputManager.state._reset = false;
          this.inputManager.state._virtualReset = false;
        }
      }

      if (this.cameraController) {
        this.cameraController.update(
          this.playerCar,
          dtSec,
          input
        );
      }

      // 4. Environment animations (sun pulse, horizon breathing, ground grid)
      if (this.environment) {
        this.environment.update(this.totalElapsedTime, dtSec, this.camera);
      }

      // 5. Render Three.js WebGL Scene
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }

      // 6. Draw 2D Vector Minimap
      if (this.minimapRenderer) {
        this.minimapRenderer.draw(this.playerCar, this.aiCars, this.totalElapsedTime);
      }

      // 7. Reset single-frame input pulses for next frame
      if (this.inputManager && typeof this.inputManager.update === 'function') {
        this.inputManager.update();
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      this.animationFrameId = requestAnimationFrame(loop);
    }
  }

  /**
   * Stops animation loop
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Clean disposal
   */
  dispose() {
    this.stop();

    if (this._onResize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._onResize);
    }

    if (this._onKeyDown && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
    }

    if (this.inputManager && typeof this.inputManager.destroy === 'function') {
      this.inputManager.destroy();
    }

    if (this.environment && typeof this.environment.dispose === 'function') {
      this.environment.dispose();
    }

    if (this.particleSystem && typeof this.particleSystem.dispose === 'function') {
      this.particleSystem.dispose();
    }

    if (this.soundManager) {
      if (typeof this.soundManager.dispose === 'function') {
        this.soundManager.dispose();
      } else if (typeof this.soundManager.stopMusic === 'function') {
        this.soundManager.stopMusic();
      }
    }

    if (this.renderer && typeof this.renderer.dispose === 'function') {
      this.renderer.dispose();
    }
  }
}

// ============================================================================
// Browser Auto-Initialization Entry Point
// ============================================================================

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const initGame = () => {
    try {
      window.game = new Game();
    } catch (err) {
      console.error('Failed to initialize Synthwave Racer:', err);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
  } else {
    initGame();
  }
}
