import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase, ref, onValue } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';

// Firebase Functions run in UTC; KST (UTC+9) doesn't roll to the next
// calendar day until 09:00 UTC, so a plain UTC date lags KST by a day
// for 9 hours each morning. Shift the clock forward before formatting,
// matching the helper used in netlify/functions/*-daily.mjs.
function getKSTDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

export interface InvestmentColumn {
  id: string;
  title: string;
  category: 'real-estate' | 'stocks';
  author: string;
  authorTitle: string;
  date: string;
  summary: string;
  region?: string;
  ticker?: string;
  sections: { heading: string; body: string }[];
  outlook: 'positive' | 'neutral' | 'negative';
  readTime: number;
  source?: string;
  chartData?: {
    area: string; // 칩 선택 UI에 표시할 짧은 지역명 (예: "용인")
    title: string; // 차트 제목 (예: "용인 아파트 평균 매매가 추이")
    unit: string;
    // 주식: 단순 월별 값. 부동산: 실거래 분포 박스플랏(최소/1분위/중앙값/3분위/최대).
    data: ({ label: string; value: number } | BoxPlotPoint)[];
  }[];
}

export interface BoxPlotPoint {
  label: string;
  avg: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  count?: number;
}

const BOOKMARKS_KEY = 'investment_bookmarks';

// Fallback data shown when Firebase has no data yet for today
function getMockInvestmentColumns(): InvestmentColumn[] {
  return [
    {
      id: 'mock-1',
      title: '부동산 시장 현황 분석',
      category: 'real-estate',
      author: '투자 전문가',
      authorTitle: '부동산 애널리스트',
      date: new Date().toISOString().split('T')[0],
      summary: '서울 주택가격이 안정화되는 중입니다.',
      region: 'Seoul',
      sections: [
        { heading: '시장 동향', body: '최근 부동산 시장의 동향과 전망을 분석합니다.' },
        { heading: '전망', body: '긍정적인 신호들이 보이고 있습니다.' },
      ],
      outlook: 'positive',
      readTime: 5,
    },
    {
      id: 'mock-2',
      title: '미국 기술주 투자 전략',
      category: 'stocks',
      author: '주식 전문가',
      authorTitle: '증권 애널리스트',
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      summary: 'NVIDIA와 Tesla의 향후 전망을 분석합니다.',
      ticker: 'NVDA',
      sections: [
        { heading: '시장 동향', body: 'AI와 클라우드 업체들의 투자 기회를 살펴봅니다.' },
        { heading: '전망', body: '기술 시장의 중장기 성장성이 우수합니다.' },
      ],
      outlook: 'positive',
      readTime: 7,
    },
    {
      id: 'mock-3',
      title: '금리 인상의 영향',
      category: 'stocks',
      author: '경제 분석가',
      authorTitle: '거시경제 전문가',
      date: new Date(Date.now() - 172800000).toISOString().split('T')[0],
      summary: '금리 인상에 대비한 투자 전략이 필요합니다.',
      ticker: 'SPY',
      sections: [
        { heading: '시장 동향', body: '금리 인상 정책이 주식시장에 미치는 영향을 분석합니다.' },
        { heading: '전망', body: '단기 변동성이 높을 것으로 예상됩니다.' },
      ],
      outlook: 'neutral',
      readTime: 6,
    },
  ];
}

export function useInvestmentSync() {
  const [columns, setColumns] = useState<InvestmentColumn[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Load bookmarks from local storage once
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(BOOKMARKS_KEY);
        if (saved) setBookmarks(JSON.parse(saved));
      } catch (err) {
        console.error('[useInvestmentSync] Error loading bookmarks:', err);
      }
    })();
  }, []);

  // Subscribe to today's investment columns in Firebase
  // (written daily at 06:00 KST by netlify/functions/investment-daily.mjs)
  useEffect(() => {
    const db = getDatabase(getFirebaseApp());
    const today = getKSTDateString();
    const columnsRef = ref(db, `investment/columns/${today}`);

    const unsubscribe = onValue(
      columnsRef,
      snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          if (data.columns && Array.isArray(data.columns)) {
            setColumns(data.columns);
            setLastSyncTime(new Date(data.timestamp || Date.now()));
            setError(null);
          }
        } else {
          console.log('[useInvestmentSync] No Firebase data for today, using mock');
          setColumns(getMockInvestmentColumns());
          setError('오늘자 데이터가 아직 없습니다 - 기본 데이터 표시');
        }
        setLoading(false);
      },
      err => {
        console.error('[useInvestmentSync] Firebase subscription error:', err);
        setColumns(getMockInvestmentColumns());
        setError('Firebase 연결 실패 - 기본 데이터 표시');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Firebase pushes updates automatically; kept as a no-op for pull-to-refresh UX
  const syncData = useCallback(async () => {}, []);

  const toggleBookmark = useCallback(
    async (columnId: string) => {
      try {
        const updated = new Set(bookmarks);
        if (updated.has(columnId)) {
          updated.delete(columnId);
        } else {
          updated.add(columnId);
        }

        const updatedArray = Array.from(updated);
        await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updatedArray));
        setBookmarks(updatedArray);

        return updated.has(columnId);
      } catch (err) {
        console.error('[useInvestmentSync] Error toggling bookmark:', err);
        return false;
      }
    },
    [bookmarks]
  );

  return {
    columns,
    bookmarks,
    loading,
    error,
    lastSyncTime,
    isOnline: true,
    syncData,
    toggleBookmark,
  };
}
