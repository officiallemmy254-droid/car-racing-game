/**
 * 3D Synthwave Circuit Racer — Player Vehicle Physics & Controller
 * Implements:
 * - VehiclePhysics: Pure JS arcade physics engine (speed-sensitive steering,
 *   lateral drift slip, nitro boost, mini-turbo kick, barrier collision response,
 *   coasting/aerodynamic drag, and track elevation matching).
 * - PlayerCar: High-level vehicle controller wrapping VehiclePhysics and Three.js
 *   3D procedural car model with chassis pitch/roll lean, front wheel steering yaw,
 *   rolling wheels, reactive brake lights, and particle/camera emitter hooks.
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
 * Arcade vehicle physics specifications & constants
 */
export const PHYSICS_CONSTANTS = {
  // Speed limits (m/s)
  MAX_SPEED_NORMAL: 52.8,         // ~190 km/h
  MAX_SPEED_NITRO: 68.1,          // ~245 km/h
  MAX_SPEED_REVERSE: -12.0,       // ~-43 km/h

  // Acceleration & Braking (m/s^2)
  ACCEL_FORCE: 28.0,              // Base acceleration force
  NITRO_ACCEL_BONUS: 16.0,        // Additional acceleration under nitro boost
  BRAKE_FORCE: 42.0,              // Braking deceleration
  REVERSE_ACCEL: 14.0,            // Reverse acceleration force

  // Natural Drag & Rolling Friction
  COAST_DRAG: 0.988,              // Per-frame coasting decay at 60fps
  AERO_DRAG: 0.0012,              // Aerodynamic drag coefficient Cd

  // Speed-Sensitive Steering (radians)
  STEER_MAX_LOW: 0.62,            // ~35.5 deg at low speeds
  STEER_MAX_HIGH: 0.22,           // ~12.6 deg at max speed
  STEER_INPUT_RATE: 10.0,         // Steering response rate (rad/s)
  STEER_RETURN_RATE: 8.0,         // Auto-centering return rate (rad/s)
  WHEELBASE: 2.6,                 // Wheelbase between axles in meters

  // Drift Mechanics
  DRIFT_TRIGGER_SPEED: 15.0,      // Min speed to initiate drift (m/s)
  DRIFT_MIN_SPEED: 10.0,          // Min speed to sustain drift (m/s)
  DRIFT_MAX_ANGLE: 0.40,          // Max oversteer yaw angle (~23 deg)
  DRIFT_YAW_RATE_MULT: 1.45,      // Enhanced yaw turning rate while drifting
  DRIFT_LATERAL_SLIP: 0.25,       // Lateral slip fraction
  DRIFT_RECHARGE_RATE: 18.0,      // +18% nitro per second of drift

  // Mini-Turbo Reward
  MINI_TURBO_MIN_DRIFT: 1.2,      // Minimum sustained drift duration (seconds)
  MINI_TURBO_KICK: 15.0 / 3.6,    // Instant +15 km/h kick (4.167 m/s)
  MINI_TURBO_DURATION: 0.8,       // Mini-turbo duration in seconds

  // Nitro Boost & Capacity
  NITRO_CAPACITY: 100.0,          // Total gauge capacity (units)
  NITRO_CONSUMPTION: 25.0,        // Units consumed per second (100 / 4s)

  // Drafting (Slipstream)
  DRAFTING_TOP_SPEED_BONUS: 0.12, // +12% top speed boost

  // Barrier Collisions
  COLLISION_RADIUS: 1.0,          // Vehicle collision radius (meters)
  BARRIER_DAMPING: 0.70,          // Damp forward speed by 30% on barrier collision
  BARRIER_RESTITUTION: 0.50       // Normal bounce restitution
};

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
  length() {
    return Math.hypot(this.x, this.y, this.z);
  }
}

/**
 * Pure JavaScript arcade vehicle physics engine.
 * Completely headless and testable in Node.js without DOM or Three.js.
 */
