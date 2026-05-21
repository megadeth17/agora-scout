import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const REGIME_META = {
  BULL: {
    Icon: TrendingUp,
    color: 'var(--bull)',
    dim: 'var(--bull-dim)',
    border: 'rgba(34, 197, 94, 0.22)',
    shadow: 'var(--shadow-bull)',
    label: 'BULL MARKET',
    desc: 'Risk-on — rotating to DeFi yield exposure',
    gradient: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.02) 100%)',
  },
  BEAR: {
    Icon: TrendingDown,
    color: 'var(--bear)',
    dim: 'var(--bear-dim)',
    border: 'rgba(239, 68, 68, 0.22)',
    shadow: 'var(--shadow-bear)',
    label: 'BEAR MARKET',
    desc: 'Risk-off — capital rotating to USYC T-bills',
    gradient: 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)',
  },
  SIDEWAYS: {
    Icon: Minus,
    color: 'var(--sideways)',
    dim: 'var(--sideways-dim)',
    border: 'rgba(245, 158, 11, 0.22)',
    shadow: '0 0 28px rgba(245,158,11,0.14)',
    label: 'SIDEWAYS',
    desc: 'Mixed signals — balanced allocation maintained',
    gradient: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.02) 100%)',
  },
};

function ConfidenceBar({ value }) {
  const color = value >= 70 ? 'var(--bull)' : value >= 50 ? 'var(--sideways)' : 'var(--bear)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${value}%`,
          background: color,
          borderRadius: 2,
          boxShadow: `0 0 8px ${color}88`,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ fontSize: 10, color, fontFamily: 'var(--font-mono)', fontWeight: 500, minWidth: 28 }}>
        {value}%
      </span>
    </div>
  );
}

export function RegimeIndicator({ regime, confidence, compact = false }) {
  const meta = REGIME_META[regime] ?? REGIME_META.SIDEWAYS;
  const { Icon, color, dim, border, shadow, label, desc, gradient } = meta;

  if (compact) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: dim,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-sm)',
        padding: '2px 8px',
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'var(--font-display)',
        color,
        letterSpacing: '0.05em',
        animation: 'glow-pulse 3.5s ease infinite',
      }}>
        <Icon size={10} strokeWidth={2.5} />
        {regime}
      </span>
    );
  }

  return (
    <div style={{
      background: gradient,
      border: `1px solid ${border}`,
      borderRadius: 'var(--radius-lg)',
      padding: '18px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      boxShadow: shadow,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow streak */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 1,
        background: `linear-gradient(90deg, transparent, ${color}88, transparent)`,
        opacity: 0.7,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 42, height: 42,
          borderRadius: 'var(--radius-md)',
          background: dim,
          border: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={20} color={color} strokeWidth={2} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 700,
            color,
            letterSpacing: '0.04em',
            lineHeight: 1.1,
            textShadow: `0 0 24px ${color}44`,
            animation: 'glow-pulse 3.5s ease infinite',
          }}>
            {label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>{desc}</div>
        </div>
      </div>

      {confidence != null && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Signal Confidence
          </div>
          <ConfidenceBar value={confidence} />
        </div>
      )}
    </div>
  );
}
