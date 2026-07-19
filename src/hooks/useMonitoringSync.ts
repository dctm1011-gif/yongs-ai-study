import { useState, useEffect, useRef } from 'react';

export interface MonitoringData {
  timestamp: string;
  value: number;
  randomData: {
    temperature: number;
    cpu: number;
    memory: number;
  };
  responseTime: number; // ms
  status: 'ok' | 'error' | 'timeout';
  error?: string;
}

const API_BASE_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app';
const POLLING_INTERVAL = 10000; // 10 seconds
const FETCH_TIMEOUT = 3000; // 3 seconds

export function useMonitoringSync() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [history, setHistory] = useState<MonitoringData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchMonitoring = async () => {
    const startTime = Date.now();
    abortControllerRef.current = new AbortController();
    const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(
        `${API_BASE_URL}/.netlify/functions/monitoring-test`,
        {
          signal: abortControllerRef.current.signal,
          headers: {
            'Cache-Control': 'no-cache',
          },
        }
      );

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorMsg = `HTTP ${response.status}`;
        setError(errorMsg);
        setData(prev =>
          prev
            ? { ...prev, status: 'error', error: errorMsg, responseTime }
            : null
        );
        setLoading(false);
        return;
      }

      const responseData = await response.json();
      const newData: MonitoringData = {
        timestamp: responseData.timestamp,
        value: responseData.value,
        randomData: {
          temperature: parseFloat(responseData.randomData.temperature),
          cpu: parseFloat(responseData.randomData.cpu),
          memory: parseFloat(responseData.randomData.memory),
        },
        responseTime,
        status: 'ok',
        error: undefined,
      };

      setData(newData);
      setHistory(prev => [...prev.slice(-59), newData]); // 최대 60개 유지
      setError(null);
      setLoading(false);
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof Error && err.name === 'AbortError') {
        const errorMsg = 'Timeout (3s exceeded)';
        setError(errorMsg);
        setData(prev =>
          prev
            ? { ...prev, status: 'timeout', error: errorMsg, responseTime: FETCH_TIMEOUT }
            : null
        );
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        setData(prev =>
          prev
            ? { ...prev, status: 'error', error: errorMsg }
            : null
        );
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    // 초기 로드
    fetchMonitoring();

    // 10초마다 폴링
    pollIntervalRef.current = setInterval(() => {
      fetchMonitoring();
    }, POLLING_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 통계 계산
  const stats = history.length > 0 ? {
    avgResponseTime: Math.round(history.reduce((sum, d) => sum + d.responseTime, 0) / history.length),
    maxResponseTime: Math.max(...history.map(d => d.responseTime)),
    minResponseTime: Math.min(...history.map(d => d.responseTime)),
  } : null;

  return {
    data,
    history,
    loading,
    error,
    stats,
    refetch: fetchMonitoring,
  };
}
