/**
 * 3D Synthwave Circuit Racer — Race Manager & Standings Controller
 * Implements:
 * - StandingsCalculator: Pure static helper sorting all drivers (player + AI rivals)
 *   by total race distance ((lap - 1) * trackLength + splineProgress * trackLength),
 *   assigning 1st-6th ranks, and identifying player standings.
 * - CheckpointTracker: Sequential checkpoint validator per vehicle ensuring all 8
 *   checkpoints are cleared in order before advancing laps (anti-cheat).
 * - RaceManager: High-level race state controller managing lap timing, best lap
 *   tracking, slipstream drafting detection (18m range for >= 1.0s), 3-lap race
 *   completion, and final leaderboard statistics for HUD.
 */

/**
 * Pure static calculator for real-time race standings and rank sorting
 */
export class StandingsCalculator {
  /**
   * Sorts drivers descending by total race distance
   * @param {Array<Object>} drivers Array of vehicle data objects
   * @param {number} trackLength Circuit length in meters (default 1000)
   * @returns {Array<Object>} Sorted driver results with rank assigned (1st..Nth)
   */
  static calculate(drivers, trackLength = 1000) {
    if (!Array.isArray(drivers) || drivers.length === 0) {
      return [];
    }

    const tLen = Math.max(1, trackLength);

    const evaluated = drivers.map((driver, index) => {
      const lap = Math.max(1, driver.lap ?? driver.currentLap ?? 1);
      const progress = Math.max(0, Math.min(1, driver.splineProgress ?? 0));
      const totalDistance = (lap - 1) * tLen + progress * tLen;

      const isPlayer = Boolean(
        driver.isPlayer || driver.id === 'player' || driver.name === 'Player'
      );

      return {
        ...driver,
        id: driver.id ?? (isPlayer ? 'player' : `rival_${index}`),
        name: driver.name ?? (isPlayer ? 'Player' : `Rival ${index}`),
        lap,
        splineProgress: progress,
        totalDistance,
        isPlayer,
        speed: driver.speed ?? driver.physics?.speed ?? driver.logic?.speed ?? 0,
        color: driver.color ?? (isPlayer ? '#ff0055' : '#00ffff')
      };
    });

    // Sort descending by totalDistance
    evaluated.sort((a, b) => b.totalDistance - a.totalDistance);

    // Assign 1-indexed ranks
    for (let i = 0; i < evaluated.length; i++) {
      evaluated[i].rank = i + 1;
    }

    return evaluated;
  }

  /**
   * Finds the current rank of the player vehicle
   * @param {Array<Object>} standings Array of ranked driver results
   * @param {string} playerId ID of the player driver (default 'player')
   * @returns {number} 1-based rank of the player (default 1 if not found)
   */
  static getPlayerRank(standings, playerId = 'player') {
    if (!Array.isArray(standings)) return 1;
    const player = standings.find(d => d.isPlayer || d.id === playerId);
    return player ? player.rank : 1;
  }
}

/**
 * Sequential checkpoint tracker and anti-cheat validator for vehicle laps
 */
export class CheckpointTracker {
  /**
   * @param {number} totalCheckpoints Number of sequential checkpoints per lap (default 8)
   * @param {number} totalLaps Number of laps to complete (default 3)
   */
  constructor(totalCheckpoints = 8, totalLaps = 3) {
    this.totalCheckpoints = Math.max(1, totalCheckpoints);
    this.totalLaps = Math.max(1, totalLaps);
    this.currentLap = 1;
    this.nextCheckpoint = 0;
    this.checkpointsHit = new Set();
  }

  /**
   * Returns true if all checkpoints for the current lap have been hit
   */
  get hasHitAllCheckpoints() {
    return this.checkpointsHit.size === this.totalCheckpoints;
  }

  /**
   * Attempts to hit a checkpoint. Must match this.nextCheckpoint sequentially.
   * @param {number} checkpointIndex Index of the checkpoint (0 to totalCheckpoints - 1)
   * @returns {boolean} True if checkpoint hit was valid and accepted
   */
  hitCheckpoint(checkpointIndex) {
    if (checkpointIndex === this.nextCheckpoint && checkpointIndex < this.totalCheckpoints) {
      this.checkpointsHit.add(checkpointIndex);
      this.nextCheckpoint++;
      return true;
    }
    return false;
  }

