import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Dimensions,
  Alert as RNAlert,
  Modal,
  useWindowDimensions,
  ToastAndroid,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useInvestmentSync, InvestmentColumn, BoxPlotPoint, DongChartEntry, DongEntry, DailyTerm, NewsArticle } from '../hooks/useInvestmentSync';
import { getDatabase, ref, set as dbSet } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { userRef } from '../utils/userDb';

const { width } = Dimensions.get('window');

// ─── 양도세율 정적 데이터 ───────────────────────────────────────────────────
const TAX_RATE_SERIES = [
  {
    label: '단기(1년 미만)',
    color: '#ef4444',
    data: [
      { year: 2015, value: 40 }, { year: 2016, value: 40 }, { year: 2017, value: 40 },
      { year: 2018, value: 40 }, { year: 2019, value: 40 }, { year: 2020, value: 50 },
      { year: 2021, value: 70 }, { year: 2022, value: 70 }, { year: 2023, value: 70 },
      { year: 2024, value: 70 }, { year: 2025, value: 70 }, { year: 2026, value: 70 },
    ],
  },
  {
    label: '다주택 중과',
    color: '#f97316',
    data: [
      { year: 2015, value: 0 }, { year: 2016, value: 0 }, { year: 2017, value: 0 },
      { year: 2018, value: 10 }, { year: 2019, value: 10 }, { year: 2020, value: 10 },
      { year: 2021, value: 20 }, { year: 2022, value: 0 }, { year: 2023, value: 0 },
      { year: 2024, value: 0 }, { year: 2025, value: 0 }, { year: 2026, value: 20 },
    ],
  },
  {
    label: '1주택 최고세율',
    color: '#3b82f6',
    data: [
      { year: 2015, value: 38 }, { year: 2016, value: 38 }, { year: 2017, value: 40 },
      { year: 2018, value: 42 }, { year: 2019, value: 42 }, { year: 2020, value: 42 },
      { year: 2021, value: 45 }, { year: 2022, value: 45 }, { year: 2023, value: 45 },
      { year: 2024, value: 45 }, { year: 2025, value: 45 }, { year: 2026, value: 45 },
    ],
  },
] as const;

const TAX_HISTORY = [
  { year: '2017', event: '8.2 대책', detail: '다주택자 양도세 중과 예고, 투기과열지구 지정 확대' },
  { year: '2018', event: '다주택 중과 시행', detail: '조정지역 2주택 +10%p, 3주택+ +20%p 중과 시행' },
  { year: '2020', event: '7.10 대책', detail: '다주택 중과 강화 예고: 2주택 +20%p, 3주택+ +30%p (2021.6.1 시행)' },
  { year: '2021', event: '단기세율 강화', detail: '1년 미만 70%, 1~2년 60%로 상향. 다주택 중과 +20/+30%p 시행' },
  { year: '2021', event: '소득세 최고세율 인상', detail: '과세표준 10억 초과 구간 신설, 최고세율 42%→45%' },
  { year: '2022', event: '다주택 중과 배제', detail: '2022.5.10부터 다주택자 중과세 한시 배제 (1년)' },
  { year: '2023', event: '중과 배제 연장', detail: '다주택자 한시 배제 1년 추가 연장 (2024.5까지)' },
  { year: '2024', event: '중과 배제 재연장', detail: '한시 배제 재차 연장 (2026.5까지), 세제 개편 방향 논의 중' },
  { year: '2026', event: '중과 재개', detail: '2026.5.10부터 다주택자 중과 재개. 2주택 +20%p, 3주택+ +30%p 적용' },
  { year: '2026', event: '세제개편안 발표', detail: '중과세율 단계적 완화(2027~2029), 장기보유특별공제→장기거주소득공제 전환 예고' },
] as const;

