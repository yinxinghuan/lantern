import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Leaderboard, useGameScore } from '@shared/leaderboard';
import { Scene } from './components/Scene';
import { SplashScene } from './components/SplashScene';
import { createGameState } from './hooks/useGameLoop';
import type { SfxKey } from './hooks/useGameLoop';
import { useJoystick } from './hooks/useJoystick';
import { playSfx, startBgm, stopBgm, unlockAudio } from './utils/audio';
import { t } from './i18n';
import alteruSvg from './img/alteru.svg';
import './Lantern.less';
import './SplashScene.less';

type Phase = 'splash' | 'playing' | 'gameover';

const HIGH_KEY = 'lantern_high';

export function Lantern() {
  const [phase, setPhase] = useState<Phase>('splash');
  const [score, setScore] = useState(0);
  const [depth, setDepth] = useState(0);
  const [lightRadius, setLightRadius] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => Number(localStorage.getItem(HIGH_KEY) || 0));
  const [finalScore, setFinalScore] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

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

  const start = useCallback(async () => {
    await unlockAudio();
    stateRef.current = createGameState();
    setScore(0);
    setDepth(0);
    setLightRadius(3);
    setPhase('playing');
    startBgm(0.05);
  }, []);

  useEffect(() => () => { stopBgm(); }, []);

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
              background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) ${Math.max(14, lightRadius * 8)}%, rgba(0,0,0,0.20) ${Math.max(30, lightRadius * 14)}%, rgba(0,0,0,0.55) 80%)`,
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
