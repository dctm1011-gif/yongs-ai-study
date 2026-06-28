import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "push-subs", consistency: "strong" });

  if (req.method === 'POST') {
    const sub = await req.json();
    if (!sub?.endpoint) return Response.json({ error: 'invalid' }, { status: 400 });
    const key = btoa(sub.endpoint).replace(/[+/=]/g, '_').slice(0, 40);
    await store.setJSON(key, sub);
    return Response.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { endpoint } = await req.json().catch(() => ({}));
    if (endpoint) {
      const key = btoa(endpoint).replace(/[+/=]/g, '_').slice(0, 40);
      await store.delete(key).catch(() => {});
    }
    return Response.json({ ok: true });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: '/api/push/subscribe' };
