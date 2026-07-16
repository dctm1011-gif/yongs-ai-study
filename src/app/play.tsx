import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Image, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PlayScreen() {
  const [trendingVideos, setTrendingVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrendingVideos();
  }, []);

  const fetchTrendingVideos = async () => {
    try {
      const response = await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/trending-videos');
      const data = await response.json();
      setTrendingVideos(data);
      setLoading(false);
    } catch (error) {
      console.log('Error fetching trending videos:', error);
      setLoading(false);
    }
  };

  const openYouTube = () => {
    Linking.openURL('https://www.youtube.com').catch(err =>
      Linking.openURL('https://www.youtube.com')
    );
  };

  const openYouTubePremium = () => {
    Linking.openURL('https://www.youtube.com/premium').catch(err =>
      Linking.openURL('https://www.youtube.com/premium')
    );
  };

  const openVideo = (videoUrl) => {
    Linking.openURL(videoUrl);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎮 놀이</Text>
        <Text style={styles.subtitle}>YouTube 콘텐츠</Text>
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          지금 한국에서{'\n'}
          가장 인기있는 영상
        </Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.loadingText}>영상 로딩 중...</Text>
          </View>
        ) : trendingVideos.length > 0 ? (
          <View style={styles.videosContainer}>
            {trendingVideos.slice(0, 3).map((video, index) => (
              <TouchableOpacity
                key={video.id}
                style={styles.videoCard}
                onPress={() => openVideo(video.url)}
              >
                <Image
                  source={{ uri: video.thumbnail }}
                  style={styles.thumbnail}
                />
                <View style={styles.videoInfo}>
                  <Text style={styles.videoTitle} numberOfLines={2}>
                    {video.title}
                  </Text>
                  <Text style={styles.videoChannel} numberOfLines={1}>
                    {video.channel}
                  </Text>
                  <Text style={styles.videoViews}>
                    조회수: {video.views}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.errorText}>영상을 불러올 수 없습니다</Text>
        )}

        <Text style={styles.description}>
          더 많은 콘텐츠를{'\n'}
          탐색하세요
        </Text>

        <TouchableOpacity style={styles.buttonYT} onPress={openYouTube}>
          <Text style={styles.buttonText}>▶️ YouTube 앱 열기</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buttonPremium} onPress={openYouTubePremium}>
          <Text style={styles.buttonText}>✨ YouTube Premium</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          매일 새로운 인기 영상이{'\n'}
          업데이트됩니다!
        </Text>
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
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    paddingVertical: 18,
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
  },
  subtitle: {
    fontSize: 14,
    color: '#e9d5ff',
    marginTop: 4,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  description: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 28,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
    fontWeight: '500',
  },
  videosContainer: {
    marginBottom: 24,
    gap: 12,
  },
  videoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  thumbnail: {
    width: '100%',
    height: 180,
    backgroundColor: '#e2e8f0',
  },
  videoInfo: {
    padding: 12,
  },
  videoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
    lineHeight: 20,
  },
  videoChannel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 6,
    fontWeight: '500',
  },
  videoViews: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  errorText: {
    color: '#e11d48',
    textAlign: 'center',
    marginVertical: 20,
    fontWeight: '500',
  },
  buttonYT: {
    backgroundColor: '#FF0000',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginBottom: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  buttonPremium: {
    backgroundColor: '#FFD700',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginBottom: 40,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 20,
    marginBottom: 20,
  },
});