  /**
   * Completes the current lap and advances to the next lap if all checkpoints were hit.
   * @returns {boolean} True if lap completion was valid and lap advanced
   */
  completeLap() {
    if (this.hasHitAllCheckpoints) {
      this.currentLap++;
      this.nextCheckpoint = 0;
      this.checkpointsHit.clear();
      return true;
    }
    return false;
  }

  /**
   * Resets tracker to initial lap and checkpoint state
   */
  reset() {
    this.currentLap = 1;
    this.nextCheckpoint = 0;
    this.checkpointsHit.clear();
  }
}

/**
 * High-level race state manager coordinating timing, drafting, standings and HUD
 */
export class RaceManager {
  /**
   * @param {Object} options Configuration options
   * @param {number} options.totalLaps Total laps in race (default 3)
   * @param {number} options.trackLength Track circuit length in meters (default 1000)
   * @param {number} options.totalCheckpoints Checkpoints per circuit (default 8)
   */
  constructor(options = {}) {
    this.totalLaps = options.totalLaps || 3;
    this.trackLength = options.trackLength || 1000;
    this.totalCheckpoints = options.totalCheckpoints || 8;

    this.currentLap = 1;
    this.lapTime = 0.0;
    this.totalTime = 0.0;
    this.bestLapTime = null;
    this.lapHistory = [];
    this.isFinished = false;
    this.finishTime = null;

    // Drafting slipstream mechanics (within 18m behind rival for >= 1.0s)
    this.isDrafting = false;
    this.draftingTimer = 0.0;

    // Checkpoint validation
    this.checkpoints = new CheckpointTracker(this.totalCheckpoints, this.totalLaps);

    // Entity references & AI finish tracking
    this.playerCar = null;
    this.aiCars = [];
    this.track = null;
    this.aiFinishTimes = new Map();
    this.aiBestLaps = new Map();
    this._prevPlayerProgress = undefined;
  }

  /**
   * Lap times snapshot object for compatibility
   */
  get lapTimes() {
    return {
      current: this.lapTime,
      best: this.bestLapTime,
      lapCount: this.currentLap,
      isFinished: this.isFinished,
      history: [...this.lapHistory]
    };
  }

  /**
   * Complete snapshot of race status for HUD displays
   */
  getRaceInfo() {
    return {
      currentLap: Math.min(this.currentLap, this.totalLaps),
      totalLaps: this.totalLaps,
      lapTime: this.lapTime,
      bestLapTime: this.bestLapTime,
      totalTime: this.totalTime,
      isFinalLap: this.currentLap === this.totalLaps && !this.isFinished,
      isFinished: this.isFinished,
      isDrafting: this.isDrafting
    };
  }

  /**
   * Validates and completes a lap for the player
   * @returns {boolean} True if lap was completed successfully
   */
  completeLap() {
    const valid = this.checkpoints.completeLap();
    if (!valid) {
      return false;
    }

    const finishedTime = this.lapTime;
    this.lapHistory.push(finishedTime);

    if (this.bestLapTime === null || finishedTime < this.bestLapTime) {
      this.bestLapTime = finishedTime;
    }

    if (this.currentLap >= this.totalLaps) {
      this.isFinished = true;
      this.finishTime = this.totalTime;
    } else {
      this.currentLap = this.checkpoints.currentLap;
      this.lapTime = 0.0;
    }

    return true;
  }

  /**
   * Updates race simulation tick
   * @param {number} dt Delta time in seconds
   * @param {Object} [playerCar] Player car instance or mock
   * @param {Array<Object>} [aiCars] Array of AI rival instances
   * @param {Object} [track] TrackMath instance
   */
  update(dt = 1 / 60, playerCar = null, aiCars = null, track = null) {
    if (playerCar) {
      this.playerCar = playerCar;
      if (typeof playerCar.currentLap === 'number' && playerCar.currentLap > this.currentLap) {
        this.currentLap = playerCar.currentLap;
        this.checkpoints.currentLap = playerCar.currentLap;
      }
    }
    if (aiCars) this.aiCars = aiCars;
    if (track) this.track = track;

    // Advance clock if race is running
    if (!this.isFinished) {
      this.lapTime += dt;
      this.totalTime += dt;
    }

    // Auto-update checkpoints for player if car & track available
    if (this.playerCar) {
      this._updatePlayerCheckpoints(this.playerCar, this.track);
    }

    // Update drafting slipstream detection
    this._updateDrafting(dt, this.playerCar, this.aiCars, this.track);
  }

