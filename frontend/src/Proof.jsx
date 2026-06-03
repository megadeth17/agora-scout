import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, Brain, Hash, Anchor, Check, X, Loader, ArrowRight, ExternalLink } from 'lucide-react';
import { regimeHuman } from './lib/plain';

const API = import.meta.env.VITE_API_URL || '';

const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '—');

/* ── one verifiable decision ──────────────────────────────────────────────── */

function ProofRow({ rebalance, index }) {
  const [state, setState] = useState('idle'); // idle | loading | ok | fail
  const [d, setD] = useState(null);
  const human = regimeHuman(rebalance.trigger_regime);
  const ts = rebalance.executed_at;
  const mins = ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 60000) : null;
  const ago = mins == null ? '' : mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;

  const verify = async () => {
    setState('loading');
    try {
      const r = await axios.get(`${API}/api/verify/${rebalance.id}`);
      setD(r.data);
      setState(r.data.verified ? 'ok' : 'fail');
    } catch {
      setState('fail');
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-card)',
      borderRadius: 'var(--radius-lg)', padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
      animation: 'fade-up 0.3s ease both', animationDelay: `${index * 50}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
            {human.label} <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 13 }}>· moved money {ago}</span>
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
            decision #{rebalance.id}
          </span>
        </div>
        <button
          onClick={verify}
          disabled={state === 'loading'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 15px', borderRadius: 'var(--radius-md)',
            background: state === 'ok' ? 'rgba(34,197,94,0.10)' : 'var(--grad-data)',
            color: state === 'ok' ? 'var(--bull)' : '#04121a',
            border: state === 'ok' ? '1px solid var(--border-green)' : 'none',
            cursor: state === 'loading' ? 'wait' : 'pointer',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
          }}
        >
          {state === 'loading' ? <Loader size={14} className="spin" />
            : state === 'ok' ? <Check size={14} strokeWidth={2.5} />
            : <ShieldCheck size={14} strokeWidth={2.2} />}
          {state === 'loading' ? 'Checking…' : state === 'ok' ? 'Verified' : 'Verify on-chain'}
        </button>
      </div>

      {(state === 'ok' || state === 'fail') && d && (
        <div style={{
          borderTop: '1px solid var(--border-dim)', paddingTop: 14,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <Line label="Hash recomputed from the decision" value={short(d.recomputed_hash || d.stored_hash)} />
          <Line label="Hash written on Arc (calldata)" value={short(d.onchain_calldata || d.stored_hash)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
            color: d.verified ? 'var(--bull)' : 'var(--bear)' }}>
            {d.verified ? <Check size={15} strokeWidth={2.5} /> : <X size={15} strokeWidth={2.5} />}
            {d.verified ? 'They match — the decision was not changed after it was recorded.' : 'Mismatch — could not confirm.'}
          </div>
          {d.arcscan_url && (
            <a href={d.arcscan_url} target="_blank" rel="noopener noreferrer"
               style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
              View the transaction on Arcscan <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function HowStep({ icon: Icon, title, body }) {
  return (
    <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 'var(--radius-md)',
        background: 'rgba(0,204,246,0.10)', border: '1px solid var(--border-blue)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color="var(--cyan)" strokeWidth={1.9} />
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

/* ── Proof page ───────────────────────────────────────────────────────────── */

export default function Proof() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    axios.get(`${API}/api/rebalances?limit=20`)
      .then(r => setRows((r.data.rebalances || []).filter(x => x.arcscan_url && x.id != null).slice(0, 8)))
      .catch(() => setRows([]));
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px clamp(16px,5vw,48px)', maxWidth: 960, margin: '0 auto', width: '100%',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Agora Scout" width={32} height={32} style={{ display: 'block', filter: 'drop-shadow(0 0 12px rgba(252,122,0,0.28))' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>
            <span style={{ color: 'var(--text-primary)' }}>Agora </span>
            <span style={{ background: 'linear-gradient(90deg, var(--orange), var(--gold))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Scout</span>
          </span>
        </Link>
        <Link to="/dashboard" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
          borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'var(--font-display)', fontWeight: 600,
        }}>
          Live dashboard <ArrowRight size={14} />
        </Link>
      </nav>

      {/* Hero */}
      <header style={{ maxWidth: 960, margin: '0 auto', width: '100%', padding: 'clamp(36px,6vw,72px) clamp(16px,5vw,48px) clamp(20px,3vw,36px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <ShieldCheck size={16} /> commit-then-act
        </span>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(2rem,5vw,3.4rem)', lineHeight: 1.08, letterSpacing: '-0.02em' }}>
          Proof, not{' '}
          <span style={{ background: 'var(--grad-warm)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>promises</span>.
        </h1>
        <p style={{ fontSize: 'clamp(1rem,2vw,1.2rem)', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 640 }}>
          Every decision this agent makes is stamped on Arc <em>before</em> it touches any money.
          That stamp can't be changed afterward, and anyone can check it. No trust required — pick a real decision below and verify it yourself.
        </p>
      </header>

      {/* How the proof works */}
      <section style={{ maxWidth: 960, margin: '0 auto', width: '100%', padding: 'clamp(16px,3vw,36px) clamp(16px,5vw,48px)' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <HowStep icon={Brain} title="1. The agent decides" body="It picks where the money should sit right now, based on what the market is doing." />
          <HowStep icon={Hash} title="2. It fingerprints the decision" body="The exact decision is turned into a unique code (a hash). Change one detail and the code changes completely." />
          <HowStep icon={Anchor} title="3. It anchors it on Arc" body="That code is written into a public Arc transaction before any money moves. Permanent and public." />
        </div>
      </section>

      {/* Live verifier */}
      <section style={{ maxWidth: 960, margin: '0 auto', width: '100%', padding: 'clamp(20px,4vw,44px) clamp(16px,5vw,48px) clamp(36px,6vw,64px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.3rem,3vw,1.8rem)', fontWeight: 700 }}>Verify a real decision</h2>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Each check recomputes the fingerprint and matches it against Arc.</span>
        </div>

        {rows == null ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: 24 }}>Loading recent decisions…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 14, padding: 24 }}>No anchored decisions to show yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((r, i) => <ProofRow key={r.id} rebalance={r} index={i} />)}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer style={{ marginTop: 'auto', borderTop: '1px solid var(--border-dim)', background: 'var(--bg-secondary)', textAlign: 'center', padding: '22px', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
        Built on Arc · USDC-native · Agora Agents Hackathon 2026
      </footer>
    </div>
  );
}
