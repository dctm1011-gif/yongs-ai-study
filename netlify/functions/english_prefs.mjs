import { getStore } from "@netlify/blobs";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const store = getStore({ name: "english-prefs", consistency: "strong" });

  if (req.method === "GET") {
    const prefs = await store.get("prefs", { type: "json" }).catch(() => null);
    return Response.json(
      prefs || { wordbook: [], quiz: [], test: [], completed: [] },
      { headers: CORS }
    );
  }

  if (req.method === "POST") {
    const prefs = await req.json();
    await store.set("prefs", JSON.stringify(prefs));
    return Response.json({ ok: true }, { headers: CORS });
  }

  return new Response("Method not allowed", { status: 405, headers: CORS });
};

export const config = { path: "/api/english_prefs" };