  /**
   * Automatically updates player checkpoints from position / spline progress
   * @private
   */
  _updatePlayerCheckpoints(playerCar, track) {
    if (!playerCar || this.isFinished) return;

    const nextCp = this.checkpoints.nextCheckpoint;

    // 1. Check if next checkpoint hit
    if (nextCp < this.totalCheckpoints) {
      let hit = false;

      // Distance check in 3D
      if (track && Array.isArray(track.checkpoints) && track.checkpoints[nextCp]) {
        const cp = track.checkpoints[nextCp];
        const pPos = playerCar.position || playerCar.physics?.position;
        if (pPos && cp.position) {
          const dist = Math.hypot(
            pPos.x - cp.position.x,
            (pPos.y || 0) - (cp.position.y || 0),
            pPos.z - cp.position.z
          );
          if (dist <= 25.0) {
            hit = true;
          }
        }
      }

      // Spline progress check
      const progress = playerCar.splineProgress ?? playerCar.physics?.splineProgress;
      if (!hit && typeof progress === 'number') {
        const targetT = nextCp / this.totalCheckpoints;
        let diff = progress - targetT;
        if (diff < -0.5) diff += 1.0;
        if (diff > 0.5) diff -= 1.0;
        if (Math.abs(diff) < 0.06 || (progress >= targetT && progress < targetT + 0.125)) {
          hit = true;
        }
      }

      if (hit) {
        this.checkpoints.hitCheckpoint(nextCp);
      }
    }

    // 2. Check for lap crossing when all 8 checkpoints have been cleared
    if (this.checkpoints.hasHitAllCheckpoints) {
      const progress = playerCar.splineProgress ?? playerCar.physics?.splineProgress;
      let crossed = false;

      // Seam wrap from end (> 0.80) to start (< 0.20)
      if (typeof progress === 'number' && this._prevPlayerProgress !== undefined) {
        if (this._prevPlayerProgress > 0.80 && progress < 0.20) {
          crossed = true;
        }
      }

      // Proximity to start/finish line (checkpoint 0)
      if (!crossed && track && Array.isArray(track.checkpoints) && track.checkpoints[0]) {
        const startCp = track.checkpoints[0];
        const pPos = playerCar.position || playerCar.physics?.position;
        if (pPos && startCp.position) {
          const dist = Math.hypot(
            pPos.x - startCp.position.x,
            (pPos.y || 0) - (startCp.position.y || 0),
            pPos.z - startCp.position.z
          );
          if (dist <= 20.0) {
            crossed = true;
          }
        }
      }

      if (crossed) {
        this.completeLap();
      }
    }

    const curProgress = playerCar.splineProgress ?? playerCar.physics?.splineProgress;
    if (typeof curProgress === 'number') {
      this._prevPlayerProgress = curProgress;
    }
  }

  /**
   * Updates drafting slipstream detection (within 18m behind rival for >= 1.0s)
   * @private
   */
  _updateDrafting(dt, playerCar, aiCars, track) {
    if (!playerCar || !Array.isArray(aiCars) || aiCars.length === 0) {
      this.isDrafting = false;
      this.draftingTimer = 0.0;
      if (playerCar) playerCar.isDrafting = false;
      return;
    }

    let behindRival = false;

    for (const rival of aiCars) {
      if (this._isBehindRival(playerCar, rival, track)) {
        behindRival = true;
        break;
      }
    }

    if (behindRival) {
      this.draftingTimer += dt;
      if (this.draftingTimer >= 1.0) {
        this.isDrafting = true;
      }
    } else {
      this.draftingTimer = 0.0;
      this.isDrafting = false;
    }

    if (playerCar) {
      playerCar.isDrafting = this.isDrafting;
    }
  }

