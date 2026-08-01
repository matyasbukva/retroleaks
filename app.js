'use strict';

/* ============================================================
   RetroLeaks

   The leak images have black backgrounds, so they go on with a
   screen blend: black is neutral there, and only the bright
   streaks carry over onto the photograph.

       result = 255 − (255 − photo) × (255 − leak) / 255

   Everything runs on the device. Nothing is uploaded.
   ============================================================ */

const PREVIEW_MAX = 900;
const THUMB_MAX = 320;
const JPEG_QUALITY = 0.92;
const MAX_PIXELS = 16e6;      // stay under Safari's canvas ceiling
const MANY_FILES = 40;
const SHARE_CHUNK = 5;        // iOS drops "Save Images" when a share carries too many files
const STORE_KEY = 'retroleaks.settings.v1';

const SIZE_LABELS = ['Auto', '1536', '2048', '3072', '4096'];
const SIZE_VALUES = [4096, 1536, 2048, 3072, 4096];

/* Openable in every browser. */
const SAFE_FORMATS = {
  jpg: 'JPEG', jpeg: 'JPEG', jpe: 'JPEG', png: 'PNG',
  webp: 'WebP', gif: 'GIF', bmp: 'BMP'
};

/* Openable only in some. HEIC works on iPhone because the system decodes it;
   Chrome and Edge on Windows cannot. Raw files fail almost everywhere. */
const RISKY_FORMATS = {
  heic: 'HEIC', heif: 'HEIF', avif: 'AVIF', tif: 'TIFF', tiff: 'TIFF',
  dng: 'DNG raw', rw2: 'Panasonic raw', cr2: 'Canon raw', cr3: 'Canon raw',
  nef: 'Nikon raw', nrw: 'Nikon raw', arw: 'Sony raw', srf: 'Sony raw',
  orf: 'Olympus raw', raf: 'Fujifilm raw', pef: 'Pentax raw',
  srw: 'Samsung raw', x3f: 'Sigma raw'
};

const FILE_PROTOCOL_HELP =
  'this page is running from a file:// address, so the browser will not let it ' +
  'export an image. Open it over http — either the hosted address, or run ' +
  '"python -m http.server 8000" in this folder.';

const BUILTIN_LEAKS = [
  { file: 'L0.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L1.jpg', resize: 'FILL', align: 'MC' },
  { file: 'L2.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L3.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L4.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L5.jpg', resize: 'FILL', align: 'BL' },
  { file: 'L6.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L7.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L8.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L9.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L10.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L11.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L12.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L13.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L14.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L15.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L16.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L17.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L18.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L19.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L20.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L21.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L22.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L23.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L24.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L25.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L26.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L27.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L28.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L29.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L30.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L31.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L32.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L33.jpg', resize: 'FILL', align: 'TR' },
  { file: 'L34.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L35.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L36.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L37.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L38.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L39.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L40.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L41.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L42.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L43.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L44.jpg', resize: 'STRETCH', align: 'MC' },
  { file: 'L45.jpg', resize: 'STRETCH', align: 'MC' }
];

const el = (id) => document.getElementById(id);

const ui = {
  alert: el('alert'),
  load: el('load'), loadNum: el('loadNum'), loadUnit: el('loadUnit'),

  stage: el('stage'), empty: el('empty'), picker: el('picker'),
  hero: el('hero'), heroImg: el('heroImg'), heroBusy: el('heroBusy'),
  stamp: el('stamp'), heroHint: el('heroHint'),
  sheetWrap: el('sheetWrap'), sheet: el('sheet'),

  controls: el('controls'),
  strip: el('strip'), leakName: el('leakName'),
  intensity: el('intensity'), intensityValue: el('intensityValue'),
  orientSeg: el('orientSeg'),
  coverageBlock: el('coverageBlock'), coverage: el('coverage'),
  coverageValue: el('coverageValue'), coverageNote: el('coverageNote'),
  size: el('size'), sizeValue: el('sizeValue'),
  resetBtn: el('resetBtn'), leakTotal: el('leakTotal'),

  dock: el('dock'), dockProgress: el('dockProgress'), dockFill: el('dockFill'),
  dockStatus: el('dockStatus'), actionBtn: el('actionBtn'), backBtn: el('backBtn')
};

