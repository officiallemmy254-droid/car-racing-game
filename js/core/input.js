/**
 * 3D Synthwave Circuit Racer — Input Controller & Manager
 * Provides:
 * - InputState: Pure, headless-testable state machine mapping keyboard codes and
 *   virtual inputs to driving actions (throttle, brake, steer, drift, nitro, reset, switchCam, pause).
 * - InputManager: Browser wrapper binding window events (keydown, keyup, blur) and
 *   rendering a responsive touch control overlay for mobile screens.
 */

export class InputState {
  constructor() {
    this.activeKeys = new Set();

    // Pulses (single-frame/press triggers)
    this._switchCam = false;
    this._reset = false;
    this._pause = false;

    // Virtual analog / touch states
    this._virtualThrottle = 0;
    this._virtualBrake = 0;
    this._virtualSteer = 0;
    this._virtualDrift = false;
    this._virtualNitro = false;
    this._virtualSwitchCam = false;
    this._virtualReset = false;
    this._virtualPause = false;
  }

  /**
   * Normalizes KeyboardEvent code or key string
   * @private
   */
  _normalizeCode(raw) {
    if (!raw) return '';
    const val = typeof raw === 'string' ? raw : (raw.code || raw.key || '');
    return val.trim();
  }

  /**
   * Handle keydown event
   * @param {string|KeyboardEvent} eventOrCode
   */
  handleKeyDown(eventOrCode) {
    const code = this._normalizeCode(eventOrCode);
    if (!code) return;

    const lower = code.toLowerCase();
    const wasPressed = this.activeKeys.has(code);

    // Register pulses on fresh key press (avoid key repeat re-triggering)
    if (!wasPressed) {
      if (lower === 'keyc' || lower === 'c') {
        this._switchCam = true;
      } else if (lower === 'keyr' || lower === 'r') {
        this._reset = true;
      } else if (lower === 'escape' || lower === 'esc' || lower === 'keyp' || lower === 'p') {
        this._pause = true;
      }
    }

    this.activeKeys.add(code);
  }

  /**
   * Handle keyup event
   * @param {string|KeyboardEvent} eventOrCode
   */
  handleKeyUp(eventOrCode) {
    const code = this._normalizeCode(eventOrCode);
    if (!code) return;

    this.activeKeys.delete(code);

    // Also delete any case-insensitive duplicates
    for (const key of this.activeKeys) {
      if (key.toLowerCase() === code.toLowerCase()) {
        this.activeKeys.delete(key);
      }
    }
  }

  /**
   * Helper to test if any of the given key codes are active
   * @private
   */
  _hasAnyKey(...keys) {
    for (const k of keys) {
      if (this.activeKeys.has(k)) return true;
      const lower = k.toLowerCase();
      for (const active of this.activeKeys) {
        if (active.toLowerCase() === lower) return true;
      }
    }
    return false;
  }

  /**
   * Throttle (0 to 1)
   */
  get throttle() {
    if (this._hasAnyKey('KeyW', 'ArrowUp', 'w')) {
      return 1;
    }
    return Math.max(0, Math.min(1, this._virtualThrottle));
  }

  /**
   * Brake / Reverse (0 to 1)
   */
  get brake() {
    if (this._hasAnyKey('KeyS', 'ArrowDown', 's')) {
      return 1;
    }
    return Math.max(0, Math.min(1, this._virtualBrake));
  }

  /**
   * Steering (-1 for Left, +1 for Right, 0 for Neutral)
   */
  get steer() {
    const left = this._hasAnyKey('KeyA', 'ArrowLeft', 'a') ? 1 : 0;
    const right = this._hasAnyKey('KeyD', 'ArrowRight', 'd') ? 1 : 0;
    const keySteer = right - left;

    if (keySteer !== 0) {
      return keySteer;
    }
    return Math.max(-1, Math.min(1, this._virtualSteer));
  }

  /**
   * Handbrake / Drift
   */
  get drift() {
    return this._hasAnyKey('Space', ' ') || this._virtualDrift;
  }

  /**
   * Nitro Boost
   */
  get nitro() {
    return this._hasAnyKey('ShiftLeft', 'ShiftRight', 'Shift') || this._virtualNitro;
  }

  /**
   * Camera mode switch pulse
   */
  get switchCam() {
    return this._switchCam || this._virtualSwitchCam;
  }

  /**
   * Car reset pulse
   */
  get reset() {
    return this._reset || this._virtualReset;
  }

