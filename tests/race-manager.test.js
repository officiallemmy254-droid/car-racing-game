import test from 'node:test';
import assert from 'node:assert/strict';
import { StandingsCalculator, CheckpointTracker, RaceManager } from '../js/core/race-manager.js';
import { TrackMath } from '../js/world/track-math.js';

// ============================================================================
// 1. StandingsCalculator Tests
// ============================================================================

test('StandingsCalculator sorts drivers by total race distance', () => {
  const drivers = [
    { id: 'player', name: 'Player', lap: 1, splineProgress: 0.4 },
    { id: 'ai1', name: 'Apex Nova', lap: 1, splineProgress: 0.8 },
    { id: 'ai2', name: 'Cyber Phantom', lap: 2, splineProgress: 0.1 }
  ];

  const standings = StandingsCalculator.calculate(drivers, 1000);
  assert.equal(standings[0].id, 'ai2', 'ai2 on lap 2 must be 1st');
  assert.equal(standings[1].id, 'ai1', 'ai1 with 0.8 progress must be 2nd');
  assert.equal(standings[2].id, 'player', 'player must be 3rd');
});

test('StandingsCalculator calculates total distance and assigns ranks 1st to 6th with player identification', () => {
  const trackLength = 1200;
  const drivers = [
    { id: 'rival3', name: 'Neon Mirage', lap: 2, splineProgress: 0.75 },
    { id: 'rival1', name: 'Apex Nova', lap: 3, splineProgress: 0.10 },
    { id: 'player', name: 'Player', lap: 2, splineProgress: 0.80 },
    { id: 'rival2', name: 'Cyber Phantom', lap: 3, splineProgress: 0.25 },
    { id: 'rival5', name: 'Solar Flare', lap: 1, splineProgress: 0.95 },
    { id: 'rival4', name: 'Vector Zenith', lap: 2, splineProgress: 0.15 }
  ];

  const standings = StandingsCalculator.calculate(drivers, trackLength);

  assert.equal(standings.length, 6, 'Standings must contain all 6 drivers');

  // Verify rank assignments (1st through 6th)
  for (let i = 0; i < standings.length; i++) {
    assert.equal(standings[i].rank, i + 1, `Driver at index ${i} must have rank ${i + 1}`);
    if (i > 0) {
      assert.ok(
        standings[i - 1].totalDistance >= standings[i].totalDistance,
        `Driver rank ${i} distance (${standings[i - 1].totalDistance}) must be >= driver rank ${i + 1} distance (${standings[i].totalDistance})`
      );
    }
  }

  // rival2: (3 - 1) * 1200 + 0.25 * 1200 = 2400 + 300 = 2700
  // rival1: (3 - 1) * 1200 + 0.10 * 1200 = 2400 + 120 = 2520
  // player: (2 - 1) * 1200 + 0.80 * 1200 = 1200 + 960 = 2160
  // rival3: (2 - 1) * 1200 + 0.75 * 1200 = 1200 + 900 = 2100
  // rival4: (2 - 1) * 1200 + 0.15 * 1200 = 1200 + 180 = 1380
  // rival5: (1 - 1) * 1200 + 0.95 * 1200 = 0 + 1140 = 1140
  assert.equal(standings[0].id, 'rival2');
  assert.equal(standings[0].totalDistance, 2700);
  assert.equal(standings[1].id, 'rival1');
  assert.equal(standings[1].totalDistance, 2520);
  assert.equal(standings[2].id, 'player');
  assert.equal(standings[2].totalDistance, 2160);
  assert.equal(standings[2].isPlayer, true);
  assert.equal(standings[3].id, 'rival3');
  assert.equal(standings[4].id, 'rival4');
  assert.equal(standings[5].id, 'rival5');

  // Verify getPlayerRank
  const playerRank = StandingsCalculator.getPlayerRank(standings);
  assert.equal(playerRank, 3, 'Player should be ranked 3rd');
});

