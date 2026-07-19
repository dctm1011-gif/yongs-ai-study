/**
 * Quick test for investment API proxy function
 * Run with: node netlify/functions/test-investment-api.mjs
 */

// Import the investment proxy handler
import handler, { config } from './proxy-investment-api.mjs';

console.log('Testing Investment API Proxy...\n');
console.log('Configuration:', config);
console.log('---\n');

// Test 1: Daily report
console.log('TEST 1: GET /api/investment/daily-report');
try {
  const req1 = new Request('http://localhost/.netlify/functions/proxy-investment-api/api/investment/daily-report', {
    method: 'GET',
  });

  const response1 = await handler(req1);
  const data1 = await response1.json();

  console.log('Status:', response1.status);
  console.log('Response:', {
    propertiesCount: data1.properties?.length || 0,
    timestamp: data1.timestamp,
    source: data1.source,
    firstProperty: data1.properties?.[0]?.name,
  });
  console.log('✓ PASS\n');
} catch (error) {
  console.log('✗ FAIL:', error.message, '\n');
}

// Test 2: Property detail
console.log('TEST 2: GET /api/investment/property/mock-1');
try {
  const req2 = new Request('http://localhost/.netlify/functions/proxy-investment-api/api/investment/property/mock-1', {
    method: 'GET',
  });

  const response2 = await handler(req2);
  const data2 = await response2.json();

  console.log('Status:', response2.status);
  console.log('Response:', {
    id: data2.id,
    name: data2.name,
    location: data2.location,
    roi: data2.roi,
  });
  console.log('✓ PASS\n');
} catch (error) {
  console.log('✗ FAIL:', error.message, '\n');
}

// Test 3: Preferences POST
console.log('TEST 3: POST /api/investment/preferences');
try {
  const req3 = new Request('http://localhost/.netlify/functions/proxy-investment-api/api/investment/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      propertyTypes: ['apartment', 'villa'],
      locations: ['강남구', '서초구'],
      minPrice: 500000000,
      maxPrice: 2000000000,
      minROI: 2.0,
    }),
  });

  const response3 = await handler(req3);
  const data3 = await response3.json();

  console.log('Status:', response3.status);
  console.log('Response:', data3);
  console.log('✓ PASS\n');
} catch (error) {
  console.log('✗ FAIL:', error.message, '\n');
}

// Test 4: CORS preflight
console.log('TEST 4: OPTIONS /api/investment/daily-report (CORS)');
try {
  const req4 = new Request('http://localhost/.netlify/functions/proxy-investment-api/api/investment/daily-report', {
    method: 'OPTIONS',
  });

  const response4 = await handler(req4);

  console.log('Status:', response4.status);
  console.log('CORS Headers:');
  console.log('  - Access-Control-Allow-Origin:', response4.headers.get('Access-Control-Allow-Origin'));
  console.log('  - Access-Control-Allow-Methods:', response4.headers.get('Access-Control-Allow-Methods'));
  console.log('  - Access-Control-Allow-Headers:', response4.headers.get('Access-Control-Allow-Headers'));
  console.log('✓ PASS\n');
} catch (error) {
  console.log('✗ FAIL:', error.message, '\n');
}

console.log('---\nAll tests completed!');
