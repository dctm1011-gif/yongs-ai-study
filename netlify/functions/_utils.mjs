export function createLogger(functionName) {
  return {
    log: (message, data = {}) => {
      console.log(`[${functionName}] ${message}`, data);
    },
    error: (message, error = {}) => {
      console.error(`[${functionName}] ERROR: ${message}`, error);
    },
    debug: (message, data = {}) => {
      console.debug(`[${functionName}] DEBUG: ${message}`, data);
    },
  };
}

export function createResponse(statusCode, body, headers = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'X-Function-Timestamp': new Date().toISOString(),
    ...headers,
  };

  return {
    statusCode,
    headers: defaultHeaders,
    body: JSON.stringify({
      success: statusCode < 400,
      timestamp: new Date().toISOString(),
      ...(typeof body === 'string' ? { error: body } : body),
    }),
  };
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
