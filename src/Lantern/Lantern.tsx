import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Leaderboard, useGameScore } from '@shared/leaderboard';
import { Scene } from './components/Scene';
import { SplashScene } from './components/SplashScene';
import { createGameState } from './hooks/useGameLoop';
import type { PickupKind, SfxKey } from './hooks/useGameLoop';
import { useJoystick } from './hooks/useJoystick';
import { playSfx, setHeartbeatRate, startBgm, stopBgm, stopHeartbeat, unlockAudio } from './utils/audio';
import { t } from './i18n';
import alteruSvg from './img/alteru.svg';
import './Lantern.less';
import './SplashScene.less';

type Phase = 'splash' | 'playing' | 'gameover';

const HIGH_KEY = 'lantern_high';

interface Pellet { id: number; kind: PickupKind; value: number; dx: number; dy: number; }

let pelletIdCounter = 1;

// One-line description of each pickup's effect — teaches the mechanic by
// showing what just happened, in plain English, on top of the score amount.
const PICKUP_LABEL: Record<PickupKind, string> = {
  gold:  'GOLD',
  red:   'LANTERN +0.5',
  green: 'STRONG LIGHT 5s',
  blue:  'WALL · 5s',
};

export function Lantern() {
  const [phase, setPhase] = useState<Phase>('splash');
  const [score, setScore] = useState(0);
  const [depth, setDepth] = useState(0);
  const [lightRadius, setLightRadius] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => Number(localStorage.getItem(HIGH_KEY) || 0));
  const [finalScore, setFinalScore] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [pellets, setPellets] = useState<Pellet[]>([]);
  const [hitFlashKey, setHitFlashKey] = useState(0);

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

  // Floating "+N" pellet feedback. Camera follows the player so pickups
  // always happen near screen-center — render pellets there with a small
  // random offset to avoid stacking on rapid pickups.
  const onPickup = useCallback((kind: PickupKind, value: number) => {
    const id = pelletIdCounter++;
    const dx = (Math.random() - 0.5) * 60;
    const dy = (Math.random() - 0.5) * 30;
    setPellets(prev => [...prev, { id, kind, value, dx, dy }]);
    window.setTimeout(() => setPellets(prev => prev.filter(p => p.id !== id)), 800);
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

  const start = useCallback(() => {
    // CRITICAL: set the playing phase synchronously BEFORE touching audio.
    // Previously we awaited unlockAudio() first, which on some mobile
    // browsers (iOS Safari especially) never resolves if the AudioContext
    // is in a weird state — the await would hang and the game never started.
    stateRef.current = createGameState();
    setScore(0);
    setDepth(0);
    setLightRadius(3);
    setPellets([]);
    setPhase('playing');
    // Fire-and-forget audio init. If it fails or hangs, gameplay still works.
    unlockAudio().then(() => startBgm(0.18)).catch(() => { /* silent */ });
  }, []);

  useEffect(() => () => { stopBgm(); stopHeartbeat(); }, []);

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
              <span className="ln__topbar-num ln__topbar-num--small">{depth}</span>
              <span className="ln__topbar-caption">DEPTH</span>
            </div>
            <div className="ln__topbar-cell ln__topbar-cell--right">
              <span className="ln__topbar-num ln__topbar-num--small">{lightRadius.toFixed(1)}</span>
              <span className="ln__topbar-caption">LANTERN</span>
            </div>
          </div>
        </div>
      )}
      {showCanvas && <img className="ln__watermark" src={alteruSvg} alt="AlterU" />}

      {/* Floating "+N" pickup pellets — anchored near screen center because
          the follow camera keeps the player there. Color per crystal type.
          The second line teaches the mechanic ("LANTERN +0.5", etc). */}
      {phase === 'playing' && pellets.length > 0 && (
        <div className="ln__pellets">
          {pellets.map(p => (
            <div
              key={p.id}
              className={`ln__pellet ln__pellet--${p.kind}`}
              style={{ left: `${p.dx}px`, top: `${p.dy}px` }}
            >
              <span className="ln__pellet-amount">+{p.value}</span>
              <span className="ln__pellet-label">{PICKUP_LABEL[p.kind]}</span>
            </div>
          ))}
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

      {phase === 'gameover' && (
        <div className="ln__gameover">
          <div className="ln__gameover-eyebrow">
            {finalScore > 0 && finalScore === highScore ? 'NEW RECORD' : 'THE DARK TOOK YOU'}
          </div>
          <div className="ln__final-score">{finalScore}</div>
          <div className="ln__final">DEPTH {depth} · LANTERN {lightRadius.toFixed(1)}</div>
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
