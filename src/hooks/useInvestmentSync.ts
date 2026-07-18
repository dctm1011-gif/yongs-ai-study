import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface InvestmentProperty {
  id: string;
  name: string;
  location: string;
  price: number;
  roi: number;
  status: 'available' | 'sold' | 'pending';
  type: 'apartment' | 'villa' | 'townhouse' | 'land';
  image?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  trend?: Array<{ date: string; roi: number }>;
}

export interface UserInvestmentPreferences {
  propertyTypes: string[];
  locations: string[];
  minPrice: number;
  maxPrice: number;
  minROI: number;
  favoriteIds: string[];
}

export interface DailyReport {
  properties: InvestmentProperty[];
  timestamp: string;
  summary?: string;
}

const CACHE_KEY = 'investment_data';
const PREFERENCES_KEY = 'investment_preferences';
const LAST_SYNC_KEY = 'investment_last_sync';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://illustrious-cuchufli-7c4e58.netlify.app';

export function useInvestmentSync() {
  const [properties, setProperties] = useState<InvestmentProperty[]>([]);
  const [preferences, setPreferences] = useState<UserInvestmentPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const syncTimeoutRef = useRef<any>(undefined);
  const netInfoUnsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize preferences with defaults
  const initializePreferences = useCallback(async (): Promise<UserInvestmentPreferences> => {
    try {
      const saved = await AsyncStorage.getItem(PREFERENCES_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.error('[useInvestmentSync] Error loading preferences:', err);
    }

    const defaults: UserInvestmentPreferences = {
      propertyTypes: ['apartment', 'villa'],
      locations: [],
      minPrice: 0,
      maxPrice: 5000000000, // 50억원
      minROI: 0,
      favoriteIds: [],
    };

    try {
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(defaults));
    } catch (err) {
      console.error('[useInvestmentSync] Error saving default preferences:', err);
    }

    return defaults;
  }, []);

  // Mock data generator for offline mode
  const generateMockProperties = useCallback((): InvestmentProperty[] => {
    return [
      {
        id: 'mock-1',
        name: '강남 럭셔리 아파트',
        location: '강남구',
        price: 1250000000,
        roi: 3.5,
        status: 'available',
        type: 'apartment',
        bedrooms: 3,
        bathrooms: 2,
        area: 150,
        trend: [
          { date: '2026-07-11', roi: 3.2 },
          { date: '2026-07-12', roi: 3.3 },
          { date: '2026-07-13', roi: 3.4 },
          { date: '2026-07-14', roi: 3.5 },
        ],
      },
      {
        id: 'mock-2',
        name: '서초 프리미엄 빌라',
        location: '서초구',
        price: 980000000,
        roi: 2.8,
        status: 'available',
        type: 'villa',
        bedrooms: 4,
        bathrooms: 3,
        area: 200,
        trend: [
          { date: '2026-07-11', roi: 2.5 },
          { date: '2026-07-12', roi: 2.6 },
          { date: '2026-07-13', roi: 2.7 },
          { date: '2026-07-14', roi: 2.8 },
        ],
      },
      {
        id: 'mock-3',
        name: '종로 한옥 타운하우스',
        location: '종로구',
        price: 850000000,
        roi: 2.1,
        status: 'pending',
        type: 'townhouse',
        bedrooms: 2,
        bathrooms: 2,
        area: 120,
        trend: [
          { date: '2026-07-11', roi: 2.0 },
          { date: '2026-07-12', roi: 2.0 },
          { date: '2026-07-13', roi: 2.05 },
          { date: '2026-07-14', roi: 2.1 },
        ],
      },
    ];
  }, []);

  // Fetch from backend via Netlify proxy
  const fetchFromBackend = useCallback(async (): Promise<DailyReport | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/investment/daily-report`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[useInvestmentSync] Backend returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (data.properties && Array.isArray(data.properties)) {
        return data as DailyReport;
      }
    } catch (err) {
      console.error('[useInvestmentSync] Failed to fetch from backend:', err);
    }

    return null;
  }, []);

  // Load and sync data
  const syncData = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first (unless forced refresh)
      if (!forceRefresh) {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        const lastSync = await AsyncStorage.getItem(LAST_SYNC_KEY);

        if (cached && lastSync) {
          const syncTime = new Date(lastSync);
          const now = new Date();

          if (now.getTime() - syncTime.getTime() < CACHE_DURATION) {
            console.log('[useInvestmentSync] Using cached data');
            const cachedData = JSON.parse(cached) as DailyReport;
            setProperties(cachedData.properties);
            setLastSyncTime(syncTime);
            setLoading(false);
            return;
          }
        }
      }

      // Try to fetch from backend
      if (isOnline) {
        const report = await fetchFromBackend();
        if (report) {
          // Save to cache
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(report));
          await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());

          setProperties(report.properties);
          setLastSyncTime(new Date());
          setLoading(false);
          return;
        }
      }

      // Fallback to cache or mock data
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        console.log('[useInvestmentSync] Falling back to cached data');
        const cachedData = JSON.parse(cached) as DailyReport;
        setProperties(cachedData.properties);
      } else {
        console.log('[useInvestmentSync] Using mock data (offline)');
        const mockData = generateMockProperties();
        setProperties(mockData);

        // Cache mock data for offline access
        await AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            properties: mockData,
            timestamp: new Date().toISOString(),
          })
        );
      }

      setLoading(false);
    } catch (err) {
      console.error('[useInvestmentSync] Sync error:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync data');
      setLoading(false);

      // Fallback to mock data
      const mockData = generateMockProperties();
      setProperties(mockData);
    }
  }, [isOnline, fetchFromBackend, generateMockProperties]);

  // Save user preferences
  const savePreferences = useCallback(async (newPrefs: Partial<UserInvestmentPreferences>): Promise<void> => {
    try {
      const current = preferences || (await initializePreferences());
      const updated = { ...current, ...newPrefs };
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
      setPreferences(updated);
    } catch (err) {
      console.error('[useInvestmentSync] Error saving preferences:', err);
      throw err;
    }
  }, [preferences, initializePreferences]);

  // Toggle favorite
  const toggleFavorite = useCallback(async (propertyId: string) => {
    try {
      const current = preferences || (await initializePreferences());
      const favorites = new Set(current.favoriteIds);

      if (favorites.has(propertyId)) {
        favorites.delete(propertyId);
      } else {
        favorites.add(propertyId);
      }

      const updated = { ...current, favoriteIds: Array.from(favorites) };
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
      setPreferences(updated);

      // Notify backend (non-blocking)
      fetch(`${API_BASE_URL}/api/investment/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          isFavorite: favorites.has(propertyId),
        }),
      }).catch(err => console.warn('[useInvestmentSync] Failed to sync favorite:', err));

      return favorites.has(propertyId);
    } catch (err) {
      console.error('[useInvestmentSync] Error toggling favorite:', err);
      return false;
    }
  }, [preferences, initializePreferences]);

  // Setup network listener (optional - NetInfo may not be installed)
  useEffect(() => {
    try {
      const NetInfo = require('@react-native-community/netinfo').default;
      const unsubscribe = NetInfo.addEventListener((state: any) => {
        const online = state.isConnected ?? false;
        setIsOnline(online);
        console.log('[useInvestmentSync] Network status:', online ? 'online' : 'offline');

        // Sync when coming back online
        if (online) {
          syncData(true);
        }
      });

      netInfoUnsubscribeRef.current = unsubscribe;

      return () => {
        if (netInfoUnsubscribeRef.current) {
          netInfoUnsubscribeRef.current();
        }
      };
    } catch (err) {
      console.warn('[useInvestmentSync] NetInfo not available, network monitoring disabled');
      setIsOnline(true); // Assume online if NetInfo not available
      return undefined;
    }
  }, [syncData]);

  // Initial load and periodic sync
  useEffect(() => {
    // Initial load
    const initLoad = async () => {
      const prefs = await initializePreferences();
      setPreferences(prefs);
    };

    initLoad();
    syncData();

    // Setup periodic sync every 5 minutes
    syncTimeoutRef.current = setInterval(() => {
      syncData();
    }, CACHE_DURATION);

    return () => {
      if (syncTimeoutRef.current) {
        clearInterval(syncTimeoutRef.current);
      }
    };
  }, [syncData, initializePreferences]);

  return {
    properties,
    preferences,
    loading,
    error,
    lastSyncTime,
    isOnline,
    syncData,
    savePreferences,
    toggleFavorite,
  };
}
