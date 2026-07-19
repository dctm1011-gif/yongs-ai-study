import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal, Dimensions, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataIntegrityValidator } from '../utils/DataIntegrityValidator';
import DataFormatter from '../utils/DataFormatter';

interface StorageItem {
  key: string;
  value: string;
  parsedValue: any;
  size: number;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  summary?: string;
}

interface DetailModalData {
  key: string;
  value: any;
  type: string;
  size: string;
  formattedData?: any;
}

export default function StorageScreen() {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSize, setTotalSize] = useState(0);
  const [validationResults, setValidationResults] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<DetailModalData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadStorageData();
  }, []);

  const exportAllData = async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const allData = await Promise.all(
        allKeys.map(key => AsyncStorage.getItem(key).then(value => [key, value] as const))
      );

      const exportData: Record<string, any> = {};
      for (const [key, value] of allData) {
        try {
          exportData[key] = JSON.parse(value || '');
        } catch {
          exportData[key] = value;
        }
      }

      const exportJson = {
        timestamp: new Date().toISOString(),
        appVersion: '1.0.1',
        data: exportData,
      };

      // Log the export
      console.log('Data exported:', JSON.stringify(exportJson).length, 'bytes');
      Alert.alert('내보내기 완료', `${Object.keys(exportData).length}개 항목이 준비되었습니다.\n\n데이터:\n${JSON.stringify(exportJson, null, 2).substring(0, 200)}...`);

      return exportJson;
    } catch (error) {
      Alert.alert('오류', '데이터 내보내기 실패');
      console.error('Export failed:', error);
    }
  };

  const validateAllData = async () => {
    try {
      const results = await DataIntegrityValidator.validateAll();
      setValidationResults(results);
      setShowSyncStatus(true);

      const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0);
      const totalWarnings = Object.values(results).reduce((sum, r) => sum + r.warnings.length, 0);

      Alert.alert(
        '검증 완료',
        `에러: ${totalErrors}개\n경고: ${totalWarnings}개`,
        [{ text: '확인', onPress: () => setShowSyncStatus(true) }]
      );
    } catch (error) {
      Alert.alert('오류', '데이터 검증 실패');
      console.error('Validation failed:', error);
    }
  };

  const calculateSize = (value: string): number => {
    try {
      // Buffer 시도
      try {
        if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
          const size = Buffer.byteLength(value, 'utf-8');
          console.log('✅ Buffer.byteLength 사용:', size);
          return size;
        }
      } catch (bufferErr) {
        console.warn('⚠️  Buffer 실패:', bufferErr);
      }

      // TextEncoder 시도
      try {
        if (typeof TextEncoder !== 'undefined') {
          const encoder = new TextEncoder();
          const encoded = encoder.encode(value);
          console.log('✅ TextEncoder 사용:', encoded.length);
          return encoded.length;
        }
      } catch (encoderErr) {
        console.warn('⚠️  TextEncoder 실패:', encoderErr);
      }

      // 최후의 수단: 문자열 길이 (대략적)
      console.log('✅ 문자열 길이 사용:', value.length);
      return value.length;
    } catch (err) {
      console.error('❌ 크기 계산 에러:', err);
      return value.length;
    }
  };

  const loadStorageData = async () => {
    try {
      setLoading(true);
      console.log('🔄 AsyncStorage 로드 시작...');

      const allKeys = await AsyncStorage.getAllKeys();
      console.log('✅ 키 로드 완료:', allKeys.length, '개');
      console.log('키 목록:', allKeys);

      const allData = await Promise.all(
        allKeys.map(key => AsyncStorage.getItem(key).then(value => [key, value] as const))
      );
      console.log('✅ 데이터 로드 완료:', allData);
      console.log('데이터 타입:', typeof allData, '배열?', Array.isArray(allData));

      const storageItems: StorageItem[] = [];
      let total = 0;

      if (!Array.isArray(allData)) {
        throw new Error(`allData is not an array: ${typeof allData}`);
      }

      // forEach 대신 for 루프 사용 (더 안전)
      for (let index = 0; index < allData.length; index++) {
        try {
          const item = allData[index];
          console.log(`처리 중... [${index}]:`, item);

          if (!Array.isArray(item) || item.length < 2) {
            console.warn(`항목 ${index}은 유효한 [key, value] 쌍이 아님:`, item);
            continue;
          }

          const [key, value] = item;

          if (value) {
            const size = calculateSize(value);
            total += size;

            try {
              const parsed = JSON.parse(value);
              const type = Array.isArray(parsed) ? 'array' : typeof parsed;
              const summary = generateSummary(key, parsed, type);
              storageItems.push({
                key,
                value: JSON.stringify(parsed, null, 2),
                parsedValue: parsed,
                size,
                type: type as any,
                summary,
              });
            } catch {
              storageItems.push({
                key,
                value,
                parsedValue: value,
                size,
                type: 'string',
                summary: value.substring(0, 50),
              });
            }
          }
        } catch (itemErr) {
          console.error(`❌ 항목 ${index} 처리 실패:`, itemErr);
        }
      }

      setItems(storageItems.sort((a, b) => a.key.localeCompare(b.key)));
      setTotalSize(total);
      console.log('✅ AsyncStorage 로드 완료:', storageItems.length, '항목, 총', total, '바이트');
    } catch (error) {
      console.error('❌ AsyncStorage 로드 실패:', error);
      console.error('스택:', error instanceof Error ? error.stack : String(error));
      const errorMsg = error instanceof Error ? error.message : String(error);
      Alert.alert('오류', `AsyncStorage 로드 실패:\n${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };


  const generateSummary = (key: string, value: any, type: string): string => {
    if (type === 'array' && Array.isArray(value)) {
      return `${value.length}개 항목`;
    } else if (type === 'object' && typeof value === 'object') {
      const keys = Object.keys(value || {});
      return `${keys.length}개 속성`;
    } else if (typeof value === 'string') {
      return value.substring(0, 50);
    } else {
      return String(value).substring(0, 50);
    }
  };

  const formatJSONReadable = (value: any, depth = 0): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return `{${Object.keys(value).length} keys}`;
    return String(value);
  };

  const renderDetailContent = (value: any, type: string, formattedData?: any): React.ReactNode => {
    if (formattedData && formattedData.items && Array.isArray(formattedData.items)) {
      return (
        <View>
          {/* 통계 정보 */}
          {formattedData.stats && Object.keys(formattedData.stats).length > 0 && (
            <View style={styles.statsContainer}>
              <Text style={styles.detailSectionTitle}>📊 통계</Text>
              <View style={styles.statsGrid}>
                {Object.entries(formattedData.stats).map(([key, value], idx) => (
                  <View key={idx} style={styles.statItem}>
                    <Text style={styles.statLabel}>{key}</Text>
                    <Text style={styles.statValue}>{DataFormatter.formatNumber(value as any)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 데이터 항목 */}
          <Text style={styles.detailSectionTitle}>📋 항목 목록</Text>
          {formattedData.items.map((item: any, idx: number) => (
            <View key={item.id || idx} style={styles.detailItemCard}>
              <View style={styles.itemCardHeader}>
                <View style={{flex: 1}}>
                  <Text style={styles.itemCardLabel}>{item.label}</Text>
                  <Text style={styles.itemCardValue} numberOfLines={2}>{item.value}</Text>
                </View>
                {item.category && (
                  <View style={[styles.categoryBadge, {backgroundColor: getCategoryColor(item.category)}]}>
                    <Text style={styles.categoryBadgeText}>{item.category}</Text>
                  </View>
                )}
              </View>

              {/* 메타데이터 */}
              {item.metadata && Object.keys(item.metadata).length > 0 && (
                <View style={styles.metadataContainer}>
                  {Object.entries(item.metadata).map(([key, val], metaIdx) => (
                    <View key={metaIdx} style={styles.metadataRow}>
                      <Text style={styles.metadataKey}>{key}</Text>
                      <Text style={styles.metadataValue} numberOfLines={2}>{String(val)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      );
    }

    // Fallback to original rendering for non-formatted data
    if (type === 'array' && Array.isArray(value)) {
      return (
        <View>
          <Text style={styles.detailSectionTitle}>배열 항목 ({value.length}개)</Text>
          {value.slice(0, 10).map((item, idx) => (
            <View key={idx} style={styles.detailArrayItem}>
              <Text style={styles.detailArrayIndex}>[{idx}]</Text>
              <Text style={styles.detailArrayValue} numberOfLines={3}>
                {typeof item === 'string' ? item : JSON.stringify(item)}
              </Text>
            </View>
          ))}
          {value.length > 10 && (
            <Text style={styles.detailMoreText}>+ {value.length - 10}개 항목 더보기</Text>
          )}
        </View>
      );
    } else if (type === 'object' && typeof value === 'object') {
      return (
        <View>
          <Text style={styles.detailSectionTitle}>객체 속성</Text>
          {Object.entries(value || {}).map(([key, val], idx) => (
            <View key={idx} style={styles.detailObjectItem}>
              <Text style={styles.detailObjectKey}>{key}</Text>
              <Text style={styles.detailObjectValue} numberOfLines={2}>
                {typeof val === 'string' ? val : JSON.stringify(val)}
              </Text>
            </View>
          ))}
        </View>
      );
    } else {
      return (
        <Text style={styles.detailRawValue} selectable>
          {JSON.stringify(value, null, 2)}
        </Text>
      );
    }
  };

  /**
   * Get color for category badge
   */
  const getCategoryColor = (category: string): string => {
    const colors: {[key: string]: string} = {
      'word': '#8b5cf6',
      'score': '#0ea5e9',
      'paper': '#f59e0b',
      'interest': '#ec4899',
      'preference': '#14b8a6',
      'content': '#06b6d4',
      'trend': '#f97316',
      'progress': '#22c55e',
      'stat': '#6366f1',
    };
    return colors[category] || '#64748b';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'array':
        return '📋';
      case 'object':
        return '📦';
      case 'string':
        return '📝';
      case 'number':
        return '🔢';
      case 'boolean':
        return '✓';
      default:
        return '📄';
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>💾 데이터 보관소</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>AsyncStorage 로딩 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💾 데이터 보관소</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 요약 */}
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>저장된 항목</Text>
            <Text style={styles.summaryValue}>{items.length}개</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>총 크기</Text>
            <Text style={styles.summaryValue}>{formatSize(totalSize)}</Text>
          </View>
        </View>

        {/* 동기화 상태 섹션 */}
        <View style={styles.syncSection}>
          <Text style={styles.sectionTitle}>📡 동기화 및 백업</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={async () => {
              await runSyncCheck();
              setShowSyncStatus(true);
            }}
          >
            <Text style={styles.actionButtonText}>🔄 동기화 상태 확인</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={validateAllData}
          >
            <Text style={styles.actionButtonText}>✓ 데이터 검증</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={exportAllData}
          >
            <Text style={styles.actionButtonText}>⬇️ 데이터 내보내기</Text>
          </TouchableOpacity>

          {syncReport && !showSyncStatus && (
            <View style={styles.syncSummary}>
              <Text style={styles.syncLabel}>최근 동기화:</Text>
              <Text style={styles.syncValue}>
                {syncReport.successCount}/{syncReport.successCount + syncReport.failureCount} 성공
              </Text>
            </View>
          )}

          {showSyncStatus && syncReport && (
            <View style={styles.syncDetails}>
              <Text style={styles.syncDetailsTitle}>📊 동기화 상세</Text>
              {Object.entries(syncReport.sources).map(([key, source]) => (
                <View key={key} style={styles.syncItemContainer}>
                  <Text style={styles.syncItemName}>
                    {source.status === 'synced' && '🟢'}
                    {source.status === 'failed' && '🔴'}
                    {' '}
                    {source.name}
                  </Text>
                  <Text style={styles.syncItemInfo}>{source.itemCount}개 항목</Text>
                </View>
              ))}

              {validationResults && (
                <View style={styles.validationContainer}>
                  <Text style={styles.syncDetailsTitle}>✓ 검증 결과</Text>
                  {Object.entries(validationResults).map(([key, result]: any) => (
                    <View key={key} style={styles.validationItemContainer}>
                      <Text style={styles.validationItemName}>
                        {result.isValid ? '🟢' : '🔴'} {key.charAt(0).toUpperCase() + key.slice(1)}
                      </Text>
                      {result.errors.length > 0 && (
                        <Text style={styles.validationError}>에러: {result.errors.length}개</Text>
                      )}
                      {result.warnings.length > 0 && (
                        <Text style={styles.validationWarning}>경고: {result.warnings.length}개</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* 데이터 목록 */}
        <Text style={styles.sectionTitle}>📦 저장된 데이터 ({items.length}개)</Text>
        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>저장된 데이터가 없습니다</Text>
          </View>
        ) : (
          items.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.itemContainer}
              onPress={() => {
                const formattedData = DataFormatter.formatByCategory(item.key, item.parsedValue);
                setSelectedItem({
                  key: item.key,
                  value: item.parsedValue,
                  type: item.type,
                  size: formatSize(item.size),
                  formattedData: formattedData,
                });
                setShowDetailModal(true);
              }}
            >
              <View style={styles.itemHeader}>
                <View style={styles.itemTitleContainer}>
                  <Text style={styles.itemIcon}>{getTypeIcon(item.type)}</Text>
                  <View style={{flex: 1}}>
                    <Text style={styles.itemKey}>{item.key}</Text>
                    <Text style={styles.itemMeta}>
                      {item.type} • {formatSize(item.size)}
                    </Text>
                    {item.summary && (
                      <Text style={styles.itemSummary}>{item.summary}</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.clickHint}>→</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* 새로고침 버튼 */}
        <TouchableOpacity style={styles.refreshButton} onPress={loadStorageData}>
          <Text style={styles.refreshButtonText}>🔄 새로고침</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 상세 데이터 모달 */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowDetailModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <Text style={styles.modalCloseBtn}>✕ 닫기</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>📊 상세 데이터</Text>
            <View style={{width: 60}} />
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {selectedItem && (
              <View>
                {/* 헤더 정보 */}
                <View style={styles.detailHeader}>
                  <Text style={styles.detailHeaderIcon}>
                    {selectedItem.formattedData?.icon || getTypeIcon(selectedItem.type)}
                  </Text>
                  <View style={{flex: 1}}>
                    <Text style={styles.detailHeaderKey}>{selectedItem.key}</Text>
                    <Text style={styles.detailHeaderMeta}>
                      {selectedItem.formattedData?.summary || `타입: ${selectedItem.type} | 크기: ${selectedItem.size}`}
                    </Text>
                  </View>
                </View>

                {/* 데이터 내용 */}
                <View style={styles.detailContentWrapper}>
                  {renderDetailContent(selectedItem.value, selectedItem.type, selectedItem.formattedData)}
                </View>

                {/* 전체 JSON 보기는 제거됨 - 사용자 친화적 형식으로 표시됨 */}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  statsContainer: {
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statItem: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#8b5cf6',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  detailItemCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#8b5cf6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  itemCardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 3,
  },
  itemCardValue: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#8b5cf6',
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  metadataContainer: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  metadataKey: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    flex: 0.4,
  },
  metadataValue: {
    fontSize: 11,
    color: '#475569',
    flex: 0.6,
    textAlign: 'right',
  },
  detailMoreText: {
    fontSize: 11,
    color: '#8b5cf6',
    fontWeight: '600',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  content: {
    padding: 12,
    paddingBottom: 80,
  },
  summary: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#8b5cf6',
  },
  emptyContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  itemContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  itemTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  itemIcon: {
    fontSize: 20,
    marginTop: 2,
  },
  itemKey: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4,
  },
  itemSummary: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
    marginTop: 2,
  },
  clickHint: {
    fontSize: 16,
    color: '#cbd5e1',
    fontWeight: '600',
    marginLeft: 8,
  },
  itemContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
  },
  itemValue: {
    fontSize: 11,
    color: '#475569',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  refreshButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  syncSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8b5cf6',
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  syncSummary: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  syncLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 4,
  },
  syncValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
  },
  syncDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  syncDetailsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8b5cf6',
    marginBottom: 8,
  },
  syncItemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  syncItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  syncItemInfo: {
    fontSize: 11,
    color: '#94a3b8',
  },
  validationContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  validationItemContainer: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  validationItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  validationError: {
    fontSize: 11,
    color: '#dc2626',
    marginLeft: 12,
  },
  validationWarning: {
    fontSize: 11,
    color: '#ea580c',
    marginLeft: 12,
  },
  // Detail modal styles
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  detailArrayItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#0ea5e9',
  },
  detailArrayIndex: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0ea5e9',
    marginBottom: 4,
  },
  detailArrayValue: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  detailObjectItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#06b6d4',
  },
  detailObjectKey: {
    fontSize: 11,
    fontWeight: '700',
    color: '#06b6d4',
    marginBottom: 4,
  },
  detailObjectValue: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  detailRawValue: {
    fontSize: 11,
    color: '#475569',
    fontFamily: 'monospace',
    lineHeight: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    marginBottom: 16,
  },
  detailHeaderIcon: {
    fontSize: 28,
  },
  detailHeaderKey: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  detailHeaderMeta: {
    fontSize: 12,
    color: '#64748b',
  },
  detailContentWrapper: {
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  detailFooter: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  detailFooterTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  jsonScroll: {
    marginHorizontal: -16,
  },
  detailJSON: {
    fontSize: 10,
    color: '#64748b',
    fontFamily: 'monospace',
    paddingHorizontal: 16,
    lineHeight: 14,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHeader: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  modalCloseBtn: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 80,
  },
});
