import { createLogger, corsHeaders } from './_utils.mjs';

const log = createLogger('weekly-investment-summary');

const BACKEND_URL = process.env.INVESTMENT_API_URL || 'http://localhost:5000';
const API_TIMEOUT = 10000;

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
 * Calculate ROI change statistics
 */
function calculateROIStats(historicalData) {
  if (!historicalData || historicalData.length < 2) {
    return {
      weeklyChange: 0,
      changePercent: 0,
      trend: 'stable',
    };
  }

  const sorted = historicalData.sort((a, b) => new Date(a.date) - new Date(b.date));
  const weekAgo = sorted.length > 7 ? sorted[sorted.length - 8] : sorted[0];
  const today = sorted[sorted.length - 1];

  const change = today.roi - weekAgo.roi;
  const changePercent = weekAgo.roi !== 0 ? ((change / weekAgo.roi) * 100) : 0;

  let trend = 'stable';
  if (changePercent > 5) trend = '상승';
  else if (changePercent < -5) trend = '하락';

  return {
    weeklyChange: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    trend,
    previousRoi: parseFloat(weekAgo.roi.toFixed(2)),
    currentRoi: parseFloat(today.roi.toFixed(2)),
  };
}

/**
 * Transform real estate data with ROI trends
 */
function transformRealEstateData(realEstateData) {
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

    let roi = 2.0;
    if (trend === '상승') roi = 3.0 + Math.random() * 1.5;
    else if (trend === '보합') roi = 2.0 + Math.random() * 1.0;
    else if (trend === '하락') roi = 1.0 + Math.random() * 1.0;

    let propertyType = 'apartment';
    if (currentPrice > 1000000000) propertyType = 'villa';
    else if (currentPrice > 600000000) propertyType = 'villa';

    // Generate trend data (simulated 30-day trend)
    const propertyTrend = [];
    for (let i = 0; i < 30; i++) {
      const roiTrend = roi * (0.8 + Math.random() * 0.4);
      propertyTrend.push({
        date: new Date(Date.now() - (30 - i) * 86400000).toISOString().split('T')[0],
        roi: parseFloat(roiTrend.toFixed(2)),
      });
    }

    properties.push({
      id: `prop-${index}-${location}`,
      name: `${location} ${propertyType === 'villa' ? '프리미엄' : '스탠다드'} ${propertyType === 'villa' ? '빌라' : '아파트'}`,
      location,
      price: currentPrice,
      roi: parseFloat(roi.toFixed(2)),
      type: propertyType,
      trend: propertyTrend,
    });
  });

  return properties;
}

/**
 * Generate weekly summary report
 */
function generateWeeklySummary(properties) {
  if (!properties || properties.length === 0) {
    return {
      period: 'weekly',
      weekStartDate: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
      weekEndDate: new Date().toISOString().split('T')[0],
      totalProperties: 0,
      averageROI: 0,
      topRisers: [],
      topFallers: [],
      summary: '데이터가 없습니다',
    };
  }

  // Calculate ROI stats for each property
  const propertyStats = properties.map(prop => ({
    ...prop,
    stats: calculateROIStats(prop.trend),
  }));

  // Sort by weekly change
  const sorted = [...propertyStats].sort((a, b) => b.stats.changePercent - a.stats.changePercent);
  const topRisers = sorted.slice(0, 3).map(p => ({
    name: p.name,
    location: p.location,
    currentROI: p.roi,
    weeklyChange: p.stats.weeklyChange,
    changePercent: p.stats.changePercent,
  }));

  const topFallers = sorted.slice(-3).reverse().map(p => ({
    name: p.name,
    location: p.location,
    currentROI: p.roi,
    weeklyChange: p.stats.weeklyChange,
    changePercent: p.stats.changePercent,
  }));

  const averageROI = (properties.reduce((sum, p) => sum + p.roi, 0) / properties.length).toFixed(2);

  // Generate summary text
  const summaryParts = [];
  if (topRisers.length > 0) {
    summaryParts.push(`상승: ${topRisers[0].name} (${topRisers[0].changePercent}% ↑)`);
  }
  if (topFallers.length > 0) {
    summaryParts.push(`하락: ${topFallers[0].name} (${topFallers[0].changePercent}% ↓)`);
  }
  summaryParts.push(`평균 ROI: ${averageROI}%`);

  return {
    period: 'weekly',
    weekStartDate: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
    weekEndDate: new Date().toISOString().split('T')[0],
    totalProperties: properties.length,
    averageROI: parseFloat(averageROI),
    topRisers,
    topFallers,
    summary: summaryParts.join(' | '),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Main scheduled function handler
 */
export default async (req) => {
  const cors = corsHeaders();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    log.log('Weekly investment summary job started');

    // Fetch real estate data from backend
    const realEstateData = await fetchFromBackend('/api/market/real-estate');

    if (!realEstateData?.real_estate) {
      log.error('Failed to fetch real estate data');
      return Response.json(
        { error: 'Failed to fetch real estate data' },
        { status: 500, headers: cors }
      );
    }

    // Transform and analyze data
    const properties = transformRealEstateData(realEstateData.real_estate);
    const weeklySummary = generateWeeklySummary(properties);

    log.log('Weekly summary generated', {
      totalProperties: weeklySummary.totalProperties,
      averageROI: weeklySummary.averageROI,
      topRisers: weeklySummary.topRisers.length,
      topFallers: weeklySummary.topFallers.length,
    });

    return Response.json(weeklySummary, { headers: cors });
  } catch (error) {
    log.error('Weekly summary generation error', { error: error.message });
    return Response.json(
      { error: error.message },
      { status: 500, headers: cors }
    );
  }
};

export const config = { path: '/api/investment/weekly-summary' };
