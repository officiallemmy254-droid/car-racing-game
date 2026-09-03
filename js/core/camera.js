/**
 * 3D Synthwave Circuit Racer — Dynamic Chase Camera Controller
 * Provides:
 * - 3 Dynamic camera presets: CHASE, CLOSE, BUMPER
 * - Velocity lag tracking with smooth position lerp & lookahead
 * - Dynamic FOV kick: 60° base expanding to 78° under nitro boost / high speed
 * - Trauma-based collision screen shake model with quadratic decay
 * - Menu showcase orbit mode for title and vehicle selection screens
 */

let defaultThree = globalThis.THREE || null;
try {
  const threeModule = await import('three');
  defaultThree = threeModule.default || threeModule;
} catch (e) {
  // Graceful fallback for headless Node.js testing
}

/**
 * Camera preset modes
 */
export const CAMERA_MODES = {
  CHASE: 'CHASE',
  CLOSE: 'CLOSE',
  BUMPER: 'BUMPER'
};

/**
 * Specifications for each camera mode
 */
export const CAMERA_PRESETS = {
  [CAMERA_MODES.CHASE]: {
    name: 'CHASE',
    distance: 7.5,        // Behind car ~7.5m
    height: 2.8,          // Above ground/car ~2.8m
    lookAhead: 6.0,       // Look target ahead along heading ~6.0m
    lookHeight: 1.2,      // Look target height ~1.2m
    lerpSpeed: 10.0,      // Position follow stiffness
    lookLerpSpeed: 14.0,  // LookAt follow stiffness
    lagFactor: 0.035      // Speed-based lag stretch
  },
  [CAMERA_MODES.CLOSE]: {
    name: 'CLOSE',
    distance: 5.0,        // Behind car ~5.0m
    height: 1.8,          // Above ground/car ~1.8m
    lookAhead: 5.0,       // Look target ahead ~5.0m
    lookHeight: 1.0,      // Look target height ~1.0m
    lerpSpeed: 14.0,      // Snappier follow
    lookLerpSpeed: 18.0,
    lagFactor: 0.02
  },
  [CAMERA_MODES.BUMPER]: {
    name: 'BUMPER',
    distance: 0.2,        // Near front nose (~0.2m behind bumper)
    height: 0.9,          // Low hood height ~0.9m
    lookAhead: 15.0,      // Horizon look target ~15.0m
    lookHeight: 0.8,
    lerpSpeed: 25.0,      // Rigid mount feel
    lookLerpSpeed: 25.0,
    lagFactor: 0.0
  }
};

export class CameraController {
  /**
   * @param {object} [camera=null] Three.js PerspectiveCamera or mock camera
   * @param {object} [options={}] Configuration options
   */
  constructor(camera = null, options = {}) {
    this.options = options;
    this.camera = camera || this._createDefaultCamera();

    // Mode configuration
    this.currentMode = options.defaultMode || CAMERA_MODES.CHASE;
    this.modes = [CAMERA_MODES.CHASE, CAMERA_MODES.CLOSE, CAMERA_MODES.BUMPER];

    // FOV dynamics
    this.baseFov = options.baseFov ?? 60.0;
    this.maxFov = options.maxFov ?? 78.0;
    this.currentFov = this.camera.fov ?? this.baseFov;
    this.fovLerpSpeed = options.fovLerpSpeed ?? 5.5;

    // Trauma screen shake model (Squirrel Eiserloh model)
    this.trauma = 0.0;
    this.traumaDecay = options.traumaDecay ?? 1.8;   // Trauma decays to 0 in ~0.55s
    this.maxShakeOffset = options.maxShakeOffset ?? 0.45; // Max translation shake in meters
    this.shakeTime = 0.0;

    // Tracking & smoothing state
    this.initialized = false;
    this.currentLookAt = { x: 0, y: 1.2, z: 6.0 };
    this._lastBarrierCollided = false;

    // Menu orbit mode
    this.isMenuMode = false;
    this.menuCenter = { x: 0, y: 0.35, z: 0 };
    this.orbitAngle = 0.0;
    this.orbitSpeed = options.orbitSpeed ?? 0.35;    // ~20 degrees/sec
    this.orbitRadius = options.orbitRadius ?? 7.8;
    this.orbitHeight = options.orbitHeight ?? 2.2;
  }

  /**
   * Fallback camera factory
   * @private
   */
  _createDefaultCamera() {
    if (defaultThree && defaultThree.PerspectiveCamera) {
      return new defaultThree.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
    }
    // Minimal headless object
    return {
      fov: 60,
      position: {
        x: 0, y: 0, z: 0,
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
        clone() { return { x: this.x, y: this.y, z: this.z }; },
        copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      },
      rotation: {
        x: 0, y: 0, z: 0,
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      },
      lookAt(x, y, z) { this.target = typeof x === 'object' ? x : { x, y, z }; },
      updateProjectionMatrix() {}
    };
  }

