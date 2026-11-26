# scrobbl

In 2019, I was a sophomore in college. Every month, my friend Vivian created a monthly playlist, tracking what she listened to that month. I thought that was a great idea.

It's often the case that you hear a song from years ago, and it reminds you of that place and time. It's like a time machine.

For 7 years, I've compiled these monthly playlists.

This year's holiday vibe-coded fun is an interactive iPod timeline player.

<img width="860" alt="scrobbl desk view with iPod, JOYFILM camera, and 6-disc changer" src="./assets/screenshot.png" />

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

## Adding camera roll photos

The JOYFILM camera next to the iPod displays photos for the active playlist's month (`YYYY-MM`). You can add photos in either (or both) ways:

* **Local folder**: Drop images into `public/photos/YYYY-MM/` (e.g., `public/photos/2024-03/01.jpg`) — they are auto-discovered at build time.
* **Manifest (`src/data/photos.json`)**: Add entries keyed by `YYYY-MM` with optional captions, dates, film simulation labels, or external URLs (e.g., Cloudflare R2):

```json
{
  "2024-03": [
    {
      "src": "/photos/2024-03/01.jpg",
      "date": "2024.03.18",
      "caption": "golden hour walk",
      "meta": "23mm F2.0"
    }
  ]
}
```
