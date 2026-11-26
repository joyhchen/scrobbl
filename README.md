# scrobbl

A minimalist, skeuomorphic monthly playlist time machine built as a static [Astro](https://astro.build) site.

## Running locally

```sh
npm install
npm run dev
```

Build the static site to `dist/`:

```sh
npm run build
npm run preview
```

## Updating playlists

Replace or edit `src/data/joy-chen-monthly-playlists.json` (or `src/data/cassette-playlist.json`) and rebuild. Skipped months are handled automatically (months do not need to be contiguous), and the loader in `src/lib/playlists.ts` accepts either `{ "playlists": [...] }` or a top-level array of playlists.
