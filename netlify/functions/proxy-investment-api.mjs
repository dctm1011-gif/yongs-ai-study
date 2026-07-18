import { createLogger, corsHeaders, createResponse } from './_utils.mjs';

const log = createLogger('proxy-investment-api');

// Backend server configuration
const BACKEND_URL = process.env.INVESTMENT_API_URL || 'http://localhost:5000';
const API_TIMEOUT = 10000; // 10 seconds

// In-memory cache with TTL (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;
const responseCache = new Map();

/**
 * Cache management utilities
 */
function getCachedResponse(key) {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log.log('Cache hit', { key });
    return cached.data;
  }
  responseCache.delete(key);
  return null;
}

function setCachedResponse(key, data) {
  responseCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Transform real-estate market data into investment properties format
 * @param {object} realEstateData - Raw real estate data from backend
 * @param {boolean} includeFullTrend - Include full 30-day trend (false for list view)
 */
function transformRealEstateData(realEstateData, includeFullTrend = true) {
  if (!realEstateData || typeof realEstateData !== 'object') {
    return [];
  }

  const properties = [];
  const locations = Object.keys(realEstateData);

  locations.forEach((location, index) => {
    const data = realEstateData[location];
    if (!data || typeof data !== 'object') return;

    const currentPrice = data.current_price || 0;
    const monthlyChange = data.monthly_change || [];
    const trend = data.trend || 'neutral';
    const volatility = data.volatility || 'medium';

    // Calculate ROI based on trend
    let roi = 2.0;
    if (trend === '상승') roi = 3.0 + Math.random() * 1.5;
    else if (trend === '보합') roi = 2.0 + Math.random() * 1.0;
    else if (trend === '하락') roi = 1.0 + Math.random() * 1.0;

    // Assign property type based on price
    let propertyType = 'apartment';
    if (currentPrice > 1000000000) propertyType = 'villa';
    else if (currentPrice > 600000000) propertyType = 'villa';
    else propertyType = 'apartment';

    // Generate trend data (simulated 30-day trend) - only if needed
    let propertyTrend = null;
    if (includeFullTrend) {
      propertyTrend = [];
      for (let i = 0; i < 30; i++) {
        const roiTrend = roi * (0.8 + Math.random() * 0.4);
        propertyTrend.push({
          date: new Date(Date.now() - (30 - i) * 86400000).toISOString().split('T')[0],
          roi: parseFloat(roiTrend.toFixed(2)),
        });
      }
    }

    // Status based on volatility and trend
    let status = 'available';
    if (volatility === '높음' && trend === '하락') status = 'pending';

    const property = {
      id: `prop-${index}-${location}`,
      name: `${location} ${propertyType === 'villa' ? '프리미엄' : '스탠다드'} ${propertyType === 'villa' ? '빌라' : '아파트'}`,
      location,
      price: currentPrice,
      roi: parseFloat(roi.toFixed(2)),
      status,
      type: propertyType,
      bedrooms: propertyType === 'villa' ? 3 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2),
      bathrooms: propertyType === 'villa' ? 2 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2),
      area: propertyType === 'villa' ? 150 + Math.floor(Math.random() * 100) : 100 + Math.floor(Math.random() * 80),
    };

    // Add trend only if requested
    if (includeFullTrend) {
      property.trend = propertyTrend;
    }

    properties.push(property);
  });

  return properties;
}

/**
 * Fetch data from backend with timeout and error handling
 */
async function fetchFromBackend(endpoint) {
  const url = `${BACKEND_URL}${endpoint}`;
  log.log('Fetching from backend', { url, timeout: API_TIMEOUT });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      log.error('Backend error', { status: response.status, url });
      return null;
    }

    const data = await response.json();
    log.log('Backend response received', { status: response.status, url });
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      log.error('Backend request timeout', { url, timeout: API_TIMEOUT });
    } else {
      log.error('Backend request failed', { error: error.message, url });
    }
    return null;
  }
}

/**
 * GET /api/investment/daily-report
 * Returns daily investment report with property recommendations
 * @param {boolean} includeFullTrend - Include full trend data (default: false for list view)
 */
async function getDailyReport(includeFullTrend = false) {
  log.log('Getting daily report', { includeFullTrend });

  const cacheKey = `daily-report-${includeFullTrend ? 'full' : 'lite'}`;

  // Check cache first
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch report and real estate data in parallel
  const [reportData, realEstateData] = await Promise.all([
    fetchFromBackend('/api/report/latest'),
    fetchFromBackend('/api/market/real-estate'),
  ]);

  if (realEstateData?.real_estate) {
    const properties = transformRealEstateData(realEstateData.real_estate, includeFullTrend);
    const result = {
      properties,
      timestamp: new Date().toISOString(),
      source: 'backend',
    };

    // Cache the result
    setCachedResponse(cacheKey, result);
    return result;
  }

  // Fallback to mock data if backend is unavailable
  log.log('Using mock data (backend unavailable)');
  const mockResult = {
    properties: generateMockProperties(includeFullTrend),
    timestamp: new Date().toISOString(),
    source: 'mock',
  };

  setCachedResponse(cacheKey, mockResult);
  return mockResult;
}

/**
 * GET /api/investment/property/:id
 * Returns detailed information for a specific property
 */
