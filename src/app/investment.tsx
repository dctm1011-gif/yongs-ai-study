import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useInvestmentSync, InvestmentColumn, BoxPlotPoint, DongChartEntry, DongEntry, DailyTerm, NewsArticle, RegionChartEntry } from '../hooks/useInvestmentSync';
import { getDatabase, ref, set as dbSet } from 'firebase/database';
import { getFirebaseApp } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { userRef } from '../utils/userDb';
import { useScreenFade } from '../hooks/useScreenFade';

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
            <Text key={tick} style={{ position: 'absolute', top: getY(tick) - 7, right: 4, fontSize: 9, color: '#8e8e8e' }}>
              {tick}%
            </Text>
          ))}
        </View>
        <View style={{ width: CHART_W, height: CHART_H }}>
          {yTicks.map(tick => (
            <View key={tick} style={{ position: 'absolute', top: getY(tick), left: 0, right: 0, height: 1, backgroundColor: tick === 0 ? '#8e8e8e' : '#dbdbdb' }} />
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
            <Text key={year} style={{ position: 'absolute', top: CHART_H + 4, left: getX(i) - 12, width: 24, textAlign: 'center', fontSize: 8, color: '#8e8e8e' }}>
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
            <Text style={{ fontSize: 11, color: '#8e8e8e' }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const TaxHistoryTable: React.FC = React.memo(() => (
  <View style={{ borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 8, overflow: 'hidden', marginTop: 12 }}>
    <View style={{ flexDirection: 'row', backgroundColor: '#fafafa', paddingVertical: 7, paddingHorizontal: 10 }}>
      <Text style={{ width: 38, fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>연도</Text>
      <Text style={{ width: 88, fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>정책/변화</Text>
      <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>내용</Text>
    </View>
    {TAX_HISTORY.map((row, idx) => (
      <View key={idx} style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, backgroundColor: idx % 2 === 1 ? '#fafafa' : '#fff', borderTopWidth: 1, borderTopColor: '#fafafa' }}>
        <Text style={{ width: 38, fontSize: 11, fontWeight: '600', color: '#8e8e8e' }}>{row.year}</Text>
        <Text style={{ width: 88, fontSize: 11, fontWeight: '600', color: '#262626' }}>{row.event}</Text>
        <Text style={{ flex: 1, fontSize: 11, color: '#8e8e8e', lineHeight: 16 }}>{row.detail}</Text>
      </View>
    ))}
  </View>
));

const TaxPolicySummaryCard: React.FC<{ summary: { text: string; updatedAt: string } }> = React.memo(({ summary }) => (
  <View style={{ marginTop: 16, backgroundColor: '#fafafa', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: '#0095f6' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <MaterialIcons name="auto-awesome" size={14} color="#0095f6" />
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#0095f6' }}>최근 양도세 정책 방향</Text>
    </View>
    <Text style={{ fontSize: 12, color: '#262626', lineHeight: 19 }}>{summary.text}</Text>
    <Text style={{ fontSize: 10, color: '#8e8e8e', marginTop: 8 }}>AI 뉴스 요약 · {summary.updatedAt} 기준</Text>
  </View>
));

const JongbuseSummaryCard: React.FC<{ summary: { text: string; updatedAt: string } }> = React.memo(({ summary }) => (
  <View style={{ marginTop: 12, backgroundColor: '#fafafa', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: '#0095f6' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <MaterialIcons name="auto-awesome" size={14} color="#0095f6" />
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#0095f6' }}>최근 종합부동산세 정책 방향</Text>
    </View>
    <Text style={{ fontSize: 12, color: '#262626', lineHeight: 19 }}>{summary.text}</Text>
    <Text style={{ fontSize: 10, color: '#8e8e8e', marginTop: 8 }}>AI 뉴스 요약 · {summary.updatedAt} 기준</Text>
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

const HorizontalBarChart: React.FC<{
  data: { label: string; sub?: string; value: number }[];
  title: string;
  unit: string;
  color?: string;
  valueSuffix?: string;
  decimals?: number;
}> = React.memo(({ data, title, unit, color = '#0095f6', valueSuffix = '', decimals = 1 }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.chartTitle}>{title}</Text>
      {sorted.map((d, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ width: 76 }}>
            <Text style={{ fontSize: 11, color: '#262626', fontWeight: '600' }} numberOfLines={1}>{d.label}</Text>
            {d.sub ? <Text style={{ fontSize: 9, color: '#8e8e8e' }} numberOfLines={1}>{d.sub}</Text> : null}
          </View>
          <View style={{ flex: 1, height: 16, backgroundColor: '#f0f0f0', borderRadius: 4, marginHorizontal: 6 }}>
            <View style={{ width: `${Math.max((d.value / max) * 100, 2)}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
          </View>
          <Text style={{ width: 48, fontSize: 11, color: '#262626', fontWeight: '600', textAlign: 'right' }}>
            {d.value.toFixed(decimals)}{valueSuffix}
          </Text>
        </View>
      ))}
      <Text style={styles.chartUnit}>{unit}</Text>
    </View>
  );
});

const isBoxPlotData = (
  data: NonNullable<InvestmentColumn['chartData']>[number]['data'] | null | undefined
): data is BoxPlotPoint[] => Array.isArray(data) && data.length > 0 && 'median' in data[0];

const TRACK_BOTTOM_Y = 112; // 트랙 하단의 container 상단 기준 y (px, 근사치)
const TRACK_H = 80;
const COL_W = 48;
const CONTAINER_H = 140;

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
          <MaterialIcons name="open-in-full" size={18} color="#8e8e8e" />
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
          <Text style={styles.yAxisLabel}>{Math.round(globalMax * 0.75).toLocaleString()}</Text>
          <Text style={styles.yAxisLabel}>{Math.round(globalMax * 0.5).toLocaleString()}</Text>
          <Text style={styles.yAxisLabel}>{Math.round(globalMax * 0.25).toLocaleString()}</Text>
          <Text style={styles.yAxisLabel}>0</Text>
        </View>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={styles.hChartScroll}>
          <View style={{ position: 'relative' }}>
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
            {/* 가격 그리드라인 (25%, 50%, 75%) */}
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: CONTAINER_H }}>
              {[0.25, 0.5, 0.75].map(frac => (
                <View key={frac} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: TRACK_BOTTOM_Y - frac * TRACK_H,
                  height: 0.5, backgroundColor: '#dbdbdb', opacity: 0.7,
                }} />
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
      <Text style={styles.chartUnit}>
        {unit} · 박스: 25~75% · 굵은 선: 중앙값 · 점: 평균
      </Text>

      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        <View style={{ borderWidth: 1, borderColor: '#dbdbdb', borderRadius: 8, overflow: 'hidden' }}>
          {/* 헤더 */}
          <View style={[styles.bpTableRow, { backgroundColor: '#fafafa' }]}>
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
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { color: '#0095f6' }]}>{p.q1.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { fontWeight: '600', color: '#1d4ed8' }]}>{p.median.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { color: '#f97316' }]}>{p.avg.toLocaleString()}</Text></View>
              <View style={styles.bpTableCell}><Text style={[styles.bpTableText, { color: '#0095f6' }]}>{p.q3.toLocaleString()}</Text></View>
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
              <MaterialIcons name="fullscreen-exit" size={24} color="#8e8e8e" />
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
  금융정책: '#0095f6',
  부동산세제: '#0095f6',
  청약제도: '#059669',
  대출규제: '#dc2626',
  시장분석: '#d97706',
};

const TermOfDayCard: React.FC<{ term: DailyTerm }> = React.memo(({ term }) => {
  const [expanded, setExpanded] = useState(false);
  const [done, setDone] = useState(false);
  const { user } = useAuth();
  const tagColor = TERM_CATEGORY_COLORS[term.category] ?? '#8e8e8e';

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
          <MaterialIcons name="menu-book" size={18} color="#0095f6" />
          <Text style={styles.termSectionLabel}>오늘의 부동산 용어</Text>
        </View>
        <MaterialIcons
          name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={20}
          color="#8e8e8e"
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
            <MaterialIcons name="account-balance" size={14} color="#0095f6" />
            <Text style={styles.termDetailLabel}>관련 정책</Text>
          </View>
          <Text style={styles.termDetailText}>{term.relatedPolicy}</Text>

          <View style={[styles.termTipBox]}>
            <MaterialIcons name="stars" size={14} color="#0095f6" />
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
        <MaterialIcons name="newspaper" size={18} color="#0095f6" />
        <Text style={styles.newsSectionLabel}>뉴스 큐레이션</Text>
      </View>
      {articles.map(article => (
        <View key={article.id} style={styles.newsArticleCard}>
          <View style={styles.newsArticleHeader}>
            <View
              style={[
                styles.newsCategoryBadge,
                { backgroundColor: NEWS_CATEGORY_COLORS[article.category] ?? '#8e8e8e' },
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

const AREA_ADMIN_MAP: Record<string, { adminName: string; parentSi?: string; ratio: number }> = {
  '판교':       { adminName: '분당구',   parentSi: '성남시',  ratio: 27.4 },
  '분당':       { adminName: '분당구',   parentSi: '성남시',  ratio: 27.4 },
  '광교':       { adminName: '영통구',   parentSi: '수원시',  ratio: 24.1 },
  '수원 영통':  { adminName: '영통구',   parentSi: '수원시',  ratio: 24.1 },
  '수원 권선':  { adminName: '권선구',   parentSi: '수원시',  ratio: 23.1 },
  '기흥':       { adminName: '기흥구',   parentSi: '용인시',  ratio: 25.4 },
  '수지':       { adminName: '수지구',   parentSi: '용인시',  ratio: 27.5 },
  '용인(처인)': { adminName: '처인구',   parentSi: '용인시',  ratio: 24.3 },
  '과천':       { adminName: '과천시',                        ratio: 26.0 },
  '성남':       { adminName: '성남시',                        ratio: 25.1 },
  '용인':       { adminName: '용인시',                        ratio: 25.8 },
  '동탄':       { adminName: '화성시',                        ratio: 23.9 },
  '안산':       { adminName: '안산시',                        ratio: 23.9 },
  '평택':       { adminName: '평택시',                        ratio: 25.7 },
  '김포':       { adminName: '김포시',                        ratio: 24.1 },
  '시흥':       { adminName: '시흥시',                        ratio: 22.7 },
  '하남':       { adminName: '하남시',                        ratio: 20.2 },
  '오산':       { adminName: '오산시',                        ratio: 21.2 },
  '의정부':     { adminName: '의정부시',                      ratio: 22.1 },
  '남양주':     { adminName: '남양주시',                      ratio: 24.6 },
  '구리':       { adminName: '구리시',                        ratio: 23.4 },
  '부천':       { adminName: '부천시',                        ratio: 22.9 },
};

type AreaChip = { name: string; parent?: string; ratio: number };
type RatioCategory = '전체' | '성남' | '수원' | '용인' | '기타';

const RATIO_CATEGORIES: Record<RatioCategory, string[]> = {
  전체: [],
  성남: ['성남시', '분당구'],
  수원: ['영통구', '권선구'],
  용인: ['용인시', '수지구', '기흥구', '처인구'],
  기타: ['과천시', '화성시', '안산시', '평택시', '김포시', '시흥시', '하남시', '오산시', '의정부시', '남양주시', '구리시', '부천시'],
};

const ALL_AREA_CHIPS: AreaChip[] = Object.values(
  Object.fromEntries(
    Object.values(AREA_ADMIN_MAP).map(a => [a.adminName, { name: a.adminName, parent: a.parentSi, ratio: a.ratio }])
  )
).sort((a, b) => b.ratio - a.ratio);

const MultiOwnerRatioChips: React.FC<{ areaKey: string }> = React.memo(({ areaKey }) => {
  const highlightName = AREA_ADMIN_MAP[areaKey]?.adminName;

  const defaultCat = (): RatioCategory => {
    if (!highlightName) return '전체';
    for (const [cat, names] of Object.entries(RATIO_CATEGORIES) as [RatioCategory, string[]][]) {
      if (cat !== '전체' && names.includes(highlightName)) return cat;
    }
    return '기타';
  };

  const [cat, setCat] = useState<RatioCategory>(defaultCat);

  const items = cat === '전체'
    ? ALL_AREA_CHIPS
    : ALL_AREA_CHIPS.filter(c => RATIO_CATEGORIES[cat].includes(c.name));

  return (
    <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#fafafa' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#262626' }}>2주택자 이상 비율 비교</Text>
        <Text style={{ fontSize: 10, color: '#8e8e8e' }}>KOSIS 2024년 · 비율순</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(Object.keys(RATIO_CATEGORIES) as RatioCategory[]).map(c => (
            <TouchableOpacity
              key={c}
              onPress={() => setCat(c)}
              style={{
                paddingVertical: 5, paddingHorizontal: 13, borderRadius: 14,
                backgroundColor: cat === c ? '#0095f6' : '#fafafa',
                borderWidth: 1, borderColor: cat === c ? '#0095f6' : '#dbdbdb',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: cat === c ? '#fff' : '#8e8e8e' }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {items.map(item => {
          const isHighlight = item.name === highlightName;
          return (
            <View
              key={item.name}
              style={{
                paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14,
                backgroundColor: isHighlight ? '#fff7ed' : '#fafafa',
                borderWidth: 1, borderColor: isHighlight ? '#f97316' : '#dbdbdb',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: isHighlight ? '700' : '400', color: isHighlight ? '#ea580c' : '#8e8e8e' }}>
                {item.name} {item.ratio}%
              </Text>
              {item.parent && (
                <Text style={{ fontSize: 9, color: '#dbdbdb', marginTop: 1 }}>{item.parent}</Text>
              )}
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: 9, color: '#8e8e8e', marginTop: 8 }}>출처: 통계청 주택소유통계 · 주황: 현재 지역</Text>
    </View>
  );
});

const DongChartViewer: React.FC<{ entry: DongChartEntry }> = React.memo(({ entry }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected: DongEntry = entry.dongs[selectedIndex];
  const areaKey = entry.title.split(' 동별')[0];

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
      <MultiOwnerRatioChips areaKey={areaKey} />
    </View>
  );
});

// 경기도 시 표시 순서 (구 수 많은 시 우선)
const SI_ORDER = [
  '수원시', '성남시', '용인시', '고양시', '안양시', '안산시',
  '화성시', '부천시', '의정부시', '남양주시', '광명시', '평택시',
  '김포시', '시흥시', '하남시', '구리시', '오산시', '군포시',
  '의왕시', '파주시', '이천시', '광주시', '양주시', '과천시',
];

const REGION_BOOKMARKS_KEY = 'region_bookmarks_v2';
const REGION_FILTER_KEY   = 'region_filter_state_v1';

interface RegionBookmark {
  area: string;
  si: string;
  label: string;
  dongName?: string;
  displayLabel: string;
}

// 2026년 7월 기준 중앙값 6억~8억 동 (중앙값 오름차순)
const DEFAULT_REGION_BOOKMARKS: RegionBookmark[] = [];

const REGION_RATIO_LABELS = ["'16","'17","'18","'19","'20","'21","'22","'23","'24"];

// KOSIS 주택소유통계 (시군구 단위) - 2주택 이상 소유 가구 비율 (%)
// 출처: 통계청 KOSIS Open API DT_1OH0407, 2026-08-07 조회
// 출처: 통계청 KOSIS Open API DT_1OH0407, 2026-08-09 실측 (fetch_multi_owner_ratio.py)
const REGION_RATIO_DATA: Record<string, number[]> = {
  '수원_장안':   [23.8, 24.3, 24.8, 25.2, 24.8, 24.2, 24.4, 24.6, 24.4],
  '수원_권선':   [22.6, 23.4, 24.0, 23.9, 23.5, 22.6, 22.9, 23.2, 23.1],
  '수원_팔달':   [24.5, 25.0, 25.4, 24.9, 24.2, 22.9, 22.6, 23.7, 23.6],
  '수원_영통':   [25.0, 25.8, 26.9, 28.5, 28.0, 25.5, 24.9, 24.3, 24.1],
  '성남_수정':   [24.2, 24.6, 24.7, 24.7, 24.3, 23.5, 23.0, 22.3, 23.1],
  '성남_중원':   [23.7, 23.6, 22.8, 22.8, 21.9, 21.4, 21.0, 21.4, 21.5],
  '성남_분당':   [30.9, 31.3, 31.1, 31.0, 29.7, 27.6, 27.3, 27.2, 27.4],
  '의정부':      [23.7, 23.6, 23.5, 24.1, 23.3, 22.0, 21.8, 21.9, 22.1],
  '안양_만안':   [24.9, 25.8, 26.2, 26.2, 25.8, 24.2, 23.5, 24.1, 24.0],
  '안양_동안':   [27.1, 27.6, 28.0, 28.3, 27.4, 25.6, 25.5, 25.5, 25.4],
  '부천':        [24.0, 24.1, 24.1, 24.2, 24.1, 22.8, 22.5, 22.7, 22.9],
  '광명':        [26.0, 26.4, 26.8, 26.8, 26.3, 24.6, 24.6, 25.0, 24.7],
  '평택':        [27.7, 27.8, 29.6, 30.1, 29.6, 26.8, 26.0, 25.6, 25.7],
  '안산_상록':   [22.8, 22.8, 22.7, 23.6, 24.4, 23.0, 22.5, 22.6, 23.0],
  '안산_단원':   [24.2, 24.0, 24.6, 25.5, 26.5, 24.4, 24.0, 24.4, 24.8],
  '고양_덕양':   [25.0, 24.9, 24.9, 24.8, 23.8, 22.4, 22.0, 22.0, 21.8],
  '고양_일산동':  [27.4, 27.5, 27.7, 27.8, 27.2, 26.0, 25.6, 25.8, 26.1], // KOSIS SGG 코드 오류, 추정치 유지
  '고양_일산서':  [27.7, 27.7, 27.8, 27.5, 27.6, 26.7, 26.5, 26.4, 24.8],
  '과천':        [34.0, 32.7, 31.8, 31.5, 30.9, 29.9, 27.9, 26.2, 26.0],
  '구리':        [24.4, 24.8, 24.8, 24.5, 23.9, 22.6, 22.5, 22.8, 23.4],
  '남양주':      [27.5, 26.7, 26.9, 26.8, 26.0, 24.9, 24.6, 24.5, 24.6],
  '오산':        [22.8, 23.3, 24.2, 24.3, 24.0, 21.9, 21.5, 21.5, 21.2],
  '시흥':        [22.8, 22.8, 23.8, 24.3, 24.2, 23.4, 22.7, 23.1, 22.7],
  '군포':        [24.8, 25.4, 25.9, 26.1, 26.3, 24.0, 23.6, 24.0, 24.2],
  '의왕':        [27.9, 27.9, 28.3, 28.2, 28.7, 26.0, 26.3, 26.6, 26.3],
  '하남':        [22.7, 23.5, 23.3, 24.1, 23.5, 20.6, 19.6, 19.7, 20.2],
  '용인_처인':   [27.3, 26.0, 27.0, 27.8, 26.6, 25.2, 24.2, 24.2, 24.3],
  '용인_기흥':   [28.0, 28.1, 28.2, 28.8, 27.8, 25.7, 25.1, 25.1, 25.4],
  '용인_수지':   [31.7, 31.5, 31.5, 31.7, 31.3, 28.9, 27.8, 27.7, 27.5],
  '파주':        [26.9, 26.3, 26.1, 26.3, 25.8, 25.2, 25.1, 24.8, 24.5],
  '이천':        [28.2, 28.6, 28.3, 28.6, 28.2, 27.1, 26.8, 26.9, 26.7],
  '김포':        [26.4, 26.3, 26.3, 26.6, 25.5, 24.9, 24.4, 24.3, 24.1],
  '화성_동탄':   [26.6, 26.9, 27.0, 28.8, 27.5, 25.2, 24.9, 24.4, 23.9],
  '화성_본청':   [26.6, 26.9, 27.0, 28.8, 27.5, 25.2, 24.9, 24.4, 23.9],
  '광주':        [25.2, 25.0, 25.3, 25.3, 24.1, 22.6, 21.9, 22.0, 22.0],
  '양주':        [23.8, 25.7, 25.4, 25.7, 24.0, 22.6, 22.8, 24.2, 23.3],
};

const RATIO_CHART_W = width - 56; // regionSection: marginH 12*2 + padding 16*2
const RATIO_CHART_H = 64;

const RegionRatioChart: React.FC<{ area: string }> = React.memo(({ area }) => {
  const vals = REGION_RATIO_DATA[area];
  if (!vals) return null;

  const n = vals.length;
  const minV = Math.floor(Math.min(...vals) - 1);
  const maxV = Math.ceil(Math.max(...vals) + 1);
  const PAD_H = 8;
  const getX = (i: number) => PAD_H + (i / (n - 1)) * (RATIO_CHART_W - PAD_H * 2);
  const getY = (v: number) => RATIO_CHART_H - ((v - minV) / (maxV - minV)) * RATIO_CHART_H;
  const pts = vals.map((v, i) => ({ x: getX(i), y: getY(v) }));

  return (
    <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#fafafa' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#262626' }}>2주택 이상 보유 비율</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#0095f6' }}>{vals[n - 1]}%</Text>
          <Text style={{ fontSize: 9, color: '#8e8e8e' }}>2024년</Text>
        </View>
      </View>
      <View style={{ height: RATIO_CHART_H + 16, width: RATIO_CHART_W, overflow: 'hidden' }}>
        {pts.slice(0, -1).map((p, i) => {
          const q = pts[i + 1];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          return (
            <View key={i} style={{ position: 'absolute', width: len, height: 2, left: (p.x + q.x) / 2 - len / 2, top: (p.y + q.y) / 2 - 1, backgroundColor: '#93c5fd', transform: [{ rotate: `${angle}rad` }] }} />
          );
        })}
        {pts.map((p, i) => {
          const isLast = i === n - 1;
          const sz = isLast ? 7 : 5;
          return (
            <View key={i} style={{ position: 'absolute', width: sz, height: sz, borderRadius: sz / 2, backgroundColor: isLast ? '#0095f6' : '#bfdbfe', left: p.x - sz / 2, top: p.y - sz / 2 }} />
          );
        })}
        {REGION_RATIO_LABELS.map((lbl, i) => (
          <Text key={i} style={{ position: 'absolute', fontSize: 8, color: '#8e8e8e', top: RATIO_CHART_H + 2, left: getX(i) - 10, width: 20, textAlign: 'center' }}>{lbl}</Text>
        ))}
      </View>
      <Text style={{ fontSize: 9, color: '#8e8e8e', marginTop: 2 }}>출처: 통계청 KOSIS 주택소유통계 · 시군구 단위 · 데이터 없는 지역은 미표시</Text>
    </View>
  );
});

type RegionViewMode = 'series' | 'compare';

const RegionBrowser: React.FC<{ regionCharts: RegionChartEntry[] }> = React.memo(({ regionCharts }) => {
  const [viewMode, setViewMode] = useState<RegionViewMode>('series');

  // ── 즐겨찾기 (두 모드 공통 보조 기능) ──
  const [bookmarks, setBookmarks] = useState<RegionBookmark[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(REGION_BOOKMARKS_KEY).then(v => {
      if (v === null) {
        saveBookmarks(DEFAULT_REGION_BOOKMARKS);
      } else {
        setBookmarks(JSON.parse(v));
      }
    });
  }, []);

  const saveBookmarks = useCallback(async (next: RegionBookmark[]) => {
    setBookmarks(next);
    await AsyncStorage.setItem(REGION_BOOKMARKS_KEY, JSON.stringify(next));
  }, []);

  const isBookmarked = useCallback((area: string, dongName?: string) =>
    bookmarks.some(b => b.area === area && b.dongName === dongName),
  [bookmarks]);

  // ── 시계열 모드 상태 ──
  const siList = useMemo(() => {
    const available = new Set(regionCharts.map(r => r.si));
    return SI_ORDER.filter(si => available.has(si));
  }, [regionCharts]);

  const [selectedSi, setSelectedSi] = useState<string>(() => siList[0] ?? '');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedDong, setSelectedDong] = useState<string | null>(null);

  // 복원 시 area/dong을 정확히 재현하기 위한 ref (selectedSi effect가 덮어쓰기 전에 적용)
  const pendingAreaRef = useRef<string | null>(null);
  const pendingDongRef = useRef<string | null>(null);

  useEffect(() => {
    if (pendingAreaRef.current !== null) {
      const area = pendingAreaRef.current;
      const dong = pendingDongRef.current;
      pendingAreaRef.current = null;
      pendingDongRef.current = null;
      const valid = regionCharts.find(r => r.area === area && r.si === selectedSi);
      if (valid) { setSelectedArea(area); setSelectedDong(dong); return; }
    }
    const first = regionCharts.find(r => r.si === selectedSi);
    setSelectedArea(first?.area ?? null);
    setSelectedDong(null);
  }, [selectedSi, regionCharts]);

  const handleAreaSelect = useCallback((area: string) => {
    setSelectedArea(area);
    setSelectedDong(null);
  }, []);

  const guList = useMemo(() => regionCharts.filter(r => r.si === selectedSi), [regionCharts, selectedSi]);
  const selectedEntry = useMemo(() => regionCharts.find(r => r.area === selectedArea) ?? null, [regionCharts, selectedArea]);
  const dongList = useMemo(() => selectedEntry?.dongs ?? [], [selectedEntry]);
  const showGuRow = guList.length > 1;

  const seriesData = useMemo(() => {
    if (!selectedEntry) return null;
    if (selectedDong) {
      const dong = selectedEntry.dongs.find(d => d.name === selectedDong);
      if (dong) return { data: dong.data, yearlyData: dong.yearlyData, title: `${selectedEntry.label} ${selectedDong}`, unit: selectedEntry.unit };
    }
    return { data: selectedEntry.data, yearlyData: selectedEntry.yearlyData, title: selectedEntry.title, unit: selectedEntry.unit };
  }, [selectedEntry, selectedDong]);

  const starred = selectedEntry ? isBookmarked(selectedEntry.area, selectedDong ?? undefined) : false;

  const toggleBookmark = useCallback(() => {
    if (!selectedEntry) return;
    const dong = selectedDong ?? undefined;
    const displayLabel = dong
      ? `${selectedEntry.si} ${selectedEntry.label} ${dong}`
      : `${selectedEntry.si} ${selectedEntry.label}`;
    const bm: RegionBookmark = { area: selectedEntry.area, si: selectedEntry.si, label: selectedEntry.label, dongName: dong, displayLabel };
    if (isBookmarked(selectedEntry.area, dong)) {
      saveBookmarks(bookmarks.filter(b => !(b.area === selectedEntry.area && b.dongName === dong)));
    } else {
      saveBookmarks([...bookmarks, bm]);
    }
  }, [selectedEntry, selectedDong, bookmarks, isBookmarked, saveBookmarks]);

  const resetSeries = useCallback(() => {
    const firstSi = siList[0] ?? '';
    setSelectedSi(firstSi);
    setSelectedDong(null);
    // selectedArea는 selectedSi effect가 자동으로 첫 번째로 설정함
  }, [siList]);

  // ── 숨김 동 (area별 동 이름 목록) ──
  const [hiddenDongs, setHiddenDongs] = useState<Record<string, string[]>>({});

  const toggleHiddenDong = useCallback((area: string, dongName: string) => {
    setHiddenDongs(prev => {
      const list = prev[area] ?? [];
      return {
        ...prev,
        [area]: list.includes(dongName) ? list.filter(d => d !== dongName) : [...list, dongName],
      };
    });
  }, []);

  const hiddenDongListForArea = useMemo(
    () => (selectedArea ? (hiddenDongs[selectedArea] ?? []) : []),
    [hiddenDongs, selectedArea]
  );

  const visibleDongList = useMemo(
    () => dongList.filter(d => !hiddenDongListForArea.includes(d.name)),
    [dongList, hiddenDongListForArea]
  );

  const restoreHiddenDongsInArea = useCallback(() => {
    if (!selectedArea) return;
    setHiddenDongs(prev => ({ ...prev, [selectedArea]: [] }));
  }, [selectedArea]);

  // 숨긴 동이 선택된 경우 전체(null)로 fallback
  useEffect(() => {
    if (selectedDong && selectedArea && (hiddenDongs[selectedArea] ?? []).includes(selectedDong)) {
      setSelectedDong(null);
    }
  }, [hiddenDongs]);

  // ── 차트 로딩 표시 ──
  const [isChartLoading, setIsChartLoading] = useState(false);
  const chartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedArea) return;
    setIsChartLoading(true);
    if (chartTimerRef.current) clearTimeout(chartTimerRef.current);
    chartTimerRef.current = setTimeout(() => setIsChartLoading(false), 300);
    return () => { if (chartTimerRef.current) clearTimeout(chartTimerRef.current); };
  }, [selectedArea, selectedDong]);

  // ── 비교 모드 상태 ──
  const [compareDongs, setCompareDongs] = useState<{ area: string; dongName: string }[]>([]);
  const [compareMetric, setCompareMetric] = useState<'price' | 'ratio' | 'turnover'>('price');

  const toggleCompareDong = useCallback((area: string, dongName: string) => {
    setCompareDongs(prev => {
      const exists = prev.some(d => d.area === area && d.dongName === dongName);
      return exists
        ? prev.filter(d => !(d.area === area && d.dongName === dongName))
        : [...prev, { area, dongName }];
    });
  }, []);

  const loadFavoritesIntoCompare = useCallback(() => {
    const pairs = bookmarks.map(b => ({ area: b.area, dongName: b.dongName ?? '' })).filter(b => b.dongName);
    setCompareDongs(prev => {
      const existing = new Set(prev.map(d => `${d.area}__${d.dongName}`));
      const toAdd = pairs.filter(p => !existing.has(`${p.area}__${p.dongName}`));
      return [...prev, ...toAdd];
    });
  }, [bookmarks]);

  const resetCompare = useCallback(() => setCompareDongs([]), []);


  useEffect(() => {
    if (compareDongs.length === 0) return;
    setIsChartLoading(true);
    if (chartTimerRef.current) clearTimeout(chartTimerRef.current);
    chartTimerRef.current = setTimeout(() => setIsChartLoading(false), 350);
    return () => { if (chartTimerRef.current) clearTimeout(chartTimerRef.current); };
  }, [compareDongs]);

  // 동별 최신 중위가 가로 바 차트 데이터
  const compareDongBarData = useMemo<{ label: string; sub: string; value: number }[]>(() => {
    return compareDongs.flatMap(({ area, dongName }) => {
      const entry = regionCharts.find(r => r.area === area);
      if (!entry) return [];
      const dong = entry.dongs.find(d => d.name === dongName);
      if (!dong || dong.data.length === 0) return [];
      const latest = dong.data[dong.data.length - 1];
      const shortArea = entry.gu ?? entry.si.replace('시', '');
      return [{ label: dongName, sub: shortArea, value: latest.median }];
    });
  }, [compareDongs, regionCharts]);

  // 동별 연간 거래 회전율 (%) = 6개월 거래건수×2 / 총세대수 × 100
  // dongUnitCounts 없는 동은 제외 (부정확한 데이터 미표시)
  const compareTurnoverBarData = useMemo<{ label: string; sub: string; value: number }[]>(() => {
    return compareDongs.flatMap(({ area, dongName }) => {
      const entry = regionCharts.find(r => r.area === area);
      if (!entry?.dongUnitCounts) return [];
      const totalUnits = entry.dongUnitCounts[dongName];
      if (!totalUnits || totalUnits === 0) return [];
      const dong = entry.dongs.find(d => d.name === dongName);
      if (!dong || dong.data.length === 0) return [];
      const last6 = dong.data.slice(-6);
      const trades6m = last6.reduce((s, p) => s + (p.count ?? 0), 0);
      if (trades6m === 0) return [];
      const annualRate = Math.round((trades6m * 2 / totalUnits) * 1000) / 10; // 소수 1자리
      const shortArea = entry.gu ?? entry.si.replace('시', '');
      return [{ label: dongName, sub: shortArea, value: annualRate }];
    });
  }, [compareDongs, regionCharts]);

  // 구별 다주택자 비율 가로 바 차트 데이터 (area 기준 중복 제거)
  const compareRatioBarData = useMemo<{ label: string; sub: string; value: number }[]>(() => {
    const seen = new Set<string>();
    return compareDongs.flatMap(({ area }) => {
      if (seen.has(area)) return [];
      seen.add(area);
      const entry = regionCharts.find(r => r.area === area);
      const vals = REGION_RATIO_DATA[area];
      if (!vals || !entry) return [];
      return [{ label: entry.gu ?? entry.si.replace('시', ''), sub: entry.si, value: vals[vals.length - 1] }];
    });
  }, [compareDongs, regionCharts]);

  // ── 필터 상태 저장/복원 ──
  const hydratedRef = useRef(false);

  // regionCharts가 처음 로드될 때 한 번 복원
  useEffect(() => {
    if (hydratedRef.current || regionCharts.length === 0) return;
    hydratedRef.current = true;
    AsyncStorage.getItem(REGION_FILTER_KEY).then(v => {
      if (!v) return;
      try {
        const s = JSON.parse(v);
        if (s.viewMode === 'series' || s.viewMode === 'compare') setViewMode(s.viewMode);
        if (Array.isArray(s.compareDongs)) {
          setCompareDongs(s.compareDongs);
        }
        if (s.hiddenDongs && typeof s.hiddenDongs === 'object') {
          setHiddenDongs(s.hiddenDongs);
        }
        if (s.selectedSi && regionCharts.some(r => r.si === s.selectedSi)) {
          pendingAreaRef.current = s.selectedArea ?? null;
          pendingDongRef.current = s.selectedDong ?? null;
          setSelectedSi(s.selectedSi);
        }
      } catch {}
    });
  }, [regionCharts]);

  // 필터 변경 시 자동 저장 (복원 완료 후에만)
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(REGION_FILTER_KEY, JSON.stringify({
      viewMode, selectedSi, selectedArea, selectedDong, compareDongs, hiddenDongs,
    }));
  }, [viewMode, selectedSi, selectedArea, selectedDong, compareDongs, hiddenDongs]);

  if (siList.length === 0) return null;

  return (
    <View style={styles.regionSection}>
      <Text style={[styles.regionTitle, { marginBottom: 10 }]}>경기도 지역별 실거래가</Text>

      {/* 모드 탭 */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {([
          { key: 'series',  label: '시계열' },
          { key: 'compare', label: `지역 비교${compareDongs.length > 0 ? ` (${compareDongs.length})` : ''}` },
        ] as { key: RegionViewMode; label: string }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setViewMode(tab.key)}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
              backgroundColor: viewMode === tab.key ? '#0095f6' : '#fafafa',
              borderWidth: 1, borderColor: viewMode === tab.key ? '#0095f6' : '#dbdbdb',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: viewMode === tab.key ? '#fff' : '#8e8e8e' }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === 'series' ? (
        /* ══ 시계열 모드 ══ */
        <View>
          {/* 시 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {siList.map(si => (
                  <TouchableOpacity key={si} onPress={() => setSelectedSi(si)}
                    style={[styles.regionSiChip, selectedSi === si && styles.regionSiChipActive]}>
                    <Text style={[styles.regionSiChipText, selectedSi === si && styles.regionSiChipTextActive]}>{si}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {selectedSi !== siList[0] && (
              <TouchableOpacity onPress={() => setSelectedSi(siList[0] ?? '')}
                style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb' }}>
                <Text style={{ fontSize: 11, color: '#8e8e8e', fontWeight: '600' }}>초기화</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 구 (구 있는 시만) */}
          {showGuRow && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {guList.map(r => (
                    <TouchableOpacity key={r.area} onPress={() => handleAreaSelect(r.area)}
                      style={[styles.regionGuChip, selectedArea === r.area && styles.regionGuChipActive]}>
                      <Text style={[styles.regionGuChipText, selectedArea === r.area && styles.regionGuChipTextActive]}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              {selectedArea !== guList[0]?.area && (
                <TouchableOpacity onPress={() => handleAreaSelect(guList[0]?.area ?? '')}
                  style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb' }}>
                  <Text style={{ fontSize: 11, color: '#8e8e8e', fontWeight: '600' }}>초기화</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 동 */}
          {dongList.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => setSelectedDong(null)}
                    style={[styles.regionDongChip, selectedDong === null && styles.regionDongChipActive]}>
                    <Text style={[styles.regionDongChipText, selectedDong === null && styles.regionDongChipTextActive]}>전체</Text>
                  </TouchableOpacity>
                  {visibleDongList.map(d => (
                    <TouchableOpacity key={d.name} onPress={() => setSelectedDong(d.name)}
                      style={[styles.regionDongChip, selectedDong === d.name && styles.regionDongChipActive]}>
                      <Text style={[styles.regionDongChipText, selectedDong === d.name && styles.regionDongChipTextActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {hiddenDongListForArea.length > 0 && (
                    <TouchableOpacity onPress={restoreHiddenDongsInArea}
                      style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb' }}>
                      <Text style={{ fontSize: 10, color: '#8e8e8e' }}>숨김 {hiddenDongListForArea.length}개 복원</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
              {selectedDong !== null && (
                <TouchableOpacity onPress={() => setSelectedDong(null)}
                  style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb' }}>
                  <Text style={{ fontSize: 11, color: '#8e8e8e', fontWeight: '600' }}>초기화</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {seriesData && (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <TouchableOpacity onPress={toggleBookmark} style={[styles.regionStarBtn, { marginBottom: 0, flex: 1 }]}>
                  <Text style={[styles.regionStarBtnText, starred && styles.regionStarBtnTextActive]}>
                    {starred ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기 추가'}
                  </Text>
                </TouchableOpacity>
                {selectedDong && selectedArea && (
                  <TouchableOpacity onPress={() => toggleHiddenDong(selectedArea, selectedDong)}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#dbdbdb' }}>
                    <Text style={{ fontSize: 12, color: '#8e8e8e', fontWeight: '600' }}>숨김</Text>
                  </TouchableOpacity>
                )}
              </View>
              {isChartLoading ? (
                <View style={{ height: 180, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#0095f6" />
                  <Text style={{ fontSize: 12, color: '#8e8e8e' }}>차트 로딩 중...</Text>
                </View>
              ) : (
                <>
                  <BoxPlotChart data={seriesData.data} yearlyData={seriesData.yearlyData}
                    title={seriesData.title} unit={seriesData.unit} />
                  {selectedEntry && <RegionRatioChart area={selectedEntry.area} />}
                </>
              )}
            </View>
          )}
        </View>

      ) : (
        /* ══ 지역 비교 모드 ══ */
        <View>
          {/* 즐겨찾기 불러오기 + 해제 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <TouchableOpacity onPress={loadFavoritesIntoCompare}
              style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: '#e7f5ff', borderWidth: 1, borderColor: '#bfdbfe' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#1d4ed8' }}>★ 즐겨찾기 불러오기</Text>
            </TouchableOpacity>
            {compareDongs.length > 0 && (
              <TouchableOpacity onPress={resetCompare}
                style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#dc2626' }}>해제</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 선택된 동 태그 */}
          {compareDongs.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {compareDongs.map(({ area, dongName }) => {
                const entry = regionCharts.find(r => r.area === area);
                const areaLabel = entry ? (entry.gu ?? entry.si.replace('시', '')) : area;
                return (
                  <TouchableOpacity key={`${area}__${dongName}`}
                    onPress={() => toggleCompareDong(area, dongName)}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#e7f5ff', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={{ fontSize: 11, color: '#0095f6', fontWeight: '600' }}>{dongName} <Text style={{ color: '#8e8e8e', fontWeight: '400' }}>{areaLabel}</Text></Text>
                    <Text style={{ fontSize: 10, color: '#8e8e8e' }}>✕</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* 서브탭: 아파트 가격 / 다주택자 비율 */}
          {compareDongs.length >= 2 && (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {([
                { key: 'price',    label: '아파트 가격' },
                { key: 'ratio',    label: '다주택자 비율' },
                { key: 'turnover', label: '거래 활발도' },
              ] as { key: 'price' | 'ratio' | 'turnover'; label: string }[]).map(tab => (
                <TouchableOpacity key={tab.key} onPress={() => setCompareMetric(tab.key)}
                  style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
                    backgroundColor: compareMetric === tab.key ? '#0095f6' : '#fafafa',
                    borderWidth: 1, borderColor: compareMetric === tab.key ? '#0095f6' : '#dbdbdb' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: compareMetric === tab.key ? '#fff' : '#8e8e8e' }}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 차트 */}
          {isChartLoading && compareDongs.length >= 2 ? (
            <View style={{ height: 180, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color="#0095f6" />
              <Text style={{ fontSize: 12, color: '#8e8e8e' }}>차트 로딩 중...</Text>
            </View>
          ) : compareMetric === 'price' && compareDongBarData.length >= 2 ? (
            <HorizontalBarChart
              data={compareDongBarData}
              title={`동별 최신 중위가 (${compareDongBarData.length}개)`}
              unit="단위: 억원 · 최근 거래 기준"
              color="#0095f6"
            />
          ) : compareMetric === 'ratio' && compareRatioBarData.length >= 1 ? (
            <HorizontalBarChart
              data={compareRatioBarData}
              title="2주택 이상 보유 비율"
              unit="출처: 통계청 KOSIS 2024년 · 시군구 단위"
              color="#f59e0b"
              valueSuffix="%"
            />
          ) : compareMetric === 'turnover' && compareTurnoverBarData.length >= 1 ? (
            <HorizontalBarChart
              data={compareTurnoverBarData}
              title="동별 연간 거래 회전율 (6개월 거래×2 / 총세대수)"
              unit="단위: % · 국토부 실거래가 + 공동주택 현황"
              color="#10b981"
              valueSuffix="%"
            />
          ) : compareMetric === 'turnover' ? (
            <View style={{ paddingVertical: 20, paddingHorizontal: 4, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#262626' }}>거래 회전율</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e' }}>준비 중</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: '#8e8e8e', lineHeight: 18 }}>
                {'연간 거래 회전율 = 거래건수 / 총 아파트 세대수 × 100%\n환금성(얼마나 쉽게 팔리는지)을 수치로 비교합니다.'}
              </Text>
              <View style={{ backgroundColor: '#fafafa', borderRadius: 8, padding: 12, gap: 6, borderWidth: 1, borderColor: '#dbdbdb' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#262626' }}>데이터 준비 방법</Text>
                <Text style={{ fontSize: 11, color: '#8e8e8e', lineHeight: 17 }}>
                  {'1. stat.molit.go.kr → 주택 → 공동주택 현황 Excel 다운로드\n2. 파일 경로를 Claude에 알려주면 자동 처리\n3. push_region_charts.py 재실행으로 Firebase 업로드'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 36 }}>
              <Text style={{ fontSize: 13, color: '#8e8e8e' }}>
                {compareDongs.length === 0 ? '즐겨찾기를 불러온 뒤 2개 이상 선택하세요' : '동을 1개 더 선택하세요'}
              </Text>
            </View>
          )}
        </View>
      )}
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
            color={isBookmarked ? '#f59e0b' : '#dbdbdb'}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.columnTitle} numberOfLines={2}>
        {column.title}
      </Text>

      <View style={styles.columnInfo}>
        <View style={styles.authorInfo}>
          <MaterialIcons name="person" size={14} color="#8e8e8e" />
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
        <MaterialIcons name="chevron-right" size={20} color="#dbdbdb" />
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
            <MaterialIcons name="close" size={28} color="#262626" />
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
            <MaterialIcons name="person" size={16} color="#0095f6" />
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
            <MaterialIcons name="close" size={28} color="#262626" />
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
                    color={selectedCategory === category.id ? '#0095f6' : '#dbdbdb'}
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
    regionCharts,
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

  const { opacity, translateY } = useScreenFade();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<InvestmentColumn | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'real-estate' | 'stocks'>('all');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncData();
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
        {regionCharts.length > 0 && <RegionBrowser regionCharts={regionCharts} />}
      </View>
    ),
    [termOfDay, regionCharts]
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
      <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>
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
          <ActivityIndicator size="large" color="#0095f6" />
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
          <MaterialIcons name="article" size={48} color="#dbdbdb" />
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
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  headerTitleSection: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 4,
  },
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncStatusText: {
    fontSize: 12,
    color: '#8e8e8e',
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
    color: '#8e8e8e',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8e8e8e',
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
    borderColor: '#dbdbdb',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '600',
    color: '#262626',
    marginTop: 8,
  },
  columnCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 6,
    marginHorizontal: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    elevation: 0,
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
    color: '#8e8e8e',
  },
  bookmarkButton: {
    padding: 4,
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
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
    borderTopColor: '#fafafa',
    borderBottomColor: '#fafafa',
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
    color: '#262626',
  },
  authorTitle: {
    fontSize: 11,
    color: '#8e8e8e',
  },
  outlookBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fafafa',
    borderRadius: 6,
  },
  outlookText: {
    fontSize: 11,
    fontWeight: '600',
  },
  columnSummary: {
    fontSize: 13,
    color: '#8e8e8e',
    lineHeight: 18,
    marginBottom: 10,
  },
  columnFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#fafafa',
  },
  readTime: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  regionSection: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    elevation: 0,
  },
  regionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  regionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#262626',
  },
  regionSubtitle: {
    fontSize: 10,
    color: '#8e8e8e',
  },
  regionSiChip: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  regionSiChipActive: {
    backgroundColor: '#0095f6',
    borderColor: '#0095f6',
  },
  regionSiChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  regionSiChipTextActive: {
    color: '#fff',
  },
  regionGuChip: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  regionGuChipActive: {
    backgroundColor: '#e7f5ff',
    borderColor: '#0095f6',
  },
  regionGuChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8e8e8e',
  },
  regionGuChipTextActive: {
    color: '#0095f6',
    fontWeight: '600',
  },
  regionDongChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  regionDongChipActive: {
    backgroundColor: '#1e3a8a',
    borderColor: '#1e3a8a',
  },
  regionDongChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8e8e8e',
  },
  regionDongChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  regionFavToggle: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  regionFavToggleActive: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  regionFavToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  regionFavToggleTextActive: {
    color: '#d97706',
  },
  regionStarBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
    marginBottom: 8,
  },
  regionStarBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  regionStarBtnTextActive: {
    color: '#f59e0b',
  },
  regionFavRemoveBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    marginBottom: 8,
  },
  regionFavRemoveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d97706',
  },
  regionFavEmpty: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  regionFavEmptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  regionFavEmptyHint: {
    fontSize: 12,
    color: '#dbdbdb',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#8e8e8e',
  },
  detailContainer: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
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
    borderBottomColor: '#dbdbdb',
  },
  detailDate: {
    fontSize: 13,
    color: '#8e8e8e',
  },
  detailReadTime: {
    fontSize: 13,
    color: '#8e8e8e',
  },
  detailColumnTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 16,
    lineHeight: 28,
  },
  detailAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fafafa',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  detailAuthorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  detailAuthorTitle: {
    fontSize: 12,
    color: '#8e8e8e',
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
    borderColor: '#dbdbdb',
  },
  statLabel: {
    fontSize: 11,
    color: '#8e8e8e',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  detailSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#fafafa',
  },
  detailSectionContent: {
    fontSize: 14,
    color: '#8e8e8e',
    lineHeight: 22,
  },
  detailSource: {
    fontSize: 12,
    color: '#8e8e8e',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  readCompleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0095f6',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 32,
  },
  readCompleteButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
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
    fontWeight: '600',
    color: '#262626',
  },
  chartChipRow: {
    gap: 8,
    paddingBottom: 14,
  },
  chartChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  chartChipActive: {
    backgroundColor: '#0095f6',
    borderColor: '#0095f6',
  },
  chartChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
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
    height: TRACK_H,
    marginTop: TRACK_BOTTOM_Y - TRACK_H,
    marginRight: 8,
    paddingRight: 6,
    borderRightWidth: 1,
    borderRightColor: '#dbdbdb',
  },
  yAxisLabel: {
    fontSize: 10,
    color: '#8e8e8e',
    textAlign: 'right',
  },
  chartUnit: {
    fontSize: 11,
    color: '#8e8e8e',
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
    borderBottomColor: '#dbdbdb',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barValue: {
    fontSize: 10,
    color: '#8e8e8e',
    marginBottom: 4,
  },
  barTrack: {
    width: 20,
    height: 80,
    justifyContent: 'flex-end',
    backgroundColor: '#fafafa',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: '#0095f6',
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 11,
    color: '#8e8e8e',
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
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  viewModeButtonActive: {
    backgroundColor: '#e7f5ff',
    borderColor: '#0095f6',
  },
  viewModeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e8e',
  },
  viewModeButtonTextActive: {
    color: '#0095f6',
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
    borderBottomColor: '#dbdbdb',
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
    backgroundColor: '#8e8e8e',
  },
  boxRect: {
    position: 'absolute',
    left: 2,
    right: 2,
    backgroundColor: '#93c5fd',
    borderWidth: 1,
    borderColor: '#0095f6',
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
    color: '#8e8e8e',
    marginTop: 2,
  },
  filterContainer: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbdbdb',
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
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
    borderColor: '#dbdbdb',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
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
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  filterOptionActive: {
    backgroundColor: '#e7f5ff',
    borderColor: '#0095f6',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#8e8e8e',
  },
  filterOptionTextActive: {
    color: '#0095f6',
    fontWeight: '600',
  },

  // BoxPlot 통계 테이블
  bpTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#fafafa',
  },
  bpTableRowAlt: {
    backgroundColor: '#fafafa',
  },
  bpTableLabelCell: {
    width: 44,
    paddingVertical: 5,
    paddingHorizontal: 4,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#dbdbdb',
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
    fontWeight: '600',
    color: '#8e8e8e',
  },
  bpTableLabelText: {
    fontSize: 10,
    color: '#262626',
    fontWeight: '600',
  },
  bpTableText: {
    fontSize: 10,
    color: '#262626',
  },

  // TermOfDayCard
  termCard: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dbdbdb',
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
    fontWeight: '600',
    color: '#0095f6',
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
    fontWeight: '600',
    color: '#262626',
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
    color: '#0095f6',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  termDefinition: {
    fontSize: 14,
    color: '#262626',
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
    fontWeight: '600',
    color: '#8e8e8e',
  },
  termDetailText: {
    fontSize: 13,
    color: '#8e8e8e',
    lineHeight: 19,
  },
  termTipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#e7f5ff',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  termTipText: {
    flex: 1,
    fontSize: 13,
    color: '#0095f6',
    lineHeight: 18,
    fontWeight: '500',
  },
  termCompleteBtn: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0095f6',
    alignItems: 'center',
  },
  termCompleteBtnDone: {
    backgroundColor: '#d1fae5',
  },
  termCompleteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    fontWeight: '600',
    color: '#0095f6',
    letterSpacing: 0.3,
  },
  newsArticleCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    borderLeftWidth: 3,
    borderLeftColor: '#0095f6',
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
    color: '#8e8e8e',
    fontWeight: '500',
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
    lineHeight: 20,
    marginBottom: 6,
  },
  newsSummary: {
    fontSize: 13,
    color: '#8e8e8e',
    lineHeight: 19,
  },
});
