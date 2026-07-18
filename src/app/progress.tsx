import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useProgressSync } from '../hooks/useProgressSync';

export default function ProgressScreen() {
  const { progressData, loading, error, lastSyncTime, sync, getStatusEmoji } = useProgressSync();
  const [refreshing, setRefreshing] = useState(false);
  const [syncMinutesAgo, setSyncMinutesAgo] = useState<number | null>(null);

  // Update sync time display every minute
  useEffect(() => {
    const updateSyncDisplay = () => {
      if (lastSyncTime) {
        const now = new Date();
        const diffMs = now.getTime() - lastSyncTime.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        setSyncMinutesAgo(diffMins);
      }
    };

    updateSyncDisplay();
    const interval = setInterval(updateSyncDisplay, 60000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await sync();
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const formatSyncTime = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const formatBuildTime = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>📊 Plan Progress</Text>
          <Text style={styles.subtitle}>Phase A-F Development Status</Text>
        </View>
        <TouchableOpacity style={styles.syncButton} onPress={handleRefresh} disabled={loading}>
          <MaterialIcons
            name={refreshing ? 'hourglass-empty' : 'refresh'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Sync Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusTitle}>🔄 Auto-Sync Status</Text>
            <View
              style={[
                styles.syncIndicator,
                { backgroundColor: error ? '#ef4444' : '#10b981' },
              ]}
            />
          </View>
          <Text style={styles.statusText}>{formatSyncTime(lastSyncTime)}</Text>
          {syncMinutesAgo !== null && (
            <Text style={styles.syncDetailText}>
              Last sync: {syncMinutesAgo === 0 ? 'Just now' : `${syncMinutesAgo}m ago`} • Every 5 minutes
            </Text>
          )}
          {error && <Text style={styles.errorText}>Error: {error}</Text>}
        </View>

        {/* Build Info */}
        <View style={styles.infoCard}>
          <MaterialIcons name="build" size={16} color="#2563eb" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Latest Build Time</Text>
            <Text style={styles.infoValue}>{formatBuildTime(progressData?.buildTime)}</Text>
          </View>
        </View>

        {/* Tab Progress */}
        {progressData?.tabProgress && (
          <View>
            <Text style={styles.phasesTitle}>📚 Learning Progress</Text>
            <View style={styles.tabProgressContainer}>
              <View style={styles.tabProgressItem}>
                <View style={styles.tabProgressHeader}>
                  <Text style={styles.tabProgressLabel}>English</Text>
                  <Text style={styles.tabProgressPercent}>{progressData.tabProgress.english}%</Text>
                </View>
                <View style={styles.tabProgressBar}>
                  <View
                    style={[
                      styles.tabProgressBarFill,
                      {
                        width: `${progressData.tabProgress.english}%`,
                        backgroundColor: '#3b82f6',
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.tabProgressItem}>
                <View style={styles.tabProgressHeader}>
                  <Text style={styles.tabProgressLabel}>TOEFL</Text>
                  <Text style={styles.tabProgressPercent}>{progressData.tabProgress.toefl}%</Text>
                </View>
                <View style={styles.tabProgressBar}>
                  <View
                    style={[
                      styles.tabProgressBarFill,
                      {
                        width: `${progressData.tabProgress.toefl}%`,
                        backgroundColor: '#8b5cf6',
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.tabProgressItem}>
                <View style={styles.tabProgressHeader}>
                  <Text style={styles.tabProgressLabel}>Papers</Text>
                  <Text style={styles.tabProgressPercent}>{progressData.tabProgress.papers}%</Text>
                </View>
                <View style={styles.tabProgressBar}>
                  <View
                    style={[
                      styles.tabProgressBarFill,
                      {
                        width: `${progressData.tabProgress.papers}%`,
                        backgroundColor: '#10b981',
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Phases */}
        <Text style={styles.phasesTitle}>🎯 Development Phases</Text>

        {loading && !progressData ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading phase data...</Text>
          </View>
        ) : progressData ? (
          progressData.phases.map((phase, index) => (
            <View key={phase.id} style={styles.phaseCard}>
              <View style={styles.phaseHeader}>
                <View style={styles.phaseTitle}>
                  <Text style={styles.phaseName}>
                    {getStatusEmoji(phase.status)} Phase {phase.id}
                  </Text>
                  <Text style={styles.phaseDescription}>{phase.name}</Text>
                </View>
                <Text style={styles.progressPercent}>{phase.progress}%</Text>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${phase.progress}%`,
                      backgroundColor: getPhaseColor(phase.status),
                    },
                  ]}
                />
              </View>

              {/* Status Badge */}
              <View style={styles.phaseFooter}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusBgColor(phase.status) },
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {phase.status === 'completed'
                      ? '✓ Completed'
                      : phase.status === 'in-progress'
                        ? '⏱ In Progress'
                        : '○ Pending'}
                  </Text>
                </View>
                {phase.description && (
                  <Text style={styles.phaseDesc} numberOfLines={2}>
                    {phase.description}
                  </Text>
                )}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No phase data available</Text>
          </View>
        )}

        {/* Sync Info */}
        <View style={styles.syncInfoCard}>
          <MaterialIcons name="info" size={16} color="#6b7280" />
          <View style={styles.syncInfoContent}>
            <Text style={styles.syncInfoTitle}>Auto-Sync Enabled</Text>
            <Text style={styles.syncInfoDesc}>
              Progress data syncs every 5 minutes. Pull down to refresh manually.
            </Text>
          </View>
        </View>

        <View style={styles.footer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getPhaseColor(status: string): string {
  switch (status) {
    case 'completed':
      return '#10b981';
    case 'in-progress':
      return '#3b82f6';
    default:
      return '#e5e7eb';
  }
}

function getStatusBgColor(status: string): string {
  switch (status) {
    case 'completed':
      return '#d1fae5';
    case 'in-progress':
      return '#dbeafe';
    default:
      return '#f3f4f6';
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e40af',
    paddingHorizontal: 16,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#bfdbfe',
    marginTop: 4,
    fontWeight: '600',
  },
  syncButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  syncIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  syncDetailText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '700',
    marginTop: 2,
  },
  tabProgressContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    gap: 12,
  },
  tabProgressItem: {
    gap: 6,
  },
  tabProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tabProgressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  tabProgressPercent: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
  },
  tabProgressBar: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  tabProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  phasesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  phaseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  phaseTitle: {
    flex: 1,
  },
  phaseName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  phaseDescription: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  progressPercent: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563eb',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  phaseFooter: {
    gap: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  phaseDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  syncInfoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 12,
    marginTop: 24,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  syncInfoContent: {
    flex: 1,
  },
  syncInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803d',
  },
  syncInfoDesc: {
    fontSize: 12,
    color: '#4b5563',
    marginTop: 2,
    lineHeight: 16,
  },
  footer: {
    height: 40,
  },
});
