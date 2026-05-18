import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Leaderboard, useGameScore } from '@shared/leaderboard';
import { Scene } from './components/Scene';
import { SplashScene } from './components/SplashScene';
import { createGameState, startLevel } from './hooks/useGameLoop';
import type { PickupKind, SfxKey } from './hooks/useGameLoop';
import { getLevelTuning, LEVELS } from './constants';
import { useJoystick } from './hooks/useJoystick';
import { playSfx, setBgmTension, setHeartbeatRate, startBgm, stopBgm, stopHeartbeat, unlockAudio } from './utils/audio';
import { t } from './i18n';
import alteruSvg from './img/alteru.svg';
import './Lantern.less';
import './SplashScene.less';

type Phase = 'splash' | 'playing' | 'gameover';

const HIGH_KEY = 'lantern_high';

interface Pellet { id: number; value: number; kind: PickupKind; dx: number; dy: number; }
interface Banner { id: number; kind: PickupKind; }

let pelletIdCounter = 1;
let bannerIdCounter = 1;

// Two-line description shown in the top banner — headline (what just
// happened) + subtext (the mechanical effect). Long enough to be readable
// in 2 seconds, short enough to fit on a phone width.
const PICKUP_INFO: Record<PickupKind, { headline: string; sub: string }> = {
  gold:  { headline: 'GOLD',           sub: 'Score +10' },
  red:   { headline: 'LANTERN GROWS',  sub: '+0.5 reach · permanent' },
  green: { headline: 'STRONG LIGHT',   sub: 'Reach ×2 · 5 seconds' },
  blue:  { headline: 'REPEL ZONE',     sub: 'Pushes monsters · 5 seconds' },
};