const state = {
  leaks: [],
  files: [],
  results: [],
  mode: 'empty',        // empty | tune | working | done
  pick: 'random',       // 'random' or an index into state.leaks
  roll: null,           // the leak + orientation currently shown in the preview
  previewURL: null,
  originalURL: null,
  shareCursor: 0
};

const settings = {
  intensity: 85,
  coverage: 100,
  orientation: 'random',
  size: 0
};

const leakCache = new Map();

/* ── Messages ─────────────────────────────────────────────── */

function warn(text) { ui.alert.hidden = false; ui.alert.textContent = text; }
function clearWarning() { ui.alert.hidden = true; ui.alert.textContent = ''; }

/* ── Format handling ──────────────────────────────────────── */

function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(name || '');
  return match ? match[1].toLowerCase() : '';
}

function formatLabel(file) {
  const ext = extensionOf(file.name);
  if (SAFE_FORMATS[ext]) return SAFE_FORMATS[ext];
  if (RISKY_FORMATS[ext]) return RISKY_FORMATS[ext];
  if (file.type) return file.type.replace('image/', '').toUpperCase();
  return ext ? ext.toUpperCase() : 'unknown';
}

function looksLikeImage(file) {
  if (file.type && file.type.startsWith('image/')) return true;
  // On Windows, HEIC and raw files often arrive with an empty MIME type.
  const ext = extensionOf(file.name);
  return Boolean(SAFE_FORMATS[ext] || RISKY_FORMATS[ext]);
}

/** Can THIS browser open the file? Asked, not guessed. */
function canDecode(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const img = new Image();
    img.onload = () => finish(img.naturalWidth > 0);
    img.onerror = () => finish(false);
    img.src = url;
    setTimeout(() => finish(false), 10000);
  });
}

async function screenFormats(files) {
  const suspect = Array.from(
    new Set(files.map((f) => extensionOf(f.name)).filter((e) => !SAFE_FORMATS[e]))
  );

  const rejected = new Set();
  for (const ext of suspect) {
    const sample = files.find((f) => extensionOf(f.name) === ext);
    // eslint-disable-next-line no-await-in-loop
    if (!(await canDecode(sample))) rejected.add(ext);
  }

  const usable = [];
  const blocked = [];
  files.forEach((f) => (rejected.has(extensionOf(f.name)) ? blocked : usable).push(f));
  return { usable, blocked };
}

/* ── Leak catalogue ───────────────────────────────────────── */

function normalizeLeaks(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && r.file).map((r) => ({
    file: String(r.file),
    resize: String(r.resize || 'STRETCH').toUpperCase(),
    align: String(r.align || 'MC').toUpperCase()
  }));
}

async function loadLeaks() {
  try {
    const response = await fetch('leaks/params.json', { cache: 'force-cache' });
    if (response.ok) {
      const parsed = normalizeLeaks(await response.json());
      if (parsed.length) return parsed;
    }
  } catch (error) {
    // fetch is blocked under file:// — the built-in list covers that case
  }
  return normalizeLeaks(BUILTIN_LEAKS);
}

function loadLeakImage(name) {
  if (leakCache.has(name)) return leakCache.get(name);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('leak image missing: ' + name));
    img.src = 'leaks/' + name;
  });
  leakCache.set(name, promise);
  return promise;
}

function rollFor(pick) {
  const leak = pick === 'random'
    ? state.leaks[Math.floor(Math.random() * state.leaks.length)]
    : state.leaks[pick];
  const random = settings.orientation === 'random';
  return {
    leak,
    rot: random ? [0, 90, 180, 270][Math.floor(Math.random() * 4)] : 0,
    mirror: random ? Math.random() < 0.5 : false
  };
}

