#!/usr/bin/env node
/**
 * 자동 디버깅 & 수정 시스템
 *
 * 에러 감지 → 원인 분석 → 자동 수정 → 재빌드 → 커밋
 *
 * 실행: npm run auto-fix
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

class AutoDebugger {
  constructor() {
    this.errors = [];
    this.fixes = [];
    this.projectRoot = process.cwd();
  }

  log(message, color = 'reset') {
    console.log(`${COLORS[color]}${message}${COLORS.reset}`);
  }

  logSection(title) {
    console.log('\n' + COLORS.cyan + '═'.repeat(70) + COLORS.reset);
    this.log(title, 'bright');
    console.log(COLORS.cyan + '═'.repeat(70) + COLORS.reset + '\n');
  }

  async run() {
    this.logSection('🔧 자동 디버깅 & 수정 시스템 시작');

    // Step 1: TypeScript 컴파일 오류 감지
    await this.detectTypeScriptErrors();

    // Step 2: 일반적인 문제 검사
    await this.detectCommonIssues();

    // Step 3: 에러 자동 수정
    if (this.errors.length > 0) {
      await this.fixErrors();
    }

    // Step 4: 재빌드
    await this.rebuild();

    // Step 5: 결과 출력
    this.printReport();
  }

  async detectTypeScriptErrors() {
    this.log('📋 Step 1: TypeScript 오류 감지 중...', 'yellow');

    try {
      execSync('npx tsc --noEmit 2>&1', { stdio: 'pipe' });
      this.log('✅ TypeScript: 오류 없음', 'green');
    } catch (error) {
      const output = error.stdout?.toString() || error.message;
      this.log('❌ TypeScript 오류 감지:', 'red');
      console.log(output);

      // 오류 파싱
      const typeErrors = this.parseTypeScriptErrors(output);
      this.errors.push(...typeErrors);
    }
  }

  parseTypeScriptErrors(output) {
    const errors = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('error TS')) {
        const match = line.match(/(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)/);
        if (match) {
          errors.push({
            file: match[1],
            line: parseInt(match[2]),
            col: parseInt(match[3]),
            code: `TS${match[4]}`,
            message: match[5],
            type: 'typescript',
          });
        }
      }
    }

    return errors;
  }

  async detectCommonIssues() {
    this.log('🔍 Step 2: 일반적인 문제 검사 중...', 'yellow');

    const srcDir = path.join(this.projectRoot, 'src');
    this.checkForCommonProblems(srcDir);
  }

  checkForCommonProblems(dir) {
    const files = fs.readdirSync(dir, { recursive: true, withFileTypes: true });

    for (const file of files) {
      if (!file.name.endsWith('.tsx') && !file.name.endsWith('.ts')) continue;

      const filePath = path.join(file.parentPath, file.name);
      const content = fs.readFileSync(filePath, 'utf-8');

      // 1. 누락된 import 확인
      if (content.includes('useState') && !content.includes('import { useState }')) {
        this.errors.push({
          file: filePath,
          message: 'useState import 누락',
          type: 'missing-import',
          fix: 'addImport',
          details: { hook: 'useState' },
        });
      }

      // 2. AsyncStorage import 확인
      if (content.includes('AsyncStorage.') && !content.includes("import AsyncStorage")) {
        this.errors.push({
          file: filePath,
          message: 'AsyncStorage import 누락',
          type: 'missing-import',
          fix: 'addAsyncStorageImport',
        });
      }

      // 3. 미사용 import 확인 (경고)
      const unusedImports = this.findUnusedImports(content);
      if (unusedImports.length > 0) {
        this.log(`⚠️ ${filePath}: 미사용 import 감지`, 'yellow');
      }

      // 4. console.error 확인 (디버그 코드)
      if (content.includes('console.error(') && !content.includes('// console.error')) {
        this.log(
          `ℹ️ ${filePath}: console.error 호출 감지 (디버그 코드일 수 있음)`,
          'cyan'
        );
      }
    }
  }

  findUnusedImports(content) {
    const imports = content.match(/import\s+{\s*([^}]+)\s*}\s+from/g) || [];
    const unused = [];

    for (const importStatement of imports) {
      const match = importStatement.match(/import\s+{\s*([^}]+)\s*}/);
      if (match) {
        const symbols = match[1].split(',').map(s => s.trim());
        for (const symbol of symbols) {
          const regex = new RegExp(`\\b${symbol}\\b`, 'g');
          const matches = (content.match(regex) || []).length;
          // 정의 1번 + 사용이 없으면 미사용
          if (matches === 1) {
            unused.push(symbol);
          }
        }
      }
    }

    return unused;
  }

  async fixErrors() {
    this.logSection('🔧 에러 자동 수정 중');

    for (const error of this.errors) {
      this.log(`처리 중: ${error.message}`, 'yellow');

      switch (error.type) {
        case 'missing-import':
          await this.fixMissingImport(error);
          break;
        default:
          this.log(`  ⚠️ 자동 수정 불가: ${error.message}`, 'yellow');
      }
    }
  }

  async fixMissingImport(error) {
    try {
      let content = fs.readFileSync(error.file, 'utf-8');
      const lines = content.split('\n');

      if (error.details?.hook === 'useState') {
        // React import 찾기
        const reactImportIndex = lines.findIndex(line =>
          line.includes("from 'react'")
        );

        if (reactImportIndex !== -1) {
          // 기존 import 수정
          const line = lines[reactImportIndex];
          if (!line.includes('useState')) {
            const newLine = line.replace(
              /import\s*{\s*([^}]*)\s*}/,
              (match, imports) => `import { ${imports.trim()}, useState }`
            );
            lines[reactImportIndex] = newLine;
            fs.writeFileSync(error.file, lines.join('\n'));
            this.fixes.push(`✅ ${path.basename(error.file)}: useState import 추가`);
          }
        }
      }
    } catch (err) {
      this.log(`  ❌ 수정 실패: ${err.message}`, 'red');
    }
  }

  async rebuild() {
    if (this.fixes.length === 0) {
      this.log('수정 사항 없음 - 재빌드 스킵', 'cyan');
      return;
    }

    this.logSection('🏗️ Step 3: 재빌드');

    try {
      this.log('TypeScript 재컴파일 중...', 'yellow');
      execSync('npx tsc --noEmit', { stdio: 'inherit' });
      this.log('✅ 재빌드 성공', 'green');
    } catch (error) {
      this.log('❌ 재빌드 실패', 'red');
      console.log(error.message);
      process.exit(1);
    }
  }

  async printReport() {
    this.logSection('📊 최종 보고서');

    if (this.errors.length === 0) {
      this.log('✅ 모든 문제 해결됨!', 'green');
      this.log(`수정 사항: ${this.fixes.length}개`, 'green');
      this.log('\n이제 커밋할 수 있습니다! 🚀\n', 'green');
      return;
    }

    this.log(`❌ 미해결 문제: ${this.errors.length}개`, 'red');

    for (const error of this.errors) {
      this.log(`  • ${error.file}:${error.line}`, 'red');
      this.log(`    ${error.message}`, 'red');
    }

    if (this.fixes.length > 0) {
      this.log(`\n✅ 자동 수정된 항목: ${this.fixes.length}개`, 'green');
      for (const fix of this.fixes) {
        this.log(`  ${fix}`, 'green');
      }
    }

    this.log('\n수동 수정이 필요합니다.', 'yellow');
    process.exit(1);
  }
}

// 실행
new AutoDebugger().run().catch((error) => {
  console.error('디버깅 실패:', error);
  process.exit(1);
});
