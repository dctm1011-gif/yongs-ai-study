import { createLogger, createResponse } from './_utils.mjs';

const log = createLogger('test');

export async function handler(event, context) {
  log.log('Health check', { method: event.httpMethod, timestamp: new Date().toISOString() });

  return createResponse(200, {
    message: 'Netlify Functions working correctly',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
  });
}