/* ── Compositing ──────────────────────────────────────────── */

async function drawSource(file, maxSide) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;

  try {
    await img.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error('the browser cannot open this format — save it as JPEG');
  }

  // The browser has already applied EXIF orientation, so these are the
  // upright dimensions.
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (!w || !h) {
    URL.revokeObjectURL(url);
    throw new Error('the image reports no size');
  }

  const scale = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);
  return canvas;
}

/** Places the leak using the STRETCH / FILL + alignment rules from the catalogue. */
function placeLeak(ctx, leakImg, roll, W, H) {
  const { rot, mirror } = roll;
  const { resize, align } = roll.leak;

  const sw = leakImg.naturalWidth;
  const sh = leakImg.naturalHeight;

  // A quarter turn swaps the leak's effective sides.
  const quarter = rot % 180 !== 0;
  const ew = quarter ? sh : sw;
  const eh = quarter ? sw : sh;

  let dw, dh, dx, dy;

  if (resize === 'FILL') {
    const s = Math.max(W / ew, H / eh);
    dw = ew * s;
    dh = eh * s;
    const v = align[0];
    const hz = align[1];
    dx = hz === 'L' ? 0 : hz === 'R' ? W - dw : (W - dw) / 2;
    dy = v === 'T' ? 0 : v === 'B' ? H - dh : (H - dh) / 2;
  } else {
    dw = W; dh = H; dx = 0; dy = 0;
  }

  // Inside the rotated frame the drawn box swaps back, so the footprint on
  // the canvas comes out as dw × dh.
  const bw = quarter ? dh : dw;
  const bh = quarter ? dw : dh;

  ctx.save();
  ctx.translate(dx + dw / 2, dy + dh / 2);
  if (mirror) ctx.scale(-1, 1);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(leakImg, -bw / 2, -bh / 2, bw, bh);
  ctx.restore();
}

/** Burns the leak onto the canvas in place. */
function applyLeak(canvas, leakImg, roll, intensity) {
  const W = canvas.width;
  const H = canvas.height;

  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const lx = layer.getContext('2d');

  // Black is neutral under a screen blend, so anywhere the leak does not
  // reach the photograph stays untouched.
  lx.fillStyle = '#000000';
  lx.fillRect(0, 0, W, H);
  placeLeak(lx, leakImg, roll, W, H);

  // Intensity scales the leak's RGB rather than its opacity: black stays
  // black and only the streak dims, which reads like less light got in.
  const k = Math.round(Math.max(0, Math.min(1, intensity)) * 255);
  if (k < 255) {
    lx.globalCompositeOperation = 'multiply';
    lx.fillStyle = 'rgb(' + k + ',' + k + ',' + k + ')';
    lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = 'source-over';
  }

  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  layer.width = 0;
  layer.height = 0;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('JPEG encoding failed'))),
        'image/jpeg',
        quality
      );
    } catch (error) {
      // A tainted canvas cannot be exported. Under file:// every local file
      // counts as a separate origin, which taints it.
      const tainted = (error && error.name === 'SecurityError') ||
        /tainted/i.test(String(error && error.message));
      reject(new Error(tainted ? FILE_PROTOCOL_HELP : String(error && error.message)));
    }
  });
}

function releaseCanvas(canvas) { canvas.width = 0; canvas.height = 0; }

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/* ── Filmstrip ────────────────────────────────────────────── */

function buildStrip() {
  ui.strip.innerHTML = '';

  const random = document.createElement('button');
  random.type = 'button';
  random.className = 'gate gate-random';
  random.textContent = 'RND';
  random.title = 'A different leak on every photo';
  random.setAttribute('role', 'option');
  random.addEventListener('click', () => choose('random'));
  ui.strip.append(random);

  state.leaks.forEach((leak, index) => {
    const gate = document.createElement('button');
    gate.type = 'button';
    gate.className = 'gate';
    gate.title = leak.file.replace('.jpg', '');
    gate.setAttribute('role', 'option');

    const img = document.createElement('img');
    img.src = 'leaks/' + leak.file;
    img.alt = 'Leak ' + leak.file.replace('.jpg', '');
    img.loading = 'lazy';
    img.decoding = 'async';

    gate.append(img);
    gate.addEventListener('click', () => choose(index));
    ui.strip.append(gate);
  });

  paintStrip();
}

