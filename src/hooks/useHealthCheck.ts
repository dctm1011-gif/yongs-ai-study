import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

      // English 탭 체크
      results.push(await checkEnglish());

      // TOEFL 탭 체크
      results.push(await checkTOEFL());

      // Play 탭 체크
      results.push(await checkPlay());

      // Papers 탭 체크
      results.push(await checkPapers());

      // Settings 탭 체크
      results.push(await checkSettings());

      // 요약 계산
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

      // 로컬 저장
      await AsyncStorage.setItem('lastHealthCheck', JSON.stringify(healthReport));

      console.log('✅ Health Check Complete:', summary);
      return healthReport;
    } catch (error) {
      console.error('❌ Health Check Failed:', error);
      return null;
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    loadLastReport();
  }, []);

  return {
    report,
    isChecking,
    runHealthCheck,
  };
}

// ============ 각 탭의 헬스 체크 함수 ============

async function checkEnglish(): Promise<HealthCheckResult> {
  const errors: string[] = [];

  try {
    // AsyncStorage에서 데이터 로드 가능한지 확인
    const saved = await AsyncStorage.getItem('english_words');
    if (!saved) {
      errors.push('데이터 로드 불가');
    }

    // 숨기기 상태 확인
    const hideReadStatus = await AsyncStorage.getItem('hideReadWords');
    if (hideReadStatus === null) {
      errors.push('숨기기 설정 초기화됨');
    }

    return {
      tab: 'English',
      status: errors.length === 0 ? 'healthy' : 'warning',
      message: errors.length === 0 ? '✅ 정상' : `⚠️ ${errors.length}개 경고`,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      tab: 'English',
      status: 'error',
      message: `❌ 오류: ${error}`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkTOEFL(): Promise<HealthCheckResult> {
  const errors: string[] = [];

  try {
    // AsyncStorage에서 데이터 로드 가능한지 확인
    const saved = await AsyncStorage.getItem('toefl_data');
    if (!saved) {
      errors.push('기본 데이터 로드 실패');
    }

    // 알림 설정 확인
    const notificationsEnabled = await AsyncStorage.getItem('toefl_notifications');
    if (notificationsEnabled === null) {
      errors.push('알림 설정 미구성');
    }

    return {
      tab: 'TOEFL',
      status: errors.length === 0 ? 'healthy' : 'warning',
      message: errors.length === 0 ? '✅ 정상' : `⚠️ ${errors.length}개 경고`,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      tab: 'TOEFL',
      status: 'error',
      message: `❌ 오류: ${error}`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkPlay(): Promise<HealthCheckResult> {
  const errors: string[] = [];

  try {
    // Netlify API 연결 확인
    const response = await fetch(
      'https://illustrious-cuchufli-7c4e58.netlify.app/.netlify/functions/trending-videos',
      { method: 'GET', timeout: 5000 }
    );

    if (!response.ok) {
      errors.push(`API 오류: ${response.status}`);
    }

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
      message: `❌ 네트워크 오류`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkPapers(): Promise<HealthCheckResult> {
  const errors: string[] = [];

  try {
    // Papers 탭 데이터 확인
    const saved = await AsyncStorage.getItem('papers_data');
    if (!saved) {
      errors.push('데이터 로드 불가');
    }

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
      message: `❌ 오류: ${error}`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkSettings(): Promise<HealthCheckResult> {
  const errors: string[] = [];

  try {
    // 피드백 저장 가능한지 확인
    const testId = 'health-check-' + Date.now();
    await AsyncStorage.setItem(testId, 'test');
    const read = await AsyncStorage.getItem(testId);
    await AsyncStorage.removeItem(testId);

    if (read !== 'test') {
      errors.push('데이터 저장/읽기 실패');
    }

    // 공지사항 API 확인
    const announcementsResponse = await fetch(
      'https://illustrious-cuchufli-7c4e58.netlify.app/api/announcements',
      { method: 'GET', timeout: 5000 }
    );

    if (!announcementsResponse.ok) {
      errors.push(`공지사항 API 오류: ${announcementsResponse.status}`);
    }

    return {
      tab: 'Settings',
      status: errors.length === 0 ? 'healthy' : errors.length === 1 ? 'warning' : 'error',
      message: errors.length === 0 ? '✅ 정상' : `⚠️ ${errors.length}개 경고`,
      errors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      tab: 'Settings',
      status: 'error',
      message: `❌ 오류: ${error}`,
      errors: [String(error)],
      timestamp: new Date().toISOString(),
    };
  }
}

async function loadLastReport() {
  try {
    const saved = await AsyncStorage.getItem('lastHealthCheck');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // 무시
  }
  return null;
}