export class VehiclePhysics {
  /**
   * @param {Object} [options]
   * @param {{x: number, y: number, z: number}} [options.initialPosition]
   * @param {number} [options.initialHeading=0]
   */
  constructor({ initialPosition = { x: 0, y: 0.35, z: 0 }, initialHeading = 0 } = {}) {
    this.position = new Vec3(initialPosition.x, initialPosition.y, initialPosition.z);
    this.velocity = new Vec3(0, 0, 0);
    this.speed = 0;                 // Forward speed (m/s)
    this.heading = initialHeading;  // Heading angle (radians, 0 = +Z)
    this.steerAngle = 0;            // Current front wheel steering angle (radians)

    // Nitro state
    this.nitroLevel = PHYSICS_CONSTANTS.NITRO_CAPACITY;
    this.isBoosting = false;
    this.isDrafting = false;

    // Drift state
    this.isDrifting = false;
    this.driftDirection = 1;        // -1 (left) or 1 (right)
    this.driftDuration = 0;         // Seconds of continuous drift
    this.driftAngle = 0;            // Oversteer yaw angle (radians)

    // Mini-Turbo state
    this.hasMiniTurbo = false;
    this.miniTurboTimer = 0;

    // Braking & collision state
    this.isBraking = false;
    this.hasCollidedBarrier = false;
    this.barrierCollision = {
      collided: false,
      normal: { x: 0, y: 0, z: 0 },
      penetration: 0,
      intensity: 0
    };

    // Track progression tracking
    this.splineProgress = 0;
    this.distanceAlongTrack = 0;
  }

