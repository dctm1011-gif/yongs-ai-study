#!/usr/bin/env node
/**
 * 로컬에서 모든 Netlify Functions 테스트
 * 사용: npm run test:netlify (추가 필요)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFunction(filename) {
  const filepath = path.join(__dirname, filename);
  if (!fs.existsSync(filepath)) {
    return null;
  }

  const content = fs.readFileSync(filepath, 'utf-8');
  return {
    name: filename.replace('.mjs', ''),
    code: content,
  };
}

async function main() {
  console.log('🧪 Netlify Functions Code Analysis\n');

  const functions = [
    'test.mjs',
    'trending-videos.mjs',
    'toefl_prefs.mjs',
    'english_prefs.mjs',
    'feedback.mjs',
    'fetch-trends.mjs',
    'get-progress.mjs',
    'update-progress.mjs',
  ];

  let totalIssues = 0;

  for (const filename of functions) {
    const func = loadFunction(filename);
    if (!func) {
      console.log(`⚠️  ${filename} not found`);
      continue;
    }

    const issues = checkFunction(func);
    totalIssues += issues.length;

    if (issues.length === 0) {
      console.log(`✅ ${func.name}: No issues found`);
    } else {
      console.log(`❌ ${func.name}: ${issues.length} issue(s)`);
      issues.forEach(issue => {
        console.log(`   - ${issue}`);
      });
    }
  }

  console.log(`\n📊 Total issues: ${totalIssues}`);
  process.exit(totalIssues > 0 ? 1 : 0);
}

function checkFunction(func) {
  const issues = [];

  // 기본 구조 체크
  if (!func.code.includes('handler') && !func.code.includes('export default')) {
    issues.push('No handler function found');
  }

  // 에러 핸들링 체크
  if (!func.code.includes('try') && func.code.includes('fetch')) {
    issues.push('No try-catch for fetch calls');
  }

  // 환경 변수 체크
  if (func.code.includes('process.env.') && !func.code.includes('if (!')) {
    issues.push('Environment variable used without null check');
  }

  // 로깅 체크
  if (!func.code.includes('log.') && !func.code.includes('console.')) {
    issues.push('No logging found');
  }

  return issues;
}

main().catch(console.error);