  /**
   * Get active mode name
   */
  get mode() {
    return this.currentMode;
  }

  /**
   * Cycle to next camera mode (CHASE -> CLOSE -> BUMPER -> CHASE)
   * @returns {string} New camera mode
   */
  switchView() {
    const currentIndex = this.modes.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % this.modes.length;
    this.currentMode = this.modes[nextIndex];
    return this.currentMode;
  }

  /**
   * Set specific camera mode
   * @param {string} mode
   */
  setMode(mode) {
    if (this.modes.includes(mode)) {
      this.currentMode = mode;
      return true;
    }
    return false;
  }

  /**
   * Add impact trauma for screen shake [0.0, 1.0]
   * @param {number} amount
   */
  addTrauma(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return;
    this.trauma = Math.max(0.0, Math.min(1.0, this.trauma + amount));
  }

  /**
   * Activate or deactivate rotating menu showcase orbit
   * @param {boolean} active
   * @param {{x: number, y: number, z: number}} [centerPos=null]
   */
  setMenuMode(active, centerPos = null) {
    this.isMenuMode = !!active;
    if (centerPos) {
      this.menuCenter = {
        x: centerPos.x ?? 0,
        y: centerPos.y ?? 0.35,
        z: centerPos.z ?? 0
      };
    }
  }

  /**
   * Snap camera directly to ideal target without smoothing
   */
  snap() {
    this.initialized = false;
  }

  /**
   * Helper to invoke camera lookAt compatibly
   * @private
   */
  _lookAt(x, y, z) {
    if (!this.camera || typeof this.camera.lookAt !== 'function') return;
    try {
      this.camera.lookAt(x, y, z);
    } catch (e) {
      this.camera.lookAt({ x, y, z });
    }
  }

  /**
   * Extract standardized vehicle kinematics
   * @private
   */
  _extractCarData(targetCar) {
    if (!targetCar) {
      return {
        pos: { x: 0, y: 0.35, z: 0 },
        heading: 0,
        speed: 0,
        isBoosting: false,
        hasCollidedBarrier: false
      };
    }

    const phys = targetCar.physics || targetCar;
    const mesh = targetCar.mesh || targetCar;

    const rawPos = phys.position || mesh.position || targetCar.position || { x: 0, y: 0.35, z: 0 };
    const pos = {
      x: rawPos.x ?? 0,
      y: rawPos.y ?? 0.35,
      z: rawPos.z ?? 0
    };

    const heading = phys.heading ?? mesh.rotation?.y ?? targetCar.heading ?? 0;
    const speed = typeof targetCar.getSpeed === 'function' ? targetCar.getSpeed() : (phys.speed ?? targetCar.speed ?? 0);
    const isBoosting = !!(phys.isBoosting ?? targetCar.isBoosting);
    const hasCollidedBarrier = !!(phys.hasCollidedBarrier ?? targetCar.hasCollidedBarrier);

    return { pos, heading, speed, isBoosting, hasCollidedBarrier };
  }

  /**
   * Frame update for camera position, orientation, FOV, and screen shake
   * @param {object} targetCar Player vehicle or car controller
   * @param {number} [dt=1/60] Frame delta time
   * @param {object} [inputState=null] Optional input snapshot to handle switchCam
   */
  update(targetCar, dt = 1 / 60, inputState = null) {
    const delta = (typeof dt === 'number' && dt > 0 && dt < 1.0) ? dt : 1 / 60;

    // Handle view switch input pulse
    if (inputState && inputState.switchCam) {
      this.switchView();
    }

    // --------------------------------------------------------
    // A. Menu Orbit Mode
    // --------------------------------------------------------
    if (this.isMenuMode) {
      this.orbitAngle += this.orbitSpeed * delta;
      const center = (targetCar && targetCar.physics?.position) || this.menuCenter;

      const camX = center.x + Math.sin(this.orbitAngle) * this.orbitRadius;
      const camY = center.y + this.orbitHeight;
      const camZ = center.z + Math.cos(this.orbitAngle) * this.orbitRadius;

      if (typeof this.camera.position.set === 'function') {
        this.camera.position.set(camX, camY, camZ);
      } else {
        this.camera.position.x = camX;
        this.camera.position.y = camY;
        this.camera.position.z = camZ;
      }

      this._lookAt(center.x, center.y + 0.6, center.z);

      // Keep FOV steady at base FOV
      this.currentFov = this.baseFov;
      if (this.camera.fov !== undefined) {
        this.camera.fov = this.baseFov;
        if (typeof this.camera.updateProjectionMatrix === 'function') {
          this.camera.updateProjectionMatrix();
        }
      }
      return;
    }

    // --------------------------------------------------------
    // B. Racing Gameplay Camera
    // --------------------------------------------------------
    const { pos, heading, speed, isBoosting, hasCollidedBarrier } = this._extractCarData(targetCar);

    // Collision trigger
    if (hasCollidedBarrier && !this._lastBarrierCollided) {
      this.addTrauma(0.5);
    }
    this._lastBarrierCollided = hasCollidedBarrier;

    // 1. Dynamic FOV Kick
    let targetFov = this.baseFov;
    if (isBoosting) {
      targetFov = this.maxFov; // 78 degrees
    } else {
      // Scale from 60 up to ~70 based on normal top speed (52.8 m/s)
      const speedRatio = Math.min(1.0, Math.max(0, Math.abs(speed) / 52.8));
      targetFov = this.baseFov + speedRatio * (70.0 - this.baseFov);
    }

    this.currentFov += (targetFov - this.currentFov) * Math.min(1.0, this.fovLerpSpeed * delta);
    if (this.camera.fov !== undefined) {
      this.camera.fov = this.currentFov;
      if (typeof this.camera.updateProjectionMatrix === 'function') {
        this.camera.updateProjectionMatrix();
      }
    }

    // 2. Trauma Decay
    if (this.trauma > 0) {
      this.trauma = Math.max(0.0, this.trauma - this.traumaDecay * delta);
    }

    // 3. Compute Preset Targets & Velocity Lag
    const preset = CAMERA_PRESETS[this.currentMode] || CAMERA_PRESETS[CAMERA_MODES.CHASE];
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);

