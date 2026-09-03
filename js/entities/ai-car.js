/**
 * 3D Synthwave Circuit Racer — AI Opponents & Waypoint Navigation
 * Implements:
 * - AICarLogic: Pure JavaScript AI navigation engine (waypoint spline following,
 *   multi-lane pathfinding, dynamic rubberbanding, forward obstacle/rival raycast
 *   avoidance, and lap tracking). Fully testable in headless Node.js.
 * - AICar: High-level Three.js entity wrapper constructing the 3D procedural
 *   rival car mesh from CarBuilder and updating position, orientation, wheel steering/rolling,
 *   and reactive brake lights.
 */

import { CarBuilder, CarConfig } from './car-builder.js';

let defaultThree = globalThis.THREE || null;
try {
  const threeModule = await import('three');
  defaultThree = threeModule.default || threeModule;
} catch (e) {
  // Graceful fallback for headless Node.js testing
}

/**
 * 5 Rival personality profiles tuned from design specification
 */
export const AI_PERSONALITIES = {
  'Apex Nova': {
    baseSpeed: 48.5,
    aggression: 0.85,
    nitroTendency: 0.8,
    preferredLaneOffset: -5.0, // Aggressive inside line
    laneChangeSpeed: 4.5
  },
  'Cyber Phantom': {
    baseSpeed: 49.5,
    aggression: 0.50,
    nitroTendency: 0.5,
    preferredLaneOffset: 0.0,  // Clean apex cutter
    laneChangeSpeed: 3.8
  },
  'Neon Viper': {
    baseSpeed: 47.0,
    aggression: 0.75,
    nitroTendency: 0.4,
    preferredLaneOffset: 5.0,  // Defensive lane blocker
    laneChangeSpeed: 4.0
  },
  'Vapor Blade': {
    baseSpeed: 47.5,
    aggression: 0.70,
    nitroTendency: 0.6,
    preferredLaneOffset: -5.0, // Fast starter, drift enthusiast
    laneChangeSpeed: 4.2
  },
  'Pulse Fury': {
    baseSpeed: 46.5,
    aggression: 0.40,
    nitroTendency: 0.3,
    preferredLaneOffset: 0.0,  // Steady balanced racer
    laneChangeSpeed: 3.5
  }
};

/**
 * Standard 3-lane lateral offsets on 24m track (left, center, right)
 */
export const RACING_LANES = [-5.0, 0.0, 5.0];

/**
 * Pure JavaScript AI Navigation & Decision Engine.
 * Decoupled from Three.js / DOM for rapid headless unit testing.
 */
export class AICarLogic {
  /**
   * @param {Object} [options]
   * @param {string} [options.name='Apex Nova'] - Rival name matching CarConfig.rivalPalettes
   * @param {Object} [options.palette] - Rival color palette
   * @param {number} [options.baseSpeed] - Base target cruising speed in m/s
   * @param {number} [options.speed] - Initial forward speed in m/s
   * @param {number} [options.laneOffset=0] - Initial lateral offset in meters
   * @param {number} [options.initialDistance=0] - Starting distance along track
   * @param {number} [options.aggression] - Aggression factor [0, 1]
   * @param {number} [options.laneChangeSpeed] - Lateral transition speed in m/s
   */
  constructor(options = {}) {
    this.name = options.name || 'Apex Nova';
    this.palette = options.palette || null;

    // Load personality defaults
    const personality = AI_PERSONALITIES[this.name] || {
      baseSpeed: 48.0,
      aggression: 0.6,
      nitroTendency: 0.5,
      preferredLaneOffset: 0.0,
      laneChangeSpeed: 4.0
    };

    this.baseSpeed = options.baseSpeed ?? personality.baseSpeed;
    this.speed = options.speed ?? this.baseSpeed;
    this.currentSpeedTarget = this.baseSpeed;

    // Lateral lane state
    this.laneOffset = options.laneOffset ?? personality.preferredLaneOffset ?? 0.0;
    this.targetLaneOffset = this.laneOffset;
    this.preferredLaneOffset = personality.preferredLaneOffset ?? 0.0;
    this.laneChangeSpeed = options.laneChangeSpeed ?? personality.laneChangeSpeed ?? 4.0;
    this.aggression = options.aggression ?? personality.aggression ?? 0.6;
    this.nitroTendency = personality.nitroTendency ?? 0.5;

    // Longitudinal progress along track
    this.distanceTraveled = options.initialDistance ?? 0;
    this.splineProgress = 0;
    this.currentLap = 1;

    // Dynamic states
    this.isBraking = false;
    this.isBoosting = false;
    this.isRubberbandBoosting = false;
    this.isRubberbandEasing = false;

    // Boost timer and cooldown
    this.boostTimer = 0;
    this.boostCooldown = 0;
  }