export function Lantern() {
  const [phase, setPhase] = useState<Phase>('splash');
  const [score, setScore] = useState(0);
  const [, setDepth] = useState(0);
  const [lightRadius, setLightRadius] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => Number(localStorage.getItem(HIGH_KEY) || 0));
  const [finalScore, setFinalScore] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [pellets, setPellets] = useState<Pellet[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [hitFlashKey, setHitFlashKey] = useState(0);
  const [level, setLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(0);
  const [pickupsNow, setPickupsNow] = useState(0);
  const [exitRevealedKey, setExitRevealedKey] = useState(0);
  // Level intro overlay — appears briefly at the start of every level.
  const [levelTitle, setLevelTitle] = useState<{ level: number; name: string; key: number } | null>(null);
  // Level-clear overlay shown between levels with score bonus.
  const [clearOverlay, setClearOverlay] = useState<{ level: number; bonus: number; total: number } | null>(null);
  // Victory overlay shown after the final level is cleared.
  const [victory, setVictory] = useState(false);

  const stateRef = useRef(createGameState());
  const { stickRef, view } = useJoystick(phase === 'playing');

  const {
    isInAigram, submitScore, fetchGlobalLeaderboard, fetchFriendsLeaderboard,
  } = useGameScore('lantern');

  const haptic = useCallback((kind: 'light' | 'heavy') => {
    if (!('vibrate' in navigator)) return;
    navigator.vibrate(kind === 'heavy' ? 50 : 12);
  }, []);

  const onScore = useCallback((s: number) => setScore(s), []);
  const onDepth = useCallback((d: number) => setDepth(d), []);
  const onLightRadius = useCallback((r: number) => setLightRadius(r), []);

  // Two-channel pickup feedback:
  //   • Center pellet (~600ms): just "+N" near the player for instant
  //     "score went up" satisfaction
  //   • Top banner (~2.2s): full effect description with crystal icon so
  //     the player has time to read what the pickup actually did
  const onPickup = useCallback((kind: PickupKind, value: number) => {
    const pid = pelletIdCounter++;
    const dx = (Math.random() - 0.5) * 60;
    const dy = (Math.random() - 0.5) * 30;
    setPellets(prev => [...prev, { id: pid, kind, value, dx, dy }]);
    window.setTimeout(() => setPellets(prev => prev.filter(p => p.id !== pid)), 700);

    const bid = bannerIdCounter++;
    setBanners(prev => [...prev, { id: bid, kind }]);
    window.setTimeout(() => setBanners(prev => prev.filter(b => b.id !== bid)), 2200);
  }, []);

  const onStrikeHit = useCallback(() => {
    setHitFlashKey(k => k + 1);
  }, []);

  const onGameOver = useCallback((final: number) => {
    setFinalScore(final);
    setPhase('gameover');
    stopBgm();
    if (final > highScore) {
      localStorage.setItem(HIGH_KEY, String(final));
      setHighScore(final);
    }
    submitScore(final).catch(() => { /* silent */ });
  }, [highScore, submitScore]);

  const showLevelTitle = useCallback((lvl: number) => {
    const tuning = getLevelTuning(lvl);
    setLevelTitle({ level: lvl, name: tuning.name, key: Date.now() });
    window.setTimeout(() => setLevelTitle(null), 1700);
  }, []);

  const start = useCallback(() => {
    // CRITICAL: set the playing phase synchronously BEFORE touching audio.
    stateRef.current = createGameState();
    setScore(0);
    setDepth(0);
    setLightRadius(3);
    setLevel(1);
    setTimeLeft(getLevelTuning(1).timeLimit);
    setPellets([]);
    setBanners([]);
    setClearOverlay(null);
    setVictory(false);
    setPhase('playing');
    showLevelTitle(1);
    // Fire-and-forget audio init. If it fails or hangs, gameplay still works.
    unlockAudio().then(() => startBgm(0.18)).catch(() => { /* silent */ });
  }, [showLevelTitle]);

  useEffect(() => () => { stopBgm(); stopHeartbeat(); }, []);

  // Level state polling — drives the time-remaining HUD, the level-cleared
  // overlay between levels, and the victory state after the final level.
  useEffect(() => {
    if (phase !== 'playing') return;
    let transitioning = false;
    const id = window.setInterval(() => {
      const d = stateRef.current;
      const tuning = getLevelTuning(d.level);
      // Update the time-remaining read.
      setTimeLeft(Math.max(0, tuning.timeLimit - d.levelT));
      setLevel(d.level);
      setPickupsNow(d.levelPickups);
      // Drive the BGM eerie-melody cadence from the level's tension knob.
      setBgmTension(tuning.bgmTension);
      // Exit-summon one-shot — pulse the UI when the threshold is hit.
      if (d.exitSummonedJustNow) {
        d.exitSummonedJustNow = false;
        setExitRevealedKey(k => k + 1);
      }

      // Level cleared → show the inter-level overlay and queue the next.
      if (d.levelCleared && !transitioning) {
        transitioning = true;
        const timeBonus = Math.max(0, Math.floor((tuning.timeLimit - d.levelT) * 5));
        const levelBonus = 100 * d.level;
        const total = Math.floor(d.score);

        if (d.victory) {
          // Final level cleared — show victory screen.
          setVictory(true);
          stopBgm();
          setFinalScore(total);
          submitScore(total).catch(() => { /* silent */ });
          if (total > highScore) {
            localStorage.setItem(HIGH_KEY, String(total));
            setHighScore(total);
          }
        } else {
          setClearOverlay({ level: d.level, bonus: levelBonus + timeBonus, total });
          window.setTimeout(() => {
            setClearOverlay(null);
            startLevel(d, d.level + 1);
            showLevelTitle(d.level);
            transitioning = false;
          }, 1900);
        }
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [phase, highScore, submitScore, showLevelTitle]);

  // Drive heartbeat tempo from monster proximity. Polls 4× per second —
  // cheap, doesn't need frame-perfect sync because the audible change is
  // a slowly-ramping BPM.
  useEffect(() => {
    if (phase !== 'playing') {
      stopHeartbeat();
      return;
    }
    const id = window.setInterval(() => {
      const d = stateRef.current;
      // Nearest monster distance maps to BPM. Below ~14u: silent (no
      // threat). Right at the light-cone edge (~r): full panic (~150 bpm).
      const r = d.lightRadius;
      const dist = d.nearestMonsterDist;
      if (dist > 14) {
        setHeartbeatRate(0);
        return;
      }
      const t = Math.max(0, Math.min(1, (14 - dist) / (14 - r * 0.8)));
      const bpm = 55 + t * 95;
      setHeartbeatRate(bpm);
    }, 250);
    return () => { window.clearInterval(id); stopHeartbeat(); };
  }, [phase]);

  const showCanvas = phase !== 'splash';
  const canvasFrameloop = phase === 'playing' ? 'always' : 'demand';

  return (
    <div className="ln">
      {showCanvas && (
        <div className="ln__canvas">
          <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} frameloop={canvasFrameloop}>
            <Scene
              state={stateRef}
              playing={phase === 'playing'}
              level={level}
              stickRef={stickRef}
              onScore={onScore}
              onDepth={onDepth}
              onLightRadius={onLightRadius}
              onGameOver={onGameOver}
              onPickup={onPickup}
              onStrikeHit={onStrikeHit}
              playSfx={(k: SfxKey) => playSfx(k as never)}
              haptic={haptic}
            />
          </Canvas>
          {/* Fog-of-war overlay — radial vignette darkens everything outside
              the lantern's reach. Anchored to screen center because the
              follow camera keeps the player centered. */}
          <div
            className="ln__fog"
            style={{
              // Much softer than before — the visible darkening only kicks
              // in past 55% of the screen radius. Previous setup compounded
              // with the 3D fog and produced the "black overlay" effect the
              // user reported, especially on phone screens.
              background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) ${Math.max(40, lightRadius * 14)}%, rgba(0,0,0,0.06) ${Math.max(58, lightRadius * 18)}%, rgba(0,0,0,0.30) 90%)`,
            }}
          />
        </div>
      )}

      {showCanvas && (
        <div className="ln__hud">
          <div className="ln__topbar">
            <div className="ln__topbar-cell">
              <span className="ln__topbar-num">{score}</span>
              <span className="ln__topbar-caption">SCORE</span>
            </div>
            <div className="ln__topbar-mid">
              <span className={`ln__topbar-num ln__topbar-num--small${timeLeft < 15 ? ' ln__topbar-num--urgent' : ''}`}>
                {Math.ceil(timeLeft)}s
              </span>
              <span className="ln__topbar-caption">TIME</span>
            </div>
            <div className="ln__topbar-cell ln__topbar-cell--right">
              <span className="ln__topbar-num ln__topbar-num--small">{lightRadius.toFixed(1)}</span>
              <span className="ln__topbar-caption">LANTERN</span>
            </div>
          </div>
          {/* Level pill — sits under the topbar so the player always knows
              where they are in the run. */}
          <div className="ln__level-pill">
            <span className="ln__level-pill-num">L{level}</span>
            <span className="ln__level-pill-name">{getLevelTuning(level).name}</span>
          </div>
          {/* Exit-summon progress chip — shows how many crystals the player
              has collected toward the threshold that summons the violet
              exit stone. Disappears once the exit has been summoned. */}
          {pickupsNow < getLevelTuning(level).exitNeed && (
            <div className="ln__exit-progress">
              <span className="ln__exit-progress-dot" />
              <span className="ln__exit-progress-text">
                CRYSTALS&nbsp;<b>{pickupsNow}</b>&nbsp;/&nbsp;{getLevelTuning(level).exitNeed}&nbsp;&nbsp;·&nbsp;&nbsp;EXIT SEALED
              </span>
            </div>
          )}
          {pickupsNow >= getLevelTuning(level).exitNeed && (
            <div className="ln__exit-progress ln__exit-progress--open">
              <span className="ln__exit-progress-dot ln__exit-progress-dot--open" />
              <span className="ln__exit-progress-text">EXIT REVEALED · FIND THE VIOLET STONE</span>
            </div>
          )}
        </div>
      )}

      {/* One-shot full-screen pulse when the exit appears */}
      {exitRevealedKey > 0 && <div key={`reveal-${exitRevealedKey}`} className="ln__exit-reveal-flash" />}
      {showCanvas && <img className="ln__watermark" src={alteruSvg} alt="AlterU" />}

      {/* Floating "+N" — instant satisfaction near the player */}
      {phase === 'playing' && pellets.length > 0 && (
        <div className="ln__pellets">
          {pellets.map(p => (
            <div
              key={p.id}
              className={`ln__pellet ln__pellet--${p.kind}`}
              style={{ left: `${p.dx}px`, top: `${p.dy}px` }}
            >
              +{p.value}
            </div>
          ))}
        </div>
      )}

      {/* Pickup effect banner — slides in below the HUD, holds for ~1.6s,
          fades out. Tells the player what the pickup actually does. */}
      {phase === 'playing' && banners.length > 0 && (
        <div className="ln__banners">
          {banners.map((b, i) => {
            const info = PICKUP_INFO[b.kind];
            return (
              <div key={b.id} className={`ln__banner ln__banner--${b.kind}`} style={{ marginTop: i === 0 ? 0 : 4 }}>
                <span className="ln__banner-dot" />
                <div className="ln__banner-text">
                  <span className="ln__banner-headline">{info.headline}</span>
                  <span className="ln__banner-sub">{info.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Red strike flash — one-shot full-screen pulse when a dark hand grabs */}
      {hitFlashKey > 0 && <div key={hitFlashKey} className="ln__hit-flash" />}

      {view.active && (
        <div className="ln__joystick" style={{ left: view.ox, top: view.oy }}>
          <div className="ln__joystick__ring">
            <div className="ln__joystick__stick" style={{ transform: `translate(calc(-50% + ${view.x}px), calc(-50% + ${view.y}px))` }} />
          </div>
        </div>
      )}

      {phase === 'splash' && <SplashScene onStart={start} highScore={highScore} />}

      {/* Level intro — brief overlay at start of each level */}
      {phase === 'playing' && levelTitle && (
        <div className="ln__level-intro" key={levelTitle.key}>
          <div className="ln__level-intro-num">LEVEL {levelTitle.level}</div>
          <div className="ln__level-intro-name">{levelTitle.name}</div>
          <div className="ln__level-intro-sub">FIND THE EXIT STONE</div>
        </div>
      )}

      {/* Level cleared — between-level overlay */}
      {phase === 'playing' && clearOverlay && (
        <div className="ln__level-clear">
          <div className="ln__level-clear-eyebrow">LEVEL {clearOverlay.level} CLEARED</div>
          <div className="ln__level-clear-bonus">+{clearOverlay.bonus}</div>
          <div className="ln__level-clear-total">TOTAL · {clearOverlay.total}</div>
          <div className="ln__level-clear-next">Descending deeper…</div>
        </div>
      )}

      {/* Victory — shown after the final level is cleared */}
      {phase === 'playing' && victory && (
        <div className="ln__victory">
          <div className="ln__victory-eyebrow">YOU MADE IT OUT</div>
          <div className="ln__final-score">{finalScore}</div>
          <div className="ln__final">CLEARED ALL {LEVELS.length} LEVELS</div>
          <button className="ln__cta" onPointerDown={start}>
            {t('again')}
          </button>
          <button className="ln__leaderboard-btn" onPointerDown={() => setShowLeaderboard(true)}>
            {t('leaderboard')}
          </button>
        </div>
      )}

      {phase === 'gameover' && !victory && (
        <div className="ln__gameover">
          <div className="ln__gameover-eyebrow">
            {finalScore > 0 && finalScore === highScore ? 'NEW RECORD' : 'THE DARK TOOK YOU'}
          </div>
          <div className="ln__final-score">{finalScore}</div>
          <div className="ln__final">FAILED ON LEVEL {level} · {getLevelTuning(level).name.toUpperCase()}</div>
          <button className="ln__cta" onPointerDown={start}>
            {t('again')}
          </button>
          <button className="ln__leaderboard-btn" onPointerDown={() => setShowLeaderboard(true)}>
            {t('leaderboard')}
          </button>
        </div>
      )}

      {showLeaderboard && (
        <Leaderboard
          gameName={t('title')}
          isInAigram={isInAigram}
          onClose={() => setShowLeaderboard(false)}
          fetchGlobal={fetchGlobalLeaderboard}
          fetchFriends={fetchFriendsLeaderboard}
        />
      )}
    </div>
  );
}
