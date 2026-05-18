// Lantern — dark cave exploration. All tuning constants live here.

// Map / world
export const PLAYFIELD = 60;
export const ARENA_HALF = PLAYFIELD / 2;

// Player
export const PLAYER_SPEED = 7.5;
export const PLAYER_RADIUS = 0.65;

// Light radius
export const LIGHT_BASE_RADIUS = 3.0;
export const LIGHT_RED_BONUS = 0.5;
export const LIGHT_MAX_RADIUS = 7.0;
export const LIGHT_GREEN_DURATION = 5.0;
export const LIGHT_GREEN_MULT = 2.0;

// Wall (blue crystal)
export const WALL_RADIUS = 1.5;
export const WALL_DURATION = 5.0;

// Monsters
export const MONSTER_COUNT_BASE = 6;
export const MONSTER_SPAWN_INTERVAL = 6;
export const MONSTER_MAX = 14;
export const MONSTER_BASE_SPEED = 2.6;
export const MONSTER_FLEE_SPEED = 4.5;
export const MONSTER_FLEE_TIME = 1.5;
export const MONSTER_STRIKE_RANGE_MIN = 1.5;
export const MONSTER_STRIKE_RANGE_MAX = 7.0;
export const MONSTER_STRIKE_TELEGRAPH = 1.20;
export const MONSTER_STRIKE_LIVE = 0.30;
export const MONSTER_STRIKE_HIT_RADIUS = 1.0;
export const MONSTER_STRIKE_COOLDOWN = 2.8;

// Crystals
export const CRYSTAL_TYPES = ['red', 'green', 'blue', 'gold'] as const;
export type CrystalType = typeof CRYSTAL_TYPES[number];
export const CRYSTAL_PICKUP_RADIUS = 1.2;
export const CRYSTAL_INITIAL_COUNT = 18;
export const CRYSTAL_RESPAWN_INTERVAL = 5;
export const CRYSTAL_MAX = 26;

// Scoring
export const SCORE_GOLD = 10;
export const SCORE_RED = 25;
export const SCORE_GREEN = 8;
export const SCORE_BLUE = 8;
export const SCORE_DEPTH_PER_UNIT = 5;

// Pillars (decoration / cover / landmarks). Bumped from 14 → 28 so the
// open arena gets enough visual reference points for the player to keep
// orientation between forays.
export const PILLAR_COUNT = 28;

// Camera
export const CAMERA_POS: [number, number, number] = [0, 16, 7];
export const CAMERA_FOV = 55;

// Grace — generous opening window so the player has time to orient before
// the first dark-hand attempts a strike (which itself needs ~1.2s telegraph).
export const GRACE_PERIOD = 3.0;

// Exit stone — the goal of each level. Big distinct glowing crystal that
// spawns at a random far-distance position from the player at level start.
export const EXIT_PICKUP_RADIUS = 1.6;

// ===== LEVEL TUNINGS =====
// 6 progressively harder levels; L6 is the boss. The MONSTER_* and
// MONSTER_STRIKE_* constants above are now defaults / fallbacks — the
// per-level values in LEVELS override them at level start.

export interface LevelTuning {
  level: number;
  name: string;
  timeLimit: number;            // seconds to find the exit
  monsterCount: number;         // initial monsters
  monsterMax: number;
  monsterSpeed: number;         // multiplier on MONSTER_BASE_SPEED
  monsterFleeSpeed: number;     // multiplier on MONSTER_FLEE_SPEED
  monsterSpawnInterval: number; // seconds between spawns
  strikeTelegraph: number;      // seconds of windup
  strikeRangeMax: number;
  strikeCooldown: number;
  exitMinDist: number;          // exit spawn must be this far from spawn
  crystalInitial: number;       // crystals on the field at level start
  isBoss: boolean;
}

export const LEVELS: LevelTuning[] = [
  { level: 1, name: 'Surface',         timeLimit: 90, monsterCount: 3,  monsterMax: 6,  monsterSpeed: 0.82, monsterFleeSpeed: 0.90, monsterSpawnInterval: 9.0, strikeTelegraph: 1.45, strikeRangeMax: 5.5, strikeCooldown: 3.4, exitMinDist: 14, crystalInitial: 18, isBoss: false },
  { level: 2, name: 'Upper Cavern',    timeLimit: 80, monsterCount: 4,  monsterMax: 8,  monsterSpeed: 0.92, monsterFleeSpeed: 0.95, monsterSpawnInterval: 7.5, strikeTelegraph: 1.30, strikeRangeMax: 6.0, strikeCooldown: 3.0, exitMinDist: 17, crystalInitial: 18, isBoss: false },
  { level: 3, name: 'Crystal Halls',   timeLimit: 75, monsterCount: 5,  monsterMax: 10, monsterSpeed: 1.00, monsterFleeSpeed: 1.00, monsterSpawnInterval: 6.0, strikeTelegraph: 1.20, strikeRangeMax: 6.5, strikeCooldown: 2.8, exitMinDist: 20, crystalInitial: 16, isBoss: false },
  { level: 4, name: 'Deep Pools',      timeLimit: 70, monsterCount: 6,  monsterMax: 12, monsterSpeed: 1.10, monsterFleeSpeed: 1.05, monsterSpawnInterval: 5.0, strikeTelegraph: 1.10, strikeRangeMax: 7.0, strikeCooldown: 2.5, exitMinDist: 22, crystalInitial: 14, isBoss: false },
  { level: 5, name: 'Forgotten Vault', timeLimit: 65, monsterCount: 8,  monsterMax: 14, monsterSpeed: 1.18, monsterFleeSpeed: 1.10, monsterSpawnInterval: 4.0, strikeTelegraph: 1.00, strikeRangeMax: 7.5, strikeCooldown: 2.3, exitMinDist: 24, crystalInitial: 12, isBoss: false },
  { level: 6, name: 'The Abyss',       timeLimit: 80, monsterCount: 10, monsterMax: 16, monsterSpeed: 1.25, monsterFleeSpeed: 1.15, monsterSpawnInterval: 3.5, strikeTelegraph: 0.90, strikeRangeMax: 8.0, strikeCooldown: 2.1, exitMinDist: 26, crystalInitial: 10, isBoss: true },
];

export function getLevelTuning(level: number): LevelTuning {
  return LEVELS[Math.min(LEVELS.length, Math.max(1, level)) - 1];
}
