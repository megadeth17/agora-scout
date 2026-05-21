import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const SLICES = [
  { key: 'usdc_pct',  name: 'USDC',  label: 'USDC · Cash',         color: '#3b82f6' },
  { key: 'usyc_pct',  name: 'USYC',  label: 'USYC · T-Bill',       color: '#22c55e' },
  { key: 'yield_pct', name: 'Yield', label: 'DeFi · Yield',         color: '#a855f7' },
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const slice = SLICES.find(s => s.name === name);
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: 'var(--glass-border)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 14px',
      fontSize: 12,
      boxShadow: 'var(--shadow-card)',
      backdropFilter: 'blur(12px)',
    }}>
      <span style={{ color: slice?.color ?? '#fff' }}>{name}</span>
      {' '}
      <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
};

function LegendItem({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 16,
        fontWeight: 600,
        color,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
      }}>
        {value.toFixed(0)}%
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
        {label}
      </div>
    </div>
  );
}

export function AllocationChart({ portfolio, size = 130 }) {
  const values = SLICES.map(s => ({
    ...s,
    value: portfolio?.[s.key] ?? (s.key === 'usdc_pct' ? 100 : 0),
  })).filter(d => d.value > 0.1);

  const totalUSDC = portfolio?.total_value_usdc;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      {/* Donut chart */}
      <div style={{ position: 'relative', width: size, height: size }}>
        <ResponsiveContainer width={size} height={size}>
          <PieChart>
            <Pie
              data={values}
              cx="50%"
              cy="50%"
              innerRadius={size * 0.32}
              outerRadius={size * 0.47}
              strokeWidth={1.5}
              stroke="var(--bg-void)"
              dataKey="value"
              animationBegin={0}
              animationDuration={600}
            >
              {values.map(entry => (
                <Cell key={entry.key} fill={entry.color} fillOpacity={0.88} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {totalUSDC != null && (
            <>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                ${totalUSDC.toFixed(0)}
              </span>
              <span style={{ fontSize: 8, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>USDC</span>
            </>
          )}
        </div>
      </div>

      {/* Legend pills */}
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
        {SLICES.map(s => (
          <LegendItem
            key={s.key}
            label={s.label}
            value={portfolio?.[s.key] ?? (s.key === 'usdc_pct' ? 100 : 0)}
            color={s.color}
          />
        ))}
      </div>
    </div>
  );
}
