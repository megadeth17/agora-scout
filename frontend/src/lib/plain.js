// Plain-language translation layer — turns DeFi jargon into words a
// non-crypto person understands. Used by the onboarding landing page.

export const REGIME_HUMAN = {
  BULL: {
    label: 'Market is rising',
    mood: 'The market is going up, so the agent is putting a little more to work for higher returns.',
  },
  BEAR: {
    label: 'Market is falling',
    mood: 'The market is dropping, so the agent is pulling money into the safest spots.',
  },
  SIDEWAYS: {
    label: 'Market is calm',
    mood: 'The market is calm with no clear direction, so the agent is keeping most of the money safe in cash and T-bills.',
  },
};

export function regimeHuman(regime) {
  return REGIME_HUMAN[regime] || REGIME_HUMAN.SIDEWAYS;
}

// The three places the agent can hold money, in plain terms.
export const ALLOC = [
  { key: 'usdc_pct',  name: 'Cash',    tag: 'USDC', desc: 'spendable digital dollars',                 color: '#00ccf6' },
  { key: 'usyc_pct',  name: 'T-Bills', tag: 'USYC', desc: 'lending to the US government, very safe',   color: '#22c55e' },
  { key: 'yield_pct', name: 'Yield',   tag: 'DeFi', desc: 'earning interest, a little more risk',      color: '#fc7a00' },
];
