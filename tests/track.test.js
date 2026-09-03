import test from 'node:test';
import assert from 'node:assert/strict';
import { TrackMath } from '../js/world/track-math.js';

test('TrackMath generates closed spline and projects points accurately', () => {
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 0, z: 100 },
    { x: 0, y: 0, z: 100 }
  ];
  const track = new TrackMath(points, 24); // 24m width

  const pointOnCenter = { x: 50, y: 0, z: 0 };
  const projCenter = track.projectPoint(pointOnCenter);
  assert.ok(Math.abs(projCenter.lateralDistance) < 0.5, 'Center line should have ~0 lateral distance');

  const pointNearBarrier = { x: 50, y: 0, z: 11.5 }; // close to half-width (12m)
  const collision1 = track.checkBarrierCollision(pointNearBarrier, 1.2);
  assert.equal(collision1.collided, true, 'Point within radius of barrier must report collision');

  const pointOutsideBarrier = { x: 50, y: 0, z: 15 };
  const collision2 = track.checkBarrierCollision(pointOutsideBarrier, 1.0);
  assert.equal(collision2.collided, true, 'Point beyond barrier must collide');
  assert.ok(collision2.penetration > 0, 'Penetration should be positive');

  // Point safely inside track center
  const pointInside = { x: 50, y: 0, z: 2 };
  const collision3 = track.checkBarrierCollision(pointInside, 1.0);
  assert.equal(collision3.collided, false, 'Point well within bounds should not collide');
  assert.equal(collision3.penetration, 0);
});

test('TrackMath default circuit includes 24 control points with elevation changes', () => {
  const track = new TrackMath();
  assert.equal(track.controlPoints.length, 24, 'Circuit must have 24 control points');
  assert.equal(track.width, 24, 'Default track width must be 24m');
  assert.equal(track.halfWidth, 12, 'Half width must be 12m');
  assert.ok(track.totalLength > 1000, 'Track circuit length should be substantial (>1000m)');

  // Verify elevation change
  const yValues = track.controlPoints.map(p => p.y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  assert.ok(maxY - minY >= 10, 'Track must feature elevation crests (at least 10m variation)');
});

test('TrackMath provides accurate arc-length parameterization and unit tangents', () => {
  const track = new TrackMath();

  // Evaluate points at start, quarter, half, three-quarters
  const pStart = track.getSplinePoint(0);
  const pEnd = track.getSplinePoint(1);
  const distStartEnd = Math.hypot(pStart.x - pEnd.x, pStart.y - pEnd.y, pStart.z - pEnd.z);
  assert.ok(distStartEnd < 0.1, 'Spline loop must be closed (t=0 matches t=1)');

  for (let t = 0; t < 1; t += 0.1) {
    const tangent = track.getSplineTangent(t);
    const len = Math.hypot(tangent.x, tangent.y, tangent.z);
    assert.ok(Math.abs(len - 1.0) < 0.01, `Tangent at t=${t} must be normalized unit vector`);

    const normal = track.getNormalAt(t);
    const normalLen = Math.hypot(normal.x, normal.y, normal.z);
    assert.ok(Math.abs(normalLen - 1.0) < 0.01, `Normal at t=${t} must be normalized unit vector`);

    // Tangent and normal must be roughly orthogonal in horizontal plane
    const dot = tangent.x * normal.x + tangent.z * normal.z;
    assert.ok(Math.abs(dot) < 0.05, `Tangent and normal at t=${t} must be orthogonal`);
  }
});

test('TrackMath defines 8 sequential checkpoints along the track', () => {
  const track = new TrackMath();
  assert.equal(track.checkpoints.length, 8, 'Track must define 8 checkpoints');

  for (let i = 0; i < 8; i++) {
    const cp = track.checkpoints[i];
    assert.equal(cp.index, i);
    assert.ok(cp.position && typeof cp.position.x === 'number');
    assert.ok(cp.tangent && typeof cp.tangent.x === 'number');
    assert.ok(cp.normal && typeof cp.normal.x === 'number');
    assert.equal(cp.width, 24);

    if (i > 0) {
      assert.ok(cp.distance > track.checkpoints[i - 1].distance, 'Checkpoints must have ascending distances');
    }
  }

  // Checkpoint 0 should be at start line (distance = 0)
  assert.equal(track.checkpoints[0].distance, 0);
});

test('TrackMath barrier collision returns inward separating normal', () => {
  const points = [
    { x: 0, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 0, z: 100 },
    { x: 0, y: 0, z: 100 }
  ];
  const track = new TrackMath(points, 24);

  // Car penetrates right barrier (+Z side)
  const rightHit = track.checkBarrierCollision({ x: 50, y: 0, z: 14 }, 1.0);
  assert.equal(rightHit.collided, true);
  // Normal must point inward toward track center (-Z direction)
  assert.ok(rightHit.normal.z < -0.5, 'Normal must point toward track interior (-Z)');

  // Car penetrates left barrier (-Z side)
  const leftHit = track.checkBarrierCollision({ x: 50, y: 0, z: -14 }, 1.0);
  assert.equal(leftHit.collided, true);
  // Normal must point inward toward track interior (+Z direction)
  assert.ok(leftHit.normal.z > 0.5, 'Normal must point toward track interior (+Z)');
});

test('TrackMath projectPoint wraps around seam correctly near finish line without snapping to 0', () => {
  const track = new TrackMath();
  const L = track.totalLength;

  // Point on centerline 2 meters before finish line (s ≈ L - 2)
  const targetT = (L - 2) / L;
  const pointNearFinish = track.getSplinePoint(targetT);
  const projNearFinish = track.projectPoint(pointNearFinish);

  assert.ok(projNearFinish.t > 0.99, `Projection t should be > 0.99 near finish line, got ${projNearFinish.t}`);
  assert.ok(projNearFinish.t < 1.0, `Projection t should be < 1.0, got ${projNearFinish.t}`);
  assert.ok(Math.abs(projNearFinish.distance - (L - 2)) < 0.1, `Projection distance should be close to L - 2, got ${projNearFinish.distance}`);
  assert.ok(Math.abs(projNearFinish.lateralDistance) < 0.1, `Lateral distance should be ~0, got ${projNearFinish.lateralDistance}`);

  // Point with lateral offset near finish line
  const norm = track.getNormalAt(targetT);
  const offsetPoint = {
    x: pointNearFinish.x + norm.x * 6,
    y: pointNearFinish.y + norm.y * 6,
    z: pointNearFinish.z + norm.z * 6
  };
  const projOffset = track.projectPoint(offsetPoint);
  assert.ok(projOffset.t > 0.99, `Offset point t should be > 0.99 near finish line, got ${projOffset.t}`);
  assert.ok(Math.abs(projOffset.lateralDistance - 6) < 0.1, `Lateral distance should be ~6, got ${projOffset.lateralDistance}`);

  // Point just after start line (s = 2) should project to t ≈ 0.0009
  const pointAfterStart = track.getSplinePoint(2 / L);
  const projAfterStart = track.projectPoint(pointAfterStart);
  assert.ok(projAfterStart.t < 0.01, `Point after start line should project to t < 0.01, got ${projAfterStart.t}`);
  assert.ok(Math.abs(projAfterStart.distance - 2) < 0.1, `Projection distance should be close to 2, got ${projAfterStart.distance}`);
});

