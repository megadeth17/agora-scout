import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';
const LS_KEY = 'agora_account';
const FAUCET = 'https://faucet.circle.com';

const C = {
  bg: '#0a0e17', surface: '#121826', surface2: '#0e1320', line: '#1e2738',
  text: '#e6edf3', muted: '#8b97a8', faint: '#5a6678',
  cyan: '#22d3ee', gold: '#f5a623', green: '#34d399', red: '#f87171', usdc: '#2775ca',
};

const short = (a) => (a ? `${a.slice(0, 10)}…${a.slice(-8)}` : '—');
const usd = (n) => (n == null ? '—' : `${Number(n).toFixed(2)}`);

function loadAccount() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
}

export default function Manage() {
  const [acct, setAcct] = useState(loadAccount);          // {id, secret, deposit_address}
  const [state, setState] = useState(null);                // live on-chain state
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState('');
  const [withdrawTo, setWithdrawTo] = useState('');

  const refresh = useCallback(async (id) => {
    const aid = id ?? acct?.id;
    if (aid == null) return;
    try {
      const r = await axios.get(`${API}/api/account/${aid}`);
      setState(r.data);
    } catch { /* keep last */ }
  }, [acct]);

  useEffect(() => {
    if (acct?.id == null) return;
    refresh(acct.id);
    const i = setInterval(() => refresh(acct.id), 15000);
    return () => clearInterval(i);
  }, [acct, refresh]);

  const createAccount = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await axios.post(`${API}/api/account`, { label: '' });
      const a = { id: r.data.id, secret: r.data.secret, deposit_address: r.data.deposit_address };
      localStorage.setItem(LS_KEY, JSON.stringify(a));
      setAcct(a);
      refresh(a.id);
    } catch (e) {
      const wait = e?.response?.data?.retry_after_seconds;
      setMsg(wait ? `Easy — try again in ${wait}s.` : 'Could not create account right now.');
    } finally { setBusy(false); }
  };

  const copy = (text, what) => {
    navigator.clipboard?.writeText(text);
    setCopied(what); setTimeout(() => setCopied(''), 1500);
  };

  const doWithdraw = async () => {
    if (!withdrawTo.trim()) { setMsg('Enter a destination address.'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await axios.post(`${API}/api/account/${acct.id}/withdraw`, {
        to_address: withdrawTo.trim(), secret: acct.secret,
      });
      const n = r.data?.transfers?.length || 0;
      setMsg(n ? `Withdrawn in ${n} transfer(s). Funds sent on Arc.` : 'Nothing to withdraw.');
      setWithdrawTo('');
      setTimeout(() => refresh(acct.id), 2000);
    } catch (e) {
      setMsg(e?.response?.status === 403 ? 'Invalid secret.' : 'Withdraw failed.');
    } finally { setBusy(false); }
  };

  const reset = () => { localStorage.removeItem(LS_KEY); setAcct(null); setState(null); setMsg(null); };

  const total = state?.total_usdc ?? 0;
  const cash = state?.cash_usdc ?? 0;
  const yld = state?.yield_usdc ?? 0;
  const yldPct = state?.yield_pct_actual ?? 0;
  const safePct = total > 0 ? Math.round(100 * cash / total) : 100;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 80px' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: C.text }}>
            <img src="/favicon-180.png" alt="" width={30} height={30} style={{ borderRadius: 8 }} />
            <b style={{ fontSize: 17 }}>Agora <span style={{ color: C.gold }}>Scout</span></b>
          </Link>
          <div style={{ display: 'flex', gap: 16, fontSize: 13.5 }}>
            <Link to="/dashboard" style={{ color: C.muted, textDecoration: 'none' }}>Live agent →</Link>
          </div>
        </div>

        <h1 style={{ fontSize: 30, lineHeight: 1.15, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
          Let the agent manage <span style={{ color: C.gold }}>your USDC</span>.
        </h1>
        <p style={{ color: C.muted, fontSize: 15, margin: '0 0 26px', maxWidth: 560 }}>
          Deposit testnet USDC on Arc. The agent reads the market and rebalances your money
          between a safe bucket and yield — every move is real on-chain and verifiable.
          Withdraw anytime.
        </p>

        {!acct && (
          <div style={card()}>
            <div style={{ fontSize: 14.5, color: C.muted, marginBottom: 16 }}>
              No wallet, no signup. We create a managed account for you in one click.
            </div>
            <button onClick={createAccount} disabled={busy} style={btn(C.cyan)}>
              {busy ? 'Creating…' : 'Create my account'}
            </button>
          </div>
        )}

        {acct && (
          <>
            {/* deposit */}
            <div style={card()}>
              <Label>1 · Fund your account</Label>
              <div style={{ fontSize: 13.5, color: C.muted, marginBottom: 12 }}>
                Send Arc testnet USDC to your deposit address. The agent starts managing it within a cycle.
              </div>
              <Row k="Deposit address">
                <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{short(acct.deposit_address)}</span>
                <Mini onClick={() => copy(acct.deposit_address, 'addr')}>{copied === 'addr' ? 'copied ✓' : 'copy'}</Mini>
              </Row>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <a href={FAUCET} target="_blank" rel="noopener noreferrer" style={btn(C.usdc, true)}>Get testnet USDC ↗</a>
                <button onClick={() => refresh(acct.id)} style={btn(C.line, true)}>Refresh balance</button>
              </div>
            </div>

            {/* position */}
            <div style={card()}>
              <Label>2 · Your position {state?.live === false && <span style={{ color: C.gold }}>· agent offline</span>}</Label>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0 14px' }}>
                <span style={{ fontSize: 34, fontWeight: 700 }}>${usd(total)}</span>
                <span style={{ color: C.muted, fontSize: 14 }}>USDC managed</span>
              </div>
              <div style={{ height: 12, borderRadius: 7, overflow: 'hidden', display: 'flex', background: C.surface2, marginBottom: 10 }}>
                <div style={{ width: `${safePct}%`, background: C.cyan }} />
                <div style={{ width: `${100 - safePct}%`, background: C.gold }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span><Dot c={C.cyan} /> Safe (cash) <b>${usd(cash)}</b></span>
                <span><b>${usd(yld)}</b> Yield <Dot c={C.gold} /> <span style={{ color: C.faint }}>({yldPct}%)</span></span>
              </div>
            </div>

            {/* activity */}
            <div style={card()}>
              <Label>Agent activity</Label>
              {state?.rebalances?.length ? state.rebalances.slice(0, 6).map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
                  <span style={{ color: C.muted }}>
                    {r.direction === 'cash->yield' ? 'Moved to yield' : 'Moved to safe'} · <b style={{ color: C.text }}>{usd(r.amount_usdc)} USDC</b>
                  </span>
                  {r.arcscan_url && <a href={r.arcscan_url} target="_blank" rel="noopener noreferrer" style={{ color: C.cyan, textDecoration: 'none', fontSize: 12 }}>Arcscan ↗</a>}
                </div>
              )) : <div style={{ color: C.faint, fontSize: 13 }}>No moves yet — fund your account and the agent will rebalance on its next cycle.</div>}
            </div>

            {/* withdraw */}
            <div style={card()}>
              <Label>3 · Withdraw anytime</Label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  value={withdrawTo} onChange={(e) => setWithdrawTo(e.target.value)}
                  placeholder="0x… destination address"
                  style={{ flex: 1, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 9, padding: '10px 12px', color: C.text, fontFamily: 'monospace', fontSize: 13 }}
                />
                <button onClick={doWithdraw} disabled={busy} style={btn(C.green)}>{busy ? '…' : 'Withdraw all'}</button>
              </div>
            </div>

            {msg && <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 10, background: C.surface, border: `1px solid ${C.line}`, fontSize: 13.5, color: C.text }}>{msg}</div>}

            <div style={{ marginTop: 22, fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
              Testnet only — no real money. Your secret is stored in this browser to authorize withdrawals.
              <button onClick={reset} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', textDecoration: 'underline', marginLeft: 8, fontSize: 12 }}>Forget this account</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const card = () => ({ background: '#121826', border: '1px solid #1e2738', borderRadius: 14, padding: '18px 20px', marginBottom: 14 });
const btn = (color, ghost) => ({
  background: ghost ? 'transparent' : color, color: ghost ? '#e6edf3' : '#06121a',
  border: ghost ? `1px solid ${color}` : 'none', borderRadius: 10, padding: '10px 16px',
  fontWeight: 600, fontSize: 14, cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
});
function Label({ children }) { return <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8b97a8', marginBottom: 10 }}>{children}</div>; }
function Row({ k, children }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
    <span style={{ color: '#8b97a8', fontSize: 13 }}>{k}</span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{children}</span>
  </div>;
}
function Mini({ onClick, children }) {
  return <button onClick={onClick} style={{ background: 'transparent', border: '1px solid #1e2738', color: '#22d3ee', borderRadius: 7, padding: '3px 9px', fontSize: 12, cursor: 'pointer' }}>{children}</button>;
}
function Dot({ c }) { return <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: c, marginRight: 2 }} />; }
