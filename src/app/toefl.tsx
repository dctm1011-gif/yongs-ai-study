import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, View, Text, ActivityIndicator, TouchableOpacity, AsyncStorage } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CACHE_KEY = 'toefl_data_cache';
const CACHE_TIMESTAMP_KEY = 'toefl_data_timestamp';
const CACHE_DURATION = 60 * 60 * 1000;

export default function ToeflScreen() {
  const [reading, setReading] = useState(null);
  const [writing, setWriting] = useState(null);
  const [speaking, setSpeaking] = useState(null);
  const [listening, setListening] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'reading' | 'writing' | 'speaking' | 'listening'>('reading');

  useEffect(() => {
    loadToeflData();
    checkForUpdates();
  }, []);

  const loadToeflData = async () => {
    try {
      setLoading(true);
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      const timestamp = await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY);
      const now = Date.now();

      if (cached && timestamp) {
        const cachedTime = parseInt(timestamp, 10);
        if (now - cachedTime < CACHE_DURATION) {
          const data = JSON.parse(cached);
          setReading(data.reading);
          setWriting(data.writing);
          setSpeaking(data.speaking);
          setListening(data.listening);
          setLoading(false);
          return;
        }
      }

      await fetchAndCacheToeflData();
    } catch (error) {
      console.error('Failed to load TOEFL data:', error);
      setLoading(false);
    }
  };

  const fetchAndCacheToeflData = async () => {
    try {
      const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/toefl/index.html');
      const html = await response.text();

      const readingMatch = html.match(/const READING = (\{[\s\S]*?\});/);
      const writingMatch = html.match(/const WRITING = (\{[\s\S]*?\});/);
      const speakingMatch = html.match(/const SPEAKING = (\{[\s\S]*?\});/);
      const listeningMatch = html.match(/const LISTENING = (\{[\s\S]*?\});/);

      if (readingMatch && writingMatch && speakingMatch && listeningMatch) {
        const data = {
          reading: JSON.parse(readingMatch[1]),
          writing: JSON.parse(writingMatch[1]),
          speaking: JSON.parse(speakingMatch[1]),
          listening: JSON.parse(listeningMatch[1])
        };

        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
        await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

        setReading(data.reading);
        setWriting(data.writing);
        setSpeaking(data.speaking);
        setListening(data.listening);
      }
    } catch (error) {
      console.error('Failed to fetch TOEFL data:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkForUpdates = async () => {
    try {
      const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/toefl/index.html');
      const html = await response.text();

      const readingMatch = html.match(/const READING = (\{[\s\S]*?\});/);
      const writingMatch = html.match(/const WRITING = (\{[\s\S]*?\});/);
      const speakingMatch = html.match(/const SPEAKING = (\{[\s\S]*?\});/);
      const listeningMatch = html.match(/const LISTENING = (\{[\s\S]*?\});/);

      if (readingMatch && writingMatch && speakingMatch && listeningMatch) {
        const data = {
          reading: JSON.parse(readingMatch[1]),
          writing: JSON.parse(writingMatch[1]),
          speaking: JSON.parse(speakingMatch[1]),
          listening: JSON.parse(listeningMatch[1])
        };

        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
        await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      }
    } catch (error) {
      // 백그라운드 오류 무시
    }
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
        <Text style={styles.title}>🎓 TOEFL</Text>
      </View>

      <View style={styles.tabBar}>
        {(['reading', 'writing', 'speaking', 'listening'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, currentTab === tab && styles.tabBtnActive]}
            onPress={() => setCurrentTab(tab)}
          >
            <Text style={[styles.tabText, currentTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {currentTab === 'reading' && reading && <SectionContent data={reading} title="Reading" />}
        {currentTab === 'writing' && writing && <SectionContent data={writing} title="Writing" />}
        {currentTab === 'speaking' && speaking && <SectionContent data={speaking} title="Speaking" />}
        {currentTab === 'listening' && listening && <SectionContent data={listening} title="Listening" />}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionContent({ data, title }: { data: any; title: string }) {
  return (
    <View>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionText}>{JSON.stringify(data, null, 2)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    backgroundColor: '#f59e0b',
    paddingVertical: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#e9e9e7',
    paddingHorizontal: 16,
  },
  tabBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginRight: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabBtnActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#f59e0b',
    marginBottom: -2,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9b9a97',
  },
  tabTextActive: {
    color: '#37352f',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionCard: {
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#e9e9e7',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 16,
    color: '#37352f',
    lineHeight: 24,
  },
});
