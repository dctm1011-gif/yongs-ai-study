import { useState, useEffect, useRef } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { database } from '../config/firebase';

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

export function useMonitoringSync() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [history, setHistory] = useState<MonitoringData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dbRefRef = useRef<any>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    try {
      if (!database) {
        setError('Firebase 데이터베이스가 초기화되지 않았습니다.');
        setLoading(false);
        return;
      }

      dbRefRef.current = ref(database, 'monitoring/latest');
      lastUpdateRef.current = Date.now();

      unsubscribe = onValue(
        dbRefRef.current,
        (snapshot) => {
          const now = Date.now();
          const responseTime = now - lastUpdateRef.current;
          lastUpdateRef.current = now;

          if (snapshot.exists()) {
            const responseData = snapshot.val();
            const newData: MonitoringData = {
              timestamp: responseData.timestamp || new Date().toISOString(),
              value: responseData.value || 0,
              randomData: {
                temperature: parseFloat(responseData.randomData?.temperature || 0),
                cpu: parseFloat(responseData.randomData?.cpu || 0),
                memory: parseFloat(responseData.randomData?.memory || 0),
              },
              responseTime: Math.max(responseTime, 0),
              status: 'ok',
              error: undefined,
            };

            setData(newData);
            setHistory(prev => [...prev.slice(-59), newData]);
            setError(null);
            setLoading(false);
          } else {
            setError('데이터를 찾을 수 없습니다.');
            setLoading(false);
          }
        },
        (err) => {
          console.error('Firebase 읽기 오류:', err);
          setError(`Firebase 오류: ${err.message}`);
          setLoading(false);
        }
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Firebase 초기화 실패';
      console.error('Firebase 설정 오류:', err);
      setError(errorMsg);
      setLoading(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // 통계 계산
  const stats = history.length > 0 ? {
    avgResponseTime: Math.round(history.reduce((sum, d) => sum + d.responseTime, 0) / history.length),
    maxResponseTime: Math.max(...history.map(d => d.responseTime)),
    minResponseTime: Math.min(...history.map(d => d.responseTime)),
  } : null;

  // 수동 새로고침 함수 (선택사항)
  const refetch = () => {
    lastUpdateRef.current = Date.now();
  };

  return {
    data,
    history,
    loading,
    error,
    stats,
    refetch,
  };
}