test('StandingsCalculator handles currentLap and fallback property names gracefully', () => {
  const drivers = [
    { id: 'p', name: 'Player', currentLap: 2, splineProgress: 0.5, isPlayer: true },
    { id: 'ai', name: 'AI', lap: 2, splineProgress: 0.6 }
  ];
  const standings = StandingsCalculator.calculate(drivers, 1000);
  assert.equal(standings[0].id, 'ai');
  assert.equal(standings[1].id, 'p');
  assert.equal(StandingsCalculator.getPlayerRank(standings, 'p'), 2);
});

// ============================================================================
// 2. CheckpointTracker Tests
// ============================================================================

test('CheckpointTracker validates sequential checkpoint hits and counts laps', () => {
  const tracker = new CheckpointTracker(8); // 8 checkpoints per lap
  assert.equal(tracker.currentLap, 1);

  // Hit checkpoints 0 through 7 sequentially
  for (let cp = 0; cp < 8; cp++) {
    const valid = tracker.hitCheckpoint(cp);
    assert.equal(valid, true, `Checkpoint ${cp} should be valid`);
  }

  // Cross start/finish after hitting all checkpoints
  const completed = tracker.completeLap();
  assert.equal(completed, true);
  assert.equal(tracker.currentLap, 2);
});

test('CheckpointTracker rejects out-of-order checkpoint hits and prevents lap advance if checkpoints skipped', () => {
  const tracker = new CheckpointTracker(8);
  assert.equal(tracker.currentLap, 1);

  // Trying to hit checkpoint 2 when expecting 0 must fail
  assert.equal(tracker.hitCheckpoint(2), false, 'Checkpoint 2 out of order must be rejected');
  assert.equal(tracker.nextCheckpoint, 0, 'Next checkpoint must still be 0');

  // Hit checkpoint 0
  assert.equal(tracker.hitCheckpoint(0), true);
  assert.equal(tracker.nextCheckpoint, 1);

  // Repeating checkpoint 0 must fail
  assert.equal(tracker.hitCheckpoint(0), false, 'Repeating checkpoint 0 must be rejected');

  // Skip checkpoint 1 and hit 2
  assert.equal(tracker.hitCheckpoint(2), false, 'Skipping checkpoint 1 must be rejected');
  assert.equal(tracker.nextCheckpoint, 1);

  // Attempt to complete lap prematurely after only checkpoint 0
  assert.equal(tracker.completeLap(), false, 'Premature lap completion must fail');
  assert.equal(tracker.currentLap, 1, 'Current lap must remain 1');

  // Hit checkpoints 1 through 6
  for (let cp = 1; cp <= 6; cp++) {
    assert.equal(tracker.hitCheckpoint(cp), true);
  }

  // Try to complete lap before hitting checkpoint 7
  assert.equal(tracker.completeLap(), false, 'Cannot complete lap without checkpoint 7');
  assert.equal(tracker.currentLap, 1);

  // Hit checkpoint 7
  assert.equal(tracker.hitCheckpoint(7), true);

  // Now completeLap must succeed
  assert.equal(tracker.completeLap(), true);
  assert.equal(tracker.currentLap, 2);
  assert.equal(tracker.nextCheckpoint, 0, 'Next checkpoint resets to 0 for lap 2');
});

test('CheckpointTracker resets cleanly to initial state', () => {
  const tracker = new CheckpointTracker(8);
  tracker.hitCheckpoint(0);
  tracker.hitCheckpoint(1);
  tracker.reset();

  assert.equal(tracker.currentLap, 1);
  assert.equal(tracker.nextCheckpoint, 0);
  assert.equal(tracker.checkpointsHit.size, 0);
});

// ============================================================================
// 3. RaceManager Core & Lap Timing Tests
// ============================================================================

