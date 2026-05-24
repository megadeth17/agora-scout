import React, { useState } from 'react';
import { Bot, AlertTriangle, RefreshCw, Zap, BarChart2, ArrowLeftRight, Clock, TrendingUp, Users, Eye } from 'lucide-react';
import axios from 'axios';
import './styles/globals.css';
import { usePortfolioData } from './hooks/usePortfolioData';
import { AllocationChart } from './components/AllocationChart';
import { RegimeIndicator } from './components/RegimeIndicator';
import { DecisionCard } from './components/DecisionCard';
import { DecisionFeed } from './components/DecisionFeed';
import { DecisionTimeline } from './components/DecisionTimeline';

const API = import.meta.env.VITE_API_URL || '';

/* ── Traction footer ──────────────────────────────────────────────────────── */
function TractionFooter() {
  const [traction, setTraction] = React.useState(null);

  React.useEffect(() => {
    const fetch = () => {
      axios.get(`${API}/api/traction`)
        .then(r => setTraction(r.data))
        .catch(() => {});
    };
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, []);

  if (!traction) return null;
  return (
    <footer style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      padding: '6px 24px',
      borderTop: '1px solid var(--border-dim)',
      background: 'var(--bg-secondary)',
      fontSize: 9,
      color: 'var(--text-dim)',
      fontFamily: 'var(--font-mono)',
      flexShrink: 0,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Users size={10} strokeWidth={1.5} />
        {traction.unique_visitors} visitors
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Eye size={10} strokeWidth={1.5} />
        {traction.total_page_views} views
      </span>
      <span>
        {traction.total_decisions} decisions · {traction.total_rebalances} rebalances
      </span>
      {traction.onchain_anchored > 0 && (
        <span style={{ color: 'var(--bull)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {traction.onchain_anchored} anchored on Arc
        </span>
      )}
      <span style={{ color: 'var(--orange)', fontWeight: 600 }}>
        Agora Agents Hackathon 2026
      </span>
    </footer>
  );
}

/* ── Stat pill ─────────────────────────────────────────────────────────────── */
function StatPill({ label, value, color = 'var(--blue-bright)', icon: Icon }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '7px 14px',
      background: 'rgba(255,255,255,0.03)',
      border: 'var(--glass-border)',
      borderRadius: 'var(--radius-md)',
      minWidth: 100,
    }}>
      {Icon && <Icon size={13} color={color} strokeWidth={1.8} style={{ flexShrink: 0 }} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 16,
          fontWeight: 600,
          color,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}>
          {value ?? '—'}
        </span>
        <span style={{
          fontSize: 9,
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-body)',
        }}>
          {label}
        </span>
      </div>
    </div>
  );
}

/* ── Skeleton loader ────────────────────────────────────────────────────────── */
function Skeleton({ h = 12, w = '100%', radius = 4 }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: radius,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 100%)',
      backgroundSize: '400px 100%',
      animation: 'skeleton-shimmer 1.4s ease infinite',
    }} />
  );
}

function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-lg)',
      padding: 18,
      border: '1px solid var(--border-dim)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <Skeleton h={14} w="70%" />
      <Skeleton h={10} />
      <Skeleton h={10} w="85%" />
      <Skeleton h={10} w="60%" />
    </div>
  );
}

