import { getStore } from "@netlify/blobs";

function b64url(bytes) {
  return btoa(String.fromCharCode(...Array.from(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - s.length % 4) % 4;
  return Uint8Array.from(atob(s + '='.repeat(pad)), c => c.charCodeAt(0));
}

async function sendPush(endpoint, pubKeyB64, privKeyB64) {
  const origin = new URL(endpoint).origin;
  const pubBytes = b64urlDecode(pubKeyB64);
  const x = pubBytes.slice(1, 33);
  const y = pubBytes.slice(33, 65);
  const d = b64urlDecode(privKeyB64);

  const jwk = { kty: 'EC', crv: 'P-256', x: b64url(x), y: b64url(y), d: b64url(d) };
  const cryptoKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );

  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: 'mailto:dctm1011@naver.com',
  })));
  const unsigned = `${header}.${payload}`;
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, cryptoKey,
    new TextEncoder().encode(unsigned)
  ));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${pubKeyB64}`,
      'TTL': '86400',
    },
  });
  return res.status;
}

export default async () => {
  const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
  const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    console.error('VAPID keys not set');
    return new Response(null, { status: 500 });
  }

  const store = getStore({ name: 'push-subs', consistency: 'strong' });
  const { blobs } = await store.list();

  let sent = 0, removed = 0, failed = 0;
  for (const blob of blobs) {
    try {
      const sub = await store.get(blob.key, { type: 'json' });
      if (!sub?.endpoint) continue;
      const status = await sendPush(sub.endpoint, PUBLIC_KEY, PRIVATE_KEY);
      if (status < 300) {
        sent++;
      } else if (status === 410 || status === 404) {
        await store.delete(blob.key);
        removed++;
      } else {
        failed++;
        console.warn(`Push failed for ${blob.key}: HTTP ${status}`);
      }
    } catch (e) {
      failed++;
      console.error(`Push error for ${blob.key}:`, e.message);
    }
  }

  console.log(`Push done: sent=${sent} removed=${removed} failed=${failed}`);
  return new Response(null, { status: 200 });
};

// 09:00 KST daily = 00:00 UTC
export const config = { schedule: '0 0 * * *' };