test('RaceManager initializes with default 3 laps, 8 checkpoints, and initial state', () => {
  const raceManager = new RaceManager({ totalLaps: 3, trackLength: 1000 });

  assert.equal(raceManager.totalLaps, 3);
  assert.equal(raceManager.currentLap, 1);
  assert.equal(raceManager.lapTime, 0);
  assert.equal(raceManager.totalTime, 0);
  assert.equal(raceManager.bestLapTime, null);
  assert.equal(raceManager.isFinished, false);
  assert.equal(raceManager.isDrafting, false);
  assert.ok(raceManager.checkpoints instanceof CheckpointTracker);
  assert.equal(raceManager.checkpoints.totalCheckpoints, 8);

  const raceInfo = raceManager.getRaceInfo();
  assert.equal(raceInfo.currentLap, 1);
  assert.equal(raceInfo.totalLaps, 3);
  assert.equal(raceInfo.isFinalLap, false);
  assert.equal(raceInfo.isFinished, false);
  assert.equal(raceInfo.isDrafting, false);
});

test('RaceManager updates lap timer and tracks best lap time across multiple laps', () => {
  const raceManager = new RaceManager({ totalLaps: 3, trackLength: 1000 });

  // Simulate 10 seconds of racing on lap 1
  for (let i = 0; i < 600; i++) {
    raceManager.update(1 / 60);
  }
  assert.ok(Math.abs(raceManager.lapTime - 10.0) < 0.05);
  assert.ok(Math.abs(raceManager.totalTime - 10.0) < 0.05);

  // Complete lap 1 at 35 seconds
  raceManager.lapTime = 35.0;
  raceManager.totalTime = 35.0;
  for (let cp = 0; cp < 8; cp++) {
    raceManager.checkpoints.hitCheckpoint(cp);
  }
  const completedLap1 = raceManager.completeLap();
  assert.equal(completedLap1, true);
  assert.equal(raceManager.currentLap, 2);
  assert.equal(raceManager.lapTime, 0, 'Lap timer resets to 0 on new lap');
  assert.equal(raceManager.bestLapTime, 35.0, 'Best lap is 35.0s after lap 1');
  assert.equal(raceManager.lapTimes.history.length, 1);
  assert.equal(raceManager.lapTimes.history[0], 35.0);

  // Lap 2: set faster time 31.5s
  raceManager.lapTime = 31.5;
  raceManager.totalTime = 66.5;
  for (let cp = 0; cp < 8; cp++) {
    raceManager.checkpoints.hitCheckpoint(cp);
  }
  const completedLap2 = raceManager.completeLap();
  assert.equal(completedLap2, true);
  assert.equal(raceManager.currentLap, 3);
  assert.equal(raceManager.bestLapTime, 31.5, 'Best lap updates to faster 31.5s');

  // Lap 3: slower time 38.0s (final lap)
  assert.equal(raceManager.getRaceInfo().isFinalLap, true, 'Lap 3 is final lap');
  raceManager.lapTime = 38.0;
  raceManager.totalTime = 104.5;
  for (let cp = 0; cp < 8; cp++) {
    raceManager.checkpoints.hitCheckpoint(cp);
  }
  const completedLap3 = raceManager.completeLap();
  assert.equal(completedLap3, true);
  assert.equal(raceManager.isFinished, true, 'Race completes after 3 laps');
  assert.equal(raceManager.bestLapTime, 31.5, 'Best lap remains 31.5s');

  // Subsequent updates after finish should freeze totalTime and lapTime
  const frozenTotal = raceManager.totalTime;
  raceManager.update(1 / 60);
  assert.equal(raceManager.totalTime, frozenTotal, 'totalTime should not advance once finished');
});

// ============================================================================
// 4. Drafting Slipstream Detection Tests
// ============================================================================