  /**
   * Update AI decision making, rubberbanding, avoidance, and distance advancement.
   * Supports both (dt, trackLength, playerDistance, otherVehicles)
   * and (dt, track, playerPosition, playerDistance, otherVehicles).
   *
   * @param {number} [dt=1/60]
   * @param {number|Object} [trackOrLength=1000]
   * @param {number|Object} [arg3=0]
   * @param {number|Array} [arg4=null]
   * @param {Array} [arg5=[]]
   */
  update(dt = 1 / 60, trackOrLength = 1000, arg3 = 0, arg4 = null, arg5 = []) {
    let trackLength = 1000;
    let track = null;

    if (typeof trackOrLength === 'number') {
      trackLength = trackOrLength;
    } else if (trackOrLength && typeof trackOrLength === 'object') {
      track = trackOrLength;
      trackLength = trackOrLength.totalLength || 1000;
    }

    let playerPosition = null;
    let playerDistance = 0;
    let otherVehicles = [];

    if (typeof arg3 === 'number') {
      // Signature: update(dt, trackLength, playerDistance, otherVehicles)
      playerDistance = arg3;
      if (Array.isArray(arg4)) {
        otherVehicles = arg4;
      }
    } else {
      // Signature: update(dt, track, playerPosition, playerDistance, otherVehicles)
      // or update(dt, track, null, playerDistance, otherVehicles)
      if (arg3 && typeof arg3 === 'object') {
        playerPosition = arg3;
      }
      if (typeof arg4 === 'number') {
        playerDistance = arg4;
      } else if (Array.isArray(arg4)) {
        otherVehicles = arg4;
      }
      if (Array.isArray(arg5)) {
        otherVehicles = arg5;
      }
    }

    // Decrement boost cooldown
    this.boostCooldown -= dt;

    // -------------------------------------------------------------
    // 1. Dynamic Rubberbanding Calculation
    // -------------------------------------------------------------
    let targetSpeed = this.baseSpeed;
    const playerDiff = playerDistance - this.distanceTraveled;

    if (playerDiff > 80) {
      // Player is ahead by > 80m -> Speed up (+6% to +14%)
      this.isRubberbandBoosting = true;
      this.isRubberbandEasing = false;
      const boostRatio = 1.06 + Math.min(0.08, ((playerDiff - 80) / 400) * 0.08);
      targetSpeed = this.baseSpeed * boostRatio;

      // Strategic nitro activation when player leads significantly
      if (playerDiff > 120 && this.boostTimer <= 0 && this.boostCooldown <= 0 && Math.random() < this.nitroTendency * dt * 0.5) {
        this.isBoosting = true;
        this.boostTimer = 2.0; // 2 seconds of nitro
        this.boostCooldown = 6.0;
      }
    } else if (playerDiff < -80) {
      // Player is behind by > 80m -> Ease speed target (-8% to -14%)
      this.isRubberbandBoosting = false;
      this.isRubberbandEasing = true;
      const easeRatio = 0.92 - Math.min(0.06, ((-playerDiff - 80) / 400) * 0.06);
      targetSpeed = this.baseSpeed * easeRatio;
    } else {
      // Neutral zone [-80m, +80m]
      this.isRubberbandBoosting = false;
      this.isRubberbandEasing = false;
      targetSpeed = this.baseSpeed;
    }

    // Active boost bonus
    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      targetSpeed += 10.0; // +10 m/s nitro boost
      if (this.boostTimer <= 0) {
        this.isBoosting = false;
      }
    }

    // -------------------------------------------------------------
    // 2. Obstacle & Rival Raycasting & Multi-Lane Avoidance
    // -------------------------------------------------------------
    this.isBraking = false;
    let nearestObstacleAhead = null;

