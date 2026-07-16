import { getStore } from "@netlify/blobs";
import { createLogger, corsHeaders } from './_utils.mjs';

const log = createLogger('toefl_prefs');

export default async (req) => {
  const cors = corsHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    log.log('Processing request', { method: req.method });
    const store = getStore({ name: "toefl-prefs", consistency: "strong" });

    if (req.method === "GET") {
      const prefs = await store.get("prefs", { type: "json" }).catch(() => null);
      const result = prefs || { writing: [], reading: [], speaking: [], listening: [] };
      log.log('GET successful', { dataSize: JSON.stringify(result).length });
      return Response.json(result, { headers: cors });
    }

    if (req.method === "POST") {
      const prefs = await req.json();
      await store.set("prefs", JSON.stringify(prefs));
      log.log('POST successful', { dataSize: JSON.stringify(prefs).length });
      return Response.json({ ok: true, timestamp: new Date().toISOString() }, { headers: cors });
    }

    log.error('Unsupported method', { method: req.method });
    return new Response("Method not allowed", { status: 405, headers: cors });
  } catch (error) {
    log.error('Request failed', { message: error.message, stack: error.stack });
    return Response.json(
      { error: error.message, timestamp: new Date().toISOString() },
      { status: 500, headers: cors }
    );
  }
};

export const config = { path: "/api/toefl_prefs" };