test('RaceManager detects slipstream drafting when player is within 18m behind rival for >= 1.0s', () => {
  const raceManager = new RaceManager({ totalLaps: 3, trackLength: 1000 });

  // Player at origin heading along +Z (heading = 0 => forward = (0, 0, 1))
  const playerCar = {
    position: { x: 0, y: 0, z: 100 },
    heading: 0,
    speed: 45
  };

  // Rival 12 meters ahead on Z axis (within 18m)
  const rivalCar = {
    id: 'ai1',
    name: 'Apex Nova',
    position: { x: 0, y: 0, z: 112 },
    speed: 46
  };

  const aiCars = [rivalCar];

  // Frame 1 to frame 59 (0.0s to 0.983s) -> should NOT be drafting yet
  for (let i = 0; i < 59; i++) {
    raceManager.update(1 / 60, playerCar, aiCars);
  }
  assert.equal(raceManager.isDrafting, false, 'Drafting should be false under 1.0s');
  assert.ok(raceManager.draftingTimer >= 0.95);

  // Advance past 1.0s (frame 61 -> ~1.016s)
  raceManager.update(2 / 60, playerCar, aiCars);
  assert.equal(raceManager.isDrafting, true, 'Drafting should be true after >= 1.0s behind rival');
  assert.equal(raceManager.getRaceInfo().isDrafting, true);
  assert.equal(playerCar.isDrafting, true, 'PlayerCar isDrafting flag should be updated');
});

test('RaceManager clears drafting when rival pulls away or is behind player', () => {
  const raceManager = new RaceManager({ totalLaps: 3, trackLength: 1000 });

  const playerCar = {
    position: { x: 0, y: 0, z: 100 },
    heading: 0,
    speed: 45
  };

  const rivalCar = {
    id: 'ai1',
    name: 'Apex Nova',
    position: { x: 0, y: 0, z: 110 },
    speed: 46
  };

  // Sustain draft for 1.2s
  for (let i = 0; i < 72; i++) {
    raceManager.update(1 / 60, playerCar, [rivalCar]);
  }
  assert.equal(raceManager.isDrafting, true);

  // Rival pulls away to 25m ahead (> 18m)
  rivalCar.position.z = 126;
  raceManager.update(1 / 60, playerCar, [rivalCar]);
  assert.equal(raceManager.isDrafting, false, 'Drafting should clear when distance > 18m');
  assert.equal(raceManager.draftingTimer, 0, 'Drafting timer resets to 0');

  // Rival is behind player (e.g. z = 90 while player is at z = 100)
  rivalCar.position.z = 90;
  for (let i = 0; i < 65; i++) {
    raceManager.update(1 / 60, playerCar, [rivalCar]);
  }
  assert.equal(raceManager.isDrafting, false, 'Rival behind player must not trigger drafting');
});

// ============================================================================
// 5. Standings & Leaderboard Output Tests
// ============================================================================

test('RaceManager getStandings returns player rank and ordered standings for 6 drivers', () => {
  const raceManager = new RaceManager({ totalLaps: 3, trackLength: 1000 });

  const playerCar = {
    id: 'player',
    name: 'Player',
    currentLap: 2,
    splineProgress: 0.50,
    speed: 48,
    position: { x: 0, y: 0, z: 0 },
    heading: 0
  };

  const aiCars = [
    { id: 'ai1', name: 'Apex Nova', currentLap: 2, splineProgress: 0.70, speed: 50 },
    { id: 'ai2', name: 'Cyber Phantom', currentLap: 3, splineProgress: 0.10, speed: 52 },
    { id: 'ai3', name: 'Neon Mirage', currentLap: 2, splineProgress: 0.40, speed: 46 },
    { id: 'ai4', name: 'Vector Zenith', currentLap: 1, splineProgress: 0.90, speed: 44 },
    { id: 'ai5', name: 'Solar Flare', currentLap: 2, splineProgress: 0.10, speed: 45 }
  ];

  raceManager.update(1 / 60, playerCar, aiCars);

  const standingsData = raceManager.getStandings();
  assert.equal(standingsData.totalDrivers, 6);
  assert.equal(standingsData.standings.length, 6);

  // Distances:
  // ai2: (3 - 1) * 1000 + 0.1 * 1000 = 2100 -> 1st
  // ai1: (2 - 1) * 1000 + 0.7 * 1000 = 1700 -> 2nd
  // player: (2 - 1) * 1000 + 0.5 * 1000 = 1500 -> 3rd
  // ai3: (2 - 1) * 1000 + 0.4 * 1000 = 1400 -> 4th
  // ai5: (2 - 1) * 1000 + 0.1 * 1000 = 1100 -> 5th
  // ai4: (1 - 1) * 1000 + 0.9 * 1000 = 900 -> 6th
  assert.equal(standingsData.rank, 3, 'Player should be ranked 3rd');
  assert.equal(standingsData.standings[0].id, 'ai2');
  assert.equal(standingsData.standings[1].id, 'ai1');
  assert.equal(standingsData.standings[2].id, 'player');
  assert.equal(standingsData.standings[2].rank, 3);
  assert.equal(standingsData.standings[3].id, 'ai3');
  assert.equal(standingsData.standings[4].id, 'ai5');
  assert.equal(standingsData.standings[5].id, 'ai4');
});

