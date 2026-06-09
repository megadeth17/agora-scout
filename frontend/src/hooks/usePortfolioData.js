import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';
const WS_URL = import.meta.env.VITE_WS_URL ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/feed`;

export function usePortfolioData() {
  const [portfolio, setPortfolio] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [rebalances, setRebalances] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveDecision, setLiveDecision] = useState(null);
  const [liveMarket, setLiveMarket] = useState(null);
  const wsRef = useRef(null);
  const pingRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const [portRes, decRes, rebRes, statRes] = await Promise.all([
        axios.get(`${API}/api/portfolio`),
        axios.get(`${API}/api/decisions?limit=50`),
        axios.get(`${API}/api/rebalances?limit=20`),
        axios.get(`${API}/api/stats`),
      ]);
      setPortfolio(portRes.data);
      setDecisions(decRes.data.decisions || []);
      setRebalances(rebRes.data.rebalances || []);
      setStats(statRes.data);
      setError(null);
    } catch (err) {
      setError('Failed to reach backend');
    } finally {
      setLoading(false);
    }
  }, []);

  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 30000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'agent_decision') {
            setLiveDecision(msg.decision);
            if (msg.market) setLiveMarket(msg.market);
            if (msg.portfolio) setPortfolio(msg.portfolio);
            // Prepend to decisions list
            setDecisions((prev) => [msg.decision, ...prev.slice(0, 49)]);
            // Prepend rebalance if present
            if (msg.rebalance) {
              setRebalances((prev) => [msg.rebalance, ...prev.slice(0, 19)]);
            }
          } else if (msg.type === 'init') {
            if (msg.portfolio) setPortfolio(msg.portfolio);
            if (msg.latest_decision) setLiveDecision(msg.latest_decision);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        clearInterval(pingRef.current);
        setTimeout(connectWS, 5000);
      };

      ws.onerror = () => ws.close();
    } catch {
      setTimeout(connectWS, 5000);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    connectWS();
    const interval = setInterval(fetchAll, 60000);
    return () => {
      clearInterval(interval);
      clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [fetchAll, connectWS]);

  return {
    portfolio,
    decisions,
    rebalances,
    stats,
    loading,
    error,
    liveDecision,
    liveMarket,
    refetch: fetchAll,
  };
}
