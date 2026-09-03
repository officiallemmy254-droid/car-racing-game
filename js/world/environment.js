/**
 * 3D Synthwave Circuit Racer — Visual Atmosphere & Environment
 * Procedural synthwave world environment:
 * - Slatted synthwave sun on the horizon with horizontal segmented blinds (yellow-to-pink gradient, glow)
 * - Procedural wireframe horizon mountain ridges surrounding the track in violet/magenta
 * - Infinite perspective ground grid beneath the circuit (cyan/magenta grid lines on dark background)
 * - Synthwave lighting: Directional sun light, ambient light, fog (#060212)
 * - Continuous subtle horizon pulsation and ground grid motion
 * - Headless Node-compatible ES6 export
 */

let defaultThree = globalThis.THREE || null;
try {
  const threeModule = await import('three');
  defaultThree = threeModule.default || threeModule;
} catch (e) {
  // Headless test runner fallback
}

export class Environment {
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
   * Factory method to create and attach the synthwave environment to a scene
   * @param {object} scene - Three.js scene
   * @param {object} [options]
   * @returns {Environment}
   */
  static create(scene, options = {}) {
    return new Environment(scene, options);
  }

  /**
   * @param {object} scene
   * @param {object} [options]
   */
  constructor(scene, options = {}) {
    this.THREE = options.THREE || defaultThree || globalThis.THREE;
    if (!this.THREE) {
      throw new Error('Three.js library is required to build Environment. Provide options.THREE or set globalThis.THREE.');
    }

    this.scene = scene;
    this.options = Object.assign({
      fogColor: 0x060212,
      fogDensity: 0.00075,
      fogNear: 150,
      fogFar: 2200,
      sunPosition: { x: 0, y: 140, z: 1300 },
      sunRadius: 210,
      mountainRadiusOuter: 1550,
      mountainRadiusMid: 1250,
      groundGridSize: 4000,
      gridDivisions: 160
    }, options);

    this.lights = {};
    this.sun = null;
    this.mountains = null;
    this.grid = null;
    this.group = new this.THREE.Group();
    this.group.name = 'EnvironmentGroup';

    this._setupFogAndBackground();
    this._setupLighting();
    this._buildSlattedSun();
    this._buildWireframeMountains();
    this._buildGroundGrid();

    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.group);
    }
  }

  /**
   * Setup atmospheric fog and deep synthwave sky background
   * @private
   */
  _setupFogAndBackground() {
    const THREE = this.THREE;
    const fogCol = new THREE.Color(this.options.fogColor);

    if (this.scene) {
      this.scene.background = fogCol;
      // Prefer linear Fog with clear near plane and deep horizon falloff
      if (THREE.Fog) {
        this.scene.fog = new THREE.Fog(this.options.fogColor, this.options.fogNear, this.options.fogFar);
      } else if (THREE.FogExp2) {
        this.scene.fog = new THREE.FogExp2(this.options.fogColor, this.options.fogDensity);
      }
    }
  }

  /**
   * Setup synthwave directional sun light and atmospheric ambient fill
   * @private
   */
  _setupLighting() {
    const THREE = this.THREE;

    // Ambient light: Deep synthwave indigo/violet fill
    const ambient = new THREE.AmbientLight(0x2b084b, 1.2);
    ambient.name = 'AmbientLight_Synthwave';

    // Directional sun light: Warm glowing sunset light casting across the circuit
    const sunLight = new THREE.DirectionalLight(0xff5e97, 1.4);
    sunLight.name = 'SunLight_Directional';
    sunLight.position.set(
      this.options.sunPosition.x,
      this.options.sunPosition.y + 50,
      this.options.sunPosition.z
    );
    if (sunLight.target) {
      sunLight.target.position.set(0, 0, 0);
    }

    // Secondary cyan rim light from high front-quarter for neon silhouette pop
    const rimLight = new THREE.DirectionalLight(0x00f0ff, 0.6);
    rimLight.name = 'RimLight_Cyan';
    rimLight.position.set(0, 300, -600);

    this.lights = {
      ambient,
      sunLight,
      rimLight
    };

    this.group.add(ambient, sunLight, rimLight);
  }

  /**
   * Build iconic slatted synthwave sun on the horizon with horizontal segmented blinds
   * and yellow-to-pink emissive gradient.
   * @private
   */
  _buildSlattedSun() {
    const THREE = this.THREE;
    const sunGroup = new THREE.Group();
    sunGroup.name = 'SynthwaveSun';
    sunGroup.position.set(
      this.options.sunPosition.x,
      this.options.sunPosition.y,
      this.options.sunPosition.z
    );

    const R = this.options.sunRadius;
    const slatMeshes = [];
    const slatCount = 14;

    // Top color: Golden Yellow (#ffde59) -> Bottom color: Hot Laser Pink (#ff007f)
    const topCol = new THREE.Color(0xffe600);
    const midCol = new THREE.Color(0xff4477);
    const botCol = new THREE.Color(0xff007f);

    // Segment horizontal slices: upper half has thin/zero gaps, lower half has progressively wider gaps
    for (let i = 0; i < slatCount; i++) {
      // Fraction from top (0) to bottom (1)
      const t0 = i / slatCount;
      const t1 = (i + 1) / slatCount;

      // Vertical position in [-R, +R], +R at top, -R at bottom
      const yTop = R * (1.0 - 2.0 * t0);
      const yBottom = R * (1.0 - 2.0 * t1);

      // Slat gap fraction: expands as we go further down the lower half
      let gapFraction = 0.04;
      if (t0 > 0.45) {
        const lowerT = (t0 - 0.45) / 0.55;
        gapFraction = 0.08 + lowerT * 0.38; // Up to ~46% gap at the bottom
      }

      const h = Math.max(0.5, (yTop - yBottom) * (1.0 - gapFraction));
      const yMid = (yTop + yBottom) * 0.5;

      // Chord width of circle at height yMid: w = 2 * sqrt(R^2 - y^2)
      const rClamped = Math.min(Math.abs(yMid), R * 0.999);
      const halfWidth = Math.sqrt(Math.max(1, R * R - rClamped * rClamped));
      const w = halfWidth * 2.0;

      // Slat color interpolation
      const slatColor = new THREE.Color();
      const normY = (yMid + R) / (2.0 * R); // 0 at bottom, 1 at top
      if (normY > 0.5) {
        const factor = (normY - 0.5) / 0.5;
        slatColor.r = midCol.r + (topCol.r - midCol.r) * factor;
        slatColor.g = midCol.g + (topCol.g - midCol.g) * factor;
        slatColor.b = midCol.b + (topCol.b - midCol.b) * factor;
      } else {
        const factor = normY / 0.5;
        slatColor.r = botCol.r + (midCol.r - botCol.r) * factor;
        slatColor.g = botCol.g + (midCol.g - botCol.g) * factor;
        slatColor.b = botCol.b + (midCol.b - botCol.b) * factor;
      }

      const slatGeom = (THREE.PlaneGeometry)
        ? new THREE.PlaneGeometry(w, h)
        : new THREE.BufferGeometry();

      const slatMat = new THREE.MeshBasicMaterial({
        color: slatColor,
        side: THREE.DoubleSide || 2,
        depthWrite: false
      });

      const slatMesh = new THREE.Mesh(slatGeom, slatMat);
      slatMesh.position.set(0, yMid, 0);
      slatMesh.name = `SunSlat_${i}`;
      sunGroup.add(slatMesh);
      slatMeshes.push(slatMesh);
    }

    // Outer soft sun glow halo ring/disk
    const glowRadius = R * 1.35;
    const glowGeom = (THREE.PlaneGeometry)
      ? new THREE.PlaneGeometry(glowRadius * 2, glowRadius * 2)
      : new THREE.BufferGeometry();

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff007f,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending || 2,
      depthWrite: false
    });

    const glowMesh = new THREE.Mesh(glowGeom, glowMat);
    glowMesh.position.set(0, 0, -2); // Just behind slats
    glowMesh.name = 'SunGlowHalo';
    sunGroup.add(glowMesh);

    this.sun = {
      group: sunGroup,
      slats: slatMeshes,
      glow: glowMesh,
      baseRadius: R
    };

    this.group.add(sunGroup);
  }

  /**
   * Build procedural wireframe horizon mountain ridges surrounding the track in violet/magenta
   * @private
   */
  _buildWireframeMountains() {
    const THREE = this.THREE;
    const mountainGroup = new THREE.Group();
    mountainGroup.name = 'HorizonMountains';

    const layers = [];

    // Layer 1: Outer distant high peaks (Violet #8a2be2 / #9d00ff)
    const layer1 = this._createMountainRingLayer({
      name: 'Mountains_OuterViolet',
      radius: this.options.mountainRadiusOuter,
      baseHeight: 120,
      peakHeight: 280,
      segments: 72,
      color: 0x9d00ff,
      opacity: 0.85,
      noiseFreq1: 6,
      noiseFreq2: 13,
      noiseFreq3: 27
    });

    // Layer 2: Mid closer jagged ridges (Hot Laser Magenta #ff007f)
    const layer2 = this._createMountainRingLayer({
      name: 'Mountains_MidMagenta',
      radius: this.options.mountainRadiusMid,
      baseHeight: 65,
      peakHeight: 180,
      segments: 72,
      color: 0xff007f,
      opacity: 0.95,
      noiseFreq1: 8,
      noiseFreq2: 17,
      noiseFreq3: 31
    });

    mountainGroup.add(layer1.mesh);
    mountainGroup.add(layer2.mesh);
    layers.push(layer1, layer2);

    this.mountains = {
      group: mountainGroup,
      layers
    };

    this.group.add(mountainGroup);
  }

  /**
   * Procedural circular mountain ring generator with sine-noise displacement
   * @private
   */
  _createMountainRingLayer(cfg) {
    const THREE = this.THREE;
    const segments = cfg.segments || 64;
    const radius = cfg.radius || 1200;

    // Create ribbon/strip geometry around origin
    // Each segment has 2 triangles (4 vertices): bottom-left, top-left, bottom-right, top-right
    const vertexCount = (segments + 1) * 2;
    const positions = new Float32Array(vertexCount * 3);

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Procedural multi-harmonic sine-noise elevation
      const n1 = Math.sin(theta * cfg.noiseFreq1) * 0.45;
      const n2 = Math.sin(theta * cfg.noiseFreq2 + 1.3) * 0.35;
      const n3 = Math.cos(theta * cfg.noiseFreq3 + 0.7) * 0.20;
      const noise = Math.abs(n1 + n2 + n3);

      // Frame the sunset: lower mountain height directly facing the sun (+Z axis)
      const sunFacingFactor = (sinT > 0.85) ? Math.max(0.3, 1.0 - (sinT - 0.85) * 4.0) : 1.0;
      const h = cfg.baseHeight + noise * cfg.peakHeight * sunFacingFactor;

      const px = cosT * radius;
      const pz = sinT * radius;

      // Bottom vertex at ground level
      const idxBot = i * 2;
      positions[idxBot * 3 + 0] = px;
      positions[idxBot * 3 + 1] = -5;
      positions[idxBot * 3 + 2] = pz;

      // Top vertex at mountain crest
      const idxTop = i * 2 + 1;
      positions[idxTop * 3 + 0] = px;
      positions[idxTop * 3 + 1] = h;
      positions[idxTop * 3 + 2] = pz;
    }

    const geometry = new THREE.BufferGeometry();
    if (THREE.BufferAttribute) {
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const indices = new Uint16Array(segments * 6);
      for (let i = 0; i < segments; i++) {
        const b0 = i * 2;
        const t0 = i * 2 + 1;
        const b1 = (i + 1) * 2;
        const t1 = (i + 1) * 2 + 1;

        const idx = i * 6;
        indices[idx + 0] = b0;
        indices[idx + 1] = t0;
        indices[idx + 2] = t1;
        indices[idx + 3] = b0;
        indices[idx + 4] = t1;
        indices[idx + 5] = b1;
      }
      if (typeof geometry.setIndex === 'function') {
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      }
    }

    const material = new THREE.MeshBasicMaterial({
      color: cfg.color,
      wireframe: true,
      transparent: true,
      opacity: cfg.opacity,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = cfg.name;

    return {
      name: cfg.name,
      mesh,
      geometry,
      material,
      baseOpacity: cfg.opacity
    };
  }

  /**
   * Build infinite perspective ground grid beneath the circuit (cyan & magenta lines on dark floor)
   * @private
   */
  _buildGroundGrid() {
    const THREE = this.THREE;
    const gridGroup = new THREE.Group();
    gridGroup.name = 'GroundGridSystem';

    const size = this.options.groundGridSize;
    const divisions = this.options.gridDivisions;

    // Primary cyan/magenta perspective grid lines
    const gridHelper = (THREE.GridHelper)
      ? new THREE.GridHelper(size, divisions, 0x00f0ff, 0x3b0b59)
      : new THREE.Group();
    gridHelper.name = 'PerspectiveGridLines';
    gridHelper.position.y = -0.15; // Directly beneath track asphalt

    // Solid dark synthwave void plane to mask depth beneath the glowing grid
    const darkPlaneGeom = (THREE.PlaneGeometry)
      ? new THREE.PlaneGeometry(size, size)
      : new THREE.BufferGeometry();

    const darkPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x03010a,
      depthWrite: true
    });

    const darkPlane = new THREE.Mesh(darkPlaneGeom, darkPlaneMat);
    darkPlane.name = 'DarkVoidFloor';
    darkPlane.rotation.x = -Math.PI / 2;
    darkPlane.position.y = -0.4;

    gridGroup.add(darkPlane, gridHelper);

    this.grid = {
      group: gridGroup,
      mesh: gridHelper,
      floor: darkPlane,
      size,
      divisions,
      cellSize: size / divisions
    };

    this.group.add(gridGroup);
  }

  /**
   * Updates atmospheric animations: subtle sun glow pulse, horizon breathing, ground motion, and sun orientation
   * @param {number} time - Elapsed time in seconds
   * @param {number} dt - Frame delta time in seconds
   * @param {object} [camera] - Optional camera for billboarding / yaw alignment
   */
  update(time, dt, camera = null) {
    // Subtle sun pulsation (breathing rhythm)
    if (this.sun && this.sun.group) {
      const pulse = 1.0 + Math.sin(time * 1.5) * 0.025;
      this.sun.group.scale.set(pulse, pulse, pulse);

      if (this.sun.glow && this.sun.glow.material) {
        this.sun.glow.material.opacity = 0.35 + Math.sin(time * 2.2) * 0.08;
      }

      // Billboard sun to face camera yaw if camera is provided
      if (camera && camera.position && this.sun.group.rotation) {
        const dx = camera.position.x - this.sun.group.position.x;
        const dz = camera.position.z - this.sun.group.position.z;
        const yaw = Math.atan2(dx, dz);
        this.sun.group.rotation.y = yaw;
      }
    }

    // Mountain horizon pulsation
    if (this.mountains && this.mountains.layers) {
      const mountainPhase = Math.sin(time * 1.2) * 0.1;
      for (const layer of this.mountains.layers) {
        if (layer.material) {
          layer.material.opacity = Math.max(0.4, layer.baseOpacity + mountainPhase);
        }
      }
    }

    // Ground grid subtle infinite perspective scroll
    if (this.grid && this.grid.mesh && this.grid.cellSize) {
      this.grid.mesh.position.z = (time * 8.0) % this.grid.cellSize;
    }
  }

  /**
   * Release Three.js resources cleanly
   */
  dispose() {
    if (this.scene) {
      this.scene.fog = null;
    }

    if (this.group && this.scene && typeof this.scene.remove === 'function') {
      this.scene.remove(this.group);
    }

    // Traverse and dispose materials and geometries
    if (this.group && this.group.children) {
      const disposeNode = (node) => {
        if (node.geometry && typeof node.geometry.dispose === 'function') {
          node.geometry.dispose();
        }
        if (node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach(m => m.dispose && m.dispose());
          } else if (typeof node.material.dispose === 'function') {
            node.material.dispose();
          }
        }
        if (node.children) {
          for (const child of node.children) {
            disposeNode(child);
          }
        }
      };
      disposeNode(this.group);
    }
  }
}
