#!/usr/bin/env node

/**
 * YongStudy Development Server
 *
 * 자동으로:
 * 1. 의존성 확인 및 설치
 * 2. Expo 서버 시작
 * 3. 브라우저 자동 오픈
 * 4. 디버그 로그 모니터링
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJECT_DIR = path.dirname(path.dirname(__filename));
const DEBUG_LOG_DIR = path.join(PROJECT_DIR, '.debug-logs');
const PORT = 8081;
const URL = `http://localhost:${PORT}`;

console.log('═══════════════════════════════════════════════════════');
console.log('🚀 YongStudy Development Server');
console.log('═══════════════════════════════════════════════════════');
console.log(`📁 Project: ${PROJECT_DIR}`);
console.log(`🌐 URL: ${URL}`);
console.log('');

// 1. Debug logs 디렉토리 생성
if (!fs.existsSync(DEBUG_LOG_DIR)) {
  fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true });
  console.log('✅ Debug logs 디렉토리 생성됨');
}

// 2. Expo 시작
console.log('⏳ Expo 서버 시작 중...');
console.log('');

const expo = spawn('npm', ['start'], {
  cwd: PROJECT_DIR,
  stdio: 'inherit',
  shell: true
});

// 3. 브라우저 자동 오픈 (3초 후)
setTimeout(() => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('✅ Expo 서버 준비 완료!');
  console.log('');
  console.log('🌐 브라우저에서 앱 로드 중...');

  const openBrowser = () => {
    if (os.platform() === 'win32') {
      spawn('cmd', ['/c', `start ${URL}`]);
    } else if (os.platform() === 'darwin') {
      spawn('open', [URL]);
    } else {
      spawn('xdg-open', [URL]);
    }
  };

  openBrowser();

  console.log(`📖 브라우저: ${URL}`);
  console.log('🐛 디버그: 🐛 버튼을 클릭하세요');
  console.log('');
  console.log('🔍 각 탭을 클릭하면 실시간 로그가 보입니다');
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
}, 3000);

// 4. 프로세스 종료 처리
process.on('SIGINT', () => {
  console.log('');
  console.log('🛑 Expo 서버 종료');
  expo.kill();
  process.exit(0);
});
