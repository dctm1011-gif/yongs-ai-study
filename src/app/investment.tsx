import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Dimensions,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useInvestmentSync, InvestmentProperty, UserInvestmentPreferences } from '../hooks/useInvestmentSync';

const { width } = Dimensions.get('window');

interface PropertyCardProps {
  property: InvestmentProperty;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onPress: () => void;
}

const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  isFavorite,
  onToggleFavorite,
  onPress,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return '#10b981';
      case 'pending':
        return '#f59e0b';
      case 'sold':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getROIColor = (roi: number) => {
    if (roi > 3) return '#10b981';
    if (roi > 2) return '#3b82f6';
    return '#f59e0b';
  };

  const formatPrice = (price: number) => {
    if (price >= 1000000000) {
      return `${(price / 1000000000).toFixed(1)}억`;
    }
    return `${(price / 1000000).toFixed(0)}백만`;
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleSection}>
          <Text style={styles.propertyName} numberOfLines={2}>
            {property.name}
          </Text>
          <View style={styles.locationBadge}>
            <MaterialIcons name="location-on" size={14} color="#6b7280" />
            <Text style={styles.location}>{property.location}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={onToggleFavorite}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons
            name={isFavorite ? 'favorite' : 'favorite-border'}
            size={24}
            color={isFavorite ? '#ef4444' : '#d1d5db'}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.cardMetrics}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>ROI</Text>
          <Text style={[styles.metricValue, { color: getROIColor(property.roi) }]}>
            {property.roi.toFixed(1)}%
          </Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>가격</Text>
          <Text style={styles.metricValue}>{formatPrice(property.price)}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>타입</Text>
          <Text style={styles.metricValue}>{getPropertyTypeKorean(property.type)}</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>상태</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(property.status) },
            ]}
          >
            <Text style={styles.statusText}>{getStatusKorean(property.status)}</Text>
          </View>
        </View>
      </View>

      {property.bedrooms && property.bathrooms && property.area && (
        <View style={styles.cardDetails}>
          <View style={styles.detailItem}>
            <MaterialIcons name="king-bed" size={16} color="#6b7280" />
            <Text style={styles.detailText}>{property.bedrooms}침</Text>
          </View>
          <View style={styles.detailItem}>
            <MaterialIcons name="shower" size={16} color="#6b7280" />
            <Text style={styles.detailText}>{property.bathrooms}욕</Text>
          </View>
          <View style={styles.detailItem}>
            <MaterialIcons name="square-foot" size={16} color="#6b7280" />
            <Text style={styles.detailText}>{property.area}m²</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

interface DetailModalProps {
  property: InvestmentProperty | null;
  visible: boolean;
  onClose: () => void;
}

const DetailModal: React.FC<DetailModalProps> = ({ property, visible, onClose }) => {
  if (!property) return null;

  const formatPrice = (price: number) => {
    if (price >= 1000000000) {
      return `${(price / 1000000000).toFixed(2)}억 원`;
    }
    return `${(price / 1000000).toFixed(0)}백만 원`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.detailContainer}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={28} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.detailTitle}>{property.name}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.detailContent} showsVerticalScrollIndicator={false}>
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>기본 정보</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>위치</Text>
              <Text style={styles.detailValue}>{property.location}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>가격</Text>
              <Text style={styles.detailValue}>{formatPrice(property.price)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>타입</Text>
              <Text style={styles.detailValue}>{getPropertyTypeKorean(property.type)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>상태</Text>
              <Text style={styles.detailValue}>{getStatusKorean(property.status)}</Text>
            </View>
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>투자 정보</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ROI</Text>
              <Text style={[styles.detailValue, styles.roiHighlight]}>
                {property.roi.toFixed(2)}%
              </Text>
            </View>
            {property.area && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>면적</Text>
                <Text style={styles.detailValue}>{property.area}m²</Text>
              </View>
            )}
          </View>

          {property.bedrooms && property.bathrooms && (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>시설</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>침실</Text>
                <Text style={styles.detailValue}>{property.bedrooms}개</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>욕실</Text>
                <Text style={styles.detailValue}>{property.bathrooms}개</Text>
              </View>
            </View>
          )}

          {property.trend && property.trend.length > 0 && (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>ROI 추이 (최근 30일)</Text>
              <View style={styles.trendChart}>
                {property.trend.map((item, index) => (
                  <View key={index} style={styles.trendBar}>
                    <View
                      style={[
                        styles.trendBarFill,
                        { height: `${Math.min(item.roi * 10, 100)}%` },
                      ]}
                    />
                  </View>
                ))}
              </View>
              <View style={styles.trendLabels}>
                <Text style={styles.trendLabel}>15일 전</Text>
                <Text style={styles.trendLabel}>최근</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

interface PreferencesModalProps {
  preferences: UserInvestmentPreferences | null;
  visible: boolean;
  onClose: () => void;
  onSave: (prefs: Partial<UserInvestmentPreferences>) => Promise<void>;
}

const PreferencesModal: React.FC<PreferencesModalProps> = ({
  preferences,
  visible,
  onClose,
  onSave,
}) => {
  const [types, setTypes] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState('0');
  const [maxPrice, setMaxPrice] = useState('5000000000');
  const [minROI, setMinROI] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preferences && visible) {
      setTypes(preferences.propertyTypes);
      setLocations(preferences.locations);
      setMinPrice(String(preferences.minPrice));
      setMaxPrice(String(preferences.maxPrice));
      setMinROI(String(preferences.minROI));
    }
  }, [preferences, visible]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        propertyTypes: types,
        locations,
        minPrice: parseFloat(minPrice) || 0,
        maxPrice: parseFloat(maxPrice) || 5000000000,
        minROI: parseFloat(minROI) || 0,
      });
      Alert.alert('설정 저장됨', '투자 선호도가 저장되었습니다.');
      onClose();
    } catch (error) {
      Alert.alert('오류', '설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggleType = (type: string) => {
    setTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleLocation = (location: string) => {
    setLocations(prev =>
      prev.includes(location) ? prev.filter(l => l !== location) : [...prev, location]
    );
  };

  const propertyTypes = ['apartment', 'villa', 'townhouse', 'land'];
  const availableLocations = ['강남구', '서초구', '종로구', '성남시', '수원시', '용인시', '고양시'];

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.preferencesContainer}>
        <View style={styles.preferencesHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={28} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.preferencesTitle}>투자 선호도</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <MaterialIcons name="check" size={28} color="#2563eb" />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.preferencesContent} showsVerticalScrollIndicator={false}>
          <View style={styles.preferencesSection}>
            <Text style={styles.preferencesLabel}>선호하는 부동산 타입</Text>
            <View style={styles.toggleGroup}>
              {propertyTypes.map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.toggleButton,
                    types.includes(type) && styles.toggleButtonActive,
                  ]}
                  onPress={() => toggleType(type)}
                >
                  <Text
                    style={[
                      styles.toggleButtonText,
                      types.includes(type) && styles.toggleButtonTextActive,
                    ]}
                  >
                    {getPropertyTypeKorean(type)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.preferencesSection}>
            <Text style={styles.preferencesLabel}>선호하는 지역</Text>
            <View style={styles.toggleGroup}>
              {availableLocations.map(location => (
                <TouchableOpacity
                  key={location}
                  style={[
                    styles.toggleButton,
                    locations.includes(location) && styles.toggleButtonActive,
                  ]}
                  onPress={() => toggleLocation(location)}
                >
                  <Text
                    style={[
                      styles.toggleButtonText,
                      locations.includes(location) && styles.toggleButtonTextActive,
                    ]}
                  >
                    {location}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.preferencesSection}>
            <Text style={styles.preferencesLabel}>최소 ROI (%)</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputValue}>{parseFloat(minROI).toFixed(1)}%</Text>
            </View>
          </View>

          <View style={styles.preferencesSection}>
            <Text style={styles.preferencesLabel}>가격 범위</Text>
            <View style={styles.rangeGroup}>
              <View style={styles.rangeItem}>
                <Text style={styles.rangeLabel}>최소</Text>
                <Text style={styles.rangeValue}>
                  {parseFloat(minPrice) >= 1000000000
                    ? `${(parseFloat(minPrice) / 1000000000).toFixed(1)}억`
                    : '무제한'}
                </Text>
              </View>
              <View style={styles.rangeItem}>
                <Text style={styles.rangeLabel}>최대</Text>
                <Text style={styles.rangeValue}>
                  {parseFloat(maxPrice) >= 1000000000
                    ? `${(parseFloat(maxPrice) / 1000000000).toFixed(1)}억`
                    : '무제한'}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

export default function InvestmentScreen() {
  const {
    properties,
    preferences,
    loading,
    error,
    lastSyncTime,
    isOnline,
    syncData,
    savePreferences,
    toggleFavorite,
  } = useInvestmentSync();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<InvestmentProperty | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [preferencesVisible, setPreferencesVisible] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await syncData(true);
    } finally {
      setRefreshing(false);
    }
  };

  const handlePropertyPress = (property: InvestmentProperty) => {
    setSelectedProperty(property);
    setDetailVisible(true);
  };

  const handleToggleFavorite = async (property: InvestmentProperty) => {
    await toggleFavorite(property.id);
  };

  const isFavorite = (propertyId: string) => {
    return preferences?.favoriteIds.includes(propertyId) ?? false;
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return '동기화 안 됨';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSyncTime.getTime()) / 1000);

    if (diff < 60) return '방금';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return lastSyncTime.toLocaleDateString();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleSection}>
          <Text style={styles.headerTitle}>💹 투자 리포트</Text>
          <View style={styles.syncStatus}>
            <MaterialIcons
              name={isOnline ? 'cloud-done' : 'cloud-off'}
              size={16}
              color={isOnline ? '#10b981' : '#ef4444'}
            />
            <Text style={styles.syncStatusText}>{formatLastSync()}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.preferencesButton}
          onPress={() => setPreferencesVisible(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="tune" size={24} color="#2563eb" />
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={20} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading && !properties.length ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>부동산 정보를 불러오는 중...</Text>
        </View>
      ) : properties.length > 0 ? (
        <FlatList
          data={properties}
          renderItem={({ item }) => (
            <PropertyCard
              property={item}
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={() => handleToggleFavorite(item)}
              onPress={() => handlePropertyPress(item)}
            />
          )}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListFooterComponent={
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                모든 정보는 {formatLastSync()} 기준입니다
              </Text>
            </View>
          }
        />
      ) : (
        <View style={styles.centerContainer}>
          <MaterialIcons name="home-work" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>이용 가능한 부동산이 없습니다</Text>
        </View>
      )}

      <DetailModal property={selectedProperty} visible={detailVisible} onClose={() => setDetailVisible(false)} />
      <PreferencesModal
        preferences={preferences}
        visible={preferencesVisible}
        onClose={() => setPreferencesVisible(false)}
        onSave={savePreferences}
      />
    </SafeAreaView>
  );
}

