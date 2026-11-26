# scrobbl

In 2019, I was a sophomore in college. Every month, my friend Vivian created a monthly playlist, tracking what she listened to that month.

It's often the case that you hear a song from years ago, and it reminds you of that place and time. It's like a time machine.

For 7 years, I've compiled these monthly playlists.

This year's holiday vibe-coded fun is an interactive iPod timeline player.

<img width="860" alt="scrobbl interactive demo" src="./assets/demo.gif" />

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

## Todo

* Add a camera button. When clicked, it opens a realistic camera with photos from my camera roll from the corresponding year and month.