test('RaceManager getLeaderboard returns structured finish results with formatted times and gaps', () => {
  const raceManager = new RaceManager({ totalLaps: 3, trackLength: 1000 });

  const playerCar = {
    id: 'player',
    name: 'Player',
    currentLap: 3,
    splineProgress: 0.99,
    speed: 50,
    position: { x: 0, y: 0, z: 0 },
    heading: 0
  };

  const aiCars = [
    { id: 'ai1', name: 'Apex Nova', currentLap: 3, splineProgress: 0.95, speed: 49 },
    { id: 'ai2', name: 'Cyber Phantom', currentLap: 3, splineProgress: 0.90, speed: 48 }
  ];

  raceManager.update(1 / 60, playerCar, aiCars);

  raceManager.lapTime = 28.5;
  raceManager.totalTime = 85.5;
  raceManager.bestLapTime = 27.2;

  const leaderboard = raceManager.getLeaderboard();
  assert.equal(leaderboard.length, 3);

  // Player is 1st (splineProgress 0.99)
  const first = leaderboard[0];
  assert.equal(first.rank, 1);
  assert.equal(first.id, 'player');
  assert.equal(first.gap, 'LEADER');
  assert.equal(first.formattedTotalTime, '01:25.50');
  assert.equal(first.formattedBestLapTime, '00:27.20');

  // Second place has positive gap
  const second = leaderboard[1];
  assert.equal(second.rank, 2);
  assert.equal(second.id, 'ai1');
  assert.ok(second.gap.startsWith('+'), '2nd place gap must start with +');
});

test('RaceManager formatTime formats elapsed seconds into MM:SS.cc synthwave format', () => {
  assert.equal(RaceManager.formatTime(0), '00:00.00');
  assert.equal(RaceManager.formatTime(9.45), '00:09.45');
  assert.equal(RaceManager.formatTime(72.5), '01:12.50');
  assert.equal(RaceManager.formatTime(125.08), '02:05.08');
  assert.equal(RaceManager.formatTime(null), '--:--.--');
  assert.equal(RaceManager.formatTime(undefined), '--:--.--');
});

test('RaceManager formatPosition and formatLap produce standard HUD strings', () => {
  assert.equal(RaceManager.formatPosition(1, 6), '1ST/6');
  assert.equal(RaceManager.formatPosition(2, 6), '2ND/6');
  assert.equal(RaceManager.formatPosition(3, 6), '3RD/6');
  assert.equal(RaceManager.formatPosition(4, 6), '4TH/6');
  assert.equal(RaceManager.formatLap(1, 3), '1/3');
  assert.equal(RaceManager.formatLap(3, 3), '3/3');
});

