#!/usr/bin/env node

import https from 'https';

const NETLIFY_BASE = 'https://illustrious-cuchufli-7c4e58.netlify.app';

const tests = [
  { name: 'Health Check', url: '/.netlify/functions/test', method: 'GET' },
  { name: 'Trending Videos', url: '/.netlify/functions/trending-videos', method: 'GET' },
  { name: 'TOEFL Prefs GET', url: '/api/toefl_prefs', method: 'GET' },
  { name: 'TOEFL Prefs OPTIONS', url: '/api/toefl_prefs', method: 'OPTIONS' },
];

function request(url, method) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(NETLIFY_BASE + url);
    const options = {
      hostname: fullUrl.hostname,
      path: fullUrl.pathname + fullUrl.search,
      method,
      timeout: 10000,
      headers: { 'User-Agent': 'Netlify-Test-Bot' },
    };

    const req = https
      .request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode, data, headers: res.headers });
        });
      })
      .on('error', reject)
      .on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Netlify Functions\n');
  const results = [];

  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}...`);
      const result = await request(test.url, test.method);

      const isSuccess = result.status >= 200 && result.status < 300;
      const status = isSuccess ? '✅' : '❌';
      console.log(`${status} ${test.name}: ${result.status}`);

      results.push({
        name: test.name,
        url: test.url,
        method: test.method,
        status: result.status,
        success: isSuccess,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
      results.push({
        name: test.name,
        url: test.url,
        method: test.method,
        error: error.message,
        success: false,
        timestamp: new Date().toISOString(),
      });
    }
  }

  console.log('\n📊 Summary:');
  const passed = results.filter((r) => r.success).length;
  const total = results.length;
  console.log(`Passed: ${passed}/${total}`);

  if (passed < total) {
    console.log('\n❌ Some tests failed!');
    console.log(JSON.stringify(results, null, 2));
    process.exit(1);
  }

  console.log('\n✅ All tests passed!');
  process.exit(0);
}

runTests().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