/* ── Rebalance row ─────────────────────────────────────────────────────────── */
function RebalanceRow({ rebalance, index }) {
  const from = rebalance.from_allocation ?? {};
  const to   = rebalance.to_allocation   ?? {};
  const ts   = rebalance.executed_at;
  const diff = ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 60000) : null;
  const ago  = diff == null ? '' : diff < 1 ? 'just now' : diff < 60 ? `${diff}m ago` : `${Math.floor(diff / 60)}h ago`;

  const regime = rebalance.trigger_regime ?? '—';
  const regimeColor =
    regime === 'BULL' ? 'var(--bull)' :
    regime === 'BEAR' ? 'var(--bear)' : 'var(--sideways)';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '64px 1fr 1fr 1fr auto auto',
      alignItems: 'center',
      gap: 10,
      padding: '10px 16px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-dim)',
      borderRadius: 'var(--radius-md)',
      fontSize: 11,
      animation: 'fade-up 0.25s ease',
      animationDelay: `${index * 30}ms`,
      animationFillMode: 'both',
    }}>
      {/* Regime */}
      <span style={{
        fontFamily: 'var(--font-display)',
        fontSize: 9,
        fontWeight: 700,
        color: regimeColor,
        background: `${regimeColor}14`,
        border: `1px solid ${regimeColor}40`,
        borderRadius: 3,
        padding: '2px 6px',
        letterSpacing: '0.05em',
        textAlign: 'center',
      }}>
        {regime}
      </span>

      {/* Allocations */}
      {[
        { label: 'USDC', from: from.usdc_pct, to: to.usdc_pct, color: '#3b82f6' },
        { label: 'USYC', from: from.usyc_pct, to: to.usyc_pct, color: '#22c55e' },
        { label: 'Yield', from: from.yield_pct, to: to.yield_pct, color: '#a855f7' },
      ].map(({ label, from: f, to: t, color }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{f?.toFixed(0) ?? '—'}%</span>
          <ArrowLeftRight size={9} color="var(--text-dim)" strokeWidth={1.5} />
          <span style={{ fontFamily: 'var(--font-mono)', color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{t?.toFixed(0) ?? '—'}%</span>
        </div>
      ))}

      {/* Status / on-chain proof */}
      {rebalance.arcscan_url ? (
        <a
          href={rebalance.arcscan_url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Decision anchored on Arc — ${rebalance.tx_hash}`}
          style={{
            fontSize: 9,
            color: 'var(--bull)',
            fontFamily: 'var(--font-mono)',
            textAlign: 'right',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            justifyContent: 'flex-end',
            textDecoration: 'none',
          }}
        >
          verified <ArrowLeftRight size={8} strokeWidth={2} style={{ transform: 'rotate(45deg)' }} />
        </a>
      ) : (
        <span style={{
          fontSize: 9,
          color: rebalance.status === 'executed' ? 'var(--text-secondary)' : 'var(--sideways)',
          fontFamily: 'var(--font-mono)',
          textAlign: 'right',
        }}>
          {rebalance.status}
        </span>
      )}

      {/* Time */}
      <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {ago}
      </span>
    </div>
  );
}

/* ── Market panel ──────────────────────────────────────────────────────────── */
function PriceCard({ label, price, change }) {
  const pos = change >= 0;
  const color = pos ? 'var(--bull)' : 'var(--bear)';
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-dim)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color, fontFamily: 'var(--font-mono)' }}>
          {pos ? '+' : ''}{change?.toFixed(2)}%
        </span>
      </div>
      <div style={{
        fontSize: 16,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        color: 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
      }}>
        ${price?.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </div>
      {/* Micro sparkline placeholder */}
      <div style={{ marginTop: 8, height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 1 }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, Math.abs(change ?? 0) * 8 + 40)}%`,
          background: color,
          opacity: 0.5,
          borderRadius: 1,
        }} />
      </div>
    </div>
  );
}

function YieldRow({ protocol, apy, rank }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '7px 10px',
      background: rank === 1 ? 'rgba(168,85,247,0.06)' : 'var(--bg-card)',
      border: rank === 1 ? '1px solid rgba(168,85,247,0.15)' : '1px solid var(--border-dim)',
      borderRadius: 'var(--radius-md)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {rank === 1 && <TrendingUp size={10} color="#a855f7" strokeWidth={2} />}
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{protocol}</span>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', fontFamily: 'var(--font-mono)' }}>
        {apy?.toFixed(1)}%
      </span>
    </div>
  );
}

