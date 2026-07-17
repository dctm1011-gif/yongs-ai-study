import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

export interface ErrorLog {
  id: string;
  timestamp: string;
  tab: string;
  error: string;
  stack?: string;
  severity: 'warning' | 'error' | 'fatal';
}

class ErrorLogger {
  private logs: ErrorLog[] = [];
  private maxLogs = 100;

  async log(
    tab: string,
    error: string | Error,
    severity: 'warning' | 'error' | 'fatal' = 'error'
  ) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    const logEntry: ErrorLog = {
      id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      tab,
      error: errorMessage,
      stack,
      severity,
    };

    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    // AsyncStorage에 저장
    await this.saveToStorage();

    // Netlify에도 전송 (선택)
    await this.sendToNetlify(logEntry);

    console.error(`[${tab}] ${severity.toUpperCase()}: ${errorMessage}`);
  }

  private async saveToStorage() {
    try {
      await AsyncStorage.setItem('errorLogs', JSON.stringify(this.logs));

      // 또한 파일 시스템에 저장 (adb pull로 접근 가능)
      const errorLogPath = `${FileSystem.documentDirectory}error_logs.json`;
      await FileSystem.writeAsStringAsync(
        errorLogPath,
        JSON.stringify(this.logs, null, 2),
        { encoding: FileSystem.EncodingType.UTF8 }
      );
    } catch (e) {
      console.error('Failed to save error logs', e);
    }
  }

  private async sendToNetlify(logEntry: ErrorLog) {
    try {
      await fetch('https://illustrious-cuchufli-7c4e58.netlify.app/api/error-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry),
      }).catch(() => {
        // Netlify가 없어도 무시
      });
    } catch (e) {
      // 무시
    }
  }

  async getLogs(): Promise<ErrorLog[]> {
    try {
      const saved = await AsyncStorage.getItem('errorLogs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  async clearLogs() {
    this.logs = [];
    await AsyncStorage.removeItem('errorLogs');
  }

  async getLastError(): Promise<ErrorLog | null> {
    const logs = await this.getLogs();
    return logs.length > 0 ? logs[0] : null;
  }

  async getErrorsByTab(tab: string): Promise<ErrorLog[]> {
    const logs = await this.getLogs();
    return logs.filter(log => log.tab === tab);
  }
}

export const errorLogger = new ErrorLogger();

export function useErrorLog() {
  return {
    log: errorLogger.log.bind(errorLogger),
    getLogs: errorLogger.getLogs.bind(errorLogger),
    clearLogs: errorLogger.clearLogs.bind(errorLogger),
    getLastError: errorLogger.getLastError.bind(errorLogger),
    getErrorsByTab: errorLogger.getErrorsByTab.bind(errorLogger),
  };
}
