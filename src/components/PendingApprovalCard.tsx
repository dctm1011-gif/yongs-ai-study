import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface PendingApproval {
  id: string;
  type: 'powershell' | 'build' | 'deploy';
  title: string;
  description: string;
  timestamp: Date;
  timeout?: number; // seconds
}

interface PendingApprovalCardProps {
  approval: PendingApproval;
  onApprove: (id: string) => Promise<void>;
  onDeny: (id: string) => Promise<void>;
}

export function PendingApprovalCard({
  approval,
  onApprove,
  onDeny,
}: PendingApprovalCardProps) {
  const [approving, setApproving] = useState(false);
  const [denying, setDenying] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await onApprove(approval.id);
    } catch (error) {
      Alert.alert('Error', 'Failed to approve. Please try again.');
      console.error('[PendingApprovalCard] Approve error:', error);
    } finally {
      setApproving(false);
    }
  };

  const handleDeny = async () => {
    setDenying(true);
    try {
      await onDeny(approval.id);
    } catch (error) {
      Alert.alert('Error', 'Failed to deny. Please try again.');
      console.error('[PendingApprovalCard] Deny error:', error);
    } finally {
      setDenying(false);
    }
  };

  const getTypeColor = (): string => {
    switch (approval.type) {
      case 'powershell':
        return '#3b82f6';
      case 'build':
        return '#f59e0b';
      case 'deploy':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  const getTypeIcon = (): string => {
    switch (approval.type) {
      case 'powershell':
        return 'terminal';
      case 'build':
        return 'build';
      case 'deploy':
        return 'cloud-upload';
      default:
        return 'info';
    }
  };

  const getTypeLabel = (): string => {
    switch (approval.type) {
      case 'powershell':
        return 'PowerShell';
      case 'build':
        return 'Build';
      case 'deploy':
        return 'Deploy';
      default:
        return 'Approval';
    }
  };

  return (
    <View style={[styles.card, { borderLeftColor: getTypeColor() }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View
            style={[
              styles.typeIcon,
              { backgroundColor: getTypeColor() + '20' },
            ]}
          >
            <MaterialIcons
              name={getTypeIcon() as any}
              size={18}
              color={getTypeColor()}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.type}>{getTypeLabel()}</Text>
            <Text style={styles.title}>{approval.title}</Text>
          </View>
        </View>
        <MaterialIcons name="hourglass-empty" size={18} color="#f59e0b" />
      </View>

      <Text style={styles.description}>{approval.description}</Text>

      <View style={styles.footer}>
        <Text style={styles.timestamp}>
          {approval.timestamp.toLocaleTimeString('ko-KR')}
        </Text>
        {approval.timeout && (
          <Text style={styles.timeout}>
            Timeout in {Math.ceil(approval.timeout / 1000)}s
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.denyButton]}
          onPress={handleDeny}
          disabled={approving || denying}
        >
          {denying ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <>
              <MaterialIcons name="close" size={16} color="#ef4444" />
              <Text style={styles.denyButtonText}>Deny</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.approveButton]}
          onPress={handleApprove}
          disabled={approving || denying}
        >
          {approving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="check" size={16} color="#fff" />
              <Text style={styles.approveButtonText}>Approve</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  type: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 2,
  },
  description: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  timestamp: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  timeout: {
    fontSize: 11,
    color: '#f59e0b',
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  denyButton: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  approveButton: {
    backgroundColor: '#10b981',
  },
  denyButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
  },
  approveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