  /**
   * Game pause pulse
   */
  get pause() {
    return this._pause || this._virtualPause;
  }

  /**
   * Reset pulse triggers (invoked once per frame after consumption)
   */
  resetPulses() {
    this._switchCam = false;
    this._reset = false;
    this._pause = false;
    this._virtualSwitchCam = false;
    this._virtualReset = false;
    this._virtualPause = false;
  }

  /**
   * Reset all keys and virtual inputs (e.g. on window blur)
   */
  resetAll() {
    this.activeKeys.clear();
    this.resetPulses();
    this._virtualThrottle = 0;
    this._virtualBrake = 0;
    this._virtualSteer = 0;
    this._virtualDrift = false;
    this._virtualNitro = false;
  }

  // --- Virtual / Touch Control Setters ---

  setThrottle(val) {
    this._virtualThrottle = typeof val === 'number' ? val : (val ? 1 : 0);
  }

  setBrake(val) {
    this._virtualBrake = typeof val === 'number' ? val : (val ? 1 : 0);
  }

  setSteer(val) {
    this._virtualSteer = typeof val === 'number' ? val : 0;
  }

  setDrift(val) {
    this._virtualDrift = !!val;
  }

  setNitro(val) {
    this._virtualNitro = !!val;
  }

  triggerSwitchCam() {
    this._virtualSwitchCam = true;
  }

  triggerReset() {
    this._virtualReset = true;
  }

  triggerPause() {
    this._virtualPause = true;
  }

  /**
   * Returns a complete state snapshot
   * @returns {{ throttle: number, brake: number, steer: number, drift: boolean, nitro: boolean, reset: boolean, switchCam: boolean, pause: boolean }}
   */
  getState() {
    return {
      throttle: this.throttle,
      brake: this.brake,
      steer: this.steer,
      drift: this.drift,
      nitro: this.nitro,
      reset: this.reset,
      switchCam: this.switchCam,
      pause: this.pause
    };
  }
}

export class InputManager {
  /**
   * @param {object} [options={}]
   * @param {boolean} [options.enableTouch] Force enable or disable touch controls
   * @param {HTMLElement} [options.domElement] Target container for touch overlay
   */
  constructor(options = {}) {
    this.options = options;
    this.state = new InputState();
    this.touchContainer = null;
    this._listeners = [];

    if (typeof window !== 'undefined') {
      this._initKeyboardListeners();

      const hasTouch = ('ontouchstart' in window) || (navigator?.maxTouchPoints > 0);
      const shouldEnableTouch = options.enableTouch !== undefined ? options.enableTouch : hasTouch;

      if (shouldEnableTouch) {
        this._initTouchControls(options.domElement);
      }
    }
  }

  /**
   * Get current input state snapshot
   */
  getInputState() {
    return this.state.getState();
  }

  /**
   * Frame update — clears one-shot pulse flags
   */
  update() {
    this.state.resetPulses();
  }