    if (otherVehicles && otherVehicles.length > 0) {
      const SENSOR_RANGE = 25.0; // Forward detection range (meters)
      let minAheadDist = Infinity;

      for (const veh of otherVehicles) {
        if (veh === this || (veh.logic && veh.logic === this)) continue;

        const vehDist = typeof veh.distanceTraveled === 'number'
          ? veh.distanceTraveled
          : (veh.distanceAlongTrack || 0);

        const vehLane = typeof veh.laneOffset === 'number'
          ? veh.laneOffset
          : (veh.logic?.laneOffset ?? 0);

        let relDist = vehDist - this.distanceTraveled;
        if (trackLength > 0) {
          while (relDist > trackLength / 2) relDist -= trackLength;
          while (relDist < -trackLength / 2) relDist += trackLength;
        }

        // Check if vehicle is in forward detection window
        if (relDist > 0.5 && relDist < SENSOR_RANGE) {
          const latDist = Math.abs(vehLane - this.laneOffset);
          if (latDist < 2.5 && relDist < minAheadDist) {
            minAheadDist = relDist;
            nearestObstacleAhead = { veh, relDist, vehLane };
          }
        }
      }

      if (nearestObstacleAhead) {
        // Vehicle directly ahead in our path: evaluate clear candidate lanes
        let bestCandidate = this.targetLaneOffset;
        let lowestCost = Infinity;

        for (const candidate of RACING_LANES) {
          let laneBlocked = false;

          for (const obs of otherVehicles) {
            if (obs === this || (obs.logic && obs.logic === this)) continue;

            const oDist = typeof obs.distanceTraveled === 'number'
              ? obs.distanceTraveled
              : (obs.distanceAlongTrack || 0);

            const oLane = typeof obs.laneOffset === 'number'
              ? obs.laneOffset
              : (obs.logic?.laneOffset ?? 0);

            let oRel = oDist - this.distanceTraveled;
            if (trackLength > 0) {
              while (oRel > trackLength / 2) oRel -= trackLength;
              while (oRel < -trackLength / 2) oRel += trackLength;
            }

            // Check if candidate lane is occupied near current progress
            if (Math.abs(oLane - candidate) < 2.2 && oRel > -6 && oRel < 28) {
              laneBlocked = true;
              break;
            }
          }

          // Cost function: heavily penalize blocked lanes; prefer smallest lateral shift
          let cost = laneBlocked
            ? 1000 + Math.abs(candidate - this.laneOffset)
            : Math.abs(candidate - this.laneOffset) + Math.abs(candidate - this.preferredLaneOffset) * 0.1;

          if (cost < lowestCost) {
            lowestCost = cost;
            bestCandidate = candidate;
          }
        }

        this.targetLaneOffset = bestCandidate;

        // If obstacle is very close (< 10m), brake to prevent collision
        if (nearestObstacleAhead.relDist < 10.0) {
          this.isBraking = true;
          const obstacleSpeed = nearestObstacleAhead.veh.speed || 30;
          targetSpeed = Math.min(targetSpeed, obstacleSpeed * 0.9);
        }
      }
    }

    if (!nearestObstacleAhead) {
      this.targetLaneOffset = this.preferredLaneOffset;
    }

    this.currentSpeedTarget = targetSpeed;

    // -------------------------------------------------------------
    // 3. Speed Acceleration / Deceleration
    // -------------------------------------------------------------
    if (this.speed < this.currentSpeedTarget) {
      // Accelerate towards target
      this.speed = Math.min(this.currentSpeedTarget, this.speed + 25.0 * dt);
    } else if (this.speed > this.currentSpeedTarget) {
      // Decelerate / Brake
      const decel = this.isBraking ? 40.0 : 15.0;
      this.speed = Math.max(this.currentSpeedTarget, this.speed - decel * dt);
    }

    // -------------------------------------------------------------
    // 4. Smooth Lateral Lane Shifting
    // -------------------------------------------------------------
    if (Math.abs(this.targetLaneOffset - this.laneOffset) > 0.01) {
      const laneDiff = this.targetLaneOffset - this.laneOffset;
      const step = Math.sign(laneDiff) * Math.min(Math.abs(laneDiff), this.laneChangeSpeed * dt);
      this.laneOffset += step;
    } else {
      this.laneOffset = this.targetLaneOffset;
    }

