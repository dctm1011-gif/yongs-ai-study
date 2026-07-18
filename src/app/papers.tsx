import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Paper {
  id: string;
  title: string;
  headline: string;
  why_important: string;
  hbm_perspective: string;
  bookmarked: boolean;
  read: boolean;
}

type ViewType = 'list' | 'stats';
type FilterType = 'all' | 'bookmarked' | 'read';

const NETLIFY_BASE_URL = 'https://illustrious-cuchufli-7c4e58.netlify.app';
const USER_PREFS_JSON = 'https://illustrious-cuchufli-7c4e58.netlify.app/paper_search/user_prefs.json';
const COLUMN_NOTES_JSON = 'https://illustrious-cuchufli-7c4e58.netlify.app/paper_search/column_notes.json';

export default function PapersScreen() {
  const [view, setView] = useState<ViewType>('list');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [stats, setStats] = useState({ total: 0, read: 0, bookmarked: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    updateStats();
  }, [papers]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Fetch from Netlify
      const userPrefs = await fetchUserPrefs();
      const columnNotes = await fetchColumnNotes();

      if (userPrefs && userPrefs.liked && columnNotes) {
        // Build papers from liked list + column notes
        const likedPaperIds = userPrefs.liked || [];
        const savedPrefs = await AsyncStorage.getItem('papers_prefs');
        const prefs = savedPrefs ? JSON.parse(savedPrefs) : {};

        const papers_list = likedPaperIds
          .map((id: string) => {
            const notes = columnNotes[id];
            if (!notes) return null;
            return {
              id,
              title: formatTitle(id),
              headline: notes.headline || '',
              why_important: notes.why_important || '',
              hbm_perspective: notes.hbm_perspective || '',
              bookmarked: prefs[id]?.bookmarked || false,
              read: prefs[id]?.read || false,
            };
          })
          .filter((p: any) => p !== null) as Paper[];

        setPapers(papers_list);
        await AsyncStorage.setItem('papers', JSON.stringify(papers_list));
      } else {
        // Fallback to local data
        const savedPapers = await AsyncStorage.getItem('papers');
        if (savedPapers) {
          setPapers(JSON.parse(savedPapers));
        } else {
          setPapers(getDefaultPapers());
        }
      }
    } catch (error) {
      console.error('Failed to load Papers data:', error);
      setPapers(getDefaultPapers());
    } finally {
      setLoading(false);
    }
  };

  const fetchUserPrefs = async () => {
    try {
      const response = await fetch(USER_PREFS_JSON);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch user prefs:', error);
      return null;
    }
  };

  const fetchColumnNotes = async () => {
    try {
      const response = await fetch(COLUMN_NOTES_JSON);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch column notes:', error);
      return null;
    }
  };

  const formatTitle = (id: string): string => {
    return id.replace(/_/g, ' ').substring(0, 60);
  };

  const getDefaultPapers = (): Paper[] => [
    {
      id: 'paper_1',
      title: 'Power Supply Induced Jitter Model',
      headline: 'HBM 세대별 전원 노이즈 → 지터 변환 메커니즘의 정량적 분해',
      why_important: 'PSIJ는 HBM I/O 눈 다이어그램의 주요 원인...',
      hbm_perspective: 'HBM PHY 설계에서 PSIJ를 줄이는 것이 핵심...',
      bookmarked: false,
      read: false,
    },
  ];

  const savePapers = async (updatedPapers: Paper[]) => {
    setPapers(updatedPapers);
    await AsyncStorage.setItem('papers', JSON.stringify(updatedPapers));

    const prefs: any = {};
    updatedPapers.forEach(p => {
      prefs[p.id] = { bookmarked: p.bookmarked, read: p.read };
    });
    await AsyncStorage.setItem('papers_prefs', JSON.stringify(prefs));
  };

  const updateStats = () => {
    const read = papers.filter(p => p.read).length;
    const bookmarked = papers.filter(p => p.bookmarked).length;
    setStats({
      total: papers.length,
      read,
      bookmarked,
    });
  };

  const toggleRead = (paperId: string) => {
    const updated = papers.map(p =>
      p.id === paperId ? { ...p, read: !p.read } : p
    );
    savePapers(updated);
  };

  const toggleBookmark = (paperId: string) => {
    const updated = papers.map(p =>
      p.id === paperId ? { ...p, bookmarked: !p.bookmarked } : p
    );
    savePapers(updated);
  };

  const getFilteredPapers = () => {
    switch (filter) {
      case 'bookmarked':
        return papers.filter(p => p.bookmarked);
      case 'read':
        return papers.filter(p => p.read);
      default:
        return papers;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📄 연구 논문</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>취향 기반 논문을 로드하는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📄 연구 논문</Text>
        <Text style={styles.headerSubtitle}>내 취향 기반 {stats.total}개</Text>
      </View>

      {/* Tab buttons */}
      <View style={styles.tabButtons}>
        <TouchableOpacity
          style={[styles.tabButton, view === 'list' && styles.tabButtonActive]}
          onPress={() => setView('list')}
        >
          <Text style={[styles.tabButtonText, view === 'list' && styles.tabButtonTextActive]}>논문</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, view === 'stats' && styles.tabButtonActive]}
          onPress={() => setView('stats')}
        >
          <Text style={[styles.tabButtonText, view === 'stats' && styles.tabButtonTextActive]}>통계</Text>
        </TouchableOpacity>
      </View>

      {/* Filter buttons */}
      {view === 'list' && (
        <View style={styles.filterButtons}>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterButtonText, filter === 'all' && styles.filterButtonTextActive]}>전체</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'bookmarked' && styles.filterButtonActive]}
            onPress={() => setFilter('bookmarked')}
          >
            <Text style={[styles.filterButtonText, filter === 'bookmarked' && styles.filterButtonTextActive]}>북마크</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'read' && styles.filterButtonActive]}
            onPress={() => setFilter('read')}
          >
            <Text style={[styles.filterButtonText, filter === 'read' && styles.filterButtonTextActive]}>읽음</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Detail View */}
      {selectedPaper ? (
        <ScrollView style={styles.detailView}>
          <TouchableOpacity onPress={() => setSelectedPaper(null)} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 뒤로</Text>
          </TouchableOpacity>

          <Text style={styles.detailTitle}>{selectedPaper.headline}</Text>

          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>왜 중요한가?</Text>
            <Text style={styles.sectionContent}>{selectedPaper.why_important}</Text>
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>HBM 관점</Text>
            <Text style={styles.sectionContent}>{selectedPaper.hbm_perspective}</Text>
          </View>

          <View style={styles.detailActions}>
            <TouchableOpacity
              style={[styles.detailActionBtn, selectedPaper.read && styles.detailActionBtnActive]}
              onPress={() => {
                toggleRead(selectedPaper.id);
                setSelectedPaper({ ...selectedPaper, read: !selectedPaper.read });
              }}
            >
              <Text style={[styles.detailActionText, selectedPaper.read && styles.detailActionTextActive]}>
                {selectedPaper.read ? '✓ 읽음' : '읽음 표시'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.detailActionBtn, selectedPaper.bookmarked && styles.detailActionBtnActive]}
              onPress={() => {
                toggleBookmark(selectedPaper.id);
                setSelectedPaper({ ...selectedPaper, bookmarked: !selectedPaper.bookmarked });
              }}
            >
              <Text style={[styles.detailActionText, selectedPaper.bookmarked && styles.detailActionTextActive]}>
                {selectedPaper.bookmarked ? '🔖 북마크됨' : '🔖 북마크'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : view === 'list' ? (
        <FlatList
          data={getFilteredPapers()}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setSelectedPaper(item)} style={[styles.card, item.read && styles.cardRead]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitle}>
                  <Text style={styles.title} numberOfLines={2}>{item.headline}</Text>
                </View>
                <View style={styles.badges}>
                  {item.bookmarked && <Text style={styles.badge}>🔖</Text>}
                  {item.read && <Text style={styles.badge}>✓</Text>}
                </View>
              </View>

              <Text style={styles.subtitle} numberOfLines={3}>{item.why_important}</Text>

              <View style={styles.perspective}>
                <Text style={styles.perspectiveLabel}>HBM 관점</Text>
                <Text style={styles.perspectiveText} numberOfLines={2}>{item.hbm_perspective}</Text>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionBtn, item.read && styles.actionBtnActive]}
                  onPress={() => toggleRead(item.id)}
                >
                  <Text style={[styles.actionBtnText, item.read && styles.actionBtnTextActive]}>
                    {item.read ? '✓ 읽음' : '읽음'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, item.bookmarked && styles.bookmarkBtnActive]}
                  onPress={() => toggleBookmark(item.id)}
                >
                  <Text style={[styles.actionBtnText, item.bookmarked && styles.bookmarkBtnText]}>
                    {item.bookmarked ? '🔖' : '북마크'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>취향에 맞는 논문이 없습니다.</Text>
            </View>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.statsContent}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>전체 논문</Text>
            <Text style={styles.statValue}>{stats.total}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>읽은 논문</Text>
            <Text style={styles.statValue}>{stats.read}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>북마크</Text>
            <Text style={styles.statValue}>{stats.bookmarked}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>읽음률</Text>
            <Text style={styles.statValue}>
              {stats.total > 0 ? ((stats.read / stats.total) * 100).toFixed(1) : 0}%
            </Text>
          </View>
        </ScrollView>
      )}
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
    paddingVertical: 12,
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
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#ede9fe',
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
  tabButtons: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  tabButtonActive: {
    backgroundColor: '#8b5cf6',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  filterButtons: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 6,
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
  },
  filterButtonActive: {
    backgroundColor: '#8b5cf6',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 12,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: '#fff',
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#8b5cf6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  cardRead: {
    opacity: 0.5,
    backgroundColor: '#f1f5f9',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
    lineHeight: 18,
  },
  perspective: {
    backgroundColor: '#f3f0ff',
    borderLeftWidth: 3,
    borderLeftColor: '#8b5cf6',
    paddingLeft: 10,
    paddingVertical: 8,
    marginBottom: 10,
    borderRadius: 4,
  },
  perspectiveLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8b5cf6',
    marginBottom: 2,
  },
  perspectiveText: {
    fontSize: 11,
    color: '#6b7280',
    lineHeight: 16,
  },
  badges: {
    flexDirection: 'row',
    gap: 4,
  },
  badge: {
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    alignItems: 'center',
  },
  actionBtnActive: {
    backgroundColor: '#10b981',
  },
  bookmarkBtnActive: {
    backgroundColor: '#fbbf24',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  actionBtnTextActive: {
    color: '#fff',
  },
  bookmarkBtnText: {
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  statsContent: {
    padding: 16,
    paddingBottom: 100,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  statLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#8b5cf6',
  },
  detailView: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    lineHeight: 26,
  },
  detailSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8b5cf6',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  sectionContent: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
    paddingBottom: 40,
  },
  detailActionBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    alignItems: 'center',
  },
  detailActionBtnActive: {
    backgroundColor: '#8b5cf6',
  },
  detailActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  detailActionTextActive: {
    color: '#fff',
  },
});
