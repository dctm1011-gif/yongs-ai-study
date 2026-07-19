import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { errorLogger } from './useErrorLog';

export interface HealthCheckResult {
  tab: string;
  status: 'healthy' | 'warning' | 'error';
  message: string;
  errors: string[];
  timestamp: string;
}

export interface HealthCheckReport {
  appVersion: string;
  timestamp: string;
  results: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    warnings: number;
    errors: number;
  };
}

export function useHealthCheck() {
  const [report, setReport] = useState<HealthCheckReport | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; tab: string }>({ current: 0, total: 0, tab: '' });

  const runHealthCheck = async () => {
    setIsChecking(true);
    const tabs = ['English', 'TOEFL', 'Play', 'Papers', 'Storage', 'Settings'];
    const results: HealthCheckResult[] = [];

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      setProgress({ current: 1, total: tabs.length, tab: 'English' });
      results.push(await checkEnglish());
      await delay(300);

      setProgress({ current: 2, total: tabs.length, tab: 'TOEFL' });
      results.push(await checkTOEFL());
      await delay(300);

      setProgress({ current: 3, total: tabs.length, tab: 'Play' });
      results.push(await checkPlay());
      await delay(300);

      setProgress({ current: 4, total: tabs.length, tab: 'Papers' });
      results.push(await checkPapers());
      await delay(300);

      setProgress({ current: 5, total: tabs.length, tab: 'Storage' });
      results.push(await checkStorage());
      await delay(300);

      setProgress({ current: 6, total: tabs.length, tab: 'Settings' });
      results.push(await checkSettings());

      const summary = {
        total: results.length,
        healthy: results.filter(r => r.status === 'healthy').length,
        warnings: results.filter(r => r.status === 'warning').length,
        errors: results.filter(r => r.status === 'error').length,
      };

      const healthReport: HealthCheckReport = {
        appVersion: '1.0.1',
        timestamp: new Date().toISOString(),
        results,
        summary,
      };

      setReport(healthReport);
      await AsyncStorage.setItem('lastHealthCheck', JSON.stringify(healthReport));
      console.log('✅ Health Check Complete:', summary);

      // 서버에 런타임 에러 저장
      await saveRuntimeErrorsToServer(results);

      return healthReport;
    } catch (error) {
      console.error('❌ Health Check Failed:', error);
      return null;
    } finally {
      setIsChecking(false);
    }
  };

  const saveRuntimeErrorsToServer = async (results: HealthCheckResult[]) => {
    try {
      // Firebase에 저장하지 않고 로컬에만 기록
      // (runtime-errors API 삭제됨, Firebase 저장 미구현)
      console.log('Health check results saved locally:', results);
    } catch (e) {
      console.warn('Failed to save health check results:', e);
    }
  };

  useEffect(() => {
    loadLastReport();
  }, []);

  return { report, isChecking, runHealthCheck, progress };
}

