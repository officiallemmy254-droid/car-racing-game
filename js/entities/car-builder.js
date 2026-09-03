/**
 * 3D Synthwave Circuit Racer — Car Constructor & Configurations
 * Procedural 3D synthwave sports car constructor:
 * - Wedge chassis inspired by 1980s concept supercars (Countach / DeLorean aesthetic)
 * - Aerodynamic cockpit canopy & 80s rear engine louvers
 * - High-downforce rear wing spoiler with glowing endplates
 * - Neon underglow plane
 * - 4 independent wheels with steering pivots and rolling axle rotation
 * - High-intensity LED headlights & full-width reactive brake taillight bar
 * - Dual exhaust pipe exit coordinates for nitro particle trails
 * - Headless Node-compatible ES6 export
 */

// Attempt to load Three.js if available in the runtime environment (browser with import map or bundler).
// Catches gracefully in headless Node testing where Three.js is injected or mocked.
let defaultThree = globalThis.THREE || null;
try {
  const threeModule = await import('three');
  defaultThree = threeModule.default || threeModule;
} catch (e) {
  // Graceful fallback for Node.js test runner
}

/**
 * Car configuration specifications: physical dimensions, player palette,
 * and 5 distinct AI rival color palettes from the design specification.
 */
export const CarConfig = {
  // Vehicle geometry dimensions in meters
  dimensions: {
    length: 4.4,        // Total vehicle length ~4.4m
    width: 2.0,         // Total vehicle width ~2.0m
    height: 1.1,        // Vehicle height to rear spoiler ~1.1m
    wheelRadius: 0.35,  // Wheel tire radius ~0.35m
    wheelbase: 2.6,     // Distance between front & rear axles ~2.6m
    trackWidth: 1.7     // Distance between left & right wheels ~1.7m
  },

  // Player signature synthwave color palette
  playerPalette: {
    name: 'Player',
    primaryColor: '#00f0ff',     // Electric Cyan
    accentColor: '#ff007f',      // Laser Magenta
    glowColor: '#00f0ff',        // Cyan Neon Glow
    underglowColor: '#00f0ff',   // Cyan Underglow
    style: 'Player Champion'
  },

  // 5 AI rival palettes from the design specification
  rivalPalettes: [
    {
      name: 'Apex Nova',
      primaryColor: '#00f0ff',   // Electric Cyan
      accentColor: '#ff007f',    // Laser Magenta
      glowColor: '#00f0ff',      // Cyan Neon
      underglowColor: '#00f0ff',
      style: 'Aggressive line, frequent booster'
    },
    {
      name: 'Cyber Phantom',
      primaryColor: '#ff007f',   // Laser Magenta
      accentColor: '#00f0ff',    // Electric Cyan
      glowColor: '#ff007f',      // Magenta Neon
      underglowColor: '#ff007f',
      style: 'Clean apex cutter, high top speed'
    },
    {
      name: 'Neon Viper',
      primaryColor: '#39ff14',   // Toxic Lime
      accentColor: '#00f0ff',    // Cyan Accent
      glowColor: '#39ff14',      // Lime Neon
      underglowColor: '#39ff14',
      style: 'Defensive lane blocker, late-braker'
    },
    {
      name: 'Vapor Blade',
      primaryColor: '#ff6b08',   // Sunset Orange
      accentColor: '#ff007f',    // Magenta Accent
      glowColor: '#ff6b08',      // Orange Neon
      underglowColor: '#ff6b08',
      style: 'Fast starter, drift enthusiast'
    },
    {
      name: 'Pulse Fury',
      primaryColor: '#9d00ff',   // Deep Violet
      accentColor: '#00f0ff',    // Cyan Accent
      glowColor: '#9d00ff',      // Violet Neon
      underglowColor: '#9d00ff',
      style: 'Steady balanced racer'
    }
  ]
};

// Convenient alias for player palette
CarConfig.player = CarConfig.playerPalette;

/**
 * Procedural 3D Synthwave Sports Car Constructor
 */