async function getPropertyDetail(propertyId) {
  log.log('Getting property detail', { propertyId });

  const cacheKey = `property-${propertyId}`;

  // Check cache first
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    return cached;
  }

  // Get real estate data with full trend
  const realEstateData = await fetchFromBackend('/api/market/real-estate');

  if (realEstateData?.real_estate) {
    const properties = transformRealEstateData(realEstateData.real_estate, true);
    const property = properties.find(p => p.id === propertyId);

    if (property) {
      setCachedResponse(cacheKey, property);
      return property;
    }
  }

  // Try to find in mock data
  const mockProps = generateMockProperties(true);
  const mockProperty = mockProps.find(p => p.id === propertyId);

  if (mockProperty) {
    setCachedResponse(cacheKey, mockProperty);
    return mockProperty;
  }

  return null;
}

/**
 * POST /api/investment/preferences
 * Save user investment preferences
 */
async function savePreferences(data) {
  log.log('Saving preferences', { data });

  // Send to backend
  try {
    const response = await fetch(`${BACKEND_URL}/api/preference/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        region: data.locations?.[0] || '',
        district: data.locations?.join(',') || '',
        liked: true,
      }),
    });

    if (!response.ok) {
      log.error('Backend preferences update failed', { status: response.status });
      return false;
    }

    log.log('Preferences saved successfully');
    return true;
  } catch (error) {
    log.error('Failed to save preferences', { error: error.message });
    // Still return success for client-side storage
    return true;
  }
}

/**
 * POST /api/investment/favorites
 * Add or remove property from favorites
 */
async function updateFavorite(data) {
  log.log('Updating favorite', { propertyId: data.propertyId, isFavorite: data.isFavorite });

  // Backend doesn't have a direct favorites endpoint yet
  // Just log and return success for client-side handling
  return {
    propertyId: data.propertyId,
    isFavorite: data.isFavorite,
    saved: true,
  };
}

/**
 * Generate mock property data (fallback)
 * @param {boolean} includeFullTrend - Include full 30-day trend
 */
function generateMockProperties(includeFullTrend = true) {
  const properties = [
    {
      id: 'mock-1',
      name: '강남 럭셔리 아파트',
      location: '강남구',
      price: 1250000000,
      roi: 3.5,
      status: 'available',
      type: 'apartment',
      bedrooms: 3,
      bathrooms: 2,
      area: 150,
    },
    {
      id: 'mock-2',
      name: '서초 프리미엄 빌라',
      location: '서초구',
      price: 980000000,
      roi: 2.8,
      status: 'available',
      type: 'villa',
      bedrooms: 4,
      bathrooms: 3,
      area: 200,
    },
    {
      id: 'mock-3',
      name: '종로 한옥 타운하우스',
      location: '종로구',
      price: 850000000,
      roi: 2.1,
      status: 'pending',
      type: 'townhouse',
      bedrooms: 2,
      bathrooms: 2,
      area: 120,
    },
  ];

  // Add full trend data if requested
  if (includeFullTrend) {
    properties.forEach((prop) => {
      prop.trend = [];
      const roi = prop.roi;
      for (let i = 0; i < 30; i++) {
        const roiTrend = roi * (0.8 + Math.random() * 0.4);
        prop.trend.push({
          date: new Date(Date.now() - (30 - i) * 86400000).toISOString().split('T')[0],
          roi: parseFloat(roiTrend.toFixed(2)),
        });
      }
    });
  }

  return properties;
}

/**
 * Add cache control headers to response
 */
function addCacheHeaders(headers, maxAge = 300) {
  headers['Cache-Control'] = `public, max-age=${maxAge}`;
  headers['ETag'] = `W/"${Date.now()}"`;
  return headers;
}

/**
 * Main handler function
 */
export default async (req) => {
  const cors = corsHeaders();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const query = new URLSearchParams(url.search);

    log.log('Request received', { method: req.method, pathname });

    // GET /api/investment/daily-report?full=true/false
    if (pathname === '/.netlify/functions/proxy-investment-api/api/investment/daily-report' && req.method === 'GET') {
      const includeFullTrend = query.get('full') === 'true';
      const data = await getDailyReport(includeFullTrend);
      const headers = { ...cors };
      addCacheHeaders(headers, 300); // 5 minutes cache
      return Response.json(data, { headers });
    }

    // GET /api/investment/property/:id
    if (pathname.includes('/api/investment/property/') && req.method === 'GET') {
      const propertyId = pathname.split('/').pop();
      const property = await getPropertyDetail(propertyId);

      if (property) {
        const headers = { ...cors };
        addCacheHeaders(headers, 300); // 5 minutes cache
        return Response.json(property, { headers });
      }

      return Response.json(
        { error: 'Property not found' },
        { status: 404, headers: cors }
      );
    }

    // POST /api/investment/preferences
    if (pathname === '/.netlify/functions/proxy-investment-api/api/investment/preferences' && req.method === 'POST') {
      const data = await req.json();
      const success = await savePreferences(data);

      const headers = { ...cors };
      addCacheHeaders(headers, 0); // No cache for POST
      return Response.json(
        { success, message: 'Preferences saved' },
        { status: success ? 200 : 500, headers }
      );
    }

    // POST /api/investment/favorites
    if (pathname === '/.netlify/functions/proxy-investment-api/api/investment/favorites' && req.method === 'POST') {
      const data = await req.json();
      const result = await updateFavorite(data);

      const headers = { ...cors };
      addCacheHeaders(headers, 0); // No cache for POST
      return Response.json(result, { headers });
    }

    // Unknown endpoint
    log.error('Unknown endpoint', { pathname, method: req.method });
    return Response.json(
      { error: 'Endpoint not found' },
      { status: 404, headers: cors }
    );
  } catch (error) {
    log.error('Request handler error', { error: error.message });
    return Response.json(
      { error: error.message },
      { status: 500, headers: cors }
    );
  }
};

export const config = { path: '/api/investment/*' };