  /**
   * Advance vehicle physics by fixed timestep dt.
   *
   * @param {Object} input
   * @param {number} [input.throttle=0] - Throttle input [0, 1]
   * @param {number} [input.brake=0] - Brake input [0, 1]
   * @param {number} [input.steer=0] - Steer input [-1, 1]
   * @param {boolean} [input.drift=false] - Drift / Handbrake button
   * @param {boolean} [input.nitro=false] - Nitro boost button
   * @param {number} [dt=1/60] - Timestep in seconds
   * @param {Object} [track=null] - Optional TrackMath instance for barriers and elevation
   */
  step(input = {}, dt = 1 / 60, track = null) {
    const throttle = typeof input.throttle === 'number' ? input.throttle : (input.throttle ? 1 : 0);
    const brake = typeof input.brake === 'number' ? input.brake : (input.brake ? 1 : 0);
    const steer = typeof input.steer === 'number' ? input.steer : 0;
    const wantsDrift = !!input.drift;
    const wantsNitro = !!input.nitro;

    // -------------------------------------------------------------
    // 1. Nitro Boost & Gauge Consumption
    // -------------------------------------------------------------
    if (wantsNitro && this.nitroLevel > 0) {
      this.isBoosting = true;
      this.nitroLevel = Math.max(0, this.nitroLevel - PHYSICS_CONSTANTS.NITRO_CONSUMPTION * dt);
      if (this.nitroLevel <= 0) {
        this.isBoosting = false;
      }
    } else {
      this.isBoosting = false;
    }

    // Determine target top speed
    let targetTopSpeed = PHYSICS_CONSTANTS.MAX_SPEED_NORMAL;
    if (this.isBoosting) {
      targetTopSpeed = PHYSICS_CONSTANTS.MAX_SPEED_NITRO;
    } else if (this.isDrafting) {
      targetTopSpeed = PHYSICS_CONSTANTS.MAX_SPEED_NORMAL * (1 + PHYSICS_CONSTANTS.DRAFTING_TOP_SPEED_BONUS);
    }

    // -------------------------------------------------------------
    // 2. Drift Initiation, Nitro Accumulation & Mini-Turbo
    // -------------------------------------------------------------
    const wasDrifting = this.isDrifting;
    const hasDriftSpeed = Math.abs(this.speed) >= PHYSICS_CONSTANTS.DRIFT_TRIGGER_SPEED;
    const hasSustainSpeed = Math.abs(this.speed) >= PHYSICS_CONSTANTS.DRIFT_MIN_SPEED;
    const hasSteerInput = Math.abs(steer) > 0.05;

    if (wantsDrift && ((!wasDrifting && hasDriftSpeed && hasSteerInput) || (wasDrifting && hasSustainSpeed))) {
      this.isDrifting = true;
      if (hasSteerInput) {
        this.driftDirection = Math.sign(steer);
      }
      this.driftDuration += dt;
      // Recharges nitro gauge by +18%/s
      this.nitroLevel = Math.min(
        PHYSICS_CONSTANTS.NITRO_CAPACITY,
        this.nitroLevel + PHYSICS_CONSTANTS.DRIFT_RECHARGE_RATE * dt
      );
    } else {
      this.isDrifting = false;
      if (wasDrifting) {
        // Exiting sustained drift >= 1.2s grants mini-turbo boost kick
        if (this.driftDuration >= PHYSICS_CONSTANTS.MINI_TURBO_MIN_DRIFT) {
          this.hasMiniTurbo = true;
          this.miniTurboTimer = PHYSICS_CONSTANTS.MINI_TURBO_DURATION;
          this.speed += PHYSICS_CONSTANTS.MINI_TURBO_KICK;
        }
        this.driftDuration = 0;
      }
    }

    // Mini-Turbo timer countdown
    if (this.miniTurboTimer > 0) {
      this.miniTurboTimer -= dt;
      if (this.miniTurboTimer <= 0) {
        this.hasMiniTurbo = false;
        this.miniTurboTimer = 0;
      }
    }

    // -------------------------------------------------------------
    // 3. Longitudinal Acceleration & Braking Dynamics
    // -------------------------------------------------------------
    if (brake > 0.05) {
      if (this.speed > 0) {
        this.isBraking = true;
        this.speed = Math.max(0, this.speed - PHYSICS_CONSTANTS.BRAKE_FORCE * brake * dt);
      } else {
        // Holding brake at standstill marks braking, continuing into reverse
        this.isBraking = this.speed >= 0;
        this.speed = Math.max(
          PHYSICS_CONSTANTS.MAX_SPEED_REVERSE,
          this.speed - PHYSICS_CONSTANTS.REVERSE_ACCEL * brake * dt
        );
      }
    } else {
      this.isBraking = false;
      if (throttle > 0.05) {
        if (this.speed < 0) {
          // Forward throttle acts as brake when moving backward
          this.isBraking = true;
          this.speed = Math.min(0, this.speed + PHYSICS_CONSTANTS.BRAKE_FORCE * throttle * dt);
        } else {
          // Non-linear power curve scaling smoothly with current speed ratio
          let accelForce = PHYSICS_CONSTANTS.ACCEL_FORCE;
          if (this.isBoosting) {
            accelForce += PHYSICS_CONSTANTS.NITRO_ACCEL_BONUS;
          }

          const speedRatio = Math.min(1, Math.max(0, this.speed / targetTopSpeed));
          const powerFactor = Math.max(0, Math.pow(1 - speedRatio, 0.7));
          const accel = accelForce * powerFactor * throttle;

          this.speed += accel * dt;
          if (this.speed > targetTopSpeed) {
            // Smoothly bleed off excess speed when dropping out of boost
            this.speed = Math.max(targetTopSpeed, this.speed - 12.0 * dt);
          }
        }
      } else {
        // Coasting deceleration & aerodynamic drag
        if (this.speed > 0) {
          this.speed *= Math.pow(PHYSICS_CONSTANTS.COAST_DRAG, dt * 60);
          this.speed -= PHYSICS_CONSTANTS.AERO_DRAG * (this.speed ** 2) * dt;
          if (this.speed < 0.05) this.speed = 0;
        } else if (this.speed < 0) {
          this.speed *= Math.pow(PHYSICS_CONSTANTS.COAST_DRAG, dt * 60);
          if (this.speed > -0.05) this.speed = 0;
        }
      }
    }

    // -------------------------------------------------------------
    // 4. Speed-Sensitive Steering & Oversteer Drift Slip
    // -------------------------------------------------------------
    const speedRatioNorm = Math.min(1, Math.max(0, Math.abs(this.speed) / PHYSICS_CONSTANTS.MAX_SPEED_NORMAL));
    const maxSteer = PHYSICS_CONSTANTS.STEER_MAX_LOW - (PHYSICS_CONSTANTS.STEER_MAX_LOW - PHYSICS_CONSTANTS.STEER_MAX_HIGH) * speedRatioNorm;
    const targetSteerAngle = steer * maxSteer;

    if (Math.abs(steer) > 0.05) {
      const diff = targetSteerAngle - this.steerAngle;
      this.steerAngle += Math.sign(diff) * Math.min(Math.abs(diff), PHYSICS_CONSTANTS.STEER_INPUT_RATE * dt);
    } else {
      // Auto-centering return rate
      if (Math.abs(this.steerAngle) < PHYSICS_CONSTANTS.STEER_RETURN_RATE * dt) {
        this.steerAngle = 0;
      } else {
        this.steerAngle -= Math.sign(this.steerAngle) * PHYSICS_CONSTANTS.STEER_RETURN_RATE * dt;
      }
    }

    // Oversteer yaw angle during drift
    if (this.isDrifting) {
      const targetDriftAngle = this.driftDirection * PHYSICS_CONSTANTS.DRIFT_MAX_ANGLE;
      this.driftAngle += (targetDriftAngle - this.driftAngle) * Math.min(1, 8.0 * dt);
    } else {
      this.driftAngle += (0 - this.driftAngle) * Math.min(1, 10.0 * dt);
    }

    // -------------------------------------------------------------
    // 5. Kinematic Heading & Velocity Integration
    // -------------------------------------------------------------
    if (Math.abs(this.speed) > 0.05) {
      let yawRate = (this.speed / PHYSICS_CONSTANTS.WHEELBASE) * Math.sin(this.steerAngle);
      if (this.isDrifting) {
        yawRate *= PHYSICS_CONSTANTS.DRIFT_YAW_RATE_MULT;
      }
      this.heading += yawRate * dt;

      // Wrap heading to [-PI, PI]
      while (this.heading > Math.PI) this.heading -= 2 * Math.PI;
      while (this.heading < -Math.PI) this.heading += 2 * Math.PI;
    }

    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    // Lateral drift slip: car slides outward during drift
    let lateralSlip = 0;
    if (this.isDrifting) {
      lateralSlip = -this.driftDirection * this.speed * PHYSICS_CONSTANTS.DRIFT_LATERAL_SLIP;
    }

    this.velocity.x = sinH * this.speed + cosH * lateralSlip;
    this.velocity.z = cosH * this.speed - sinH * lateralSlip;

    // Position integration
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // -------------------------------------------------------------
    // 6. Barrier Collisions & Track Elevation
    // -------------------------------------------------------------
    this.hasCollidedBarrier = false;
    this.barrierCollision = {
      collided: false,
      normal: { x: 0, y: 0, z: 0 },
      penetration: 0,
      intensity: 0
    };

    if (track && typeof track.checkBarrierCollision === 'function') {
      const barrier = track.checkBarrierCollision(this.position, PHYSICS_CONSTANTS.COLLISION_RADIUS);
      if (barrier.collided) {
        this.hasCollidedBarrier = true;

        // Push vehicle back within track boundary
        this.position.x += barrier.normal.x * barrier.penetration;
        this.position.y += barrier.normal.y * barrier.penetration;
        this.position.z += barrier.normal.z * barrier.penetration;

        // Damp forward speed by 30%
        this.speed *= PHYSICS_CONSTANTS.BARRIER_DAMPING;

        // Reflect velocity across barrier normal
        const normalDot = this.velocity.x * barrier.normal.x + this.velocity.z * barrier.normal.z;
        const impactIntensity = Math.abs(normalDot);

        if (normalDot < 0) {
          const rest = 1 + PHYSICS_CONSTANTS.BARRIER_RESTITUTION;
          this.velocity.x -= rest * normalDot * barrier.normal.x;
          this.velocity.z -= rest * normalDot * barrier.normal.z;

          // Realign heading to reflected velocity
          this.heading = Math.atan2(this.velocity.x, this.velocity.z);
        }

        this.barrierCollision = {
          collided: true,
          normal: barrier.normal,
          penetration: barrier.penetration,
          intensity: impactIntensity
        };
      }
    }

    // Spline projection for road height and lap progress tracking
    if (track && typeof track.projectPoint === 'function') {
      const proj = track.projectPoint(this.position);
      this.splineProgress = proj.t;
      this.distanceAlongTrack = proj.distance;

      // Follow track elevation smoothly (wheel center at +0.35m)
      const targetY = proj.trackPoint.y + 0.35;
      this.position.y += (targetY - this.position.y) * Math.min(1, 15 * dt);
    }
  }