  /**
   * Register keyboard event listeners
   * @private
   */
  _initKeyboardListeners() {
    const onKeyDown = (e) => {
      // Prevent scrolling on Space / Arrow keys during gameplay
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.state.handleKeyDown(e);
    };

    const onKeyUp = (e) => {
      this.state.handleKeyUp(e);
    };

    const onBlur = () => {
      this.state.resetAll();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    this._listeners.push(
      { target: window, type: 'keydown', listener: onKeyDown },
      { target: window, type: 'keyup', listener: onKeyUp },
      { target: window, type: 'blur', listener: onBlur }
    );
  }

  /**
   * Build virtual touch controls for mobile screens
   * @private
   */
  _initTouchControls(targetElement) {
    if (typeof document === 'undefined') return;

    const parent = targetElement || document.getElementById('game-container') || document.body;

    const container = document.createElement('div');
    container.id = 'touch-controls';
    container.className = 'touch-controls-layer';
    container.innerHTML = `
      <style>
        .touch-controls-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 20;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding: 24px;
          user-select: none;
          -webkit-user-select: none;
        }
        .touch-group {
          display: flex;
          gap: 16px;
          pointer-events: auto;
        }
        .touch-btn {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(15, 8, 30, 0.7);
          border: 2px solid #00f0ff;
          box-shadow: 0 0 15px rgba(0, 240, 255, 0.4);
          color: #00f0ff;
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          font-size: 13px;
          display: flex;
          justify-content: center;
          align-items: center;
          touch-action: none;
          backdrop-filter: blur(4px);
        }
        .touch-btn:active, .touch-btn.active {
          background: #00f0ff;
          color: #05020f;
          box-shadow: 0 0 25px #00f0ff;
          transform: scale(0.95);
        }
        .touch-btn-pink {
          border-color: #ff007f;
          color: #ff007f;
          box-shadow: 0 0 15px rgba(255, 0, 128, 0.4);
        }
        .touch-btn-pink:active, .touch-btn-pink.active {
          background: #ff007f;
          color: #fff;
          box-shadow: 0 0 25px #ff007f;
        }
        .touch-top-bar {
          position: absolute;
          top: 16px;
          right: 180px;
          display: flex;
          gap: 10px;
          pointer-events: auto;
        }
        .touch-btn-small {
          width: 44px;
          height: 44px;
          font-size: 11px;
        }
      </style>

      <!-- Steering Controls (Left Hand) -->
      <div class="touch-group touch-steering">
        <button id="touch-steer-left" class="touch-btn" aria-label="Steer Left">&larr;</button>
        <button id="touch-steer-right" class="touch-btn" aria-label="Steer Right">&rarr;</button>
      </div>

      <!-- Action Controls (Right Hand) -->
      <div class="touch-group touch-actions">
        <button id="touch-brake" class="touch-btn touch-btn-pink" aria-label="Brake">REV</button>
        <button id="touch-drift" class="touch-btn" aria-label="Drift">DRIFT</button>
        <button id="touch-nitro" class="touch-btn touch-btn-pink" aria-label="Nitro">NITRO</button>
        <button id="touch-gas" class="touch-btn" aria-label="Gas">GAS</button>
      </div>

      <!-- Utility Controls (Top Right) -->
      <div class="touch-top-bar">
        <button id="touch-cam" class="touch-btn touch-btn-small" aria-label="Camera">CAM</button>
        <button id="touch-reset" class="touch-btn touch-btn-small" aria-label="Reset">RST</button>
      </div>
    `;

    parent.appendChild(container);
    this.touchContainer = container;

    // Bind touch helpers
    const bindTouchAction = (selector, onDown, onUp) => {
      const btn = container.querySelector(selector);
      if (!btn) return;

      const handleDown = (e) => {
        e.preventDefault();
        btn.classList.add('active');
        onDown();
      };
      const handleUp = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        onUp();
      };

      btn.addEventListener('touchstart', handleDown, { passive: false });
      btn.addEventListener('touchend', handleUp, { passive: false });
      btn.addEventListener('touchcancel', handleUp, { passive: false });

      this._listeners.push(
        { target: btn, type: 'touchstart', listener: handleDown },
        { target: btn, type: 'touchend', listener: handleUp },
        { target: btn, type: 'touchcancel', listener: handleUp }
      );
    };

    // Bind buttons
    bindTouchAction('#touch-gas', () => this.state.setThrottle(1), () => this.state.setThrottle(0));
    bindTouchAction('#touch-brake', () => this.state.setBrake(1), () => this.state.setBrake(0));
    bindTouchAction('#touch-steer-left', () => this.state.setSteer(-1), () => this.state.setSteer(0));
    bindTouchAction('#touch-steer-right', () => this.state.setSteer(1), () => this.state.setSteer(0));
    bindTouchAction('#touch-nitro', () => this.state.setNitro(true), () => this.state.setNitro(false));
    bindTouchAction('#touch-drift', () => this.state.setDrift(true), () => this.state.setDrift(false));

    const camBtn = container.querySelector('#touch-cam');
    if (camBtn) {
      const onCamTouch = (e) => {
        e.preventDefault();
        this.state.triggerSwitchCam();
      };
      camBtn.addEventListener('touchstart', onCamTouch, { passive: false });
      this._listeners.push({ target: camBtn, type: 'touchstart', listener: onCamTouch });
    }

    const rstBtn = container.querySelector('#touch-reset');
    if (rstBtn) {
      const onRstTouch = (e) => {
        e.preventDefault();
        this.state.triggerReset();
      };
      rstBtn.addEventListener('touchstart', onRstTouch, { passive: false });
      this._listeners.push({ target: rstBtn, type: 'touchstart', listener: onRstTouch });
    }
  }

  /**
   * Cleanup event listeners and DOM elements
   */
  dispose() {
    for (const { target, type, listener } of this._listeners) {
      target.removeEventListener(type, listener);
    }
    this._listeners = [];

    if (this.touchContainer && this.touchContainer.parentNode) {
      this.touchContainer.parentNode.removeChild(this.touchContainer);
      this.touchContainer = null;
    }
  }
}
