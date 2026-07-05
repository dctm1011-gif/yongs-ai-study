import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, View, Text, ActivityIndicator, TouchableOpacity, AsyncStorage, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CACHE_KEY = 'papers_data_cache';
const CACHE_TIMESTAMP_KEY = 'papers_data_timestamp';
const CACHE_DURATION = 60 * 60 * 1000;
const LIKES_KEY = 'papers_likes';
const READ_KEY = 'papers_read';

export default function PapersScreen() {
  const [papers, setPapers] = useState([]);
  const [filteredPapers, setFilteredPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [likes, setLikes] = useState(new Set<string>());
  const [read, setRead] = useState(new Set<string>());
  const [filter, setFilter] = useState<'all' | 'liked' | 'read'>('all');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterPapers();
  }, [papers, searchText, filter, likes, read]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [cachedPapers, cachedLikes, cachedRead] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEY),
        AsyncStorage.getItem(LIKES_KEY),
        AsyncStorage.getItem(READ_KEY),
      ]);

      const timestamp = await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY);
      const now = Date.now();

      const likesSet = cachedLikes ? new Set(JSON.parse(cachedLikes)) : new Set();
      const readSet = cachedRead ? new Set(JSON.parse(cachedRead)) : new Set();

      setLikes(likesSet);
      setRead(readSet);

      if (cachedPapers && timestamp) {
        const cachedTime = parseInt(timestamp, 10);
        if (now - cachedTime < CACHE_DURATION) {
          const papersData = JSON.parse(cachedPapers);
          setPapers(papersData);
          setLoading(false);
          return;
        }
      }

      await fetchAndCachePapers();
    } catch (error) {
      console.error('Failed to load papers:', error);
      setLoading(false);
    }
  };

  const fetchAndCachePapers = async () => {
    try {
      const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/papers/papers.json');
      const papersData = await response.json();

      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(papersData));
      await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

      setPapers(papersData);
    } catch (error) {
      console.error('Failed to fetch papers:', error);
      // 테스트 데이터
      const testPapers = [
        {
          id: '1',
          title: 'Sample Paper: Machine Learning',
          authors: ['John Doe', 'Jane Smith'],
          year: 2024,
          summary: 'This is a sample paper about machine learning and AI.',
        },
        {
          id: '2',
          title: 'Advanced Neural Networks',
          authors: ['Alice Johnson'],
          year: 2025,
          summary: 'A comprehensive study on neural network architectures.',
        },
      ];
      setPapers(testPapers);
    } finally {
      setLoading(false);
    }
  };

  const filterPapers = () => {
    let result = papers;

    if (searchText) {
      const search = searchText.toLowerCase();
      result = result.filter(
        (p) =>
          p.title?.toLowerCase().includes(search) ||
          p.authors?.some((a: string) => a.toLowerCase().includes(search)) ||
          p.summary?.toLowerCase().includes(search)
      );
    }

    if (filter === 'liked') {
      result = result.filter((p) => likes.has(p.id));
    } else if (filter === 'read') {
      result = result.filter((p) => read.has(p.id));
    }

    setFilteredPapers(result);
  };

  const toggleLike = async (paperId: string) => {
    const newLikes = new Set(likes);
    if (newLikes.has(paperId)) {
      newLikes.delete(paperId);
    } else {
      newLikes.add(paperId);
    }
    setLikes(newLikes);
    await AsyncStorage.setItem(LIKES_KEY, JSON.stringify(Array.from(newLikes)));
  };

  const toggleRead = async (paperId: string) => {
    const newRead = new Set(read);
    if (newRead.has(paperId)) {
      newRead.delete(paperId);
    } else {
      newRead.add(paperId);
    }
    setRead(newRead);
    await AsyncStorage.setItem(READ_KEY, JSON.stringify(Array.from(newRead)));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📄 논문 분류</Text>
      </View>

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="논문 검색..."
          placeholderTextColor="#9b9a97"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      <View style={styles.filterBar}>
        {(['all', 'liked', 'read'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[styles.filterText, filter === f && styles.filterTextActive]}
            >
              {f === 'all' ? '전체' : f === 'liked' ? '좋아요' : '읽음'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.countBox}>
        <Text style={styles.countText}>
          {filteredPapers.length} / {papers.length}
        </Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {filteredPapers.map((paper) => (
          <View key={paper.id} style={styles.paperCard}>
            <Text style={styles.paperTitle}>{paper.title}</Text>
            <Text style={styles.paperAuthors}>
              {Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors}
            </Text>
            <Text style={styles.paperYear}>{paper.year || 'N/A'}</Text>
            {paper.summary && (
              <Text style={styles.paperSummary} numberOfLines={3}>
                {paper.summary}
              </Text>
            )}

            <View style={styles.actionBar}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  likes.has(paper.id) && styles.actionBtnActive,
                ]}
                onPress={() => toggleLike(paper.id)}
              >
                <Text style={styles.actionIcon}>
                  {likes.has(paper.id) ? '❤️' : '🤍'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  read.has(paper.id) && styles.actionBtnActive,
                ]}
                onPress={() => toggleRead(paper.id)}
              >
                <Text style={styles.actionIcon}>
                  {read.has(paper.id) ? '✅' : '○'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 16,
    backgroundColor: '#8b5cf6',
    paddingVertical: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  searchBox: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9e9e7',
  },
  searchInput: {
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 44,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f0ef',
    borderRadius: 6,
    minHeight: 40,
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: '#0ea5e9',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9b9a97',
  },
  filterTextActive: {
    color: '#fff',
  },
  countBox: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  countText: {
    fontSize: 12,
    color: '#9b9a97',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  contentContainer: {
    paddingBottom: 160,
  },
  paperCard: {
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  paperTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    lineHeight: 20,
  },
  paperAuthors: {
    fontSize: 13,
    color: '#9b9a97',
    marginBottom: 4,
  },
  paperYear: {
    fontSize: 12,
    color: '#9b9a97',
    marginBottom: 8,
  },
  paperSummary: {
    fontSize: 13,
    color: '#37352f',
    marginBottom: 10,
    lineHeight: 18,
  },
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e9e9e7',
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f0ef',
    borderRadius: 6,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnActive: {
    backgroundColor: '#eff6ff',
  },
  actionIcon: {
    fontSize: 20,
  },
});
