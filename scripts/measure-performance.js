#!/usr/bin/env node

/**
 * Performance Measurement Script
 * Measures bundle size, performance metrics, and generates report
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function header(title) {
  log('\n' + '='.repeat(60), 'cyan');
  log(title, 'cyan');
  log('='.repeat(60) + '\n', 'cyan');
}

function measureBundleSize() {
  header('📦 Bundle Size Analysis');

  try {
    // Get node_modules size
    const nodeModulesSize = getDirectorySize('./node_modules');
    log(`node_modules: ${(nodeModulesSize / 1024 / 1024).toFixed(2)} MB`, 'blue');

    // Get src size
    const srcSize = getDirectorySize('./src');
    log(`src/: ${(srcSize / 1024 / 1024).toFixed(2)} MB`, 'blue');

    // Get assets size
    const assetsSize = getDirectorySize('./assets');
    log(`assets/: ${(assetsSize / 1024 / 1024).toFixed(2)} MB`, 'blue');

    // Estimate bundle size (rough)
    const estimatedBundleSize = srcSize * 2.5; // JS gets heavier after bundling
    const estimatedAPKSize = estimatedBundleSize + 50 * 1024 * 1024; // ~50MB base + bundle

    log(`\n📊 Estimated Sizes:`, 'yellow');
    log(`Estimated JS Bundle: ${(estimatedBundleSize / 1024 / 1024).toFixed(2)} MB`, 'yellow');
    log(`Estimated APK: ${(estimatedAPKSize / 1024 / 1024).toFixed(2)} MB`, 'yellow');

    if (estimatedBundleSize < 5 * 1024 * 1024) {
      log('✅ Bundle size target (< 5MB) likely ACHIEVED', 'green');
    } else {
      log('⚠️  Bundle size may exceed target (< 5MB)', 'red');
    }
  } catch (error) {
    log(`Error measuring bundle size: ${error.message}`, 'red');
  }
}

function analyzePackageSize() {
  header('📋 Package Dependencies Analysis');

  try {
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    log(`Total Dependencies: ${Object.keys(dependencies).length}`, 'blue');
    log(`Dev Dependencies: ${Object.keys(devDependencies).length}`, 'blue');

    log(`\n📦 Production Dependencies:`, 'yellow');
    Object.entries(dependencies).forEach(([name, version]) => {
      log(`  ${name}: ${version}`, 'blue');
    });

    log(`\n🔧 Dev Dependencies:`, 'yellow');
    Object.entries(devDependencies).forEach(([name, version]) => {
      log(`  ${name}: ${version}`, 'blue');
    });

    // Identify large packages
    log(`\n⚠️  Note: Run 'npm ls --depth=0' for detailed size breakdown`, 'yellow');
  } catch (error) {
    log(`Error analyzing packages: ${error.message}`, 'red');
  }
}

function analyzeTabs() {
  header('🗂️  Tab Components Analysis');

  const tabs = [
    { name: 'English', file: './src/app/english.tsx' },
    { name: 'TOEFL', file: './src/app/toefl.tsx' },
    { name: 'Papers', file: './src/app/papers.tsx' },
    { name: 'Play', file: './src/app/play.tsx' },
    { name: 'Storage', file: './src/app/storage.tsx' },
    { name: 'Settings', file: './src/app/settings.tsx' },
  ];

  const results = [];

  tabs.forEach(({ name, file }) => {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;
      const size = content.length;
      const hasMemo = content.includes('React.memo');
      const hasFlatList = content.includes('FlatList');
      const hasCache = content.includes('AsyncStorage') || content.includes('cacheManager');

      results.push({
        name,
        lines,
        size,
        hasMemo,
        hasFlatList,
        hasCache,
      });

      log(`${name.padEnd(12)} ${lines.toString().padEnd(5)} lines ${(size / 1024).toFixed(1).padEnd(6)} KB`, 'blue');
    } catch (error) {
      log(`${name}: NOT FOUND`, 'red');
    }
  });

  // Summary
  const totalLines = results.reduce((sum, r) => sum + r.lines, 0);
  const optimizedTabs = results.filter(r => r.hasMemo || r.hasCache).length;

  log(`\n📊 Summary:`, 'yellow');
  log(`Total lines: ${totalLines}`, 'blue');
  log(`Optimized tabs (memo/cache): ${optimizedTabs}/${results.length}`, 'blue');

  results.forEach(r => {
    if (!r.hasMemo && !r.hasCache) {
      log(`⚠️  ${r.name} needs optimization`, 'yellow');
    }
  });
}

function checkPerformanceFeatures() {
  header('✨ Performance Features Checklist');

  const features = [
    {
      name: 'CacheManager',
      file: './src/utils/CacheManager.ts',
      icon: '💾',
    },
    {
      name: 'NetworkOptimizer',
      file: './src/utils/NetworkOptimizer.ts',
      icon: '🌐',
    },
    {
      name: 'PerformanceMonitor',
      file: './src/utils/PerformanceMonitor.ts',
      icon: '📊',
    },
    {
      name: 'useCacheStrategy Hook',
      file: './src/hooks/useCacheStrategy.ts',
      icon: '🪝',
    },
    {
      name: 'useNetworkOptimizer Hook',
      file: './src/hooks/useNetworkOptimizer.ts',
      icon: '🪝',
    },
    {
      name: 'OptimizedImage Component',
      file: './src/components/OptimizedImage.tsx',
      icon: '🖼️',
    },
    {
      name: 'Hermes Engine',
      file: './app.json',
      check: (content) => content.includes('"enableHermes": true'),
    },
    {
      name: 'Tree-shaking',
      file: './package.json',
      check: (content) => content.includes('"sideEffects": false'),
    },
  ];

  let completed = 0;
  features.forEach(feature => {
    try {
      const content = fs.readFileSync(feature.file, 'utf-8');
      const check = feature.check ? feature.check(content) : true;

      if (check) {
        log(`${feature.icon} ${feature.name.padEnd(25)} ✅ READY`, 'green');
        completed++;
      } else {
        log(`${feature.icon} ${feature.name.padEnd(25)} ⚠️  NEEDS CHECK`, 'yellow');
      }
    } catch (error) {
      log(`${feature.icon} ${feature.name.padEnd(25)} ❌ MISSING`, 'red');
    }
  });

  log(`\n📈 Implementation: ${completed}/${features.length} complete`, 'cyan');
}

function generateReport() {
  header('📝 Performance Optimization Report');

  const report = {
    timestamp: new Date().toISOString(),
    measurements: [],
    targets: {
      bundleSize: '< 5MB',
      tabLoadTime: '< 500ms',
      cacheHitRate: '> 70%',
      fps: '> 55fps',
      memoryUsage: '< 200MB',
    },
  };

  log(`Generated: ${report.timestamp}`, 'blue');
  log(`Targets: `, 'yellow');
  Object.entries(report.targets).forEach(([key, value]) => {
    log(`  ${key}: ${value}`, 'blue');
  });

  return report;
}

function getDirectorySize(dir) {
  if (!fs.existsSync(dir)) {
    return 0;
  }

  let size = 0;
  const files = fs.readdirSync(dir, { withFileTypes: true });

  files.forEach(file => {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      size += getDirectorySize(fullPath);
    } else {
      const stats = fs.statSync(fullPath);
      size += stats.size;
    }
  });

  return size;
}

// Main execution
function main() {
  log('\n🚀 YongStudy Performance Measurement Script', 'cyan');
  log(`Started: ${new Date().toLocaleString()}`, 'cyan');

  try {
    measureBundleSize();
    analyzePackageSize();
    analyzeTabs();
    checkPerformanceFeatures();
    const report = generateReport();

    header('✅ Measurement Complete');

    log(`\n📖 Next Steps:`, 'cyan');
    log(`1. Run 'npm run build' to create APK`, 'blue');
    log(`2. Measure APK size: adb shell pm dump com.dctm1011.yongstudy | grep apkSize`, 'blue');
    log(`3. Test each tab load time manually`, 'blue');
    log(`4. Review PERFORMANCE_OPTIMIZATION.md for detailed results`, 'blue');

    log(`\n📊 Reference:`, 'cyan');
    log(`See: PERFORMANCE_OPTIMIZATION.md for detailed analysis`, 'blue');
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
