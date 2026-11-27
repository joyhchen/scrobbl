import { isRecord } from './lib/isRecord';

const PHOTOS_PREFIX = '/music/photos/';
const SIGN_PHOTOS_PATH = '/music/api/sign-photos';
const VALID_KEY_RE = /^\d{4}-\d{2}\/[A-Za-z0-9._-]+\.(?:webp|jpe?g|png|avif|gif)$/i;
const EXP_RE = /^\d+$/;
const PHOTO_URL_TTL_SECONDS = 300;
const MAX_SIGN_BATCH = 50;

const TEXT_ENCODER = new TextEncoder();

interface WorkerEnv extends Env {
  PHOTO_SIGNING_SECRET?: string;
}

const CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
};

function noStoreResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'cache-control': 'no-store' } });
}

const badRequest = () => noStoreResponse('Bad Request', 400);
const forbidden = () => noStoreResponse('Forbidden', 403);
const missingSecret = () => noStoreResponse('Photo signing secret is not configured', 500);

function contentTypeForKey(key: string): string {
  const dot = key.lastIndexOf('.');
  if (dot === -1) return 'application/octet-stream';
  return CONTENT_TYPES[key.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) return null;
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function photoHeaders(object: R2Object, key: string, remainingSeconds: number): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', contentTypeForKey(key));
  }
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', `private, max-age=${remainingSeconds}`);
  headers.set('x-robots-tag', 'noindex, nofollow');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('vary', 'Sec-Fetch-Site, Sec-Fetch-Dest');
  return headers;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signPhotoKey(cryptoKey: CryptoKey, key: string, exp: number): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, TEXT_ENCODER.encode(`${key}:${exp}`));
  const sig = base64UrlEncode(new Uint8Array(signature));
  return `${PHOTOS_PREFIX}${key}?exp=${exp}&sig=${sig}`;
}

async function verifyPhotoSignature(
  cryptoKey: CryptoKey,
  key: string,
  expParam: string | null,
  sigParam: string | null
): Promise<number | null> {
  if (!expParam || !sigParam || !EXP_RE.test(expParam)) {
    return null;
  }

  const exp = Number(expParam);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(exp) || exp <= nowSeconds) {
    return null;
  }

  const sigBytes = base64UrlDecode(sigParam);
  if (!sigBytes || sigBytes.length !== 32) {
    return null;
  }

  const valid = await crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    sigBytes,
    TEXT_ENCODER.encode(`${key}:${exp}`)
  );
  return valid ? exp : null;
}

async function handleSignPhotos(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST', 'cache-control': 'no-store' },
    });
  }

  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return forbidden();
  }

  if (!env.PHOTO_SIGNING_SECRET) {
    return missingSecret();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest();
  }

  if (!isRecord(body) || !Array.isArray(body.keys)) {
    return badRequest();
  }

  const rawKeys: unknown[] = body.keys;
  if (rawKeys.length === 0 || rawKeys.length > MAX_SIGN_BATCH) {
    return badRequest();
  }

  const uniqueKeys = new Set<string>();
  for (const item of rawKeys) {
    if (typeof item !== 'string' || !VALID_KEY_RE.test(item)) {
      return badRequest();
    }
    uniqueKeys.add(item);
  }

  const cryptoKey = await importSigningKey(env.PHOTO_SIGNING_SECRET);
  const exp = Math.floor(Date.now() / 1000) + PHOTO_URL_TTL_SECONDS;
  const urls: Record<string, string> = {};

  for (const key of uniqueKeys) {
    urls[key] = await signPhotoKey(cryptoKey, key, exp);
  }

  return Response.json(
    { urls, expiresAt: exp * 1000 },
    {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    }
  );
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === SIGN_PHOTOS_PATH) {
      return handleSignPhotos(request, env);
    }

    if (!url.pathname.startsWith(PHOTOS_PREFIX)) {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    }

    // Only serve photos to same-origin image requests, blocking cross-site hotlinks,
    // direct tab navigation, and link unfurlers.
    if (
      request.headers.get('Sec-Fetch-Site') !== 'same-origin' ||
      request.headers.get('Sec-Fetch-Dest') !== 'image'
    ) {
      return forbidden();
    }

    if (!env.PHOTO_SIGNING_SECRET) {
      return missingSecret();
    }

    let key: string;
    try {
      key = decodeURIComponent(url.pathname.slice(PHOTOS_PREFIX.length));
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    if (!VALID_KEY_RE.test(key)) {
      return new Response('Not Found', { status: 404 });
    }

    const cryptoKey = await importSigningKey(env.PHOTO_SIGNING_SECRET);
    const verifiedExp = await verifyPhotoSignature(
      cryptoKey,
      key,
      url.searchParams.get('exp'),
      url.searchParams.get('sig')
    );
    if (verifiedExp === null) {
      return forbidden();
    }

    const remainingSeconds = Math.max(0, verifiedExp - Math.floor(Date.now() / 1000));

    if (request.method === 'HEAD') {
      const head = await env.PHOTOS.head(key);
      if (!head) return new Response('Not Found', { status: 404 });

      return new Response(null, { status: 200, headers: photoHeaders(head, key, remainingSeconds) });
    }

    const object = await env.PHOTOS.get(key, { onlyIf: request.headers });
    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = photoHeaders(object, key, remainingSeconds);

    if (!('body' in object) || object.body === null) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(object.body, { status: 200, headers });
  },
} satisfies ExportedHandler<WorkerEnv>;