async function checkEnglish(): Promise<HealthCheckResult> {
  const errors: string[] = [];
  try {
    console.log('[English] Checking...');

    // 저장소 테스트
    try {
      const testKey = 'health-check-test-' + Date.now();
      await AsyncStorage.setItem(testKey, 'test');
      const read = await AsyncStorage.getItem(testKey);
      await AsyncStorage.removeItem(testKey);
      if (read !== 'test') {
        errors.push('저장소 읽기/쓰기 실패');
        await errorLogger.log('English', 'AsyncStorage read/write failed', 'error');
      }
    } catch (e) {
      const msg = 'AsyncStorage 접근 불가';
      errors.push(msg);
      await errorLogger.log('English', e as Error, 'error');
    }

    // 데이터 확인
    const englishData = await AsyncStorage.getItem('english_words');
    if (!englishData) {
      errors.push('단어 데이터 없음');
    } else {
      try {
        const parsed = JSON.parse(englishData);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          errors.push('단어 데이터 비어있음');
        }
      } catch (e) {
        errors.push('데이터 손상');
      }
    }

    console.log('[English] Done:', errors.length === 0 ? 'OK' : errors);
    return {
      tab: 'English',
      status: errors.length === 0 ? 'healthy' : errors.length === 1 ? 'warning' : 'error',
      message: errors.length === 0 ? '✅ 정상' : `⚠️ ${errors.length}개 문제`,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      tab: 'English',
      status: 'error',
      message: `❌ 오류`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkTOEFL(): Promise<HealthCheckResult> {
  const errors: string[] = [];
  try {
    console.log('[TOEFL] Checking...');

    const toeflData = await AsyncStorage.getItem('toefl_sections');
    if (!toeflData) {
      // 데이터 없으면 기본값 생성
      const defaultData = [
        { id: 'reading', name: 'Reading', progress: 0, completed: false },
        { id: 'listening', name: 'Listening', progress: 0, completed: false },
        { id: 'writing', name: 'Writing', progress: 0, completed: false },
        { id: 'speaking', name: 'Speaking', progress: 0, completed: false },
      ];
      await AsyncStorage.setItem('toefl_sections', JSON.stringify(defaultData));
    } else {
      try {
        const parsed = JSON.parse(toeflData);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          errors.push('데이터 비어있음');
        }
      } catch (e) {
        errors.push('데이터 손상');
      }
    }

    const lastResetDate = await AsyncStorage.getItem('toefl_last_reset');
    const today = new Date().toISOString().split('T')[0];
    if (lastResetDate && !lastResetDate.startsWith(today)) {
      errors.push('일일 초기화 미실행');
    }

    console.log('[TOEFL] Done:', errors.length === 0 ? 'OK' : errors);
    return {
      tab: 'TOEFL',
      status: errors.length === 0 ? 'healthy' : 'warning',
      message: errors.length === 0 ? '✅ 정상' : `⚠️ ${errors.length}개 문제`,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      tab: 'TOEFL',
      status: 'error',
      message: `❌ 오류`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkPlay(): Promise<HealthCheckResult> {
  const errors: string[] = [];
  try {
    console.log('[Play] Checking...');

    // AsyncStorage 테스트
    try {
      const testKey = 'health-check-play-' + Date.now();
      await AsyncStorage.setItem(testKey, 'test');
      const read = await AsyncStorage.getItem(testKey);
      await AsyncStorage.removeItem(testKey);
      if (read !== 'test') {
        errors.push('저장소 읽기/쓰기 실패');
      }
    } catch (e) {
      errors.push('AsyncStorage 접근 불가');
    }

    console.log('[Play] Done:', errors.length === 0 ? 'OK' : errors);
    return {
      tab: 'Play',
      status: errors.length === 0 ? 'healthy' : 'warning',
      message: errors.length === 0 ? '✅ 정상' : `⚠️ ${errors[0]}`,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      tab: 'Play',
      status: 'error',
      message: `❌ 오류`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkPapers(): Promise<HealthCheckResult> {
  const errors: string[] = [];
  try {
    console.log('[Papers] Checking...');

    const papersData = await AsyncStorage.getItem('papers');
    if (!papersData) {
      // 기본 데이터 생성
      const defaultPapers = [
        { id: '1', title: 'Sample Paper 1', read: false, bookmarked: false },
        { id: '2', title: 'Sample Paper 2', read: false, bookmarked: false },
      ];
      await AsyncStorage.setItem('papers', JSON.stringify(defaultPapers));
    } else {
      try {
        const parsed = JSON.parse(papersData);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          errors.push('데이터 비어있음');
        }
      } catch (e) {
        errors.push('데이터 손상');
      }
    }

    console.log('[Papers] Done:', errors.length === 0 ? 'OK' : errors);
    return {
      tab: 'Papers',
      status: errors.length === 0 ? 'healthy' : 'warning',
      message: errors.length === 0 ? '✅ 정상' : `⚠️ ${errors[0]}`,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      tab: 'Papers',
      status: 'error',
      message: `❌ 오류`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkStorage(): Promise<HealthCheckResult> {
  const errors: string[] = [];
  try {
    console.log('[Storage] Checking...');

    // AsyncStorage 접근 테스트
    try {
      const testKey = 'health-check-storage-test-' + Date.now();
      await AsyncStorage.setItem(testKey, 'test');
      const read = await AsyncStorage.getItem(testKey);
      await AsyncStorage.removeItem(testKey);
      if (read !== 'test') {
        errors.push('저장소 읽기/쓰기 실패');
      }
    } catch (e) {
      errors.push('AsyncStorage 접근 불가');
      await errorLogger.log('Storage', e as Error, 'error');
    }

    // 모든 키 로드 가능한지 체크
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      console.log('[Storage] Total keys:', allKeys.length);

      if (allKeys.length === 0) {
        errors.push('저장된 데이터 없음');
      } else {
        // 데이터 로드 가능한지 테스트
        const allData = await Promise.all(
          allKeys.map(key => AsyncStorage.getItem(key).then(value => [key, value] as const))
        );
        console.log('[Storage] Loaded', allData.length, 'items');

        let loadedSize = 0;
        for (const [key, value] of allData) {
          if (value) {
            loadedSize += value.length;
          }
        }
        console.log('[Storage] Total size:', loadedSize, 'bytes');
      }
    } catch (e) {
      errors.push('데이터 로드 실패: ' + String(e));
      await errorLogger.log('Storage', e as Error, 'error');
    }

    console.log('[Storage] Done:', errors.length === 0 ? 'OK' : errors);
    return {
      tab: 'Storage',
      status: errors.length === 0 ? 'healthy' : 'warning',
      message: errors.length === 0 ? '✅ 정상' : `⚠️ ${errors[0]}`,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      tab: 'Storage',
      status: 'error',
      message: `❌ 오류`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkSettings(): Promise<HealthCheckResult> {
  const errors: string[] = [];
  try {
    console.log('[Settings] Checking...');

    // 저장소 테스트
    const testId = 'health-check-fb-' + Date.now();
    try {
      await AsyncStorage.setItem(testId, JSON.stringify({ test: true }));
      const read = await AsyncStorage.getItem(testId);
      await AsyncStorage.removeItem(testId);
      if (!read) errors.push('저장 실패');
    } catch (e) {
      errors.push('저장소 접근 실패');
    }

    // 공지사항 API 테스트
    console.log('[Settings] Testing announcements API...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(
        'https://illustrious-cuchufli-7c4e58.netlify.app/api/announcements',
        { method: 'GET', signal: controller.signal }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        errors.push(`공지사항 API 오류 ${response.status}`);
      }
    } catch (e) {
      clearTimeout(timeout);
      if (e instanceof Error && e.name === 'AbortError') {
        errors.push('공지사항 API 타임아웃');
      } else {
        errors.push('공지사항 API 연결 실패');
      }
    }

    console.log('[Settings] Done:', errors.length === 0 ? 'OK' : errors);
    return {
      tab: 'Settings',
      status: errors.length === 0 ? 'healthy' : errors.length === 1 ? 'warning' : 'error',
      message: errors.length === 0 ? '✅ 정상' : `⚠️ ${errors.length}개 문제`,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      tab: 'Settings',
      status: 'error',
      message: `❌ 오류`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function loadLastReport() {
  try {
    const saved = await AsyncStorage.getItem('lastHealthCheck');
    if (saved) return JSON.parse(saved);
  } catch {
    // 무시
  }
  return null;
}
