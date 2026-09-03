/**
 * 3D Synthwave Circuit Racer — Track
 * Three.js mesh generator for the 3D circuit:
 * - High-speed road surface with asphalt & neon center/lane stripes
 * - Synthwave piano curbs with alternating cyan & magenta neon segments
 * - Continuous safety guardrail barriers with glowing neon top rails
 * - 8 checkpoint hologram arch gates
 * - Start / Finish overhead LED gantry with chequered finish line
 */

import * as THREE from 'three';
import { TrackMath, DEFAULT_TRACK_POINTS } from './track-math.js';

export class Track {
  /**
   * @param {TrackMath} [trackMath]
   * @param {object} [options]
   */
  constructor(trackMath = null, options = {}) {
    this.math = trackMath || new TrackMath(DEFAULT_TRACK_POINTS, 24);
    this.options = options;
    this.group = null;
  }

  get totalLength() {
    return this.math.totalLength;
  }

  get width() {
    return this.math.width;
  }

  get halfWidth() {
    return this.math.halfWidth;
  }

  get checkpoints() {
    return this.math.checkpoints;
  }

  /**
   * Evaluates 3D point on spline at arc-length progress t in [0, 1)
   * @param {number} t
   * @returns {THREE.Vector3}
   */
  getSplinePoint(t) {
    const p = this.math.getSplinePoint(t);
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  /**
   * Evaluates normalized forward tangent vector at arc-length progress t in [0, 1)
   * @param {number} t
   * @returns {THREE.Vector3}
   */
  getSplineTangent(t) {
    const tan = this.math.getSplineTangent(t);
    return new THREE.Vector3(tan.x, tan.y, tan.z);
  }

  /**
   * Evaluates normalized lateral normal vector at arc-length progress t in [0, 1)
   * @param {number} t
   * @returns {THREE.Vector3}
   */
  getNormalAt(t) {
    const norm = this.math.getNormalAt(t);
    return new THREE.Vector3(norm.x, norm.y, norm.z);
  }

  /**
   * Projects a 3D position onto the track center line.
   * @param {THREE.Vector3|{x: number, y: number, z: number}} position
   * @returns {{t: number, distance: number, lateralDistance: number, normal: THREE.Vector3, trackPoint: THREE.Vector3}}
   */
  findClosestPointOnTrack(position) {
    const proj = this.math.projectPoint(position);
    return {
      t: proj.t,
      distance: proj.distance,
      lateralDistance: proj.lateralDistance,
      normal: new THREE.Vector3(proj.normal.x, proj.normal.y, proj.normal.z),
      trackPoint: new THREE.Vector3(proj.trackPoint.x, proj.trackPoint.y, proj.trackPoint.z)
    };
  }

  /**
   * Checks collision against left/right track barriers.
   * @param {THREE.Vector3|{x: number, y: number, z: number}} position
   * @param {number} [radius=1.2]
   * @returns {{collided: boolean, normal: THREE.Vector3, penetration: number}}
   */
  checkBarrierCollision(position, radius = 1.2) {
    const res = this.math.checkBarrierCollision(position, radius);
    return {
      collided: res.collided,
      normal: new THREE.Vector3(res.normal.x, res.normal.y, res.normal.z),
      penetration: res.penetration
    };
  }

  /**
   * Builds and returns a THREE.Group containing all visual track geometry:
   * road surface, neon stripes, curbs, barriers, arch gates, and start gantry.
   * @returns {THREE.Group}
   */
  createMeshes() {
    const root = new THREE.Group();
    root.name = 'TrackSystem';

    const segments = 400;
    const slices = [];

    // Pre-calculate track slices along spline
    for (let i = 0; i <= segments; i++) {
      const t = (i % segments) / segments;
      const center = this.getSplinePoint(t);
      const tangent = this.getSplineTangent(t);
      const normal = this.getNormalAt(t);
      const up = new THREE.Vector3(0, 1, 0);

      slices.push({ center, tangent, normal, up, t, index: i });
    }

    // 1. Road Surface Mesh
    root.add(this._createRoadMesh(slices, segments));

    // 2. Road Markings (Center & Lane Lines)
    root.add(this._createRoadStripes(slices, segments));

    // 3. Synthwave Piano Curbs (Alternating Cyan / Magenta)
    root.add(this._createCurbs(slices, segments));

    // 4. Guardrail Barriers (Concrete base + Glowing neon rails + Posts)
    root.add(this._createBarriers(slices, segments));

    // 5. Checkpoint Hologram Arch Gates
    root.add(this._createCheckpoints());

    // 6. Start / Finish Overhead LED Gantry & Chequered Finish Line
    root.add(this._createStartFinishGantry(slices[0]));

    this.group = root;
    return root;
  }

  /**
   * Creates dark asphalt road surface
   * @private
   */
  _createRoadMesh(slices, segments) {
    const halfW = this.halfWidth; // 12m
    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const slice = slices[i];
      const left = slice.center.clone().addScaledVector(slice.normal, -halfW);
      const right = slice.center.clone().addScaledVector(slice.normal, halfW);

      vertices.push(left.x, left.y, left.z);
      vertices.push(right.x, right.y, right.z);

      normals.push(0, 1, 0, 0, 1, 0);

      const v = (i / segments) * (this.totalLength / 8);
      uvs.push(0, v, 1, v);

      if (i < segments) {
        const vIdx = i * 2;
        indices.push(vIdx, vIdx + 1, vIdx + 2);
        indices.push(vIdx + 1, vIdx + 3, vIdx + 2);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x080415,
      roughness: 0.85,
      metalness: 0.2,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'RoadSurface';
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Creates luminous neon center and lane divider stripes
   * @private
   */
  _createRoadStripes(slices, segments) {
    const group = new THREE.Group();
    group.name = 'RoadStripes';

    // Center dash line geometry
    const centerVerts = [];
    const centerIndices = [];
    let cIdx = 0;

    // Lane divider geometry (-6m and +6m)
    const laneVerts = [];
    const laneIndices = [];
    let lIdx = 0;

    for (let i = 0; i < segments; i++) {
      const s0 = slices[i];
      const s1 = slices[i + 1];

      // Center dash: on for 2 segments, off for 2 segments
      if (i % 4 < 2) {
        const wCenter = 0.35;
        const lift = 0.025;

        const p0L = s0.center.clone().addScaledVector(s0.normal, -wCenter / 2).add(new THREE.Vector3(0, lift, 0));
        const p0R = s0.center.clone().addScaledVector(s0.normal, wCenter / 2).add(new THREE.Vector3(0, lift, 0));
        const p1L = s1.center.clone().addScaledVector(s1.normal, -wCenter / 2).add(new THREE.Vector3(0, lift, 0));
        const p1R = s1.center.clone().addScaledVector(s1.normal, wCenter / 2).add(new THREE.Vector3(0, lift, 0));

        centerVerts.push(p0L.x, p0L.y, p0L.z, p0R.x, p0R.y, p0R.z, p1L.x, p1L.y, p1L.z, p1R.x, p1R.y, p1R.z);
        centerIndices.push(cIdx, cIdx + 1, cIdx + 2, cIdx + 1, cIdx + 3, cIdx + 2);
        cIdx += 4;
      }

      // 4-lane dividers at -6m and +6m: on for 3 segments, off for 3 segments
      if (i % 6 < 3) {
        const wLane = 0.2;
        const lift = 0.02;
        const offsets = [-6.0, 6.0];

        for (const off of offsets) {
          const p0L = s0.center.clone().addScaledVector(s0.normal, off - wLane / 2).add(new THREE.Vector3(0, lift, 0));
          const p0R = s0.center.clone().addScaledVector(s0.normal, off + wLane / 2).add(new THREE.Vector3(0, lift, 0));
          const p1L = s1.center.clone().addScaledVector(s1.normal, off - wLane / 2).add(new THREE.Vector3(0, lift, 0));
          const p1R = s1.center.clone().addScaledVector(s1.normal, off + wLane / 2).add(new THREE.Vector3(0, lift, 0));

          laneVerts.push(p0L.x, p0L.y, p0L.z, p0R.x, p0R.y, p0R.z, p1L.x, p1L.y, p1L.z, p1R.x, p1R.y, p1R.z);
          laneIndices.push(lIdx, lIdx + 1, lIdx + 2, lIdx + 1, lIdx + 3, lIdx + 2);
          lIdx += 4;
        }
      }
    }

    // Center magenta neon mesh
    const centerGeo = new THREE.BufferGeometry();
    centerGeo.setAttribute('position', new THREE.Float32BufferAttribute(centerVerts, 3));
    centerGeo.setIndex(centerIndices);
    centerGeo.computeVertexNormals();
    const centerMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
    group.add(new THREE.Mesh(centerGeo, centerMat));

    // Lane cyan neon mesh
    const laneGeo = new THREE.BufferGeometry();
    laneGeo.setAttribute('position', new THREE.Float32BufferAttribute(laneVerts, 3));
    laneGeo.setIndex(laneIndices);
    laneGeo.computeVertexNormals();
    const laneMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    group.add(new THREE.Mesh(laneGeo, laneMat));

    return group;
  }

  /**
   * Creates alternating synthwave neon curbs along left and right track margins
   * @private
   */
  _createCurbs(slices, segments) {
    const group = new THREE.Group();
    group.name = 'NeonCurbs';

    const cyanVerts = [];
    const cyanIndices = [];
    let cyanIdx = 0;

    const pinkVerts = [];
    const pinkIndices = [];
    let pinkIdx = 0;

    const curbWidth = 0.8;
    const curbHeight = 0.12;
    const halfW = this.halfWidth;

    for (let i = 0; i < segments; i++) {
      const s0 = slices[i];
      const s1 = slices[i + 1];

      // Alternate color every 4 segments (~20m)
      const isCyan = (Math.floor(i / 4) % 2 === 0);
      const targetVerts = isCyan ? cyanVerts : pinkVerts;
      const targetIndices = isCyan ? cyanIndices : pinkIndices;
      let curIdx = isCyan ? cyanIdx : pinkIdx;

      // Both left and right curbs
      const sides = [
        { inner: -halfW, outer: -halfW - curbWidth },
        { inner: halfW, outer: halfW + curbWidth }
      ];

      for (const side of sides) {
        const p0In = s0.center.clone().addScaledVector(s0.normal, side.inner).add(new THREE.Vector3(0, curbHeight, 0));
        const p0Out = s0.center.clone().addScaledVector(s0.normal, side.outer).add(new THREE.Vector3(0, curbHeight * 0.5, 0));
        const p1In = s1.center.clone().addScaledVector(s1.normal, side.inner).add(new THREE.Vector3(0, curbHeight, 0));
        const p1Out = s1.center.clone().addScaledVector(s1.normal, side.outer).add(new THREE.Vector3(0, curbHeight * 0.5, 0));

        targetVerts.push(p0In.x, p0In.y, p0In.z, p0Out.x, p0Out.y, p0Out.z, p1In.x, p1In.y, p1In.z, p1Out.x, p1Out.y, p1Out.z);
        targetIndices.push(curIdx, curIdx + 1, curIdx + 2, curIdx + 1, curIdx + 3, curIdx + 2);
        curIdx += 4;
      }

      if (isCyan) cyanIdx = curIdx;
      else pinkIdx = curIdx;
    }

    const cyanGeo = new THREE.BufferGeometry();
    cyanGeo.setAttribute('position', new THREE.Float32BufferAttribute(cyanVerts, 3));
    cyanGeo.setIndex(cyanIndices);
    cyanGeo.computeVertexNormals();
    group.add(new THREE.Mesh(cyanGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff })));

    const pinkGeo = new THREE.BufferGeometry();
    pinkGeo.setAttribute('position', new THREE.Float32BufferAttribute(pinkVerts, 3));
    pinkGeo.setIndex(pinkIndices);
    pinkGeo.computeVertexNormals();
    group.add(new THREE.Mesh(pinkGeo, new THREE.MeshBasicMaterial({ color: 0xff007f })));

    return group;
  }

  /**
   * Creates continuous safety guardrail barriers with dark metallic base,
   * vertical stanchion posts, and glowing neon top tube.
   * @private
   */
  _createBarriers(slices, segments) {
    const group = new THREE.Group();
    group.name = 'SafetyBarriers';

    const barrierOffset = this.halfWidth + 0.5; // 12.5m
    const wallHeight = 0.55;
    const railHeight = 0.85;

    // Wall geometry
    const wallVerts = [];
    const wallIndices = [];
    let wIdx = 0;

    // Left neon rail (Electric Cyan)
    const leftRailVerts = [];
    const leftRailIndices = [];
    let lrIdx = 0;

    // Right neon rail (Laser Magenta)
    const rightRailVerts = [];
    const rightRailIndices = [];
    let rrIdx = 0;

    // Stanchion posts
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, railHeight, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x110b24, metalness: 0.9, roughness: 0.3 });
    const postInstances = [];