const TaxLineChart: React.FC = React.memo(() => {
  const LEFT_AXIS = 34;
  const CHART_H = 160;
  const CHART_W = width - 64 - LEFT_AXIS;
  const Y_MAX = 80;
  const years = TAX_RATE_SERIES[0].data.map(d => d.year);
  const n = years.length;

  const getX = (i: number) => (i / (n - 1)) * CHART_W;
  const getY = (v: number) => CHART_H - (v / Y_MAX) * CHART_H;
  const yTicks = [0, 20, 40, 60, 80];

  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: LEFT_AXIS, height: CHART_H }}>
          {yTicks.map(tick => (
            <Text key={tick} style={{ position: 'absolute', top: getY(tick) - 7, right: 4, fontSize: 9, color: '#9ca3af' }}>
              {tick}%
            </Text>
          ))}
        </View>
        <View style={{ width: CHART_W, height: CHART_H }}>
          {yTicks.map(tick => (
            <View key={tick} style={{ position: 'absolute', top: getY(tick), left: 0, right: 0, height: 1, backgroundColor: tick === 0 ? '#94a3b8' : '#e2e8f0' }} />
          ))}
          {TAX_RATE_SERIES.map(series => {
            const pts = series.data.map((d, i) => ({ x: getX(i), y: getY(d.value) }));
            return (
              <View key={series.label} style={{ position: 'absolute', width: CHART_W, height: CHART_H }}>
                {pts.slice(0, -1).map((p, i) => {
                  const q = pts[i + 1];
                  const dx = q.x - p.x;
                  const dy = q.y - p.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const angle = Math.atan2(dy, dx);
                  return (
                    <View key={i} style={{ position: 'absolute', width: len, height: 2, left: (p.x + q.x) / 2 - len / 2, top: (p.y + q.y) / 2 - 1, backgroundColor: series.color, transform: [{ rotate: `${angle}rad` }] }} />
                  );
                })}
                {pts.map((p, i) => (
                  <View key={i} style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: series.color, left: p.x - 3, top: p.y - 3 }} />
                ))}
              </View>
            );
          })}
          {years.map((year, i) => (
            <Text key={year} style={{ position: 'absolute', top: CHART_H + 4, left: getX(i) - 12, width: 24, textAlign: 'center', fontSize: 8, color: '#6b7280' }}>
              {`'${String(year).slice(2)}`}
            </Text>
          ))}
        </View>
      </View>
      <View style={{ height: 20 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
        {TAX_RATE_SERIES.map(s => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 16, height: 2.5, backgroundColor: s.color, borderRadius: 1 }} />
            <Text style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const TaxHistoryTable: React.FC = React.memo(() => (
  <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden', marginTop: 12 }}>
    <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', paddingVertical: 7, paddingHorizontal: 10 }}>
      <Text style={{ width: 38, fontSize: 11, fontWeight: '700', color: '#475569' }}>연도</Text>
      <Text style={{ width: 88, fontSize: 11, fontWeight: '700', color: '#475569' }}>정책/변화</Text>
      <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#475569' }}>내용</Text>
    </View>
    {TAX_HISTORY.map((row, idx) => (
      <View key={idx} style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
        <Text style={{ width: 38, fontSize: 11, fontWeight: '600', color: '#64748b' }}>{row.year}</Text>
        <Text style={{ width: 88, fontSize: 11, fontWeight: '600', color: '#334155' }}>{row.event}</Text>
        <Text style={{ flex: 1, fontSize: 11, color: '#475569', lineHeight: 16 }}>{row.detail}</Text>
      </View>
    ))}
  </View>
));

const TaxPolicySummaryCard: React.FC<{ summary: { text: string; updatedAt: string } }> = React.memo(({ summary }) => (
  <View style={{ marginTop: 16, backgroundColor: '#f0f9ff', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <MaterialIcons name="auto-awesome" size={14} color="#0ea5e9" />
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0369a1' }}>최근 양도세 정책 방향</Text>
    </View>
    <Text style={{ fontSize: 12, color: '#1e3a5f', lineHeight: 19 }}>{summary.text}</Text>
    <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>AI 뉴스 요약 · {summary.updatedAt} 기준</Text>
  </View>
));

const JongbuseSummaryCard: React.FC<{ summary: { text: string; updatedAt: string } }> = React.memo(({ summary }) => (
  <View style={{ marginTop: 12, backgroundColor: '#fdf4ff', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: '#a855f7' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <MaterialIcons name="auto-awesome" size={14} color="#a855f7" />
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#7e22ce' }}>최근 종합부동산세 정책 방향</Text>
    </View>
    <Text style={{ fontSize: 12, color: '#3b1764', lineHeight: 19 }}>{summary.text}</Text>
    <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>AI 뉴스 요약 · {summary.updatedAt} 기준</Text>
  </View>
));

const CapitalGainsTaxSection: React.FC<{
  taxPolicySummary?: { text: string; updatedAt: string } | null;
  jongbuseSummary?: { text: string; updatedAt: string } | null;
}> = React.memo(({ taxPolicySummary, jongbuseSummary }) => (
  <View style={[styles.detailSection]}>
    <Text style={styles.detailSectionTitle}>연도별 양도세율 추이 (2015~2026)</Text>
    <TaxLineChart />
    <Text style={[styles.chartUnit, { textAlign: 'left', marginTop: 2 }]}>
      단기: 조정지역 기준 · 다주택: 2주택 조정지역 추가세율 · 1주택: 소득세 최고세율
    </Text>
    <Text style={[styles.detailSectionTitle, { marginTop: 20, paddingTop: 0, borderBottomWidth: 0, marginBottom: 0 }]}>
      주요 세제 변화 이력
    </Text>
    <TaxHistoryTable />
    <Text style={[styles.chartUnit, { marginTop: 6 }]}>
      ※ 현행 다주택 중과(2022.5~)는 한시 배제 중 · 세율은 지방세 별도
    </Text>
    {taxPolicySummary && <TaxPolicySummaryCard summary={taxPolicySummary} />}
    {jongbuseSummary && <JongbuseSummaryCard summary={jongbuseSummary} />}
  </View>
));

const BarChart: React.FC<{
  data: { label: string; value: number }[];
  title: string;
  unit: string;
}> = React.memo(({ data, title, unit }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View>
      <Text style={styles.chartTitle}>{title}</Text>
      <View style={styles.chartBody}>
        <View style={styles.yAxis}>
          <Text style={styles.yAxisLabel}>{max.toLocaleString()}</Text>
          <Text style={styles.yAxisLabel}>0</Text>
        </View>
        <View style={styles.barChart}>
          {data.map((point, idx) => (
            <View key={idx} style={styles.barColumn}>
              <Text style={styles.barValue}>{point.value.toLocaleString()}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${Math.max((point.value / max) * 100, 4)}%` },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{point.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.chartUnit}>{unit}</Text>
    </View>
  );
});

const isBoxPlotData = (
  data: NonNullable<InvestmentColumn['chartData']>[number]['data'] | null | undefined
): data is BoxPlotPoint[] => Array.isArray(data) && data.length > 0 && 'median' in data[0];

const BoxPlotChart: React.FC<{
  data: BoxPlotPoint[];
  yearlyData?: BoxPlotPoint[];
  title: string;
  unit: string;
}> = React.memo(({ data, yearlyData, title, unit }) => {
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');
  const [expanded, setExpanded] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();
  const hasYearly = !!yearlyData && yearlyData.length > 0;
  const points = viewMode === 'yearly' && hasYearly ? yearlyData : data;

  const allOutliers = points.flatMap(p => p.outliers ?? []);
  const globalMax = Math.max(...points.map(d => d.max), ...allOutliers, 1);
  const pct = (v: number) => Math.min(100, Math.max(0, (v / globalMax) * 100));

  const openFullscreen = async () => {
    setExpanded(true);
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  };

  const closeFullscreen = async () => {
    setExpanded(false);
    await ScreenOrientation.unlockAsync();
  };

  const Y_AXIS_W = 46;
  const fsLandscapeW = Math.max(winW, winH);
  const fsColWidth = Math.max(30, Math.floor((fsLandscapeW - Y_AXIS_W - 40) / points.length));

  const renderBoxColumns = (colW: number, trackH: number) =>
    points.map((point, idx) => {
      const trackW = Math.max(16, Math.floor(colW * 0.5));
      const labelFontSize = Math.min(10, Math.floor(colW * 0.22));
      return (
        <View key={idx} style={{ width: colW, alignItems: 'center' }}>
          <Text style={[styles.barValue, { fontSize: labelFontSize }]}>{point.avg.toLocaleString()}</Text>
          <View style={{ width: trackW, height: trackH, position: 'relative' }}>
            <View style={[styles.boxWhisker, { bottom: `${pct(point.min)}%`, height: `${Math.max(pct(point.max) - pct(point.min), 1)}%` }]} />
            <View style={[styles.boxRect, { bottom: `${pct(point.q1)}%`, height: `${Math.max(pct(point.q3) - pct(point.q1), 3)}%` }]} />
            <View style={[styles.boxMedian, { bottom: `${pct(point.median)}%` }]} />
            <View style={[styles.boxAvgDot, { bottom: `${pct(point.avg)}%` }]} />
            {(point.outliers ?? []).map((val, oi) => (
              <View key={`o${oi}`} style={[styles.boxOutlierDot, { bottom: `${pct(val)}%` }]} />
            ))}
          </View>
          <Text style={[styles.barLabel, { fontSize: labelFontSize }]}>{point.label}</Text>
          <Text style={[styles.boxRangeLabel, { fontSize: Math.max(7, labelFontSize - 2) }]}>{point.min}~{point.max}</Text>
        </View>
      );
    });

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={[styles.chartTitle, { marginBottom: 0, flex: 1 }]}>{title}</Text>
        <TouchableOpacity onPress={openFullscreen} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="open-in-full" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {hasYearly && (
        <View style={styles.viewModeRow}>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'monthly' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('monthly')}
          >
            <Text style={[styles.viewModeButtonText, viewMode === 'monthly' && styles.viewModeButtonTextActive]}>월별</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'yearly' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('yearly')}
          >
            <Text style={[styles.viewModeButtonText, viewMode === 'yearly' && styles.viewModeButtonTextActive]}>연도별</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.chartBody}>
        <View style={styles.yAxis}>
          <Text style={styles.yAxisLabel}>{globalMax.toLocaleString()}</Text>
          <Text style={styles.yAxisLabel}>0</Text>
        </View>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={styles.hChartScroll}>
          <View style={styles.hBarChart}>
            {points.map((point, idx) => (
              <View key={idx} style={styles.hBarColumn}>
                <Text style={styles.barValue}>{point.avg.toLocaleString()}</Text>
                <View style={styles.boxPlotTrack}>
                  <View
                    style={[
                      styles.boxWhisker,
                      {
                        bottom: `${pct(point.min)}%`,
                        height: `${Math.max(pct(point.max) - pct(point.min), 1)}%`,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.boxRect,
                      {
                        bottom: `${pct(point.q1)}%`,
                        height: `${Math.max(pct(point.q3) - pct(point.q1), 3)}%`,
                      },
                    ]}
                  />
                  <View style={[styles.boxMedian, { bottom: `${pct(point.median)}%` }]} />
                  <View style={[styles.boxAvgDot, { bottom: `${pct(point.avg)}%` }]} />
                  {(point.outliers ?? []).map((val, oi) => (
                    <View key={`o${oi}`} style={[styles.boxOutlierDot, { bottom: `${pct(val)}%` }]} />
                  ))}
                </View>
                <Text style={styles.barLabel}>{point.label}</Text>
                <Text style={styles.boxRangeLabel}>{point.min}~{point.max}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <Text style={styles.chartUnit}>
        {unit} · 박스: 25~75% · 굵은 선: 중앙값 · 점: 평균
      </Text>

      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        <View style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          {/* 헤더 */}
          <View style={[styles.bpTableRow, { backgroundColor: '#f1f5f9' }]}>
            <View style={styles.bpTableLabelCell}><Text style={styles.bpTableHeader}>기간</Text></View>
            <View style={styles.bpTableCell}><Text style={styles.bpTableHeader}>최소</Text></View>
            <View style={styles.bpTableCell}><Text style={[styles.bpTableHeader, { color: '#3b82f6' }]}>Q1</Text></View>
            <View style={styles.bpTableCell}><Text style={[styles.bpTableHeader, { color: '#1d4ed8' }]}>중앙값</Text></View>
            <View style={styles.bpTableCell}><Text style={[styles.bpTableHeader, { color: '#f97316' }]}>평균</Text></View>
            <View style={styles.bpTableCell}><Text style={[styles.bpTableHeader, { color: '#3b82f6' }]}>Q3</Text></View>
            <View style={styles.bpTableCell}><Text style={styles.bpTableHeader}>최대</Text></View>
          </View>
          {/* 데이터 행 */}
          {points.map((p, idx) => (
            <View key={idx} style={[styles.bpTableRow, idx % 2 === 1 && styles.bpTableRowAlt]}>
              <View style={styles.bpTableLabelCell}><Text style={styles.bpTableLabelText}>{p.label}</Text></View>
              <View style={styles.bpTableCell}><Text style={styles.bpTableText}>{p.min.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { color: '#2563eb' }]}>{p.q1.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { fontWeight: '700', color: '#1d4ed8' }]}>{p.median.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { color: '#f97316' }]}>{p.avg.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { color: '#2563eb' }]}>{p.q3.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={styles.bpTableText}>{p.max.toLocaleString()}</Text></View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={expanded} statusBarTranslucent animationType="fade" onRequestClose={closeFullscreen}>
        <View style={styles.fsContainer}>
          <View style={styles.fsHeader}>
            <Text style={styles.fsTitle}>{title}</Text>
            {hasYearly && (
              <View style={[styles.viewModeRow, { marginBottom: 0, marginLeft: 14 }]}>
                <TouchableOpacity
                  style={[styles.viewModeButton, viewMode === 'monthly' && styles.viewModeButtonActive]}
                  onPress={() => setViewMode('monthly')}
                >
                  <Text style={[styles.viewModeButtonText, viewMode === 'monthly' && styles.viewModeButtonTextActive]}>월별</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewModeButton, viewMode === 'yearly' && styles.viewModeButtonActive]}
                  onPress={() => setViewMode('yearly')}
                >
                  <Text style={[styles.viewModeButtonText, viewMode === 'yearly' && styles.viewModeButtonTextActive]}>연도별</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={closeFullscreen} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="fullscreen-exit" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={[styles.chartBody, { flex: 1, alignItems: 'center' }]}>
            <View style={[styles.yAxis, { height: 160, marginTop: 0, alignSelf: 'center' }]}>
              <Text style={styles.yAxisLabel}>{globalMax.toLocaleString()}</Text>
              <Text style={styles.yAxisLabel}>0</Text>
            </View>
            <View style={[styles.hBarChart, { flex: 1, height: 160, paddingTop: 0, justifyContent: 'space-around' }]}>
              {renderBoxColumns(fsColWidth, 100)}
            </View>
          </View>

          <Text style={[styles.chartUnit, { textAlign: 'left', paddingLeft: Y_AXIS_W + 8 }]}>
            {unit} · 위: 평균 · 아래: 최소~최대 · 박스: 25~75% · 굵은 선: 중앙값 · 점: 평균
          </Text>
        </View>
      </Modal>
    </View>
  );
});

const TERM_CATEGORY_COLORS: Record<string, string> = {
  금융정책: '#2563eb',
  부동산세제: '#7c3aed',
  청약제도: '#059669',
  대출규제: '#dc2626',
  시장분석: '#d97706',
};

const TermOfDayCard: React.FC<{ term: DailyTerm }> = React.memo(({ term }) => {
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState(false);
  const { user } = useAuth();
  const tagColor = TERM_CATEGORY_COLORS[term.category] ?? '#64748b';

  const today = new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
  const storageKey = `term_done_${today}`;

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(v => { if (v === 'true') setDone(true); });
  }, [storageKey]);

  const handleComplete = async () => {
    if (done) return;
    setDone(true);
    await AsyncStorage.setItem(storageKey, 'true');
    const today = new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
    if (user?.uid) dbSet(userRef(user.uid, `completion/investment/${today}`), true).catch(() => {});
    ToastAndroid.show('✅ 용어 학습 완료!', ToastAndroid.SHORT);
  };

  return (
    <TouchableOpacity
      style={styles.termCard}
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.85}
    >
      <View style={styles.termHeader}>
        <View style={styles.termHeaderLeft}>
          <MaterialIcons name="menu-book" size={18} color="#7c3aed" />
          <Text style={styles.termSectionLabel}>오늘의 부동산 용어</Text>
        </View>
        <MaterialIcons
          name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={20}
          color="#94a3b8"
        />
      </View>

      <View style={styles.termTitleRow}>
        <Text style={styles.termName}>{term.term}</Text>
        <View style={[styles.termCategoryBadge, { backgroundColor: tagColor }]}>
          <Text style={styles.termCategoryText}>{term.category}</Text>
        </View>
      </View>

      {term.fullName !== term.term && (
        <Text style={styles.termFullName}>{term.fullName}</Text>
      )}

      <Text style={styles.termDefinition} numberOfLines={expanded ? undefined : 2}>
        {term.definition}
      </Text>

      {expanded && (
        <>
          <View style={styles.termDetailRow}>
            <MaterialIcons name="lightbulb-outline" size={14} color="#f59e0b" />
            <Text style={styles.termDetailLabel}>예시</Text>
          </View>
          <Text style={styles.termDetailText}>{term.example}</Text>

          <View style={styles.termDetailRow}>
            <MaterialIcons name="account-balance" size={14} color="#2563eb" />
            <Text style={styles.termDetailLabel}>관련 정책</Text>
          </View>
          <Text style={styles.termDetailText}>{term.relatedPolicy}</Text>

          <View style={[styles.termTipBox]}>
            <MaterialIcons name="stars" size={14} color="#7c3aed" />
            <Text style={styles.termTipText}>{term.tip}</Text>
          </View>
        </>
      )}

      <TouchableOpacity
        style={[styles.termCompleteBtn, done && styles.termCompleteBtnDone]}
        onPress={(e) => { e.stopPropagation?.(); handleComplete(); }}
        activeOpacity={0.8}
      >
        <Text style={[styles.termCompleteBtnText, done && styles.termCompleteBtnTextDone]}>
          {done ? '✅ 학습 완료' : '완료'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const NEWS_CATEGORY_LABELS: Record<string, string> = {
  'real-estate': '부동산',
  stocks: '주식',
  economy: '경제',
};
const NEWS_CATEGORY_COLORS: Record<string, string> = {
  'real-estate': '#8b5cf6',
  stocks: '#06b6d4',
  economy: '#f59e0b',
};

const NewsCard: React.FC<{ articles: NewsArticle[] }> = React.memo(({ articles }) => {
  if (!articles.length) return null;

  return (
    <View style={styles.newsSection}>
      <View style={styles.newsSectionHeader}>
        <MaterialIcons name="newspaper" size={18} color="#0f766e" />
        <Text style={styles.newsSectionLabel}>뉴스 큐레이션</Text>
      </View>
      {articles.map(article => (
        <View key={article.id} style={styles.newsArticleCard}>
          <View style={styles.newsArticleHeader}>
            <View
              style={[
                styles.newsCategoryBadge,
                { backgroundColor: NEWS_CATEGORY_COLORS[article.category] ?? '#64748b' },
              ]}
            >
              <Text style={styles.newsCategoryText}>
                {NEWS_CATEGORY_LABELS[article.category] ?? article.category}
              </Text>
            </View>
            <Text style={styles.newsSourceText}>{article.source}</Text>
          </View>
          <Text style={styles.newsTitle}>{article.title}</Text>
          <Text style={styles.newsSummary}>{article.summary}</Text>
        </View>
      ))}
    </View>
  );
});

// 여러 지역/차트가 있을 때 칩으로 하나씩 골라서 보는 선택형 UI.
// 항목이 1개뿐이면 칩 없이 그 차트만 바로 보여준다.
const ChartSelector: React.FC<{
  charts: NonNullable<InvestmentColumn['chartData']>;
}> = React.memo(({ charts }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const renderChart = (chart: NonNullable<InvestmentColumn['chartData']>[number]) => {
    if (!Array.isArray(chart.data) || chart.data.length === 0) return null;
    return isBoxPlotData(chart.data) ? (
      <BoxPlotChart data={chart.data} yearlyData={chart.yearlyData} title={chart.title} unit={chart.unit} />
    ) : (
      <BarChart data={chart.data as { label: string; value: number }[]} title={chart.title} unit={chart.unit} />
    );
  };

  if (charts.length === 1) {
    return renderChart(charts[0]);
  }

  const selected = charts[selectedIndex];

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartChipRow}
      >
        {charts.map((chart, idx) => (
          <TouchableOpacity
            key={idx}
            style={[
              styles.chartChip,
              idx === selectedIndex && styles.chartChipActive,
            ]}
            onPress={() => setSelectedIndex(idx)}
          >
            <Text
              style={[
                styles.chartChipText,
                idx === selectedIndex && styles.chartChipTextActive,
              ]}
            >
              {chart.area}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {renderChart(selected)}
    </View>
  );
});

const DongChartViewer: React.FC<{ entry: DongChartEntry }> = React.memo(({ entry }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected: DongEntry = entry.dongs[selectedIndex];

  if (!selected) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartChipRow}
      >
        {entry.dongs.map((dong, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.chartChip, idx === selectedIndex && styles.chartChipActive]}
            onPress={() => setSelectedIndex(idx)}
          >
            <Text style={[styles.chartChipText, idx === selectedIndex && styles.chartChipTextActive]}>
              {dong.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <BoxPlotChart
        data={selected.data}
        yearlyData={selected.yearlyData}
        title={`${entry.title.split(' ')[0]} ${selected.name} 실거래가`}
        unit={entry.unit}
      />
    </View>
  );
});

interface ColumnCardProps {
  column: InvestmentColumn;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onPress: () => void;
}

const ColumnCard: React.FC<ColumnCardProps> = React.memo(
  ({
    column,
    isBookmarked,
    onToggleBookmark,
    onPress,
  }) => {
    const getCategoryLabel = useCallback((category: string) => {
      return category === 'real-estate' ? '부동산' : '주식';
    }, []);

    const getCategoryColor = useCallback((category: string) => {
      return category === 'real-estate' ? '#8b5cf6' : '#06b6d4';
    }, []);

    const getOutlookIcon = useCallback((outlook: string) => {
      switch (outlook) {
        case 'positive':
          return 'trending-up';
        case 'negative':
          return 'trending-down';
        default:
          return 'trending-flat';
      }
    }, []);

    const getOutlookColor = useCallback((outlook: string) => {
      switch (outlook) {
        case 'positive':
          return '#10b981';
        case 'negative':
          return '#ef4444';
        default:
          return '#f59e0b';
      }
    }, []);

    const formatDate = useCallback((dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }, []);

  return (
    <TouchableOpacity style={styles.columnCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.columnHeader}>
        <View style={styles.columnMeta}>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: getCategoryColor(column.category) },
            ]}
          >
            <Text style={styles.categoryLabel}>{getCategoryLabel(column.category)}</Text>
          </View>
          <Text style={styles.dateText}>{formatDate(column.date)}</Text>
        </View>
        <TouchableOpacity
          style={styles.bookmarkButton}
          onPress={onToggleBookmark}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons
            name={isBookmarked ? 'bookmark' : 'bookmark-border'}
            size={24}
            color={isBookmarked ? '#f59e0b' : '#d1d5db'}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.columnTitle} numberOfLines={2}>
        {column.title}
      </Text>

      <View style={styles.columnInfo}>
        <View style={styles.authorInfo}>
          <MaterialIcons name="person" size={14} color="#6b7280" />
          <View style={styles.authorDetails}>
            <Text style={styles.authorName}>{column.author}</Text>
            <Text style={styles.authorTitle}>{column.authorTitle}</Text>
          </View>
        </View>
        <View style={styles.outlookBadge}>
          <MaterialIcons
            name={getOutlookIcon(column.outlook)}
            size={14}
            color={getOutlookColor(column.outlook)}
          />
          <Text style={[styles.outlookText, { color: getOutlookColor(column.outlook) }]}>
            {column.outlook === 'positive' ? '긍정' : column.outlook === 'negative' ? '부정' : '중립'}
          </Text>
        </View>
      </View>

      <Text style={styles.columnSummary} numberOfLines={2}>
        {column.summary}
      </Text>

      <View style={styles.columnFooter}>
        <Text style={styles.readTime}>약 {column.readTime}분 읽음</Text>
        <MaterialIcons name="chevron-right" size={20} color="#d1d5db" />
      </View>
    </TouchableOpacity>
    );
  },
  (prev, next) => {
    return (
      prev.column.id === next.column.id &&
      prev.isBookmarked === next.isBookmarked
    );
  }
);

interface DetailModalProps {
  column: InvestmentColumn | null;
  visible: boolean;
  onClose: () => void;
  dongCharts: DongChartEntry[];
  taxPolicySummary?: { text: string; updatedAt: string } | null;
  jongbuseSummary?: { text: string; updatedAt: string } | null;
  newsArticles: NewsArticle[];
}

const DetailModal: React.FC<DetailModalProps> = React.memo(
  ({ column, visible, onClose, dongCharts, taxPolicySummary, jongbuseSummary, newsArticles }) => {
    const { user } = useAuth();
    const getCategoryLabel = useCallback((category: string) => {
      return category === 'real-estate'
        ? '부동산 분석'
        : '주식 시장 분석';
    }, []);

    const getOutlookKorean = useCallback((outlook: string) => {
      switch (outlook) {
        case 'positive':
          return '긍정';
        case 'negative':
          return '부정';
        default:
          return '중립';
      }
    }, []);

    const formatDate = useCallback((dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }, []);

    if (!column) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.detailContainer}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={28} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.detailTitle}>{getCategoryLabel(column.category)}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.detailContent} showsVerticalScrollIndicator={false}>
          <View style={styles.detailMeta}>
            <Text style={styles.detailDate}>{formatDate(column.date)}</Text>
            <Text style={styles.detailReadTime}>약 {column.readTime}분 읽음</Text>
          </View>

          <Text style={styles.detailColumnTitle}>{column.title}</Text>

          <View style={styles.detailAuthor}>
            <MaterialIcons name="person" size={16} color="#2563eb" />
            <View>
              <Text style={styles.detailAuthorName}>{column.author}</Text>
              <Text style={styles.detailAuthorTitle}>{column.authorTitle}</Text>
            </View>
          </View>

          {column.category === 'stocks' && (
            <>
              <View style={styles.detailStats}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>전망</Text>
                  <Text style={styles.statValue}>{getOutlookKorean(column.outlook)}</Text>
                </View>
                {column.ticker && (
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>티커</Text>
                    <Text style={styles.statValue}>{column.ticker}</Text>
                  </View>
                )}
              </View>
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>개요</Text>
                <Text style={styles.detailSectionContent}>{column.summary}</Text>
              </View>
            </>
          )}

          {column.chartData && column.chartData.length > 0 && (
            <View style={styles.detailSection}>
              <ChartSelector key={column.id} charts={column.chartData} />
            </View>
          )}

          {dongCharts.length > 0 && column.category === 'real-estate' && dongCharts.map((dongEntry, idx) => (
            <View key={idx} style={styles.detailSection}>
              <DongChartViewer entry={dongEntry} />
            </View>
          ))}

          {column.category === 'real-estate' && <CapitalGainsTaxSection taxPolicySummary={taxPolicySummary} jongbuseSummary={jongbuseSummary} />}

          {column.category === 'real-estate' && <NewsCard articles={newsArticles} />}

          {column.category === 'stocks' && column.sections?.map((section, idx) => (
            <View key={idx} style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>{section.heading}</Text>
              <Text style={styles.detailSectionContent}>{section.body}</Text>
            </View>
          ))}

          {column.source && (
            <Text style={styles.detailSource}>출처: {column.source}</Text>
          )}

          <TouchableOpacity
            style={styles.readCompleteButton}
            onPress={() => {
              const today = new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
              if (user?.uid) dbSet(userRef(user.uid, `completion/investment/${today}`), true).catch(() => {});
              onClose();
            }}
          >
            <MaterialIcons name="check-circle" size={18} color="#fff" />
            <Text style={styles.readCompleteButtonText}>읽기 완료</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
    );
  }
);

interface FilterModalProps {
  visible: boolean;
  selectedCategory: 'all' | 'real-estate' | 'stocks';
  onClose: () => void;
  onSelectCategory: (category: 'all' | 'real-estate' | 'stocks') => void;
}

const FilterModal: React.FC<FilterModalProps> = React.memo(
  ({
    visible,
    selectedCategory,
    onClose,
    onSelectCategory,
  }) => {
    const categories = useMemo(
      () => [
        { id: 'all', label: '모든 분석' },
        { id: 'real-estate', label: '부동산 트렌드' },
        { id: 'stocks', label: '주식 분석' },
      ],
      []
    );

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.filterContainer}>
        <View style={styles.filterHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={28} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.filterTitle}>분석 필터</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.filterContent}>
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>카테고리 선택</Text>
            <View style={styles.filterOptions}>
              {categories.map(category => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.filterOption,
                    selectedCategory === category.id && styles.filterOptionActive,
                  ]}
                  onPress={() => {
                    onSelectCategory(category.id as 'all' | 'real-estate' | 'stocks');
                    onClose();
                  }}
                >
                  <MaterialIcons
                    name={selectedCategory === category.id ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={24}
                    color={selectedCategory === category.id ? '#2563eb' : '#d1d5db'}
                  />
                  <Text
                    style={[
                      styles.filterOptionText,
                      selectedCategory === category.id && styles.filterOptionTextActive,
                    ]}
                  >
                    {category.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
    );
  }
);

export default function InvestmentScreen() {
  const { user } = useAuth();
  const uid = user!.uid;
  const {
    columns,
    termOfDay,
    newsArticles,
    dongCharts,
    taxPolicySummary,
    jongbuseSummary,
    bookmarks,
    loading,
    error,
    lastSyncTime,
    isOnline,
    syncData,
    toggleBookmark,
  } = useInvestmentSync();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<InvestmentColumn | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'real-estate' | 'stocks'>('all');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncData(true);
    } finally {
      setRefreshing(false);
    }
  }, [syncData]);

  const handleColumnPress = useCallback((column: InvestmentColumn) => {
    setSelectedColumn(column);
    setDetailVisible(true);
  }, []);

  const handleToggleBookmark = useCallback(
    async (column: InvestmentColumn) => {
      await toggleBookmark(column.id);
    },
    [toggleBookmark]
  );

  const isBookmarked = useCallback(
    (columnId: string) => {
      return bookmarks?.includes(columnId) ?? false;
    },
    [bookmarks]
  );

  // Memoize filtered columns (stocks hidden from display)
  const filteredColumns = useMemo(
    () =>
      columns.filter(c =>
        c.category !== 'stocks' &&
        (selectedCategory === 'all' || c.category === selectedCategory)
      ),
    [columns, selectedCategory]
  );

  const formatLastSync = useCallback(() => {
    if (!lastSyncTime) return '동기화 안 됨';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSyncTime.getTime()) / 1000);

    if (diff < 60) return '방금';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return lastSyncTime.toLocaleDateString();
  }, [lastSyncTime]);

  // Memoize category stats
  const stats = useMemo(() => {
    const realEstate = columns.filter(
      c => c.category === 'real-estate'
    ).length;
    const stocks = columns.filter(c => c.category === 'stocks').length;
    return { realEstate, stocks };
  }, [columns]);

  // These must stay unconditional (top-level) — moving them inside the
  // conditional FlatList JSX below caused "Rendered more hooks than during
  // the previous render" once columns loaded and the branch changed.
  const renderItem = useCallback(
    ({ item }: { item: InvestmentColumn }) => (
      <ColumnCard
        column={item}
        isBookmarked={isBookmarked(item.id)}
        onToggleBookmark={() => handleToggleBookmark(item)}
        onPress={() => handleColumnPress(item)}
      />
    ),
    [isBookmarked, handleToggleBookmark, handleColumnPress]
  );

  const keyExtractor = useCallback((item: InvestmentColumn) => item.id, []);

  const listHeaderComponent = useMemo(
    () => (
      <View>
        {termOfDay && <TermOfDayCard term={termOfDay} />}
        <View style={styles.statsSection}>
          <View style={styles.statCard}>
            <MaterialIcons name="home-work" size={24} color="#8b5cf6" />
            <Text style={styles.statNumber}>{stats.realEstate}</Text>
            <Text style={styles.statLabel}>부동산 분석</Text>
          </View>
        </View>
      </View>
    ),
    [stats, termOfDay]
  );

  const listFooterComponent = useMemo(
    () => (
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          모든 정보는 {formatLastSync()} 기준입니다
        </Text>
      </View>
    ),
    [formatLastSync]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleSection}>
          <Text style={styles.headerTitle}>💼 투자 분석</Text>
          <View style={styles.syncStatus}>
            <MaterialIcons
              name={isOnline ? 'cloud-done' : 'cloud-off'}
              size={16}
              color={isOnline ? '#10b981' : '#ef4444'}
            />
            <Text style={styles.syncStatusText}>{formatLastSync()}</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={20} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading && !columns.length ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>투자 분석을 불러오는 중...</Text>
        </View>
      ) : columns.length > 0 ? (
        <FlatList
          data={filteredColumns}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListHeaderComponent={listHeaderComponent}
          ListFooterComponent={listFooterComponent}
        />
      ) : (
        <View style={styles.centerContainer}>
          <MaterialIcons name="article" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>이용 가능한 투자 분석이 없습니다</Text>
        </View>
      )}

      <DetailModal column={selectedColumn} visible={detailVisible} onClose={() => setDetailVisible(false)} dongCharts={dongCharts} taxPolicySummary={taxPolicySummary} jongbuseSummary={jongbuseSummary} newsArticles={newsArticles} />
      <FilterModal
        visible={filterVisible}
        selectedCategory={selectedCategory}
        onClose={() => setFilterVisible(false)}
        onSelectCategory={setSelectedCategory}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitleSection: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncStatusText: {
    fontSize: 12,
    color: '#6b7280',
  },
  filterButton: {
    padding: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '500',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9ca3af',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statsSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    marginHorizontal: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  columnCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 6,
    marginHorizontal: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  columnMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryLabel: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  dateText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  bookmarkButton: {
    padding: 4,
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 10,
    lineHeight: 22,
  },
  columnInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#f3f4f6',
    borderBottomColor: '#f3f4f6',
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  authorDetails: {
    flex: 1,
  },
  authorName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  authorTitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  outlookBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
  },
  outlookText: {
    fontSize: 11,
    fontWeight: '600',
  },
  columnSummary: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 10,
  },
  columnFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  readTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  detailContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  detailContent: {
    flex: 1,
    padding: 16,
  },
  detailMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  detailDate: {
    fontSize: 13,
    color: '#6b7280',
  },
  detailReadTime: {
    fontSize: 13,
    color: '#6b7280',
  },
  detailColumnTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
    lineHeight: 28,
  },
  detailAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f0f9ff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  detailAuthorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  detailAuthorTitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  detailStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  detailSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailSectionContent: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 22,
  },
  detailSource: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  readCompleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 32,
  },
  readCompleteButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },
  fsContainer: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  fsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  fsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
  },
  chartChipRow: {
    gap: 8,
    paddingBottom: 14,
  },
  chartChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chartChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  chartChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  chartChipTextActive: {
    color: '#fff',
  },
  chartBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  yAxis: {
    justifyContent: 'space-between',
    height: 80,
    marginTop: 18,
    marginRight: 8,
    paddingRight: 6,
    borderRightWidth: 1,
    borderRightColor: '#d1d5db',
  },
  yAxisLabel: {
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'right',
  },
  chartUnit: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 6,
  },
  barChart: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barValue: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 4,
  },
  barTrack: {
    width: 20,
    height: 80,
    justifyContent: 'flex-end',
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 6,
  },
  viewModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  viewModeButton: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  viewModeButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  viewModeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  viewModeButtonTextActive: {
    color: '#2563eb',
  },
  hChartScroll: {
    flex: 1,
  },
  hBarChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  hBarColumn: {
    width: 48,
    alignItems: 'center',
  },
  boxPlotTrack: {
    width: 24,
    height: 80,
    position: 'relative',
  },
  boxWhisker: {
    position: 'absolute',
    left: '50%',
    marginLeft: -1,
    width: 2,
    backgroundColor: '#9ca3af',
  },
  boxRect: {
    position: 'absolute',
    left: 2,
    right: 2,
    backgroundColor: '#93c5fd',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 2,
  },
  boxMedian: {
    position: 'absolute',
    left: 2,
    right: 2,
    height: 2,
    backgroundColor: '#1d4ed8',
  },
  boxAvgDot: {
    position: 'absolute',
    left: '50%',
    marginLeft: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: -3,
    backgroundColor: '#f97316',
    borderWidth: 1,
    borderColor: '#fff',
  },
  boxOutlierDot: {
    position: 'absolute',
    left: '50%',
    marginLeft: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: -3,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#fff',
  },
  boxRangeLabel: {
    fontSize: 9,
    color: '#9ca3af',
    marginTop: 2,
  },
  filterContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  filterContent: {
    flex: 1,
    padding: 16,
  },
  filterSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  filterOptions: {
    gap: 10,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterOptionActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#6b7280',
  },
  filterOptionTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },

  // BoxPlot 통계 테이블
  bpTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  bpTableRowAlt: {
    backgroundColor: '#f8fafc',
  },
  bpTableLabelCell: {
    width: 44,
    paddingVertical: 5,
    paddingHorizontal: 4,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  bpTableCell: {
    width: 52,
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bpTableHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  bpTableLabelText: {
    fontSize: 10,
    color: '#374151',
    fontWeight: '600',
  },
  bpTableText: {
    fontSize: 10,
    color: '#374151',
  },

  // TermOfDayCard
  termCard: {
    backgroundColor: '#faf5ff',
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  termHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  termHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  termSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7c3aed',
    letterSpacing: 0.3,
  },
  termTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  termName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2937',
  },
  termCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  termCategoryText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  termFullName: {
    fontSize: 12,
    color: '#7c3aed',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  termDefinition: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 6,
  },
  termDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
    marginBottom: 4,
  },
  termDetailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4b5563',
  },
  termDetailText: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 19,
  },
  termTipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#ede9fe',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  termTipText: {
    flex: 1,
    fontSize: 13,
    color: '#5b21b6',
    lineHeight: 18,
    fontWeight: '500',
  },
  termCompleteBtn: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
  },
  termCompleteBtnDone: {
    backgroundColor: '#d1fae5',
  },
  termCompleteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  termCompleteBtnTextDone: {
    color: '#065f46',
  },

  // NewsCard
  newsSection: {
    marginBottom: 12,
    marginHorizontal: 4,
  },
  newsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  newsSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f766e',
    letterSpacing: 0.3,
  },
  newsArticleCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderLeftWidth: 3,
    borderLeftColor: '#0d9488',
  },
  newsArticleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  newsCategoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  newsCategoryText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  newsSourceText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 20,
    marginBottom: 6,
  },
  newsSummary: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 19,
  },
});