function paintStrip() {
  const gates = Array.from(ui.strip.children);
  gates.forEach((gate, i) => {
    const isOn = state.pick === 'random' ? i === 0 : i === state.pick + 1;
    gate.classList.toggle('is-on', isOn);
    gate.setAttribute('aria-selected', String(isOn));
  });

  ui.leakName.textContent = state.pick === 'random'
    ? 'Random'
    : state.leaks[state.pick].file.replace('.jpg', '') + ' · ' +
      (state.leaks[state.pick].resize === 'FILL' ? 'fill' : 'stretch');
}

function choose(pick) {
  state.pick = pick;
  state.roll = rollFor(pick);
  paintStrip();
  renderPreview();
}

/* ── Preview ──────────────────────────────────────────────── */

let previewTimer = null;
let previewGeneration = 0;

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 140);
}

async function renderPreview() {
  if (!state.files.length || !state.leaks.length) return;
  if (!state.roll) state.roll = rollFor(state.pick);

  // Dragging a slider can start several renders; only the newest may paint.
  const generation = ++previewGeneration;
  ui.heroBusy.hidden = false;

  try {
    const canvas = await drawSource(state.files[0], PREVIEW_MAX);
    const originalBlob = await canvasToBlob(canvas, 0.86);

    const leakImg = await loadLeakImage(state.roll.leak.file);
    applyLeak(canvas, leakImg, state.roll, settings.intensity / 100);
    const leakedBlob = await canvasToBlob(canvas, 0.86);
    releaseCanvas(canvas);

    if (generation !== previewGeneration) return;

    if (state.previewURL) URL.revokeObjectURL(state.previewURL);
    if (state.originalURL) URL.revokeObjectURL(state.originalURL);
    state.previewURL = URL.createObjectURL(leakedBlob);
    state.originalURL = URL.createObjectURL(originalBlob);

    ui.heroImg.src = state.previewURL;
    clearWarning();
  } catch (error) {
    if (generation === previewGeneration) warn('Preview failed: ' + error.message);
  } finally {
    if (generation === previewGeneration) ui.heroBusy.hidden = true;
  }
}

function startCompare() {
  if (!state.originalURL || state.mode !== 'tune') return;
  ui.heroImg.src = state.originalURL;
  ui.stamp.hidden = false;
  ui.hero.classList.add('is-comparing');
}

function endCompare() {
  if (!state.previewURL) return;
  ui.heroImg.src = state.previewURL;
  ui.stamp.hidden = true;
  ui.hero.classList.remove('is-comparing');
}

/* ── Batch ────────────────────────────────────────────────── */

function outputName(original) {
  const stem = (original || 'photo').replace(/\.[^.]+$/, '') || 'photo';
  return stem + '_leak.jpg';
}

async function makeThumb(canvas) {
  const s = Math.min(1, THUMB_MAX / Math.max(canvas.width, canvas.height));
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(canvas.width * s));
  t.height = Math.max(1, Math.round(canvas.height * s));
  t.getContext('2d').drawImage(canvas, 0, 0, t.width, t.height);
  const blob = await canvasToBlob(t, 0.7);
  releaseCanvas(t);
  return URL.createObjectURL(blob);
}

