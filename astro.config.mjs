import { writeFile } from 'node:fs/promises';
import { defineConfig } from 'astro/config';

const ROBOTS_HEADERS = '/*\n  X-Robots-Tag: noindex, nofollow\n';

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
          await writeFile(new URL('./dist/_headers', import.meta.url), ROBOTS_HEADERS, 'utf8');
        },
      },
    },
  ],
});
