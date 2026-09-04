/**
 * 3D Synthwave Circuit Racer — TrackMath
 * Pure JavaScript class for closed-loop Catmull-Rom spline circuit geometry,
 * arc-length parameterization, point projection, barrier collision detection,
 * and checkpoint tracking.
 * Independent of DOM / Three.js for fast, headless testing in Node.
 */

export const DEFAULT_TRACK_POINTS = [
  { x: 0, y: 0, z: 0 },         // 0: Start / Finish line (straight)
  { x: 0, y: 0, z: 100 },       // 1: Main straightaway
  { x: 15, y: 2, z: 190 },      // 2: Turn 1 entry
  { x: 60, y: 6, z: 270 },      // 3: Turn 1 sweeping right curve
  { x: 140, y: 10, z: 320 },    // 4: Hill crest climb (+10m)
  { x: 230, y: 12, z: 320 },    // 5: Crest apex (+12m elevation peak)
  { x: 310, y: 8, z: 270 },     // 6: Downhill sweep right
  { x: 360, y: 4, z: 190 },     // 7: Descending sweep
  { x: 370, y: 1, z: 100 },     // 8: Turn 2 entry
  { x: 330, y: 0, z: 20 },      // 9: Turn 2 sharp right apex
  { x: 250, y: 2, z: -40 },     // 10: S-bend chicane entry
  { x: 200, y: 5, z: -30 },     // 11: S-bend center
  { x: 140, y: 7, z: -80 },     // 12: S-bend chicane exit
  { x: 110, y: 9, z: -160 },    // 13: Uphill climb
  { x: 70, y: 11, z: -250 },    // 14: Hairpin entry (+11m)
  { x: 0, y: 12, z: -300 },     // 15: North hairpin apex (+12m)
  { x: -80, y: 9, z: -290 },    // 16: North hairpin sweep
  { x: -150, y: 5, z: -240 },   // 17: Downhill run
  { x: -210, y: 2, z: -170 },   // 18: Fast kink
  { x: -240, y: 0, z: -80 },    // 19: Back straight
  { x: -220, y: 0, z: 10 },     // 20: Back straight kink
  { x: -160, y: 0, z: 80 },     // 21: Final complex entry
  { x: -80, y: 0, z: 60 },      // 22: Final turn onto main straight
  { x: 0, y: 0, z: -80 }        // 23: Straight lead-in to start/finish line
];

export class TrackMath {
  /**
   * @param {Array<{x: number, y: number, z: number}>} [controlPoints]
   * @param {number} [width=24]
   */
  constructor(controlPoints = DEFAULT_TRACK_POINTS, width = 24) {
    this.controlPoints = (controlPoints && controlPoints.length > 0)
      ? controlPoints.map(p => ({ x: p.x, y: p.y, z: p.z }))
      : DEFAULT_TRACK_POINTS.map(p => ({ x: p.x, y: p.y, z: p.z }));

    this.width = width;
    this.halfWidth = width / 2;

    this.totalLength = 0;
    this.samples = [];
    this.cumDist = [];
    this.tangents = [];
    this.checkpoints = [];

    this._initSpline();
  }

  /**
   * Compute knot tangents with adaptive corner tension (prevents overshoot on sharp corners)
   * and pre-compute dense arc-length parameterization table.
   * @private
   */
  _initSpline() {
    const pts = this.controlPoints;
    const n = pts.length;
    this.tangents = [];

    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];

      const inX = curr.x - prev.x, inY = curr.y - prev.y, inZ = curr.z - prev.z;
      const outX = next.x - curr.x, outY = next.y - curr.y, outZ = next.z - curr.z;
      const inLen = Math.hypot(inX, inY, inZ) || 1;
      const outLen = Math.hypot(outX, outY, outZ) || 1;

      // Dot product between incoming and outgoing chord unit directions
      const dot = (inX * outX + inY * outY + inZ * outZ) / (inLen * outLen);
      // For sharp turns (<= 90 deg), reduce tension to prevent overshoot outside the turn
      const w = Math.max(0, dot);

