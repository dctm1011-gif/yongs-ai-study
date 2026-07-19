import { getStore } from '@netlify/blobs';
import { createLogger, corsHeaders } from './_utils.mjs';

export const config = {
  schedule: '* * * * *',
};

const log = createLogger('log-error');
const MAX_ERRORS = 1000;

export default async (req, context) => {
  const cors = corsHeaders();

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const store = getStore({ name: 'error-logs', consistency: 'strong' });

    if (req.method === 'GET') {
      try {
        const data = await store.get('list', { type: 'json' }).catch(() => null);
        const errors = data || [];
        log.log('GET error logs', { count: errors.length });
        return Response.json(errors, { headers: cors });
      } catch (e) {
        log.error('GET failed', { message: String(e) });
        return Response.json([], { status: 200, headers: cors });
      }
    }

    if (req.method === 'POST') {
      try {
        const batch = await req.json();

        if (!batch.errors || !Array.isArray(batch.errors)) {
          return Response.json(
            { error: 'Invalid batch format' },
            { status: 400, headers: cors }
          );
        }

        let errors = [];
        try {
          const data = await store.get('list', { type: 'json' }).catch(() => null);
          errors = data || [];
        } catch (e) {
          errors = [];
        }

        // Add batch errors to the list
        const newErrors = batch.errors.map((err) => ({
          ...err,
          batchId: batch.id,
          receivedAt: new Date().toISOString(),
        }));

        errors.unshift(...newErrors);

        // Keep only recent errors
        if (errors.length > MAX_ERRORS) {
          errors = errors.slice(0, MAX_ERRORS);
        }

        await store.set('list', JSON.stringify(errors));
        log.log('POST successful', {
          batchId: batch.id,
          errorsAdded: batch.errors.length,
          total: errors.length,
        });

        return Response.json(
          {
            success: true,
            batchId: batch.id,
            errorsAdded: batch.errors.length,
            total: errors.length,
          },
          { headers: cors }
        );
      } catch (e) {
        log.error('POST failed', { message: String(e) });
        return Response.json({ error: String(e) }, { status: 400, headers: cors });
      }
    }

    if (req.method === 'DELETE') {
      try {
        await store.delete('list');
        log.log('DELETE successful');
        return Response.json({ success: true }, { headers: cors });
      } catch (e) {
        log.error('DELETE failed', { message: String(e) });
        return Response.json({ error: String(e) }, { status: 400, headers: cors });
      }
    }

    log.error('Unsupported method', { method: req.method });
    return new Response('Method not allowed', { status: 405, headers: cors });
  } catch (error) {
    log.error('Request failed', { message: error.message });
    return Response.json({ error: String(error) }, { status: 500, headers: cors });
  }
};

export const config = { path: '/api/log-error' };
