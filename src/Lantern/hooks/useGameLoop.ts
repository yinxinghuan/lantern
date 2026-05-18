import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  PLAYFIELD, ARENA_HALF, PLAYER_SPEED, PLAYER_RADIUS,
  LIGHT_BASE_RADIUS, LIGHT_RED_BONUS, LIGHT_MAX_RADIUS, LIGHT_GREEN_DURATION, LIGHT_GREEN_MULT,
  WALL_RADIUS, WALL_DURATION,
  MONSTER_BASE_SPEED, MONSTER_FLEE_SPEED, MONSTER_FLEE_TIME,
  MONSTER_STRIKE_RANGE_MIN, MONSTER_STRIKE_LIVE,
  MONSTER_STRIKE_HIT_RADIUS,
  CRYSTAL_PICKUP_RADIUS, CRYSTAL_RESPAWN_INTERVAL, CRYSTAL_MAX,
  CRYSTAL_TYPES,
  SCORE_GOLD, SCORE_RED, SCORE_GREEN, SCORE_BLUE, SCORE_DEPTH_PER_UNIT,
  PILLAR_COUNT, GRACE_PERIOD,
  EXIT_PICKUP_RADIUS, getLevelTuning, LEVELS,
} from '../constants';
import type { CrystalType, LevelTuning } from '../constants';
import type { Crystal, ExitStone, FxEvent, Monster, Pillar, PillarVariant, Stick } from '../types';

export type SfxKey = 'pickup_gold' | 'pickup_red' | 'pickup_green' | 'pickup_blue' | 'strike_telegraph' | 'strike_hit' | 'wall_pulse' | 'monster_flee' | 'game_over';

export interface GameRef {
  pos: THREE.Vector3;
  rot: number;
  speed: number;
  lightRadius: number;
  greenT: number;
  monsters: Monster[];
  crystals: Crystal[];
  walls: { id: number; position: THREE.Vector3; bornAt: number }[];
  pillars: Pillar[];
  exit: ExitStone | null;
  time: number;        // total game time (across levels) — used for cooldowns
  levelT: number;      // time elapsed within the current level
  score: number;
  redCount: number;
  goldCount: number;
  greenCount: number;
  blueCount: number;
  maxDepth: number;
  monsterSpawnTimer: number;
  crystalRespawnTimer: number;
  nearestMonsterDist: number;
  fx: FxEvent[];
  initialized: boolean;
  gameOver: boolean;
  // Level progression
  level: number;          // 1-indexed
  levelPickups: number;   // crystals collected THIS level — gates exit spawn
  exitSummonedJustNow: boolean; // one-shot flag for the UI to play a banner
  levelCleared: boolean;  // set when player touches exit; UI handles transition
  victory: boolean;       // true after final level cleared
}

export function createGameState(): GameRef {
  return {
    pos: new THREE.Vector3(0, 0, 5),
    rot: Math.PI,
    speed: 0,
    lightRadius: LIGHT_BASE_RADIUS,
    greenT: 0,
    monsters: [],
    crystals: [],
    walls: [],
    pillars: [],
    exit: null,
    time: 0,
    levelT: 0,
    score: 0,
    redCount: 0, goldCount: 0, greenCount: 0, blueCount: 0,
    maxDepth: 0,
    monsterSpawnTimer: 0,
    crystalRespawnTimer: 0,
    nearestMonsterDist: 99,
    fx: [],
    initialized: false,
    gameOver: false,
    level: 1,
    levelPickups: 0,
    exitSummonedJustNow: false,
    levelCleared: false,
    victory: false,
  };
}

let idCounter = 1;
const nextId = () => idCounter++;

function emitFx(d: GameRef, type: FxEvent['type'], x: number, z: number) {
  d.fx.push({ key: Math.random(), type, x, z, born: d.time });
  if (d.fx.length > 40) d.fx = d.fx.filter(f => d.time - f.born < 2.5);
}

function randomSpawnPos(d: GameRef, minDistFromPlayer: number, marginFromEdge: number): THREE.Vector3 {
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() - 0.5) * (PLAYFIELD - marginFromEdge * 2);
    const z = (Math.random() - 0.5) * (PLAYFIELD - marginFromEdge * 2);
    const dx = x - d.pos.x;
    const dz = z - d.pos.z;
    if (dx * dx + dz * dz >= minDistFromPlayer * minDistFromPlayer) {
      return new THREE.Vector3(x, 0, z);
    }
  }
  return new THREE.Vector3((Math.random() - 0.5) * PLAYFIELD * 0.8, 0, (Math.random() - 0.5) * PLAYFIELD * 0.8);
}