      this.tangents.push({
        x: 0.5 * w * (next.x - prev.x),
        y: 0.5 * w * (next.y - prev.y),
        z: 0.5 * w * (next.z - prev.z)
      });
    }

    // Build dense arc-length lookup table (2000 samples)
    const SAMPLES = 2000;
    this.samples = [];
    this.cumDist = [0];
    let total = 0;

    let prevP = this._evaluateRaw(0);
    this.samples.push(prevP);

    for (let i = 1; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const p = this._evaluateRaw(t);
      total += Math.hypot(p.x - prevP.x, p.y - prevP.y, p.z - prevP.z);
      this.cumDist.push(total);
      this.samples.push(p);
      prevP = p;
    }
    this.totalLength = total;

    // Initialize 8 sequential checkpoints along the track
    this.checkpoints = [];
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      const distance = i === 0 ? 0 : t * this.totalLength;
      const pos = this.getSplinePoint(t);
      const tan = this.getSplineTangent(t);
      const norm = this.getNormalAt(t);

      this.checkpoints.push({
        index: i,
        t,
        distance,
        position: pos,
        tangent: tan,
        normal: norm,
        width: this.width
      });
    }
  }

  /**
   * Evaluates raw Catmull-Rom / Hermite spline at tRaw in [0, 1)
   * @private
   */
  _evaluateRaw(tRaw) {
    const pts = this.controlPoints;
    const n = pts.length;
    const t = ((tRaw % 1) + 1) % 1;
    const p = t * n;
    const i = Math.floor(p) % n;
    const nextI = (i + 1) % n;
    const u = p - Math.floor(p);

    const p1 = pts[i];
    const p2 = pts[nextI];
    const v0 = this.tangents[i];
    const v1 = this.tangents[nextI];

    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;

    return {
      x: h00 * p1.x + h10 * v0.x + h01 * p2.x + h11 * v1.x,
      y: h00 * p1.y + h10 * v0.y + h01 * p2.y + h11 * v1.y,
      z: h00 * p1.z + h10 * v0.z + h01 * p2.z + h11 * v1.z
    };
  }

  /**
   * Map arc-length distance in meters to raw spline parameter tRaw in [0, 1)
   * @param {number} distance
   * @returns {number}
   */
  distanceToTRaw(distance) {
    const dist = ((distance % this.totalLength) + this.totalLength) % this.totalLength;
    let low = 0;
    let high = this.cumDist.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.cumDist[mid] < dist) low = mid + 1;
      else high = mid - 1;
    }

    const idx = Math.max(0, Math.min(this.cumDist.length - 2, low - 1));
    const d0 = this.cumDist[idx];
    const d1 = this.cumDist[idx + 1];
    const frac = d1 > d0 ? (dist - d0) / (d1 - d0) : 0;
    return (idx + frac) / (this.cumDist.length - 1);
  }

  /**
   * Get 3D point along spline at arc-length normalized progress t in [0, 1)
   * @param {number} t
   * @returns {{x: number, y: number, z: number}}
   */
  getSplinePoint(t) {
    const s = ((t % 1) + 1) % 1 * this.totalLength;
    const tRaw = this.distanceToTRaw(s);
    return this._evaluateRaw(tRaw);
  }

  /**
   * Alias for getSplinePoint
   * @param {number} u
   */
  getPointAt(u) {
    return this.getSplinePoint(u);
  }

  /**
   * Get normalized forward tangent vector at arc-length normalized progress t in [0, 1)
   * @param {number} t
   * @returns {{x: number, y: number, z: number}}
   */
  getSplineTangent(t) {
    const delta = 0.5; // sample 0.5m ahead and behind
    const s = ((t % 1) + 1) % 1 * this.totalLength;
    const pA = this.getSplinePoint((s - delta) / this.totalLength);
    const pB = this.getSplinePoint((s + delta) / this.totalLength);
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const dz = pB.z - pA.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / len, y: dy / len, z: dz / len };
  }

  /**
   * Alias for getSplineTangent
   * @param {number} u
   */
  getTangentAt(u) {
    return this.getSplineTangent(u);
  }

  /**
   * Get normalized lateral normal vector (orthogonal to forward tangent and world up)
   * @param {number} t
   * @returns {{x: number, y: number, z: number}}
   */
  getNormalAt(t) {
    const tan = this.getSplineTangent(t);
    // tan x (0, 1, 0)
    const nx = tan.z;
    const ny = 0;
    const nz = -tan.x;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  /**
   * Project a 3D point onto the track center spline.
   * Returns normalized t, distance along track, signed lateral distance,
   * normal vector across track, and closest track point.
   *
   * @param {{x: number, y: number, z: number}} pos
   * @returns {{t: number, distance: number, lateralDistance: number, normal: {x: number, y: number, z: number}, trackPoint: {x: number, y: number, z: number}}}
   */
  projectPoint(pos) {
    const sampleCount = this.samples.length - 1;

    // 1. Coarse search over sampled lookup table
    let bestDistSq = Infinity;
    let bestIdx = 0;
    const step = 5;
    for (let i = 0; i <= sampleCount; i += step) {
      const p = this.samples[i];
      const d = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2 + (pos.z - p.z) ** 2;
      if (d < bestDistSq) {
        bestDistSq = d;
        bestIdx = i;
      }
    }

    // 2. Fine search around best index wrapping modulo sample count
    const window = step * 2;
    for (let k = -window; k <= window; k++) {
      const idx = ((bestIdx + k) % sampleCount + sampleCount) % sampleCount;
      const p = this.samples[idx];
      const d = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2 + (pos.z - p.z) ** 2;
      if (d < bestDistSq) {
        bestDistSq = d;
        bestIdx = idx;
      }
    }

    // Disambiguate seam at start/finish line where sample 0 and sampleCount share coordinates
    if (bestIdx === 0 || bestIdx === sampleCount) {
      const p0 = this.samples[0];
      const tan0 = this.getSplineTangent(0);
      const forwardDist = (pos.x - p0.x) * tan0.x + (pos.y - p0.y) * tan0.y + (pos.z - p0.z) * tan0.z;
      bestIdx = forwardDist < -0.05 ? sampleCount : 0;
    }

    // 3. Golden Section refinement for sub-millimeter precision
    let rA, rB;
    if (bestIdx === 0) {
      rA = 0;
      rB = Math.min(this.totalLength, 2);
    } else if (bestIdx === sampleCount) {
      rA = Math.max(0, this.totalLength - 2);
      rB = this.totalLength;
    } else {
      const sCenter = this.cumDist[bestIdx];
      rA = Math.max(0, sCenter - 2);
      rB = Math.min(this.totalLength, sCenter + 2);
    }

    for (let it = 0; it < 12; it++) {
      const m1 = rA + (rB - rA) * 0.382;
      const m2 = rA + (rB - rA) * 0.618;
      const p1 = this.getSplinePoint(m1 / this.totalLength);
      const p2 = this.getSplinePoint(m2 / this.totalLength);
      const d1 = (pos.x - p1.x) ** 2 + (pos.y - p1.y) ** 2 + (pos.z - p1.z) ** 2;
      const d2 = (pos.x - p2.x) ** 2 + (pos.y - p2.y) ** 2 + (pos.z - p2.z) ** 2;

      if (d1 < d2) {
        rB = m2;
      } else {
        rA = m1;
      }
    }

    const finalS = (rA + rB) / 2;
    let finalT = finalS / this.totalLength;
    if (finalT >= 1) finalT = 0.999999;
    if (bestIdx === 0 && finalT > 0.5) finalT = 0;
    const trackPoint = this.getSplinePoint(finalT);
    const norm = this.getNormalAt(finalT);

    const deltaX = pos.x - trackPoint.x;
    const deltaY = pos.y - trackPoint.y;
    const deltaZ = pos.z - trackPoint.z;
    const lateralDistance = deltaX * norm.x + deltaY * norm.y + deltaZ * norm.z;

    return {
      t: finalT,
      distance: finalS,
      lateralDistance,
      normal: norm,
      trackPoint
    };
  }

  /**
   * Alias for projectPoint
   * @param {{x: number, y: number, z: number}} position
   */
  findClosestPointOnTrack(position) {
    return this.projectPoint(position);
  }

  /**
   * Check if vehicle at position with collision radius penetrates either track barrier.
   * Returns inward separating normal and positive penetration distance if collided.
   *
   * @param {{x: number, y: number, z: number}} position
   * @param {number} [radius=0]
   * @returns {{collided: boolean, normal: {x: number, y: number, z: number}, penetration: number}}
   */
  checkBarrierCollision(position, radius = 0) {
    const proj = this.projectPoint(position);
    const dist = Math.abs(proj.lateralDistance);
    const penetration = (dist + radius) - this.halfWidth;

    if (penetration > 0) {
      const sign = proj.lateralDistance >= 0 ? 1 : -1;
      return {
        collided: true,
        // Normal points inward toward track center to push vehicle back into bounds
        normal: {
          x: -sign * proj.normal.x,
          y: -sign * proj.normal.y,
          z: -sign * proj.normal.z
        },
        penetration
      };
    }

    return {
      collided: false,
      normal: { x: 0, y: 0, z: 0 },
      penetration: 0
    };
  }
}
