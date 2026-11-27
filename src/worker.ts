const PHOTOS_PREFIX = '/music/photos/';
const VALID_KEY_RE = /^\d{4}-\d{2}\/[A-Za-z0-9._-]+\.(?:webp|jpe?g|png|avif|gif)$/i;

const CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
};

function contentTypeForKey(key: string): string {
  const dot = key.lastIndexOf('.');
  if (dot === -1) return 'application/octet-stream';
  return CONTENT_TYPES[key.slice(dot).toLowerCase()] ?? 'application/octet-stream';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith(PHOTOS_PREFIX)) {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    }

    // Block cross-site hotlinking while allowing same-origin requests and direct navigation.
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site') {
      return new Response('Forbidden', { status: 403 });
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

    if (request.method === 'HEAD') {
      const head = await env.PHOTOS.head(key);
      if (!head) return new Response('Not Found', { status: 404 });

      const headers = new Headers();
      head.writeHttpMetadata(headers);
      if (!headers.has('content-type')) {
        headers.set('content-type', contentTypeForKey(key));
      }
      headers.set('etag', head.httpEtag);
      headers.set('cache-control', 'public, max-age=86400');
      headers.set('x-robots-tag', 'noindex, nofollow');
      headers.set('x-content-type-options', 'nosniff');
      headers.set('vary', 'Sec-Fetch-Site');
      return new Response(null, { status: 200, headers });
    }

    const object = await env.PHOTOS.get(key, { onlyIf: request.headers });
    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', contentTypeForKey(key));
    }
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=86400');
    headers.set('x-robots-tag', 'noindex, nofollow');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('vary', 'Sec-Fetch-Site');

    if (!('body' in object) || object.body === null) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(object.body, { status: 200, headers });
  },
} satisfies ExportedHandler<Env>;
