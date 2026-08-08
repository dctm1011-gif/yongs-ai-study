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

export interface DailyTerm {
  term: string;
  fullName: string;
  definition: string;
  example: string;
  relatedPolicy: string;
  category: string;
  tip: string;
  date: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  summary: string;
  category: 'real-estate' | 'stocks' | 'economy';
  publishedAt: string;
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
    // 부동산 전용: 과거 10년치를 연 단위로 집계한 박스플랏 (있는 해만, 주식은 없음)
    yearlyData?: BoxPlotPoint[];
    // 통계청 주택소유통계(KOSIS): 2주택 이상 소유 가구 비율 (%)
    multiOwnerRatioByYear?: { label: string; ratio: number }[];
  }[];
}

export interface BoxPlotPoint {
  label: string;
  avg: number;
  min: number;   // IQR 기반 whisker 하단 (fence 안 최솟값)
  q1: number;
  median: number;
  q3: number;
  max: number;   // IQR 기반 whisker 상단 (fence 안 최댓값)
  outliers?: number[];  // Q1-1.5*IQR 미만 또는 Q3+1.5*IQR 초과 값들
  count?: number;
}

export interface DongEntry {
  name: string;
  data: BoxPlotPoint[];       // 최근 12개월 시계열 (label = "1월" 등)
  yearlyData: BoxPlotPoint[]; // 10년 시계열 (label = "2016년" 등)
}

export interface DongChartEntry {
  area: string;   // "수지" | "동탄"
  title: string;
  unit: string;
  dongs: DongEntry[];
  multiOwnerRatioByYear?: { label: string; ratio: number }[]; // 통계청 주택소유통계: 2주택자 이상 비율(%)
}

export interface RegionChartEntry {
  area: string;          // 내부 키 (예: "수원_장안")
  si: string;            // 시 (예: "수원시")
  gu: string | null;     // 구 (예: "장안구", 단일시는 null)
  label: string;         // 표시명 (gu가 있으면 gu, 없으면 si)
  title: string;
  unit: string;
  data: BoxPlotPoint[];
  yearlyData: BoxPlotPoint[];
  dongs: { name: string; data: BoxPlotPoint[]; yearlyData: BoxPlotPoint[] }[];
}

const BOOKMARKS_KEY = 'investment_bookmarks';

// 통계청 주택소유통계 기반 정적 폴백 데이터 (실측치)
// Python 스크립트(realestate_api.py)가 업데이트되면 Firebase 데이터가 우선 적용됨
// 출처: KOSIS 국가통계포털 Open API - 표 DT_1OH0407(거주지역/주택소유물건수별 주택소유 가구수), 2026-08-07 조회
// 값 = (주택소유가구 중 2건 이상 소유 가구) / (전체 주택소유가구) * 100
// 갱신: investment/fetch_multi_owner_ratio.py (통계청이 매년 11월경 그 해 자료 갱신)
const RATIO_YEARS = ['2016년','2017년','2018년','2019년','2020년','2021년','2022년','2023년','2024년'];
function makeRatio(vals: number[]): { label: string; ratio: number }[] {
  return RATIO_YEARS.map((label, i) => ({ label, ratio: vals[i] }));
}