function spawnMonster(d: GameRef, tuning: LevelTuning) {
  if (d.monsters.length >= tuning.monsterMax) return;
  const pos = randomSpawnPos(d, 14, 2);
  d.monsters.push({
    id: nextId(),
    position: pos,
    velocity: new THREE.Vector3(),
    rotation: Math.random() * Math.PI * 2,
    state: 'lurking',
    fleeT: 0,
    cooldownT: 0,
    strikeT: 0,
    strikeAimX: 0,
    strikeAimZ: 0,
  });
}

// Spawn the boss monster — single big shadow that only fears strong light
// (green crystal active). Used only on isBoss levels.
function spawnBossMonster(d: GameRef) {
  const pos = randomSpawnPos(d, 18, 2);
  d.monsters.push({
    id: nextId(),
    position: pos,
    velocity: new THREE.Vector3(),
    rotation: Math.random() * Math.PI * 2,
    state: 'lurking',
    fleeT: 0,
    cooldownT: 0,
    strikeT: 0,
    strikeAimX: 0,
    strikeAimZ: 0,
    isBoss: true,
  });
}

// Place the exit stone at a random position far from the player. This is
// the level goal — the player must navigate to it through the dark.
function spawnExit(d: GameRef, tuning: LevelTuning) {
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * (PLAYFIELD - 4);
    const z = (Math.random() - 0.5) * (PLAYFIELD - 4);
    const dx = x - d.pos.x;
    const dz = z - d.pos.z;
    if (Math.hypot(dx, dz) >= tuning.exitMinDist) {
      d.exit = { position: new THREE.Vector3(x, 0, z) };
      return;
    }
  }
  // Fallback if we couldn't satisfy min distance — just place opposite
  d.exit = { position: new THREE.Vector3(-d.pos.x, 0, -d.pos.z) };
}

// Reset everything that changes per level (monsters, crystals, walls, exit)
// while preserving cumulative score and the player's lantern upgrades.
// The exit deliberately does NOT spawn here — it appears only after the
// player collects tuning.exitNeed crystals (any type) during the level.
export function startLevel(d: GameRef, level: number) {
  const tuning = getLevelTuning(level);
  d.level = level;
  d.levelT = 0;
  d.levelPickups = 0;
  d.exitSummonedJustNow = false;
  d.levelCleared = false;
  d.monsters = [];
  d.crystals = [];
  d.walls = [];
  d.exit = null;
  d.monsterSpawnTimer = 0;
  d.crystalRespawnTimer = 0;
  d.pos.set(0, 0, 5);
  d.rot = Math.PI;
  d.maxDepth = Math.hypot(d.pos.x, d.pos.z);

  for (let i = 0; i < tuning.crystalInitial; i++) spawnCrystal(d);
  for (let i = 0; i < tuning.monsterCount; i++) spawnMonster(d, tuning);
  // Boss level — one Dark Lord that doesn't fear normal light.
  if (tuning.isBoss) spawnBossMonster(d);
}

// Try to summon the exit. Called after each pickup once the threshold is
// hit. Sets a one-shot flag so the UI can show a "EXIT REVEALED" banner.
function maybeSummonExit(d: GameRef, tuning: LevelTuning) {
  if (d.exit) return;
  if (d.levelPickups < tuning.exitNeed) return;
  spawnExit(d, tuning);
  d.exitSummonedJustNow = true;
}

function spawnCrystal(d: GameRef, type?: CrystalType) {
  if (d.crystals.length >= CRYSTAL_MAX) return;
  const t: CrystalType = type ?? (CRYSTAL_TYPES[Math.floor(Math.random() * CRYSTAL_TYPES.length)] as CrystalType);
  const pos = randomSpawnPos(d, 5, 3);
  d.crystals.push({ id: nextId(), position: pos, type: t });
}

// Pillar variant weights — spikes are common (the cave-ceiling-drips look),
// domes (round boulders) less so, clusters (small stone groups) the rarest.
const PILLAR_VARIANT_WEIGHTS: { v: PillarVariant; w: number }[] = [
  { v: 'spike',   w: 5 },
  { v: 'dome',    w: 3 },
  { v: 'cluster', w: 2 },
];
function pickPillarVariant(): PillarVariant {
  const total = PILLAR_VARIANT_WEIGHTS.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of PILLAR_VARIANT_WEIGHTS) {
    r -= x.w;
    if (r <= 0) return x.v;
  }
  return 'spike';
}

