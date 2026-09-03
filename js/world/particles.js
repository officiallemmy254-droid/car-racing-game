/**
 * 3D Synthwave Circuit Racer — Particle Systems & Speed Streaks
 * High-performance, zero-garbage-collection particle engine:
 * - Pre-allocated typed arrays for 60 FPS performance without GC stutter
 * - Dual exhaust trails: subtle neon idle exhaust vs high-energy nitro flame bursts
 * - Drift mechanics: bright glowing tire sparks and expanding neon smoke billows
 * - High-velocity peripheral speed streak lines active during boost or > 180 km/h
 * - Headless Node-compatible ES6 export
 */

let defaultThree = globalThis.THREE || null;
try {
  const threeModule = await import('three');
  defaultThree = threeModule.default || threeModule;
} catch (e) {
  // Headless test runner fallback
}

export class ParticleSystem {
  /**
   * Explicitly set Three.js instance if needed (e.g. for testing)
   * @param {object} threeInstance
   */
  static setThree(threeInstance) {
    defaultThree = threeInstance;
  }

  /**
   * Get currently active Three.js instance
   * @returns {object|null}
   */
  static getThree() {
    return defaultThree || globalThis.THREE || null;
  }

  /**
   * @param {object} scene - Three.js scene
   * @param {object} [options]
   * @param {number} [options.maxParticles=1200]
   * @param {number} [options.speedLineCount=60]
   * @param {object} [options.THREE]
   */
  constructor(scene, options = {}) {
    this.THREE = options.THREE || defaultThree || globalThis.THREE;
    if (!this.THREE) {
      throw new Error('Three.js library is required for ParticleSystem. Provide options.THREE or set globalThis.THREE.');
    }

    this.scene = scene;
    this.maxParticles = options.maxParticles || 1200;
    this.speedLineCount = options.speedLineCount || 60;

    // ---------------------------------------------------------
    // Pre-allocated Zero-GC Particle Pool Buffers
    // ---------------------------------------------------------
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.velocities = new Float32Array(this.maxParticles * 3);
    this.ages = new Float32Array(this.maxParticles);
    this.lifetimes = new Float32Array(this.maxParticles);
    this.startSizes = new Float32Array(this.maxParticles);
    this.endSizes = new Float32Array(this.maxParticles);
    this.startColors = new Float32Array(this.maxParticles * 3);
    this.endColors = new Float32Array(this.maxParticles * 3);
    this.drag = new Float32Array(this.maxParticles);
    this.gravity = new Float32Array(this.maxParticles);
    this.active = new Uint8Array(this.maxParticles);

    // O(1) free index stack
    this.freeIndices = new Int32Array(this.maxParticles);
    for (let i = 0; i < this.maxParticles; i++) {
      this.freeIndices[i] = i;
      // Initialize off-screen
      this.positions[i * 3 + 0] = 0;
      this.positions[i * 3 + 1] = -99999;
      this.positions[i * 3 + 2] = 0;
    }
    this.freeCount = this.maxParticles;
    this.activeCount = 0;
    this.lastAllocatedIndex = -1;

    // ---------------------------------------------------------
    // Three.js Point Cloud Mesh Setup
    // ---------------------------------------------------------
    this.geometry = new this.THREE.BufferGeometry();
    this.posAttribute = new this.THREE.BufferAttribute(this.positions, 3);
    this.colAttribute = new this.THREE.BufferAttribute(this.colors, 3);
    this.sizeAttribute = new this.THREE.BufferAttribute(this.sizes, 1);

    this.geometry.setAttribute('position', this.posAttribute);
    this.geometry.setAttribute('color', this.colAttribute);
    this.geometry.setAttribute('size', this.sizeAttribute);

    if (typeof this.geometry.computeBoundingSphere === 'function') {
      this.geometry.computeBoundingSphere();
    }

    this.material = new this.THREE.PointsMaterial({
      size: 1.0,
      vertexColors: true,
      transparent: true,
      blending: this.THREE.AdditiveBlending || 2,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.pointsMesh = new this.THREE.Points(this.geometry, this.material);
    this.pointsMesh.name = 'ParticleSystem_Points';
    this.pointsMesh.frustumCulled = false; // Prevent unwanted frustum culling when car speeds forward

    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.pointsMesh);
    }

    // ---------------------------------------------------------
    // Speed Streak Lines Subsystem
    // ---------------------------------------------------------
    this._initSpeedLines();
  }

