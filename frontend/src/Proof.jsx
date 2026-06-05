import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './styles/proof.css';

const API = import.meta.env.VITE_API_URL || '';
const REPO = 'https://github.com/megadeth17/agora-scout';
const short = (h) => (h ? `0x${h.replace(/^0x/, '').slice(0, 12)}…${h.slice(-8)}` : '0x…');

const MARKET = {
  BEAR: { key: 'falling', label: 'Market is falling', action: 'shift_to_safety', plain: 'Shift to safety' },
  SIDEWAYS: { key: 'calm', label: 'Market is calm', action: 'hold_balanced', plain: 'Hold balanced' },
  BULL: { key: 'rising', label: 'Market is rising', action: 'add_yield', plain: 'Add yield' },
};
const mkt = (r) => MARKET[r] || MARKET.SIDEWAYS;

const MIcon = ({ market }) => {
  if (market === 'falling') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l6 6 4-4 8 8" /><path d="M14 17h7v-7" /></svg>;
  if (market === 'rising') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>;
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 12h16" /></svg>;
};

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return '0x' + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// representative record for the in-browser hashing demo
function recordOf(reb) {
  const m = mkt(reb.trigger_regime);
  const t = reb.to_allocation || {};
  return {
    id: reb.id, market: m.key, action: m.action,
    target: { usdc_cash: Math.round(t.usdc_pct || 0) / 100, usyc_tbill: Math.round(t.usyc_pct || 0) / 100, defi_yield: Math.round(t.yield_pct || 0) / 100 },
    asset: 'USDC', network: 'arc-testnet',
  };
}

