import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

interface TrendingItem {
  id: string;
  title: string;
  category: string;
  description: string;
  platform: string;
  timestamp: string;
  likes: number;
  mentions?: number;
}

const DEFAULT_TRENDS: TrendingItem[] = [
  {
    id: '1',
    title: '한국 날씨 폭염 경고 발령',
    category: '#뉴스',
    description: '전국 대부분 지역에 폭염 경고가 발령되었습니다.',
    platform: 'Instagram',
    timestamp: new Date().toISOString(),
    likes: 15420,
  },
  {
    id: '2',
    title: '신곡 "Summer Breeze" 뮤직비디오 공개',
    category: '#음악',
    description: '유명 가수가 새로운 여름 노래 뮤직비디오를 공개했습니다.',
    platform: 'YouTube',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    likes: 8923,
  },
  {
    id: '3',
    title: '2026년 월드컵 한국팀 신명부 발표',
    category: '#뉴스',
    description: '한국 축구 국가대표팀의 월드컵 최종 신명부가 발표되었습니다.',
    platform: 'Twitter',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    likes: 22150,
  },
];

export default function PlayScreen() {
  const [trends, setTrends] = useState<TrendingItem[]>(DEFAULT_TRENDS);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    fetchTrends();
  }, []);

  const fetchTrends = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        'https://illustrious-cuchufli-7c4e58.netlify.app/api/fetch-trends',
        { method: 'GET' }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      if (data.success && data.trends && Array.isArray(data.trends)) {
        setTrends(data.trends);
        setLastUpdate(new Date());
        console.log('[PlayScreen] Fetched trends:', data.trends.length);
      } else {
        setTrends(DEFAULT_TRENDS);
      }
    } catch (error) {
      console.error('[PlayScreen] Failed to fetch trends:', error);
      setTrends(DEFAULT_TRENDS);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  const openYouTube = () => {
    Linking.openURL('https://www.youtube.com');
  };

  const openYouTubePremium = () => {
    Linking.openURL('https://www.youtube.com/premium');
  };

  const openLink = (platform: string) => {
    const urls: Record<string, string> = {
      Instagram: 'https://www.instagram.com',
      YouTube: 'https://www.youtube.com',
      Twitter: 'https://www.twitter.com',
    };
    if (urls[platform]) {
      Linking.openURL(urls[platform]);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>🎮 Play</Text>
          <Text style={styles.subtitle}>Trending Topics & News</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={fetchTrends}
          disabled={loading}
        >
          <MaterialIcons
            name={loading ? 'hourglass-empty' : 'refresh'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchTrends} />}
      >
        <Text style={styles.sectionTitle}>
          🔥 Korean Trending Topics
        </Text>
        <Text style={styles.sectionDesc}>
          Daily updates from Instagram, YouTube, Twitter - 6:00 AM KST
        </Text>

        {lastUpdate && (
          <View style={styles.lastUpdateCard}>
            <MaterialIcons name="access-time" size={14} color="#1e40af" />
            <Text style={styles.lastUpdateText}>
              Last updated: {lastUpdate.toLocaleTimeString('ko-KR')}
            </Text>
          </View>
        )}

        <View style={styles.trendingsContainer}>
          {trends.map((trend, index) => (
            <TouchableOpacity
              key={trend.id}
              style={styles.trendCard}
              onPress={() => openLink(trend.platform)}
            >
              <View style={styles.rankSection}>
                <View
                  style={[
                    styles.rankBadge,
                    {
                      backgroundColor:
                        index === 0 ? '#fbbf24' : index === 1 ? '#c0c0c0' : '#cd7f32',
                    },
                  ]}
                >
                  <Text style={styles.rankNumber}>#{index + 1}</Text>
                </View>
              </View>

              <View style={styles.trendInfo}>
                <View style={styles.trendHeader}>
                  <Text style={styles.categoryBadge}>{trend.category}</Text>
                  <Text style={styles.platform}>📱 {trend.platform}</Text>
                </View>

                <Text style={styles.trendTitle} numberOfLines={2}>
                  {trend.title}
                </Text>

                <Text style={styles.trendDesc} numberOfLines={2}>
                  {trend.description}
                </Text>

                <View style={styles.trendFooter}>
                  <View style={styles.statItem}>
                    <MaterialIcons name="favorite" size={14} color="#ef4444" />
                    <Text style={styles.statText}>
                      {(trend.likes / 1000).toFixed(1)}K
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <MaterialIcons name="access-time" size={14} color="#6b7280" />
                    <Text style={styles.statText}>{formatTime(trend.timestamp)}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle} style={{ marginTop: 32 }}>
          Quick Links
        </Text>

        <TouchableOpacity style={styles.buttonYT} onPress={openYouTube}>
          <MaterialIcons name="play-circle" size={20} color="#fff" />
          <Text style={styles.buttonText}>YouTube</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buttonIG} onPress={() => openLink('Instagram')}>
          <MaterialIcons name="camera" size={20} color="#fff" />
          <Text style={styles.buttonText}>Instagram</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buttonTW} onPress={() => openLink('Twitter')}>
          <MaterialIcons name="share" size={20} color="#fff" />
          <Text style={styles.buttonText}>Twitter</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <MaterialIcons name="info" size={16} color="#4b5563" />
          <Text style={styles.footerText}>
            Trending data updates daily at 6:00 AM KST. Pull down to refresh manually.
          </Text>
        </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#7c3aed',
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
    color: '#e9d5ff',
    marginTop: 4,
    fontWeight: '600',
  },
  refreshButton: {
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  sectionDesc: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
    lineHeight: 22,
  },
  lastUpdateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  lastUpdateText: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '600',
  },
  trendingsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  trendCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rankSection: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  trendInfo: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 12,
    justifyContent: 'space-between',
  },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366f1',
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  platform: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  trendTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
    lineHeight: 20,
  },
  trendDesc: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
    lineHeight: 16,
  },
  trendFooter: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
  },
  buttonYT: {
    flexDirection: 'row',
    backgroundColor: '#FF0000',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  buttonIG: {
    flexDirection: 'row',
    backgroundColor: '#e4405f',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  buttonTW: {
    flexDirection: 'row',
    backgroundColor: '#1da1f2',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 24,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  footerText: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
    fontWeight: '500',
  },
});