async function runBatch() {
  if (state.mode === 'working' || !state.files.length) return;

  setMode('working');
  clearResults();
  clearWarning();

  const coverage = settings.coverage / 100;
  const intensity = settings.intensity / 100;
  const maxSide = SIZE_VALUES[settings.size];
  const total = state.files.length;
  let failed = 0;

  for (let i = 0; i < total; i++) {
    const file = state.files[i];
    ui.dockStatus.textContent = (i + 1) + ' of ' + total + ' — ' + file.name;

    try {
      const canvas = await drawSource(file, maxSide);

      const gets = coverage >= 1 ? true : coverage <= 0 ? false : Math.random() < coverage;
      let roll = null;

      if (gets) {
        roll = rollFor(state.pick);
        const leakImg = await loadLeakImage(roll.leak.file);
        applyLeak(canvas, leakImg, roll, intensity);
      }

      const blob = await canvasToBlob(canvas, JPEG_QUALITY);
      const thumbURL = await makeThumb(canvas);
      releaseCanvas(canvas);

      state.results.push({
        name: outputName(file.name),
        blob,
        thumbURL,
        leak: roll ? roll.leak.file : null,
        saved: false
      });
    } catch (error) {
      failed++;
      warn(file.name + ' (' + formatLabel(file) + '): ' + error.message);
    }

    ui.dockFill.style.width = Math.round(((i + 1) / total) * 100) + '%';
    await nextFrame();
  }

  if (!state.results.length) {
    setMode('tune');
    ui.dockStatus.textContent = '';
    if (!failed) warn('Nothing came through.');
    return;
  }

  if (failed) {
    warn(failed + (failed === 1 ? ' photo' : ' photos') + ' could not be processed. ' +
         state.results.length + ' ready.');
  }

  buildSheet();
  setMode('done');
}

/* ── Contact sheet ────────────────────────────────────────── */

function clearResults() {
  state.results.forEach((r) => URL.revokeObjectURL(r.thumbURL));
  state.results = [];
  state.shareCursor = 0;
  ui.sheet.innerHTML = '';
}

function buildSheet() {
  ui.sheet.innerHTML = '';

  state.results.forEach((result, i) => {
    // A button, not a div: tapping a frame shares that one photo at full
    // resolution. Long-pressing the thumbnail would only save the small copy.
    const frame = document.createElement('button');
    frame.type = 'button';
    frame.className = 'frame';
    frame.title = 'Save this one to Photos';

    const img = document.createElement('img');
    img.src = result.thumbURL;
    img.alt = result.leak
      ? 'Photo ' + (i + 1) + ' with leak ' + result.leak.replace('.jpg', '')
      : 'Photo ' + (i + 1) + ', no leak';
    img.loading = 'lazy';

    const no = document.createElement('span');
    no.className = 'frame-no';
    no.textContent = String(i + 1).padStart(2, '0');

    frame.append(img, no);
    frame.addEventListener('click', () => shareOne(i));
    ui.sheet.append(frame);
  });

  paintSaved();
}

function paintSaved() {
  Array.from(ui.sheet.children).forEach((frame, i) => {
    frame.classList.toggle('is-saved', Boolean(state.results[i] && state.results[i].saved));
  });
  const saved = state.results.filter((r) => r.saved).length;
  ui.loadNum.textContent = String(saved);
  ui.loadUnit.textContent = 'saved';
}

/* ── Sharing to Photos ────────────────────────────────────── */

function toFiles(results) {
  return results.map((r) => new File([r.blob], r.name, { type: 'image/jpeg' }));
}

async function shareFiles(files) {
  if (!navigator.canShare || !navigator.canShare({ files })) {
    warn('This browser cannot share image files. Open the page in Safari on ' +
         'iPhone, where the share sheet offers Save Images.');
    return false;
  }
  try {
    // No title and no text: iOS treats the share as text if either is present,
    // and Save Images disappears from the sheet.
    await navigator.share({ files });
    return true;
  } catch (error) {
    if (!(error && error.name === 'AbortError')) {
      warn('The share sheet did not open: ' + error.message);
    }
    return false;
  }
}