  /**
   * Re-aligns vehicle onto track centerline at current track progress
   * @param {Object} track - TrackMath instance
   */
  resetToTrack(track) {
    if (track && typeof track.projectPoint === 'function') {
      const proj = track.projectPoint(this.position);
      this.position.set(proj.trackPoint.x, proj.trackPoint.y + 0.35, proj.trackPoint.z);
      const tan = track.getSplineTangent(proj.t);
      this.heading = Math.atan2(tan.x, tan.z);
      this.splineProgress = proj.t;
      this.distanceAlongTrack = proj.distance;
    } else {
      this.position.set(0, 0.35, 0);
      this.heading = 0;
      this.splineProgress = 0;
      this.distanceAlongTrack = 0;
    }

    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.steerAngle = 0;
    this.isDrifting = false;
    this.driftDuration = 0;
    this.driftAngle = 0;
    this.isBoosting = false;
    this.hasMiniTurbo = false;
    this.miniTurboTimer = 0;
    this.isBraking = false;
    this.hasCollidedBarrier = false;
  }
}

/**
 * Three.js Player Car Entity Controller.
 * Wraps VehiclePhysics, builds procedural 3D synthwave car model,
 * drives wheel steering, rolling rotation, chassis roll/pitch lean,
 * reactive brake taillights, and provides camera/particle emitter anchors.
 */
