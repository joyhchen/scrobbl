import rawPhotosManifest from './data/photos.json';
import { isRecord } from './lib/isRecord';

const PHOTOS_PREFIX = '/music/photos/';
const SIGN_PHOTOS_PATH = '/music/api/sign-photos';
const VALID_KEY_RE = /^\d{4}-\d{2}\/[A-Za-z0-9._-]+\.(?:webp|jpe?g|png|avif|gif)$/i;
const EXP_RE = /^\d+$/;
const PHOTO_URL_TTL_SECONDS = 300;
const MAX_SIGN_BATCH = 50;
const MAX_SIGN_BODY_BYTES = 16 * 1024;
const RATE_LIMIT_RETRY_SECONDS = '60';

const TEXT_ENCODER = new TextEncoder();

function buildAllowedPhotoKeys(manifest: unknown): ReadonlySet<string> {
  const allowed = new Set<string>();
  if (!isRecord(manifest)) return allowed;

  for (const entries of Object.values(manifest)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry.src !== 'string') continue;
      const trimmed = entry.src.trim();
      const key = trimmed.replace(/^\/?photos\//, '');
      if (VALID_KEY_RE.test(key)) {
        allowed.add(key);
      }
    }
  }
  return allowed;
}

const ALLOWED_PHOTO_KEYS = buildAllowedPhotoKeys(rawPhotosManifest);

interface WorkerEnv extends Env {
  PHOTO_SIGNING_SECRET?: string;
  SIGN_RATE_LIMITER?: RateLimit;
  PHOTO_RATE_LIMITER?: RateLimit;
}

const CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
};

function noStoreResponse(
  body: string,
  status: number,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
      ...extraHeaders,
    },
  });
}

const badRequest = () => noStoreResponse('Bad Request', 400);
const forbidden = () => noStoreResponse('Forbidden', 403);
const notFound = () => noStoreResponse('Not Found', 404);
const payloadTooLarge = () => noStoreResponse('Payload Too Large', 413);
const unsupportedMediaType = () => noStoreResponse('Unsupported Media Type', 415);
const tooManyRequests = () =>
  noStoreResponse('Too Many Requests', 429, { 'retry-after': RATE_LIMIT_RETRY_SECONDS });
const missingSecret = () => {
  console.error('PHOTO_SIGNING_SECRET is not configured');
  return noStoreResponse('Internal Server Error', 500);
};

function clientIpKey(request: Request, scope: 'sign' | 'photo'): string {
  const ip = request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
  return `${scope}:${ip}`;
}

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
  headers.set('content-type', contentTypeForKey(key));
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

function isAllowedSameOriginPost(request: Request, expectedOrigin: string): boolean {
  const secFetchSite = request.headers.get('Sec-Fetch-Site')?.trim();
  if (secFetchSite && secFetchSite !== 'same-origin') {
    return false;
  }

  const origin = request.headers.get('Origin')?.trim();
  if (origin) {
    return origin === expectedOrigin;
  }

  const referer = request.headers.get('Referer')?.trim();
  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

async function handleSignPhotos(request: Request, url: URL, env: WorkerEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return noStoreResponse('Method Not Allowed', 405, { allow: 'POST' });
  }

  if (!isAllowedSameOriginPost(request, url.origin)) {
    return forbidden();
  }

  if (env.SIGN_RATE_LIMITER) {
    const { success } = await env.SIGN_RATE_LIMITER.limit({ key: clientIpKey(request, 'sign') });
    if (!success) {
      return tooManyRequests();
    }
  }

  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return unsupportedMediaType();
  }

  const contentLengthHeader = request.headers.get('Content-Length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_SIGN_BODY_BYTES) {
      return payloadTooLarge();
    }
  }

  if (!env.PHOTO_SIGNING_SECRET) {
    return missingSecret();
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (TEXT_ENCODER.encode(rawBody).byteLength > MAX_SIGN_BODY_BYTES) {
      return payloadTooLarge();
    }
    body = JSON.parse(rawBody);
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
    if (typeof item !== 'string' || !VALID_KEY_RE.test(item) || !ALLOWED_PHOTO_KEYS.has(item)) {
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
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex, nofollow',
      },
    }
  );
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === SIGN_PHOTOS_PATH) {
      return handleSignPhotos(request, url, env);
    }

    if (!url.pathname.startsWith(PHOTOS_PREFIX)) {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return noStoreResponse('Method Not Allowed', 405, { allow: 'GET, HEAD' });
    }

    // Block cross-site hotlinks and direct tab navigation when Fetch Metadata
    // headers are sent, while still allowing in-app WebViews that omit them
    // (requests still require a valid short-lived HMAC signature below).
    const secFetchSite = request.headers.get('Sec-Fetch-Site')?.trim();
    const secFetchDest = request.headers.get('Sec-Fetch-Dest')?.trim();
    if (
      (secFetchSite && secFetchSite !== 'same-origin') ||
      (secFetchDest && secFetchDest !== 'image')
    ) {
      return forbidden();
    }

    if (env.PHOTO_RATE_LIMITER) {
      const { success } = await env.PHOTO_RATE_LIMITER.limit({ key: clientIpKey(request, 'photo') });
      if (!success) {
        return tooManyRequests();
      }
    }

    if (!env.PHOTO_SIGNING_SECRET) {
      return missingSecret();
    }

    let key: string;
    try {
      key = decodeURIComponent(url.pathname.slice(PHOTOS_PREFIX.length));
    } catch {
      return badRequest();
    }

    if (!VALID_KEY_RE.test(key) || !ALLOWED_PHOTO_KEYS.has(key)) {
      return notFound();
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
      if (!head) return notFound();

      return new Response(null, { status: 200, headers: photoHeaders(head, key, remainingSeconds) });
    }

    const object = await env.PHOTOS.get(key, { onlyIf: request.headers });
    if (!object) {
      return notFound();
    }

    const headers = photoHeaders(object, key, remainingSeconds);

    if (!('body' in object) || object.body === null) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(object.body, { status: 200, headers });
  },
} satisfies ExportedHandler<WorkerEnv>;
