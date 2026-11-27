import { writeFile } from 'node:fs/promises';
import { defineConfig } from 'astro/config';

const SECURITY_HEADERS = [
  '/*',
  '  X-Robots-Tag: noindex, nofollow',
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  "  Content-Security-Policy: default-src 'self'; script-src 'self' https://www.youtube.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
  '',
].join('\n');

export default defineConfig({
  output: 'static',
  base: '/music',
  outDir: './dist/music',
  integrations: [
    {
      name: 'cloudflare-static-headers',
      hooks: {
        // Workers Static Assets reads `_headers` from the root of `assets.directory` (`./dist`),
        // not from the nested `outDir` (`./dist/music`).
        'astro:build:done': async () => {
          await writeFile(new URL('./dist/_headers', import.meta.url), SECURITY_HEADERS, 'utf8');
        },
      },
    },
  ],
});