const MULTI_OWNER_RATIO_FALLBACK: Record<string, { label: string; ratio: number }[]> = {
  판교:       makeRatio([30.9, 31.3, 31.1, 31.0, 29.7, 27.6, 27.3, 27.2, 27.4]), // 성남시 분당구(동 단위 KOSIS 데이터 없어 분당구 값 재사용)
  분당:       makeRatio([30.9, 31.3, 31.1, 31.0, 29.7, 27.6, 27.3, 27.2, 27.4]),
  광교:       makeRatio([25.0, 25.8, 26.9, 28.5, 28.0, 25.5, 24.9, 24.3, 24.1]), // 수원시 영통구(동 단위 KOSIS 데이터 없어 영통구 값 재사용)
  과천:       makeRatio([34.0, 32.7, 31.8, 31.5, 30.9, 29.9, 27.9, 26.2, 26.0]),
  동탄:       makeRatio([26.6, 26.9, 27.0, 28.8, 27.5, 25.2, 24.9, 24.4, 23.9]),
  기흥:       makeRatio([28.0, 28.1, 28.2, 28.8, 27.8, 25.7, 25.1, 25.1, 25.4]),
  수지:       makeRatio([31.7, 31.5, 31.5, 31.7, 31.3, 28.9, 27.8, 27.7, 27.5]),
  안산:       makeRatio([23.5, 23.4, 23.6, 24.5, 25.4, 23.7, 23.2, 23.4, 23.9]),
  평택:       makeRatio([27.7, 27.8, 29.6, 30.1, 29.6, 26.8, 26.0, 25.6, 25.7]),
  김포:       makeRatio([26.4, 26.3, 26.3, 26.6, 25.5, 24.9, 24.4, 24.3, 24.1]),
  '용인(처인)': makeRatio([27.3, 26.0, 27.0, 27.8, 26.6, 25.2, 24.2, 24.2, 24.3]),
  '수원 영통': makeRatio([25.0, 25.8, 26.9, 28.5, 28.0, 25.5, 24.9, 24.3, 24.1]),
  '수원 권선': makeRatio([22.6, 23.4, 24.0, 23.9, 23.5, 22.6, 22.9, 23.2, 23.1]),
  시흥:       makeRatio([22.8, 22.8, 23.8, 24.3, 24.2, 23.4, 22.7, 23.1, 22.7]),
  하남:       makeRatio([22.7, 23.5, 23.3, 24.1, 23.5, 20.6, 19.6, 19.7, 20.2]),
  오산:       makeRatio([22.8, 23.3, 24.2, 24.3, 24.0, 21.9, 21.5, 21.5, 21.2]),
  의정부:     makeRatio([23.7, 23.6, 23.5, 24.1, 23.3, 22.0, 21.8, 21.9, 22.1]),
  남양주:     makeRatio([27.5, 26.7, 26.9, 26.8, 26.0, 24.9, 24.6, 24.5, 24.6]),
  구리:       makeRatio([24.4, 24.8, 24.8, 24.5, 23.9, 22.6, 22.5, 22.8, 23.4]),
  부천:       makeRatio([24.0, 24.1, 24.1, 24.2, 24.1, 22.8, 22.5, 22.7, 22.9]),
};

function injectRatioFallback(dongCharts: DongChartEntry[]): DongChartEntry[] {
  return dongCharts.map(entry => {
    if (entry.multiOwnerRatioByYear || !MULTI_OWNER_RATIO_FALLBACK[entry.area]) return entry;
    return { ...entry, multiOwnerRatioByYear: MULTI_OWNER_RATIO_FALLBACK[entry.area] };
  });
}

function injectRatioIntoColumns(columns: InvestmentColumn[]): InvestmentColumn[] {
  return columns.map(col => {
    if (!col.chartData) return col;
    return {
      ...col,
      chartData: col.chartData.map(cd => {
        if (cd.multiOwnerRatioByYear || !MULTI_OWNER_RATIO_FALLBACK[cd.area]) return cd;
        return { ...cd, multiOwnerRatioByYear: MULTI_OWNER_RATIO_FALLBACK[cd.area] };
      }),
    };
  });
}

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
  const [termOfDay, setTermOfDay] = useState<DailyTerm | null>(null);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [dongCharts, setDongCharts] = useState<DongChartEntry[]>([]);
  const [regionCharts, setRegionCharts] = useState<RegionChartEntry[]>([]);
  const [taxPolicySummary, setTaxPolicySummary] = useState<{ text: string; updatedAt: string } | null>(null);
  const [jongbuseSummary, setJongbuseSummary] = useState<{ text: string; updatedAt: string } | null>(null);
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
            setColumns(injectRatioIntoColumns(data.columns));
            setTermOfDay(data.termOfDay || null);
            setNewsArticles(data.newsArticles || []);
            setDongCharts(injectRatioFallback(data.dongCharts || []));
            setRegionCharts(data.regionCharts || []);
            setTaxPolicySummary(data.taxPolicySummary || null);
            setJongbuseSummary(data.jongbuseSummary || null);
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
    termOfDay,
    newsArticles,
    dongCharts,
    regionCharts,
    taxPolicySummary,
    jongbuseSummary,
    bookmarks,
    loading,
    error,
    lastSyncTime,
    isOnline: true,
    syncData,
    toggleBookmark,
  };
}
