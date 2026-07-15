#!/usr/bin/env node

/**
 * YongStudy Complete Build Process
 *
 * 전체 빌드 자동화:
 * 1. 의존성 설치
 * 2. TypeScript 컴파일 확인
 * 3. 캐시 정리
 * 4. 자동으로 npm run dev 실행
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJECT_DIR = path.dirname(path.dirname(__filename));
const DEBUG_LOG_DIR = path.join(PROJECT_DIR, '.debug-logs');
const PORT = 8081;
const URL = `http://localhost:${PORT}`;

console.log('═══════════════════════════════════════════════════════');
console.log('🔨 YongStudy Complete Build');
console.log('═══════════════════════════════════════════════════════');
console.log('');

// 1단계: 의존성 설치
console.log('📦 Step 1: 의존성 설치...');
try {
  execSync('npm install --force --legacy-peer-deps', {
    cwd: PROJECT_DIR,
    stdio: 'inherit'
  });
  console.log('✅ 의존성 설치 완료');
} catch (err) {
  console.error('❌ npm install 실패');
  process.exit(1);
}

console.log('');

// 2단계: TypeScript 컴파일 확인
console.log('🔍 Step 2: TypeScript 검사...');
try {
  execSync('npx tsc --noEmit', {
    cwd: PROJECT_DIR,
    stdio: 'inherit'
  });
  console.log('✅ TypeScript 검사 통과');
} catch (err) {
  console.error('❌ TypeScript 에러 있음 - 수정 후 다시 시도하세요');
  process.exit(1);
}

console.log('');

// 3단계: Debug logs 디렉토리 생성
console.log('🧹 Step 3: 환경 준비...');
if (!fs.existsSync(DEBUG_LOG_DIR)) {
  fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true });
  console.log('✅ Debug logs 디렉토리 생성됨');
} else {
  console.log('✅ Debug logs 디렉토리 준비됨');
}

console.log('');

// 4단계: 모든 검사 완료 후 npm run dev 실행
console.log('═══════════════════════════════════════════════════════');
console.log('✅ 빌드 완료! 앱 시작 중...');
console.log('═══════════════════════════════════════════════════════');
console.log('');

const dev = spawn('npm', ['run', 'dev'], {
  cwd: PROJECT_DIR,
  stdio: 'inherit',
  shell: true
});

// Ctrl+C 처리
process.on('SIGINT', () => {
  console.log('');
  console.log('🛑 빌드 및 앱 종료');
  dev.kill();
  process.exit(0);
});

dev.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code);
  }
});
