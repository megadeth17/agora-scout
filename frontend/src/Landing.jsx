import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Eye, Brain, ShieldCheck, ArrowRight, Check, Loader } from 'lucide-react';
import { regimeHuman, ALLOC } from './lib/plain';

const API = import.meta.env.VITE_API_URL || '';

/* ── tiny building blocks ─────────────────────────────────────────────────── */

function Pill({ children, color = 'var(--cyan)' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '6px 12px', borderRadius: 999,
      background: `${color}14`, border: `1px solid ${color}33`,
      color, fontSize: 12, fontFamily: 'var(--font-mono)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, animation: 'pulse-dot 2s infinite' }} />
      {children}
    </span>
  );
}

function StepCard({ icon: Icon, n, title, body }) {
  return (
    <div style={{
      flex: 1, minWidth: 220,
      background: 'var(--bg-card)', border: '1px solid var(--border-card)',
      borderRadius: 'var(--radius-lg)', padding: '22px 20px',
      display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--radius-md)',
          background: 'rgba(252,122,0,0.10)', border: '1px solid var(--border-orange)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={19} color="var(--orange)" strokeWidth={1.8} />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-dim)' }}>0{n}</span>
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.25 }}>{title}</h3>
      <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

/* ── "Check a decision" — live trust demo ─────────────────────────────────── */

function TrustDemo() {
  const [state, setState] = useState('idle'); // idle | loading | ok | fail | none
  const [detail, setDetail] = useState(null);

  const check = async () => {
    setState('loading');
    try {
      const list = await axios.get(`${API}/api/rebalances?limit=20`);
      const anchored = (list.data.rebalances || []).find(r => r.arcscan_url && r.id != null);
      if (!anchored) { setState('none'); return; }
      const r = await axios.get(`${API}/api/verify/${anchored.id}`);
      setDetail({ ...r.data, arcscan_url: anchored.arcscan_url });
      setState(r.data.verified ? 'ok' : 'fail');
    } catch {
      setState('fail');
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-card)',
      borderRadius: 'var(--radius-lg)', padding: '24px 22px',
      display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ShieldCheck size={20} color="var(--cyan)" strokeWidth={1.8} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>Don't trust it. Check it.</span>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
        Most AI bots ask you to just believe them. This one doesn't. Every decision gets stamped on a
        public record before any money moves, and anyone can check the stamp matches. Try it on a real one:
      </p>

      <button
        onClick={check}
        disabled={state === 'loading'}
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '11px 18px', borderRadius: 'var(--radius-md)',
          background: 'var(--grad-data)', color: '#04121a',
          border: 'none', cursor: state === 'loading' ? 'wait' : 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5,
          boxShadow: 'var(--shadow-blue)',
        }}
      >
        {state === 'loading' ? <Loader size={15} className="spin" /> : <ShieldCheck size={15} strokeWidth={2.2} />}
        {state === 'loading' ? 'Checking the record…' : 'Check a real decision'}
      </button>

      {state === 'ok' && detail && (
        <div style={{
          padding: '14px 16px', borderRadius: 'var(--radius-md)',
          background: 'rgba(34,197,94,0.08)', border: '1px solid var(--border-green)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--bull)', fontWeight: 600, fontSize: 14 }}>
            <Check size={16} strokeWidth={2.5} /> They match.
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            The decision the agent showed is exactly the one written on the public record. Nothing was changed after the fact.
          </p>
          <a href={detail.arcscan_url} target="_blank" rel="noopener noreferrer"
             style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
            See the public record yourself →
          </a>
        </div>
      )}
      {state === 'fail' && (
        <div style={{ fontSize: 13, color: 'var(--bear)' }}>Couldn't reach the record right now. Try again in a moment.</div>
      )}
      {state === 'none' && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>No on-chain decision to check yet — the agent logs one each time it moves money.</div>
      )}
    </div>
  );
}

/* ── Landing page ─────────────────────────────────────────────────────────── */