  /**
   * Checks whether the player vehicle is directly behind a given rival within 18m
   * @private
   */
  _isBehindRival(player, rival, track) {
    const px = player.position?.x ?? player.physics?.position?.x;
    const py = player.position?.y ?? player.physics?.position?.y ?? 0;
    const pz = player.position?.z ?? player.physics?.position?.z;

    const rx = rival.position?.x ?? rival.logic?.position?.x;
    const ry = rival.position?.y ?? rival.logic?.position?.y ?? 0;
    const rz = rival.position?.z ?? rival.logic?.position?.z;

    // 1. Check 3D relative positioning
    if (typeof px === 'number' && typeof pz === 'number' &&
        typeof rx === 'number' && typeof rz === 'number') {
      const dx = rx - px;
      const dy = ry - py;
      const dz = rz - pz;
      const dist = Math.hypot(dx, dy, dz);

      if (dist > 0.1 && dist <= 18.0) {
        // Player forward heading vector
        const heading = player.heading ?? player.physics?.heading ?? 0;
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);

        const forwardDist = dx * fx + dz * fz;
        const lateralDist = Math.abs(-dx * fz + dz * fx);

        // Rival is ahead of player (forwardDist > 0) within slipstream corridor
        if (forwardDist > 0 && (lateralDist <= 5.0 || (forwardDist / dist) > 0.5)) {
          return true;
        }
      }
    }

    // 2. Fallback check by distance traveled along track
    const pDist = player.distanceTraveled ?? player.distance;
    const rDist = rival.distanceTraveled ?? rival.distance ?? rival.logic?.distanceTraveled;
    if (typeof pDist === 'number' && typeof rDist === 'number') {
      const diff = rDist - pDist;
      if (diff > 0.1 && diff <= 18.0) {
        return true;
      }
    }

