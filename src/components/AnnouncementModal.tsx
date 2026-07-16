import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import type { Announcement } from '../hooks/useAnnouncements';

interface AnnouncementModalProps {
  visible: boolean;
  announcements: Announcement[];
  onClose: () => void;
  onMarkAsRead: (id: string) => void;
}

export function AnnouncementModal({
  visible,
  announcements,
  onClose,
  onMarkAsRead,
}: AnnouncementModalProps) {
  if (!announcements.length) return null;

  // 중요도 순으로 정렬 (critical > high > normal)
  const sorted = [...announcements].sort((a, b) => {
    const priority = { critical: 0, high: 1, normal: 2 };
    return priority[a.importance] - priority[b.importance];
  });

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📢 공지사항</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {sorted.map((announcement) => (
            <View
              key={announcement.id}
              style={[styles.card, styles[`card_${announcement.importance}`]]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{announcement.title}</Text>
                <Text style={styles.badge}>{getIcon(announcement.type)}</Text>
              </View>

              <Text style={styles.cardMessage}>{announcement.message}</Text>

              <View style={styles.cardFooter}>
                <Text style={styles.date}>
                  {new Date(announcement.createdAt).toLocaleDateString('ko-KR')}
                </Text>
                <TouchableOpacity
                  onPress={() => onMarkAsRead(announcement.id)}
                  style={styles.readButton}
                >
                  <Text style={styles.readButtonText}>읽음</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              모든 공지사항을 확인했습니다
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.confirmButton}>
              <Text style={styles.confirmButtonText}>확인</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function getIcon(type: string): string {
  switch (type) {
    case 'success':
      return '✅';
    case 'warning':
      return '⚠️';
    case 'info':
    default:
      return 'ℹ️';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 24,
    color: '#64748b',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  card_critical: {
    borderLeftColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  card_high: {
    borderLeftColor: '#f59e0b',
    backgroundColor: '#fffbf0',
  },
  card_normal: {
    borderLeftColor: '#3b82f6',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  badge: {
    fontSize: 18,
    marginLeft: 8,
  },
  cardMessage: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    color: '#94a3b8',
  },
  readButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#e0f2fe',
    borderRadius: 6,
  },
  readButtonText: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '600',
  },
  footer: {
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
