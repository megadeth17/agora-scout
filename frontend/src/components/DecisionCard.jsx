import React from 'react';
import { RegimeIndicator } from './RegimeIndicator';
import { TrendingUp, TrendingDown, Minus, Waves, ArrowUpRight } from 'lucide-react';

function AllocBar({ label, pct, color, icon }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {pct?.toFixed(1) ?? '0.0'}%
        </span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.max(pct ?? 0, 0)}%`,
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
          borderRadius: 3,
          boxShadow: `0 0 8px ${color}66`,
          transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
    </div>
  );
}

function SignalChip({ label, value, suffix = '', positive, neutral }) {
  const color = neutral
    ? 'var(--text-secondary)'
    : positive
    ? 'var(--bull)'
    : 'var(--bear)';
  const Icon = neutral ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: 'rgba(255,255,255,0.03)',
      border: 'var(--glass-border)',
      borderRadius: 'var(--radius-sm)',
      padding: '3px 8px',
      fontSize: 10,
      color,
      fontFamily: 'var(--font-mono)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <Icon size={9} strokeWidth={2} />
      {label} {value != null ? `${value > 0 ? '+' : ''}${value?.toFixed(1)}${suffix}` : '—'}
    </span>
  );
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function DecisionCard({ decision, isLatest = false }) {
  if (!decision) return null;

  const eth = decision.eth_change_24h ?? 0;
  const btc = decision.btc_change_24h ?? 0;
  const whaleSignal = decision.whale_signal ?? 'NEUTRAL';
  const whaleNeutral = whaleSignal === 'NEUTRAL';
  const whalePositive = whaleSignal === 'ACCUMULATING';

  return (
    <div style={{
      background: isLatest ? 'rgba(59,130,246,0.04)' : 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 20px',
      border: isLatest ? 'var(--border-blue)' : '1px solid var(--border-card)',
      boxShadow: isLatest ? 'var(--shadow-blue)' : 'var(--shadow-card)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      animation: 'fade-up 0.3s ease',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top accent */}
      {isLatest && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, var(--blue)88, transparent)',
        }} />
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <RegimeIndicator regime={decision.regime} compact />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isLatest && (
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              color: 'var(--blue)',
              background: 'var(--blue-dim)',
              border: '1px solid var(--border-blue)',
              borderRadius: 3,
              padding: '1px 6px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              LATEST
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {timeAgo(decision.decided_at)}
          </span>
        </div>
      </div>

      {/* Market signal chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <SignalChip label="ETH" value={eth} suffix="%" positive={eth > 0} neutral={Math.abs(eth) < 0.5} />
        <SignalChip label="BTC" value={btc} suffix="%" positive={btc > 0} neutral={Math.abs(btc) < 0.5} />
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(255,255,255,0.03)',
          border: 'var(--glass-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '3px 8px',
          fontSize: 10,
          color: whaleNeutral ? 'var(--text-secondary)' : whalePositive ? 'var(--bull)' : 'var(--bear)',
        }}>
          <Waves size={9} strokeWidth={2} />
          {whaleSignal.toLowerCase()}
        </span>
      </div>

      {/* Target allocation bars */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: 'var(--glass-border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
          Target Allocation
        </div>
        <AllocBar label="USDC — Cash"      pct={decision.recommended_usdc_pct}  color="#3b82f6" />
        <AllocBar label="USYC — T-Bill"    pct={decision.recommended_usyc_pct}  color="#22c55e" />
        <AllocBar label="DeFi — Yield"     pct={decision.recommended_yield_pct} color="#a855f7" />
      </div>

      {/* AI reasoning */}
      {decision.reasoning && (
        <p style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          lineHeight: 1.65,
          fontStyle: 'italic',
          borderLeft: '2px solid var(--border-subtle)',
          paddingLeft: 10,
        }}>
          {decision.reasoning}
        </p>
      )}

      {/* Best yield */}
      {decision.top_yield_protocol && decision.top_yield_protocol !== 'none' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 10,
          color: 'var(--text-dim)',
        }}>
          <ArrowUpRight size={11} color="#a855f7" strokeWidth={2} />
          Best yield:&nbsp;
          <span style={{ color: '#a855f7', fontWeight: 600 }}>{decision.top_yield_protocol}</span>
          &nbsp;·&nbsp;
          <span style={{ color: 'var(--bull)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {decision.top_yield_apy?.toFixed(2)}% APY
          </span>
        </div>
      )}
    </div>
  );
}
