# Ophixe website

Static landing page — no build step, no dependencies. Upload the contents of
this folder to any static host.

## Pages

- `index.html` — landing page: hero, features, 50-second demo video,
  invite-code join box, downloads.
- `join.html` — invite landing (`join.html?code=K7Q2XD`): opens the app via
  `ophixe://join?code=…`, falls back to the store. Share links shaped like
  `https://yourdomain.com/join.html?code=K7Q2XD`.
- `assets/` — `icon.svg` (logo), `icon-512.png` (link previews),
  `apple-touch-icon.png` (iOS home screen), `demo.mp4` + `demo-poster.png`
  (tour video), `badges/` (official Google Play, App Store, Android artwork).

## Before launch

1. In `index.html`, set `CONFIG.appStore` when the iOS listing is live —
   the iPhone buttons enable themselves.
2. If the APK URL changes, update `CONFIG.androidApk` (same file).

## Hosting (Vercel)

1. Push this repo, then import it at [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `website` (Framework Preset: Other — there is
   no build step). Deploy.
3. Add your domain under Project → Settings → Domains (free SSL included).
4. Point the app at the new invite page: in `lib/invites.ts`, change
   `INVITE_PAGE_URL` to `https://yourdomain.com/join.html` (one line).
   `cleanUrls` in `vercel.json` also makes the shorter
   `https://yourdomain.com/join?code=K7Q2XD` shape work.

Alternatives (all free): Cloudflare Pages, GitHub Pages, or Netlify —
upload this folder and attach your domain. The video is < 1 MB, so every
free tier covers this easily.

## Regenerating the demo video

```powershell
python website/make_demo.py
```

Needs Pillow + ffmpeg. Edit the scenes in `make_demo.py` to change the tour.
