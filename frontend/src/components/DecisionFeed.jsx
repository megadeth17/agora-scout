import React from 'react';
import { Activity, Circle } from 'lucide-react';
import { RegimeIndicator } from './RegimeIndicator';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

const REGIME_ACCENT = {
  BULL:     { color: 'var(--bull)',    dot: '#22c55e' },
  BEAR:     { color: 'var(--bear)',    dot: '#ef4444' },
  SIDEWAYS: { color: 'var(--sideways)', dot: '#f59e0b' },
};

function FeedItem({ decision, isNew, isFirst }) {
  const accent = REGIME_ACCENT[decision.regime] ?? REGIME_ACCENT.SIDEWAYS;

  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '1px solid var(--border-dim)',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      animation: isNew && isFirst ? 'slide-in-left 0.28s ease' : 'none',
      background: isFirst ? 'rgba(59,130,246,0.03)' : 'transparent',
      position: 'relative',
      cursor: 'default',
    }}>
      {/* Regime indicator dot + label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: accent.dot,
            boxShadow: `0 0 6px ${accent.dot}`,
            animation: isFirst ? 'pulse-dot 2s ease infinite' : 'none',
            flexShrink: 0,
          }} />
          <RegimeIndicator regime={decision.regime} compact />
        </div>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {timeAgo(decision.decided_at)}
        </span>
      </div>

      {/* Allocation summary */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { label: 'USDC', val: decision.recommended_usdc_pct,  color: '#3b82f6' },
          { label: 'USYC', val: decision.recommended_usyc_pct,  color: '#22c55e' },
          { label: 'Yield', val: decision.recommended_yield_pct, color: '#a855f7' },
        ].map(({ label, val, color }) => (
          <span key={label} style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
            color,
            background: 'rgba(255,255,255,0.03)',
            border: 'var(--glass-border)',
            borderRadius: 3,
            padding: '1px 5px',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {label} {val?.toFixed(0)}%
          </span>
        ))}
      </div>

      {/* Confidence micro bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${decision.confidence ?? 50}%`,
          background: accent.color,
          opacity: 0.6,
          borderRadius: 1,
        }} />
      </div>
    </div>
  );
}

export function DecisionFeed({ decisions, liveDecision }) {
  const feed = decisions.slice(0, 25);

  return (
    <div style={{
      width: 226,
      flexShrink: 0,
      borderRight: '1px solid var(--border-dim)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-secondary)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px 11px',
        borderBottom: '1px solid var(--border-dim)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <Activity
          size={13}
          color="var(--blue)"
          style={{
            animation: 'pulse-dot 2.5s ease infinite',
            filter: 'drop-shadow(0 0 4px var(--blue))',
          }}
        />
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          fontFamily: 'var(--font-display)',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          Decision Log
        </span>
        {feed.length > 0 && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)',
          }}>
            {feed.length}
          </span>
        )}
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {feed.length === 0 ? (
          <div style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--text-dim)',
            fontSize: 11,
            lineHeight: 1.6,
          }}>
            <Activity size={20} color="var(--text-muted)" strokeWidth={1.5} style={{ marginBottom: 8 }} />
            <div>Agent starting up…</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>First decision in ~10s</div>
          </div>
        ) : (
          feed.map((d, i) => (
            <FeedItem
              key={d.id ?? d.decided_at ?? i}
              decision={d}
              isNew={d === liveDecision}
              isFirst={i === 0}
            />
          ))
        )}
      </div>
    </div>
  );
}
