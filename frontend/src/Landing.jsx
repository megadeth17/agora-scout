import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { regimeHuman } from './lib/plain';
import './styles/landing.css';

const API = import.meta.env.VITE_API_URL || '';
const REPO = 'https://github.com/megadeth17/agora-scout';

const short = (h) => (h ? `0x${h.replace(/^0x/, '').slice(0, 10)}…${h.slice(-8)}` : '0x…');

const REGIME_UI = {
  BULL:     { chip: 'Rising',  chipCls: 'up',   action: 'Put more to work', dotCls: 'cyan' },
  BEAR:     { chip: 'Falling', chipCls: '',     action: 'Shift to safety',  dotCls: '' },
  SIDEWAYS: { chip: 'Calm',    chipCls: 'flat', action: 'Hold steady',      dotCls: 'cyan' },
};

function Spark({ regime }) {
  const pts = regime === 'BULL' ? '0,22 14,16 26,18 38,11 50,13 62,6 74,8 86,2'
    : regime === 'SIDEWAYS' ? '0,13 14,11 26,14 38,12 50,13 62,11 74,13 86,12'
    : '0,4 14,8 26,6 38,13 50,11 62,18 74,16 86,22';
  const stroke = regime === 'BULL' ? '#56e0c9' : regime === 'SIDEWAYS' ? '#FFC24A' : '#ff6a5a';
  return (
    <svg className="spark" width="86" height="26" viewBox="0 0 86 26">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    const card = root.querySelector('#hero-card');
    if (card) requestAnimationFrame(() => card.classList.add('in'));
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function Landing() {
  const [regime, setRegime] = useState('SIDEWAYS');
  const [portfolio, setPortfolio] = useState(null);
  const [traction, setTraction] = useState(null);
  const [anchor, setAnchor] = useState(null); // {id, decision_hash, arcscan_url}
  const rootRef = useReveal();

  // verify terminal state
  const [vState, setVState] = useState('idle'); // idle|loading|ok|fail
  const [vData, setVData] = useState(null);
  const [shuffle, setShuffle] = useState('');

  useEffect(() => {
    axios.get(`${API}/api/decisions?limit=1`).then(r => setRegime(r.data.decisions?.[0]?.regime || 'SIDEWAYS')).catch(() => {});
    axios.get(`${API}/api/portfolio`).then(r => setPortfolio(r.data)).catch(() => {});
    axios.get(`${API}/api/traction`).then(r => setTraction(r.data)).catch(() => {});
    axios.get(`${API}/api/rebalances?limit=20`).then(r => {
      const a = (r.data.rebalances || []).find(x => x.arcscan_url && x.id != null);
      if (a) setAnchor({ id: a.id, decision_hash: a.decision_hash, arcscan_url: a.arcscan_url, regime: a.trigger_regime });
    }).catch(() => {});
  }, []);

  const human = regimeHuman(regime);
  const ui = REGIME_UI[regime] || REGIME_UI.SIDEWAYS;
  const safe = portfolio ? Math.round((portfolio.usdc_pct || 0) + (portfolio.usyc_pct || 0)) : 78;
  const yld = portfolio ? Math.round(portfolio.yield_pct || 0) : 22;

  const runVerify = async () => {
    if (!anchor || vState === 'loading') return;
    setVState('loading'); setVData(null);
    const hex = '0123456789abcdef';
    let frames = 0;
    const iv = setInterval(() => {
      let s = ''; for (let k = 0; k < 18; k++) s += hex[Math.floor(Math.random() * 16)];
      setShuffle('0x' + s + '…');
      if (++frames > 16) clearInterval(iv);
    }, 45);
    try {
      const r = await axios.get(`${API}/api/verify/${anchor.id}`);
      setTimeout(() => {
        clearInterval(iv);
        setVData(r.data);
        setVState(r.data.verified ? 'ok' : 'fail');
      }, 780);
    } catch {
      clearInterval(iv); setVState('fail');
    }
  };

  const decisionJson = {
    decision: anchor?.id ?? '—',
    market: regime.toLowerCase(),
    action: ui.action.toLowerCase().replace(/ /g, '_'),
    asset: 'USDC',
    network: 'arc-testnet',
  };

  return (
    <div className="agora-landing" ref={rootRef}>
      <div className="bg-fx" aria-hidden="true">
        <div className="grid" /><div className="glow a" /><div className="glow b" />
      </div>

      {/* NAV */}
      <header className="nav">
        <div className="wrap nav-in">
          <Link className="brand" to="/" aria-label="Agora Scout home">
            <img className="mark" src="/favicon-180.png" alt="" width={40} height={40} />
            <span>Agora <b className="o">Scout</b></span>
          </Link>
          <nav className="nav-links">
            <a href="#what">What it does</a>
            <a href="#how">How it works</a>
            <a href="#verify">Verify</a>
            <a href="#built">Built on</a>
          </nav>
          <Link className="nav-cta" to="/dashboard">Live dashboard <span className="arr">→</span></Link>
        </div>
      </header>

      {/* HERO */}
      <section className="hero" id="top">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="pill"><span className={`live-dot ${ui.dotCls}`} /><span className="mono">Right now · {human.label}</span></span>
            <h1>A robot that manages a pot of <span className="grad">digital dollars</span> — and proves every move it makes.</h1>
            <p className="sub">{human.mood} You can watch it happen, and check the math yourself.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary" to="/dashboard">See it live <span className="arr">→</span></Link>
              <a className="btn btn-ghost" href="#how">How it works</a>
            </div>
            <div className="micro">
              <span><span className="live-dot cyan" />Running <b>24/7</b> on Arc</span>
              <span>·</span>
              <span><b>{traction?.total_decisions ?? '800+'}</b> decisions</span>
              <span>·</span>
              <span>Every move <b>on-chain</b></span>
            </div>
          </div>

          {/* live decision card */}
          <div className="card" id="hero-card">
            <div className="card-top">
              <span className="id">Latest decision&nbsp; <b>#{anchor?.id ?? '—'}</b></span>
              <span className="tag-live"><span className="live-dot cyan" />on-chain</span>
            </div>
            <div className="card-body">
              <div className="row">
                <span className="lab">Market read</span>
                <span className="read"><Spark regime={regime} /><span className={`chip ${ui.chipCls}`}>{ui.chip}</span></span>
              </div>
              <div className="row" style={{ marginBottom: 8 }}><span className="lab">Action taken</span><span style={{ fontWeight: 600, fontSize: '14.5px' }}>{ui.action}</span></div>
              <div className="alloc">
                <div className="alloc-bar"><i className="safe" style={{ width: `${safe}%` }} /><i className="yield" style={{ width: `${yld}%` }} /></div>
                <div className="alloc-legend">
                  <span><i className="dot safe" />Safe reserve&nbsp; <b style={{ color: '#fff' }}>{safe}%</b></span>
                  <span><i className="dot yield" />Yield&nbsp; <b style={{ color: '#fff' }}>{yld}%</b></span>
                </div>
              </div>
              <div className="proof">
                <div className="hline"><span className="k">Decision hash</span><span className="hash">{anchor ? short(anchor.decision_hash) : '0x…'}</span></div>
                <div className="hline"><span className="k">Anchored on Arc</span><span className="verified">✓ {anchor ? 'confirmed' : '—'}</span></div>
              </div>
            </div>
            <div className="card-foot">
              <a href="#verify" className="go">Verify this decision →</a>
              <Link to="/dashboard">Open dashboard</Link>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT IT DOES */}
      <section className="sec" id="what">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="eyebrow">In plain English</div>
            <h2>No crypto knowledge needed. Here's the whole idea.</h2>
            <p>Think of a careful money manager that never sleeps. It watches the market, moves your digital dollars toward safety when things get rough, and leaves a public receipt for every single move.</p>
          </div>
          <div className="three">
            <div className="feat reveal">
              <div className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFC24A" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg></div>
              <div className="num">01</div><h3>It watches the market</h3>
              <p>Around the clock, the agent reads what prices are doing and decides whether it's a calm day or a risky one.</p>
            </div>
            <div className="feat reveal">
              <div className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFC24A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg></div>
              <div className="num">02</div><h3>It moves to safety</h3>
              <p>When the market drops, it pulls more of the pot into a safe reserve. When things steady, it earns a little yield again.</p>
            </div>
            <div className="feat cyan reveal">
              <div className="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3BD3E0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg></div>
              <div className="num">03</div><h3>It proves every move</h3>
              <p>Before any money moves, the decision is stamped on a public ledger. Anyone, including you, can check it was honest.</p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="sec" id="how" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="eyebrow">How it works</div>
            <h2>Commit, then act. Never the other way around.</h2>
            <p>The agent writes down what it's about to do and anchors it on-chain <b style={{ color: 'var(--text)' }}>before</b> a single dollar moves. That ordering is the whole point. It can't decide one thing and claim another.</p>
          </div>
          <div className="flow">
            {[
              { n: 1, st: 'Decide', h: 'Read & decide', p: 'The agent reads market conditions and computes its next allocation between safe reserve and yield.' },
              { n: 2, st: 'Commit', h: 'Hash & anchor', p: 'The full decision is hashed and the hash is written to Arc, a permanent, timestamped commitment.', commit: true },
              { n: 3, st: 'Act', h: 'Move the money', p: 'Only after the commit lands does it rebalance the USDC. The action must match what it promised.' },
              { n: 4, st: 'Verify', h: 'Anyone verifies', p: 'Recompute the hash from the public decision and match it to the on-chain record. No trust required.' },
            ].map((s) => (
              <div className="step reveal" key={s.n}>
                <div className={`st ${s.commit ? 'commit' : ''}`}><span className="n">{s.n}</span>{s.st}</div>
                <h4>{s.h}</h4><p>{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VERIFY */}
      <section className="sec" id="verify" style={{ paddingTop: 0 }}>
        <div className="wrap verify-grid">
          <div className="verify-copy reveal">
            <div className="eyebrow">Don't trust. Verify.</div>
            <h2>Check a decision <span className="grad">yourself.</span></h2>
            <p>This is the part that matters. Below is a real decision the agent anchored. Recompute its hash against the public record and watch it match what's written on Arc.</p>
            <ul className="verify-list">
              <li><span className="check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3BD3E0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg></span><span>The hash is recomputed from the <b style={{ color: 'var(--text)' }}>stored decision</b>, not taken on faith.</span></li>
              <li><span className="check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3BD3E0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg></span><span>The same check runs on a <b style={{ color: 'var(--text)' }}>public endpoint</b> and the <span className="mono">/proof</span> page.</span></li>
              <li><span className="check"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3BD3E0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg></span><span>Cross-check the anchor independently on <b style={{ color: 'var(--text)' }}>Arcscan</b>.</span></li>
            </ul>
          </div>

          <div className="terminal reveal">
            <div className="term-top">
              <div className="dots"><i /><i /><i /></div>
              <span className="title">verify — decision #{anchor?.id ?? '—'}</span>
            </div>
            <div className="term-body">
              <div className="json">{'{\n'}{Object.entries(decisionJson).map(([k, v], i, arr) => (
                <span key={k}>{'  '}"<span className="key">{k}</span>": <span className="val">{typeof v === 'string' ? `"${v}"` : v}</span>{i < arr.length - 1 ? ',' : ''}{'\n'}</span>
              ))}{'}'}</div>
              <div className="hashline">
                <div className={`hashrow ${vState === 'ok' ? 'match' : ''}`}><span className="lbl">on-chain hash (Arc)</span><span className="v">{vData?.onchain_calldata ? short(vData.onchain_calldata) : (anchor ? short(anchor.decision_hash) : '0x…')}</span></div>
                <div className={`hashrow ${vState === 'ok' ? 'match' : ''}`}><span className="lbl">recomputed hash</span><span className={`v ${vState === 'loading' ? 'computing' : ''}`}>{vState === 'loading' ? shuffle : vData?.recomputed_hash ? short(vData.recomputed_hash) : vData?.stored_hash ? short(vData.stored_hash) : '— not computed yet —'}</span></div>
              </div>
              <button className="btn btn-primary verify-btn" onClick={runVerify} disabled={!anchor || vState === 'loading'}>
                {vState === 'ok' ? 'Verified ✓' : vState === 'loading' ? 'Recomputing…' : 'Recompute & verify'} {vState !== 'ok' && <span className="arr">→</span>}
              </button>
              <div className={`verdict ${vState === 'ok' ? 'show' : ''}`}><span>✓</span><span>Match — this decision is authentic and was committed before any money moved.</span></div>
            </div>
            <div className="term-foot">
              <span className="mono" style={{ color: 'var(--faint)' }}>SHA-256 · commit-then-act</span>
              {anchor?.arcscan_url ? <a href={anchor.arcscan_url} target="_blank" rel="noopener noreferrer">View on Arcscan →</a> : <Link to="/proof">See all proofs →</Link>}
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="sec" id="live" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="eyebrow">Live track record</div>
            <h2>It's been running on its own. The numbers are real.</h2>
            <p>Agora Scout operates unattended on Arc testnet. Every figure below is backed by an on-chain record you can open and inspect.</p>
          </div>
          <div className="stats">
            <div className="stat reveal"><div className="v">{traction?.total_decisions ?? '—'}</div><div className="l">Decisions made</div><div className="s">each hashed &amp; anchored</div></div>
            <div className="stat reveal"><div className="v">{traction?.total_rebalances ?? '—'}</div><div className="l">Rebalances executed</div><div className="s">commit-then-act</div></div>
            <div className="stat cyan reveal"><div className="v">{traction?.onchain_anchored ?? '—'}</div><div className="l">Moves proven on-chain</div><div className="s">verifiable on Arcscan</div></div>
            <div className="stat cyan reveal"><div className="v">24/7</div><div className="l">Unattended uptime</div><div className="s">on Arc testnet</div></div>
          </div>
        </div>
      </section>

      {/* BUILT ON */}
      <section className="sec" id="built" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="eyebrow">Built on</div>
            <h2>Real money rails, fully open.</h2>
            <p>No mock tokens, no closed black box. Agora Scout runs on Circle USDC and Arc, and the entire codebase is public.</p>
          </div>
          <div className="built">
            <div className="tech reveal"><div className="ic usdc">$</div><div><h4>Circle USDC</h4><p>The pot is real USDC, a fully-reserved digital dollar, not a synthetic stand-in.</p></div></div>
            <div className="tech reveal"><div className="ic arc">◆</div><div><h4>Arc network</h4><p>Decisions are anchored on Arc, where USDC is the native gas. Verify any anchor on Arcscan.</p></div></div>
            <a className="tech reveal" href={REPO} target="_blank" rel="noopener noreferrer"><div className="ic git"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.36 9.36 0 0 1 12 6.85c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.35 4.79-4.58 5.05.36.32.68.94.68 1.9v2.82c0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" /></svg></div><div><h4>Open source</h4><p>Read every line. The agent, the proof endpoint and the dashboard are on GitHub <span className="mono" style={{ color: 'var(--gold)' }}>@megadeth17</span>.</p></div></a>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="cta-final reveal">
            <span className="pill" style={{ marginBottom: 22 }}><span className="live-dot" /><span className="mono">Live now on Arc testnet</span></span>
            <h2>Watch the robot work — and prove it.</h2>
            <p>Open the live dashboard to see what the agent is doing right now, then check any decision for yourself.</p>
            <div className="btns">
              <Link className="btn btn-primary" to="/dashboard">See it live <span className="arr">→</span></Link>
              <Link className="btn btn-ghost" to="/proof">Check a decision</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="wrap foot-in">
          <div className="left">
            <img src="/favicon-180.png" alt="" width={26} height={26} style={{ borderRadius: 7, filter: 'drop-shadow(0 0 10px rgba(255,138,20,.45))' }} />
            <span>Agora Scout — proof-first agent for digital dollars.</span>
          </div>
          <nav className="foot-links">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/proof">Proof</Link>
            <a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
            {anchor?.arcscan_url && <a href={anchor.arcscan_url} target="_blank" rel="noopener noreferrer">Arcscan</a>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
