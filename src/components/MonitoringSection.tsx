import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useMonitoringSync } from '../hooks/useMonitoringSync';

export default function MonitoringSection() {
  const { data, history, loading, error, stats, refetch } = useMonitoringSync();
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const updateMonitoringData = async () => {
    try {
      setUpdating(true);
      const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/api/monitoring-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) console.warn('Monitoring update status:', response.status);
    } catch (err) {
      console.error('Monitoring update error:', err);
    } finally {
      setUpdating(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'ok':
        return '#4CAF50'; // 초록색
      case 'error':
        return '#FF5252'; // 빨강색
      case 'timeout':
        return '#FFC107'; // 노랑색
      default:
        return '#9E9E9E'; // 회색
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'ok':
        return '✅ 연결 OK';
      case 'error':
        return '❌ 에러';
      case 'timeout':
        return '⏱️ 타임아웃';
      default:
        return '❌ 알 수 없음';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>🔗 실시간 모니터링</Text>
      <Text style={styles.description}>
        Netlify 함수의 응답 상태를 실시간으로 모니터링합니다. (10초 주기)
      </Text>

      {/* 업데이트 버튼 */}
      <TouchableOpacity
        style={[styles.updateButton, updating && styles.updateButtonDisabled]}
        onPress={updateMonitoringData}
        disabled={updating}
      >
        <Text style={styles.updateButtonText}>
          {updating ? '⏳ 업데이트 중...' : '🔄 Firebase 데이터 업데이트'}
        </Text>
      </TouchableOpacity>

      {/* 현재 상태 카드 */}
      <ScrollView
        scrollEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        style={styles.contentContainer}
      >
        <View style={styles.card}>
          {loading && !data ? (
            <Text style={styles.loadingText}>⏳ 로딩 중...</Text>
          ) : (
            <>
              {/* 상태 표시 */}
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusIndicator,
                    { backgroundColor: getStatusColor(data?.status) },
                  ]}
                />
                <Text style={styles.statusText}>{getStatusLabel(data?.status)}</Text>
              </View>

              {/* 응답 시간 */}
              {data?.responseTime !== undefined && (
                <View style={styles.dataRow}>
                  <Text style={styles.label}>⏱️ 응답 시간:</Text>
                  <Text style={styles.value}>{data.responseTime}ms</Text>
                </View>
              )}

              {/* 현재 값 */}
              {data?.value !== undefined && (
                <View style={styles.dataRow}>
                  <Text style={styles.label}>📊 현재 값:</Text>
                  <Text style={styles.value}>{data.value}</Text>
                </View>
              )}

              {/* 마지막 업데이트 */}
              {data?.timestamp && (
                <View style={styles.dataRow}>
                  <Text style={styles.label}>🕐 마지막 업데이트:</Text>
                  <Text style={styles.value}>
                    {new Date(data.timestamp).toLocaleTimeString('ko-KR')}
                  </Text>
                </View>
              )}

              {/* 센서 데이터 */}
              {data?.randomData && (
                <View style={styles.sensorContainer}>
                  <Text style={styles.sensorTitle}>📈 센서 데이터:</Text>
                  <View style={styles.sensorRow}>
                    <Text style={styles.sensorLabel}>🌡️ 온도:</Text>
                    <Text style={styles.sensorValue}>
                      {parseFloat(data.randomData.temperature.toString()).toFixed(1)}°C
                    </Text>
                  </View>
                  <View style={styles.sensorRow}>
                    <Text style={styles.sensorLabel}>💻 CPU:</Text>
                    <Text style={styles.sensorValue}>
                      {parseFloat(data.randomData.cpu.toString()).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.sensorRow}>
                    <Text style={styles.sensorLabel}>🧠 메모리:</Text>
                    <Text style={styles.sensorValue}>
                      {parseFloat(data.randomData.memory.toString()).toFixed(1)}%
                    </Text>
                  </View>
                </View>
              )}

              {/* 에러 메시지 */}
              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>❌ {error}</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* 통계 */}
        {stats && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 통계</Text>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>평균 응답 시간:</Text>
              <Text style={styles.statValue}>{stats.avgResponseTime}ms</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>최대 응답 시간:</Text>
              <Text style={styles.statValue}>{stats.maxResponseTime}ms</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>최소 응답 시간:</Text>
              <Text style={styles.statValue}>{stats.minResponseTime}ms</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>데이터 포인트:</Text>
              <Text style={styles.statValue}>{history.length}개</Text>
            </View>
          </View>
        )}

        {/* 히스토리 */}
        {history.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              📜 최근 업데이트 ({history.length}개)
            </Text>
            <FlatList
              scrollEnabled={false}
              data={history.slice().reverse()}
              keyExtractor={(item, idx) => `${item.timestamp}-${idx}`}
              renderItem={({ item }) => (
                <View style={styles.historyRow}>
                  <Text style={styles.historyTime}>
                    {new Date(item.timestamp).toLocaleTimeString('ko-KR')}
                  </Text>
                  <Text style={styles.historyValue}>{item.value}</Text>
                  <Text style={styles.historyResponse}>{item.responseTime}ms</Text>
                </View>
              )}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  description: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  contentContainer: {
    maxHeight: 600,
  },
  card: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  label: {
    fontSize: 12,
    color: '#666',
  },
  value: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  sensorContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  sensorTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    color: '#333',
  },
  sensorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sensorLabel: {
    fontSize: 11,
    color: '#666',
  },
  sensorValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0066cc',
  },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  errorText: {
    fontSize: 11,
    color: '#c62828',
  },
  loadingText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    padding: 12,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyTime: {
    fontSize: 11,
    color: '#999',
    flex: 1,
  },
  historyValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  historyResponse: {
    fontSize: 11,
    color: '#0066cc',
    flex: 1,
    textAlign: 'right',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  updateButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  updateButtonDisabled: {
    opacity: 0.6,
  },
  updateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