test('RaceManager auto-tracks checkpoints and advances lap with real TrackMath and player progression', () => {
  const track = new TrackMath();
  const raceManager = new RaceManager({ totalLaps: 3, trackLength: track.totalLength });

  const playerCar = {
    id: 'player',
    name: 'Player',
    currentLap: 1,
    splineProgress: 0,
    position: track.getSplinePoint(0),
    heading: 0,
    speed: 40
  };

  // Checkpoint 0 at start
  raceManager.update(1 / 60, playerCar, [], track);
  assert.equal(raceManager.checkpoints.checkpointsHit.has(0), true, 'Checkpoint 0 should be hit at start');
  assert.equal(raceManager.checkpoints.nextCheckpoint, 1);

  // Traverse through checkpoints 1 to 7
  for (let cp = 1; cp < 8; cp++) {
    const t = cp / 8 + 0.01;
    playerCar.splineProgress = t;
    playerCar.position = track.getSplinePoint(t);
    raceManager.update(1 / 60, playerCar, [], track);
    assert.equal(raceManager.checkpoints.checkpointsHit.has(cp), true, `Checkpoint ${cp} should be hit`);
  }

  assert.equal(raceManager.checkpoints.hasHitAllCheckpoints, true, 'All 8 checkpoints cleared');

  // Wrap around finish line into lap 2
  playerCar.splineProgress = 0.01;
  playerCar.position = track.getSplinePoint(0.01);
  raceManager.update(1 / 60, playerCar, [], track);

  assert.equal(raceManager.currentLap, 2, 'Lap should advance to 2 upon crossing finish line');
  assert.equal(raceManager.checkpoints.currentLap, 2);
  assert.equal(raceManager.checkpoints.nextCheckpoint, 0, 'Next checkpoint resets to 0 for lap 2');

  // Next tick at start line hits checkpoint 0 of lap 2
  raceManager.update(1 / 60, playerCar, [], track);
  assert.equal(raceManager.checkpoints.nextCheckpoint, 1, 'Checkpoint 0 hit for lap 2');
});

test('RaceManager handles AI leader and displays positive gap for trailing player in getLeaderboard', () => {
  const raceManager = new RaceManager({ totalLaps: 3, trackLength: 1000 });

  const playerCar = {
    id: 'player',
    name: 'Player',
    currentLap: 3,
    splineProgress: 0.90,
    speed: 48,
    position: { x: 0, y: 0, z: 0 },
    heading: 0
  };

  const aiCars = [
    { id: 'ai1', name: 'Apex Nova', currentLap: 3, splineProgress: 0.98, speed: 50 }
  ];

  raceManager.totalTime = 80.0;
  raceManager.lapTime = 25.0;
  raceManager.bestLapTime = 24.5;

  raceManager.update(1 / 60, playerCar, aiCars);

  const leaderboard = raceManager.getLeaderboard();
  assert.equal(leaderboard.length, 2);

  // AI is leader
  assert.equal(leaderboard[0].id, 'ai1');
  assert.equal(leaderboard[0].rank, 1);
  assert.equal(leaderboard[0].gap, 'LEADER');

  // Player is 2nd
  assert.equal(leaderboard[1].id, 'player');
  assert.equal(leaderboard[1].rank, 2);
  assert.ok(leaderboard[1].gap.startsWith('+'), 'Trailing player gap must start with +');
});

test('CheckpointTracker enforces anti-cheat when car skips halfway across track', () => {
  const tracker = new CheckpointTracker(8);
  assert.equal(tracker.currentLap, 1);

  // Hit checkpoint 0, 1
  assert.equal(tracker.hitCheckpoint(0), true);
  assert.equal(tracker.hitCheckpoint(1), true);

  // Try to skip directly to checkpoint 6 or 7
  assert.equal(tracker.hitCheckpoint(6), false, 'Cheating jump to checkpoint 6 must be rejected');
  assert.equal(tracker.hitCheckpoint(7), false, 'Cheating jump to checkpoint 7 must be rejected');
  assert.equal(tracker.nextCheckpoint, 2, 'Tracker must still expect checkpoint 2');

  // Finish line cross attempt fails
  assert.equal(tracker.completeLap(), false, 'Lap completion must be rejected without all checkpoints');
  assert.equal(tracker.currentLap, 1);
});

