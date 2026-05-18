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

export interface LevelPalette {
  floor: string;
  fog: string;
  ambient: string;
  hemiSky: string;
  hemiGround: string;
  pillar: string;        // base color tint applied to pillars (multiplied)
}

export interface LevelTuning {
  level: number;
  name: string;
  timeLimit: number;            // seconds to find the exit
  lurkerCount: number;          // initial monsters that fear normal light
  stalkerCount: number;         // initial monsters that fear ONLY strong light
  monsterMax: number;
  monsterSpeed: number;         // multiplier on MONSTER_BASE_SPEED
  monsterFleeSpeed: number;     // multiplier on MONSTER_FLEE_SPEED
  monsterSpawnInterval: number; // seconds between spawns
  stalkerSpawnRatio: number;    // 0-1 — fraction of respawns that come back as stalkers
  strikeTelegraph: number;      // seconds of windup
  strikeRangeMax: number;
  strikeCooldown: number;
  exitMinDist: number;          // exit spawn must be this far from player
  exitNeed: number;             // crystals (any type) to summon the exit
  crystalInitial: number;       // crystals on the field at level start
  pillarCount: number;          // how many pillars to spawn at level start
  pillarScaleBias: number;      // scale multiplier on top of 0.75 + rand
  isBoss: boolean;
  palette: LevelPalette;
  // 0 = no eerie melody, 1 = constant; influences melody-layer cadence
  bgmTension: number;
}

// `exitNeed` is the number of crystals (any type) the player must collect
// before the violet Exit Stone appears.
//
// Monster mix: lurkers fear all light (become trivial once player's reach
// exceeds strikeRangeMax). Stalkers only fear strong light (green crystal
// active) — these are the real threat in later levels. Lurkers in L3+
// double as "fodder" that showcases the lantern's grown power.
//
// Palette: warm brown surface → cooler / wetter mid → amber-dusted vault
// → purple-black abyss. Each level reads slightly different so descent
// feels like descent.

const PALETTE: Record<string, LevelPalette> = {
  surface:  { floor: '#2c2118', fog: '#080c14', ambient: '#1f2c40', hemiSky: '#36456a', hemiGround: '#101418', pillar: '#3a322a' },
  upper:    { floor: '#28281e', fog: '#0a1410', ambient: '#1f3026', hemiSky: '#324a3a', hemiGround: '#101a14', pillar: '#363a2a' },
  crystal:  { floor: '#1f262e', fog: '#080e16', ambient: '#1c2e44', hemiSky: '#3a4e72', hemiGround: '#0e1620', pillar: '#2c3744' },
  pools:    { floor: '#181f24', fog: '#040a14', ambient: '#142838', hemiSky: '#264262', hemiGround: '#0a1018', pillar: '#1f2a36' },
  vault:    { floor: '#2d2418', fog: '#100c08', ambient: '#3a2818', hemiSky: '#4a3422', hemiGround: '#181208', pillar: '#3e2f1c' },
  abyss:    { floor: '#1a1018', fog: '#100614', ambient: '#28132c', hemiSky: '#3e1840', hemiGround: '#0a0410', pillar: '#2a1830' },
};

export const LEVELS: LevelTuning[] = [
  { level: 1, name: 'Surface',         timeLimit: 90, lurkerCount: 3, stalkerCount: 0, monsterMax: 6,  monsterSpeed: 0.82, monsterFleeSpeed: 0.90, monsterSpawnInterval: 9.0, stalkerSpawnRatio: 0.0,  strikeTelegraph: 1.45, strikeRangeMax: 5.5, strikeCooldown: 3.4, exitMinDist: 14, exitNeed: 3, crystalInitial: 18, pillarCount: 28, pillarScaleBias: 1.0,  isBoss: false, palette: PALETTE.surface, bgmTension: 0.20 },
  { level: 2, name: 'Upper Cavern',    timeLimit: 80, lurkerCount: 4, stalkerCount: 0, monsterMax: 8,  monsterSpeed: 0.92, monsterFleeSpeed: 0.95, monsterSpawnInterval: 7.5, stalkerSpawnRatio: 0.10, strikeTelegraph: 1.30, strikeRangeMax: 6.0, strikeCooldown: 3.0, exitMinDist: 17, exitNeed: 4, crystalInitial: 18, pillarCount: 30, pillarScaleBias: 0.95, isBoss: false, palette: PALETTE.upper,   bgmTension: 0.30 },
  { level: 3, name: 'Crystal Halls',   timeLimit: 75, lurkerCount: 4, stalkerCount: 1, monsterMax: 10, monsterSpeed: 1.00, monsterFleeSpeed: 1.00, monsterSpawnInterval: 6.0, stalkerSpawnRatio: 0.25, strikeTelegraph: 1.20, strikeRangeMax: 6.5, strikeCooldown: 2.8, exitMinDist: 20, exitNeed: 5, crystalInitial: 16, pillarCount: 32, pillarScaleBias: 0.90, isBoss: false, palette: PALETTE.crystal, bgmTension: 0.50 },
  { level: 4, name: 'Deep Pools',      timeLimit: 70, lurkerCount: 4, stalkerCount: 2, monsterMax: 12, monsterSpeed: 1.10, monsterFleeSpeed: 1.05, monsterSpawnInterval: 5.0, stalkerSpawnRatio: 0.40, strikeTelegraph: 1.10, strikeRangeMax: 7.0, strikeCooldown: 2.5, exitMinDist: 22, exitNeed: 6, crystalInitial: 14, pillarCount: 30, pillarScaleBias: 0.95, isBoss: false, palette: PALETTE.pools,   bgmTension: 0.60 },
  { level: 5, name: 'Forgotten Vault', timeLimit: 65, lurkerCount: 4, stalkerCount: 4, monsterMax: 14, monsterSpeed: 1.18, monsterFleeSpeed: 1.10, monsterSpawnInterval: 4.0, stalkerSpawnRatio: 0.55, strikeTelegraph: 1.00, strikeRangeMax: 7.5, strikeCooldown: 2.3, exitMinDist: 24, exitNeed: 7, crystalInitial: 12, pillarCount: 24, pillarScaleBias: 1.20, isBoss: false, palette: PALETTE.vault,   bgmTension: 0.75 },
  { level: 6, name: 'The Abyss',       timeLimit: 80, lurkerCount: 6, stalkerCount: 2, monsterMax: 16, monsterSpeed: 1.25, monsterFleeSpeed: 1.15, monsterSpawnInterval: 3.5, stalkerSpawnRatio: 0.65, strikeTelegraph: 0.90, strikeRangeMax: 8.0, strikeCooldown: 2.1, exitMinDist: 26, exitNeed: 8, crystalInitial: 10, pillarCount: 20, pillarScaleBias: 1.45, isBoss: true,  palette: PALETTE.abyss,   bgmTension: 0.95 },
];

export function getLevelTuning(level: number): LevelTuning {
  return LEVELS[Math.min(LEVELS.length, Math.max(1, level)) - 1];
}