    // Clamp lane offset within track boundary limits [-7m, +7m]
    this.laneOffset = Math.max(-7.0, Math.min(7.0, this.laneOffset));

    // -------------------------------------------------------------
    // 5. Advance Distance Along Track & Lap Tracking
    // -------------------------------------------------------------
    this.distanceTraveled += this.speed * dt;

    if (trackLength > 0) {
      this.splineProgress = ((this.distanceTraveled % trackLength) + trackLength) % trackLength / trackLength;

      const calculatedLap = Math.floor(this.distanceTraveled / trackLength) + 1;
      if (calculatedLap > this.currentLap) {
        this.currentLap = calculatedLap;
      }
    }
  }
}

/**
 * Lightweight 3D vector helper for headless Node.js testing
 */
class Vec3 {
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
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  clone() {
    return new Vec3(this.x, this.y, this.z);
  }
}

/**
 * Three.js AI Opponent Car Controller.
 * Wraps AICarLogic and creates/animates procedural 3D synthwave rival mesh.
 */
export class AICar {
  /**
   * @param {Object} [options]
   * @param {Object} [options.three] - Three.js instance or mock
   * @param {string} [options.name='Apex Nova'] - Rival driver name
   * @param {Object} [options.palette] - CarConfig palette definition
   * @param {number} [options.baseSpeed] - Base target speed in m/s
   * @param {number} [options.speed] - Initial speed in m/s
   * @param {number} [options.laneOffset=0] - Initial lateral lane offset in meters
   * @param {number} [options.initialDistance=0] - Starting distance along track
   * @param {Object} [options.track=null] - TrackMath instance
   * @param {Object} [options.scene=null] - Three.js scene to attach car mesh to
   */
  constructor(options = {}) {
    this.three = options.three || defaultThree;
    this.name = options.name || 'Apex Nova';
    this.track = options.track || null;

    // Resolve palette from CarConfig.rivalPalettes
    const matchedPalette = options.palette
      || CarConfig.rivalPalettes.find(p => p.name === this.name)
      || CarConfig.rivalPalettes[0];
    this.palette = matchedPalette;

    // Instantiate AI logic
    this.logic = new AICarLogic({
      name: this.name,
      palette: this.palette,
      baseSpeed: options.baseSpeed,
      speed: options.speed,
      laneOffset: options.laneOffset,
      initialDistance: options.initialDistance
    });

    // 3D coordinate representations
    const VectorClass = (this.three && this.three.Vector3) ? this.three.Vector3 : Vec3;
    this.position = new VectorClass(0, 0, 0);
    this.velocity = new VectorClass(0, 0, 0);

    // Three.js car mesh hierarchy
    this.carParts = null;
    this.mesh = null;

    if (this.three) {
      this.carParts = CarBuilder.createCarMesh({
        THREE: this.three,
        isPlayer: false,
        name: `AICar_${this.name}`,
        ...this.palette
      });
      this.mesh = this.carParts.root;

      if (options.scene && typeof options.scene.add === 'function') {
        options.scene.add(this.mesh);
      }
    }

    // Synchronize initial position if track is provided
    if (this.track) {
      this._updateTransform(this.track, 0);
    }
  }

  // Convenience state getters delegating to logic
  get speed() { return this.logic.speed; }
  get splineProgress() { return this.logic.splineProgress; }
  get currentLap() { return this.logic.currentLap; }
  get distanceTraveled() { return this.logic.distanceTraveled; }
  get laneOffset() { return this.logic.laneOffset; }
  get isBraking() { return this.logic.isBraking; }
  get isBoosting() { return this.logic.isBoosting; }

  /**
   * Get speed in km/h
   * @returns {number}
   */
  getSpeedKmH() {
    return Math.round(this.logic.speed * 3.6);
  }

  /**
   * Get normalized forward heading vector along track
   * @returns {{x: number, y: number, z: number}}
   */
  getHeadingVector() {
    if (this.track && typeof this.track.getSplineTangent === 'function') {
      const tan = this.track.getSplineTangent(this.logic.splineProgress);
      return { x: tan.x, y: 0, z: tan.z };
    }
    return { x: 0, y: 0, z: 1 };
  }