export default function Proof() {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState('verify');
  const rootRef = useRef(null);

  // verify tab (real endpoint)
  const [vState, setVState] = useState('idle');
  const [vData, setVData] = useState(null);
  const [shuffle, setShuffle] = useState('');

  // tamper tab (client side)
  const [origHash, setOrigHash] = useState(null);
  const [liveHash, setLiveHash] = useState(null);
  const [tamperBad, setTamperBad] = useState(false);
  const edRefs = useRef({});

  useEffect(() => {
    axios.get(`${API}/api/rebalances?limit=20`)
      .then(r => setRows((r.data.rebalances || []).filter(x => x.arcscan_url && x.id != null).slice(0, 8)))
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    root.querySelectorAll('.reveal').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [rows]);

  const reb = rows[sel];
  const record = reb ? recordOf(reb) : null;

  // reset state + compute original client hash when selection changes
  useEffect(() => {
    setVState('idle'); setVData(null); setLiveHash(null); setTamperBad(false);
    if (record) sha256(JSON.stringify(record)).then(h => { setOrigHash(h); setLiveHash(h); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, rows.length]);

  const runVerify = async () => {
    if (!reb || vState === 'loading') return;
    setVState('loading'); setVData(null);
    const hex = '0123456789abcdef'; let n = 0;
    const iv = setInterval(() => { let s = ''; for (let k = 0; k < 24; k++) s += hex[Math.floor(Math.random() * 16)]; setShuffle('0x' + s + '…'); if (++n > 16) clearInterval(iv); }, 42);
    try {
      const r = await axios.get(`${API}/api/verify/${reb.id}`);
      setTimeout(() => { clearInterval(iv); setVData(r.data); setVState(r.data.verified ? 'ok' : 'fail'); }, 760);
    } catch { clearInterval(iv); setVState('fail'); }
  };

  const recomputeTamper = useCallback(async () => {
    if (!record) return;
    const keys = ['usdc_cash', 'usyc_tbill', 'defi_yield'];
    const obj = JSON.parse(JSON.stringify(record));
    let ok = true;
    keys.forEach(k => {
      const el = edRefs.current[k];
      const raw = el ? el.textContent.trim() : '';
      const num = Number(raw);
      const valid = raw !== '' && !isNaN(num);
      if (el) el.classList.toggle('bad', !valid);
      if (valid) obj.target[k] = num; else ok = false;
    });
    setTamperBad(!ok);
    if (!ok) { setLiveHash(null); return; }
    setLiveHash(await sha256(JSON.stringify(obj)));
  }, [record]);

  const m = reb ? mkt(reb.trigger_regime) : MARKET.SIDEWAYS;
  const t = reb?.to_allocation || {};
  const cash = Math.round(t.usdc_pct || 0), tbill = Math.round(t.usyc_pct || 0), yld = Math.round(t.yield_pct || 0);
  const onchain = vData?.onchain_calldata || reb?.decision_hash;
  const tamperMatch = liveHash && origHash && liveHash === origHash;

  const Field = ({ k, v }) => (
    <span className="ed" contentEditable suppressContentEditableWarning spellCheck={false}
      ref={el => { if (el) edRefs.current[k] = el; }}
      onInput={recomputeTamper}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
    >{v}</span>
  );

  return (
    <div className="agora-proof" ref={rootRef}>
      <div className="bg-fx" aria-hidden="true"><div className="grid" /><div className="glow a" /><div className="glow b" /></div>

      <header className="nav">
        <div className="wrap nav-in">
          <Link className="brand" to="/"><img className="mark" src="/favicon-180.png" alt="" width={40} height={40} /><span>Agora <b className="o">Scout</b></span></Link>
          <div className="nav-right">
            <Link className="nav-back" to="/"><span className="arr">←</span><span className="txt">Back to overview</span></Link>
            <Link className="nav-cta" to="/dashboard">Live dashboard <span className="arr">→</span></Link>
          </div>
        </div>
      </header>

      <section>
        <div className="wrap hero">
          <div className="eyebrow"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>commit-then-act</div>
          <h1>Proof, not <span className="grad">promises.</span></h1>
          <p className="sub">Every decision this agent makes is stamped on Arc <b>before</b> it touches any money. That stamp can't be changed afterward, and anyone can check it. No trust required — pick a real decision below and verify it yourself.</p>
        </div>
      </section>

      <section className="wrap">
        <div className="steps reveal">
          <div className="step">
            <div className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 2.5" /></svg></div>
            <div className="st">step 01</div><h3>The agent decides</h3><p>It picks where the money should sit right now, based on what the market is doing.</p>
          </div>
          <div className="step">
            <div className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l6-6-6-6" /><path d="M12 19h8" /></svg></div>
            <div className="st">step 02</div><h3>It fingerprints the decision</h3><p>The exact decision is turned into a unique code, a <span className="hl">hash</span>. Change one detail and the code changes completely.</p>
          </div>
          <div className="step">
            <div className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></svg></div>
            <div className="st">step 03</div><h3>It anchors it on Arc</h3><p>That code is written into a public Arc transaction <span className="hl">before</span> any money moves. Permanent and public.</p>
          </div>
        </div>
      </section>

      <section className="verify">
        <div className="wrap">
          <div className="sec-head reveal">
            <h2>Verify a real decision</h2>
            <p className="note">Each check recomputes the fingerprint and matches it against the record on Arc.</p>
          </div>

          <div className="vlayout">
            {/* list */}
            <div className="dlist reveal">
              <div className="dlist-head"><span>Latest decisions</span><span>{rows.length} shown</span></div>
              {rows.map((r, i) => {
                const mm = mkt(r.trigger_regime);
                return (
                  <button key={r.id} className={`drow ${i === sel ? 'active' : ''}`} onClick={() => setSel(i)}>
                    <span className={`mdot ${mm.key}`}><MIcon market={mm.key} /></span>
                    <span className="dmid">
                      <span className="t">{mm.label} <span>· {mm.plain.toLowerCase()}</span></span>
                      <span className="s">decision #{r.id} · moved money {timeAgo(r.executed_at)}</span>
                    </span>
                    <span className="chev"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></span>
                  </button>
                );
              })}
            </div>

            {/* panel */}
            <div className="vpanel reveal">
              <div className="vp-top">
                <div className="who">
                  <span className="id">decision #{reb?.id ?? '—'}</span>
                  <span className={`mtag ${m.key}`}><MIcon market={m.key} /> {reb?.trigger_regime || '—'}</span>
                </div>
                <span className="ts">{timeAgo(reb?.executed_at)}</span>
              </div>

              <div className="vtabs">
                <button className={`vtab ${tab === 'verify' ? 'on' : ''}`} onClick={() => setTab('verify')}>Verify</button>
                <button className={`vtab ${tab === 'tamper' ? 'on' : ''}`} onClick={() => setTab('tamper')}>Tamper test<span className="tdot" /></button>
              </div>

              <div className="vp-body">
                {tab === 'verify' ? (
                  <div className="pane">
                    <div className="summ"><b>{m.label}</b><span className="arrw">→</span><b>{m.plain}</b></div>
                    <div className="alloc">
                      <div className="alloc-bar"><i className="c" style={{ width: `${cash}%` }} /><i className="t" style={{ width: `${tbill}%` }} /><i className="y" style={{ width: `${yld}%` }} /></div>
                      <div className="alloc-legend">
                        <span><i className="dot c" />USDC · Cash <b>{cash}%</b></span>
                        <span><i className="dot t" />USYC · T-Bill <b>{tbill}%</b></span>
                        <span><i className="dot y" />DeFi · Yield <b>{yld}%</b></span>
                      </div>
                    </div>
                    <div className="jlabel"><span>Decision record</span><span className="hint">a summary of what was decided</span></div>
                    {record && <div className="json"><JsonBlock record={record} /></div>}
                    <div className="hashes">
                      <div className={`hashrow ${vState === 'ok' ? 'match' : ''}`}>
                        <span className="lbl"><span className="ledge cy">⛓</span>anchored on Arc</span>
                        <span className="v">{onchain ? short(onchain) : '0x…'}</span>
                      </div>
                      <div className={`hashrow ${vState === 'ok' ? 'match' : ''}`}>
                        <span className="lbl"><span className="ledge">↻</span>recomputed</span>
                        <span className={`v ${vState === 'loading' ? 'computing' : (vData ? '' : 'dim')}`}>{vState === 'loading' ? shuffle : vData?.recomputed_hash ? short(vData.recomputed_hash) : '— not computed yet —'}</span>
                      </div>
                    </div>
                    <div className="vp-act">
                      <button className="btn btn-primary" onClick={runVerify} disabled={!reb || vState === 'loading'}>{vState === 'ok' ? 'Verified ✓' : vState === 'loading' ? 'Recomputing…' : 'Recompute & verify'} {vState !== 'ok' && <span className="arr">→</span>}</button>
                      {reb?.arcscan_url && <a className="arcscan" href={reb.arcscan_url} target="_blank" rel="noopener noreferrer">Arcscan ↗</a>}
                    </div>
                    {vState === 'ok' && <div className="verdict ok"><span className="vi">✓</span><span>Match. This decision is authentic — it was committed on-chain before any money moved.</span></div>}
                    {vState === 'fail' && <div className="verdict no"><span className="vi">✗</span><span>Couldn't confirm this one right now. Try again in a moment.</span></div>}
                  </div>
                ) : (
                  <div className="pane">
                    <p className="tamper-intro">This is the whole point. We fingerprint this decision in your browser. <b>Try to change history:</b> click a <span className="em">gold number</span> below and edit it. Watch the fingerprint instantly stop matching the original. You can't fake a decision once it's been committed.</p>
                    {record && (
                      <>
                        <div className="jlabel"><span>Editable decision</span><span className="hint">click a gold value to change it</span></div>
                        <div className="json">
                          {`{`}{'\n'}
                          {'  '}"<span className="key">id</span>": <span className="val">{record.id}</span>,{'\n'}
                          {'  '}"<span className="key">market</span>": <span className="val">"{record.market}"</span>,{'\n'}
                          {'  '}"<span className="key">action</span>": <span className="val">"{record.action}"</span>,{'\n'}
                          {'  '}"<span className="key">target</span>": {`{`}{'\n'}
                          {'    '}"<span className="key">usdc_cash</span>": <Field k="usdc_cash" v={record.target.usdc_cash} />,{'\n'}
                          {'    '}"<span className="key">usyc_tbill</span>": <Field k="usyc_tbill" v={record.target.usyc_tbill} />,{'\n'}
                          {'    '}"<span className="key">defi_yield</span>": <Field k="defi_yield" v={record.target.defi_yield} />{'\n'}
                          {'  '}{`}`},{'\n'}
                          {'  '}"<span className="key">asset</span>": <span className="val">"USDC"</span>,{'\n'}
                          {'  '}"<span className="key">network</span>": <span className="val">"arc-testnet"</span>{'\n'}
                          {`}`}
                        </div>
                        <div className="hashes">
                          <div className={`hashrow ${tamperMatch ? 'match' : ''}`}><span className="lbl"><span className="ledge cy">⛓</span>original fingerprint</span><span className="v">{short(origHash)}</span></div>
                          <div className={`hashrow ${tamperBad ? 'fail' : tamperMatch ? 'match' : 'fail'}`}><span className="lbl"><span className="ledge">⌨</span>your version</span><span className="v">{tamperBad ? '— invalid —' : short(liveHash)}</span></div>
                        </div>
                        {tamperBad ? (
                          <div className="verdict no"><span className="vi">✗</span><span>That's not a valid allocation — but even if it were, the fingerprint would no longer match.</span></div>
                        ) : tamperMatch ? (
                          <div className="verdict ok"><span className="vi">✓</span><span>Untouched — this matches the original decision. Now change a number above.</span></div>
                        ) : (
                          <div className="verdict no"><span className="vi">✗</span><span>No match. You changed the decision, so its fingerprint changed too. The version on Arc is provably different — history can't be rewritten.</span></div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="vp-foot">
                <span className="algo">SHA-256 · commit-then-act</span>
                <span>{reb ? 'on Arc testnet' : '—'}</span>
              </div>
            </div>
          </div>

          <div className="trust reveal">
            <div className="tcard"><div className="tic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg></div><div><h4>Tamper-proof by design</h4><p>Change one detail and the fingerprint changes. The one on Arc was locked in before any money moved.</p></div></div>
            <div className="tcard"><div className="tic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.2-8.5" /><path d="M21 4v5h-5" /></svg></div><div><h4>Committed before acting</h4><p>The anchor lands on Arc first. The money only moves after, never the other way around.</p></div></div>
            <div className="tcard"><div className="tic"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg></div><div><h4>Cross-check anywhere</h4><p>Every anchor has a public Arc transaction. Open it on Arcscan and confirm it independently.</p></div></div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot-in">
          <span>Built on Arc · USDC-native · Agora Agents Hackathon 2026</span>
          <nav className="links">
            <Link to="/">Overview</Link>
            <Link to="/dashboard">Dashboard</Link>
            <a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
            {reb?.arcscan_url && <a href={reb.arcscan_url} target="_blank" rel="noopener noreferrer">Arcscan</a>}
          </nav>
        </div>
      </footer>
    </div>
  );
}

function JsonBlock({ record }) {
  return (
    <>{`{`}{'\n'}
      {'  '}"<span className="key">id</span>": <span className="val">{record.id}</span>,{'\n'}
      {'  '}"<span className="key">market</span>": <span className="val">"{record.market}"</span>,{'\n'}
      {'  '}"<span className="key">action</span>": <span className="val">"{record.action}"</span>,{'\n'}
      {'  '}"<span className="key">target</span>": {`{`}{'\n'}
      {'    '}"<span className="key">usdc_cash</span>": <span className="val">{record.target.usdc_cash}</span>,{'\n'}
      {'    '}"<span className="key">usyc_tbill</span>": <span className="val">{record.target.usyc_tbill}</span>,{'\n'}
      {'    '}"<span className="key">defi_yield</span>": <span className="val">{record.target.defi_yield}</span>{'\n'}
      {'  '}{`}`},{'\n'}
      {'  '}"<span className="key">asset</span>": <span className="val">"USDC"</span>,{'\n'}
      {'  '}"<span className="key">network</span>": <span className="val">"arc-testnet"</span>{'\n'}
      {`}`}</>
  );
}

function timeAgo(ts) {
  if (!ts) return '—';
  const mn = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mn < 1) return 'just now';
  if (mn < 60) return `${mn}m ago`;
  return `${Math.floor(mn / 60)}h ago`;
}
