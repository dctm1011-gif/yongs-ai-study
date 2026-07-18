import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDataSyncMonitor } from '../hooks/useDataSyncMonitor';
import { DataIntegrityValidator } from '../utils/DataIntegrityValidator';

interface StorageItem {
  key: string;
  value: string;
  size: number;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
}

export default function StorageScreen() {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSize, setTotalSize] = useState(0);
  const { report: syncReport, runSyncCheck } = useDataSyncMonitor();
  const [showSyncStatus, setShowSyncStatus] = useState(false);
  const [validationResults, setValidationResults] = useState<any>(null);

  useEffect(() => {
    loadStorageData();
  }, []);

  const exportAllData = async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const allData = await AsyncStorage.multiGet(allKeys);

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

      const allData = await AsyncStorage.multiGet(allKeys);
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
              storageItems.push({
                key,
                value: JSON.stringify(parsed, null, 2),
                size,
                type: type as any,
              });
            } catch {
              storageItems.push({
                key,
                value,
                size,
                type: 'string',
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
        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>저장된 데이터가 없습니다</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.key} style={styles.itemContainer}>
              <View style={styles.itemHeader}>
                <View style={styles.itemTitleContainer}>
                  <Text style={styles.itemIcon}>{getTypeIcon(item.type)}</Text>
                  <View>
                    <Text style={styles.itemKey}>{item.key}</Text>
                    <Text style={styles.itemMeta}>
                      {item.type} • {formatSize(item.size)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.itemContent}>
                <Text style={styles.itemValue} numberOfLines={10}>
                  {item.value.length > 500 ? item.value.substring(0, 500) + '...' : item.value}
                </Text>
              </View>
            </View>
          ))
        )}

        {/* 새로고침 버튼 */}
        <TouchableOpacity style={styles.refreshButton} onPress={loadStorageData}>
          <Text style={styles.refreshButtonText}>🔄 새로고침</Text>
        </TouchableOpacity>
      </ScrollView>
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
    alignItems: 'center',
    gap: 12,
  },
  itemIcon: {
    fontSize: 20,
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
});