async function shareNext() {
  const pending = state.results.filter((r) => !r.saved);
  if (!pending.length) return;

  const slice = pending.slice(0, SHARE_CHUNK);
  if (!(await shareFiles(toFiles(slice)))) return;

  slice.forEach((r) => { r.saved = true; });
  paintSaved();
  updateDock();
}

async function shareOne(index) {
  const result = state.results[index];
  if (!result) return;
  if (!(await shareFiles(toFiles([result])))) return;
  result.saved = true;
  paintSaved();
  updateDock();
}

/* ── Modes ────────────────────────────────────────────────── */

function setMode(mode) {
  state.mode = mode;

  const empty = mode === 'empty';
  const done = mode === 'done';
  const working = mode === 'working';

  ui.empty.hidden = !empty;
  ui.hero.hidden = empty || done;
  ui.sheetWrap.hidden = !done;
  ui.controls.hidden = empty || done;
  ui.dock.hidden = empty;
  ui.dockProgress.hidden = !working;
  ui.backBtn.hidden = !done;
  ui.load.hidden = empty;

  if (working) ui.dockFill.style.width = '0%';
  if (!done) {
    ui.loadNum.textContent = String(state.files.length);
    ui.loadUnit.textContent = state.files.length === 1 ? 'photo' : 'photos';
  }

  updateDock();
}

function updateDock() {
  const n = state.files.length;

  if (state.mode === 'working') {
    ui.actionBtn.disabled = true;
    ui.actionBtn.textContent = 'Working…';
    return;
  }

  if (state.mode === 'done') {
    const pending = state.results.filter((r) => !r.saved).length;
    ui.dockStatus.textContent = '';
    if (!pending) {
      ui.actionBtn.disabled = true;
      ui.actionBtn.textContent = 'All saved';
    } else {
      ui.actionBtn.disabled = false;
      const batch = Math.min(pending, SHARE_CHUNK);
      ui.actionBtn.textContent = 'Save ' + batch + ' to Photos';
    }
    return;
  }

  ui.actionBtn.disabled = n === 0;
  ui.actionBtn.textContent = n === 1 ? 'Apply to 1 photo' : 'Apply to ' + n + ' photos';
}

/* ── Settings ─────────────────────────────────────────────── */

function paintSettings() {
  ui.intensity.value = String(settings.intensity);
  ui.intensityValue.textContent = String(settings.intensity);

  ui.coverage.value = String(settings.coverage);
  ui.coverageValue.textContent = String(settings.coverage);

  ui.size.value = String(settings.size);
  ui.sizeValue.textContent = SIZE_LABELS[settings.size];

  Array.from(ui.orientSeg.children).forEach((btn) => {
    const on = btn.dataset.orient === settings.orientation;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', String(on));
  });

  paintCoverage();
}

/* Coverage is a batch-level idea: it means nothing for a single photo, and
   its effect never shows in the preview. So it only appears when it applies. */
function paintCoverage() {
  const n = state.files.length;
  ui.coverageBlock.hidden = n < 2;

  if (settings.coverage >= 100) {
    ui.coverageNote.textContent = 'Every photo gets a leak.';
  } else if (settings.coverage <= 0) {
    ui.coverageNote.textContent = 'No leaks — photos are only resaved.';
  } else {
    const approx = Math.round((n * settings.coverage) / 100);
    ui.coverageNote.textContent = 'About ' + approx + ' of ' + n + ' photos, chosen at random.';
  }
}

function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (typeof stored.intensity === 'number') settings.intensity = stored.intensity;
    if (typeof stored.coverage === 'number') settings.coverage = stored.coverage;
    if (stored.orientation === 'fixed' || stored.orientation === 'random') {
      settings.orientation = stored.orientation;
    }
    if (typeof stored.size === 'number' && SIZE_VALUES[stored.size]) settings.size = stored.size;
  } catch (e) { /* ignore unreadable settings */ }
}

/* ── Selection ────────────────────────────────────────────── */

