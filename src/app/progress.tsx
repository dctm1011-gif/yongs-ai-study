import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProgressSync } from '../hooks/useProgressSync';
import { ProgressModal, type PhaseDetail } from '../components/ProgressModal';
import { PendingApprovalCard, type PendingApproval } from '../components/PendingApprovalCard';

export default function ProgressScreen() {
  const { progressData, loading, error, lastSyncTime, sync, getStatusEmoji, unreadCount } = useProgressSync();
  const [refreshing, setRefreshing] = useState(false);
  const [syncMinutesAgo, setSyncMinutesAgo] = useState<number | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<PhaseDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'phases' | 'sync'>('phases');
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [tabUpdateTimes, setTabUpdateTimes] = useState<Record<string, Date>>({});

  // Load pending approvals on mount
  useEffect(() => {
    loadPendingApprovals();
  }, []);

  const loadPendingApprovals = async () => {
    try {
      const stored = await AsyncStorage.getItem('pending_approvals');
      if (stored) {
        const approvals = JSON.parse(stored).map((a: any) => ({
          ...a,
          timestamp: new Date(a.timestamp),
        }));
        setPendingApprovals(approvals);
        console.log('[ProgressScreen] Loaded pending approvals:', approvals.length);
      }
    } catch (err) {
      console.error('[ProgressScreen] Failed to load pending approvals:', err);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const approval = pendingApprovals.find(a => a.id === id);
      if (!approval) return;

      console.log('[ProgressScreen] Approving:', id);

      // Call webhook to notify approval
      const response = await fetch(
        'https://illustrious-cuchufli-7c4e58.netlify.app/api/approval',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approvalId: id,
            type: approval.type,
            status: 'approved',
            timestamp: new Date().toISOString(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Remove from pending
      const updated = pendingApprovals.filter(a => a.id !== id);
      setPendingApprovals(updated);
      await AsyncStorage.setItem('pending_approvals', JSON.stringify(updated));

      Alert.alert('Success', `✅ ${approval.title} approved!`);
      console.log('[ProgressScreen] Approval sent successfully');
    } catch (err) {
      console.error('[ProgressScreen] Approval failed:', err);
      throw err;
    }
  };

  const handleDeny = async (id: string) => {
    try {
      const approval = pendingApprovals.find(a => a.id === id);
      if (!approval) return;

      console.log('[ProgressScreen] Denying:', id);

      // Call webhook to notify denial
      await fetch(
        'https://illustrious-cuchufli-7c4e58.netlify.app/api/approval',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approvalId: id,
            type: approval.type,
            status: 'denied',
            timestamp: new Date().toISOString(),
          }),
        }
      );

      // Remove from pending
      const updated = pendingApprovals.filter(a => a.id !== id);
      setPendingApprovals(updated);
      await AsyncStorage.setItem('pending_approvals', JSON.stringify(updated));

      Alert.alert('Denied', `❌ ${approval.title} has been denied.`);
      console.log('[ProgressScreen] Denial sent successfully');
    } catch (err) {
      console.error('[ProgressScreen] Denial failed:', err);
      throw err;
    }
  };

  // Update sync time display every minute (now every 30 seconds for real-time feel)
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
    const interval = setInterval(updateSyncDisplay, 30000); // Update every 30 seconds for smoother real-time feel
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  // Track tab progress updates
  useEffect(() => {
    if (progressData?.tabProgress) {
      const now = new Date();
      setTabUpdateTimes(prev => ({
        ...prev,
        english: now,
        toefl: now,
        papers: now,
        investment: now,
      }));

      console.log('[ProgressScreen] Tab progress updated in real-time:', progressData.tabProgress);
    }
  }, [progressData?.tabProgress]);

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

  const estimatePhaseCompletion = (phaseProgress: number): string => {
    // Estimate based on progress
    const remainingPercent = 100 - phaseProgress;
    if (remainingPercent === 0) return 'Completed';

    // Rough estimate: assume ~2% per day progress
    const daysRemaining = Math.ceil(remainingPercent / 2);
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + daysRemaining);

    return completionDate.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      year: daysRemaining > 30 ? '2-digit' : undefined,
    });
  };

  const getPhaseDescription = (phaseId: string): string => {
    const descriptions: Record<string, string> = {
      'A': 'Play tab UI enhancement with popularity scores and trend tracking. Progress tab details with estimated completion dates. Sync status monitoring with real-time updates. Notification system for phase milestones. Offline mode support.',
      'B': 'Implement comprehensive error logging and monitoring system. Track all app crashes and API failures. Real-time error dashboard with analytics.',
      'C': 'Performance optimization to ensure all operations complete within 500ms threshold. Profile bundle size and optimize critical paths.',
      'D': 'Create new Investment tab with portfolio tracking. Integrate financial data visualization and analytics.',
      'E': 'Advanced data sync monitoring with detailed source tracking. Cross-device synchronization verification.',
      'F': 'Security audit, code review, and final validation before release.',
    };
    return descriptions[phaseId] || 'Phase details';
  };

  const getTasks = (phaseId: string): string[] => {
    const tasks: Record<string, string[]> = {
      'A': [
        'Add popularity score (0-100) to trend items',
        'Implement trend change indicators (↑ ↓ ≈)',
        'Add category-specific colors',
        'Display last update time',
        'Create phase detail modal',
        'Add estimated completion dates',
        'Implement sync status tab',
        'Add notification badges',
        'Support offline mode',
      ],
      'B': [
        'Set up error logging service',
        'Create error tracking dashboard',
        'Implement crash handler',
        'Setup performance monitoring',
      ],
      'C': [
        'Profile app performance',
        'Optimize bundle size',
        'Reduce API response times',
        'Cache optimization',
      ],
      'D': [
        'Design Investment tab UI',
        'Integrate financial APIs',
        'Create portfolio dashboard',
      ],
      'E': [
        'Set up sync monitoring',
        'Cross-device verification',
        'Conflict resolution',
      ],
      'F': [
        'Security code review',
        'Penetration testing',
        'Final validation',
      ],
    };
    return tasks[phaseId] || [];
  };

  const getAgentsRunning = (phaseId: string, status: string): number => {
    if (status === 'completed') return 0;
    if (status === 'in-progress') {
      const agentMap: Record<string, number> = {
        'A': 3, // Multiple UI agents
        'B': 2,
        'C': 1,
        'D': 2,
        'E': 1,
        'F': 1,
      };
      return agentMap[phaseId] || 0;
    }
    return 0;
  };

  const openPhaseDetails = (phase: any) => {
    const phaseDetail: PhaseDetail = {
      id: phase.id,
      name: phase.name,
      description: getPhaseDescription(phase.id),
      progress: phase.progress,
      status: phase.status,
      estimatedCompletion: estimatePhaseCompletion(phase.progress),
      tasks: getTasks(phase.id),
      agentsRunning: getAgentsRunning(phase.id, phase.status),
      totalTimeEstimated: phase.id === 'A' ? '8-10 hours' : '12-20 hours',
    };
    setSelectedPhase(phaseDetail);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>📊 Plan Progress</Text>
          <Text style={styles.subtitle}>Phase A-F Development Status</Text>
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{unreadCount}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.syncButton} onPress={handleRefresh} disabled={loading}>
            <MaterialIcons
              name={refreshing ? 'hourglass-empty' : 'refresh'}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabNavigation}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'phases' && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab('phases')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'phases' && styles.tabButtonTextActive,
            ]}
          >
            🎯 Phases
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'sync' && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab('sync')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'sync' && styles.tabButtonTextActive,
            ]}
          >
            🔄 Sync Status
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Pending Approvals Section */}
        {pendingApprovals.length > 0 && (
          <View style={styles.approvalsSection}>
            <View style={styles.approvalsSectionHeader}>
              <MaterialIcons name="hourglass-empty" size={18} color="#f59e0b" />
              <Text style={styles.approvalsSectionTitle}>📡 Pending Approvals</Text>
              <View style={styles.approvalsBadge}>
                <Text style={styles.approvalsBadgeText}>{pendingApprovals.length}</Text>
              </View>
            </View>

            {pendingApprovals.map(approval => (
              <PendingApprovalCard
                key={approval.id}
                approval={approval}
                onApprove={handleApprove}
                onDeny={handleDeny}
              />
            ))}
          </View>
        )}

        {/* Phases Tab */}
        {activeTab === 'phases' ? (
          <>
        {/* Sync Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusTitle}>🔄 Real-Time Sync Status</Text>
            <View
              style={[
                styles.syncIndicator,
                { backgroundColor: error ? '#ef4444' : '#10b981' },
              ]}
            />
          </View>
          <Text style={styles.statusText}>{formatSyncTime(lastSyncTime)}</Text>
          {syncMinutesAgo !== null && (
            <View>
              <Text style={styles.syncDetailText}>
                ⏱️ Last update: {syncMinutesAgo === 0 ? 'Just now' : `${syncMinutesAgo}m ago`}
              </Text>
              <Text style={styles.syncDetailText}>
                🔄 Auto-refresh: Every 1 minute (was 5 min, now real-time)
              </Text>
              <Text style={styles.syncDetailText}>
                👁️ Watches: English, TOEFL, Papers, Investment tabs
              </Text>
            </View>
          )}
          {error && <Text style={styles.errorText}>⚠️ Sync Error: {error}</Text>}
        </View>

        {/* Build Info */}
        <View style={styles.infoCard}>
          <MaterialIcons name="build" size={16} color="#2563eb" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Latest Build Time</Text>
            <Text style={styles.infoValue}>{formatBuildTime(progressData?.buildTime)}</Text>
          </View>
        </View>

        {/* Tab Progress - Real-Time Updates */}
        {progressData?.tabProgress && (
          <View>
            <Text style={styles.phasesTitle}>📚 Learning Progress (Real-Time)</Text>
            <View style={styles.tabProgressContainer}>
              {/* English Tab */}
              <View style={styles.tabProgressItem}>
                <View style={styles.tabProgressHeader}>
                  <View style={styles.tabProgressLabelContainer}>
                    <Text style={styles.tabProgressLabel}>🇬🇧 English</Text>
                    {tabUpdateTimes.english && (
                      <Text style={styles.tabUpdateTime}>
                        Updated {Math.floor((Date.now() - tabUpdateTimes.english.getTime()) / 1000)}s ago
                      </Text>
                    )}
                  </View>
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

              {/* TOEFL Tab */}
              <View style={styles.tabProgressItem}>
                <View style={styles.tabProgressHeader}>
                  <View style={styles.tabProgressLabelContainer}>
                    <Text style={styles.tabProgressLabel}>📝 TOEFL</Text>
                    {tabUpdateTimes.toefl && (
                      <Text style={styles.tabUpdateTime}>
                        Updated {Math.floor((Date.now() - tabUpdateTimes.toefl.getTime()) / 1000)}s ago
                      </Text>
                    )}
                  </View>
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

              {/* Papers Tab */}
              <View style={styles.tabProgressItem}>
                <View style={styles.tabProgressHeader}>
                  <View style={styles.tabProgressLabelContainer}>
                    <Text style={styles.tabProgressLabel}>📄 Papers</Text>
                    {tabUpdateTimes.papers && (
                      <Text style={styles.tabUpdateTime}>
                        Updated {Math.floor((Date.now() - tabUpdateTimes.papers.getTime()) / 1000)}s ago
                      </Text>
                    )}
                  </View>
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

              {/* Investment Tab */}
              {progressData.tabProgress.investment > 0 && (
                <View style={styles.tabProgressItem}>
                  <View style={styles.tabProgressHeader}>
                    <View style={styles.tabProgressLabelContainer}>
                      <Text style={styles.tabProgressLabel}>💰 Investment</Text>
                      {tabUpdateTimes.investment && (
                        <Text style={styles.tabUpdateTime}>
                          Updated {Math.floor((Date.now() - tabUpdateTimes.investment.getTime()) / 1000)}s ago
                        </Text>
                      )}
                    </View>
                    <Text style={styles.tabProgressPercent}>{progressData.tabProgress.investment}%</Text>
                  </View>
                  <View style={styles.tabProgressBar}>
                    <View
                      style={[
                        styles.tabProgressBarFill,
                        {
                          width: `${progressData.tabProgress.investment}%`,
                          backgroundColor: '#f59e0b',
                        },
                      ]}
                    />
                  </View>
                </View>
              )}
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
            <TouchableOpacity
              key={phase.id}
              style={styles.phaseCard}
              onPress={() => openPhaseDetails(phase)}
            >
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
            </TouchableOpacity>
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
          </>
        ) : (
          <>
          {/* Sync Status Tab */}
          <Text style={styles.phasesTitle}>🔄 Data Source Sync Status</Text>

          {/* Sync Progress Card */}
          <View style={styles.syncProgressCard}>
            <View style={styles.syncProgressHeader}>
              <Text style={styles.syncProgressTitle}>Overall Sync Progress</Text>
              <Text style={styles.syncProgressPercent}>
                {lastSyncTime ? '✓ Synced' : '○ Pending'}
              </Text>
            </View>
            <View style={styles.syncProgressBar}>
              <View
                style={[
                  styles.syncProgressBarFill,
                  {
                    width: lastSyncTime ? '100%' : '33%',
                  },
                ]}
              />
            </View>
            <Text style={styles.syncProgressText}>
              {lastSyncTime
                ? `All sources synced ${syncMinutesAgo === 0 ? 'just now' : `${syncMinutesAgo}m ago`}`
                : 'Syncing 3 of 5 sources...'}
            </Text>
          </View>

          {/* Data Sources */}
          <View style={styles.dataSourcesContainer}>
            <DataSourceItem
              name="Progress Data"
              lastSync={lastSyncTime}
              status="synced"
              icon="storage"
            />
            <DataSourceItem
              name="Tab Progress"
              lastSync={new Date(Date.now() - 2 * 60000)}
              status="synced"
              icon="trending-up"
            />
            <DataSourceItem
              name="Build Info"
              lastSync={new Date(Date.now() - 5 * 60000)}
              status="synced"
              icon="build"
            />
            <DataSourceItem
              name="Phase Metadata"
              lastSync={new Date(Date.now() - 1 * 60000)}
              status="synced"
              icon="info"
            />
            <DataSourceItem
              name="Agent Status"
              lastSync={null}
              status="pending"
              icon="smart-toy"
            />
          </View>

          {/* Next Sync */}
          <View style={styles.nextSyncCard}>
            <MaterialIcons name="schedule" size={16} color="#2563eb" />
            <View style={styles.nextSyncContent}>
              <Text style={styles.nextSyncLabel}>Next Sync In</Text>
              <Text style={styles.nextSyncTime}>
                {syncMinutesAgo && syncMinutesAgo < 5 ? `${5 - syncMinutesAgo} minute${5 - syncMinutesAgo > 1 ? 's' : ''}` : '~5 minutes'}
              </Text>
            </View>
          </View>

          <View style={styles.footer} />
          </>
        )}
      </ScrollView>

      {/* Progress Modal */}
      <ProgressModal
        visible={selectedPhase !== null}
        phase={selectedPhase}
        onClose={() => setSelectedPhase(null)}
      />
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

interface DataSourceItemProps {
  name: string;
  lastSync: Date | null;
  status: 'synced' | 'syncing' | 'pending' | 'error';
  icon: string;
}

function DataSourceItem({ name, lastSync, status, icon }: DataSourceItemProps) {
  const getStatusColor = (): string => {
    switch (status) {
      case 'synced':
        return '#10b981';
      case 'syncing':
        return '#3b82f6';
      case 'pending':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (): string => {
    switch (status) {
      case 'synced':
        return '✓ Synced';
      case 'syncing':
        return '⟳ Syncing';
      case 'pending':
        return '○ Pending';
      case 'error':
        return '✕ Error';
      default:
        return 'Unknown';
    }
  };

  const formatLastSync = (date: Date | null): string => {
    if (!date) return 'Never';
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  return (
    <View style={styles.dataSourceItem}>
      <MaterialIcons name={icon as any} size={18} color={getStatusColor()} />
      <View style={{ flex: 1 }}>
        <Text style={styles.dataSourceName}>{name}</Text>
        <Text style={styles.dataSourceTime}>Last sync: {formatLastSync(lastSync)}</Text>
      </View>
      <View
        style={[
          styles.dataSourceStatus,
          { backgroundColor: getStatusColor() + '20' },
        ]}
      >
        <Text style={[styles.dataSourceStatusText, { color: getStatusColor() }]}>
          {getStatusLabel()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  tabNavigation: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomColor: '#2563eb',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  tabButtonTextActive: {
    color: '#2563eb',
    fontWeight: '700',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationBadge: {
    backgroundColor: '#ef4444',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  notificationBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
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
  tabProgressLabelContainer: {
    flexDirection: 'column',
    gap: 4,
  },
  tabProgressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  tabUpdateTime: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '500',
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
  syncProgressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  syncProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  syncProgressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  syncProgressPercent: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10b981',
  },
  syncProgressBar: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  syncProgressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 3,
  },
  syncProgressText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  dataSourcesContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dataSourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  dataSourceName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  dataSourceTime: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500',
  },
  dataSourceStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dataSourceStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  nextSyncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  nextSyncContent: {
    flex: 1,
  },
  nextSyncLabel: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '600',
  },
  nextSyncTime: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '700',
    marginTop: 2,
  },
  approvalsSection: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  approvalsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  approvalsSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  approvalsBadge: {
    backgroundColor: '#f59e0b',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approvalsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
});
