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

// Pillars (decoration / cover)
export const PILLAR_COUNT = 14;

// Camera
export const CAMERA_POS: [number, number, number] = [0, 16, 7];
export const CAMERA_FOV = 55;

// Grace
export const GRACE_PERIOD = 1.0;