/* ── Main App ──────────────────────────────────────────────────────────────── */
export default function App() {
  const {
    portfolio, decisions, rebalances, stats,
    loading, error, liveDecision, liveMarket, refetch,
  } = usePortfolioData();

  const [triggering, setTriggering] = useState(false);

  const triggerCycle = async () => {
    setTriggering(true);
    try {
      await axios.post(`${API}/api/trigger`);
      await refetch();
    } catch {
      // WS will push update anyway
    } finally {
      setTriggering(false);
    }
  };

  const latestDecision = liveDecision ?? decisions[0] ?? null;
  const currentRegime  = latestDecision?.regime ?? 'SIDEWAYS';
  const regimeAccent   = currentRegime === 'BULL' ? 'var(--bull)' : currentRegime === 'BEAR' ? 'var(--bear)' : 'var(--orange)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 24px',
        height: 58,
        borderBottom: '1px solid var(--border-dim)',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* Gradient accent line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${regimeAccent}88 40%, var(--blue)88 60%, transparent 100%)`,
          transition: 'background 1s ease',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--orange-dim), var(--blue-dim))',
            border: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={17} color="var(--orange)" strokeWidth={1.8} />
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.1,
              display: 'flex',
              alignItems: 'baseline',
              gap: 5,
            }}>
              <span style={{ color: 'var(--text-primary)' }}>Agora</span>
              <span style={{
                background: 'linear-gradient(90deg, var(--orange), var(--gold))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>Scout</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              AI Portfolio · Arc
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: 'var(--border-subtle)', flexShrink: 0 }} />

        {/* Stats */}
        <div style={{ display: 'flex', gap: 8, flex: 1, overflowX: 'auto', alignItems: 'center' }}>
          <StatPill icon={BarChart2}    label="Decisions"  value={stats?.total_decisions  ?? 0}  color="var(--blue-bright)" />
          <StatPill icon={ArrowLeftRight} label="Rebalances" value={stats?.total_rebalances ?? 0}  color="var(--orange)" />
          <StatPill icon={Clock}        label="Today"      value={stats?.decisions_today  ?? 0}  color="var(--text-secondary)" />
        </div>

        {/* Run agent button */}
        <button
          onClick={triggerCycle}
          disabled={triggering}
          aria-label="Trigger agent cycle"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: triggering
              ? 'rgba(249,115,22,0.06)'
              : 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(249,115,22,0.08))',
            border: '1px solid var(--border-orange)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--orange)',
            padding: '7px 14px',
            fontSize: 11,
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            cursor: triggering ? 'wait' : 'pointer',
            letterSpacing: '0.04em',
            transition: 'all var(--transition)',
            boxShadow: triggering ? 'none' : 'var(--shadow-orange)',
          }}
          onMouseEnter={e => !triggering && (e.currentTarget.style.background = 'rgba(249,115,22,0.18)')}
          onMouseLeave={e => !triggering && (e.currentTarget.style.background = 'linear-gradient(135deg, rgba(249,115,22,0.14), rgba(249,115,22,0.08))')}
        >
          {triggering
            ? <RefreshCw size={12} strokeWidth={2} className="spin" />
            : <Zap       size={12} strokeWidth={2} />
          }
          {triggering ? 'Running…' : 'Run Agent'}
        </button>
      </header>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: Decision log feed */}
        <DecisionFeed decisions={decisions} liveDecision={liveDecision} />

        {/* Center: Main content */}
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: '18px 20px',
          gap: 16,
        }}>

          {/* Error banner */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--bear)',
              fontSize: 12,
              flexShrink: 0,
            }}>
              <AlertTriangle size={13} strokeWidth={2} />
              <span>{error} — Is the backend running?</span>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <>
              {/* Row 1: Regime + Allocation */}
              <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
                <div style={{ flex: 1 }}>
                  <RegimeIndicator regime={currentRegime} confidence={latestDecision?.confidence} />
                </div>

                {/* Portfolio donut */}
                <div style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-card)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '18px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-card)',
                  backdropFilter: 'var(--glass-blur)',
                }}>
                  <AllocationChart portfolio={portfolio} size={130} />
                </div>
              </div>

              {/* Row 2: Decision timeline chart */}
              <div style={{ flexShrink: 0 }}>
                <DecisionTimeline />
              </div>

              {/* Row 3: Latest decision card */}
              {latestDecision && (
                <div style={{ flexShrink: 0 }}>
                  <DecisionCard decision={latestDecision} isLatest />
                </div>
              )}

              {/* Row 3: Rebalance history */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                  flexShrink: 0,
                }}>
                  <ArrowLeftRight size={12} color="var(--text-dim)" strokeWidth={1.5} />
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    fontFamily: 'var(--font-display)',
                  }}>
                    Rebalance History
                  </span>
                  <span style={{
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-dim)',
                    background: 'rgba(255,255,255,0.04)',
                    border: 'var(--glass-border)',
                    borderRadius: 3,
                    padding: '1px 5px',
                  }}>
                    {rebalances.length}
                  </span>
                </div>

                {rebalances.length === 0 ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingTop: 48,
                    color: 'var(--text-dim)',
                    gap: 8,
                  }}>
                    <ArrowLeftRight size={24} strokeWidth={1.2} />
                    <div style={{ fontSize: 12 }}>No rebalances yet</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Agent will rebalance when drift ≥ 5%</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {rebalances.map((r, i) => (
                      <RebalanceRow key={r.id ?? i} rebalance={r} index={i} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        {/* Right: Market signals */}
        {liveMarket && (
          <aside style={{
            width: 196,
            flexShrink: 0,
            borderLeft: '1px solid var(--border-dim)',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            background: 'var(--bg-secondary)',
          }}>
            {/* Header */}
            <div style={{
              padding: '12px 14px 10px',
              borderBottom: '1px solid var(--border-dim)',
              fontSize: 10,
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Market Signals
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Prices */}
              {liveMarket.prices && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                    Prices · 24h
                  </div>
                  <PriceCard label="ETH" price={liveMarket.prices.eth} change={liveMarket.prices.eth_change} />
                  <PriceCard label="BTC" price={liveMarket.prices.btc} change={liveMarket.prices.btc_change} />
                </div>
              )}

              {/* Top yields */}
              {liveMarket.top_yields?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                    Top USDC Yields
                  </div>
                  {liveMarket.top_yields.map((y, i) => (
                    <YieldRow key={i} rank={i + 1} protocol={y.protocol} apy={y.apy} />
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Traction footer */}
      <TractionFooter />

      {/* Spin animation */}
      <style>{`
        .spin { animation: spin 0.9s linear infinite; }
      `}</style>
    </div>
  );
}