    for (let i = 0; i < segments; i++) {
      const s0 = slices[i];
      const s1 = slices[i + 1];

      // Left Barrier (-barrierOffset)
      const l0Bot = s0.center.clone().addScaledVector(s0.normal, -barrierOffset);
      const l0Top = l0Bot.clone().add(new THREE.Vector3(0, wallHeight, 0));
      const l1Bot = s1.center.clone().addScaledVector(s1.normal, -barrierOffset);
      const l1Top = l1Bot.clone().add(new THREE.Vector3(0, wallHeight, 0));

      wallVerts.push(l0Bot.x, l0Bot.y, l0Bot.z, l0Top.x, l0Top.y, l0Top.z, l1Bot.x, l1Bot.y, l1Bot.z, l1Top.x, l1Top.y, l1Top.z);
      wallIndices.push(wIdx, wIdx + 1, wIdx + 2, wIdx + 1, wIdx + 3, wIdx + 2);
      wIdx += 4;

      // Left glowing top rail
      const l0Rail = l0Bot.clone().add(new THREE.Vector3(0, railHeight, 0));
      const l1Rail = l1Bot.clone().add(new THREE.Vector3(0, railHeight, 0));
      const l0RailOut = l0Rail.clone().addScaledVector(s0.normal, -0.15);
      const l1RailOut = l1Rail.clone().addScaledVector(s1.normal, -0.15);

      leftRailVerts.push(l0Rail.x, l0Rail.y, l0Rail.z, l0RailOut.x, l0RailOut.y, l0RailOut.z, l1Rail.x, l1Rail.y, l1Rail.z, l1RailOut.x, l1RailOut.y, l1RailOut.z);
      leftRailIndices.push(lrIdx, lrIdx + 1, lrIdx + 2, lrIdx + 1, lrIdx + 3, lrIdx + 2);
      lrIdx += 4;

      // Right Barrier (+barrierOffset)
      const r0Bot = s0.center.clone().addScaledVector(s0.normal, barrierOffset);
      const r0Top = r0Bot.clone().add(new THREE.Vector3(0, wallHeight, 0));
      const r1Bot = s1.center.clone().addScaledVector(s1.normal, barrierOffset);
      const r1Top = r1Bot.clone().add(new THREE.Vector3(0, wallHeight, 0));

      wallVerts.push(r0Bot.x, r0Bot.y, r0Bot.z, r0Top.x, r0Top.y, r0Top.z, r1Bot.x, r1Bot.y, r1Bot.z, r1Top.x, r1Top.y, r1Top.z);
      wallIndices.push(wIdx, wIdx + 1, wIdx + 2, wIdx + 1, wIdx + 3, wIdx + 2);
      wIdx += 4;

      // Right glowing top rail
      const r0Rail = r0Bot.clone().add(new THREE.Vector3(0, railHeight, 0));
      const r1Rail = r1Bot.clone().add(new THREE.Vector3(0, railHeight, 0));
      const r0RailOut = r0Rail.clone().addScaledVector(s0.normal, 0.15);
      const r1RailOut = r1Rail.clone().addScaledVector(s1.normal, 0.15);

      rightRailVerts.push(r0Rail.x, r0Rail.y, r0Rail.z, r0RailOut.x, r0RailOut.y, r0RailOut.z, r1Rail.x, r1Rail.y, r1Rail.z, r1RailOut.x, r1RailOut.y, r1RailOut.z);
      rightRailIndices.push(rrIdx, rrIdx + 1, rrIdx + 2, rrIdx + 1, rrIdx + 3, rrIdx + 2);
      rrIdx += 4;

      // Stanchion posts every 4 segments
      if (i % 4 === 0) {
        const pLeft = new THREE.Mesh(postGeo, postMat);
        pLeft.position.copy(l0Bot).add(new THREE.Vector3(0, railHeight / 2, 0));
        group.add(pLeft);

        const pRight = new THREE.Mesh(postGeo, postMat);
        pRight.position.copy(r0Bot).add(new THREE.Vector3(0, railHeight / 2, 0));
        group.add(pRight);
      }
    }

