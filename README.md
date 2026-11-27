# scrobbl

In 2019, I was a sophomore in college. Every month, my friend Vivian created a monthly playlist, tracking what she listened to that month. I thought that was a great idea.

When you hear a song from years ago, it reminds you of that place and time. It's like a time machine.

For 7 years, I've compiled these monthly playlists.

For this year's holiday vibe-coded fun, I organized these playlists into a timeline.

* Left side - quick access to MONTH-YEAR
* iPod - click song to play (embedded YouTube video)
* Camera module - photos from that month

<img width="860" alt="scrobbl desk view with iPod, JOYFILM camera, CD book, and 6-disc changer" src="./assets/screenshot.png" />

Other cool functionality:
* Film simulations on the camera - click `Q` to apply film sims
* Buttons on the iPod are functional
* Disc changer (I loaded another one, a generic playlist of 100 top Chinese songs)
* CD book - the zippered binder next to the iPod holds the whole collection, 4 sleeves per page. Pick a disc to load it into the changer. Some discs live only in the book, like the first CD I ever bought

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

* Playlists go in `src/data/`
* Timeline files don't need to have contiguous playlists (i.e. Jan 2019 -> next playlist Feb 2020 is fine.)
* The disc changer handles either 1) a single playlist, or 2) a list of playlists (timeline)
* After adding new tracks, populate their `youtubeId` fields with:

```sh
npm run populate-youtube
```

Sadly, YouTube bans embedding most tracks.

## Adding a disc to the CD book

1. Add the tracklist to `src/data/` (same shape as `andy-grammer-2011.json`), and add the file to `DATA_FILES` in `scripts/populate-youtube-ids.mjs`
2. Add an entry to `loadDiscs()` in `src/lib/discs.ts`

```ts
{
  id: 'andy-grammer-2011',
  tapeLabel: 'andy grammer',          // written on the masking tape on the disc
  tapeSubLabel: '2011 · 11 tracks',
  tapeTiltDeg: -2.4,
  discTone: 'silver',                 // or 'gold'
  ipodTheme: 'aqua',
  showTimelineDial: false,            // true only for month-by-month timelines
  playlists: [andyGrammerAlbum],
  inChangerByDefault: false,          // optional: starts in the book, not the changer
  sleeveNote: 'first cd i ever bought, borders liquidation sale, sep 2011', // optional: tape note on the sleeve
},
```

Every disc shows up in the book. The first 6 that aren't `inChangerByDefault: false` start loaded in the changer. Loading a disc from the book puts it in the first empty tray, or swaps out the disc that's playing if all 6 are full. Your changer loadout is remembered in the browser.

## Adding camera roll photos

Photos are stored in the private `scrobbl-photos` Cloudflare R2 bucket and served via short-lived (5-minute) HMAC-signed URLs minted by `src/worker.ts`.

Before deploying, set the Worker signing secret once:

```sh
npx wrangler secret put PHOTO_SIGNING_SECRET
```

For local `wrangler dev`, add `PHOTO_SIGNING_SECRET=<random-secret>` to `.dev.vars` (gitignored).

1. Add your compressed images to a temp folder organized by `YYYY-MM/` (e.g., `./incoming/2026-11/01-thanksgiving.webp`). Run the script to upload them to R2:

```sh
npm run upload-photos -- ./incoming
```

2. Add the entries to `src/data/photos.json`:

```json
{
  "2026-11": [
    {
      "src": "/photos/2026-11/01-thanksgiving.webp",
      "date": "2026.11.26",
      "caption": "thanksgiving spread",
      "meta": "23mm F2.0"
    }
  ]
}
```
