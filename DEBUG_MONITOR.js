// YongStudy 자동 디버깅 모니터링 시스템
// 모든 콘솔 로그를 파일에 기록하고 세션 관리

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '.debug-logs');
const SESSION_ID = new Date().toISOString().split('T')[0].replace(/-/g, '') + '-' +
                   String(Date.now()).slice(-6);
const LOG_FILE = path.join(LOG_DIR, `debug-${SESSION_ID}.log`);
const INDEX_FILE = path.join(LOG_DIR, 'debug-index.json');

// 로그 디렉토리 생성
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const SESSION_START = new Date();
let errorCount = 0;
let warningCount = 0;
let logCount = 0;
const tabsTested = new Set();

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

// 로그 작성 함수
function writeLog(level, message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, logEntry);
    logCount++;
  } catch (e) {
    originalConsoleError('Failed to write log:', e);
  }

  // 탭 이름 추출 (로그 메시지에서)
  const tabMatch = message.match(/\[(ENGLISH|TOEFL|PAPERS)\]/);
  if (tabMatch) {
    tabsTested.add(tabMatch[1]);
  }
}

// Console.log 후킹
console.log = function (...args) {
  const message = args.join(' ');
  originalConsoleLog.apply(console, args);
  // 주요 로그만 기록
  if (message.includes('[') && message.includes(']')) {
    writeLog('LOG', message);
  }
};

// Console.error 후킹
console.error = function (...args) {
  errorCount++;
  const message = args.join(' ');
  writeLog('ERROR', message);
  originalConsoleError.apply(console, args);
};

// Console.warn 후킹
console.warn = function (...args) {
  warningCount++;
  const message = args.join(' ');
  writeLog('WARN', message);
  originalConsoleWarn.apply(console, args);
};

// 프로세스 에러 핸들링
process.on('unhandledRejection', (reason) => {
  const message = `Unhandled Rejection: ${reason}`;
  writeLog('FATAL', message);
  console.error(message);
});

process.on('uncaughtException', (error) => {
  const message = `Uncaught Exception: ${error.message}`;
  writeLog('FATAL', message);
  console.error(message);
});

// 세션 메타데이터 저장 함수
function saveSessionMetadata() {
  try {
    const sessions = fs.existsSync(INDEX_FILE) ?
      JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')) : { sessions: [] };

    const sessionData = {
      id: SESSION_ID,
      startTime: SESSION_START.toISOString(),
      endTime: new Date().toISOString(),
      logFile: `debug-${SESSION_ID}.log`,
      totalLogs: logCount,
      errorCount,
      warningCount,
      tabsTested: Array.from(tabsTested),
      duration: Math.round((Date.now() - SESSION_START.getTime()) / 1000)
    };

    sessions.sessions = sessions.sessions || [];
    sessions.sessions.unshift(sessionData);
    sessions.sessions = sessions.sessions.slice(0, 50); // 최근 50개만 유지

    fs.writeFileSync(INDEX_FILE, JSON.stringify(sessions, null, 2));
  } catch (e) {
    originalConsoleError('Failed to save session metadata:', e);
  }
}

// 정기적으로 통계 업데이트 (1분마다)
setInterval(() => {
  const uptime = Math.round((Date.now() - SESSION_START.getTime()) / 1000);
  writeLog('STATS', `Uptime: ${uptime}s | Logs: ${logCount} | Errors: ${errorCount} | Warnings: ${warningCount}`);
}, 60000);

// 프로세스 종료 시 메타데이터 저장
process.on('exit', saveSessionMetadata);
process.on('SIGINT', () => {
  saveSessionMetadata();
  process.exit(0);
});

originalConsoleLog(`\n${'═'.repeat(60)}`);
originalConsoleLog(`🔍 YongStudy Debug Monitor Started`);
originalConsoleLog(`📁 Session: ${SESSION_ID}`);
originalConsoleLog(`📄 Log file: ${LOG_FILE}`);
originalConsoleLog(`${SESSION_START.toLocaleString('ko-KR')}`);
originalConsoleLog(`${'═'.repeat(60)}\n`);
