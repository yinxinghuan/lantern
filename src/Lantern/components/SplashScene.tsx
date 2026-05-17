// Pure SVG/CSS splash. No 3D Canvas → safe to mount during preload.
// Minimal by design: just sky, drifting snow, and a row of iceberg silhouettes
// in the foreground. The motion is provided by the falling snowflakes and a
// slow parallax shift on the iceberg row.
import { useState } from 'react';
import { t } from '../i18n';

interface Snowflake {
  id: number;
  x: number;        // 0..100 (%)
  delay: number;    // s
  duration: number; // s
  size: number;     // px
}

export function SplashScene({ onStart, highScore }: { onStart: () => void; highScore: number }) {
  const [snow] = useState<Snowflake[]>(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: -Math.random() * 10,
      duration: 7 + Math.random() * 9,
      size: 2 + Math.random() * 6,
    }))
  );

  return (
    <div className="ln-splash">
      <div className="ln-splash__sky" />
      <div className="ln-splash__aurora" />

      {/* Drifting snow */}
      <div className="ln-splash__snow">
        {snow.map(f => (
          <div
            key={f.id}
            className="ln-splash__flake"
            style={{
              left: `${f.x}%`,
              width: `${f.size}px`,
              height: `${f.size}px`,
              animationDelay: `${f.delay}s`,
              animationDuration: `${f.duration}s`,
            }}
          />
        ))}
      </div>

      {/* Ice plane sits below the icebergs so they appear to be resting on it */}
      <div className="ln-splash__ice" />

      {/* Iceberg silhouettes — back row drifts slowly, front row stationary.
          Each iceberg sits on a dark wet-ice ellipse so its base reads as
          attached to the snow surface rather than floating above it. */}
      <div className="ln-splash__icebergs ln-splash__icebergs--back">
        <svg viewBox="0 0 1200 220" preserveAspectRatio="none" width="200%" height="100%">
          <ellipse cx="130"  cy="198" rx="95"  ry="6" fill="#1f3d5a" opacity=".55" />
          <ellipse cx="290"  cy="198" rx="85"  ry="6" fill="#1f3d5a" opacity=".55" />
          <ellipse cx="460"  cy="198" rx="100" ry="7" fill="#1f3d5a" opacity=".6"  />
          <ellipse cx="620"  cy="198" rx="80"  ry="6" fill="#1f3d5a" opacity=".55" />
          <ellipse cx="780"  cy="198" rx="100" ry="7" fill="#1f3d5a" opacity=".6"  />
          <ellipse cx="950"  cy="198" rx="85"  ry="6" fill="#1f3d5a" opacity=".55" />
          <ellipse cx="1100" cy="198" rx="90"  ry="6" fill="#1f3d5a" opacity=".6"  />
          <polygon fill="#1f3d5a" points="40,200 130,80 220,200" />
          <polygon fill="#1f3d5a" points="200,200 290,130 380,200" />
          <polygon fill="#1f3d5a" points="360,200 460,60 560,200" />
          <polygon fill="#1f3d5a" points="540,200 620,150 700,200" />
          <polygon fill="#1f3d5a" points="680,200 780,100 880,200" />
          <polygon fill="#1f3d5a" points="860,200 950,150 1040,200" />
          <polygon fill="#1f3d5a" points="1020,200 1100,90 1180,200" />
        </svg>
      </div>
      <div className="ln-splash__icebergs ln-splash__icebergs--front">
        <svg viewBox="0 0 800 210" preserveAspectRatio="none" width="100%" height="100%">
          {/* wet bases — dark navy ellipses anchor each iceberg to the ice */}
          <ellipse cx="60"  cy="200" rx="115" ry="8" fill="#1c3650" opacity=".85" />
          <ellipse cx="220" cy="200" rx="115" ry="8" fill="#1c3650" opacity=".85" />
          <ellipse cx="380" cy="200" rx="105" ry="8" fill="#1c3650" opacity=".85" />
          <ellipse cx="530" cy="200" rx="115" ry="9" fill="#1c3650" opacity=".85" />
          <ellipse cx="690" cy="200" rx="110" ry="8" fill="#1c3650" opacity=".85" />
          <ellipse cx="830" cy="200" rx="95"  ry="8" fill="#1c3650" opacity=".85" />
          {/* foreground steel-blue icebergs with bright snow peaks */}
          <polygon fill="#6996b6" points="-30,200 60,90 150,200" />
          <polygon fill="#f4fbff" points="20,140 60,90 100,140" />
          <polygon fill="#6996b6" points="130,200 220,70 310,200" />
          <polygon fill="#f4fbff" points="180,120 220,70 260,120" />
          <polygon fill="#6996b6" points="290,200 380,110 460,200" />
          <polygon fill="#f4fbff" points="345,150 380,110 415,150" />
          <polygon fill="#6996b6" points="440,200 530,60 620,200" />
          <polygon fill="#f4fbff" points="490,100 530,60 570,100" />
          <polygon fill="#6996b6" points="600,200 690,100 780,200" />
          <polygon fill="#f4fbff" points="650,140 690,100 730,140" />
          <polygon fill="#6996b6" points="760,200 830,130 900,200" />
        </svg>
      </div>

      {/* foreground content */}
      <div className="ln-splash__content">
        <h1 className="ln-splash__title">
          <span className="ln-splash__title-emph">Lan</span>
          <span className="ln-splash__title-emph ln-splash__title-emph--accent">tern</span>
        </h1>
        <p className="ln-splash__subtitle">{t('subtitle')}</p>

        {highScore > 0 && (
          <div className="ln-splash__best">
            <span className="ln-splash__best-label">BEST</span>
            <span className="ln-splash__best-value">{highScore}</span>
          </div>
        )}

        <button className="ln-splash__cta" onPointerDown={onStart}>
          <span className="ln-splash__cta-text">{t('tap_to_start')}</span>
          <span className="ln-splash__cta-pulse" aria-hidden />
        </button>
      </div>
    </div>
  );
}