  /**
   * Update AI logic and synchronize Three.js mesh transform
   *
   * @param {number} dt - Timestep in seconds
   * @param {Object} [track] - TrackMath instance
   * @param {Object} [playerPosition] - Player car position vector
   * @param {number} [playerDistance] - Player car distance along track
   * @param {Array} [otherVehicles] - List of other cars on track
   */
  update(dt = 1 / 60, track = this.track, playerPosition = null, playerDistance = 0, otherVehicles = []) {
    this.track = track || this.track;
    this.logic.update(dt, this.track, playerPosition, playerDistance, otherVehicles);

    if (this.track) {
      this._updateTransform(this.track, dt);
    }
  }

  /**
   * Updates Three.js mesh world transform, wheel animations, and reactive brake lights
   * @private
   */
  _updateTransform(track, dt = 1 / 60) {
    if (!track || typeof track.getSplinePoint !== 'function') return;

    const t = this.logic.splineProgress;
    const center = track.getSplinePoint(t);
    const tangent = track.getSplineTangent(t);
    const normal = track.getNormalAt(t);

    // 1. Calculate world position with lateral lane offset
    const posX = center.x + normal.x * this.logic.laneOffset;
    const posY = center.y + 0.35; // ground clearance
    const posZ = center.z + normal.z * this.logic.laneOffset;

    this.position.set(posX, posY, posZ);

    // 2. Linear velocity vector along track tangent
    this.velocity.set(tangent.x * this.speed, tangent.y * this.speed, tangent.z * this.speed);

    // 3. Synchronize Three.js visual representation
    if (this.mesh) {
      this.mesh.position.set(posX, posY, posZ);

      // Tangent heading + dynamic yaw tilt during lane transitions
      const baseHeading = Math.atan2(tangent.x, tangent.z);
      const laneDelta = this.logic.targetLaneOffset - this.logic.laneOffset;
      const steerYaw = Math.max(-0.25, Math.min(0.25, laneDelta * 0.15));
      const visualHeading = baseHeading + steerYaw;

      // Pitch follows track incline: positive tangent.y (uphill) tilts nose up (-X rotation in Three.js)
      const pitch = -Math.asin(Math.max(-0.5, Math.min(0.5, tangent.y)));

      if (typeof this.mesh.rotation.set === 'function') {
        this.mesh.rotation.set(pitch, visualHeading, 0);
      } else {
        this.mesh.rotation.x = pitch;
        this.mesh.rotation.y = visualHeading;
        this.mesh.rotation.z = 0;
      }

      // Wheel steering yaw
      if (typeof this.mesh.setSteering === 'function') {
        this.mesh.setSteering(steerYaw);
      }

      // Wheel rolling rotation based on distance traveled
      const wheelRadius = CarConfig?.dimensions?.wheelRadius || 0.35;
      const deltaRoll = (this.speed * dt) / wheelRadius;
      if (typeof this.mesh.setWheelRoll === 'function') {
        this.mesh.setWheelRoll(deltaRoll);
      }

      // Reactive brake lights
      if (typeof this.mesh.setBraking === 'function') {
        this.mesh.setBraking(this.logic.isBraking);
      }
    }
  }

  /**
   * Reset AI vehicle to specified track distance and lane offset
   * @param {Object} [track]
   * @param {number} [distance=0]
   * @param {number|null} [laneOffset=null]
   */
  resetToTrack(track = this.track, distance = 0, laneOffset = null) {
    this.track = track || this.track;
    this.logic.distanceTraveled = distance;
    this.logic.speed = this.logic.baseSpeed;
    if (laneOffset !== null) {
      this.logic.laneOffset = laneOffset;
      this.logic.targetLaneOffset = laneOffset;
    }
    const trackLen = this.track ? this.track.totalLength : 1000;
    this.logic.splineProgress = trackLen > 0 ? (((distance % trackLen) + trackLen) % trackLen) / trackLen : 0;
    this.logic.currentLap = 1;
    this.logic.isBraking = false;
    this.logic.isBoosting = false;
    this.logic.boostTimer = 0;
    this.logic.boostCooldown = 0;

    if (this.track) {
      this._updateTransform(this.track, 0);
    }
  }
}
