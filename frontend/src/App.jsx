import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { usePortfolioData } from './hooks/usePortfolioData';
import './styles/dashboard.css';

const API = import.meta.env.VITE_API_URL || '';
const short = (h) => (h ? `0x${h.replace(/^0x/, '').slice(0, 8)}…${h.slice(-8)}` : '0x…');
const rclass = (r) => (r === 'BEAR' ? 'bear' : r === 'BULL' ? 'bull' : 'side');
const fmtPct = (n) => (n == null ? '—' : `${Math.round(n)}%`);

function timeAgo(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function MarketIcon({ regime, size = 11 }) {
  const d = regime === 'BEAR' ? 'M3 7l9 9 4-4 5 5' : regime === 'BULL' ? 'M3 17l9-9 4 4 5-5' : 'M4 12h16';
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d={d} /></svg>;
}

// Regime tag — label wrapped in a real nowrap span so the flex layout
// can never vertical-stack the text (anonymous-flex-item quirk).
function Tag({ regime }) {
  return (
    <span className={`mtag ${rclass(regime)}`}>
      <MarketIcon regime={regime} />
      <span style={{ whiteSpace: 'nowrap' }}>{regime || '—'}</span>
    </span>
  );
}

/* ---------- donut ---------- */
function Donut({ usdc, usyc, yld, total }) {
  const R = 76, C = 2 * Math.PI * R, gap = 3;
  const seg = (pct, offset) => {
    const len = Math.max(0, (pct / 100) * C - gap);
    return { strokeDasharray: `${len} ${C - len}`, strokeDashoffset: -((offset / 100) * C), transition: 'stroke-dasharray 1s var(--ease)' };
  };
  const a = usdc || 0, b = usyc || 0, c = yld || 0;
  return (
    <div className="donut-wrap">
      <svg width="188" height="188" viewBox="0 0 188 188">
        <circle cx="94" cy="94" r={R} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="20" />
        <g transform="rotate(-90 94 94)" fill="none" strokeWidth="20">
          <circle cx="94" cy="94" r={R} stroke="var(--cash)" style={seg(a, 0)} />
          <circle cx="94" cy="94" r={R} stroke="var(--tbill)" style={seg(b, a)} />
          <circle cx="94" cy="94" r={R} stroke="var(--yield)" style={seg(c, a + b)} />
        </g>
      </svg>
      <div className="donut-center"><div className="amt">${total != null ? Math.round(total) : 100}</div><div className="lbl">USDC</div></div>
    </div>
  );
}

/* ---------- per-row history verify ---------- */
function HistVerify({ id }) {
  const [s, setS] = useState('idle');
  const go = async () => {
    setS('loading');
    try { const r = await axios.get(`${API}/api/verify/${id}`); setS(r.data.verified ? 'ok' : 'fail'); }
    catch { setS('fail'); }
  };
  return (
    <button className={`vbtn ${s === 'ok' ? 'ok' : ''}`} onClick={go} disabled={s === 'loading'}>
      {s === 'loading' ? 'checking…' : s === 'ok' ? '✓ verified' : s === 'fail' ? '✗' : 'verify'}
    </button>
  );
}

/* ---------- main ---------- */
export default function App() {
  const { portfolio, decisions, rebalances, stats, liveDecision, liveMarket, refetch } = usePortfolioData();
  const [traction, setTraction] = useState(null);
  const [toast, setToast] = useState(null);
  const [running, setRunning] = useState(false);

  // verify panel
  const [vState, setVState] = useState('idle');
  const [vData, setVData] = useState(null);
  const [shuffle, setShuffle] = useState('');

  useEffect(() => {
    const f = () => axios.get(`${API}/api/traction`).then(r => setTraction(r.data)).catch(() => {});
    f(); const i = setInterval(f, 30000); return () => clearInterval(i);
  }, []);

  const latest = liveDecision ?? decisions[0] ?? null;
  const regime = latest?.regime || 'SIDEWAYS';
  const usdc = portfolio?.usdc_pct ?? 20, usyc = portfolio?.usyc_pct ?? 70, yld = portfolio?.yield_pct ?? 10;
  const safe = Math.round(usdc + usyc), risk = Math.round(yld);
  const conf = latest?.confidence ?? 55;
  const anchored = rebalances.find(r => r.arcscan_url && r.id != null);
  const moved = rebalances.find(r => r.transfer_arcscan_url);  // real native-USDC capital move
  const lastReb = rebalances[0];
  const from = lastReb?.from_allocation || {};
  const to = lastReb?.to_allocation || { usdc_pct: usdc, usyc_pct: usyc, yield_pct: yld };

  const flag = regime === 'BEAR' ? 'BEAR MARKET · RISK-OFF' : regime === 'BULL' ? 'BULL MARKET · RISK-ON' : 'SIDEWAYS · BALANCED';
  const verdictLine = regime === 'BEAR'
    ? 'The market is falling, so the agent rotated capital into cash and US T-bills.'
    : regime === 'BULL'
      ? 'The market is rising, so the agent put a little more to work for yield.'
      : 'The market is calm, so the agent keeps most of the money in cash and T-bills.';

  const showToast = (node, ms = 3000) => { setToast(node); clearTimeout(showToast._t); showToast._t = setTimeout(() => setToast(null), ms); };

  const runAgent = useCallback(async () => {
    if (running) return;
    setRunning(true);
    showToast(<><span className="sp" /><span>Agent is reading the market…</span></>, 12000);
    try {
      const r = await axios.post(`${API}/api/trigger`);
      const reg = r.data?.decision?.regime || regime;
      const moved = !!r.data?.rebalance;
      showToast(<><span style={{ color: 'var(--cyan)' }}>✓</span><span>{moved ? 'Rebalanced.' : 'No change needed.'} Market read as <b className="mono">{reg}</b>{moved ? ', decision anchored on Arc.' : ', staying the course.'}</span></>, 4200);
      await refetch();
    } catch (e) {
      const wait = e?.response?.data?.retry_after_seconds;
      showToast(<><span style={{ color: 'var(--gold)' }}>•</span><span>{wait ? `Easy — try again in ${wait}s.` : 'Could not run right now.'}</span></>, 3200);
    } finally { setRunning(false); }
  }, [running, regime, refetch]);

  // Pay-per-call: a real sub-cent USDC nanopayment on Arc triggers the agent.
  const payRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    showToast(<><span className="sp" /><span>Paying a nanopayment on Arc…</span></>, 12000);
    try {
      const r = await axios.post(`${API}/api/pay-rebalance`);
      const np = r.data?.nanopayment;
      showToast(
        <><span style={{ color: 'var(--gold)' }}>◎</span><span>Paid <b className="mono">{np?.amount_usdc} USDC</b> nanopayment, agent ran. {np?.arcscan_url && <a href={np.arcscan_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan)' }}>Arcscan ↗</a>}</span></>,
        6000,
      );
      await refetch();
    } catch (e) {
      const wait = e?.response?.data?.retry_after_seconds;
      showToast(<><span style={{ color: 'var(--gold)' }}>•</span><span>{wait ? `Easy — try again in ${wait}s.` : 'Could not pay right now.'}</span></>, 3200);
    } finally { setRunning(false); }
  }, [running, refetch]);

  const verify = async () => {
    if (!anchored || vState === 'loading') return;
    setVState('loading'); setVData(null);
    const hex = '0123456789abcdef'; let n = 0;
    const iv = setInterval(() => { let s = ''; for (let k = 0; k < 16; k++) s += hex[Math.floor(Math.random() * 16)]; setShuffle('0x' + s + '…'); if (++n > 14) clearInterval(iv); }, 45);
    try {
      const r = await axios.get(`${API}/api/verify/${anchored.id}`);
      setTimeout(() => { clearInterval(iv); setVData(r.data); setVState(r.data.verified ? 'ok' : 'fail'); }, 720);
    } catch { clearInterval(iv); setVState('fail'); }
  };

  const onchainHash = vData?.onchain_calldata || anchored?.decision_hash;
  const kpi = (v) => (v == null ? '—' : v.toLocaleString());

  return (
    <div className="agora-dash">
      <div className="bg-fx" aria-hidden="true"><div className="grid" /><div className="glow a" /><div className="glow b" /></div>

      {/* TOP BAR */}
      <div className="topbar">
        <Link className="brand" to="/">
          <img className="mark" src="/favicon-180.png" alt="" width={34} height={34} />
          <div><div className="name">Agora <b className="o">Scout</b></div><div className="sub">AI PORTFOLIO · ARC</div></div>
        </Link>
        <Link className="simple-link" to="/">✦ Simple view</Link>
        <div className="spacer" />
        <div className="kpis">
          <div className="kpi dec"><span className="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg></span><div><div className="v">{kpi(stats?.total_decisions)}</div><div className="l">Decisions</div></div></div>
          <div className="kpi reb"><span className="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg></span><div><div className="v">{kpi(stats?.total_rebalances)}</div><div className="l">Rebalances</div></div></div>
          <div className="kpi tod"><span className="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><div><div className="v">{kpi(stats?.decisions_today)}</div><div className="l">Today</div></div></div>
        </div>
        <span className="arc-pill"><span className="live-dot" /><span style={{ whiteSpace: 'nowrap' }}>Live on Arc testnet</span></span>
        <Link to="/manage" className="btn-run" style={{ textDecoration: 'none', background: 'transparent', border: '1px solid var(--cyan)', color: 'var(--cyan)' }}>Manage your USDC →</Link>
        <button type="button" className="btn-run" onClick={payRun} disabled={running} style={{ background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)' }} title="Pay a real sub-cent USDC nanopayment on Arc to run the agent">Pay &amp; run · ◎0.001</button>
        <button type="button" className="btn-run" onClick={runAgent} disabled={running}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>{running ? 'Running…' : 'Run Agent'}
        </button>
      </div>

      <div className="app">
        {/* SIDEBAR */}
        <aside className="side">
          <div className="side-head">
            <span className="t"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>Decision log</span>
            <span className="cnt">{stats?.total_decisions ?? '—'}</span>
          </div>
          <div className="log">
            {decisions.slice(0, 24).map((d, i) => {
              const a = Math.round(d.recommended_usdc_pct ?? d.usdc_pct ?? usdc);
              const b = Math.round(d.recommended_usyc_pct ?? d.usyc_pct ?? usyc);
              const c = Math.round(d.recommended_yield_pct ?? d.yield_pct ?? yld);
              return (
                <div className={`log-item ${i === 0 ? 'active' : ''}`} key={d.id ?? i}>
                  <div className="li-top">
                    <Tag regime={d.regime} />
                    {d.id != null && <span className="li-id"><b>#{d.id}</b></span>}
                  </div>
                  <div className="li-time">{timeAgo(d.decided_at)}</div>
                  <div className="seg"><i className="c" style={{ width: `${a}%` }} /><i className="t" style={{ width: `${b}%` }} /><i className="y" style={{ width: `${c}%` }} /></div>
                  <div className="li-foot"><span className="allo">{a} / {b} / {c}</span><span className="vf">✓ on-chain</span></div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* MAIN */}
        <main className="main">
          {/* STATUS ROW */}
          <div className="status-row">
            <section className="panel safe-card reveal in">
              <span className={`market-flag ${rclass(regime)}`}><span className={`live-dot ${regime === 'BEAR' ? 'red' : ''}`} /><span style={{ whiteSpace: 'nowrap' }}>{flag}</span></span>
              <div className="verdict-big">
                <div className="shield"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--safe)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg></div>
                <div>
                  <h1><span className="pct">{safe}%</span> of your money is in safe assets.</h1>
                  <p>{verdictLine} Only {risk}% stays in higher-yield DeFi.</p>
                </div>
              </div>
              <div className="safe-meter">
                <div className="bar"><i className="s" style={{ width: `${safe}%` }} /><i className="r" style={{ width: `${risk}%` }} /></div>
                <div className="lg">
                  <span><i className="dotc" style={{ background: 'var(--safe)' }} />Safe&nbsp; <b>{safe}%</b>&nbsp;<small style={{ color: 'var(--faint)' }}>cash + T-bills</small></span>
                  <span><small style={{ color: 'var(--faint)' }}>earning yield</small>&nbsp; <b>{risk}%</b>&nbsp;<i className="dotc" style={{ background: 'var(--gold)' }} /></span>
                </div>
              </div>
              <div className="conf">
                <div className="cl"><span>Signal confidence</span><b>{conf}%</b></div>
                <div className="track"><i style={{ width: `${conf}%` }} /></div>
              </div>
            </section>

            <section className="panel donut-card reveal in">
              <Donut usdc={usdc} usyc={usyc} yld={yld} total={portfolio?.total_value_usdc} />
              <div className="donut-legend">
                <div className="dl-row cash"><span className="nm"><i className="dotc" style={{ background: 'var(--cash)' }} />USDC — Cash <small>liquid</small></span><b>{fmtPct(usdc)}</b></div>
                <div className="dl-row tbill"><span className="nm"><i className="dotc" style={{ background: 'var(--tbill)' }} />USYC — T-Bill <small>safe yield</small></span><b>{fmtPct(usyc)}</b></div>
                <div className="dl-row yield"><span className="nm"><i className="dotc" style={{ background: 'var(--yield)' }} />DeFi — Yield <small>at risk</small></span><b>{fmtPct(yld)}</b></div>
              </div>
            </section>
          </div>

          {/* ACTIVE DECISION + VERIFY */}
          <section className="panel reveal in">
            <div className="p-head">
              <span className="ttl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>Active decision{latest?.id != null && <> · <span className="mono" style={{ color: 'var(--text)' }}>#{latest.id}</span></>}</span>
              <span className="meta">{timeAgo(latest?.decided_at)} · committed before acting</span>
            </div>
            <div className="dec-grid">
              <div className="dec-left">
                <div className="signals">
                  <Signal label="ETH" v={latest?.eth_change_24h} />
                  <Signal label="BTC" v={latest?.btc_change_24h} />
                  <span className="sig"><MarketIcon regime="SIDEWAYS" size={12} />Whale signal <b className="neu">{latest?.whale_signal || 'neutral'}</b></span>
                </div>
                <div className="alloc-block">
                  <AbRow cls="cash" name="USDC — Cash" from={from.usdc_pct} to={to.usdc_pct} />
                  <AbRow cls="tbill" name="USYC — T-Bill" from={from.usyc_pct} to={to.usyc_pct} />
                  <AbRow cls="yield" name="DeFi — Yield" from={from.yield_pct} to={to.yield_pct} />
                </div>
                {latest?.reasoning && (
                  <div className="reason">
                    <div className="rl"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>Why the agent did this</div>
                    <p>{latest.reasoning}</p>
                  </div>
                )}
                {latest?.top_yield_protocol && (
                  <div className="yield-note"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tbill)" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M5 9l7-7 7 7" /></svg>Best available yield: <b>{latest.top_yield_protocol}{latest.top_yield_apy != null ? ` · ${latest.top_yield_apy.toFixed(2)}% APY` : ''}</b></div>
                )}
              </div>

              <div className="dec-right">
                <div className="vbox">
                  <div className="vbox-head"><span className="live-dot" />Proof of this decision</div>
                  <div className={`vrow ${vState === 'ok' ? 'match' : ''}`}><span className="k">on-chain hash</span><span className="v">{onchainHash ? short(onchainHash) : '0x…'}</span></div>
                  <div className={`vrow ${vState === 'ok' ? 'match' : ''}`}><span className="k">recomputed</span><span className={`v ${vState === 'loading' ? 'computing' : ''}`}>{vState === 'loading' ? shuffle : vData?.recomputed_hash ? short(vData.recomputed_hash) : '— tap verify —'}</span></div>
                  <div className="vrow"><span className="k">anchored on Arc</span><span className="v anchored">✓ {anchored ? 'confirmed' : '—'}</span></div>
                  {moved && (
                    <div className="vrow"><span className="k">real USDC moved</span><span className="v anchored">{moved.transfer_amount_usdc != null ? `${moved.transfer_amount_usdc.toFixed(2)} USDC` : '✓'}{moved.transfer_direction ? ` · ${moved.transfer_direction.replace('->', ' → ')}` : ''}</span></div>
                  )}
                  <button className="btn-verify" onClick={verify} disabled={!anchored || vState === 'loading'}>{vState === 'ok' ? 'Verified ✓' : vState === 'loading' ? 'Recomputing…' : 'Recompute & verify'} {vState !== 'ok' && <span className="arr">→</span>}</button>
                  {vState === 'ok' && <div className="vverdict"><span>✓</span><span>Match. This decision was committed on-chain <b>before</b> any USDC moved — it can't be faked after the fact.</span></div>}
                  {anchored?.arcscan_url && <a className="arcscan" href={anchored.arcscan_url} target="_blank" rel="noopener noreferrer">Commit tx on Arcscan ↗</a>}
                  {moved?.transfer_arcscan_url && <a className="arcscan" href={moved.transfer_arcscan_url} target="_blank" rel="noopener noreferrer">USDC transfer on Arcscan ↗</a>}
                </div>
              </div>
            </div>
          </section>

          {/* HISTORY */}
          <section className="panel reveal in">
            <div className="p-head">
              <span className="ttl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="7" /><rect x="13" y="6" width="3" height="11" /></svg>Rebalance history</span>
              <span className="meta">{stats?.total_rebalances ?? '—'} total · every one verified</span>
            </div>
            <div className="hist">
              {rebalances.slice(0, 8).map((r, i) => {
                const f = r.from_allocation || {}, t = r.to_allocation || {};
                return (
                  <div className="hist-row" key={r.id ?? i}>
                    <div className="hl"><Tag regime={r.trigger_regime} /><span className="htime">{timeAgo(r.executed_at)}</span></div>
                    <div className="changes">
                      <Chg cls="cash" name="USDC" from={f.usdc_pct} to={t.usdc_pct} />
                      <Chg cls="tbill" name="USYC" from={f.usyc_pct} to={t.usyc_pct} />
                      <Chg cls="yield" name="YIELD" from={f.yield_pct} to={t.yield_pct} />
                    </div>
                    <div className="hv">
                      {r.arcscan_url && r.id != null ? <HistVerify id={r.id} /> : <span className="vf" style={{ color: 'var(--faint)', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{r.status}</span>}
                      {r.arcscan_url && <a href={r.arcscan_url} target="_blank" rel="noopener noreferrer">commit ↗</a>}
                      {r.transfer_arcscan_url && <a href={r.transfer_arcscan_url} target="_blank" rel="noopener noreferrer" title={r.transfer_amount_usdc != null ? `${r.transfer_amount_usdc.toFixed(2)} USDC moved` : 'USDC moved'}>💵 USDC ↗</a>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="footer-bar">
            <span>{traction?.unique_visitors ?? '—'} visitors</span><span className="sep">·</span>
            <span>{traction?.total_page_views ?? '—'} views</span><span className="sep">·</span>
            <span><b style={{ color: 'var(--text)' }}>{traction?.total_decisions ?? '—'}</b> decisions</span><span className="sep">·</span>
            <span><b style={{ color: 'var(--text)' }}>{traction?.total_rebalances ?? '—'}</b> rebalances</span><span className="sep">·</span>
            <span className="on">{traction?.onchain_anchored ?? '—'} anchored on Arc</span><span className="sep">·</span>
            <span><b style={{ color: 'var(--cyan)' }}>{traction?.total_accounts ?? '—'}</b> treasuries managed</span><span className="sep">·</span>
            <span><b style={{ color: 'var(--gold)' }}>{traction?.total_nanopayments ?? '—'}</b> nanopayments · {traction?.nanopayment_volume_usdc ?? 0} USDC</span><span className="sep">·</span>
            <span className="grad">Agora Agents Hackathon 2026</span>
          </div>
        </main>
      </div>

      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}

function Signal({ label, v }) {
  const cls = v == null ? 'neu' : v < 0 ? 'neg' : 'pos';
  const icon = v == null ? 'M4 12h16' : v < 0 ? 'M3 7l9 9 4-4 5 5' : 'M3 17l9-9 4 4 5-5';
  const color = v == null ? 'var(--muted)' : v < 0 ? 'var(--risk-red)' : 'var(--safe)';
  return <span className="sig"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"><path d={icon} /></svg>{label} <b className={cls}>{v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`}</b></span>;
}

function AbRow({ cls, name, from, to }) {
  const dotColor = cls === 'cash' ? 'var(--cash)' : cls === 'tbill' ? 'var(--tbill)' : 'var(--yield)';
  return (
    <div className={`ab-row ${cls}`}>
      <div className="ab-top">
        <span className="ab-name"><i className="dotc" style={{ background: dotColor }} />{name}</span>
        <span className="ab-val">{from != null && <span className="from">{Math.round(from)}%</span>}{from != null && <span className="arr">→</span>}{to != null ? `${Math.round(to)}%` : '—'}</span>
      </div>
      <div className="ab-track"><i style={{ width: `${to != null ? Math.round(to) : 0}%` }} /></div>
    </div>
  );
}

function Chg({ cls, name, from, to }) {
  return <span className={`chg ${cls}`}><span className="cn">{name}</span><span className="from">{from != null ? `${Math.round(from)}%` : '—'}</span><span className="ar">→</span><span className="to">{to != null ? `${Math.round(to)}%` : '—'}</span></span>;
}
