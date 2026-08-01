# RetroLeaks

A batch light leak tool for analogue film looks, installable on iPhone as a
web app. Photos never leave the device: everything is composited in the
browser on a `canvas`.

---

## 1. Publishing on GitHub Pages

A PWA needs HTTPS. Without it there is no offline mode and no saving to
Photos. GitHub Pages provides HTTPS for free.

1. Create a **public** repository, for example `retroleaks`.
2. Upload **the contents of this folder** to the repository root. The
   `index.html` must sit directly in the root, not inside a subfolder.
3. In the repository: **Settings → Pages**
   - Source: `Deploy from a branch`
   - Branch: `main`, folder: `/ (root)`
4. After a minute or two the address goes live:
   `https://<your-username>.github.io/retroleaks/`

From the command line:

```bash
git init
git add .
git commit -m "RetroLeaks PWA"
git branch -M main
git remote add origin https://github.com/<your-username>/retroleaks.git
git push -u origin main
```

**If you upload through the browser, unzip the archive first.** Dragging files
out of the Windows zip preview skips subfolders, and the `leaks` and `icons`
folders never arrive. The repository listing should show both.

## 2. Trying it on a computer

**Double-clicking `index.html` does not work.** The interface loads, but
processing fails with a tainted canvas error: under `file://` the browser
treats every local file as a separate origin, so once a leak is drawn onto the
canvas it refuses to export it.

Run a local server in this folder instead:

```
python -m http.server 8000
```

then open `http://localhost:8000`.

## 3. Installing on iPhone

1. Open the address in **Safari** (Add to Home Screen is Safari-only).
2. Share button → **Add to Home Screen**.
3. It now launches with its own icon, full screen, and works offline.

The first visit downloads the 46 light leaks, about 3.4 MB. After that it runs
from cache.

## 4. Using it

1. **Choose photos** — select as many as you like.
2. **Pick a leak** from the filmstrip. `RND` gives every photo a different one.
3. **Hold the preview** to see the original underneath.
4. **Intensity** sets how strong the streak is. **Orientation** decides whether
   each leak is rotated and flipped at random. **Coverage** appears once you
   have more than one photo, and sets how many of them get a leak at all.
5. **Apply**, then **Save to Photos**.

### About saving

On iOS a web app cannot write to Photos directly, so it goes through the share
sheet. Two things worth knowing:

- **Save Images** disappears from the sheet when a share carries too many
  files, so photos go five at a time.
- To save one photo on its own, **tap its frame** on the contact sheet. Long
  pressing is the wrong move there: it would only save the small thumbnail.

## 5. How it works

The leak images have black backgrounds. Under a **screen** blend black is
neutral and the bright areas carry over — which is exactly the film burn
effect:

```
result = 255 − (255 − photo) × (255 − leak) / 255
```

Intensity does not change opacity; it scales the leak's RGB values. Black stays
black and only the streak dims, which reads more like less light got in.

`leaks/params.json` holds the parameters from the original app: which leaks are
`STRETCH` (filling the frame exactly, distorting if needed) and which are
`FILL` (covering proportionally, cropping the edges), with alignment for the
latter. Three of the 46 are exceptions: `L1` = FILL/MC, `L5` = FILL/BL,
`L33` = FILL/TR.

## 6. Supported formats

Reliable everywhere: **JPEG, PNG, WebP, GIF, BMP**.

**HEIC** works in Safari on iPhone, because the system decodes it. Chrome and
Edge on Windows cannot open it, and neither handles **raw** files (`.RW2`,
`.DNG`, `.CR3`, `.NEF`, `.ARW` and the rest) or TIFF.

The app tests one file per format when you make a selection, and filters out
whatever this browser cannot open, naming the format. Export raw files to JPEG
first — a light leak belongs on a finished photograph anyway, not on a negative.

## 7. Limits

- **Canvas size.** Safari clips the canvas at roughly 16.7 megapixels and
  returns a blank image. There is a ceiling on the longest edge for that
  reason; Auto suits a 12 MP photo, and 48 MP files are scaled down.
- **Memory.** More than about 40 photos at once risks Safari reloading the
  page. The app warns when you cross that.
- **Metadata.** The output is a new JPEG, so the original EXIF (date, GPS, lens
  data) is not carried over. Orientation is baked into the pixels correctly.

## 8. Files

```
index.html              interface
styles.css              styles
app.js                  compositing, preview, batch, sharing
sw.js                   service worker (offline cache)
manifest.webmanifest    PWA descriptor
diag.html               standalone diagnostics page
icons/                  app icons
leaks/L0.jpg … L45.jpg  the light leak set (1280 px, JPEG q85)
leaks/params.json       resize + alignment per leak (also compiled into
                        app.js, so the app runs from a file too)
```

Adding a leak means dropping it into `leaks/`, listing it in `params.json`,
and raising both `VERSION` and the leak count in `sw.js` so the cache refreshes.