  /**
   * Initializes peripheral warp speed streak lines
   * @private
   */
  _initSpeedLines() {
    const THREE = this.THREE;
    const count = this.speedLineCount;
    // 2 vertices per line (start and end)
    this.speedLinesPositions = new Float32Array(count * 6);
    this.speedLinesData = new Float32Array(count * 4); // [angle, radius, distance, speed]

    // Pre-distribute around cylindrical peripheral field
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 4.0 + Math.random() * 11.0; // Peripheral safe-zone: 4m - 15m from center line
      const dist = Math.random() * 45.0 - 5.0;     // -5m to +40m relative to camera
      const speed = 70.0 + Math.random() * 50.0;  // 70 - 120 m/s streak velocity

      this.speedLinesData[i * 4 + 0] = angle;
      this.speedLinesData[i * 4 + 1] = radius;
      this.speedLinesData[i * 4 + 2] = dist;
      this.speedLinesData[i * 4 + 3] = speed;
    }

    this.speedLinesGeometry = new THREE.BufferGeometry();
    this.speedLinesPosAttribute = new THREE.BufferAttribute(this.speedLinesPositions, 3);
    this.speedLinesGeometry.setAttribute('position', this.speedLinesPosAttribute);

    this.speedLinesMaterial = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending || 2,
      depthWrite: false
    });

    this.speedLinesMesh = new THREE.LineSegments(this.speedLinesGeometry, this.speedLinesMaterial);
    this.speedLinesMesh.name = 'WarpSpeedStreakLines';
    this.speedLinesMesh.visible = false;
    this.speedLinesMesh.frustumCulled = false;
    this.speedLinesActive = false;

    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.speedLinesMesh);
    }
  }

  /**
   * O(1) allocation of next free pool slot
   * @private
   * @returns {number} Index of allocated particle, or -1 if pool is full
   */
  _allocateParticle() {
    if (this.freeCount <= 0) {
      return -1; // Max capacity reached, drop cleanly without throwing
    }
    const idx = this.freeIndices[--this.freeCount];
    this.active[idx] = 1;
    this.activeCount++;
    this.lastAllocatedIndex = idx;
    return idx;
  }

  /**
   * Recycles dead particle back to the pool
   * @private
   * @param {number} idx
   */
  _freeParticle(idx) {
    this.active[idx] = 0;
    this.positions[idx * 3 + 1] = -99999;
    this.sizes[idx] = 0;
    this.colors[idx * 3 + 0] = 0;
    this.colors[idx * 3 + 1] = 0;
    this.colors[idx * 3 + 2] = 0;
    this.freeIndices[this.freeCount++] = idx;
    this.activeCount--;
  }

  /**
   * Parse hex / CSS / object color into normalized RGB components
   * @private
   */
  _parseColor(colorInput, defaultRGB) {
    if (!colorInput) return defaultRGB;
    if (typeof colorInput === 'number') {
      return {
        r: ((colorInput >> 16) & 255) / 255,
        g: ((colorInput >> 8) & 255) / 255,
        b: (colorInput & 255) / 255
      };
    }
    if (typeof colorInput === 'string') {
      const hex = parseInt(colorInput.replace('#', ''), 16);
      return {
        r: ((hex >> 16) & 255) / 255,
        g: ((hex >> 8) & 255) / 255,
        b: (hex & 255) / 255
      };
    }
    if (typeof colorInput.r === 'number') {
      return colorInput;
    }
    return defaultRGB;
  }

  /**
   * Emits exhaust particles from tailpipes
   * @param {{x: number, y: number, z: number}} pos - Tip world position
   * @param {{x: number, y: number, z: number}} vel - Vehicle velocity vector
   * @param {string|number|null} [color] - Optional flame color
   * @param {boolean} [isNitro=false] - Whether vehicle is currently firing nitro boost
   * @returns {number} Number of particles successfully emitted
   */
  emitExhaust(pos, vel, color = null, isNitro = false) {
    let emitted = 0;

    if (isNitro) {
      // -------------------------------------------------------
      // High-Energy Nitro Flame Bursts
      // -------------------------------------------------------
      const count = 4 + Math.floor(Math.random() * 3); // 4-6 flame jets
      const primaryCol = this._parseColor(color, { r: 0.0, g: 0.94, b: 1.0 }); // Electric Cyan
      const flameCoreCol = { r: 1.0, g: 0.0, b: 0.5 }; // Laser Magenta core

      for (let i = 0; i < count; i++) {
        const idx = this._allocateParticle();
        if (idx === -1) break;

        // Position with slight muzzle offset
        this.positions[idx * 3 + 0] = pos.x + (Math.random() - 0.5) * 0.08;
        this.positions[idx * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.08;
        this.positions[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.08;

        // Eject backwards violently relative to car motion
        const spread = 1.2;
        this.velocities[idx * 3 + 0] = -vel.x * 0.35 + (Math.random() - 0.5) * spread;
        this.velocities[idx * 3 + 1] = -vel.y * 0.35 + (Math.random() - 0.2) * 0.8;
        this.velocities[idx * 3 + 2] = -vel.z * 0.35 + (Math.random() - 0.5) * spread;

        // Colors: interpolate between cyan shell and hot magenta core
        const coreMix = Math.random();
        this.startColors[idx * 3 + 0] = primaryCol.r * (1 - coreMix) + flameCoreCol.r * coreMix;
        this.startColors[idx * 3 + 1] = primaryCol.g * (1 - coreMix) + flameCoreCol.g * coreMix;
        this.startColors[idx * 3 + 2] = primaryCol.b * (1 - coreMix) + flameCoreCol.b * coreMix;

        // End color fades into deep violet/darkness
        this.endColors[idx * 3 + 0] = 0.4;
        this.endColors[idx * 3 + 1] = 0.0;
        this.endColors[idx * 3 + 2] = 0.8;

        this.colors[idx * 3 + 0] = this.startColors[idx * 3 + 0];
        this.colors[idx * 3 + 1] = this.startColors[idx * 3 + 1];
        this.colors[idx * 3 + 2] = this.startColors[idx * 3 + 2];

        this.startSizes[idx] = 0.75 + Math.random() * 0.45;
        this.endSizes[idx] = 0.05;
        this.sizes[idx] = this.startSizes[idx];

        this.ages[idx] = 0;
        this.lifetimes[idx] = 0.14 + Math.random() * 0.16; // 0.14s - 0.30s snappy burn
        this.drag[idx] = 0.94;
        this.gravity[idx] = 0;

        emitted++;
      }
    } else {
      // -------------------------------------------------------
      // Normal Exhaust Neon Vapor Puff
      // -------------------------------------------------------
      const count = 1;
      const baseCol = this._parseColor(color, { r: 1.0, g: 0.42, b: 0.03 }); // Sunset Orange

      for (let i = 0; i < count; i++) {
        const idx = this._allocateParticle();
        if (idx === -1) break;

        this.positions[idx * 3 + 0] = pos.x + (Math.random() - 0.5) * 0.05;
        this.positions[idx * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.05;
        this.positions[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.05;

        this.velocities[idx * 3 + 0] = -vel.x * 0.15 + (Math.random() - 0.5) * 0.4;
        this.velocities[idx * 3 + 1] = 0.35 + Math.random() * 0.3; // Gentle rise
        this.velocities[idx * 3 + 2] = -vel.z * 0.15 + (Math.random() - 0.5) * 0.4;

        this.startColors[idx * 3 + 0] = baseCol.r * 0.8;
        this.startColors[idx * 3 + 1] = baseCol.g * 0.8;
        this.startColors[idx * 3 + 2] = baseCol.b * 0.8;

        this.endColors[idx * 3 + 0] = 0.2;
        this.endColors[idx * 3 + 1] = 0.05;
        this.endColors[idx * 3 + 2] = 0.3;

        this.colors[idx * 3 + 0] = this.startColors[idx * 3 + 0];
        this.colors[idx * 3 + 1] = this.startColors[idx * 3 + 1];
        this.colors[idx * 3 + 2] = this.startColors[idx * 3 + 2];

        this.startSizes[idx] = 0.22;
        this.endSizes[idx] = 0.55; // Expands as it dissipates
        this.sizes[idx] = this.startSizes[idx];

        this.ages[idx] = 0;
        this.lifetimes[idx] = 0.30 + Math.random() * 0.20;
        this.drag[idx] = 0.90;
        this.gravity[idx] = 0.4; // Upward float

        emitted++;
      }
    }

    return emitted;
  }

  /**
   * Emits glowing drift sparks and expanding tire smoke peeling off tire contact patches
   * @param {{x: number, y: number, z: number}} pos - Tire contact patch world position
   * @param {{x: number, y: number, z: number}} vel - Vehicle velocity vector
   * @param {string|number|null} [color] - Optional spark color
   * @returns {number} Number of particles emitted
   */
  emitDriftSparks(pos, vel, color = null) {
    let emitted = 0;

    // 1. Hot Glowing Sparks (peeling off asphalt with downward gravity)
    const sparkCount = 2 + Math.floor(Math.random() * 3);
    const sparkColor = this._parseColor(color, { r: 1.0, g: 0.92, b: 0.0 }); // Golden Yellow

    for (let i = 0; i < sparkCount; i++) {
      const idx = this._allocateParticle();
      if (idx === -1) break;

      this.positions[idx * 3 + 0] = pos.x + (Math.random() - 0.5) * 0.15;
      this.positions[idx * 3 + 1] = Math.max(0.05, pos.y + Math.random() * 0.1);
      this.positions[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.15;

      // Tangential kick and upward bounce
      const kickX = (Math.random() - 0.5) * 6.0 + vel.x * 0.1;
      const kickY = 1.2 + Math.random() * 2.8;
      const kickZ = (Math.random() - 0.5) * 6.0 + vel.z * 0.1;

      this.velocities[idx * 3 + 0] = kickX;
      this.velocities[idx * 3 + 1] = kickY;
      this.velocities[idx * 3 + 2] = kickZ;

      this.startColors[idx * 3 + 0] = sparkColor.r;
      this.startColors[idx * 3 + 1] = sparkColor.g;
      this.startColors[idx * 3 + 2] = sparkColor.b;

      this.endColors[idx * 3 + 0] = 1.0;
      this.endColors[idx * 3 + 1] = 0.2;
      this.endColors[idx * 3 + 2] = 0.0;

      this.colors[idx * 3 + 0] = sparkColor.r;
      this.colors[idx * 3 + 1] = sparkColor.g;
      this.colors[idx * 3 + 2] = sparkColor.b;

      this.startSizes[idx] = 0.25;
      this.endSizes[idx] = 0.05;
      this.sizes[idx] = this.startSizes[idx];

      this.ages[idx] = 0;
      this.lifetimes[idx] = 0.15 + Math.random() * 0.18;
      this.drag[idx] = 0.94;
      this.gravity[idx] = -9.8; // Gravity pulls sparks back to ground

      emitted++;
    }

    // 2. Translucent Tire Smoke Puff
    const smokeCount = 1;
    for (let i = 0; i < smokeCount; i++) {
      const idx = this._allocateParticle();
      if (idx === -1) break;

      this.positions[idx * 3 + 0] = pos.x + (Math.random() - 0.5) * 0.2;
      this.positions[idx * 3 + 1] = Math.max(0.1, pos.y + 0.1);
      this.positions[idx * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.2;

      this.velocities[idx * 3 + 0] = (Math.random() - 0.5) * 1.5 - vel.x * 0.08;
      this.velocities[idx * 3 + 1] = 0.8 + Math.random() * 0.6; // Rising smoke
      this.velocities[idx * 3 + 2] = (Math.random() - 0.5) * 1.5 - vel.z * 0.08;

      // Cyan / Magenta synthwave smoke tint
      this.startColors[idx * 3 + 0] = 0.0;
      this.startColors[idx * 3 + 1] = 0.65;
      this.startColors[idx * 3 + 2] = 0.85;

      this.endColors[idx * 3 + 0] = 0.5;
      this.endColors[idx * 3 + 1] = 0.0;
      this.endColors[idx * 3 + 2] = 0.5;

      this.colors[idx * 3 + 0] = this.startColors[idx * 3 + 0];
      this.colors[idx * 3 + 1] = this.startColors[idx * 3 + 1];
      this.colors[idx * 3 + 2] = this.startColors[idx * 3 + 2];

      this.startSizes[idx] = 0.40;
      this.endSizes[idx] = 1.60; // Expands outward
      this.sizes[idx] = this.startSizes[idx];

      this.ages[idx] = 0;
      this.lifetimes[idx] = 0.45 + Math.random() * 0.35;
      this.drag[idx] = 0.88;
      this.gravity[idx] = 0.2; // Gentle warm buoyant lift

      emitted++;
    }

    return emitted;
  }

  /**
   * Updates high-velocity peripheral warp speed streak lines
   * @param {{x: number, y: number, z: number}} camPos - Camera position
   * @param {{x: number, y: number, z: number}|boolean} camForwardOrActive - Camera forward vector OR active flag
   * @param {boolean} [active] - Whether speed lines are active (speed > 180 km/h or boosting)
   */
  updateSpeedLines(camPos, camForwardOrActive, active = false) {
    let fwd = { x: 0, y: 0, z: 1 };
    let isActive = false;

    if (typeof camForwardOrActive === 'boolean') {
      isActive = camForwardOrActive;
    } else if (camForwardOrActive && typeof camForwardOrActive === 'object') {
      fwd = camForwardOrActive;
      isActive = !!active;
    }

    this.speedLinesActive = isActive;

    if (!isActive) {
      if (this.speedLinesMesh) {
        this.speedLinesMesh.visible = false;
      }
      return;
    }

    if (this.speedLinesMesh) {
      this.speedLinesMesh.visible = true;
    }

    // Normalize forward vector
    const flen = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
    const fx = fwd.x / flen;
    const fy = fwd.y / flen;
    const fz = fwd.z / flen;

    // Construct camera right and up basis vectors
    let rx = fz;
    let ry = 0;
    let rz = -fx;
    const rlen = Math.hypot(rx, rz) || 1;
    rx /= rlen;
    rz /= rlen;

    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;

    const count = this.speedLineCount;
    const lineLen = 6.0; // 6-meter streak line length

    for (let i = 0; i < count; i++) {
      const angle = this.speedLinesData[i * 4 + 0];
      const radius = this.speedLinesData[i * 4 + 1];
      let dist = this.speedLinesData[i * 4 + 2];
      const speed = this.speedLinesData[i * 4 + 3];

      // Advance line backwards towards and past camera
      dist -= speed * (1 / 60);
      if (dist < -8.0) {
        dist = 38.0 + Math.random() * 12.0; // Respawn ahead
      }
      this.speedLinesData[i * 4 + 2] = dist;

      // Radial offset in camera coordinate frame
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const offX = (rx * cosA + ux * sinA) * radius;
      const offY = (ry * cosA + uy * sinA) * radius;
      const offZ = (rz * cosA + uz * sinA) * radius;

      // Start vertex (ahead)
      const p1x = camPos.x + fx * dist + offX;
      const p1y = camPos.y + fy * dist + offY;
      const p1z = camPos.z + fz * dist + offZ;

      // End vertex (trailing behind along forward axis)
      const p2x = p1x - fx * lineLen;
      const p2y = p1y - fy * lineLen;
      const p2z = p1z - fz * lineLen;

      const vIdx = i * 6;
      this.speedLinesPositions[vIdx + 0] = p1x;
      this.speedLinesPositions[vIdx + 1] = p1y;
      this.speedLinesPositions[vIdx + 2] = p1z;
      this.speedLinesPositions[vIdx + 3] = p2x;
      this.speedLinesPositions[vIdx + 4] = p2y;
      this.speedLinesPositions[vIdx + 5] = p2z;
    }

    if (this.speedLinesPosAttribute) {
      this.speedLinesPosAttribute.needsUpdate = true;
    }
  }

  /**
   * Convenience alias matching task brief specification: emitSpeedLines(camPos, active)
   * @param {{x: number, y: number, z: number}} camPos
   * @param {boolean} active
   */
  emitSpeedLines(camPos, active) {
    this.updateSpeedLines(camPos, active);
  }

  /**
   * Advances simulation: updates positions, ages, alphas, and sizes, and recycles expired particles
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    if (dt <= 0) return;
    const clampedDt = Math.min(dt, 0.1);

    for (let i = 0; i < this.maxParticles; i++) {
      if (!this.active[i]) continue;

      this.ages[i] += dt;
      if (this.ages[i] >= this.lifetimes[i]) {
        this._freeParticle(i);
        continue;
      }

      const t = this.ages[i] / this.lifetimes[i]; // Normalized age [0, 1)

      // Apply drag
      const dragFactor = Math.pow(this.drag[i], clampedDt * 60);
      this.velocities[i * 3 + 0] *= dragFactor;
      this.velocities[i * 3 + 1] *= dragFactor;
      this.velocities[i * 3 + 2] *= dragFactor;

      // Apply gravity
      this.velocities[i * 3 + 1] += this.gravity[i] * clampedDt;

      // Integrate position
      this.positions[i * 3 + 0] += this.velocities[i * 3 + 0] * clampedDt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * clampedDt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * clampedDt;

      // Interpolate size
      this.sizes[i] = this.startSizes[i] + (this.endSizes[i] - this.startSizes[i]) * t;

      // Interpolate color and apply alpha fade (for AdditiveBlending, fade color to black)
      const alpha = Math.max(0.0, 1.0 - t);
      const r = this.startColors[i * 3 + 0] + (this.endColors[i * 3 + 0] - this.startColors[i * 3 + 0]) * t;
      const g = this.startColors[i * 3 + 1] + (this.endColors[i * 3 + 1] - this.startColors[i * 3 + 1]) * t;
      const b = this.startColors[i * 3 + 2] + (this.endColors[i * 3 + 2] - this.startColors[i * 3 + 2]) * t;

      this.colors[i * 3 + 0] = r * alpha;
      this.colors[i * 3 + 1] = g * alpha;
      this.colors[i * 3 + 2] = b * alpha;
    }

    // Mark attributes for GPU update
    if (this.posAttribute) this.posAttribute.needsUpdate = true;
    if (this.colAttribute) this.colAttribute.needsUpdate = true;
    if (this.sizeAttribute) this.sizeAttribute.needsUpdate = true;
  }

  /**
   * Release particle system resources cleanly
   */
  dispose() {
    if (this.scene && typeof this.scene.remove === 'function') {
      if (this.pointsMesh) this.scene.remove(this.pointsMesh);
      if (this.speedLinesMesh) this.scene.remove(this.speedLinesMesh);
    }

    if (this.geometry && typeof this.geometry.dispose === 'function') {
      this.geometry.dispose();
    }
    if (this.material && typeof this.material.dispose === 'function') {
      this.material.dispose();
    }
    if (this.speedLinesGeometry && typeof this.speedLinesGeometry.dispose === 'function') {
      this.speedLinesGeometry.dispose();
    }
    if (this.speedLinesMaterial && typeof this.speedLinesMaterial.dispose === 'function') {
      this.speedLinesMaterial.dispose();
    }
  }
}