    // Concrete barrier wall
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallVerts, 3));
    wallGeo.setIndex(wallIndices);
    wallGeo.computeVertexNormals();
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x120c24,
      roughness: 0.7,
      metalness: 0.5,
      side: THREE.DoubleSide
    });
    group.add(new THREE.Mesh(wallGeo, wallMat));

    // Left neon rail mesh (Cyan)
    const lrGeo = new THREE.BufferGeometry();
    lrGeo.setAttribute('position', new THREE.Float32BufferAttribute(leftRailVerts, 3));
    lrGeo.setIndex(leftRailIndices);
    lrGeo.computeVertexNormals();
    group.add(new THREE.Mesh(lrGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide })));

    // Right neon rail mesh (Pink)
    const rrGeo = new THREE.BufferGeometry();
    rrGeo.setAttribute('position', new THREE.Float32BufferAttribute(rightRailVerts, 3));
    rrGeo.setIndex(rightRailIndices);
    rrGeo.computeVertexNormals();
    group.add(new THREE.Mesh(rrGeo, new THREE.MeshBasicMaterial({ color: 0xff007f, side: THREE.DoubleSide })));

    return group;
  }

  /**
   * Creates 8 checkpoint hologram arch gates
   * @private
   */
  _createCheckpoints() {
    const group = new THREE.Group();
    group.name = 'CheckpointGates';

    for (let i = 1; i < 8; i++) {
      const cp = this.checkpoints[i];
      const gate = new THREE.Group();
      gate.name = `CheckpointGate_${i}`;
      gate.position.copy(cp.position);

      // Align gate with track direction
      const forward = new THREE.Vector3(cp.tangent.x, cp.tangent.y, cp.tangent.z);
      const lookTarget = cp.position.clone().add(forward);
      gate.lookAt(lookTarget);

      const archW = this.width + 4; // 28m
      const archH = 7.0;

      // Vertical support pillars
      const pillarGeo = new THREE.BoxGeometry(0.8, archH, 0.8);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x0c071d,
        roughness: 0.4,
        metalness: 0.8
      });

      const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
      leftPillar.position.set(-archW / 2, archH / 2, 0);
      gate.add(leftPillar);

      const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
      rightPillar.position.set(archW / 2, archH / 2, 0);
      gate.add(rightPillar);

      // Horizontal crossbar
      const barGeo = new THREE.BoxGeometry(archW + 1.6, 0.8, 0.8);
      const crossbar = new THREE.Mesh(barGeo, pillarMat);
      crossbar.position.set(0, archH, 0);
      gate.add(crossbar);

      // Neon outline tubes
      const neonMat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x00f0ff : 0xff007f });
      const neonTrimGeo = new THREE.BoxGeometry(archW + 1.8, 0.15, 0.9);
      const neonTrim = new THREE.Mesh(neonTrimGeo, neonMat);
      neonTrim.position.set(0, archH + 0.45, 0);
      gate.add(neonTrim);

      // Checkpoint hologram scan curtain
      const scanGeo = new THREE.PlaneGeometry(this.width, archH - 0.5);
      const scanMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0x00f0ff : 0xff007f,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const scanCurtain = new THREE.Mesh(scanGeo, scanMat);
      scanCurtain.position.set(0, archH / 2, 0);
      gate.add(scanCurtain);

      group.add(gate);
    }

    return group;
  }

  /**
   * Creates Start/Finish overhead LED gantry and chequered start line
   * @private
   */
  _createStartFinishGantry(startSlice) {
    const group = new THREE.Group();
    group.name = 'StartFinishGantry';
    group.position.copy(startSlice.center);

    const forward = startSlice.tangent;
    group.lookAt(startSlice.center.clone().add(forward));

    const gantryW = this.width + 5; // 29m
    const gantryH = 8.5;

    // Truss pillars
    const towerGeo = new THREE.BoxGeometry(1.6, gantryH, 1.6);
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x0f0924,
      roughness: 0.5,
      metalness: 0.8
    });

    const leftTower = new THREE.Mesh(towerGeo, towerMat);
    leftTower.position.set(-gantryW / 2, gantryH / 2, 0);
    group.add(leftTower);

    const rightTower = new THREE.Mesh(towerGeo, towerMat);
    rightTower.position.set(gantryW / 2, gantryH / 2, 0);
    group.add(rightTower);

    // Overhead truss beam
    const beamGeo = new THREE.BoxGeometry(gantryW + 3, 1.4, 2.0);
    const beam = new THREE.Mesh(beamGeo, towerMat);
    beam.position.set(0, gantryH, 0);
    group.add(beam);

    // Glowing Banner Plate
    const bannerGeo = new THREE.BoxGeometry(18, 1.8, 0.4);
    const bannerMat = new THREE.MeshStandardMaterial({
      color: 0x050210,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.2
    });
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, gantryH + 1.2, 0);
    group.add(banner);

    // Emissive neon banner trim
    const neonCyan = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const neonPink = new THREE.MeshBasicMaterial({ color: 0xff007f });

    const topTrim = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.15, 0.5), neonCyan);
    topTrim.position.set(0, gantryH + 2.15, 0);
    group.add(topTrim);

    const botTrim = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.15, 0.5), neonPink);
    botTrim.position.set(0, gantryH + 0.25, 0);
    group.add(botTrim);

    // 5 LED Start Lights Clusters (housing red & green lights)
    for (let k = -2; k <= 2; k++) {
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.6, 12),
        new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 })
      );
      housing.rotation.x = Math.PI / 2;
      housing.position.set(k * 2.5, gantryH - 1.2, 0.4);
      group.add(housing);

      // Red LED
      const redLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 12, 12),
        new THREE.MeshStandardMaterial({
          color: 0xff0033,
          emissive: 0xff0033,
          emissiveIntensity: 1.2
        })
      );
      redLight.position.set(k * 2.5, gantryH - 1.2, 0.6);
      group.add(redLight);
    }

    // Chequered Finish Line on Road Surface
    const rows = 3;
    const cols = 16;
    const tileW = this.width / cols;
    const tileL = 1.2;
    const cheqGroup = new THREE.Group();
    cheqGroup.name = 'ChequeredLine';

    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0614, roughness: 0.9 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isWhite = (r + c) % 2 === 0;
        const tileGeo = new THREE.PlaneGeometry(tileW * 0.95, tileL * 0.95);
        const tile = new THREE.Mesh(tileGeo, isWhite ? lightMat : darkMat);
        tile.rotation.x = -Math.PI / 2;
        const posX = -this.halfWidth + (c + 0.5) * tileW;
        const posZ = (r - rows / 2 + 0.5) * tileL;
        tile.position.set(posX, 0.03, posZ);
        cheqGroup.add(tile);
      }
    }
    group.add(cheqGroup);

    return group;
  }
}
