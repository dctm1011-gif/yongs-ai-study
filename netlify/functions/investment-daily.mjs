import { createLogger, corsHeaders } from './_utils.mjs';
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

export const config = {
  schedule: '0 21 * * *',
};

const log = createLogger('investment-daily');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

let app = null;
function getFirebaseApp() {
  if (!app) {
    const existing = getApps();
    app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return app;
}

/**
 * Detect rapid ROI increases
 */
function detectRapidROIIncrease(property, threshold = 10) {
  if (!property.trend || property.trend.length < 2) {
    return null;
  }

  const sorted = property.trend.sort((a, b) => new Date(a.date) - new Date(b.date));
  const recentROI = sorted[sorted.length - 1]?.roi || 0;
  const previousROI = sorted[sorted.length - 2]?.roi || 0;

  const roiChange = recentROI - previousROI;
  const changePercent = previousROI !== 0 ? (roiChange / previousROI) * 100 : 0;

  if (changePercent > threshold) {
    return {
      type: 'rapid_increase',
      roiChange: parseFloat(roiChange.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      severity: changePercent > 20 ? 'high' : 'medium',
    };
  }

  return null;
}

/**
 * Analyze ROI trend for predictions
 */
function predictROITrend(property) {
  if (!property.trend || property.trend.length < 3) {
    return {
      trend: 'insufficient_data',
      prediction: null,
      confidence: 0,
    };
  }

  const sorted = property.trend.sort((a, b) => new Date(a.date) - new Date(b.date));
  const lastThree = sorted.slice(-3);

  const roi1 = lastThree[0].roi;
  const roi2 = lastThree[1].roi;
  const roi3 = lastThree[2].roi;

  const change1 = roi2 - roi1;
  const change2 = roi3 - roi2;

  // Simple trend detection
  let trend = 'stable';
  let confidence = 50;

  if (change1 > 0 && change2 > 0) {
    trend = 'upward';
    confidence = Math.min(70 + Math.abs(change2 - change1) * 10, 95);
  } else if (change1 < 0 && change2 < 0) {
    trend = 'downward';
    confidence = Math.min(70 + Math.abs(change2 - change1) * 10, 95);
  } else {
    trend = 'volatile';
    confidence = 40;
  }

  // Predict next ROI
  const avgChange = (change1 + change2) / 2;
  const predictedROI = parseFloat((roi3 + avgChange).toFixed(2));

  return {
    trend,
    prediction: predictedROI,
    confidence: Math.round(confidence),
    lastROI: roi3,
  };
}

/**
 * Generate AI recommendations
 */
function generateAIRecommendations(properties, userPreferences) {
  const recommendations = [];
  const alerts = [];

  if (!properties || properties.length === 0) {
    return { recommendations: [], alerts: [] };
  }

  // Analyze each property
  properties.forEach(property => {
    // Check for rapid ROI increases (alert condition)
    const rapidIncrease = detectRapidROIIncrease(property, 10);
    if (rapidIncrease && rapidIncrease.severity === 'high') {
      alerts.push({
        propertyId: property.id,
        name: property.name,
        location: property.location,
        alert: `ROI ${rapidIncrease.changePercent}% 상승!`,
        alertType: 'roi_surge',
        severity: 'high',
        roiChange: rapidIncrease.roiChange,
        changePercent: rapidIncrease.changePercent,
        timestamp: new Date().toISOString(),
      });
    }

    // Predict ROI trends
    const prediction = predictROITrend(property);

    // Generate recommendation if trending upward with high confidence
    if (prediction.trend === 'upward' && prediction.confidence >= 70) {
      // Check user preferences
      const matchesPreferences =
        (!userPreferences.propertyTypes.length || userPreferences.propertyTypes.includes(property.type)) &&
        (!userPreferences.locations.length || userPreferences.locations.includes(property.location)) &&
        property.roi >= userPreferences.minROI;

      if (matchesPreferences) {
        recommendations.push({
          propertyId: property.id,
          name: property.name,
          location: property.location,
          reason: '상승 추세 감지',
          currentROI: property.roi,
          predictedROI: prediction.prediction,
          confidence: prediction.confidence,
          type: property.type,
          recommendationType: 'buy_signal',
        });
      }
    }
  });

  return {
    recommendations: recommendations.slice(0, 5), // Top 5
    alerts: alerts.slice(0, 3), // Top 3
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Transform real estate data
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
    const trend = data.trend || 'neutral';

    let roi = 2.0;
    if (trend === '상승') roi = 3.0 + Math.random() * 1.5;
    else if (trend === '보합') roi = 2.0 + Math.random() * 1.0;
    else if (trend === '하락') roi = 1.0 + Math.random() * 1.0;

    let propertyType = 'apartment';
    if (currentPrice > 1000000000) propertyType = 'villa';
    else if (currentPrice > 600000000) propertyType = 'villa';

    // Generate trend data
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
 * Main handler function (Scheduled or HTTP)
 */
export default async (req) => {
  try {
    // Scheduled function (no request)
    if (!req || !req.url) {
      log.log('Scheduled execution started');

      // Default preferences for scheduled execution
      const userPreferences = {
        propertyTypes: ['apartment', 'villa'],
        locations: [],
        minROI: 0,
        favoriteIds: [],
      };

      // Use mock real estate data
      const realEstateData = {
        real_estate: {
          '강남구': { current_price: 1250000000, trend: '상승' },
          '서초구': { current_price: 980000000, trend: '보합' },
          '종로구': { current_price: 850000000, trend: '하락' },
        }
      };

      // Transform and generate recommendations
      const properties = transformRealEstateData(realEstateData.real_estate);
      const result = generateAIRecommendations(properties, userPreferences);

      // Save to Firebase
      const firebaseApp = getFirebaseApp();
      const db = getDatabase(firebaseApp);
      const today = new Date().toISOString().split('T')[0];

      await set(ref(db, `investment/recommendations/${today}`), {
        ...result,
        timestamp: new Date().toISOString(),
        date: today,
      });

      log.log('✅ Recommendations saved to Firebase', {
        recommendations: result.recommendations.length,
        alerts: result.alerts.length,
        date: today,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Recommendations saved to Firebase',
          date: today,
          count: result.recommendations.length,
        }),
        { status: 200 }
      );
    }

    // HTTP request handling
    const cors = corsHeaders();

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(req.url);
    const pathname = url.pathname;

    log.log('AI recommendations request', { method: req.method, pathname });

    // POST /api/investment/ai-recommendations
    if (req.method === 'POST') {
      const body = await req.json();
      const userPreferences = body.preferences || {
        propertyTypes: [],
        locations: [],
        minROI: 0,
        favoriteIds: [],
      };

      // Use mock real estate data
      const realEstateData = {
        real_estate: {
          '강남구': { current_price: 1250000000, trend: '상승' },
          '서초구': { current_price: 980000000, trend: '보합' },
          '종로구': { current_price: 850000000, trend: '하락' },
        }
      };

      // Transform and generate recommendations
      const properties = transformRealEstateData(realEstateData.real_estate);
      const result = generateAIRecommendations(properties, userPreferences);

      log.log('Recommendations generated', {
        recommendations: result.recommendations.length,
        alerts: result.alerts.length,
      });

      // Also save to Firebase for HTTP POST
      try {
        const firebaseApp = getFirebaseApp();
        const db = getDatabase(firebaseApp);
        const today = new Date().toISOString().split('T')[0];

        await set(ref(db, `investment/recommendations/${today}`), {
          ...result,
          timestamp: new Date().toISOString(),
          date: today,
        });

        log.log('✅ Recommendations saved to Firebase');
      } catch (firebaseError) {
        log.warn('Firebase save failed (HTTP POST)', { message: firebaseError.message });
        // Continue anyway - still return the data
      }

      return Response.json(result, { headers: cors });
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
      { status: 500 }
    );
  }
};