export class PlayerCar {
  /**
   * @param {Object} [options]
   * @param {Object} [options.three] - Three.js instance or mock
   * @param {Object} [options.palette] - CarConfig palette
   * @param {{x: number, y: number, z: number}} [options.initialPosition]
   * @param {number} [options.initialHeading=0]
   * @param {Object} [options.scene] - Three.js scene to attach car mesh to
   */
  constructor({
    three = defaultThree,
    palette = CarConfig.playerPalette,
    initialPosition = { x: 0, y: 0.35, z: 0 },
    initialHeading = 0,
    scene = null
  } = {}) {
    this.three = three;
    this.palette = palette;
    this.physics = new VehiclePhysics({ initialPosition, initialHeading });

    this.mesh = null;
    this.carParts = null;
    this.currentLap = 1;
    this.previousProgress = 0;

    // Dynamic chassis visual lean
    this.pitch = 0;
    this.roll = 0;

    // Create 3D car mesh if Three.js is available
    if (this.three) {
      this.carParts = CarBuilder.createCarMesh({
        THREE: this.three,
        isPlayer: true,
        ...(this.palette || {})
      });
      this.mesh = this.carParts.root;
      this.mesh.position.set(this.physics.position.x, this.physics.position.y, this.physics.position.z);
      this.mesh.rotation.y = this.physics.heading;
      if (scene && typeof scene.add === 'function') {
        scene.add(this.mesh);
      }
    }

    this.inputState = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };
  }

  // Physics state pass-through getters
  get position() { return this.physics.position; }
  get velocity() { return this.physics.velocity; }
  get speed() { return this.physics.speed; }
  get heading() { return this.physics.heading; }
  get isDrifting() { return this.physics.isDrifting; }
  get isBoosting() { return this.physics.isBoosting; }
  get isBraking() { return this.physics.isBraking; }
  get nitroLevel() { return this.physics.nitroLevel; }
  get hasMiniTurbo() { return this.physics.hasMiniTurbo; }
  get splineProgress() { return this.physics.splineProgress; }
  get driftAngle() { return this.physics.driftAngle; }
  get hasCollidedBarrier() { return this.physics.hasCollidedBarrier; }
  get barrierCollision() { return this.physics.barrierCollision; }

  getSpeed() { return this.physics.speed; }
  getSpeedKmH() { return Math.round(this.physics.speed * 3.6); }
  getNitroLevel() { return this.physics.nitroLevel; }

  /**
   * Returns normalized forward heading unit vector
   * @returns {{x: number, y: number, z: number}}
   */
  getHeadingVector() {
    const h = this.physics.heading;
    return { x: Math.sin(h), y: 0, z: Math.cos(h) };
  }

  /**
   * Set slipstream drafting state
   * @param {boolean} isDrafting
   */
  setDrafting(isDrafting) {
    this.physics.isDrafting = !!isDrafting;
  }

  /**
   * Update vehicle physics and mesh animations
   * Supports both (dt, track, inputState) and (inputState, dt, track)
   */
  update(arg1, arg2, arg3) {
    let dt = 1 / 60;
    let track = null;
    let inputState = this.inputState;

    if (typeof arg1 === 'number') {
      dt = arg1;
      track = arg2 || null;
      if (arg3 && typeof arg3 === 'object') {
        inputState = arg3;
      }
    } else if (typeof arg1 === 'object' && arg1 !== null) {
      inputState = arg1;
      dt = typeof arg2 === 'number' ? arg2 : 1 / 60;
      track = arg3 || null;
    }

    this.inputState = inputState;

    // Step physics
    this.physics.step(inputState, dt, track);

    // Track lap crossing (progress wrapping from >0.8 to <0.2)
    if (this.physics.splineProgress !== undefined) {
      const cur = this.physics.splineProgress;
      const prev = this.previousProgress;
      if (prev > 0.80 && cur < 0.20) {
        this.currentLap++;
      }
      this.previousProgress = cur;
    }

    // Update Three.js mesh visual presentation
    if (this.mesh) {
      // 1. Position
      this.mesh.position.set(this.physics.position.x, this.physics.position.y, this.physics.position.z);

      // 2. Chassis Pitch & Roll dynamics
      let targetPitch = 0;
      if (this.physics.isBraking) {
        targetPitch = 0.05; // nose dip under braking
      } else if (inputState.throttle > 0) {
        targetPitch = -0.03 * (inputState.throttle || 1); // nose lift under acceleration
      }

      const steerRatio = this.physics.steerAngle / PHYSICS_CONSTANTS.STEER_MAX_LOW;
      const speedRatio = Math.min(1, Math.abs(this.physics.speed) / 25);
      let targetRoll = -0.08 * steerRatio * speedRatio; // body roll outward in turn
      if (this.physics.isDrifting) {
        targetRoll += this.physics.driftDirection * 0.06; // extra drift roll
      }

      this.pitch += (targetPitch - this.pitch) * Math.min(1, 10 * dt);
      this.roll += (targetRoll - this.roll) * Math.min(1, 10 * dt);

      // Visual yaw includes oversteer drift angle
      const visualYaw = this.physics.heading + this.physics.driftAngle;
      if (typeof this.mesh.rotation.set === 'function') {
        this.mesh.rotation.set(this.pitch, visualYaw, this.roll);
      } else {
        this.mesh.rotation.x = this.pitch;
        this.mesh.rotation.y = visualYaw;
        this.mesh.rotation.z = this.roll;
      }

      // 3. Wheel steering
      if (typeof this.mesh.setSteering === 'function') {
        this.mesh.setSteering(this.physics.steerAngle);
      }

      // 4. Wheel rolling rotation
      const wheelRadius = CarConfig?.dimensions?.wheelRadius || 0.35;
      const deltaRoll = (this.physics.speed * dt) / wheelRadius;
      if (typeof this.mesh.setWheelRoll === 'function') {
        this.mesh.setWheelRoll(deltaRoll);
      }

      // 5. Reactive taillight brake flare
      const isBraking = (inputState.brake > 0.05) || this.physics.isBraking;
      if (typeof this.mesh.setBraking === 'function') {
        this.mesh.setBraking(isBraking);
      }
    }
  }

  /**
   * Reset vehicle to track centerline and orientation
   * @param {Object} track - TrackMath instance
   */
  resetToTrack(track) {
    this.physics.resetToTrack(track);
    this.pitch = 0;
    this.roll = 0;
    if (this.mesh) {
      this.mesh.position.set(this.physics.position.x, this.physics.position.y, this.physics.position.z);
      if (typeof this.mesh.rotation.set === 'function') {
        this.mesh.rotation.set(0, this.physics.heading, 0);
      } else {
        this.mesh.rotation.x = 0;
        this.mesh.rotation.y = this.physics.heading;
        this.mesh.rotation.z = 0;
      }
      if (typeof this.mesh.setSteering === 'function') {
        this.mesh.setSteering(0);
      }
      if (typeof this.mesh.setBraking === 'function') {
        this.mesh.setBraking(false);
      }
    }
  }

  /**
   * Transform local model offsets to world coordinates
   * @private
   */
  _transformLocalPoints(points) {
    const yaw = this.physics.heading + this.physics.driftAngle;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const posX = this.physics.position.x;
    const posY = this.physics.position.y;
    const posZ = this.physics.position.z;

    return points.map(pt => ({
      x: pt.x * cosY + pt.z * sinY + posX,
      y: pt.y + posY,
      z: -pt.x * sinY + pt.z * cosY + posZ
    }));
  }

  /**
   * Get world coordinates of dual exhaust pipe tips (for nitro flame particles)
   * @returns {Array<{x: number, y: number, z: number}>}
   */
  getExhaustPositions() {
    const localOffsets = [
      { x: -0.38, y: 0.28, z: -2.12 },
      { x:  0.38, y: 0.28, z: -2.12 }
    ];
    return this._transformLocalPoints(localOffsets);
  }

  /**
   * Get world coordinates of rear tire contact patches (for drift sparks & tire smoke)
   * @returns {Array<{x: number, y: number, z: number}>}
   */
  getRearTirePositions() {
    const localOffsets = [
      { x: -0.85, y: 0.35, z: -1.30 },
      { x:  0.85, y: 0.35, z: -1.30 }
    ];
    return this._transformLocalPoints(localOffsets);
  }
}