function getPropertyTypeKorean(type: string): string {
  const typeMap: { [key: string]: string } = {
    apartment: '아파트',
    villa: '빌라',
    townhouse: '타운하우스',
    land: '토지',
  };
  return typeMap[type] || type;
}

function getStatusKorean(status: string): string {
  const statusMap: { [key: string]: string } = {
    available: '판매 중',
    pending: '계약 중',
    sold: '판매 완료',
  };
  return statusMap[status] || status;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitleSection: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncStatusText: {
    fontSize: 12,
    color: '#6b7280',
  },
  preferencesButton: {
    padding: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '500',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9ca3af',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 6,
    marginHorizontal: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitleSection: {
    flex: 1,
    marginRight: 12,
  },
  propertyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 6,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  location: {
    fontSize: 13,
    color: '#6b7280',
  },
  favoriteButton: {
    padding: 4,
  },
  cardMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#f3f4f6',
    borderBottomColor: '#f3f4f6',
  },
  metricBox: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 4,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  cardDetails: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: '#6b7280',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  // Detail Modal Styles
  detailContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    maxWidth: width - 100,
  },
  detailContent: {
    flex: 1,
    padding: 16,
  },
  detailSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '600',
  },
  roiHighlight: {
    color: '#10b981',
    fontSize: 16,
  },
  trendChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 100,
    marginVertical: 16,
    gap: 6,
  },
  trendBar: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  trendBarFill: {
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  trendLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  trendLabel: {
    fontSize: 12,
    color: '#9ca3af',
  },
  // Preferences Modal Styles
  preferencesContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  preferencesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  preferencesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  preferencesContent: {
    flex: 1,
    padding: 16,
  },
  preferencesSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  preferencesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  toggleGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  toggleButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  toggleButtonText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  toggleButtonTextActive: {
    color: '#2563eb',
  },
  inputGroup: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  inputValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '600',
  },
  rangeGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  rangeItem: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  rangeLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
  },
  rangeValue: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '600',
  },
});
