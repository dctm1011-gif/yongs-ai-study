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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useInvestmentSync, InvestmentColumn, BoxPlotPoint } from '../hooks/useInvestmentSync';
import { writeCompletion } from '../utils/writeCompletion';

const { width } = Dimensions.get('window');

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
        {unit} · 막대 위 숫자: 평균값 · 아래 숫자: 최소~최대 범위 · 박스: 25~75% · 굵은 선: 중앙값 · 점: 평균 위치
      </Text>

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
}

const DetailModal: React.FC<DetailModalProps> = React.memo(
  ({ column, visible, onClose }) => {
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

          <View style={styles.detailStats}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>전망</Text>
              <Text style={styles.statValue}>{getOutlookKorean(column.outlook)}</Text>
            </View>
            {column.region && (
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>지역</Text>
                <Text style={styles.statValue}>{column.region}</Text>
              </View>
            )}
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

          {column.chartData && column.chartData.length > 0 && (
            <View style={styles.detailSection}>
              <ChartSelector charts={column.chartData} />
            </View>
          )}

          {column.sections?.map((section, idx) => (
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
              writeCompletion('investment_column', `${column.title} 읽기 완료`);
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
  const {
    columns,
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

  // Memoize filtered columns
  const filteredColumns = useMemo(
    () =>
      selectedCategory === 'all'
        ? columns
        : columns.filter(c => c.category === selectedCategory),
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
      <View style={styles.statsSection}>
        <View style={styles.statCard}>
          <MaterialIcons name="home-work" size={24} color="#8b5cf6" />
          <Text style={styles.statNumber}>{stats.realEstate}</Text>
          <Text style={styles.statLabel}>부동산 분석</Text>
        </View>
        <View style={styles.statCard}>
          <MaterialIcons name="trending-up" size={24} color="#06b6d4" />
          <Text style={styles.statNumber}>{stats.stocks}</Text>
          <Text style={styles.statLabel}>주식 분석</Text>
        </View>
      </View>
    ),
    [stats]
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
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="tune" size={24} color="#2563eb" />
        </TouchableOpacity>
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

      <DetailModal column={selectedColumn} visible={detailVisible} onClose={() => setDetailVisible(false)} />
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
});
