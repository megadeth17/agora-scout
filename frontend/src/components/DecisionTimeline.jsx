import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Activity } from 'lucide-react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';

const REGIME_COLORS = {
  BULL: '#22c55e',
  BEAR: '#ef4444',
  SIDEWAYS: '#f59e0b',
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const regime = d.regime ?? 'SIDEWAYS';
  const color = REGIME_COLORS[regime] ?? '#f59e0b';
  return (
    <div style={{
      background: '#0d0f14',
      border: `1px solid ${color}40`,
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 10,
      lineHeight: 1.6,
      maxWidth: 220,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, color,
          background: `${color}18`,
          border: `1px solid ${color}40`,
          borderRadius: 3, padding: '1px 5px',
          letterSpacing: '0.05em',
        }}>
          {regime}
        </span>
        <span style={{ color: '#8b8fa3', fontFamily: 'var(--font-mono)', fontSize: 9 }}>
          {d.time}
        </span>
      </div>
      <div style={{ color: '#c8cad0', fontFamily: 'var(--font-mono)' }}>
        Confidence: <span style={{ color, fontWeight: 600 }}>{d.confidence}%</span>
      </div>
      {d.whale_signal && (
        <div style={{ color: '#8b8fa3', marginTop: 2 }}>
          Whale: {d.whale_signal}
        </div>
      )}
    </div>
  );
}

export function DecisionTimeline() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/timeline?limit=100`)
      .then(res => {
        const timeline = (res.data.timeline || []).map(d => {
          const dt = new Date(d.decided_at);
          const signedConfidence =
            d.regime === 'BEAR' ? -(d.confidence ?? 50) :
            d.regime === 'BULL' ? (d.confidence ?? 50) : 0;

          return {
            ...d,
            time: `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`,
            signedConfidence,
            fillColor: REGIME_COLORS[d.regime] ?? '#f59e0b',
          };
        });
        setData(timeline);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || data.length < 2) return null;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-card)',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px 8px',
      boxShadow: 'var(--shadow-card)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      }}>
        <Activity size={12} color="var(--text-dim)" strokeWidth={1.5} />
        <span style={{
          fontSize: 10, fontWeight: 600, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          fontFamily: 'var(--font-display)',
        }}>
          Agent Decision Timeline
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)',
          background: 'rgba(255,255,255,0.04)',
          border: 'var(--glass-border)',
          borderRadius: 3, padding: '1px 5px',
        }}>
          {data.length} cycles
        </span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="bullGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="bearGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="time"
            tick={{ fill: '#5a5e6e', fontSize: 8, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: '#1e2030' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[-100, 100]}
            tick={{ fill: '#5a5e6e', fontSize: 8, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => v === 0 ? '0' : v > 0 ? `+${v}` : v}
          />
          <ReferenceLine y={0} stroke="#2a2d3d" strokeDasharray="3 3" />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="signedConfidence"
            stroke="#3b82f6"
            strokeWidth={1.5}
            fill="url(#bullGrad)"
            dot={false}
            activeDot={{
              r: 3, strokeWidth: 1.5, stroke: '#3b82f6',
              fill: '#0d0f14',
            }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 16, justifyContent: 'center',
        paddingTop: 6, fontSize: 9, color: '#5a5e6e',
      }}>
        <span>↑ BULL confidence</span>
        <span style={{ color: '#2a2d3d' }}>|</span>
        <span>↓ BEAR confidence</span>
      </div>
    </div>
  );
}
