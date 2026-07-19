import { getStore } from '@netlify/blobs';
import { createLogger, corsHeaders } from './_utils.mjs';

export const config = {
  schedule: '* * * * *',
};

const log = createLogger('get-error-stats');

export default async (req, context) => {
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
