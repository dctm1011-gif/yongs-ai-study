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

  const runHealthCheck = async () => {
    setIsChecking(true);
    try {
      const results: HealthCheckResult[] = [];

      results.push(await checkEnglish());
      results.push(await checkTOEFL());
      results.push(await checkPlay());
      results.push(await checkPapers());
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
      for (const result of results) {
        if (result.status === 'error' && result.errors.length > 0) {
          for (const errorMsg of result.errors) {
            await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/api/runtime-errors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tab: result.tab,
                error: errorMsg,
                severity: 'error',
                timestamp: result.timestamp,
              }),
            });
          }
        } else if (result.status === 'warning' && result.errors.length > 0) {
          for (const errorMsg of result.errors) {
            await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/api/runtime-errors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tab: result.tab,
                error: errorMsg,
                severity: 'warning',
                timestamp: result.timestamp,
              }),
            });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to save runtime errors to server:', e);
    }
  };

  useEffect(() => {
    loadLastReport();
  }, []);

  return { report, isChecking, runHealthCheck };
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

    const toeflData = await AsyncStorage.getItem('toefl_data');
    if (!toeflData) {
      errors.push('TOEFL 데이터 없음');
    } else {
      try {
        const parsed = JSON.parse(toeflData);
        if (!parsed.reading || !parsed.listening || !parsed.writing || !parsed.speaking) {
          errors.push('섹션 누락');
        }
      } catch (e) {
        errors.push('데이터 손상');
      }
    }

    const lastResetDate = await AsyncStorage.getItem('toefl_last_reset');
    const today = new Date().toISOString().split('T')[0];
    if (lastResetDate && lastResetDate !== today) {
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
    console.log('[Play] Testing API...');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(
        'https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/trending-videos',
        { method: 'GET', signal: controller.signal }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        errors.push(`API 오류 ${response.status}`);
      } else {
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
          errors.push('API 데이터 비어있음');
        }
      }
    } catch (e) {
      clearTimeout(timeout);
      if (e instanceof Error && e.name === 'AbortError') {
        errors.push('API 타임아웃');
      } else {
        errors.push('네트워크 오류');
      }
    }

    console.log('[Play] Done:', errors.length === 0 ? 'OK' : errors);
    return {
      tab: 'Play',
      status: errors.length === 0 ? 'healthy' : 'error',
      message: errors.length === 0 ? '✅ API 정상' : `❌ ${errors[0]}`,
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

    const papersData = await AsyncStorage.getItem('papers_data');
    if (!papersData) {
      errors.push('Papers 데이터 없음');
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