async function onPick(event) {
  const picked = Array.from(event.target.files || []).filter(looksLikeImage);

  clearResults();
  clearWarning();
  state.files = [];
  state.roll = null;

  if (!picked.length) { setMode('empty'); return; }

  ui.loadNum.textContent = String(picked.length);
  ui.loadUnit.textContent = 'checking';
  ui.load.hidden = false;

  const { usable, blocked } = await screenFormats(picked);

  if (blocked.length) {
    const formats = Array.from(new Set(blocked.map(formatLabel))).join(', ');
    warn(blocked.length + (blocked.length === 1 ? ' file' : ' files') +
         ' cannot be opened by this browser (' + formats + '). Chrome and Edge on ' +
         'Windows do not handle HEIC or raw files. Safari on iPhone reads HEIC; ' +
         'otherwise save them as JPEG first.');
  }

  state.files = usable;

  if (!usable.length) {
    setMode('empty');
    ui.load.hidden = true;
    return;
  }

  if (usable.length > MANY_FILES) {
    warn(usable.length + ' photos at once may be more than Safari can hold. If the ' +
         'page reloads mid-run, work in batches of about ' + MANY_FILES + '.');
  }

  paintCoverage();
  setMode('tune');
  renderPreview();
}

/* ── Wiring ───────────────────────────────────────────────── */

function bind() {
  ui.picker.addEventListener('change', onPick);

  ui.intensity.addEventListener('input', () => {
    settings.intensity = Number(ui.intensity.value);
    ui.intensityValue.textContent = String(settings.intensity);
    saveSettings();
    schedulePreview();
  });

  ui.coverage.addEventListener('input', () => {
    settings.coverage = Number(ui.coverage.value);
    ui.coverageValue.textContent = String(settings.coverage);
    paintCoverage();
    saveSettings();
  });

  ui.size.addEventListener('input', () => {
    settings.size = Number(ui.size.value);
    ui.sizeValue.textContent = SIZE_LABELS[settings.size];
    saveSettings();
  });

  ui.orientSeg.addEventListener('click', (event) => {
    const btn = event.target.closest('.seg-btn');
    if (!btn) return;
    settings.orientation = btn.dataset.orient;
    paintSettings();
    saveSettings();
    state.roll = rollFor(state.pick);
    renderPreview();
  });

  ui.resetBtn.addEventListener('click', () => {
    settings.intensity = 85;
    settings.coverage = 100;
    settings.orientation = 'random';
    settings.size = 0;
    state.pick = 'random';
    state.roll = rollFor('random');
    paintSettings();
    paintStrip();
    saveSettings();
    renderPreview();
  });

  // Hold the preview to see the original underneath.
  ['pointerdown'].forEach((e) => ui.hero.addEventListener(e, startCompare));
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((e) =>
    ui.hero.addEventListener(e, endCompare));
  ui.hero.addEventListener('contextmenu', (e) => e.preventDefault());

  ui.actionBtn.addEventListener('click', () => {
    if (state.mode === 'done') shareNext();
    else if (state.mode === 'tune') runBatch();
  });

  ui.backBtn.addEventListener('click', () => {
    clearResults();
    clearWarning();
    setMode('tune');
    renderPreview();
  });
}

async function init() {
  bind();
  loadSettings();

  state.leaks = await loadLeaks();
  ui.leakTotal.textContent = String(state.leaks.length);
  state.roll = rollFor('random');

  buildStrip();
  paintSettings();
  setMode('empty');

  if (location.protocol === 'file:') {
    warn('This will not work here: ' + FILE_PROTOCOL_HELP);
  }

  // Startup check: if the leak images are not reachable, say so now rather
  // than halfway through a batch.
  loadLeakImage(state.leaks[0].file).catch(() => {
    warn('The light leak images are missing (leaks/' + state.leaks[0].file + '). ' +
         'The leaks folder probably did not make it into the upload — unzip the ' +
         'archive first, because dragging out of the Windows zip preview skips subfolders.');
    ui.actionBtn.disabled = true;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ });
    });
  }
}

init();
