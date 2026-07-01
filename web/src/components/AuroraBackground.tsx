'use client';

import { useMemo } from 'react';

/**
 * Sfondo decorativo Claupiece: blob "aurora" viola in lento drift + particelle
 * (stardust) che salgono, su un viola profondo. Eredita l'idea da LinkedinGoat
 * (là bianco/nero luxury) ma RIADATTATO al viola richiesto, e ottimizzato:
 * meno particelle, colori dai token, sotto il contenuto (zIndex 0), puramente
 * cosmetico, si spegne con prefers-reduced-motion via la media query CSS.
 */
export function AuroraBackground() {
  // 14 particelle (meno delle 18 originali → più leggero) con valori deterministici
  // così l'SSR e il client rendono identico (niente Math.random → niente hydration mismatch).
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        left: `${(i * 53) % 100}%`,
        size: 2 + ((i * 7) % 3),
        delay: (i * 1.4) % 16,
        duration: 17 + ((i * 3) % 12),
        opacity: 0.28 + ((i * 11) % 26) / 100,
      })),
    [],
  );

  return (
    <div
      aria-hidden
      data-aurora
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {/* wash a gradiente viola per profondità */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(120% 90% at 12% 6%, rgba(124,58,237,0.20) 0%, transparent 46%),' +
            'radial-gradient(100% 80% at 92% 22%, rgba(167,139,250,0.14) 0%, transparent 50%),' +
            'radial-gradient(110% 90% at 78% 100%, rgba(91,33,182,0.18) 0%, transparent 52%)',
        }}
      />

      {/* blob aurora viola */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-8%',
          width: 'clamp(360px,42vw,640px)',
          height: 'clamp(360px,42vw,640px)',
          background: 'radial-gradient(circle, rgba(139,92,246,0.28) 0%, transparent 68%)',
          filter: 'blur(52px)',
          animation: 'cp-aurora1 18s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '18%',
          right: '-12%',
          width: 'clamp(320px,38vw,560px)',
          height: 'clamp(320px,38vw,560px)',
          background: 'radial-gradient(circle, rgba(192,132,252,0.22) 0%, transparent 68%)',
          filter: 'blur(58px)',
          animation: 'cp-aurora2 22s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-12%',
          left: '30%',
          width: 'clamp(340px,40vw,600px)',
          height: 'clamp(340px,40vw,600px)',
          background: 'radial-gradient(circle, rgba(124,58,237,0.24) 0%, transparent 68%)',
          filter: 'blur(60px)',
          animation: 'cp-aurora3 26s ease-in-out infinite',
        }}
      />

      {/* particelle viola che salgono */}
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            bottom: -10,
            left: p.left,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: `rgba(196,181,253,${p.opacity})`,
            boxShadow: `0 0 8px rgba(167,139,250,${Math.min(0.6, p.opacity + 0.14)})`,
            animation: `cp-particle ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
