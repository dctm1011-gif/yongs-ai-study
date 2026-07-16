import { getStore } from "@netlify/blobs";
import { createLogger, corsHeaders } from './_utils.mjs';

const log = createLogger('announcements');

export default async (req) => {
  const cors = corsHeaders();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    log.log('Processing request', { method: req.method });
    const store = getStore({ name: "announcements", consistency: "strong" });

    if (req.method === "GET") {
      const announcements = await store.get("list", { type: "json" }).catch(() => null);
      const result = announcements || [];
      log.log('GET announcements', { count: result.length });
      return Response.json(result, { headers: cors });
    }

    if (req.method === "POST") {
      const data = await req.json();

      // 유효성 검증
      if (!data.id || !data.title || !data.message) {
        return Response.json(
          { error: 'Missing required fields: id, title, message' },
          { status: 400, headers: cors }
        );
      }

      // 기존 공지사항 로드
      const existing = await store.get("list", { type: "json" }).catch(() => []);

      // 새 공지사항 추가 (중복 확인)
      if (!existing.find(a => a.id === data.id)) {
        existing.unshift({
          id: data.id,
          title: data.title,
          message: data.message,
          type: data.type || 'info',  // info, warning, success
          createdAt: new Date().toISOString(),
          importance: data.importance || 'normal',  // normal, high, critical
          expiresAt: data.expiresAt || null,
        });

        // 최대 50개만 유지
        if (existing.length > 50) {
          existing.pop();
        }

        await store.set("list", JSON.stringify(existing));
        log.log('POST successful', { id: data.id, total: existing.length });
      }

      return Response.json({ ok: true, timestamp: new Date().toISOString() }, { headers: cors });
    }

    if (req.method === "DELETE") {
      const { id } = await req.json();
      const existing = await store.get("list", { type: "json" }).catch(() => []);
      const filtered = existing.filter(a => a.id !== id);
      await store.set("list", JSON.stringify(filtered));
      log.log('DELETE successful', { id, remaining: filtered.length });
      return Response.json({ ok: true }, { headers: cors });
    }

    log.error('Unsupported method', { method: req.method });
    return new Response("Method not allowed", { status: 405, headers: cors });
  } catch (error) {
    log.error('Request failed', { message: error.message });
    return Response.json(
      { error: error.message },
      { status: 500, headers: cors }
    );
  }
};

export const config = { path: "/api/announcements" };
