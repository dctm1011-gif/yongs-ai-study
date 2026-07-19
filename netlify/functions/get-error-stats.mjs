import { getStore } from '@netlify/blobs';
import { createLogger, corsHeaders } from './_utils.mjs';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

export const config = {
  schedule: '* * * * *',
};

const log = createLogger('get-error-stats');

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

export default async (req, context) => {
  // Scheduled execution (no request object)
  if (!req || !req.url) {
    try {
      const app = initializeApp(firebaseConfig);
      const db = getDatabase(app);
      const timestamp = new Date().toISOString();

      await set(ref(db, `errors/stats/${timestamp.split('T')[0]}`), {
        timestamp,
        status: 'monitoring',
        type: 'stats-collection',
      });

      log.log('✅ Error stats saved to Firebase');
      return new Response(
        JSON.stringify({ success: true, message: 'Stats collected' }),
        { status: 200 }
      );
    } catch (error) {
      log.error('Stats collection failed:', error.message);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500 }
      );
    }
  }

  // HTTP request handling
  const cors = corsHeaders();

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  try {
    const store = getStore({ name: 'error-logs', consistency: 'strong' });
    const data = await store.get('list', { type: 'json' }).catch(() => null);
    const errors = data || [];

    // Calculate statistics
    const stats = calculateStats(errors);

    log.log('GET stats successful', { errorCount: errors.length });

    return Response.json(stats, { headers: cors });
  } catch (error) {
    log.error('Request failed', { message: error.message });
    return Response.json({ error: String(error) }, { status: 500, headers: cors });
  }
};

function calculateStats(errors) {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Filter last 24 hours
  const recentErrors = errors.filter((err) => new Date(err.timestamp) > last24h);

  // Severity distribution
  const bySeverity = {
    fatal: errors.filter((e) => e.severity === 'fatal').length,
    error: errors.filter((e) => e.severity === 'error').length,
    warning: errors.filter((e) => e.severity === 'warning').length,
  };

  // By tab
  const byTab = {};
  errors.forEach((err) => {
    byTab[err.tab] = (byTab[err.tab] || 0) + 1;
  });

  // Hourly trend (last 24h)
  const hourlyTrend = {};
  for (let i = 0; i < 24; i++) {
    const hour = (now.getHours() - i + 24) % 24;
    const key = `${hour}:00`;
    hourlyTrend[key] = 0;
  }

  recentErrors.forEach((err) => {
    const date = new Date(err.timestamp);
    const hour = date.getHours();
    const key = `${hour}:00`;
    hourlyTrend[key] = (hourlyTrend[key] || 0) + 1;
  });

  // Top errors
  const errorCounts = {};
  errors.forEach((err) => {
    const key = `${err.tab}::${err.error}`;
    errorCounts[key] = (errorCounts[key] || 0) + 1;
  });

  const topErrors = Object.entries(errorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([key, count]) => {
      const [tab, ...errorParts] = key.split('::');
      return {
        tab,
        error: errorParts.join('::'),
        count,
      };
    });

  // First and last errors
  const firstError = errors[errors.length - 1] || null;
  const lastError = errors[0] || null;

  return {
    summary: {
      total: errors.length,
      in24h: recentErrors.length,
      severity: bySeverity,
    },
    byTab,
    hourlyTrend,
    topErrors,
    firstError,
    lastError,
    timestamp: now.toISOString(),
  };
}

export const config = { path: '/api/error-stats' };