    // 3. Fallback check by spline progress
    const pProg = player.splineProgress ?? player.physics?.splineProgress;
    const rProg = rival.splineProgress ?? rival.logic?.splineProgress;
    const tLen = track?.totalLength || this.trackLength || 1000;
    if (typeof pProg === 'number' && typeof rProg === 'number' && tLen > 0) {
      let diff = rProg - pProg;
      if (diff < -0.5) diff += 1.0;
      const distM = diff * tLen;
      if (distM > 0.1 && distM <= 18.0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculates and returns real-time standings
   * @param {Array<Object>} [customDrivers] Optional driver list override
   * @param {number} [customTrackLength] Optional track length override
   * @returns {{ rank: number, totalDrivers: number, standings: Array<Object> }}
   */
  getStandings(customDrivers = null, customTrackLength = null) {
    const trackLen = customTrackLength || this.track?.totalLength || this.trackLength || 1000;

    let drivers = customDrivers;
    if (!drivers) {
      drivers = [];
      if (this.playerCar) {
        drivers.push({
          id: this.playerCar.id || 'player',
          name: this.playerCar.name || 'Player',
          lap: this.playerCar.currentLap ?? this.playerCar.lap ?? this.currentLap ?? 1,
          splineProgress: this.playerCar.splineProgress ?? this.playerCar.physics?.splineProgress ?? 0,
          isPlayer: true,
          speed: this.playerCar.speed ?? this.playerCar.physics?.speed ?? 0,
          color: this.playerCar.color || '#ff0055'
        });
      }

      if (Array.isArray(this.aiCars)) {
        this.aiCars.forEach((ai, index) => {
          drivers.push({
            id: ai.id || ai.name || `ai_${index + 1}`,
            name: ai.name || ai.logic?.name || `Rival ${index + 1}`,
            lap: ai.currentLap ?? ai.logic?.currentLap ?? ai.lap ?? 1,
            splineProgress: ai.splineProgress ?? ai.logic?.splineProgress ?? 0,
            isPlayer: false,
            speed: ai.speed ?? ai.logic?.speed ?? 0,
            color: ai.color || ai.logic?.palette?.primary || '#00ffff'
          });
        });
      }
    }

    const standings = StandingsCalculator.calculate(drivers, trackLen);
    const rank = StandingsCalculator.getPlayerRank(standings);

    return {
      rank,
      totalDrivers: standings.length,
      standings
    };
  }

  /**
   * Generates structured finish table results for HUD finish screen
   * @returns {Array<Object>} Leaderboard rows sorted 1st to Nth
   */
  getLeaderboard() {
    const { standings } = this.getStandings();
    if (!standings || standings.length === 0) return [];

    const totalDistanceTarget = this.totalLaps * this.trackLength;
    const leaderDistance = standings[0].totalDistance;
    const leaderTime = this.totalTime;

    return standings.map((driver, index) => {
      let driverTotalTime;
      let driverBestLap;

      if (driver.isPlayer) {
        driverTotalTime = this.totalTime;
        driverBestLap = this.bestLapTime ?? (this.totalTime / Math.max(1, this.currentLap));
      } else {
        // AI finish calculation
        const distBehindLeader = Math.max(0, leaderDistance - driver.totalDistance);
        const speed = Math.max(20, driver.speed || 45);
        const timeDiff = distBehindLeader / speed;
        driverTotalTime = leaderTime + timeDiff;
        driverBestLap = (driverTotalTime / this.totalLaps) * 0.97;
      }

      let gap = 'LEADER';
      if (index > 0) {
        const timeGap = Math.max(0.01, driverTotalTime - leaderTime);
        gap = `+${timeGap.toFixed(2)}s`;
      }

      return {
        rank: driver.rank,
        id: driver.id,
        name: driver.name,
        isPlayer: driver.isPlayer,
        color: driver.color,
        totalTime: driverTotalTime,
        formattedTotalTime: RaceManager.formatTime(driverTotalTime),
        bestLapTime: driverBestLap,
        formattedBestLapTime: RaceManager.formatTime(driverBestLap),
        gap,
        isFinished: driver.totalDistance >= totalDistanceTarget || this.isFinished
      };
    });
  }

  /**
   * Resets race manager state to initial conditions
   */
  reset() {
    this.currentLap = 1;
    this.lapTime = 0.0;
    this.totalTime = 0.0;
    this.bestLapTime = null;
    this.lapHistory = [];
    this.isFinished = false;
    this.finishTime = null;
    this.isDrafting = false;
    this.draftingTimer = 0.0;
    this.checkpoints.reset();
    this.aiFinishTimes.clear();
    this.aiBestLaps.clear();
    this._prevPlayerProgress = undefined;
  }

  // ==========================================================================
  // Static Formatting Helpers
  // ==========================================================================

  /**
   * Formats elapsed seconds into synthwave digital timer string MM:SS.cc
   * @param {number} seconds Elapsed time in seconds
   * @returns {string} Formatted time string e.g. "01:23.45"
   */
  static formatTime(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
      return '--:--.--';
    }
    const totalHundredths = Math.round(seconds * 100);
    const hundredths = totalHundredths % 100;
    const totalSecs = Math.floor(totalHundredths / 100);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;

    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${pad(mins)}:${pad(secs)}.${pad(hundredths)}`;
  }

  /**
   * Formats rank and total drivers into HUD position string e.g. "1ST/6"
   * @param {number} rank 1-based rank position
   * @param {number} [totalDrivers=6] Total drivers in race
   * @returns {string} Position string e.g. "1ST/6"
   */
  static formatPosition(rank, totalDrivers = 6) {
    const ordinal = RaceManager.getOrdinal(rank);
    return `${ordinal}/${totalDrivers}`;
  }

  /**
   * Formats current lap into HUD lap indicator string e.g. "1/3"
   * @param {number} currentLap Current lap number
   * @param {number} [totalLaps=3] Total laps
   * @returns {string} Lap string e.g. "1/3"
   */
  static formatLap(currentLap, totalLaps = 3) {
    return `${Math.min(currentLap, totalLaps)}/${totalLaps}`;
  }

  /**
   * Generates English ordinal suffix for integers (1ST, 2ND, 3RD, 4TH...)
   * @param {number} n Input integer
   * @returns {string} Ordinal string
   */
  static getOrdinal(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) {
      return `${n}TH`;
    }
    const mod10 = n % 10;
    if (mod10 === 1) return `${n}ST`;
    if (mod10 === 2) return `${n}ND`;
    if (mod10 === 3) return `${n}RD`;
    return `${n}TH`;
  }
}