    let idealCamX, idealCamY, idealCamZ;

    if (this.currentMode === CAMERA_MODES.BUMPER) {
      // Positioned on the front nose hood (~2.0m forward from car center, 0.2m behind bumper)
      const forwardOffset = 2.0 - preset.distance;
      idealCamX = pos.x + forwardX * forwardOffset;
      idealCamY = pos.y + preset.height;
      idealCamZ = pos.z + forwardZ * forwardOffset;
    } else {
      // Behind car with velocity lag extension
      const velocityLag = Math.max(0, speed) * (preset.lagFactor || 0.035);
      const effectiveDist = preset.distance + velocityLag;

      idealCamX = pos.x - forwardX * effectiveDist;
      idealCamY = pos.y + preset.height;
      idealCamZ = pos.z - forwardZ * effectiveDist;
    }

    // 4. Smooth Position Lerp
    if (!this.initialized) {
      if (typeof this.camera.position.set === 'function') {
        this.camera.position.set(idealCamX, idealCamY, idealCamZ);
      } else {
        this.camera.position.x = idealCamX;
        this.camera.position.y = idealCamY;
        this.camera.position.z = idealCamZ;
      }
      this.currentLookAt = {
        x: pos.x + forwardX * preset.lookAhead,
        y: pos.y + preset.lookHeight,
        z: pos.z + forwardZ * preset.lookAhead
      };
      this.initialized = true;
    } else {
      const posLerp = 1.0 - Math.exp(-preset.lerpSpeed * delta);
      this.camera.position.x += (idealCamX - this.camera.position.x) * posLerp;
      this.camera.position.y += (idealCamY - this.camera.position.y) * posLerp;
      this.camera.position.z += (idealCamZ - this.camera.position.z) * posLerp;
    }

    // 5. Lookahead Target Smoothing
    const targetLookX = pos.x + forwardX * preset.lookAhead;
    const targetLookY = pos.y + preset.lookHeight;
    const targetLookZ = pos.z + forwardZ * preset.lookAhead;

    const lookLerp = 1.0 - Math.exp(-preset.lookLerpSpeed * delta);
    this.currentLookAt.x += (targetLookX - this.currentLookAt.x) * lookLerp;
    this.currentLookAt.y += (targetLookY - this.currentLookAt.y) * lookLerp;
    this.currentLookAt.z += (targetLookZ - this.currentLookAt.z) * lookLerp;

    // 6. Trauma Screen Shake Application
    this.shakeTime += delta;
    const shake = this.trauma * this.trauma;

    if (shake > 0.0001) {
      const shakeX = (Math.sin(this.shakeTime * 46.0) * 0.7 + (Math.random() * 0.6 - 0.3)) * this.maxShakeOffset * shake;
      const shakeY = (Math.cos(this.shakeTime * 38.0) * 0.7 + (Math.random() * 0.6 - 0.3)) * this.maxShakeOffset * shake;
      const shakeZ = (Math.sin(this.shakeTime * 54.0) * 0.7 + (Math.random() * 0.6 - 0.3)) * this.maxShakeOffset * shake;

      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;
      this.camera.position.z += shakeZ;
    }

    // Direct camera to smoothed look target
    this._lookAt(this.currentLookAt.x, this.currentLookAt.y, this.currentLookAt.z);
  }
}