export class CarBuilder {
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
   * Creates a procedural 3D synthwave sports car mesh hierarchy.
   * @param {object} [options]
   * @param {string|number} [options.primaryColor] - Main body paint color
   * @param {string|number} [options.accentColor] - Secondary trim / livery color
   * @param {string|number} [options.glowColor] - Neon emissive trim and underglow color
   * @param {boolean} [options.isPlayer=true] - Whether this car is the player's vehicle
   * @param {string} [options.name] - Optional car/driver name
   * @param {object} [options.THREE] - Injected Three.js instance
   * @returns {{
   *   root: THREE.Group,
   *   wheels: THREE.Mesh[],
   *   brakeLights: THREE.Mesh[],
   *   headlights: THREE.Mesh[],
   *   exhaustPipes: THREE.Vector3[],
   *   wheelPivots: { frontLeft: THREE.Group, frontRight: THREE.Group, rearLeft: THREE.Group, rearRight: THREE.Group },
   *   underglow: THREE.Mesh,
   *   setBraking: (isBraking: boolean) => void
   * }}
   */
  static createCarMesh(options = {}) {
    const THREE = options.THREE || defaultThree || globalThis.THREE;
    if (!THREE) {
      throw new Error('Three.js library is required to build car mesh. Provide options.THREE or set globalThis.THREE.');
    }

    const isPlayer = options.isPlayer ?? true;
    const defaultPalette = isPlayer ? CarConfig.playerPalette : CarConfig.rivalPalettes[0];

    const primaryColor = options.primaryColor ?? defaultPalette.primaryColor;
    const accentColor = options.accentColor ?? defaultPalette.accentColor;
    const glowColor = options.glowColor ?? options.underglowColor ?? defaultPalette.glowColor;

    // Helper to safely construct THREE.Color
    const makeColor = (c) => new THREE.Color(c);

    // Root car group
    const root = new THREE.Group();
    root.name = options.name || (isPlayer ? 'PlayerCar' : 'AICar');

    // -------------------------------------------------------------
    // 1. Shared Materials
    // -------------------------------------------------------------
    // High-gloss metallic primary body paint
    const bodyMat = new THREE.MeshStandardMaterial({
      color: makeColor(primaryColor),
      metalness: 0.85,
      roughness: 0.25
    });

    // Dark cyber carbon-fiber / dark chassis panels
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x110b22,
      metalness: 0.7,
      roughness: 0.5
    });

    // Emissive neon accent trim
    const accentMat = new THREE.MeshBasicMaterial({
      color: makeColor(accentColor)
    });

    // Emissive neon glow trim
    const glowMat = new THREE.MeshBasicMaterial({
      color: makeColor(glowColor)
    });

    // Deep tinted canopy glass
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0a0515,
      metalness: 0.95,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85
    });

    // Heavy rubber tire tread
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x141419,
      roughness: 0.9,
      metalness: 0.1
    });

    // Polished alloy rim
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a46,
      metalness: 0.9,
      roughness: 0.2
    });

    // Emissive LED headlights (electric bright)
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0ffff,
      emissiveIntensity: 1.8
    });

    // Reactive rear brake light bar (flares upon braking)
    const brakeLightMat = new THREE.MeshStandardMaterial({
      color: 0x330006,
      emissive: 0xff0033,
      emissiveIntensity: 0.4
    });

    // Exhaust dark chrome
    const exhaustMetalMat = new THREE.MeshStandardMaterial({
      color: 0x22222a,
      metalness: 0.9,
      roughness: 0.3
    });

    // Exhaust hot core glow
    const exhaustCoreMat = new THREE.MeshBasicMaterial({
      color: 0xff5500
    });

    // -------------------------------------------------------------
    // 2. Chassis & Lower Body (Wedge Shape)
    // -------------------------------------------------------------
    const bodyGroup = new THREE.Group();
    bodyGroup.name = 'ChassisBody';

    // Main lower platform (length: 4.2m, width: 1.80m, height: 0.28m)
    const mainBodyGeo = new THREE.BoxGeometry(1.80, 0.28, 4.20);
    const mainBody = new THREE.Mesh(mainBodyGeo, bodyMat);
    mainBody.position.set(0, 0.36, 0);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    bodyGroup.add(mainBody);

    // Front wedge hood / nose slope (sloping down toward front bumper)
    const hoodGeo = new THREE.BoxGeometry(1.70, 0.22, 1.50);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.42, 1.25);
    hood.rotation.x = -0.06;
    hood.castShadow = true;
    bodyGroup.add(hood);

    // Low front bumper / nose tip
    const noseGeo = new THREE.BoxGeometry(1.74, 0.16, 0.50);
    const nose = new THREE.Mesh(noseGeo, darkMat);
    nose.position.set(0, 0.24, 2.05);
    bodyGroup.add(nose);

    // Aerodynamic front splitter lip (dark carbon + neon front edge)
    const splitterGeo = new THREE.BoxGeometry(1.84, 0.04, 0.35);
    const splitter = new THREE.Mesh(splitterGeo, darkMat);
    splitter.position.set(0, 0.10, 2.15);
    bodyGroup.add(splitter);

    const splitterNeonGeo = new THREE.BoxGeometry(1.86, 0.02, 0.04);
    const splitterNeon = new THREE.Mesh(splitterNeonGeo, accentMat);
    splitterNeon.position.set(0, 0.10, 2.32);
    bodyGroup.add(splitterNeon);

    // Side skirts (left and right) with neon pinstripes
    const sideSkirtGeo = new THREE.BoxGeometry(0.10, 0.14, 2.30);
    const sideSkirtNeonGeo = new THREE.BoxGeometry(0.03, 0.03, 2.30);

    for (const sign of [-1, 1]) {
      const skirt = new THREE.Mesh(sideSkirtGeo, darkMat);
      skirt.position.set(sign * 0.92, 0.22, 0);
      bodyGroup.add(skirt);

      const skirtNeon = new THREE.Mesh(sideSkirtNeonGeo, glowMat);
      skirtNeon.position.set(sign * 0.98, 0.18, 0);
      bodyGroup.add(skirtNeon);

      // Side radiator strakes (Testarossa style intake fins)
      for (const yOff of [0.32, 0.40]) {
        const strakeGeo = new THREE.BoxGeometry(0.06, 0.03, 0.85);
        const strake = new THREE.Mesh(strakeGeo, accentMat);
        strake.position.set(sign * 0.92, yOff, -0.35);
        bodyGroup.add(strake);
      }
    }

    // Rear engine deck
    const rearDeckGeo = new THREE.BoxGeometry(1.68, 0.20, 1.30);
    const rearDeck = new THREE.Mesh(rearDeckGeo, bodyMat);
    rearDeck.position.set(0, 0.48, -1.25);
    bodyGroup.add(rearDeck);

    // 80s Synthwave Engine Louvers (horizontal black slats across rear deck)
    const louverZ = [-0.85, -1.05, -1.25, -1.45];
    const louverGeo = new THREE.BoxGeometry(1.15, 0.03, 0.12);
    for (let i = 0; i < louverZ.length; i++) {
      const louver = new THREE.Mesh(louverGeo, darkMat);
      louver.position.set(0, 0.62 - i * 0.025, louverZ[i]);
      bodyGroup.add(louver);
    }

    root.add(bodyGroup);

    // -------------------------------------------------------------
    // 3. Cockpit Canopy & Greenhouse
    // -------------------------------------------------------------
    const cockpitGroup = new THREE.Group();
    cockpitGroup.name = 'CockpitCanopy';

    // Slanted aerodynamic windshield
    const windshieldGeo = new THREE.BoxGeometry(1.30, 0.32, 0.70);
    const windshield = new THREE.Mesh(windshieldGeo, glassMat);
    windshield.position.set(0, 0.64, 0.70);
    windshield.rotation.x = -0.44;
    cockpitGroup.add(windshield);

    // Central cabin greenhouse
    const cabinGeo = new THREE.BoxGeometry(1.26, 0.36, 1.40);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 0.72, -0.15);
    cockpitGroup.add(cabin);

    // Dark sleek roof panel
    const roofGeo = new THREE.BoxGeometry(1.20, 0.03, 1.15);
    const roof = new THREE.Mesh(roofGeo, darkMat);
    roof.position.set(0, 0.91, -0.20);
    cockpitGroup.add(roof);

    // Fastback sloped rear glass
    const rearGlassGeo = new THREE.BoxGeometry(1.22, 0.26, 0.65);
    const rearGlass = new THREE.Mesh(rearGlassGeo, glassMat);
    rearGlass.position.set(0, 0.66, -0.80);
    rearGlass.rotation.x = 0.35;
    cockpitGroup.add(rearGlass);

    root.add(cockpitGroup);

    // -------------------------------------------------------------
    // 4. High-Downforce Rear Wing / Spoiler
    // -------------------------------------------------------------
    const wingGroup = new THREE.Group();
    wingGroup.name = 'RearWing';

    // Vertical spoiler pylons / uprights
    const pylonGeo = new THREE.BoxGeometry(0.06, 0.42, 0.28);
    const leftPylon = new THREE.Mesh(pylonGeo, darkMat);
    leftPylon.position.set(-0.65, 0.74, -1.90);
    wingGroup.add(leftPylon);

    const rightPylon = new THREE.Mesh(pylonGeo, darkMat);
    rightPylon.position.set(0.65, 0.74, -1.90);
    wingGroup.add(rightPylon);

    // Main horizontal aerofoil wing blade
    const wingGeo = new THREE.BoxGeometry(1.82, 0.05, 0.36);
    const wing = new THREE.Mesh(wingGeo, bodyMat);
    wing.position.set(0, 0.95, -1.95);
    wingGroup.add(wing);

    // Wing endplates (left & right) with glowing neon top edges
    const endplateGeo = new THREE.BoxGeometry(0.04, 0.22, 0.42);
    const endplateNeonGeo = new THREE.BoxGeometry(0.05, 0.02, 0.42);

    for (const sign of [-1, 1]) {
      const endplate = new THREE.Mesh(endplateGeo, darkMat);
      endplate.position.set(sign * 0.93, 0.95, -1.95);
      wingGroup.add(endplate);

      const endplateNeon = new THREE.Mesh(endplateNeonGeo, glowMat);
      endplateNeon.position.set(sign * 0.93, 1.06, -1.95);
      wingGroup.add(endplateNeon);
    }

    root.add(wingGroup);

    // -------------------------------------------------------------
    // 5. Rear Fascia & Aerodynamic Diffuser
    // -------------------------------------------------------------
    const rearGroup = new THREE.Group();
    rearGroup.name = 'RearFascia';

    // Rear bumper bulkhead
    const rearBumperGeo = new THREE.BoxGeometry(1.72, 0.26, 0.20);
    const rearBumper = new THREE.Mesh(rearBumperGeo, darkMat);
    rearBumper.position.set(0, 0.36, -2.12);
    rearGroup.add(rearBumper);

    // Underbody diffuser plate
    const diffuserGeo = new THREE.BoxGeometry(1.60, 0.06, 0.40);
    const diffuser = new THREE.Mesh(diffuserGeo, darkMat);
    diffuser.position.set(0, 0.12, -2.05);
    rearGroup.add(diffuser);

    // 4 vertical diffuser aero fins
    const finGeo = new THREE.BoxGeometry(0.04, 0.12, 0.35);
    for (const xPos of [-0.6, -0.2, 0.2, 0.6]) {
      const fin = new THREE.Mesh(finGeo, darkMat);
      fin.position.set(xPos, 0.16, -2.05);
      rearGroup.add(fin);
    }

    root.add(rearGroup);

    // -------------------------------------------------------------
    // 6. Dual Exhaust Tips & Nitro Exit Positions
    // -------------------------------------------------------------
    const exhaustPipes = [
      new THREE.Vector3(-0.45, 0.28, -2.25),
      new THREE.Vector3(0.45, 0.28, -2.25)
    ];

    const exhaustGroup = new THREE.Group();
    exhaustGroup.name = 'ExhaustSystem';

    const tipOuterGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.18, 12);
    const tipCoreGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12);

    for (const pipePos of exhaustPipes) {
      const tipMesh = new THREE.Mesh(tipOuterGeo, exhaustMetalMat);
      tipMesh.rotation.x = Math.PI / 2;
      tipMesh.position.set(pipePos.x, pipePos.y, pipePos.z + 0.09);
      exhaustGroup.add(tipMesh);

      const coreMesh = new THREE.Mesh(tipCoreGeo, exhaustCoreMat);
      coreMesh.rotation.x = Math.PI / 2;
      coreMesh.position.set(pipePos.x, pipePos.y, pipePos.z + 0.02);
      exhaustGroup.add(coreMesh);
    }

    root.add(exhaustGroup);

    // -------------------------------------------------------------
    // 7. Headlights & Brake Taillight Bar
    // -------------------------------------------------------------
    const lightsGroup = new THREE.Group();
    lightsGroup.name = 'CarLights';

    // Dual front headlights
    const headlightGeo = new THREE.BoxGeometry(0.36, 0.08, 0.12);
    const leftHeadlight = new THREE.Mesh(headlightGeo, headlightMat);
    leftHeadlight.position.set(-0.62, 0.40, 2.12);
    lightsGroup.add(leftHeadlight);

    const rightHeadlight = new THREE.Mesh(headlightGeo, headlightMat);
    rightHeadlight.position.set(0.62, 0.40, 2.12);
    lightsGroup.add(rightHeadlight);

    const headlights = [leftHeadlight, rightHeadlight];

    // Full-width rear reactive brake taillight bar
    const brakeBarGeo = new THREE.BoxGeometry(1.56, 0.10, 0.08);
    const brakeLightBar = new THREE.Mesh(brakeBarGeo, brakeLightMat);
    brakeLightBar.position.set(0, 0.50, -2.14);
    lightsGroup.add(brakeLightBar);

    const brakeLights = [brakeLightBar];

    root.add(lightsGroup);

    // Function to dynamically toggle brake flare intensity
    const setBraking = (isBraking) => {
      brakeLightMat.emissiveIntensity = isBraking ? 2.5 : 0.4;
      if (brakeLightMat.emissive && brakeLightMat.emissive.set) {
        brakeLightMat.emissive.set(isBraking ? 0xff0022 : 0xff0033);
      }
    };

    // -------------------------------------------------------------
    // 8. Neon Underglow
    // -------------------------------------------------------------
    const underglowGeo = new THREE.PlaneGeometry(1.60, 3.20);
    const underglowMat = new THREE.MeshBasicMaterial({
      color: makeColor(glowColor),
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const underglow = new THREE.Mesh(underglowGeo, underglowMat);
    underglow.name = 'CarUnderglow';
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.set(0, 0.06, 0);
    root.add(underglow);

    // -------------------------------------------------------------
    // 9. Wheels & Steering Pivots
    // -------------------------------------------------------------
    const wheelRadius = CarConfig.dimensions.wheelRadius; // 0.35m
    const halfBase = CarConfig.dimensions.wheelbase / 2;   // 1.30m
    const halfTrack = CarConfig.dimensions.trackWidth / 2; // 0.85m

    const wheelSpecs = [
      { name: 'frontLeft',  isFront: true,  x: -halfTrack, y: wheelRadius, z:  halfBase },
      { name: 'frontRight', isFront: true,  x:  halfTrack, y: wheelRadius, z:  halfBase },
      { name: 'rearLeft',   isFront: false, x: -halfTrack, y: wheelRadius, z: -halfBase },
      { name: 'rearRight',  isFront: false, x:  halfTrack, y: wheelRadius, z: -halfBase }
    ];

    const wheels = [];
    const wheelPivots = {};

    // Wheel geometries
    const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.28, 16);
    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.285, 12);
    const neonRimRingGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.29, 12);
    const centerCapGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.30, 8);

    for (const spec of wheelSpecs) {
      // Steer pivot group: controls yaw steering angle
      const pivot = new THREE.Group();
      pivot.name = `WheelPivot_${spec.name}`;
      pivot.position.set(spec.x, spec.y, spec.z);

      // Wheel assembly group: controls rolling rotation
      const wheelGroup = new THREE.Group();
      wheelGroup.name = `WheelAssembly_${spec.name}`;

      // Tire mesh (oriented laterally along cylinder X axis)
      const tireMesh = new THREE.Mesh(tireGeo, tireMat);
      tireMesh.rotation.z = Math.PI / 2;
      tireMesh.castShadow = true;
      wheelGroup.add(tireMesh);

      // Alloy rim mesh
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.rotation.z = Math.PI / 2;
      wheelGroup.add(rimMesh);

      // Neon rim accent ring (pulsing with car glow color)
      const neonRimMesh = new THREE.Mesh(neonRimRingGeo, glowMat);
      neonRimMesh.rotation.z = Math.PI / 2;
      wheelGroup.add(neonRimMesh);

      // Center cap
      const capMesh = new THREE.Mesh(centerCapGeo, darkMat);
      capMesh.rotation.z = Math.PI / 2;
      wheelGroup.add(capMesh);

      pivot.add(wheelGroup);
      root.add(pivot);

      wheelGroup.pivot = pivot;
      wheels.push(wheelGroup);
      wheelPivots[spec.name] = pivot;
    }

    // Attach convenience methods onto root
    root.setSteering = (angle) => {
      wheelPivots.frontLeft.rotation.y = angle;
      wheelPivots.frontRight.rotation.y = angle;
    };

    root.setWheelRoll = (delta) => {
      for (const w of wheels) {
        w.rotation.x += delta;
      }
    };

    root.setBraking = setBraking;

    // Save references to root.userData
    root.userData = {
      wheels,
      wheelPivots,
      brakeLights,
      headlights,
      exhaustPipes,
      underglow,
      setBraking,
      isPlayer
    };

    return {
      root,
      wheels,
      brakeLights,
      headlights,
      exhaustPipes,
      wheelPivots,
      underglow,
      setBraking
    };
  }
}
