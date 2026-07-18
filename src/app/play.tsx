import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cacheManager } from '../utils/CacheManager';

interface TrendingItem {
  id: string;
  title: string;
  category: string;
  description: string;
  platform: string;
  timestamp: string;
  likes: number;
  mentions?: number;
  popularity?: number; // 0-100 score
  trendChange?: 'up' | 'down' | 'stable'; // Trend direction
  previousRank?: number; // Previous rank position
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
    popularity: 92,
    trendChange: 'up',
    previousRank: 2,
  },
  {
    id: '2',
    title: '신곡 "Summer Breeze" 뮤직비디오 공개',
    category: '#음악',
    description: '유명 가수가 새로운 여름 노래 뮤직비디오를 공개했습니다.',
    platform: 'YouTube',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    likes: 8923,
    popularity: 78,
    trendChange: 'stable',
    previousRank: 2,
  },
  {
    id: '3',
    title: '2026년 월드컵 한국팀 신명부 발표',
    category: '#뉴스',
    description: '한국 축구 국가대표팀의 월드컵 최종 신명부가 발표되었습니다.',
    platform: 'Twitter',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    likes: 22150,
    popularity: 88,
    trendChange: 'down',
    previousRank: 1,
  },
];

const PLAY_TRENDS_CACHE_KEY = 'play_trends_cache';
const PLAY_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export default function PlayScreen() {
  const [trends, setTrends] = useState<TrendingItem[]>(DEFAULT_TRENDS);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<'fresh' | 'cached' | 'offline'>('fresh');
  const [hasNewTrends, setHasNewTrends] = useState(false);

  useEffect(() => {
    fetchTrends();
    // Set TTL for Play trends cache
    cacheManager.setTTL(PLAY_TRENDS_CACHE_KEY, PLAY_CACHE_TTL);
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
        setIsCached(false);
        setCacheStatus('fresh');
        setHasNewTrends(true); // Show new trends badge
        // Reset badge after 3 seconds
        setTimeout(() => setHasNewTrends(false), 3000);
        // Cache the fresh data
        await cacheManager.set(PLAY_TRENDS_CACHE_KEY, {
          trends: data.trends,
          timestamp: new Date().toISOString(),
        });
        console.log('[PlayScreen] Fetched fresh trends:', data.trends.length);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('[PlayScreen] API fetch failed:', error);
      // Step 2: Try to load from cache
      await loadFromCache();
    } finally {
      setLoading(false);
    }
  };

  const loadFromCache = async () => {
    try {
      const cached = await cacheManager.get<{
        trends: TrendingItem[];
        timestamp: string;
      }>(PLAY_TRENDS_CACHE_KEY);

      if (cached && cached.trends && Array.isArray(cached.trends)) {
        setTrends(cached.trends);
        setLastUpdate(new Date(cached.timestamp));
        setIsCached(true);
        setCacheStatus('cached');
        console.log('[PlayScreen] Loaded from cache:', cached.trends.length);
      } else {
        // Step 3: Use default data
        setTrends(DEFAULT_TRENDS);
        setCacheStatus('offline');
        console.log('[PlayScreen] Using default data (no cache)');
      }
    } catch (err) {
      console.error('[PlayScreen] Cache load failed:', err);
      // Fallback to default
      setTrends(DEFAULT_TRENDS);
      setCacheStatus('offline');
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

  // External links removed - focus on content display only

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case '#뉴스':
        return '#ef4444'; // Red for news
      case '#음악':
        return '#10b981'; // Green for music
      case '#영상':
        return '#3b82f6'; // Blue for videos
      default:
        return '#6366f1'; // Indigo for others
    }
  };

  const getTrendChangeIcon = (trend?: string): string => {
    switch (trend) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      default:
        return '≈';
    }
  };

  const getTrendChangeColor = (trend?: string): string => {
    switch (trend) {
      case 'up':
        return '#10b981';
      case 'down':
        return '#ef4444';
      default:
        return '#94a3b8';
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>🎮 Play</Text>
          <Text style={styles.subtitle}>Trending Topics & News</Text>
        </View>
        <View style={styles.headerActions}>
          {hasNewTrends && (
            <View style={styles.newTrendsBadge}>
              <Text style={styles.newTrendsBadgeText}>✨ New</Text>
            </View>
          )}
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

        {/* Offline Mode Banner */}
        {cacheStatus === 'offline' && (
          <View style={styles.offlineBanner}>
            <MaterialIcons name="cloud-off" size={16} color="#ef4444" />
            <Text style={styles.offlineBannerText}>
              📵 Offline Mode - Using cached data
            </Text>
          </View>
        )}

        {/* Cache Status Badge */}
        {lastUpdate && (
          <View
            style={[
              styles.lastUpdateCard,
              {
                borderLeftColor:
                  cacheStatus === 'fresh'
                    ? '#10b981'
                    : cacheStatus === 'cached'
                      ? '#f59e0b'
                      : '#ef4444',
              },
            ]}
          >
            <MaterialIcons
              name={
                cacheStatus === 'fresh'
                  ? 'cloud-done'
                  : cacheStatus === 'cached'
                    ? 'cloud-queue'
                    : 'cloud-off'
              }
              size={14}
              color={
                cacheStatus === 'fresh'
                  ? '#10b981'
                  : cacheStatus === 'cached'
                    ? '#f59e0b'
                    : '#ef4444'
              }
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.lastUpdateText}>
                📅 Last Updated: {lastUpdate.toLocaleTimeString('ko-KR')}
              </Text>
              <Text style={styles.cacheStatusText}>
                {cacheStatus === 'fresh'
                  ? '✓ Live Data'
                  : cacheStatus === 'cached'
                    ? `⚠ Cached (${Math.floor((Date.now() - lastUpdate.getTime()) / 60000)}m ago)`
                    : '✗ Offline Mode'}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.trendingsContainer}>
          {trends.map((trend, index) => (
            <View
              key={trend.id}
              style={styles.trendCard}
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
                {trend.trendChange && trend.trendChange !== 'stable' && (
                  <View
                    style={[
                      styles.trendChangeIcon,
                      {
                        backgroundColor:
                          trend.trendChange === 'up'
                            ? 'rgba(16, 185, 129, 0.1)'
                            : 'rgba(239, 68, 68, 0.1)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.trendChangeText,
                        { color: getTrendChangeColor(trend.trendChange) },
                      ]}
                    >
                      {getTrendChangeIcon(trend.trendChange)}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.trendInfo}>
                <View style={styles.trendHeader}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Text
                      style={[
                        styles.categoryBadge,
                        { backgroundColor: getCategoryColor(trend.category) + '20', color: getCategoryColor(trend.category) },
                      ]}
                    >
                      {trend.category}
                    </Text>
                    {trend.popularity !== undefined && (
                      <View style={styles.popularityBadge}>
                        <Text style={styles.popularityText}>
                          🔥 {trend.popularity}%
                        </Text>
                      </View>
                    )}
                  </View>
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
                  {trend.mentions !== undefined && (
                    <View style={styles.statItem}>
                      <MaterialIcons name="chat-bubble" size={14} color="#2563eb" />
                      <Text style={styles.statText}>
                        {(trend.mentions / 1000).toFixed(1)}K
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>

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
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fecaca',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  offlineBannerText: {
    fontSize: 13,
    color: '#7f1d1d',
    fontWeight: '600',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newTrendsBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  newTrendsBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
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
    borderLeftWidth: 4,
  },
  lastUpdateText: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '600',
  },
  cacheStatusText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
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
    gap: 8,
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
  trendChangeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendChangeText: {
    fontSize: 18,
    fontWeight: '800',
  },
  popularityBadge: {
    backgroundColor: '#fef08a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  popularityText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#854d0e',
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