function spawnPillar(): Pillar {
  // Keep pillars away from the dead center (where the altar sits) and the
  // very edge (where the perimeter wall hugs).
  let x: number, z: number;
  for (let i = 0; i < 20; i++) {
    x = (Math.random() - 0.5) * (PLAYFIELD - 6);
    z = (Math.random() - 0.5) * (PLAYFIELD - 6);
    if (Math.hypot(x, z) > 4) break;
  }
  return {
    id: nextId(),
    position: new THREE.Vector3(x!, 0, z!),
    scale: 0.75 + Math.random() * 1.6,
    rot: Math.random() * Math.PI * 2,
    variant: pickPillarVariant(),
  };
}

export type PickupKind = 'gold' | 'red' | 'green' | 'blue';

export interface GameLoopParams {
  state: React.MutableRefObject<GameRef>;
  playing: boolean;
  stick: Stick;
  onScore: (s: number) => void;
  onDepth: (d: number) => void;
  onLightRadius: (r: number) => void;
  onGameOver: (final: number) => void;
  onPickup?: (kind: PickupKind, value: number) => void;
  onStrikeHit?: () => void;
  playSfx: (k: SfxKey) => void;
  haptic?: (k: 'light' | 'heavy') => void;
}

export function useGameLoop(p: GameLoopParams) {
  if (!p.state.current.initialized) {
    const d = p.state.current;
    for (let i = 0; i < PILLAR_COUNT; i++) d.pillars.push(spawnPillar());
    startLevel(d, d.level || 1);
    d.initialized = true;
  }

  useFrame((_, delta) => {
    const d = p.state.current;
    if (!p.playing || d.gameOver || d.levelCleared || d.victory) return;
    const c = Math.min(delta, 0.05);
    d.time += c;
    d.levelT += c;
    const tuning = getLevelTuning(d.level);

    // ---- LEVEL TIMER ----
    // Time runs out → light dies, the dark takes you.
    if (d.levelT >= tuning.timeLimit) {
      p.playSfx('game_over');
      p.haptic?.('heavy');
      d.gameOver = true;
      setTimeout(() => p.onGameOver(Math.floor(d.score)), 500);
      return;
    }

    // ---- PLAYER MOVEMENT ----
    const stickMag = Math.hypot(p.stick.x, p.stick.y);
    if (p.stick.active && stickMag > 0.1) {
      const inv = 1 / Math.max(stickMag, 0.001);
      const dx = p.stick.x * inv;
      const dz = p.stick.y * inv;
      d.pos.x += dx * PLAYER_SPEED * c;
      d.pos.z += dz * PLAYER_SPEED * c;
      d.rot = Math.atan2(dx, dz);
      d.speed = PLAYER_SPEED;
    } else {
      d.speed *= Math.exp(-6 * c);
    }
    d.pos.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, d.pos.x));
    d.pos.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, d.pos.z));

    // ---- COLLISIONS — pillars + central altar ----
    // Push the player out of solid obstacles along the shortest axis. Cheap
    // O(N) per pillar; N is small (~28) so this is fine.
    for (const p of d.pillars) {
      // Effective collision radius: scale * base footprint + player radius.
      // Footprints by variant — these match the renderer's bottom geometry.
      const base =
        p.variant === 'dome' ? 1.15 :
        p.variant === 'cluster' ? 0.95 :
        0.70;
      const r = base * p.scale + PLAYER_RADIUS;
      const dx = d.pos.x - p.position.x;
      const dz = d.pos.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001 && dist < r) {
        const n = 1 / dist;
        d.pos.x = p.position.x + dx * n * r;
        d.pos.z = p.position.z + dz * n * r;
      }
    }
    // Altar at world origin — basin outer radius 1.35.
    {
      const ALTAR_R = 1.35 + PLAYER_RADIUS;
      const dx = d.pos.x;
      const dz = d.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001 && dist < ALTAR_R) {
        const n = 1 / dist;
        d.pos.x = dx * n * ALTAR_R;
        d.pos.z = dz * n * ALTAR_R;
      }
    }

    // ---- LIGHT RADIUS ----
    if (d.greenT > 0) d.greenT = Math.max(0, d.greenT - c);
    const currentRadius = (d.greenT > 0 ? d.lightRadius * LIGHT_GREEN_MULT : d.lightRadius);
    p.onLightRadius(currentRadius);

    // ---- EXPLORATION DEPTH SCORE ----
    const depth = Math.hypot(d.pos.x, d.pos.z);
    if (depth > d.maxDepth) {
      const dInc = depth - d.maxDepth;
      d.maxDepth = depth;
      d.score += dInc * SCORE_DEPTH_PER_UNIT;
      p.onScore(Math.floor(d.score));
      p.onDepth(Math.floor(d.maxDepth));
    }

    // ---- WALLS — age out ----
    for (let i = d.walls.length - 1; i >= 0; i--) {
      const w = d.walls[i];
      if (d.time - w.bornAt > WALL_DURATION) d.walls.splice(i, 1);
    }

    // ---- MONSTERS ----
    let nearestDist = 99;
    for (let i = d.monsters.length - 1; i >= 0; i--) {
      const m = d.monsters[i];
      const dx = d.pos.x - m.position.x;
      const dz = d.pos.z - m.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < nearestDist) nearestDist = dist;

      const strongLight = d.greenT > 0;
      const lit = dist < currentRadius;
      // The Dark Lord ignores normal light — only flees during strong
      // light (green crystal active). For regular monsters, "scared"
      // matches "lit". This is the whole gimmick of the boss.
      const scared = m.isBoss ? (strongLight && lit) : lit;

      // Walls push the monster outward
      for (const w of d.walls) {
        const wdx = m.position.x - w.position.x;
        const wdz = m.position.z - w.position.z;
        const wd = Math.hypot(wdx, wdz);
        if (wd < WALL_RADIUS + 0.6 && wd > 0.001) {
          const n = 1 / wd;
          m.position.x += wdx * n * c * 6;
          m.position.z += wdz * n * c * 6;
        }
      }

      // State machine — boss tunes (slower base, faster windup, longer
      // reach). Regular monsters get bossSpeedK=1.0 so this is a no-op.
      const bossSpeedK = m.isBoss ? 0.70 : 1.0;
      const bossTelegraphK = m.isBoss ? 0.85 : 1.0;
      const bossRangeK = m.isBoss ? 1.10 : 1.0;
      const monsterBaseSpeed = MONSTER_BASE_SPEED * tuning.monsterSpeed * bossSpeedK;
      const monsterFleeSpeed = MONSTER_FLEE_SPEED * tuning.monsterFleeSpeed * bossSpeedK;
      const myTelegraph = tuning.strikeTelegraph * bossTelegraphK;
      const myRangeMax  = tuning.strikeRangeMax  * bossRangeK;

      if (scared && m.state !== 'fleeing') {
        m.state = 'fleeing';
        m.fleeT = MONSTER_FLEE_TIME;
        m.strikeT = 0;
        emitFx(d, 'monster_flee', m.position.x, m.position.z);
        p.playSfx('monster_flee');
      }
      if (m.state === 'fleeing') {
        m.fleeT -= c;
        if (dist > 0.001) {
          const n = 1 / dist;
          m.velocity.x = -dx * n * monsterFleeSpeed;
          m.velocity.z = -dz * n * monsterFleeSpeed;
        }
        if (m.fleeT <= 0 && !scared) m.state = 'lurking';
      } else if (m.state === 'cooldown') {
        m.cooldownT -= c;
        if (dist > 0.001) {
          const n = 1 / dist;
          m.velocity.x = -dx * n * (monsterBaseSpeed * 0.35);
          m.velocity.z = -dz * n * (monsterBaseSpeed * 0.35);
        }
        if (m.cooldownT <= 0) m.state = 'lurking';
      } else if (m.state === 'lurking') {
        if (dist > MONSTER_STRIKE_RANGE_MIN + 0.4) {
          if (dist > 0.001) {
            const n = 1 / dist;
            m.velocity.x = dx * n * monsterBaseSpeed;
            m.velocity.z = dz * n * monsterBaseSpeed;
          }
        } else {
          m.velocity.x *= 0.5;
          m.velocity.z *= 0.5;
        }
        if (!scared && dist > MONSTER_STRIKE_RANGE_MIN && dist < myRangeMax) {
          m.state = 'striking';
          m.strikeT = 0;
          const inv = 1 / Math.max(dist, 0.001);
          m.strikeAimX = dx * inv;
          m.strikeAimZ = dz * inv;
          emitFx(d, 'strike_telegraph', m.position.x, m.position.z);
          p.playSfx('strike_telegraph');
        }
      } else if (m.state === 'striking') {
        m.velocity.x *= 0.85;
        m.velocity.z *= 0.85;
        m.strikeT += c;
        if (scared) {
          m.state = 'fleeing';
          m.fleeT = MONSTER_FLEE_TIME;
          m.strikeT = 0;
        } else if (m.strikeT >= myTelegraph + MONSTER_STRIKE_LIVE) {
          m.state = 'cooldown';
          m.cooldownT = tuning.strikeCooldown;
          m.strikeT = 0;
        }
      }

      if (m.state !== 'striking') {
        m.position.x += m.velocity.x * c;
        m.position.z += m.velocity.z * c;
        if (dist > 0.001) m.rotation = Math.atan2(dx, dz);
      }
      m.position.x = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.x));
      m.position.z = Math.max(-ARENA_HALF + 0.5, Math.min(ARENA_HALF - 0.5, m.position.z));

      // STRIKE HIT TEST — during the live window only
      if (m.state === 'striking' && m.strikeT >= myTelegraph) {
        const handX = m.position.x + m.strikeAimX * myRangeMax;
        const handZ = m.position.z + m.strikeAimZ * myRangeMax;
        const hdx = handX - d.pos.x;
        const hdz = handZ - d.pos.z;
        if (Math.hypot(hdx, hdz) < MONSTER_STRIKE_HIT_RADIUS && d.time > GRACE_PERIOD) {
          emitFx(d, 'strike_hit', d.pos.x, d.pos.z);
          p.playSfx('strike_hit');
          p.playSfx('game_over');
          p.haptic?.('heavy');
          p.onStrikeHit?.();
          d.gameOver = true;
          setTimeout(() => p.onGameOver(Math.floor(d.score)), 600);
          return;
        }
      }
    }
    d.nearestMonsterDist = nearestDist;

    // ---- MONSTER SPAWN OVER TIME ----
    d.monsterSpawnTimer += c;
    if (d.monsterSpawnTimer >= tuning.monsterSpawnInterval) {
      d.monsterSpawnTimer = 0;
      spawnMonster(d, tuning);
    }

    // ---- EXIT STONE PICKUP — level clear ----
    if (d.exit) {
      const ex = d.exit.position;
      const edx = ex.x - d.pos.x;
      const edz = ex.z - d.pos.z;
      if (Math.hypot(edx, edz) < EXIT_PICKUP_RADIUS) {
        // Cleared the level. Score bonus = base + time remaining * 5.
        const timeBonus = Math.max(0, Math.floor((tuning.timeLimit - d.levelT) * 5));
        const levelBonus = 100 * d.level;
        d.score += levelBonus + timeBonus;
        p.onScore(Math.floor(d.score));
        p.playSfx('pickup_green');
        p.haptic?.('heavy');
        d.levelCleared = true;
        if (d.level >= LEVELS.length) {
          d.victory = true;
        }
        return;
      }
    }

    // ---- CRYSTAL PICKUP ----
    for (let i = d.crystals.length - 1; i >= 0; i--) {
      const cr = d.crystals[i];
      const dx = cr.position.x - d.pos.x;
      const dz = cr.position.z - d.pos.z;
      if (Math.hypot(dx, dz) < CRYSTAL_PICKUP_RADIUS) {
        d.crystals.splice(i, 1);
        // Count toward this level's exit-summon threshold (any type).
        d.levelPickups++;
        maybeSummonExit(d, tuning);
        switch (cr.type) {
          case 'red':
            d.redCount++;
            d.lightRadius = Math.min(LIGHT_MAX_RADIUS, d.lightRadius + LIGHT_RED_BONUS);
            d.score += SCORE_RED;
            p.playSfx('pickup_red');
            emitFx(d, 'pickup_red', cr.position.x, cr.position.z);
            p.onPickup?.('red', SCORE_RED);
            break;
          case 'green':
            d.greenCount++;
            d.greenT = LIGHT_GREEN_DURATION;
            d.score += SCORE_GREEN;
            p.playSfx('pickup_green');
            emitFx(d, 'pickup_green', cr.position.x, cr.position.z);
            p.onPickup?.('green', SCORE_GREEN);
            break;
          case 'blue':
            d.blueCount++;
            d.score += SCORE_BLUE;
            d.walls.push({ id: nextId(), position: cr.position.clone(), bornAt: d.time });
            p.playSfx('pickup_blue');
            p.playSfx('wall_pulse');
            emitFx(d, 'pickup_blue', cr.position.x, cr.position.z);
            p.onPickup?.('blue', SCORE_BLUE);
            break;
          case 'gold':
            d.goldCount++;
            d.score += SCORE_GOLD;
            p.playSfx('pickup_gold');
            emitFx(d, 'pickup_gold', cr.position.x, cr.position.z);
            p.onPickup?.('gold', SCORE_GOLD);
            break;
        }
        p.haptic?.('light');
        p.onScore(Math.floor(d.score));
      }
    }

    // ---- CRYSTAL RESPAWN ----
    d.crystalRespawnTimer += c;
    if (d.crystalRespawnTimer >= CRYSTAL_RESPAWN_INTERVAL) {
      d.crystalRespawnTimer = 0;
      spawnCrystal(d);
    }
  });
}