export default function Landing() {
  const [regime, setRegime] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [traction, setTraction] = useState(null);

  useEffect(() => {
    axios.get(`${API}/api/decisions?limit=1`).then(r => setRegime(r.data.decisions?.[0]?.regime || 'SIDEWAYS')).catch(() => setRegime('SIDEWAYS'));
    axios.get(`${API}/api/portfolio`).then(r => setPortfolio(r.data)).catch(() => {});
    axios.get(`${API}/api/traction`).then(r => setTraction(r.data)).catch(() => {});
  }, []);

  const human = regimeHuman(regime);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px clamp(16px, 5vw, 48px)', maxWidth: 1120, margin: '0 auto', width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Agora Scout" width={34} height={34} style={{ display: 'block', filter: 'drop-shadow(0 0 12px rgba(252,122,0,0.28))' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
            <span style={{ color: 'var(--text-primary)' }}>Agora </span>
            <span style={{ background: 'linear-gradient(90deg, var(--orange), var(--gold))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Scout</span>
          </span>
        </div>
        <Link to="/dashboard" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)',
          fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600,
        }}>
          Live dashboard <ArrowRight size={14} />
        </Link>
      </nav>

      {/* Hero */}
      <header style={{
        maxWidth: 1120, margin: '0 auto', width: '100%',
        padding: 'clamp(40px, 7vw, 88px) clamp(16px, 5vw, 48px) clamp(28px, 4vw, 48px)',
        display: 'flex', flexDirection: 'column', gap: 26, alignItems: 'flex-start',
      }}>
        {regime && (
          <Pill color={regime === 'BULL' ? 'var(--bull)' : regime === 'BEAR' ? 'var(--bear)' : 'var(--gold)'}>
            Right now · {human.label}
          </Pill>
        )}
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 'clamp(2.2rem, 5.5vw, 4.2rem)', lineHeight: 1.05, letterSpacing: '-0.02em',
          maxWidth: 920,
        }}>
          A robot that manages a pot of{' '}
          <span style={{ background: 'var(--grad-warm)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>digital dollars</span>
          {' '}— and proves every move it makes.
        </h1>
        <p style={{ fontSize: 'clamp(1rem, 2vw, 1.25rem)', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 680 }}>
          {human.mood}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/dashboard" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '13px 22px', borderRadius: 'var(--radius-md)',
            background: 'var(--grad-warm)', color: '#1a0c00',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
            boxShadow: 'var(--shadow-orange)',
          }}>
            See it live <ArrowRight size={16} strokeWidth={2.4} />
          </Link>
          <a href="#how" style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '13px 22px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15,
          }}>
            How it works
          </a>
        </div>
      </header>

      {/* How it works — 3 steps */}
      <section id="how" style={{ maxWidth: 1120, margin: '0 auto', width: '100%', padding: 'clamp(20px,4vw,48px) clamp(16px,5vw,48px)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.3rem,3vw,1.9rem)', fontWeight: 700, marginBottom: 24 }}>How it works</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <StepCard icon={Eye} n={1} title="It watches the market" body="Every 10 minutes it reads prices, big-trader activity, and where interest is being paid." />
          <StepCard icon={Brain} n={2} title="It decides what's safest" body="It works out where your money should sit right now, between cash, government bonds, and higher-interest spots." />
          <StepCard icon={ShieldCheck} n={3} title="It proves it before acting" body="Before it moves a single dollar, it writes that decision onto a public ledger so you can check it later." />
        </div>
      </section>

      {/* The money, explained */}
      <section style={{ maxWidth: 1120, margin: '0 auto', width: '100%', padding: 'clamp(20px,4vw,48px) clamp(16px,5vw,48px)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.3rem,3vw,1.9rem)', fontWeight: 700, marginBottom: 8 }}>Where the money sits</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 620, lineHeight: 1.6 }}>
          Think of it like a savings account that rebalances itself. Here's the split right now:
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {ALLOC.map(a => {
            const pct = portfolio?.[a.key];
            return (
              <div key={a.key} style={{
                flex: 1, minWidth: 200,
                background: 'var(--bg-card)', border: '1px solid var(--border-card)',
                borderRadius: 'var(--radius-lg)', padding: '20px',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16 }}>
                    {a.name} <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>({a.tag})</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, color: a.color, fontVariantNumeric: 'tabular-nums' }}>
                    {pct == null ? '—' : `${Math.round(pct)}%`}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct ?? 0}%`, background: a.color, borderRadius: 2, transition: 'width 0.6s var(--ease-out-expo, ease)' }} />
                </div>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{a.desc}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Trust demo */}
      <section style={{ maxWidth: 1120, margin: '0 auto', width: '100%', padding: 'clamp(20px,4vw,48px) clamp(16px,5vw,48px)' }}>
        <TrustDemo />
      </section>

      {/* Numbers in human terms */}
      {traction && (
        <section style={{ maxWidth: 1120, margin: '0 auto', width: '100%', padding: 'clamp(8px,2vw,24px) clamp(16px,5vw,48px) clamp(28px,5vw,56px)' }}>
          <div style={{
            display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center',
            padding: '22px 24px', borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-card)',
          }}>
            <Stat n={traction.total_decisions} label="decisions made" />
            <Stat n={traction.total_rebalances} label="times it moved money" />
            <Stat n={traction.onchain_anchored} label="logged on-chain" color="var(--cyan)" />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 280, lineHeight: 1.55 }}>
              Every move is on a public ledger. None of it is on our word alone.
            </span>
          </div>
        </section>
      )}

      {/* Footer CTA */}
      <footer style={{ marginTop: 'auto', borderTop: '1px solid var(--border-dim)', background: 'var(--bg-secondary)' }}>
        <div style={{
          maxWidth: 1120, margin: '0 auto', width: '100%',
          padding: 'clamp(28px,5vw,52px) clamp(16px,5vw,48px)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.2rem,3vw,1.7rem)', fontWeight: 700 }}>Want the full picture?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 6 }}>The live dashboard shows every decision as it happens.</p>
          </div>
          <Link to="/dashboard" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '13px 22px', borderRadius: 'var(--radius-md)',
            background: 'var(--grad-warm)', color: '#1a0c00',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, boxShadow: 'var(--shadow-orange)',
          }}>
            Open the live dashboard <ArrowRight size={16} strokeWidth={2.4} />
          </Link>
        </div>
        <div style={{ textAlign: 'center', padding: '0 0 22px', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          Built on Arc · USDC-native · Agora Agents Hackathon 2026
        </div>
      </footer>
    </div>
  );
}

function Stat({ n, label, color = 'var(--orange)' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {n ?? '—'}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</span>
    </div>
  );
}
