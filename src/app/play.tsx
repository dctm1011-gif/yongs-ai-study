import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TRENDING_VIDEOS = [
  {
    id: 'dQw4w9WgXcQ',
    title: '지금 한국에서 인기있는 영상을 로드 중입니다...',
    channel: 'YouTube Korea',
    thumbnail: 'https://via.placeholder.com/320x180',
    views: '1.2M',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
];

export default function PlayScreen() {
  const openYouTube = () => {
    Linking.openURL('https://www.youtube.com');
  };

  const openYouTubePremium = () => {
    Linking.openURL('https://www.youtube.com/premium');
  };

  const openVideo = (videoUrl) => {
    Linking.openURL(videoUrl);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎮 놀이</Text>
        <Text style={styles.subtitle}>오늘의 추천 영상</Text>
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>
          🔥 지금 한국에서 인기있는 영상
        </Text>
        <Text style={styles.sectionDesc}>
          매일 새로운 트렌딩 영상이 자동 업데이트됩니다
        </Text>

        <View style={styles.videosContainer}>
          {TRENDING_VIDEOS.map((video, index) => (
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
                <Text style={styles.rankBadge}>#{index + 1}</Text>
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

        <Text style={styles.sectionTitle} style={{marginTop: 32}}>
          YouTube 앱 열기
        </Text>

        <TouchableOpacity style={styles.buttonYT} onPress={openYouTube}>
          <Text style={styles.buttonText}>▶️ YouTube 앱 열기</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buttonPremium} onPress={openYouTubePremium}>
          <Text style={styles.buttonText}>✨ YouTube Premium</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            매일 오전 6시에 자동 업데이트되는{'\n'}
            한국 트렌딩 영상을 즐겨보세요!
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
    paddingVertical: 24,
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
    marginBottom: 20,
    lineHeight: 22,
  },
  videosContainer: {
    gap: 12,
    marginBottom: 32,
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
  rankBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  videoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
    lineHeight: 21,
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
  footer: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    marginBottom: 20,
  },
  footerText: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
});
