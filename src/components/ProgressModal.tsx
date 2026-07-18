import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface PhaseDetail {
  id: string;
  name: string;
  description: string;
  progress: number;
  status: 'pending' | 'in-progress' | 'completed';
  estimatedCompletion?: string;
  tasks?: string[];
  agentsRunning?: number;
  totalTimeEstimated?: string; // e.g., "5h 30m"
}

interface ProgressModalProps {
  visible: boolean;
  phase: PhaseDetail | null;
  onClose: () => void;
}

export function ProgressModal({ visible, phase, onClose }: ProgressModalProps) {
  if (!phase) return null;

  const getStatusEmoji = (status: string): string => {
    switch (status) {
      case 'completed':
        return '🟢';
      case 'in-progress':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return '#10b981';
      case 'in-progress':
        return '#3b82f6';
      default:
        return '#9ca3af';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in-progress':
        return 'In Progress';
      default:
        return 'Pending';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {getStatusEmoji(phase.status)} Phase {phase.id}
              </Text>
              <Text style={styles.modalSubtitle}>{phase.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Status Card */}
            <View style={styles.statusSection}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(phase.status) + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: getStatusColor(phase.status) },
                  ]}
                >
                  {getStatusLabel(phase.status)}
                </Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Overall Progress</Text>
                <Text style={styles.progressPercent}>{phase.progress}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${phase.progress}%`,
                      backgroundColor: getStatusColor(phase.status),
                    },
                  ]}
                />
              </View>
            </View>

            {/* Estimated Completion */}
            {phase.estimatedCompletion && (
              <View style={styles.infoCard}>
                <MaterialIcons name="event" size={18} color="#2563eb" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Estimated Completion</Text>
                  <Text style={styles.infoValue}>{phase.estimatedCompletion}</Text>
                </View>
              </View>
            )}

            {/* Total Time Estimated */}
            {phase.totalTimeEstimated && (
              <View style={styles.infoCard}>
                <MaterialIcons name="schedule" size={18} color="#2563eb" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Estimated Total Time</Text>
                  <Text style={styles.infoValue}>{phase.totalTimeEstimated}</Text>
                </View>
              </View>
            )}

            {/* Parallel Agents */}
            {phase.agentsRunning !== undefined && (
              <View style={styles.infoCard}>
                <MaterialIcons name="smart-toy" size={18} color="#2563eb" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Parallel Agents Running</Text>
                  <Text style={styles.infoValue}>{phase.agentsRunning} agents</Text>
                </View>
              </View>
            )}

            {/* Description */}
            {phase.description && (
              <View style={styles.descriptionSection}>
                <Text style={styles.descriptionTitle}>Description</Text>
                <Text style={styles.descriptionText}>{phase.description}</Text>
              </View>
            )}

            {/* Tasks */}
            {phase.tasks && phase.tasks.length > 0 && (
              <View style={styles.tasksSection}>
                <Text style={styles.tasksTitle}>Tasks</Text>
                <View style={styles.tasksList}>
                  {phase.tasks.map((task, index) => (
                    <View key={index} style={styles.taskItem}>
                      <Text style={styles.taskBullet}>▸</Text>
                      <Text style={styles.taskText}>{task}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <TouchableOpacity style={styles.closeModalButton} onPress={onClose}>
            <Text style={styles.closeModalButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statusSection: {
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  progressPercent: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0c4a6e',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e40af',
    marginTop: 2,
  },
  descriptionSection: {
    marginBottom: 16,
  },
  descriptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
  },
  tasksSection: {
    marginBottom: 16,
  },
  tasksTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  tasksList: {
    gap: 8,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  taskBullet: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
    marginTop: 2,
  },
  taskText: {
    fontSize: 13,
    color: '#64748b',
    flex: 1,
    lineHeight: 18,
  },
  closeModalButton: {
    margin: 16,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
