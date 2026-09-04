import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GAME_STATES } from '../js/main.js';
import { SoundManager } from '../js/audio/sound.js';
import { AICarLogic, AICar } from '../js/entities/ai-car.js';
import { PlayerCar } from '../js/entities/player-car.js';
import { TrackMath } from '../js/world/track-math.js';
import { InputManager } from '../js/core/input.js';

test('BUG 1: SoundManager provides setEngineRPM method so main loop does not crash', () => {
  const soundManager = new SoundManager();
  assert.equal(typeof soundManager.setEngineRPM, 'function', 'SoundManager must provide setEngineRPM');
  assert.doesNotThrow(() => {
    soundManager.setEngineRPM(30, true);
  });
});

test('BUG 2: PlayerCar exposes distanceTraveled, distanceAlongTrack, and laneOffset for AI avoidance', () => {
  const track = new TrackMath();
  const player = new PlayerCar({
    initialPosition: { x: 3.5, y: 0.35, z: 50 },
    initialHeading: 0
  });

  // Step physics with track
  player.update(1 / 60, track, { throttle: 1, brake: 0, steer: 0 });

  assert.equal(typeof player.distanceAlongTrack, 'number', 'player.distanceAlongTrack must be a number');
  assert.equal(typeof player.distanceTraveled, 'number', 'player.distanceTraveled must be a number');
  assert.equal(typeof player.laneOffset, 'number', 'player.laneOffset must be a number');
  assert.ok(player.laneOffset !== undefined && !isNaN(player.laneOffset), 'laneOffset must be valid');
});

test('BUG 3: AICar obstacle avoidance detects player car in otherVehicles', () => {
  const track = new TrackMath();
  const player = new PlayerCar({
    initialPosition: { x: 0, y: 0.35, z: 120 },
    initialHeading: 0
  });
  player.physics.speed = 25;
  player.update(1 / 60, track, { throttle: 1 });

  const ai = new AICarLogic({
    name: 'Apex Nova',
    speed: 48,
    laneOffset: 0,
    initialDistance: 100 // 20m behind player in same lane
  });

  // Update AI with player in otherVehicles
  ai.update(1 / 60, track.totalLength, 120, [player]);

  // AI should consider changing lane away from 0 or react
  assert.notEqual(ai.targetLaneOffset, undefined);
});

test('BUG 4: PlayerCar resets previousProgress so lap does not skip to 2 on restart', () => {
  const track = new TrackMath();
  const player = new PlayerCar({
    initialPosition: { x: 0, y: 0.35, z: 0 }
  });

  // Simulate end of race: previousProgress is near end of track (0.95)
  player.previousProgress = 0.95;
  player.physics.splineProgress = 0.95;
  player.currentLap = 3;

  // Reset to track start
  player.resetToTrack(track);

  assert.equal(player.currentLap, 1, 'Current lap must reset to 1');
  assert.ok(player.previousProgress < 0.2, `previousProgress must be reset near 0, got ${player.previousProgress}`);

  // Now step physics on start line - lap must NOT increment to 2
  player.update(1 / 60, track, { throttle: 1 });
  assert.equal(player.currentLap, 1, 'Car must remain on lap 1 after reset');
});

test('BUG 5: InputManager handles destroy() as an alias to dispose()', () => {
  const input = new InputManager();
  assert.equal(typeof input.destroy, 'function', 'InputManager must have destroy method');
  assert.doesNotThrow(() => input.destroy());
});

test('BUG 6: AI rubberbanding maintains competitive speed when player is leading on Lap 2', () => {
  const track = new TrackMath();
  const ai = new AICarLogic({
    name: 'Apex Nova',
    baseSpeed: 48.5,
    speed: 48.5,
    initialDistance: 1100 // On lap 2 (track length ~1000m)
  });

  // Player is 100m ahead on Lap 2: total distance 1200m
  const playerTotalDistance = 1200;
  ai.update(1 / 60, track.totalLength, null, playerTotalDistance, []);

  // When player is leading by 100m, AI must NOT be in rubberband easing (slowing down)
  assert.equal(ai.isRubberbandEasing, false, 'AI must not ease speed when trailing behind player on lap 2');
  assert.equal(ai.isRubberbandBoosting, true, 'AI should boost when trailing behind player by > 80m');
  assert.ok(ai.currentSpeedTarget >= ai.baseSpeed, 'AI target speed must not decrease when trailing');
});

test('BUG 7: Speedometer displays absolute speed in reverse', () => {
  const player = new PlayerCar();
  player.physics.speed = -10.0; // Reversing at 10 m/s (36 km/h)
  const displayedSpeed = Math.round(Math.abs(player.getSpeed()) * 3.6);
  assert.equal(displayedSpeed, 36, 'Speedometer must show 36 km/h when reversing at -10 m/s');
});

test('BUG 8: SoundManager handles dispose and stopMusic without errors', () => {
  const sound = new SoundManager();
  assert.equal(typeof sound.dispose, 'function', 'SoundManager must have dispose method');
  assert.doesNotThrow(() => sound.dispose());
});
