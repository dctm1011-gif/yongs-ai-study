import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Announcement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success';
  importance: 'normal' | 'high' | 'critical';
  createdAt: string;
  expiresAt?: string | null;
}

export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // 공지사항 로드
  const loadAnnouncements = useCallback(async () => {
    try {
      const response = await fetch(
        'https://illustrious-cuchufli-7c4e58.netlify.app/api/announcements',
        { method: 'GET' }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const raw = await response.json();
      const data: Announcement[] = Array.isArray(raw) ? raw : Object.values(raw);
      const now = new Date();

      // 만료된 공지사항 필터링
      const active = data.filter((a: Announcement) =>
        !a.expiresAt || new Date(a.expiresAt) > now
      );

      setAnnouncements(active);

      // 읽지 않은 공지사항 개수 계산
      const readIds = await getReadIds();
      const unread = active.filter((a: Announcement) => !readIds.has(a.id)).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error('[useAnnouncements] Failed to load:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 공지사항 읽음 표시
  const markAsRead = useCallback(async (id: string) => {
    const readIds = await getReadIds();
    if (readIds.has(id)) return;
    readIds.add(id);
    await AsyncStorage.setItem('readAnnouncements', JSON.stringify([...readIds]));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // 읽음 상태 초기화
  const clearReadStatus = useCallback(async () => {
    await AsyncStorage.removeItem('readAnnouncements');
    setUnreadCount(announcements.length);
  }, [announcements]);

  // 앱 시작 시 로드
  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  return {
    announcements,
    unreadCount,
    loading,
    loadAnnouncements,
    markAsRead,
    clearReadStatus,
  };
}

// 읽은 공지사항 ID 목록
async function getReadIds(): Promise<Set<string>> {
  try {
    const saved = await AsyncStorage.getItem('readAnnouncements');
    return new Set(saved ? JSON.parse(saved) : []);
  } catch {
    return new Set();
  }
}
